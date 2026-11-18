import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceSchema, defaultCharacter } from '../lib/encyclopedia/world-model.ts';
import { emptyMemberList } from '../lib/members.ts';
import * as M from '../lib/forum/model.ts';
import { ForumStore, forumKey } from '../lib/forum/store.ts';
import { frameOf, topicPage, cardOf, castOf, forumImages, membersPage } from '../lib/forum/view.ts';
import { handleForum, handleForumImage, resetForumThrottles } from '../lib/forum/request.ts';
import * as R from '../lib/forum/reader.ts';

// ---- Fixtures ---------------------------------------------------------------------------------
class Bucket {
  data = new Map(); n = 0; beforePut = null;
  async get(key) { const v = this.data.get(key); return v ? { etag: v.etag, json: async () => JSON.parse(v.text) } : null; }
  async head(key) { return this.get(key); }
  async put(key, text, options = {}) {
    if (this.beforePut?.key === key) { const h = this.beforePut.run; this.beforePut = null; await h(); }
    const old = this.data.get(key);
    if (options.onlyIf?.etagMatches && old?.etag !== options.onlyIf.etagMatches) return null;
    if (options.onlyIf?.etagDoesNotMatch === '*' && old) return null;
    const etag = String(++this.n); this.data.set(key, { text, etag }); return { etag };
  }
  async delete(key) { this.data.delete(key); }
}

const OWNER = 'gm', NOW = new Date('2026-01-01T12:00:00.000Z');
const IMG = { hero: '11111111-1111-4111-8111-111111111111', villain: '22222222-2222-4222-8222-222222222222', tavern: '33333333-3333-4333-8333-333333333333', banner: '44444444-4444-4444-8444-444444444444' };
const base = { worldId: 'w1', parentId: null, body: '', updatedAt: '2026-01-01T00:00:00.000Z' };
const pic = imageId => ({ imageId, width: 100, height: 200, x: 0.5, y: 0.3, size: 1 });
const char = (id, title, role, vis, stats, picture, campaignId = 'camp') => ({
  ...base, id, title, kind: 'character', campaignId, overviewVisibility: 'players',
  character: { ...defaultCharacter(), role, statsVisibility: vis, statsByCampaign: { camp: stats } }, ...(picture ? { picture: pic(picture) } : {}),
});
const workspace = workspaceSchema.parse({
  schemaVersion: 1,
  worlds: [{ id: 'w1', name: 'World', description: '', archived: false }],
  campaigns: [{
    id: 'camp', worldId: 'w1', name: 'Test Campaign', description: '', github: { repository: '', branch: 'main' },
    statFields: [
      { id: 'cls', label: 'Class', section: '', type: 'text', options: [], visibility: 'players', archived: false },
      { id: 'sec', label: 'Secret', section: '', type: 'text', options: [], visibility: 'gm', archived: false },
    ],
  }],
  entries: [
    char('hero', 'Hero', 'pc', 'players', { cls: 'Bard', sec: 'Is a spy' }, IMG.hero),
    char('villain', 'Villain', 'npc', 'gm', { cls: 'Lich', sec: 'Phylactery' }, IMG.villain),
    char('sidekick', 'Sidekick', 'companion', 'gm', {}),
    { ...base, id: 'tavern', title: 'Tavern', kind: 'place', campaignId: 'camp', overviewVisibility: 'players', picture: pic(IMG.tavern) },
  ],
});
const list = () => {
  const l = emptyMemberList('camp', 'Gamemaster');
  const m = (userId, name, group) => ({ userId, name, groups: [group], joinedAt: NOW.toISOString() });
  l.members = [m('p1', 'Pat', 'players'), m('p2', 'Quinn', 'players'), m('g1', 'Gus', 'guests'), m('co', 'Casey', 'cogms')];
  l.pages = { hero: { people: { p1: { edit: true, subPages: false } }, groups: {} }, sidekick: { people: { p2: { edit: true, subPages: false } }, groups: {} } };
  return l;
};
const withBoards = () => {
  const f = M.emptyForum();
  f.boards.push({ id: 'tavern-board', categoryId: 'locations', parentId: null, name: 'Tavern', description: '', placeId: 'tavern' });
  return f;
};
const keyOf = id => (id === OWNER ? 'c-camp' : 'm-' + 'a'.repeat(64));
function ctxFor(forum, userId, ws = workspace) {
  const l = list(), rights = M.forumRights(l, userId, OWNER);
  const editable = rights.owner ? new Set() : new Set(Object.entries(l.pages).filter(([, a]) => a.people[userId]?.edit).map(([p]) => p));
  return { forum, list: l, owner: OWNER, workspace: ws, campaignId: 'camp', viewer: { userId, rights, key: keyOf(userId), editable }, readable: rights.gm ? null : new Set(['hero', 'sidekick', 'tavern']) };
}
const poster = (forum, userId) => { const ctx = ctxFor(forum, userId); return { userId, rights: ctx.viewer.rights, cast: new Set(castOf(ctx).map(c => c.id)) }; };
const apply = (f, change) => change.forum(f);
const ids = (t, p) => ({ topic: t, post: p });
const start = (f, user, over = {}) => M.startTopic(f, { boardId: 'tavern-board', title: 'Hello', body: 'Hi there', as: 'hero', ...over }, poster(f, user), ids('t1', 'a1'), NOW);
const rep = (f, topic, user, over = {}, postId = 'a2') => M.reply(f, topic, { body: 'More', as: 'hero', ...over }, poster(f, user), postId, NOW);
/** A forum with one topic ("t1") started by p1 as hero; returns the forum and topic. */
function seeded() {
  const f0 = withBoards(), c = start(f0, 'p1');
  return { forum: apply(f0, c), topic: c.topic };
}
const msg = re => e => e instanceof M.ForumError && re.test(e.message);

