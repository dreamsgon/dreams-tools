import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceSchema, defaultCharacter } from '../lib/encyclopedia/world-model.ts';
import { emptyMemberList } from '../lib/members.ts';
import * as M from '../lib/forum/model.ts';
import { ForumStore, forumKey } from '../lib/forum/store.ts';
import { frameOf, topicPage, boardPage, trashPage, activePage, cardOf, castOf, forumImages, membersPage } from '../lib/forum/view.ts';
import { handleForum, handleForumImage, resetForumThrottles } from '../lib/forum/request.ts';
import * as R from '../lib/forum/reader.ts';
import * as K from '../lib/forum/markup.ts';
import * as A from '../lib/forum/alerts.ts';
import * as D from '../lib/forum/rolls.ts';
import * as C from '../lib/forum/combat.ts';
import { newScene, newToken } from '../lib/model.ts';
import { forumMcp } from '../lib/forum/mcp.ts';
import { callTool } from '../lib/mcp/tools.ts';
import { fillPerms, presets } from '../lib/mcp/permissions.ts';

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

// ---- 12. Writing: markup, page links ------------------------------------------------------------
test('markup: collapsed sections, underline, italic, speech and page links', () => {
  const blocks = K.postBlocks('Before\n[collapse=Her letter]\nDear S,\n> come home\n[/collapse]\nAfter\n[collapse]\nunclosed');
  assert.deepEqual(blocks.map(b => b.type), ['paragraph', 'collapse', 'paragraph', 'collapse']);
  assert.equal(blocks[1].title, 'Her letter');
  assert.deepEqual(blocks[1].blocks.map(b => b.type), ['paragraph', 'quote']);
  assert.equal(blocks[3].title, 'Show more', 'an unclosed section runs to the end');
  const parts = K.postInline('She said “run”, **now**, *quietly* and __twice__ to [[Seren Vael|Seren]]. "Go."');
  assert.deepEqual(parts.map(p => p.type), ['text', 'speech', 'text', 'bold', 'text', 'italic', 'text', 'underline', 'text', 'link', 'text', 'speech']);
  assert.equal(parts.find(p => p.type === 'link').target, 'Seren Vael');
  assert.deepEqual([...K.linkTargets('[[A]] and [[B|b]] and [[A]]')], ['A', 'B']);
  assert.equal(K.wordCount('[collapse=x]\nIt’s three  words\n[/collapse]'), 3);
});

test('view: page links resolve only to pages the reader may open, and summaries leave out secrets', () => {
  const ws = workspaceSchema.parse({
    ...workspace,
    entries: [...workspace.entries.map(e => e.id === 'tavern' ? { ...e, body: ':::secret\nThe cellar hides a body\n:::\nWarm and loud.' } : e)],
  });
  const f0 = withBoards(), c = M.startTopic(f0, { boardId: 'tavern-board', title: 'Hi', body: 'To [[Tavern]], [[Villain]] and [[Nowhere]].', as: 'hero' }, poster(f0, 'p1'), ids('t1', 'a1'), NOW);
  const f = c.forum(f0, c.topic);
  const player = topicPage(ctxFor(f, 'p1', ws), c.topic);
  assert.deepEqual(Object.keys(player.links), ['Tavern'], 'the villain page is not readable by players');
  assert.equal(player.links.Tavern.summary, 'Warm and loud.');
  const gm = topicPage(ctxFor(f, OWNER, ws), c.topic);
  assert.deepEqual(Object.keys(gm.links).sort(), ['Tavern', 'Villain']);
  const board = boardPage(ctxFor(f, 'p1', ws), 'tavern-board');
  assert.equal(board.place.summary, 'Warm and loud.', 'no secret line in the board summary');
});

// ---- 13. Moderation ---------------------------------------------------------------------------
test('private topics: only the starter, the people named and the GMs see them, anywhere', () => {
  const f0 = withBoards();
  const c = M.startTopic(f0, { boardId: 'ooc-chat', title: 'Secret plan', body: 'Shh', as: null, private: ['p2', 'p1', 'p2'] }, poster(f0, 'p1'), ids('t9', 'z1'), NOW);
  const f = apply(f0, c);
  assert.deepEqual(f.topics[0].private, ['p2'], 'the starter is left out and names are not repeated');
  const sees = u => M.canSee(f.topics[0], ctxFor(f, u).viewer);
  assert.deepEqual(['p1', 'p2', OWNER, 'co', 'g1'].map(sees), [true, true, true, true, false]);
  const guest = ctxFor(f, 'g1');
  assert.equal(boardPage(guest, 'ooc-chat').topics.length, 0);
  assert.equal(frameOf(guest).footer.stats.topics, 0);
  assert.equal(frameOf(guest).footer.active.length, 0);
  assert.equal(topicPage(guest, c.topic), null);
  assert.throws(() => M.reply(f, c.topic, { body: 'hi', as: null }, poster(f, 'g1'), 'z2', NOW), msg(/removed/));
  assert.deepEqual(boardPage(ctxFor(f, 'p2'), 'ooc-chat').topics[0].only, ['Pat', 'Quinn']);
});

test('trash: moderators move a topic there and back; it leaves the lists; old ones expire', () => {
  let { forum, topic } = seeded();
  assert.throws(() => M.trashTopic(forum, { topicId: 't1' }, poster(forum, 'p1'), NOW), msg(/Only moderators/));
  forum = apply(forum, M.trashTopic(forum, { topicId: 't1' }, poster(forum, OWNER), NOW));
  assert.deepEqual(forum.topics[0].trashed, { at: NOW.toISOString(), by: OWNER });
  assert.equal(forum.counts.p1, 1, 'posts count until it goes for good');
  const player = ctxFor(forum, 'p1');
  assert.equal(boardPage(player, 'tavern-board').topics.length, 0);
  assert.equal(topicPage(player, topic), null);
  assert.equal(frameOf(player).footer.stats.trash, 0, 'players are not told about the Trash');
  assert.throws(() => M.reply(forum, topic, { body: 'x', as: 'hero' }, poster(forum, 'p1'), 'a9', NOW), msg(/removed/));
  const gm = ctxFor(forum, OWNER);
  assert.equal(frameOf(gm).footer.stats.trash, 1);
  const trash = trashPage(gm);
  assert.equal(trash.topics[0].board, 'Tavern');
  assert.equal(trash.topics[0].trashed.by, 'Gamemaster');
  const shown = topicPage(gm, topic);
  assert.equal(shown.topic.canReply, false, 'moderators may look but not reply');
  assert.deepEqual(M.expiredTrash(forum, new Date(NOW.getTime() + 29 * 86_400_000)), []);
  assert.deepEqual(M.expiredTrash(forum, new Date(NOW.getTime() + 31 * 86_400_000)), ['t1']);
  forum = apply(forum, M.trashTopic(forum, { topicId: 't1', restore: true }, poster(forum, OWNER), NOW));
  assert.equal(forum.topics[0].trashed, undefined);
  assert.equal(boardPage(ctxFor(forum, 'p1'), 'tavern-board').topics.length, 1);
});

test('archive: archived topics leave the board for its archive and take no replies', () => {
  let { forum, topic } = seeded();
  assert.throws(() => M.setTopic(forum, topic, { topicId: 't1', archived: true }, poster(forum, 'p1')), msg(/archive/));
  forum = apply(forum, M.setTopic(forum, topic, { topicId: 't1', archived: true }, poster(forum, OWNER)));
  assert.equal(forum.topics[0].archived, true);
  assert.throws(() => M.reply(forum, topic, { body: 'x', as: 'hero' }, poster(forum, 'p1'), 'a9', NOW), msg(/archived/));
  const player = ctxFor(forum, 'p1');
  const board = boardPage(player, 'tavern-board');
  assert.deepEqual([board.topics.length, board.archived], [0, 1]);
  assert.equal(boardPage(player, 'tavern-board', { archive: true }).topics[0].archived, true);
  assert.equal(activePage(player).topics.length, 0);
  assert.equal(topicPage(player, topic).topic.canReply, false);
  assert.equal(topicPage(player, topic).topic.next, null, 'nobody is waited on in an archived topic');
  // A later summary (from a reply by a moderator after bringing it back) keeps the flags it should.
  forum = apply(forum, M.setTopic(forum, topic, { topicId: 't1', archived: false }, poster(forum, OWNER)));
  assert.equal(!!forum.topics[0].archived, false);
});

test('request: multi-moderation, private topics by member key, the Trash page and GM-only board download', async () => {
  const gm = harness({ user: OWNER });
  const start = async (h, title, extra = {}) => (await (await h.post({ action: 'start', campaign: KEY, boardId: 'ooc-chat', title, body: 'Hello', as: null, ...extra })).json()).topicId;
  const a = await start(gm, 'One'), b = await start(gm, 'Two');
  const index = await (await gm.post({ action: 'view', campaign: KEY, page: { kind: 'index' } })).json();
  const quinn = index.frame.you.people.find(p => p.name === 'Quinn');
  assert.match(quinn.key, /^[a-f0-9]{16}$/);
  assert.equal(JSON.stringify(index.frame.you.people).includes('"p2"'), false, 'no account ids reach the browser');
  const c = await start(gm, 'For Quinn', { private: [quinn.key] });
  const p1 = harness({ user: 'p1' }); p1.deps.store = gm.store;
  const p2 = harness({ user: 'p2' }); p2.deps.store = gm.store;
  const board = async h => (await (await h.post({ action: 'view', campaign: KEY, page: { kind: 'board', id: 'ooc-chat' } })).json()).page;
  assert.deepEqual((await board(p1)).topics.map(t => t.title).sort(), ['One', 'Two']);
  assert.deepEqual((await board(p2)).topics.map(t => t.title).sort(), ['For Quinn', 'One', 'Two']);
  // Players can't multi-moderate.
  assert.equal((await p1.post({ action: 'bulk', campaign: KEY, topicIds: [a], op: 'lock' })).status, 400);
  const out = await (await gm.post({ action: 'bulk', campaign: KEY, topicIds: [a, b], op: 'lock' })).json();
  assert.equal(out.done, 2);
  assert.ok((await board(p1)).topics.every(t => t.locked));
  await gm.post({ action: 'bulk', campaign: KEY, topicIds: [a], op: 'archive' });
  assert.equal((await board(p1)).archived, 1);
  await gm.post({ action: 'bulk', campaign: KEY, topicIds: [b, c], op: 'trash' });
  assert.deepEqual((await board(p2)).topics.map(t => t.title), []);
  assert.equal((await p1.post({ action: 'view', campaign: KEY, page: { kind: 'trash' } })).status, 403);
  const trash = await (await gm.post({ action: 'view', campaign: KEY, page: { kind: 'trash' } })).json();
  assert.deepEqual(trash.page.topics.map(t => t.title).sort(), ['For Quinn', 'Two']);
  assert.equal((await (await gm.post({ action: 'trash', campaign: KEY, topicId: b, restore: true })).json()).ok, true);
  // After 30 days, opening the Trash clears what's left in it for good.
  gm.deps.now = () => new Date(NOW.getTime() + 31 * 86_400_000);
  const later = await (await gm.post({ action: 'view', campaign: KEY, page: { kind: 'trash' } })).json();
  assert.deepEqual(later.page.topics, []);
  assert.equal(await gm.store.readTopic(OWNER, 'camp', c), null);
  // Downloading a whole board is the GM's.
  assert.equal((await p1.post({ action: 'export', campaign: KEY, boardId: 'ooc-chat' })).status, 400);
  const file = await (await gm.post({ action: 'export', campaign: KEY, boardId: 'ooc-chat' })).json();
  assert.deepEqual(file.topics.map(t => t.title).sort(), ['One', 'Two']);
  assert.equal(file.topics[0].posts[0].name, 'Gamemaster');
});