// ---- 1. Rights --------------------------------------------------------------------------------
test('rights by group: owner all, player posts but cannot moderate, guest reads only, stranger nothing', () => {
  const l = list(), r = u => M.forumRights(l, u, OWNER);
  assert.deepEqual(Object.values(r(OWNER)).every(Boolean), true);
  assert.deepEqual(r('p1'), { owner: false, gm: false, read: true, start: true, reply: true, pictures: true, moderate: false, boards: false });
  assert.deepEqual([r('g1').read, r('g1').start, r('g1').reply, r('g1').moderate], [true, false, false, false]);
  assert.equal(r('co').gm && r('co').moderate && r('co').boards, true);
  assert.equal(Object.values(r('stranger')).some(Boolean), false);
});

// ---- 2. Posting as ----------------------------------------------------------------------------
test('in-character board: players post only as characters they may edit; GMs as any or as themselves', () => {
  const f = withBoards();
  assert.deepEqual(castOf(ctxFor(f, 'p1')).map(c => c.id), ['hero']);
  assert.throws(() => start(f, 'p1', { as: null }), msg(/Choose which of your characters/));
  assert.throws(() => start(f, 'p1', { as: 'sidekick' }), msg(/can't post as that character/));
  assert.throws(() => start(f, 'p1', { as: 'villain' }), /can't post as that character/);
  assert.equal(start(f, 'p1').topic.posts[0].by.as, 'hero');
  for (const gm of [OWNER, 'co']) {
    assert.equal(start(f, gm, { as: 'villain' }).topic.posts[0].by.as, 'villain');
    assert.equal(start(f, gm, { as: null }).topic.posts[0].by.as, null);
  }
});
test('out-of-character board refuses posting as a character', () => {
  const f = withBoards();
  assert.throws(() => start(f, 'p1', { boardId: 'ooc-chat', as: 'hero' }), /Out of character boards are for posting as yourself/);
  assert.throws(() => start(f, OWNER, { boardId: 'ooc-chat', as: 'villain' }), /posting as yourself/);
  assert.equal(start(f, 'p1', { boardId: 'ooc-chat', as: null }).topic.posts[0].by.as, null);
});
test('guests cannot start or reply; empty title or body is refused', () => {
  const { forum, topic } = seeded();
  assert.throws(() => start(forum, 'g1', { as: null, boardId: 'ooc-chat' }), /can't start topics/);
  assert.throws(() => rep(forum, topic, 'g1', { as: null }), /can't reply/);
  assert.throws(() => start(forum, 'p1', { title: '  ' }), /title/);
  assert.throws(() => start(forum, 'p1', { body: ' ' }), /Write something/);
});

// ---- 3. Counts and summaries ------------------------------------------------------------------
test('post counts, characters list and topic summary follow posts and deletes', () => {
  let { forum, topic } = seeded();
  assert.equal(forum.counts.p1, 1);
  assert.deepEqual(forum.characters, ['hero']);
  let c = rep(forum, topic, 'p2', { as: 'sidekick' }, 'a2'); forum = apply(forum, c); topic = c.topic;
  c = rep(forum, topic, OWNER, { as: 'villain' }, 'a3'); forum = apply(forum, c); topic = c.topic;
  c = rep(forum, topic, 'p1', { as: 'hero' }, 'a4'); forum = apply(forum, c); topic = c.topic;
  assert.deepEqual(forum.counts, { p1: 2, p2: 1, [OWNER]: 1 });
  assert.deepEqual(forum.characters, ['hero', 'sidekick', 'villain']);
  const s = forum.topics[0];
  assert.deepEqual([s.replies, s.last, s.cast], [3, { userId: 'p1', as: 'hero' }, ['hero', 'sidekick', 'villain']]);
  assert.deepEqual(s, M.summarize(topic, s));
  // delete one reply: that writer's count drops; summary recomputed
  c = M.deletePost(forum, topic, { postId: 'a3' }, poster(forum, OWNER)); forum = apply(forum, c); topic = c.topic;
  assert.deepEqual([forum.counts[OWNER], forum.topics[0].replies, forum.topics[0].cast], [0, 2, ['hero', 'sidekick']]);
  // OOC posts count too
  const o = M.startTopic(forum, { boardId: 'ooc-chat', title: 'Chat', body: 'hi', as: null }, poster(forum, 'p2'), ids('t2', 'b1'), NOW); forum = apply(forum, o);
  assert.equal(forum.counts.p2, 2);
  // deleting a whole topic subtracts every post's writer
  c = M.deleteTopic(forum, topic, poster(forum, OWNER)); forum = apply(forum, c);
  assert.equal(c.topic, null);
  assert.deepEqual([forum.counts.p1, forum.counts.p2, forum.topics.length], [0, 1, 1]);
});

// ---- 4. Locks ---------------------------------------------------------------------------------
test('locked topics refuse non-moderator replies; locked boards refuse their topics', () => {
  let { forum, topic } = seeded();
  forum = apply(forum, M.setTopic(forum, topic, { topicId: 't1', locked: true }, poster(forum, 'co')));
  assert.throws(() => rep(forum, topic, 'p1'), /locked/);
  assert.equal(rep(forum, topic, 'co', { as: null }).topic.posts.length, 2);
  assert.equal(rep(forum, topic, OWNER, { as: 'villain' }).topic.posts.length, 2);
  const lockedBoard = M.editBoard(forum, { id: 'tavern-board', categoryId: 'locations', name: 'Tavern', locked: true }, poster(forum, OWNER));
  forum = apply(forum, lockedBoard);
  assert.throws(() => start(forum, 'p1', { title: 'Another' }), /Only moderators start topics/);
  assert.ok(start(forum, 'co', { title: 'Rules', as: null }).topic);
});

// ---- 5. Edit and delete -----------------------------------------------------------------------
test('only the author or a moderator may edit or delete; the first post goes with its topic', () => {
  let { forum, topic } = seeded();
  const c = rep(forum, topic, 'p2', { as: 'sidekick' }); forum = apply(forum, c); topic = c.topic;
  assert.throws(() => M.editPost(forum, topic, { postId: 'a2', body: 'x' }, poster(forum, 'p1'), NOW), /only edit your own/);
  assert.throws(() => M.deletePost(forum, topic, { postId: 'a2' }, poster(forum, 'p1')), /only delete your own/);
  const edited = M.editPost(forum, topic, { postId: 'a2', body: ' changed ' }, poster(forum, 'p2'), NOW).topic;
  assert.deepEqual([edited.posts[1].body, edited.posts[1].editedAt], ['changed', NOW.toISOString()]);
  assert.equal(M.editPost(forum, topic, { postId: 'a2', body: 'mod edit' }, poster(forum, 'co'), NOW).topic.posts[1].body, 'mod edit');
  assert.throws(() => M.deletePost(forum, topic, { postId: 'a1' }, poster(forum, 'p1')), /first post starts the topic/);
  const del = M.deletePost(forum, topic, { postId: 'a2' }, poster(forum, 'p2')); forum = apply(forum, del);
  assert.equal(forum.counts.p2 ?? 0, 0);
  const alone = M.deletePost(forum, del.topic, { postId: 'a1' }, poster(forum, 'p1'));
  assert.equal(alone.topic, null);
  assert.deepEqual([apply(forum, alone).topics.length, apply(forum, alone).counts.p1], [0, 0]);
  assert.throws(() => M.deleteTopic(forum, topic, poster(forum, 'p1')), /Only moderators/);
});

// ---- 6. setTopic ------------------------------------------------------------------------------
test('setTopic: moderators pin, lock and move within a kind; the starter may rename', () => {
  let { forum, topic } = seeded();
  forum = apply(forum, M.addBoard(forum, { categoryId: 'locations', name: 'Market' }, poster(forum, OWNER), 'market'));
  forum = apply(forum, M.addBoard(forum, { categoryId: 'ooc', name: 'Rules' }, poster(forum, OWNER), 'rules'));
  for (const patch of [{ pinned: true }, { locked: true }, { boardId: 'market' }]) assert.throws(() => M.setTopic(forum, topic, { topicId: 't1', ...patch }, poster(forum, 'p1')), /Only moderators/);
  assert.throws(() => M.setTopic(forum, topic, { topicId: 't1', title: 'Nope' }, poster(forum, 'p2')), /Only the person who started it/);
  forum = apply(forum, M.setTopic(forum, topic, { topicId: 't1', title: '  New   title ' }, poster(forum, 'p1')));
  assert.equal(forum.topics[0].title, 'New title');
  forum = apply(forum, M.setTopic(forum, topic, { topicId: 't1', pinned: true, locked: true }, poster(forum, 'co')));
  assert.deepEqual([forum.topics[0].pinned, forum.topics[0].locked], [true, true]);
  assert.throws(() => M.setTopic(forum, topic, { topicId: 't1', boardId: 'rules' }, poster(forum, 'co')), /between in-character boards/);
  const moved = M.setTopic(forum, topic, { topicId: 't1', boardId: 'market' }, poster(forum, 'co'));
  assert.equal(moved.topic.boardId, 'market');
  assert.equal(apply(forum, moved).topics[0].boardId, 'market');
});

// ---- 7. Boards and settings -------------------------------------------------------------------
test('boards: add, edit, move and delete with the safety rules', () => {
  let f = withBoards(); const gm = poster(f, OWNER), step = c => { f = apply(f, c); };
  assert.throws(() => M.addBoard(f, { categoryId: 'locations', name: 'X' }, poster(f, 'p1'), 'x'), /can't change the boards/);
  step(M.addBoard(f, { categoryId: 'locations', name: ' Market ', description: 'a  b' }, gm, 'market'));
  step(M.addBoard(f, { categoryId: 'locations', name: 'Stalls', parentId: 'market' }, gm, 'stalls'));
  assert.throws(() => M.addBoard(f, { categoryId: 'locations', name: 'Deep', parentId: 'stalls' }, gm, 'deep'), /one level deep/);
  assert.throws(() => M.addBoard(f, { categoryId: 'ooc', name: 'Cross', parentId: 'market' }, gm, 'c'), /same category/);
  assert.throws(() => M.editBoard(f, { id: 'market', categoryId: 'locations', parentId: 'tavern-board', name: 'M' }, gm), /can't become a subforum/);
  step(M.editBoard(f, { id: 'market', categoryId: 'locations', name: 'Bazaar', description: 'x' }, gm));
  assert.equal(f.boards.find(b => b.id === 'market').name, 'Bazaar');
  step(M.moveItem(f, { id: 'market', what: 'board', by: -1 }, gm));
  assert.ok(f.boards.findIndex(b => b.id === 'market') < f.boards.findIndex(b => b.id === 'tavern-board'));
  step(M.moveItem(f, { id: 'locations', what: 'category', by: 1 }, gm));
  assert.equal(f.categories[0].id, 'ooc');
  assert.throws(() => M.deleteBoard(f, { id: 'market' }, gm), /subforums first/);
  step(M.deleteBoard(f, { id: 'stalls' }, gm));
  const t = start(f, 'p1', { boardId: 'market' }); f = apply(f, t);
  assert.throws(() => M.deleteBoard(f, { id: 'market' }, gm), /topics first/);
  assert.throws(() => M.deleteCategory(f, { id: 'locations' }, gm), /boards first/);
  const c = M.addCategory(f, { name: 'Lore', kind: 'ooc' }, gm, 'lore'); step(c);
  step(M.editCategory(f, { id: 'lore', name: 'History' }, gm));
  step(M.deleteCategory(f, { id: 'lore' }, gm));
  assert.equal(f.categories.some(x => x.id === 'lore'), false);
});
test('settings reject javascript: links and accept site-relative and https links', () => {
  const f = M.emptyForum(), gm = poster(f, OWNER), s = links => ({ title: 'T', tagline: '', banner: true, links });
  assert.throws(() => M.setSettings(f, s([{ label: 'Bad', url: 'javascript:alert(1)' }]), gm), /starting with \/ or https/);
  assert.throws(() => M.setSettings(f, s([{ label: 'Bad', url: '//evil.test' }]), gm), /starting with/);
  const ok = apply(f, M.setSettings(f, s([{ label: 'Wiki', url: '/encyclopedia' }, { label: 'Site', url: 'https://example.com/x' }]), gm));
  assert.equal(ok.settings.links.length, 2);
  assert.throws(() => M.setSettings(f, s([]), poster(f, 'p1')), /can't change the boards/);
});

// ---- 8. Store ---------------------------------------------------------------------------------
test('store writes the topic and forum files and survives a competing write', async () => {
  const b = new Bucket(), store = new ForumStore(b), board = withBoards();
  await b.put(forumKey(OWNER, 'camp'), JSON.stringify(board));
  const out = await store.apply(OWNER, 'camp', null, f => start(f, 'p1'));
  assert.deepEqual(out, { topicId: 't1' });
  assert.equal((await store.readTopic(OWNER, 'camp', 't1')).topic.posts.length, 1);
  assert.equal((await store.read(OWNER, 'camp')).forum.counts.p1, 1);
  // a second user saves the forum file between the first user's read and write
  b.beforePut = { key: forumKey(OWNER, 'camp'), run: () => store.apply(OWNER, 'camp', 't1', (f, t) => rep(f, t, 'p2', { as: 'sidekick' }, 'a3')) };
  await store.apply(OWNER, 'camp', 't1', (f, t) => rep(f, t, 'p1', { as: 'hero' }, 'a2'));
  const { forum } = await store.read(OWNER, 'camp'), { topic } = await store.readTopic(OWNER, 'camp', 't1');
  assert.deepEqual(forum.counts, { p1: 2, p2: 1 });
  assert.deepEqual(topic.posts.map(p => p.id).sort(), ['a1', 'a2', 'a3']);
  assert.equal(forum.topics[0].replies, topic.posts.length - 1, 'summary matches the topic (BUG: stale, see report)');
});
test('store retries when the forum file fails its conditional write once, and deletes topic files', async () => {
  const b = new Bucket(), store = new ForumStore(b);
  const chat = (f, u = 'p1') => start(f, u, { boardId: 'ooc-chat', as: null });
  await store.apply(OWNER, 'camp', null, f => chat(f));
  const real = b.put.bind(b); let failed = false;
  b.put = async (key, text, o) => { if (key === forumKey(OWNER, 'camp') && !failed) { failed = true; return null; } return real(key, text, o); };
  await store.apply(OWNER, 'camp', 't1', (f, t) => rep(f, t, 'p1', { as: null }));
  assert.equal(failed, true);
  assert.equal((await store.read(OWNER, 'camp')).forum.counts.p1, 2);
  await store.apply(OWNER, 'camp', 't1', (f, t) => M.deleteTopic(f, t, poster(f, OWNER)));
  assert.equal(await store.readTopic(OWNER, 'camp', 't1'), null);
  assert.equal((await store.read(OWNER, 'camp')).forum.topics.length, 0);
});

// ---- 9. Views ---------------------------------------------------------------------------------
test('character cards show only what players may read', () => {
  const ctx = ctxFor(seeded().forum, 'p1'), get = id => workspace.entries.find(e => e.id === id);
  assert.deepEqual(cardOf(ctx, get('hero')).fields, [{ label: 'Class', value: 'Bard' }]);
  assert.deepEqual(cardOf(ctx, get('villain')).fields, [], 'stats hidden from players');
  assert.equal(cardOf(ctx, get('hero')).picture.imageId, IMG.hero);
  assert.equal(JSON.stringify(cardOf(ctx, get('villain'))).includes('Phylactery'), false);
});
test('topicPage gives cards and per-post edit and delete flags', () => {
  let { forum, topic } = seeded();
  const c = rep(forum, topic, 'p2', { as: 'sidekick' }); forum = apply(forum, c); topic = c.topic;
  const page = viewer => topicPage(ctxFor(forum, viewer), topic);
  const p1 = page('p1');
  assert.deepEqual(Object.keys(p1.cards).sort(), ['hero', 'sidekick']);
  assert.deepEqual(p1.posts.map(p => [p.mine, p.canEdit, p.canDelete]), [[true, true, false], [false, false, false]]);
  assert.deepEqual(page('p2').posts.map(p => [p.canEdit, p.canDelete]), [[false, false], [true, true]]);
  assert.deepEqual(page('co').posts.map(p => [p.canEdit, p.canDelete]), [[true, false], [true, true]]);
  assert.deepEqual([p1.topic.canReply, page('g1').topic.canReply], [true, false]);
  assert.equal(p1.posts[1].name, 'Quinn');
  assert.equal(topicPage(ctxFor(M.emptyForum(), 'p1'), topic), null);
});
test('frame lists the GM first as staff and top posters by count', () => {
  let { forum, topic } = seeded();
  for (const [i, u] of ['p2', 'p2', 'p1'].entries()) { const c = rep(forum, topic, u, { as: u === 'p2' ? 'sidekick' : 'hero' }, 'r' + i); forum = apply(forum, c); topic = c.topic; }
  const frame = frameOf(ctxFor(forum, 'p1'));
  assert.deepEqual(frame.staff, [{ name: 'Gamemaster', role: 'GM' }, { name: 'Casey', role: 'Co-GM' }]);
  assert.deepEqual(frame.footer.top.map(t => t.posts), [2, 2]);
  forum = { ...forum, counts: { ...forum.counts, co: 9 } };
  assert.deepEqual(frameOf(ctxFor(forum, 'p1')).footer.top[0], { name: 'Casey', posts: 9 });
  assert.deepEqual(frame.you, { ...frame.you, name: 'Pat', posts: 2 });
  assert.equal(frame.footer.stats.posts, 4);
  assert.deepEqual(membersPage(ctxFor(forum, 'p1')).members.map(m => [m.name, m.role]).sort(), [['Casey', 'Co-GM'], ['Gamemaster', 'GM'], ['Gus', 'Guest'], ['Pat', 'Player'], ['Quinn', 'Player']]);
});
test('forumImages: posting characters and location places, not hidden characters', () => {
  const forum = { ...withBoards(), characters: ['hero'] };
  const imgs = forumImages(ctxFor(forum, 'p2'));
  assert.ok(imgs.has(IMG.hero) && imgs.has(IMG.tavern));
  assert.equal(imgs.has(IMG.villain), false);
  assert.equal(forumImages(ctxFor({ ...forum, characters: [] }, 'p2')).has(IMG.hero), false);
  assert.ok(forumImages(ctxFor({ ...forum, characters: [] }, 'p1')).has(IMG.hero), 'own character cast');
  assert.ok(forumImages(ctxFor({ ...forum, characters: [] }, OWNER)).has(IMG.villain), 'GM may post as anyone');
});

// ---- 10. Requests -----------------------------------------------------------------------------
function harness({ user = 'p1', campaign } = {}) {
  resetForumThrottles();
  const bucket = new Bucket(), store = new ForumStore(bucket); let n = 0;
  const deps = {
    sameOrigin: r => r.headers.get('Origin') === new URL(r.url).origin,
    user: async () => user,
    campaign: campaign ?? (async (u) => (u === 'stranger' ? null : { owner: OWNER, campaignId: 'camp', list: list() })),
    workspace: async () => workspace, store, now: () => NOW, newId: () => 'id' + ++n,
    image: async (_o, id) => ({ url: 'https://img.test/' + id }),
  };
  const post = (body, headers = { Origin: 'https://x.test' }, d = deps) =>
    handleForum(new Request('https://x.test/api/forum', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }), d);
  return { deps, post, store };
}
const KEY = 'c-camp';
test('request: origin, sign-in, membership and bad bodies', async () => {
  const { deps, post } = harness();
  const view = { action: 'view', campaign: KEY, page: { kind: 'index' } };
  assert.equal((await post(view, { Origin: 'https://evil.test' })).status, 403);
  assert.equal((await post(view, { Origin: 'https://x.test' }, { ...deps, user: async () => null })).status, 401);
  assert.equal((await post(view, undefined, { ...deps, user: async () => 'stranger' })).status, 404);
  assert.equal((await post({ action: 'start', campaign: KEY })).status, 400);
  assert.equal((await post('not json')).status, 400);
  assert.equal((await post({ action: 'view', campaign: 'bad key', page: { kind: 'index' } })).status, 400);
});
test('request: guests cannot start; players start, reply and view index, board and topic', async () => {
  const { deps, post } = harness({ user: 'g1' });
  const startBody = { action: 'start', campaign: KEY, boardId: 'ooc-chat', title: 'Hi', body: 'Hello', as: null };
  const refused = await post(startBody, undefined, deps);
  assert.equal(refused.status, 400);
  assert.match((await refused.json()).error, /can't start topics/);
  const player = harness({ user: 'p1' });
  const made = await player.post(startBody);
  assert.equal(made.status, 200);
  const { topicId } = await made.json();
  assert.equal(topicId, 'id1');
  assert.equal((await (await player.post({ action: 'reply', campaign: KEY, topicId, body: 'again', as: null })).json()).ok, true);
  for (const page of [{ kind: 'index' }, { kind: 'board', id: 'ooc-chat' }, { kind: 'topic', id: topicId }]) {
    const res = await player.post({ action: 'view', campaign: KEY, page });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.page.kind, page.kind);
    assert.ok(data.frame.boards.length);
  }
  const topic = await (await player.post({ action: 'view', campaign: KEY, page: { kind: 'topic', id: topicId } })).json();
  assert.equal(topic.page.posts.length, 2);
  assert.equal(topic.frame.you.posts, 2);
  assert.equal((await player.post({ action: 'view', campaign: KEY, page: { kind: 'topic', id: 'gone' } })).status, 404);
  assert.equal((await player.post({ action: 'view', campaign: KEY, page: { kind: 'settings' } })).status, 403);
});
test('request: images redirect only for pictures the forum may show', async () => {
  const { deps } = harness({ user: 'p2' });
  await deps.store.apply(OWNER, 'camp', null, f => M.addBoard(f, { categoryId: 'locations', name: 'Tavern', placeId: 'tavern' }, poster(f, OWNER), 'tb'));
  const get = image => handleForumImage(new Request(`https://x.test/api/forum?c=${KEY}&image=${image}`), deps);
  const ok = await get(IMG.tavern);
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.get('Location'), 'https://img.test/' + IMG.tavern);
  assert.equal((await get(IMG.villain)).status, 404);
  assert.equal((await get('../x')).status, 404);
});

// ---- 11. Reading: unread marks, presence, turns, recent posts ----------------------------------
test('reader: unread marks, mark all and pruning', () => {
  const t = { id: 't1', lastAt: '2026-01-02T00:00:00.000Z', last: { userId: 'p2', as: null } };
  const r0 = R.freshReads('2026-01-01T00:00:00.000Z');
  assert.equal(R.isUnread(r0, t, 'p1'), true);
  assert.equal(R.isUnread(r0, t, 'p2'), false, 'your own last post is read');
  assert.equal(R.isUnread(undefined, t, 'p1'), false);
  const r1 = R.markTopic(r0, 't1', t.lastAt);
  assert.equal(R.isUnread(r1, t, 'p1'), false);
  assert.equal(R.markTopic(r1, 't1', t.lastAt), null, 'nothing to write');
  assert.equal(R.isUnread(r1, { ...t, lastAt: '2026-01-03T00:00:00.000Z' }, 'p1'), true, 'a newer post');
  const r2 = R.markTopic({ ...r1, topics: { ...r1.topics, gone: '2026-01-02T00:00:00.000Z' } }, 't2', '2026-01-04T00:00:00.000Z', new Set(['t1', 't2']));
  assert.deepEqual(Object.keys(r2.topics).sort(), ['t1', 't2'], 'removed topics are dropped');
  const all = R.markAll(new Date('2026-01-05T00:00:00.000Z'));
  assert.deepEqual(all.topics, {});
  assert.equal(R.isUnread(all, { ...t, lastAt: '2026-01-04T00:00:00.000Z' }, 'p1'), false);
});

test('reader: presence writes at most once a minute and keeps the peak', () => {
  const at = m => new Date(NOW.getTime() + m * 60_000);
  const p1 = R.touch(null, 'a', at(0));
  assert.deepEqual(R.onlineOf(p1, at(0)), ['a']);
  assert.equal(R.touch(p1, 'a', at(0.5)), null, 'seen a moment ago');
  const p2 = R.touch(p1, 'b', at(1));
  assert.deepEqual(R.onlineOf(p2, at(1)), ['b', 'a']);
  assert.equal(p2.peak.count, 2);
  assert.deepEqual(R.onlineOf(p2, at(16)), ['b']);
  const p3 = R.touch(p2, 'a', at(60));
  assert.equal(p3.peak.count, 2, 'the peak stays');
  assert.deepEqual(R.onlineOf(p3, at(60)), ['a']);
});

test('reader: turns go round in first-post order, with narration as one more', () => {
  const s = (order, lastAs) => ({ cast: order.filter(x => x !== R.NARRATION), order, last: { userId: 'x', as: lastAs } });
  assert.equal(R.nextUp(s(['hero'], 'hero')), null, 'one writer: nobody waits');
  assert.equal(R.nextUp(s(['hero', 'villain'], 'hero')), 'villain');
  assert.equal(R.nextUp(s(['hero', 'villain'], 'villain')), 'hero');
  assert.equal(R.nextUp(s([R.NARRATION, 'hero', 'villain'], null)), 'hero');
  assert.equal(R.nextUp(s([R.NARRATION, 'hero', 'villain'], 'villain')), R.NARRATION);
  assert.equal(R.nextUp({ cast: ['hero', 'villain'], last: { userId: 'x', as: 'villain' } }), 'hero', 'older summaries use the cast');
});

test('model: summaries keep the turn order; posts are logged for a few days and unlogged on delete', () => {
  const { forum, topic } = seeded();
  const gm = M.reply(forum, topic, { body: 'The GM speaks', as: null }, poster(forum, OWNER), 'a2', NOW);
  const f1 = gm.forum(forum, gm.topic);
  assert.deepEqual(f1.topics[0].order, ['hero', R.NARRATION]);
  assert.deepEqual(f1.recent.map(r => r.postId), ['a1', 'a2']);
  const del = M.deletePost(f1, gm.topic, { postId: 'a2' }, poster(f1, OWNER));
  assert.deepEqual(del.forum(f1, del.topic).recent.map(r => r.postId), ['a1']);
  const later = new Date(NOW.getTime() + 4 * 86_400_000);
  const again = M.reply(f1, gm.topic, { body: 'Days later', as: 'hero' }, poster(f1, 'p1'), 'a3', later);
  assert.deepEqual(again.forum(f1, again.topic).recent.map(r => r.postId), ['a3'], 'old posts drop off');
  assert.deepEqual(M.deleteTopic(f1, gm.topic, poster(f1, OWNER)).forum(f1).recent, []);
});

test('view: unread, whose turn, waiting on you, online and characters who posted today', () => {
  const { forum, topic } = seeded();
  const gm = M.reply(forum, topic, { body: 'The villain sneers', as: 'villain' }, poster(forum, OWNER), 'a2', NOW);
  const f = gm.forum(forum, gm.topic);
  const reads = R.freshReads('2025-12-31T00:00:00.000Z');
  const presence = R.touch(R.touch(null, 'p1', NOW), OWNER, NOW);
  const forPat = { ...ctxFor(f, 'p1'), reads, presence, now: NOW };
  const frame = frameOf(forPat);
  assert.equal(frame.you.unread, 1);
  assert.equal(frame.boards.find(b => b.id === 'tavern-board').unread, true);
  assert.equal(frame.footer.active[0].next.name, 'Hero');
  assert.equal(frame.footer.active[0].next.mine, true, "Pat plays the Hero: it's their turn");
  assert.equal(frame.you.waiting.length, 1);
  assert.deepEqual(frame.footer.online.map(o => o.name).sort(), ['Gamemaster', 'Pat']);
  assert.deepEqual(frame.footer.today.map(c => [c.name, c.at.length]), [['Hero', 1], ['Villain', 1]]);
  assert.equal(JSON.stringify(frame).includes('"p1"'), false, 'no account ids reach the browser');
  // The GM plays the villain (nobody else edits it): after the hero, it's the GM's turn there.
  const rep2 = M.reply(f, gm.topic, { body: 'Hero answers', as: 'hero' }, poster(f, 'p1'), 'a3', NOW), f2 = rep2.forum(f, rep2.topic);
  const gmFrame = frameOf({ ...ctxFor(f2, OWNER), reads, presence, now: NOW });
  assert.equal(gmFrame.you.waiting[0].next.name, 'Villain');
  assert.equal(gmFrame.you.waiting[0].next.mine, true);
  assert.equal(frameOf({ ...ctxFor(f2, 'p1'), reads, now: NOW }).you.waiting[0].next.mine, false);
  assert.equal(frameOf({ ...ctxFor(f2, 'p2'), reads, now: NOW }).you.waiting.length, 0, 'Quinn has nobody in it');
  const page = topicPage({ ...forPat, reads }, gm.topic);
  assert.equal(page.readBefore, reads.all);
});

test('request: opening a topic marks it read; Mark all as read; online after a view', async () => {
  const p1 = harness({ user: 'p1' });
  const { topicId } = await (await p1.post({ action: 'start', campaign: KEY, boardId: 'ooc-chat', title: 'Hi', body: 'Hello', as: null })).json();
  const gm = harness({ user: OWNER });
  gm.deps.store = p1.store;
  const later = new Date(NOW.getTime() + 60_000);
  gm.deps.now = () => later;
  const index = async h => (await h.post({ action: 'view', campaign: KEY, page: { kind: 'index' } })).json();
  // The GM's first visit marks everything before it read; a reply after that is new to them.
  assert.equal((await index(gm)).frame.you.unread, 0);
  const p1Later = { ...p1.deps, now: () => new Date(NOW.getTime() + 120_000) };
  await p1.post({ action: 'reply', campaign: KEY, topicId, body: 'Anyone?', as: null }, undefined, p1Later);
  gm.deps.now = () => new Date(NOW.getTime() + 180_000);
  const before = await index(gm);
  assert.equal(before.frame.you.unread, 1);
  assert.deepEqual(before.frame.footer.online.map(o => o.name).sort(), ['Gamemaster', 'Pat']);
  const opened = await (await gm.post({ action: 'view', campaign: KEY, page: { kind: 'topic', id: topicId } })).json();
  assert.equal(opened.frame.you.unread, 0);
  assert.ok(opened.page.readBefore < opened.page.posts[1].at, 'the reply shows as new on this visit');
  assert.equal((await index(gm)).frame.you.unread, 0);
  await p1.post({ action: 'reply', campaign: KEY, topicId, body: 'Hello?', as: null }, undefined, { ...p1.deps, now: () => new Date(NOW.getTime() + 240_000) });
  gm.deps.now = () => new Date(NOW.getTime() + 300_000);
  assert.equal((await index(gm)).frame.you.unread, 1);
  assert.equal((await (await gm.post({ action: 'readAll', campaign: KEY })).json()).ok, true);
  assert.equal((await index(gm)).frame.you.unread, 0);
});