// ---- 14. Permission masks, notices, alerts and search ------------------------------------------
test('permission masks: a group told No or Never on a board loses it there; subforums follow; GMs are never masked', () => {
  let f = withBoards();
  f.boards.push({ id: 'cellar', categoryId: 'locations', parentId: 'tavern-board', name: 'Cellar', description: '' });
  const l = list(), access = u => M.boardAccess(f, l, u, M.forumRights(l, u, OWNER));
  assert.deepEqual(access('p1')['tavern-board'], { read: true, start: true, reply: true });
  assert.throws(() => M.setMasks(f, { id: 'tavern-board', masks: {} }, poster(f, 'p1'), ['players']), msg(/can't change the boards/));
  f = apply(f, M.setMasks(f, { id: 'tavern-board', masks: { players: { reply: 'no', start: 'no' }, nobody: { read: 'no' } } }, poster(f, OWNER), l.groups.map(g => g.id)));
  assert.deepEqual(f.boards[1].masks, { players: { reply: 'no', start: 'no' } }, 'unknown groups are dropped');
  assert.deepEqual(access('p1')['tavern-board'], { read: true, start: false, reply: false });
  assert.deepEqual(access('p1').cellar, { read: true, start: false, reply: false }, 'the subforum follows its board');
  assert.deepEqual(access('p1')['ooc-chat'], { read: true, start: true, reply: true });
  // Guests may be let in to reply on one board; Never wins over Yes.
  f = apply(f, M.setMasks(f, { id: 'ooc-chat', masks: { guests: { reply: 'yes' } } }, poster(f, OWNER), l.groups.map(g => g.id)));
  assert.equal(access('g1')['ooc-chat'].reply, true);
  f = apply(f, M.setMasks(f, { id: 'tavern-board', masks: { players: { read: 'never' } } }, poster(f, OWNER), l.groups.map(g => g.id)));
  assert.equal(access('p1')['tavern-board'].read, false);
  assert.equal(access('p1').cellar.read, false, "a subforum can't be read when its board can't");
  assert.equal(access('co')['tavern-board'].read, true, 'co-GMs see GM-only things, so they are not masked');
  assert.equal(access(OWNER)['tavern-board'].read, true);
  // Masked boards and their topics disappear from the player's views, and they can't post there.
  const t = M.startTopic(f, { boardId: 'tavern-board', title: 'Hidden', body: 'x', as: 'villain' }, poster(f, OWNER), ids('th', 'h1'), NOW);
  f = apply(f, t);
  const ctx = ctxFor(f, 'p1'); ctx.viewer.access = access('p1');
  const frame = frameOf(ctx);
  assert.deepEqual(frame.boards.map(b => b.id), ['ooc-chat']);
  assert.equal(frame.categories.some(c => c.id === 'locations'), false, 'a category with nothing to read is left out');
  assert.equal(frame.footer.stats.topics, 0);
  assert.equal(boardPage(ctx, 'tavern-board'), null);
  assert.equal(topicPage(ctx, t.topic), null);
  const p1 = { ...poster(f, 'p1'), access: access('p1') };
  assert.throws(() => M.reply(f, t.topic, { body: 'x', as: 'hero' }, p1, 'h2', NOW), msg(/removed/));
  // Editing the board keeps its masks.
  f = apply(f, M.editBoard(f, { id: 'tavern-board', categoryId: 'locations', name: 'Tavern!' }, poster(f, OWNER)));
  assert.ok(f.boards.find(b => b.id === 'tavern-board').masks);
});

test('alerts: @names and quotes find members and the players of characters', () => {
  const names = ['Pat', 'Hero', 'Sea Witch', 'Quinn'];
  assert.deepEqual([...A.mentioned('Hey @pat and @Sea Witch, also @Quinnly and email@Hero.x', names)].sort(), ['Pat', 'Sea Witch']);
  assert.deepEqual([...A.quoted('> She said so\n> — Hero\n\nreply', names)], ['Hero']);
  let a = A.addAlerts(null, [{ id: 'mention:t:1', at: NOW.toISOString(), kind: 'mention', topicId: 't', postId: 'p1', by: 'gm', as: null }], NOW);
  a = A.addAlerts(a, [{ id: 'mention:t:1', at: NOW.toISOString(), kind: 'mention', topicId: 't', postId: 'p1', by: 'gm', as: null }], NOW);
  assert.equal(a.items.length, 1, 'once each');
  assert.equal(A.unseen(a), 1);
  assert.equal(A.unseen({ ...a, seen: NOW.toISOString() }), 0);
});

test('request: alerts for mentions, quotes and private topics reach only people who can see the topic', async () => {
  const gm = harness({ user: OWNER });
  const people = (await (await gm.post({ action: 'view', campaign: KEY, page: { kind: 'index' } })).json()).frame.you.people;
  const key = name => people.find(p => p.name === name).key;
  // A private topic for Quinn that names Pat: Pat isn't in it, so only Quinn hears.
  const { topicId } = await (await gm.post({ action: 'start', campaign: KEY, boardId: 'ooc-chat', title: 'Quiet', body: 'Hi @Quinn and @Pat', as: null, private: [key('Quinn')] })).json();
  const as = async (u, deps = {}) => { const h = harness({ user: u }); h.deps.store = gm.store; Object.assign(h.deps, deps); return h; };
  const frameOfUser = async h => (await (await h.post({ action: 'view', campaign: KEY, page: { kind: 'index' } })).json()).frame;
  const quinn = await as('p2', { now: () => new Date(NOW.getTime() + 1000) }), pat = await as('p1');
  const qa = (await frameOfUser(quinn)).you.alerts;
  assert.equal(qa.unseen, 1);
  assert.deepEqual([qa.items[0].kind, qa.items[0].title, qa.items[0].name], ['mention', 'Quiet', 'Gamemaster']);
  assert.equal((await frameOfUser(pat)).you.alerts.items.length, 0, 'Pat cannot see the private topic');
  // Writing as a character: naming the Hero alerts Pat, who plays it; quoting the Villain alerts the GM, who runs it.
  const { id: tavern } = await (await gm.post({ action: 'addBoard', campaign: KEY, categoryId: 'locations', name: 'Tavern' })).json();
  const made = await (await gm.post({ action: 'start', campaign: KEY, boardId: tavern, title: 'Tavern', body: 'The door opens.', as: null })).json(), open = made.topicId;
  assert.ok(open, JSON.stringify(made));
  const replied = await (await pat.post({ action: 'reply', campaign: KEY, topicId: open, body: '> Leave.\n> — Villain\n\nNo. @Hero stays.', as: 'hero' })).json();
  assert.equal(replied.ok, true, JSON.stringify(replied));
  assert.equal((await frameOfUser(pat)).you.alerts.items.length, 0, 'never for your own post');
  const g = (await frameOfUser(gm)).you.alerts;
  assert.deepEqual(g.items.map(x => [x.kind, x.name]), [['quote', 'Hero']]);
  assert.equal((await (await gm.post({ action: 'alertsSeen', campaign: KEY })).json()).ok, true);
  assert.equal((await frameOfUser(gm)).you.alerts.unseen, 0);
  assert.ok(topicId);
});

test('request: search finds titles and posts the reader can see; notices save with the banner; masks via settings', async () => {
  const gm = harness({ user: OWNER });
  await gm.post({ action: 'start', campaign: KEY, boardId: 'ooc-chat', title: 'Lanterns', body: 'The green lantern burns.', as: null });
  await gm.post({ action: 'start', campaign: KEY, boardId: 'ooc-chat', title: 'Secret', body: 'Another green lantern.', as: null, private: [] });
  const p1 = harness({ user: 'p1' }); p1.deps.store = gm.store;
  const search = async (h, q, extra = {}) => (await h.post({ action: 'view', campaign: KEY, page: { kind: 'search', q, ...extra } }));
  const found = await (await search(p1, 'GREEN lantern')).json();
  assert.deepEqual(found.page.results.map(r => r.title), ['Lanterns']);
  assert.match(found.page.results[0].hits[0].snippet, /green lantern/);
  assert.equal((await (await search(gm, 'green lantern')).json()).page.results.length, 2);
  assert.equal((await (await search(p1, 'lanterns')).json()).page.results[0].hits.length, 0, 'a title match with no post match');
  assert.equal((await (await search(p1, 'green', { boardId: 'tavern-board' })).json()).page.results.length, 0);
  assert.equal((await search(p1, 'g')).status, 400);
  // Notices.
  const settings = { title: '', tagline: '', links: [], banner: true, notices: [{ id: 'n1', text: 'Session on Saturday' }] };
  assert.equal((await p1.post({ action: 'settings', campaign: KEY, settings })).status, 400);
  await gm.post({ action: 'settings', campaign: KEY, settings });
  assert.deepEqual((await (await p1.post({ action: 'view', campaign: KEY, page: { kind: 'index' } })).json()).frame.settings.notices, [{ id: 'n1', text: 'Session on Saturday' }]);
  // Masks through the settings page and the masks action.
  assert.equal((await (await gm.post({ action: 'masks', campaign: KEY, id: 'ooc-chat', masks: { players: { start: 'no' } } })).json()).ok, true);
  const page = (await (await gm.post({ action: 'view', campaign: KEY, page: { kind: 'settings' } })).json()).page;
  assert.deepEqual(page.masks['ooc-chat'], { players: { start: 'no' } });
  assert.deepEqual(page.groups.find(g => g.id === 'players'), { id: 'players', name: 'Players', read: 'yes', start: 'yes', reply: 'yes', gm: false });
  const refused = await p1.post({ action: 'start', campaign: KEY, boardId: 'ooc-chat', title: 'x', body: 'y', as: null });
  assert.match((await refused.json()).error, /can't start topics on this board/);
  const board = (await (await p1.post({ action: 'view', campaign: KEY, page: { kind: 'board', id: 'ooc-chat' } })).json()).page;
  assert.equal(board.board.start, false);
});

// ---- Part 4: dice and combat -------------------------------------------------------------------
/** A die that gives these numbers in turn, then the highest face. */
const dice = (...seq) => sides => seq.length ? Math.min(seq.shift(), sides) : sides;

test('rolls: dice expressions parse, roll, keep highest or lowest, and read "vs" for Hit or Miss', () => {
  assert.ok(D.parseDice('1d20+5'));
  assert.ok(D.parseDice('2d20kh1 - 1d4 + 3'));
  for (const bad of ['', '5', 'd1', '51d6', '1d20+', '1d20 5', '2d6kh3', 'x', '1d20+1d4+1d4+1d4+1d4+1d4+1d4+1d4+1d4+1d4+1d4']) assert.equal(D.parseDice(bad), null, bad);
  const r = D.roll('Attack vs 15', '1d20 + 5', dice(12));
  assert.deepEqual([r.label, r.vs, r.expr, r.total, r.mod, r.dice[0].values], ['Attack', 15, '1d20+5', 17, 5, [12]]);
  const adv = D.roll('', '2d20kh1', dice(3, 18));
  assert.deepEqual([adv.total, adv.dice[0].keep], [18, [false, true]]);
  const dis = D.roll('', '2d20kl1-1d4', dice(3, 18, 2));
  assert.deepEqual([dis.total, dis.dice[1].sign], [1, -1]);
  assert.equal(D.roll('x', 'not dice', dice()), null);
  for (let i = 0; i < 200; i++) { const v = D.secureDie(6); assert.ok(v >= 1 && v <= 6 && Number.isInteger(v)); }
  assert.match(D.rollLine(r), /Attack \(1d20\+5\): 17 — 12 \+ 5, Hit vs 15/);
  assert.match(D.rollLine(dis), /\(18\)/, 'dropped dice in brackets');
});
test('rolls: a post rolls each tag once; an edit keeps unchanged tags and marks new rolls', () => {
  const body = 'I swing. [roll=Attack vs 15]1d20+5[/roll] then [roll]2d6[/roll] and [roll]nope[/roll]';
  const first = D.rollPost(body, dice(10, 3, 4));
  assert.deepEqual(first.map(r => r?.total ?? null), [15, 7, null]);
  const later = new Date('2026-01-02T00:00:00.000Z');
  const edited = D.rollPost('I swing. [roll=attack VS 15]1d20 + 5[/roll] then [roll]3d6[/roll]', dice(1, 1, 1), first, later);
  assert.equal(edited[0], first[0], 'same label and dice keep the old result');
  assert.deepEqual([edited[1].total, edited[1].at, edited.length], [3, later.toISOString(), 2]);
  assert.equal(D.rollPost('[roll]1d6[/roll]'.repeat(20), dice()).length, D.ROLL_LIMIT);
  assert.equal(D.withRollResults('Hit: [roll]1d6[/roll]!', [D.roll('', '1d6', dice(4))]), 'Hit: 🎲 Roll (1d6): 4 — 4!');
  assert.deepEqual(K.postInline('a [roll=Hide]1d20[/roll] *b*').map(p => p.type), ['text', 'roll', 'text', 'italic']);
  assert.equal(K.wordCount('Go [roll=Attack]1d20+5[/roll] now'), 2);
});
test('rolls: start, reply and edit roll on the server; the post keeps them', () => {
  const f0 = withBoards(), body = 'Swing [roll=Attack]1d20[/roll]';
  const c = M.startTopic(f0, { boardId: 'tavern-board', title: 'Fight', body, as: 'hero', rolls: D.rollPost(body, dice(7)) }, poster(f0, 'p1'), ids('t1', 'a1'), NOW);
  assert.equal(c.topic.posts[0].rolls[0].total, 7);
  const f1 = apply(f0, c), later = new Date(NOW.getTime() + 60000);
  const e = M.editPost(f1, c.topic, { postId: 'a1', body: body + ' and [roll]1d4[/roll]', reroll: (old, b) => D.rollPost(b, dice(2), old, later) }, poster(f1, 'p1'), later);
  assert.deepEqual(e.topic.posts[0].rolls.map(r => [r.total, r.at ?? null]), [[7, null], [2, later.toISOString()]]);
  const plain = M.reply(f1, c.topic, { body: 'No dice', as: 'hero' }, poster(f1, 'p1'), 'a2', NOW);
  assert.equal(plain.topic.posts[1].rolls, undefined);
});

const fight = (order, over = {}) => ({ round: 1, turn: 0, order, done: [], at: NOW.toISOString(), ...over });
test('combat: turns end with the right post; group turns need everyone; NPC turns end with the GM; rounds wrap', () => {
  let c = fight([{ name: 'Hero', init: 18, as: ['hero'] }, { name: 'Goblins', init: 12, as: [] }, { name: 'Pair', init: 5, as: ['sidekick', 'villain'] }]);
  assert.equal(C.afterPost(c, 'sidekick', false), c, 'not their turn: nothing moves');
  assert.equal(C.afterPost(c, null, true), c, 'the GM narrating in a character turn moves nothing');
  c = C.afterPost(c, 'hero', false);
  assert.deepEqual([c.turn, c.round, C.turnMeta(c).name], [1, 1, 'Goblins']);
  assert.equal(C.countsFor(c, 'hero', true), null, 'the GM as a character who has a turn of their own does not end an NPC turn');
  assert.equal(C.countsFor(c, 'villain', true), null);
  c = C.afterPost(c, null, true);
  assert.equal(c.turn, 2);
  c = C.afterPost(c, 'villain', true);
  assert.deepEqual([c.turn, c.done], [2, ['villain']], 'a group turn waits for everyone');
  c = C.afterPost(c, 'villain', true);
  assert.deepEqual(c.done, ['villain'], 'posting twice counts once');
  c = C.afterPost(c, 'sidekick', false);
  assert.deepEqual([c.turn, c.round, c.done], [0, 2, []]);
  assert.deepEqual([C.step(c, -1).turn, C.step(c, -1).round], [2, 1]);
  const first = fight([{ name: 'A', init: null, as: [] }]);
  assert.deepEqual([C.step(first, -1).turn, C.step(first, -1).round], [0, 1], 'back stops at the start');
  // NPC turn: the GM posting as an NPC with no turn of their own counts.
  assert.equal(C.countsFor(fight([{ name: 'Goblins', init: 1, as: [] }, { name: 'Hero', init: 0, as: ['hero'] }]), 'villain', true), '*');
  assert.deepEqual(C.cleanOrder([{ name: ' A ', init: 1, as: ['hero', 'ghost', 'hero'] }, { name: 'B', init: null, as: ['hero', 'sidekick'] }], new Set(['hero', 'sidekick'])),
    [{ name: 'A', init: 1, as: ['hero'] }, { name: 'B', init: null, as: ['sidekick'] }]);
});
test('combat: moderators run it; posts carry their turn; the fight moves on as people post', () => {
  let { forum, topic } = seeded();
  const known = new Set(['hero', 'sidekick', 'villain']), order = [{ name: 'Hero', init: 18, as: ['hero'] }, { name: 'Goblins', init: 12, as: [] }];
  assert.throws(() => M.setCombat(forum, { topicId: 't1', op: 'start', order }, poster(forum, 'p1'), known, NOW), /Only moderators/);
  assert.throws(() => M.setCombat(forum, { topicId: 't1', op: 'start', order: [] }, poster(forum, OWNER), known, NOW), /at least one/);
  forum = apply(forum, M.setCombat(forum, { topicId: 't1', op: 'start', order }, poster(forum, OWNER), known, NOW));
  assert.deepEqual([forum.topics[0].combat.round, forum.topics[0].combat.turn], [1, 0]);
  let c = rep(forum, topic, 'p1', { body: 'I strike!' }); forum = apply(forum, c); topic = c.topic;
  assert.deepEqual(topic.posts[1].turn, { round: 1, n: 1, of: 2, name: 'Hero' });
  assert.equal(forum.topics[0].combat.turn, 1);
  const page = topicPage(ctxFor(forum, 'p1'), topic);
  assert.deepEqual(page.combat.order.map(s => [s.name, s.now, s.mine]), [['Hero', false, true], ['Goblins', true, false]]);
  assert.equal(page.topic.next.name, 'Goblins');
  c = rep(forum, topic, OWNER, { body: 'They snarl.', as: null }, 'a3'); forum = apply(forum, c); topic = c.topic;
  assert.deepEqual([forum.topics[0].combat.round, forum.topics[0].combat.turn], [2, 0]);
  forum = apply(forum, M.setCombat(forum, { topicId: 't1', op: 'back' }, poster(forum, OWNER), known, NOW));
  assert.deepEqual([forum.topics[0].combat.round, forum.topics[0].combat.turn], [1, 1]);
  forum = apply(forum, M.setCombat(forum, { topicId: 't1', op: 'end' }, poster(forum, OWNER), known, NOW));
  assert.equal(forum.topics[0].combat, undefined);
  assert.equal(topicPage(ctxFor(forum, 'p1'), topic).posts[1].turn.round, 1, 'posts keep their round after the fight');
  const ooc = M.startTopic(forum, { boardId: 'ooc-chat', title: 'Chat', body: 'hi', as: null }, poster(forum, OWNER), ids('t2', 'b1'), NOW); forum = apply(forum, ooc);
  assert.throws(() => M.setCombat(forum, { topicId: 't2', op: 'start', order }, poster(forum, OWNER), known, NOW), /in-character/);
});
test('combat: a Maptable scene gives the order, with linked characters and without hidden tokens', () => {
  const s = newScene('Bridge');
  s.tokens = [
    { ...newToken('Hero'), id: 'a', initiative: 18, encyclopediaEntryId: 'hero' },
    { ...newToken('Goblin'), id: 'b', initiative: 12, initiativeGroup: 'Goblins' }, { ...newToken('Goblin'), id: 'c', initiative: 9, initiativeGroup: 'Goblins' },
    { ...newToken('Lurker'), id: 'd', initiative: 15, hidden: true },
    { ...newToken('Unrolled'), id: 'e' },
  ];
  s.initiativeState = { round: 3, currentId: 'group:Goblins', order: [] };
  const o = C.orderFromScene(s, new Set(['hero']));
  assert.deepEqual(o.order, [{ name: 'Hero', init: 18, as: ['hero'] }, { name: 'Goblins ×2', init: 12, as: [] }]);
  assert.deepEqual([o.round, o.turn, o.name], [3, 1, 'Bridge']);
  assert.equal(C.orderFromScene(newScene(), new Set()), null);
});
test('request: combat start, turn alerts, rolls by the server and Maptable import', async () => {
  const gm = harness({ user: OWNER });
  gm.deps.random = dice(11, 4);
  const scene = newScene('Bridge'); scene.tokens = [{ ...newToken('Sidekick'), id: 'x', initiative: 9, encyclopediaEntryId: 'sidekick' }];
  gm.deps.scenes = async () => [scene];
  const { id: board } = await (await gm.post({ action: 'addBoard', campaign: KEY, categoryId: 'locations', name: 'Bridge' })).json();
  const { topicId } = await (await gm.post({ action: 'start', campaign: KEY, boardId: board, title: 'Ambush', body: 'Arrows! [roll=Volley vs 12]1d20[/roll]', as: null })).json();
  const p1 = harness({ user: 'p1' }); p1.deps.store = gm.store; p1.deps.random = dice(20);
  const refused = await p1.post({ action: 'combat', campaign: KEY, topicId, op: 'start', order: [{ name: 'Hero', init: 1, as: ['hero'] }] });
  assert.match((await refused.json()).error, /Only moderators/);
  const order = [{ name: 'Hero', init: 15, as: ['hero'] }, { name: 'Sidekick', init: 10, as: ['sidekick'] }];
  assert.equal((await (await gm.post({ action: 'combat', campaign: KEY, topicId, op: 'start', order })).json()).ok, true);
  const alertsOf = async u => { const h = harness({ user: u }); h.deps.store = gm.store; return (await (await h.post({ action: 'view', campaign: KEY, page: { kind: 'index' } })).json()).frame.you.alerts.items; };
  assert.deepEqual((await alertsOf('p1')).map(a => a.kind), ['turn'], 'starting the fight tells whoever goes first');
  await p1.post({ action: 'reply', campaign: KEY, topicId, body: 'I dive in. [roll=Attack]1d20+2[/roll]', as: 'hero' });
  assert.deepEqual((await alertsOf('p2')).map(a => a.kind), ['turn'], 'then the next turn hears');
  const page = (await (await gm.post({ action: 'view', campaign: KEY, page: { kind: 'topic', id: topicId } })).json()).page;
  assert.deepEqual(page.posts.map(p => p.rolls.map(r => r.total)), [[11], [22]]);
  assert.deepEqual(page.posts[1].turn, { round: 1, n: 1, of: 2, name: 'Hero' });
  assert.deepEqual([page.combat.round, page.combat.order[1].now], [1, true]);
  // An edit that leaves the tag alone keeps the roll.
  const pid = page.posts[1].id;
  await p1.post({ action: 'edit', campaign: KEY, topicId, postId: pid, body: 'I leap in. [roll=Attack]1d20+2[/roll]' });
  const again = (await (await gm.post({ action: 'view', campaign: KEY, page: { kind: 'topic', id: topicId } })).json()).page;
  assert.deepEqual([again.posts[1].rolls[0].total, again.posts[1].rolls[0].at], [22, undefined]);
  // Maptable: the paired campaign's scenes with a fight in them, and an order taken from one.
  const ws = structuredClone(workspace); ws.campaigns[0].maptableCampaignId = 'mt1'; gm.deps.workspace = async () => ws;
  const sources = await (await gm.post({ action: 'combatSources', campaign: KEY })).json();
  assert.deepEqual([sources.paired, sources.scenes.map(s => s.name)], [true, ['Bridge']]);
  assert.equal((await (await gm.post({ action: 'combat', campaign: KEY, topicId, op: 'order', sceneId: scene.id })).json()).ok, true);
  const third = (await (await gm.post({ action: 'view', campaign: KEY, page: { kind: 'topic', id: topicId } })).json()).page;
  assert.deepEqual([third.combat.source.name, third.combat.order.map(s => s.name)], ['Bridge', ['Sidekick']]);
  assert.match((await (await gm.post({ action: 'combat', campaign: KEY, topicId, op: 'order', sceneId: 'nope' })).json()).error, /no fight/);
  assert.equal((await p1.post({ action: 'combatSources', campaign: KEY })).status, 400);
});

// ---- Board kind and width ------------------------------------------------------------------------
test('boards: a kind (location, campaign, out of character) and a width, defaulting from the category', () => {
  let f = withBoards();
  const gm = poster(f, OWNER), add = (input, id) => { const c = M.addBoard(f, { categoryId: 'locations', name: id, ...input }, gm, id); f = apply(f, c); return f.boards.find(b => b.id === id); };
  const plain = add({ placeId: 'tavern' }, 'b1');
  assert.deepEqual([plain.type, plain.width, plain.placeId, M.typeOf(f, plain), M.widthOf(f, plain)], [undefined, undefined, 'tavern', 'location', 'full'], 'defaults are left out');
  const story = add({ type: 'campaign', width: 'half', placeId: 'tavern' }, 'b2');
  assert.deepEqual([story.type, story.width, story.placeId, M.kindOf(f, story)], ['campaign', 'half', undefined, 'ic'], 'only a location keeps a place');
  const chat = add({ type: 'ooc' }, 'b3');
  assert.deepEqual([M.kindOf(f, chat), M.widthOf(f, chat)], ['ooc', 'half'], 'out of character is half width unless told');
  assert.throws(() => M.startTopic(f, { boardId: 'b3', title: 'x', body: 'y', as: 'hero' }, poster(f, 'p1'), ids('t9', 'p9'), NOW), /posting as yourself/);
  const ooc = M.addBoard(f, { categoryId: 'ooc', name: 'Story', type: 'campaign', width: 'full' }, gm, 'b4'); f = apply(f, ooc);
  assert.equal(M.kindOf(f, f.boards.find(b => b.id === 'b4')), 'ic', 'a campaign board in an out-of-character category is in character');
  // A board with topics may switch between location and campaign but stays in character.
  f = apply(f, M.startTopic(f, { boardId: 'b1', title: 'Hi', body: 'Hello', as: 'hero' }, poster(f, 'p1'), ids('t1', 'a1'), NOW));
  f = apply(f, M.editBoard(f, { id: 'b1', categoryId: 'locations', name: 'b1', type: 'campaign', width: 'half' }, gm));
  assert.deepEqual([f.boards.find(b => b.id === 'b1').type, f.boards.find(b => b.id === 'b1').width], ['campaign', 'half']);
  assert.throws(() => M.editBoard(f, { id: 'b1', categoryId: 'locations', name: 'b1', type: 'ooc' }, gm), /stays in character or out of character/);
  const rows = frameOf(ctxFor(f, 'p1')).boards;
  assert.deepEqual(rows.filter(r => r.id.startsWith('b')).map(r => [r.id, r.type, r.width]), [['b1', 'campaign', 'half'], ['b2', 'campaign', 'half'], ['b3', 'ooc', 'half'], ['b4', 'campaign', 'full']]);
});

// ---- Part 5: AI help ------------------------------------------------------------------------------
import * as AI from '../lib/forum/ai.ts';
test('ai: who may use what, and prompts carry only forum text with roll results', () => {
  const ai = { connectionId: 'c1', catchUp: 'all', check: 'staff', draft: 'staff' };
  assert.deepEqual(AI.aiFor(ai, { reply: true, moderate: false }), { catchUp: true, check: false, draft: false });
  assert.deepEqual(AI.aiFor(ai, { reply: false, moderate: true }), { catchUp: true, check: true, draft: true });
  assert.deepEqual(AI.aiFor(undefined, { reply: true, moderate: true }), { catchUp: false, check: false, draft: false });
  assert.deepEqual(AI.aiFor({ ...ai, catchUp: 'off', draft: 'off' }, { reply: true, moderate: true }), { catchUp: false, check: true, draft: false });
  const posts = [{ name: 'Hero', player: 'Pat', body: 'I swing [roll=Attack]1d20[/roll] at [[Villain|the lich]].', rolls: [D.roll('Attack', '1d20', dice(7))], at: '2026-01-01T10:00:00.000Z' }];
  const p = AI.summaryPrompt({ title: 'Fight', board: 'Tavern' }, posts, null);
  assert.match(p, /Hero \(played by Pat\)/);
  assert.match(p, /Attack \(1d20\): 7/);
  assert.match(p, /at the lich\./);
  assert.match(AI.summaryPrompt({ title: 'Fight', board: 'Tavern' }, posts, '2026-01-01T09:00:00.000Z'), /only the posts after 2026-01-01 09:00/);
  const long = Array.from({ length: 80 }, (_, i) => ({ name: 'N', body: 'x'.repeat(1000), at: `2026-01-01T10:${String(i % 60).padStart(2, '0')}:00.000Z` }));
  assert.ok(AI.postsText(long).shown < 80 && AI.postsText(long).text.length <= 25_000, 'long topics keep the newest posts');
  assert.deepEqual(AI.readSummary({ summary: ' Things. ', points: ['a', ' ', 'b'] }), { summary: 'Things.', points: ['a', 'b'] });
  assert.equal(AI.readSummary({}), null);
  assert.deepEqual(AI.readCheck({ notes: [{ kind: 'weird', note: 'Hm', quote: '' }] }), [{ kind: 'unclear', note: 'Hm' }]);
  assert.equal(AI.readDraft({ body: '  Rain.  ' }), 'Rain.');
});
test('ai: the campaign owner turns it on with a connection; the banner keeps it; moderators mark AI drafts', () => {
  let f = withBoards();
  const ai = { connectionId: 'c1', catchUp: 'all', check: 'all', draft: 'staff' };
  for (const u of ['co', 'p1']) assert.throws(() => M.setAi(f, ai, poster(f, u), ['c1']), /Only the campaign's GM/, u);
  assert.throws(() => M.setAi(f, ai, poster(f, OWNER), ['c2']), /connection was removed/);
  f = apply(f, M.setAi(f, ai, poster(f, OWNER), ['c1']));
  assert.deepEqual(f.settings.ai, ai);
  f = apply(f, M.setSettings(f, { title: 'T', tagline: '', links: [], banner: false, ai: { connectionId: 'evil', catchUp: 'all', check: 'all', draft: 'staff' } }, poster(f, OWNER)));
  assert.deepEqual([f.settings.title, f.settings.ai], ['T', ai], 'saving the banner keeps the AI settings and ignores any sent with it');
  const mod = M.startTopic(f, { boardId: 'tavern-board', title: 'Rain', body: 'Rain falls.', as: null, ai: true }, poster(f, OWNER), ids('t1', 'a1'), NOW);
  assert.equal(mod.topic.posts[0].ai, true);
  const pl = M.startTopic(f, { boardId: 'tavern-board', title: 'Rain', body: 'Rain falls.', as: 'hero', ai: true }, poster(f, 'p1'), ids('t2', 'a2'), NOW);
  assert.equal(pl.topic.posts[0].ai, undefined, 'only moderators post AI drafts');
  f = apply(f, M.setAi(f, null, poster(f, OWNER), []));
  assert.equal(f.settings.ai, undefined);
});
test('request: AI help sends only what the asker can read, by permission, and counts nothing when off', async () => {
  const gm = harness({ user: OWNER }), asks = [];
  const fakeAi = { connections: async () => [{ id: 'c1', name: 'Claude', model: 'm', used: 0, limit: null }], run: async (_o, _c, conn, a) => { asks.push({ conn, ...a }); return a.tool.name === 'summary' ? { input: { summary: 'They talked.', points: ['Pat owes Quinn'] }, tokens: 10, name: 'Claude' } : a.tool.name === 'check' ? { input: { notes: [{ kind: 'spelling', quote: 'teh', note: 'the' }] }, tokens: 10, name: 'Claude' } : { input: { body: 'Thunder.' }, tokens: 10, name: 'Claude' }; } };
  gm.deps.ai = fakeAi;
  const { topicId } = await (await gm.post({ action: 'start', campaign: KEY, boardId: 'ooc-chat', title: 'Plans', body: 'Saturday?', as: null })).json();
  const p1 = harness({ user: 'p1' }); p1.deps.store = gm.store; p1.deps.ai = fakeAi;
  await p1.post({ action: 'reply', campaign: KEY, topicId, body: 'Yes, Saturday.', as: null });
  assert.match((await (await p1.post({ action: 'ai', campaign: KEY, op: 'summary', topicId })).json()).error, /off in this forum/);
  assert.match((await (await p1.post({ action: 'aiSettings', campaign: KEY, ai: { connectionId: 'c1', catchUp: 'all', check: 'all', draft: 'staff' } })).json()).error, /Only the campaign's GM/);
  const page = (await (await gm.post({ action: 'view', campaign: KEY, page: { kind: 'settings' } })).json()).page;
  assert.deepEqual([page.ai.settings, page.ai.connections.map(c => c.name), page.ai.may], [null, ['Claude'], true]);
  assert.equal((await (await gm.post({ action: 'aiSettings', campaign: KEY, ai: { connectionId: 'c1', catchUp: 'all', check: 'all', draft: 'staff' } })).json()).ok, true);
  const frame = (await (await p1.post({ action: 'view', campaign: KEY, page: { kind: 'index' } })).json()).frame;
  assert.deepEqual(frame.you.ai, { catchUp: true, check: true, draft: false });
  const sum = await (await p1.post({ action: 'ai', campaign: KEY, op: 'summary', topicId })).json();
  assert.deepEqual([sum.summary, sum.points, sum.posts, sum.by], ['They talked.', ['Pat owes Quinn'], 2, 'Claude']);
  assert.match(asks[0].prompt, /Saturday\?[\s\S]*Yes, Saturday\./);
  assert.equal(asks[0].conn, 'c1');
  const caught = await (await p1.post({ action: 'ai', campaign: KEY, op: 'catchUp', topicId, since: new Date(NOW.getTime() + 60_000).toISOString() })).json();
  assert.equal(caught.summary, 'Nothing new since you last read it.', 'no AI call when nothing is new');
  assert.equal(asks.length, 1);
  const check = await (await p1.post({ action: 'ai', campaign: KEY, op: 'check', topicId, body: 'See you at teh tavern', as: null })).json();
  assert.deepEqual(check.notes, [{ kind: 'spelling', quote: 'teh', note: 'the' }]);
  assert.match((await (await p1.post({ action: 'ai', campaign: KEY, op: 'draft', topicId, as: null })).json()).error, /can't use that/);
  const drafted = await (await gm.post({ action: 'ai', campaign: KEY, op: 'draft', boardId: 'ooc-chat', title: 'New', hint: 'storm' })).json();
  assert.equal(drafted.body, 'Thunder.');
  assert.match(asks.at(-1).prompt, /What the GM wants: storm/);
  // A private topic Pat isn't in can't be summarized by Pat.
  const { topicId: secret } = await (await gm.post({ action: 'start', campaign: KEY, boardId: 'ooc-chat', title: 'Secret', body: 'Shh.', as: null, private: [] })).json();
  assert.match((await (await p1.post({ action: 'ai', campaign: KEY, op: 'summary', topicId: secret })).json()).error, /removed/);
  const posted = await (await gm.post({ action: 'reply', campaign: KEY, topicId, body: 'Thunder.', as: null, ai: true })).json();
  assert.equal(posted.ok, true);
  const t = (await (await p1.post({ action: 'view', campaign: KEY, page: { kind: 'topic', id: topicId } })).json()).page;
  assert.deepEqual(t.posts.map(p => p.ai), [false, false, true]);
});

test('mcp: AI apps read the forum as the GM or as players, post only for the GM, and suggested posts wait for a GM', async () => {
  const gm = harness({ user: OWNER });
  gm.store.bucket.data.set(forumKey(OWNER, 'camp'), { text: JSON.stringify(withBoards()), etag: '0' });
  const { topicId } = await (await gm.post({ action: 'start', campaign: KEY, boardId: 'tavern-board', title: 'Night at the Tavern', body: 'The fire crackles.', as: null })).json();
  const p1 = harness({ user: 'p1' }); p1.deps.store = gm.store;
  await p1.post({ action: 'reply', campaign: KEY, topicId, body: 'I order an ale.', as: 'hero' });
  await gm.post({ action: 'start', campaign: KEY, boardId: 'ooc-chat', title: 'GM notes', body: 'Shh.', as: null, private: [] });
  const logs = []; let n = 0;
  const mk = gmView => forumMcp({ store: gm.store, members: async () => list(), owner: OWNER, campaignId: 'camp', workspace, gm: gmView, connection: 'Claude', log: async (tool, s) => { logs.push([tool, s]); }, now: () => NOW, newId: () => 'm' + ++n, random: () => 4 });
  const f = mk(true), players = mk(false);
  const boards = await f.boards();
  assert.deepEqual(boards.categories.map(c => [c.name, c.boards.map(b => [b.name, b.kind, b.place ?? null, b.topics])]), [['Locations', [['Tavern', 'location (in character)', 'Tavern', 1]]], ['Out of character', [['General chat', 'out of character', null, 1]]]]);
  assert.deepEqual((await f.topics({})).topics.map(t => t.title).sort(), ['GM notes', 'Night at the Tavern']);
  assert.deepEqual((await players.topics({})).topics.map(t => t.title), ['Night at the Tavern'], 'a players-only connection never sees a private topic');
  await assert.rejects(players.read({ topic: 'GM notes' }), /No topic called/);
  const turns = await f.turns();
  assert.deepEqual(turns.gmTurn.map(t => [t.title, t.next]), [['Night at the Tavern', 'the Game Master']]);
  const read = await f.read({ topic: 'night' });
  assert.deepEqual(read.posts.map(p => [p.number, p.name, p.player, p.body]), [[1, 'Game Master', 'Gamemaster', 'The fire crackles.'], [2, 'Hero', 'Pat', 'I order an ale.']]);
  assert.match(read.next, /the GM's turn/);
  // Never as a player's character, and never in character on an out of character board.
  await assert.rejects(f.post({ topic: 'night', body: 'Hero draws a sword.', as: 'Hero' }, 'do'), /played by a player/);
  await assert.rejects(f.post({ topic: 'GM notes', body: 'Hm.', as: 'Villain' }, 'do'), /out of character/);
  const done = await f.post({ topic: 'night', body: 'The door bangs open. [roll=Perception]1d20[/roll]', as: 'Villain' }, 'do');
  assert.deepEqual([done.posted, done.as, done.rolls.length], [true, 'Villain', 1]);
  // Ask me: the post waits in the topic, for the GMs only.
  const ask = await f.post({ topic: 'night', body: 'A storm rolls in.' }, 'ask');
  assert.equal(ask.waitingForGM, true);
  const view = async (h) => (await (await h.post({ action: 'view', campaign: KEY, page: { kind: 'topic', id: topicId } })).json()).page;
  let page = await view(gm);
  assert.deepEqual(page.posts.map(p => [p.as, p.ai]), [[null, false], ['hero', false], ['villain', true]]);
  assert.deepEqual(page.suggested.map(s => [s.name, s.body, s.connection]), [['Game Master', 'A storm rolls in.', 'Claude']]);
  assert.equal(page.topic.suggested, 1);
  const theirs = await view(p1);
  assert.deepEqual([theirs.suggested, theirs.topic.suggested], [[], 0]);
  assert.match((await (await p1.post({ action: 'suggestion', campaign: KEY, topicId, suggestionId: ask.suggestion, op: 'approve' })).json()).error, /Only the GM and co-GMs/);
  assert.equal((await (await gm.post({ action: 'suggestion', campaign: KEY, topicId, suggestionId: ask.suggestion, op: 'approve', body: 'A storm rolls in fast.' })).json()).ok, true);
  page = await view(gm);
  assert.deepEqual([page.posts.at(-1).body, page.posts.at(-1).ai, page.posts.at(-1).as, page.suggested.length, page.topic.suggested], ['A storm rolls in fast.', true, null, 0, 0]);
  assert.match((await (await gm.post({ action: 'suggestion', campaign: KEY, topicId, suggestionId: ask.suggestion, op: 'approve' })).json()).error, /already answered/);
  const rats = await f.post({ topic: 'night', body: 'Rats.' }, 'ask');
  assert.equal((await (await gm.post({ action: 'suggestion', campaign: KEY, topicId, suggestionId: rats.suggestion, op: 'skip' })).json()).ok, true);
  page = await view(gm);
  assert.deepEqual([page.posts.length, page.suggested.length], [4, 0]);
  const started = await f.start({ board: 'tavern', title: 'Market day', body: 'Stalls open.', as: 'Villain' });
  assert.deepEqual([started.started, started.board], [true, 'Tavern']);
  assert.deepEqual(logs.map(l => l[0]), ['post_to_forum', 'post_to_forum', 'post_to_forum', 'start_topic']);
  assert.match(logs[1][1], /Suggested a post as narration/);
});

test('mcp: forum tools follow the connection\'s Post in the forum setting', async () => {
  const rest = p => { const { forumPosts: _, ...x } = p; return x; };
  assert.equal(fillPerms(rest(presets.gm)).forumPosts, 'do');
  assert.equal(fillPerms(rest(presets.helper)).forumPosts, 'ask');
  assert.equal(fillPerms(rest(presets.read)).forumPosts, 'off');
  const calls = [], suggested = [];
  const forum = {
    post: async (a, mode) => { calls.push(['post', a, mode]); if (a.topic === 'gone') throw new M.ForumError('That topic was removed.'); return { posted: mode === 'do' }; },
    start: async a => { calls.push(['start', a]); return { started: true }; },
    read: async a => ({ title: a.topic }), boards: async () => ({}), topics: async () => ({}), turns: async () => ({}),
  };
  const c = { book: workspace, campaign: workspace.campaigns[0], maps: null, level: 'assist', perms: { ...presets.helper }, forum, suggest: async s => { suggested.push(s); return 'sug1'; }, commit: async () => ({}) };
  const text = r => r.content[0].text;
  let r = await callTool(c, 'post_to_forum', { topic: 'Night', body: 'Hi' });
  assert.deepEqual(calls.at(-1), ['post', { topic: 'Night', body: 'Hi', as: undefined }, 'ask']);
  r = await callTool(c, 'start_topic', { board: 'Tavern', title: 'Market', body: 'Stalls.' });
  assert.match(text(r), /waitingForGM/);
  assert.deepEqual([calls.length, suggested[0].tool, suggested[0].summary], [1, 'start_topic', 'Start “Market” on Tavern']);
  await callTool(c, 'start_topic', { board: 'Tavern', title: 'Market', body: 'Stalls.' }, { approved: true });
  assert.equal(calls.at(-1)[0], 'start');
  await callTool({ ...c, perms: { ...presets.gm }, level: 'run' }, 'post_to_forum', { topic: 'Night', body: 'Hi', as: 'Villain' });
  assert.equal(calls.at(-1)[2], 'do');
  r = await callTool({ ...c, perms: { ...presets.gm }, level: 'run' }, 'post_to_forum', { topic: 'gone', body: 'Hi' });
  assert.deepEqual([r.isError, text(r)], [true, 'That topic was removed.']);
  assert.match(text(await callTool({ ...c, perms: { ...presets.helper, forumPosts: 'off' } }, 'post_to_forum', { topic: 'Night', body: 'Hi' })), /turned off/);
  assert.match(text(await callTool({ ...c, paused: true }, 'post_to_forum', { topic: 'Night', body: 'Hi' })), /paused/);
  assert.match(text(await callTool({ ...c, level: 'read', perms: presets.read }, 'post_to_forum', { topic: 'Night', body: 'Hi' })), /needs Assist/);
  assert.match(text(await callTool({ ...c, level: 'read', perms: presets.read }, 'read_topic', { topic: 'Night' })), /"title":"Night"/);
  assert.match(text(await callTool({ ...c, forum: undefined }, 'whose_turn', {})), /can't reach the campaign's forum/);
});

test('reports: readers report other people\'s posts; moderators see the reasons, hear about it and dismiss them', async () => {
  const gm = harness({ user: OWNER });
  gm.store.bucket.data.set(forumKey(OWNER, 'camp'), { text: JSON.stringify(withBoards()), etag: '0' });
  const as = u => { const h = harness({ user: u }); h.deps.store = gm.store; return h; };
  const p1 = as('p1'), p2 = as('p2'), co = as('co');
  const { topicId } = await (await gm.post({ action: 'start', campaign: KEY, boardId: 'tavern-board', title: 'Night', body: 'The fire crackles.', as: null })).json();
  const { postId } = await (await p1.post({ action: 'reply', campaign: KEY, topicId, body: 'Something rude.', as: 'hero' })).json();
  const json = async r => (await r).json();
  assert.match((await json(p1.post({ action: 'report', campaign: KEY, topicId, postId, reason: 'Oops' }))).error, /your own post/);
  assert.match((await json(p2.post({ action: 'report', campaign: KEY, topicId, postId, reason: '   ' }))).error, /Say what's wrong/);
  assert.equal((await json(p2.post({ action: 'report', campaign: KEY, topicId, postId, reason: 'Out of line\nfor this table' }))).ok, true);
  assert.equal((await json(p2.post({ action: 'report', campaign: KEY, topicId, postId, reason: 'Out of line for this table' }))).ok, true, 'reporting again replaces the reason');
  const view = async (h, page) => (await json(h.post({ action: 'view', campaign: KEY, page }))).page;
  const theirs = (await view(p2, { kind: 'topic', id: topicId })).posts[1];
  assert.deepEqual([theirs.reported, theirs.reports, theirs.canReport], [true, [], true]);
  assert.equal((await view(p1, { kind: 'topic', id: topicId })).posts[1].canReport, false);
  const mod = (await view(gm, { kind: 'topic', id: topicId })).posts[1];
  assert.deepEqual(mod.reports.map(r => [r.by, r.reason]), [['Quinn', 'Out of line for this table']]);
  const frame = (await json(co.post({ action: 'view', campaign: KEY, page: { kind: 'index' } }))).frame;
  assert.equal(frame.footer.stats.reported, 1);
  assert.deepEqual(frame.you.alerts.items.map(a => [a.kind, a.name, a.title]), [['report', 'Quinn', 'Night']]);
  assert.equal((await json(p2.post({ action: 'view', campaign: KEY, page: { kind: 'index' } }))).frame.footer.stats.reported, 0);
  assert.equal((await p1.post({ action: 'view', campaign: KEY, page: { kind: 'reports' } })).status, 403);
  const page = await view(gm, { kind: 'reports' });
  assert.deepEqual(page.posts.map(p => [p.name, p.player, p.number, p.snippet, p.reports.length]), [['Hero', 'Pat', 2, 'Something rude.', 1]]);
  assert.match((await json(p2.post({ action: 'dismissReports', campaign: KEY, postId }))).error, /Only moderators/);
  assert.equal((await json(co.post({ action: 'dismissReports', campaign: KEY, postId }))).ok, true);
  assert.deepEqual((await view(gm, { kind: 'reports' })).posts, []);
  assert.match((await json(co.post({ action: 'dismissReports', campaign: KEY, postId }))).error, /already dismissed/);
});

test('markup: pictures by id and the campaign\'s :emoji:, not times or words', () => {
  const id = '0b3c2f1e-1111-4222-8333-444455556666';
  assert.deepEqual(K.postInline(`Hi :gull: at 10:30:45 [img=A gull]${id}[/img] x:no:`).filter(p => p.type !== 'text'), [{ type: 'emoji', code: 'gull' }, { type: 'picture', id, alt: 'A gull' }]);
  assert.deepEqual(K.pictureIds(`[img]${id.toUpperCase()}[/img] [img]nope[/img]`), [id]);
  assert.deepEqual(K.emojiCodes(':a: :gull: :ok_1: :9lives:'), ['gull', 'ok_1']);
  assert.equal(K.wordCount(`two :gull: words [img]${id}[/img]`), 2);
});

test('pictures and emoji: stored through the forum, by permission; posts show only the forum\'s pictures', async () => {
  const gm = harness({ user: OWNER }), saved = [];
  gm.store.bucket.data.set(forumKey(OWNER, 'camp'), { text: JSON.stringify(withBoards()), etag: '0' });
  let n = 0;
  const savePicture = async (owner, uploader, transferId, max) => { saved.push([owner, uploader, max]); return `00000000-0000-4000-8000-00000000000${++n}`; };
  const as = u => { const h = harness({ user: u }); h.deps.store = gm.store; h.deps.savePicture = savePicture; return h; };
  gm.deps.savePicture = savePicture;
  const p1 = as('p1'), g1 = as('g1'), co = as('co');
  const json = async r => (await r).json();
  const T = '11111111-2222-4333-8444-555555555555';
  const { topicId } = await json(gm.post({ action: 'start', campaign: KEY, boardId: 'ooc-chat', title: 'Pics', body: 'Show me.', as: null }));
  // Guests can't add pictures; players can, stored with the GM's pictures.
  assert.match((await json(g1.post({ action: 'upload', campaign: KEY, transferId: T, kind: 'post' }))).error, /can't add pictures/);
  assert.match((await json(p1.post({ action: 'upload', campaign: KEY, transferId: T, kind: 'emoji' }))).error, /arrange the forum can add emoji/);
  const pic = (await json(p1.post({ action: 'upload', campaign: KEY, transferId: T, kind: 'post' }))).id;
  assert.deepEqual(saved, [[OWNER, 'p1', M.PICTURE_BYTES]]);
  // A post may show it; a made-up id is refused.
  assert.equal((await json(p1.post({ action: 'reply', campaign: KEY, topicId, body: `Look [img=The harbour]${pic}[/img]`, as: null }))).ok, true);
  assert.match((await json(p1.post({ action: 'reply', campaign: KEY, topicId, body: `[img]${T}[/img]`, as: null }))).error, /isn't in this forum/);
  const pics = (await json(p1.post({ action: 'view', campaign: KEY, page: { kind: 'pictures' } }))).page;
  assert.deepEqual(pics.pictures.map(p => [p.id, p.mine]), [[pic, true]]);
  assert.equal((await g1.post({ action: 'view', campaign: KEY, page: { kind: 'pictures' } })).status, 403);
  // Everyone who reads the forum may load it.
  const load = (h, id) => handleForumImage(new Request(`https://x.test/api/forum?c=${KEY}&image=${id}`), h.deps);
  assert.equal((await load(g1, pic)).status, 303);
  assert.equal((await load(g1, T)).status, 404);
  // Emoji: those who arrange boards add them (256 KB at most) and say who may use them.
  const e1 = (await json(co.post({ action: 'upload', campaign: KEY, transferId: T, kind: 'emoji' }))).id;
  assert.equal(saved.at(-1)[2], M.EMOJI_BYTES);
  assert.match((await json(co.post({ action: 'emoji', campaign: KEY, emoji: { use: 'all', list: [{ code: 'Gull', imageId: e1 }] } }))).error, /lowercase/);
  assert.match((await json(co.post({ action: 'emoji', campaign: KEY, emoji: { use: 'all', list: [{ code: 'gull', imageId: pic }] } }))).error, /removed/);
  assert.match((await json(co.post({ action: 'emoji', campaign: KEY, emoji: { use: 'all', list: [{ code: 'gull', imageId: e1 }, { code: 'gull', imageId: e1 }] } }))).error, /Two emoji/);
  assert.match((await json(p1.post({ action: 'emoji', campaign: KEY, emoji: { use: 'all', list: [] } }))).error, /can't change the boards/);
  assert.equal((await json(co.post({ action: 'emoji', campaign: KEY, emoji: { use: 'staff', list: [{ code: 'gull', imageId: e1, set: 'Birds' }] } }))).ok, true);
  const frame = (await json(p1.post({ action: 'view', campaign: KEY, page: { kind: 'index' } }))).frame;
  assert.deepEqual(frame.emoji, { list: [{ code: 'gull', imageId: e1, set: 'Birds' }], may: false });
  assert.equal((await load(g1, e1)).status, 303);
  assert.match((await json(p1.post({ action: 'reply', campaign: KEY, topicId, body: 'Hi :gull:', as: null }))).error, /Only moderators can use the campaign's emoji/);
  assert.equal((await json(p1.post({ action: 'reply', campaign: KEY, topicId, body: 'Hi :wave: (not ours)', as: null }))).ok, true);
  assert.equal((await json(co.post({ action: 'reply', campaign: KEY, topicId, body: 'Hi :gull:', as: null }))).ok, true);
  assert.equal((await json(co.post({ action: 'view', campaign: KEY, page: { kind: 'index' } }))).frame.emoji.may, true);
  // Turned off, nobody gets them, and posts show the codes as text.
  await json(co.post({ action: 'emoji', campaign: KEY, emoji: { use: 'off', list: [{ code: 'gull', imageId: e1 }] } }));
  assert.deepEqual((await json(co.post({ action: 'view', campaign: KEY, page: { kind: 'index' } }))).frame.emoji, { list: [], may: false });
});

// ---- Writing extras: BBCode, links, features and spells, topic tags, @tags, Maptable maps ----------------
test('markup: BBCode turns into the forum markup, code stays as typed, and only https links become links', () => {
  assert.equal(K.fromBbcode('[b]Bold[/b], [i]it[/i], [u]u[/u] and [s]gone[/s]'), '**Bold**, *it*, __u__ and ~~gone~~');
  assert.equal(K.fromBbcode('[quote=Ann]Run.\nNow.[/quote]'), '\n> Run.\n> Now.\n> — Ann\n');
  assert.equal(K.fromBbcode('[code][b]x[/b][/code]'), '\n```\n[b]x[/b]\n```\n');
  assert.equal(K.fromBbcode('[url=https://a.test/x]A site[/url] [url=javascript:alert(1)]bad[/url]'), '[A site](https://a.test/x) [url=javascript:alert(1)]bad[/url]');
  assert.equal(K.fromBbcode('[list][*]One[*]Two[/list]'), '\n- One\n- Two\n');
  assert.equal(K.fromBbcode('[spoiler=Map]Here[/spoiler] [color=red]red[/color] [size=5]big[/size]'), '\n[collapse=Map]\nHere\n[/collapse]\n red big');
  assert.equal(K.postBlocks('[spoiler=Map]Here[/spoiler]').find(b => b.type === 'collapse').title, 'Map');
  const parts = K.postInline('~~gone~~ [site](https://a.test) [x](javascript:alert(1)) [feature=hero/song]Song[/feature] [spell=hero/fire]Firebolt[/spell] [feature=hero/a]Bad[/spell]');
  assert.deepEqual(parts.filter(p => p.type !== 'text'), [
    { type: 'strike', text: 'gone' }, { type: 'url', label: 'site', href: 'https://a.test' },
    { type: 'feature', kind: 'feature', char: 'hero', id: 'song', name: 'Song' }, { type: 'feature', kind: 'spell', char: 'hero', id: 'fire', name: 'Firebolt' },
  ]);
  assert.ok(parts.some(p => p.type === 'text' && p.text.includes('javascript:')), 'a javascript: link stays text');
  assert.deepEqual(K.featureRefs('[feature=hero/song]Song[/feature] [spell=hero/fire]Firebolt[/spell] [feature=hero/a]Bad[/spell]'), ['feature:hero:song', 'spell:hero:fire']);
  assert.equal(K.wordCount('[b]Two words[/b] [url=https://a.test/long/path]link[/url]'), 3);
  // Forum settings choose which one the toolbar writes; both always read.
  let f = withBoards();
  f = apply(f, M.setSettings(f, { ...f.settings, markup: 'bbcode' }, poster(f, OWNER)));
  assert.equal(frameOf(ctxFor(f, 'p1')).settings.markup, 'bbcode');
  assert.equal(frameOf(ctxFor(withBoards(), 'p1')).settings.markup, 'markdown');
});

const sheetWorkspace = () => {
  const ws = structuredClone(workspace), hero = ws.entries.find(e => e.id === 'hero');
  hero.character.features = [{ id: 'song', name: 'Song of Rest', group: 'Bard', text: 'Heal 1d6.' }, { id: 'spy', name: 'Spy training', gm: true }];
  hero.character.featuresVisibility = 'gm';
  hero.character.spells = [{ id: 'fire', name: 'Firebolt', details: { Level: '0' }, text: '1d10 fire.' }];
  hero.character.spellsVisibility = 'players';
  return workspaceSchema.parse(ws);
};
test('features and spells: a post shows only what each reader may see on the sheet', async () => {
  const ws = sheetWorkspace(), gm = harness({ user: OWNER });
  gm.store.bucket.data.set(forumKey(OWNER, 'camp'), { text: JSON.stringify(withBoards()), etag: '0' });
  const as = u => { const h = harness({ user: u }); h.deps.store = gm.store; h.deps.workspace = async () => ws; return h; };
  gm.deps.workspace = async () => ws;
  const p1 = as('p1'), p2 = as('p2'), json = async r => (await r).json();
  // The sheet of a character you post as: your own features (not GM-only ones) and spells.
  const sheet = (await json(p1.post({ action: 'view', campaign: KEY, page: { kind: 'sheet', id: 'hero' } }))).page;
  assert.deepEqual([sheet.name, sheet.features.map(x => x.name), sheet.spells.map(x => [x.name, x.note])], ['Hero', ['Song of Rest'], [['Firebolt', 'Level: 0']]]);
  assert.equal((await p2.post({ action: 'view', campaign: KEY, page: { kind: 'sheet', id: 'hero' } })).status, 403);
  assert.deepEqual((await json(gm.post({ action: 'view', campaign: KEY, page: { kind: 'sheet', id: 'hero' } }))).page.features.map(x => x.id), ['song', 'spy']);
  const body = 'I sing [feature=hero/song]Song of Rest[/feature], cast [spell=hero/fire]Firebolt[/spell] and hide [feature=hero/spy]Spy training[/feature].';
  const { topicId } = await json(p1.post({ action: 'start', campaign: KEY, boardId: 'tavern-board', title: 'Rest', body, as: 'hero' }));
  const page = u => json(u.post({ action: 'view', campaign: KEY, page: { kind: 'topic', id: topicId } }));
  // The player who plays Hero sees the features; Quinn only the shared spells; the GM all of it.
  assert.deepEqual(Object.keys((await page(p1)).page.features).sort(), ['feature:hero:song', 'spell:hero:fire']);
  assert.deepEqual(Object.keys((await page(p2)).page.features), ['spell:hero:fire']);
  assert.equal((await page(p2)).page.features['spell:hero:fire'].text, '1d10 fire.');
  assert.deepEqual(Object.keys((await page(gm)).page.features).sort(), ['feature:hero:song', 'feature:hero:spy', 'spell:hero:fire']);
});

test('topic tags: the forum\'s preset tags, up to three on a topic, set by its starter or a moderator', () => {
  let f = withBoards();
  const tags = [{ id: 'open', label: 'Open', color: 'green' }, { id: 'mature', label: 'Mature', color: 'red' }, { id: 'plot', label: 'Main plot', color: 'gold' }, { id: 'side', label: 'Side', color: 'grey' }];
  assert.throws(() => M.setTopicTags(f, tags, poster(f, 'p1')), /can't change the boards/);
  assert.throws(() => M.setTopicTags(f, [...tags, { id: 'x', label: 'open', color: 'blue' }], poster(f, OWNER)), /same name/);
  assert.throws(() => M.setTopicTags(f, [{ id: 'x', label: 'Pink', color: 'pink' }], poster(f, OWNER)), /24 characters/);
  f = apply(f, M.setTopicTags(f, tags, poster(f, OWNER)));
  assert.throws(() => M.startTopic(f, { boardId: 'tavern-board', title: 'Hi', body: 'Yo', as: 'hero', tags: ['nope'] }, poster(f, 'p1'), ids('t0', 'a0'), NOW), /tag was removed/);
  assert.throws(() => M.startTopic(f, { boardId: 'tavern-board', title: 'Hi', body: 'Yo', as: 'hero', tags: ['open', 'mature', 'plot', 'side'] }, poster(f, 'p1'), ids('t0', 'a0'), NOW), /up to 3 tags/);
  const c = M.startTopic(f, { boardId: 'tavern-board', title: 'Hi', body: 'Yo', as: 'hero', tags: ['mature', 'open'] }, poster(f, 'p1'), ids('t1', 'a1'), NOW);
  f = apply(f, c);
  // Rows and the topic show them in the forum's order, with their colours.
  const row = () => activePage(ctxFor(f, 'p2')).topics[0].tags;
  assert.deepEqual(row(), [{ id: 'open', label: 'Open', color: 'green' }, { id: 'mature', label: 'Mature', color: 'red' }]);
  assert.deepEqual(frameOf(ctxFor(f, 'p2')).topicTags.map(t => t.label), ['Open', 'Mature', 'Main plot', 'Side']);
  // Another player can't change them; the starter and moderators can.
  assert.throws(() => M.setTopic(f, c.topic, { topicId: 't1', tags: [] }, poster(f, 'p2')), /started it or a moderator/);
  f = apply(f, M.setTopic(f, c.topic, { topicId: 't1', tags: ['plot'] }, poster(f, 'p1')));
  assert.deepEqual(row().map(t => t.id), ['plot']);
  f = apply(f, M.setTopic(f, c.topic, { topicId: 't1', tags: ['plot', 'side'] }, poster(f, 'co')));
  // Removing a tag takes it off every topic.
  f = apply(f, M.setTopicTags(f, tags.filter(t => t.id !== 'plot'), poster(f, OWNER)));
  assert.deepEqual([row().map(t => t.id), f.topics[0].tags], [['side'], ['side']]);
  f = apply(f, M.setTopicTags(f, [], poster(f, OWNER)));
  assert.deepEqual([row(), 'tags' in f.topics[0]], [[], false]);
});

test('@tags: the Tag picker lists characters players may read, then members who read the forum', () => {
  const f = withBoards(), names = u => frameOf(ctxFor(f, u)).mentionable;
  assert.deepEqual(names('p1'), [{ name: 'Hero', character: true }, { name: 'Sidekick', character: true }, { name: 'Gamemaster', character: false }, { name: 'Pat', character: false }, { name: 'Quinn', character: false }, { name: 'Gus', character: false }, { name: 'Casey', character: false }]);
  assert.ok(!names(OWNER).some(m => m.name === 'Villain'), 'NPCs are not tagged');
});

test('maps from Maptable: the GM puts a scene in a post as a picture players may see', async () => {
  const gm = harness({ user: OWNER }), drawn = [];
  gm.store.bucket.data.set(forumKey(OWNER, 'camp'), { text: JSON.stringify(withBoards()), etag: '0' });
  const json = async r => (await r).json(), scene = newScene('Bridge');
  const p1 = harness({ user: 'p1' }); p1.deps.store = gm.store;
  assert.deepEqual(await json(gm.post({ action: 'mapScenes', campaign: KEY })), { ok: true, paired: false, scenes: [] });
  const ws = structuredClone(workspace); ws.campaigns[0].maptableCampaignId = 'mt1';
  Object.assign(gm.deps, { workspace: async () => ws, scenes: async () => [scene], mapPicture: async (owner, mt, id) => { drawn.push([owner, mt, id]); return '00000000-0000-4000-8000-0000000000aa'; } });
  assert.deepEqual(await json(gm.post({ action: 'mapScenes', campaign: KEY })), { ok: true, paired: true, scenes: [{ id: scene.id, name: 'Bridge' }] });
  const out = await json(gm.post({ action: 'map', campaign: KEY, sceneId: scene.id }));
  assert.deepEqual([out.id, out.name, drawn], ['00000000-0000-4000-8000-0000000000aa', 'Bridge', [[OWNER, 'mt1', scene.id]]]);
  assert.match((await json(gm.post({ action: 'map', campaign: KEY, sceneId: 'gone' }))).error, /isn't in the paired/);
  // Players can't, and the stored map works in a post like any forum picture.
  assert.match((await json(p1.post({ action: 'mapScenes', campaign: KEY }))).error, /Only the GM/);
  assert.match((await json(p1.post({ action: 'map', campaign: KEY, sceneId: scene.id }))).error, /Only the GM/);
  const { topicId } = await json(gm.post({ action: 'start', campaign: KEY, boardId: 'ooc-chat', title: 'Map', body: `The bridge: [img=Map: Bridge]${out.id}[/img]`, as: null }));
  assert.ok(topicId);
  assert.equal((await handleForumImage(new Request(`https://x.test/api/forum?c=${KEY}&image=${out.id}`), p1.deps)).status, 303);
});
