// Long topics and big forums: no limit on topics or posts, kept in page and index files (lib/forum/pages.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceSchema } from '../lib/encyclopedia/world-model.ts';
import { emptyMemberList } from '../lib/members.ts';
import * as M from '../lib/forum/model.ts';
import * as P from '../lib/forum/pages.ts';
import { ForumStore, forumKey, forumV1Key, topicKey } from '../lib/forum/store.ts';
import { handleForum, resetForumThrottles } from '../lib/forum/request.ts';
import { FILE_PATH, forumSetupOnly, topicPageFiles } from '../lib/campaign-backup.ts';

class Bucket {
  data = new Map(); n = 0; beforePut = null; gets = 0;
  async get(key) { this.gets++; const v = this.data.get(key); return v ? { etag: v.etag, json: async () => JSON.parse(v.text), arrayBuffer: async () => new TextEncoder().encode(v.text).buffer } : null; }
  async head(key) { return this.data.has(key) ? { etag: this.data.get(key).etag } : null; }
  async put(key, body, options = {}) {
    if (this.beforePut?.key === key) { const h = this.beforePut.run; this.beforePut = null; await h(); }
    const old = this.data.get(key);
    if (options.onlyIf?.etagMatches && old?.etag !== options.onlyIf.etagMatches) return null;
    if (options.onlyIf?.etagDoesNotMatch === '*' && old) return null;
    const text = typeof body === 'string' ? body : new TextDecoder().decode(body);
    const etag = String(++this.n); this.data.set(key, { text, etag }); return { etag };
  }
  async delete(key) { this.data.delete(key); }
  keys(part) { return [...this.data.keys()].filter(k => k.includes(part)); }
}

const OWNER = 'gm', C = 'camp', NOW = new Date('2026-01-01T12:00:00.000Z');
const workspace = workspaceSchema.parse({
  schemaVersion: 1, worlds: [{ id: 'w1', name: 'World', description: '', archived: false }],
  campaigns: [{ id: 'camp', worldId: 'w1', name: 'Test Campaign', description: '', github: { repository: '', branch: 'main' }, statFields: [] }], entries: [],
});
const list = () => {
  const l = emptyMemberList('camp', 'Gamemaster');
  l.members = [{ userId: 'p1', name: 'Pat', groups: ['players'], joinedAt: NOW.toISOString() }, { userId: 'p2', name: 'Quinn', groups: ['players'], joinedAt: NOW.toISOString() }];
  return l;
};
const who = userId => ({ userId, rights: M.forumRights(list(), userId, OWNER), cast: new Set() });
const at = i => new Date(NOW.getTime() + i * 60_000);
const start = store => store.apply(OWNER, C, null, f => M.startTopic(f, { boardId: 'ooc-chat', title: 'Long chat', body: 'Post 1', as: null }, who('p1'), { topic: 't1', post: 'p-0' }, at(0)));
const reply = (store, i, user = i % 2 ? 'p2' : 'p1', topic = 't1') => store.apply(OWNER, C, topic, (f, t) => M.reply(f, t, { body: `Post ${i + 1}`, as: null }, who(user), `p-${i}`, at(i)));
async function longTopic(posts) {
  const bucket = new Bucket(), store = new ForumStore(bucket);
  await store.create(OWNER, C);
  await start(store);
  for (let i = 1; i < posts; i++) await reply(store, i);
  return { bucket, store };
}
const allPosts = async (store, id = 't1') => store.withTopic(OWNER, C, id, t => store.readPosts(OWNER, C, t, 0, M.postTotal(t)));

test('a long topic has no post limit: older posts go into pages, the topic file keeps the latest', async () => {
  const { bucket, store } = await longTopic(1700);
  const { topic } = await store.readTopic(OWNER, C, 't1');
  assert.equal(topic.schemaVersion, 2);
  assert.ok(topic.pages.length >= 15, 'pages of older posts');
  assert.ok(topic.posts.length >= 1 && topic.posts.length <= P.TAIL_POSTS, 'the topic file keeps only the latest posts');
  assert.equal(M.postTotal(topic), 1700);
  const posts = await allPosts(store);
  assert.deepEqual(posts.map(p => p.id), Array.from({ length: 1700 }, (_, i) => `p-${i}`), 'every post, in order');
  const { forum } = await store.read(OWNER, C), s = forum.topics[0];
  assert.equal(s.replies, 1699);
  assert.equal(s.by.userId, 'p1');
  assert.equal(s.at, at(0).toISOString());
  assert.equal(s.lastAt, at(1699).toISOString());
  assert.deepEqual(forum.counts, { p1: 850, p2: 850 });
  assert.equal(bucket.keys('/topics/t1/').length, topic.pages.length, 'no stray page files');
  // A range across a page boundary.
  const mid = await store.withTopic(OWNER, C, 't1', t => store.readPosts(OWNER, C, t, 95, 10));
  assert.deepEqual(mid.map(p => p.id), Array.from({ length: 10 }, (_, i) => `p-${95 + i}`));
});

test('a topic file from before pages (version 1, many posts) is split when it next changes, losing nothing', async () => {
  const bucket = new Bucket(), store = new ForumStore(bucket);
  await store.create(OWNER, C);
  await start(store);
  // As the old app wrote it: every post in the topic file.
  const old = (await store.readTopic(OWNER, C, 't1')).topic;
  const posts = [old.posts[0], ...Array.from({ length: 1499 }, (_, i) => ({ id: `p-${i + 1}`, by: { userId: 'p2', as: null }, body: `Old ${i + 1}`, at: at(i + 1).toISOString() }))];
  await bucket.put(topicKey(OWNER, C, 't1'), JSON.stringify({ ...old, posts }));
  assert.equal(M.postTotal((await store.readTopic(OWNER, C, 't1')).topic), 1500, 'still readable as it is');
  await reply(store, 1500, 'p1');
  const { topic } = await store.readTopic(OWNER, C, 't1');
  assert.equal(topic.schemaVersion, 2);
  assert.deepEqual((await allPosts(store)).map(p => p.id), [...posts.map(p => p.id), 'p-1500']);
  assert.equal((await store.read(OWNER, C)).forum.topics[0].replies, 1500);
});

test('edits and deletes reach posts in older pages; counts, summaries and the first post stay right', async () => {
  const { bucket, store } = await longTopic(400);
  const before = (await store.readTopic(OWNER, C, 't1')).topic, oldKey = before.pages[0].key;
  await store.apply(OWNER, C, 't1', (f, t) => M.editPost(f, t, { postId: 'p-3', body: 'Changed' }, who('p2'), at(500)), { postId: 'p-3' });
  const after = (await store.readTopic(OWNER, C, 't1')).topic;
  assert.notEqual(after.pages[0].key, oldKey, 'a changed page is a new file');
  assert.equal(bucket.keys(`/topics/t1/${oldKey}`).length, 0, 'the old page file goes');
  assert.equal((await allPosts(store))[3].body, 'Changed');
  // Someone else can't, and the first post goes only with the topic.
  await assert.rejects(store.apply(OWNER, C, 't1', (f, t) => M.editPost(f, t, { postId: 'p-3', body: 'Mine' }, who('p1'), at(501)), { postId: 'p-3' }), /your own posts/);
  await assert.rejects(store.apply(OWNER, C, 't1', (f, t) => M.deletePost(f, t, { postId: 'p-0' }, who('p1')), { postId: 'p-0' }), /Delete the topic instead/);
  await store.apply(OWNER, C, 't1', (f, t) => M.deletePost(f, t, { postId: 'p-5' }, who('p2')), { postId: 'p-5' });
  const { forum } = await store.read(OWNER, C);
  assert.equal(forum.topics[0].replies, 398);
  assert.equal(forum.counts.p2, 199);
  assert.ok(!(await allPosts(store)).some(p => p.id === 'p-5'));
  // Reports find a post in an older page.
  await store.apply(OWNER, C, 't1', (f, t) => M.reportPost(f, t, { postId: 'p-7', reason: 'Spoilers' }, who('p1'), 'r1', at(502)), { postId: 'p-7' });
  assert.equal((await store.read(OWNER, C)).forum.reports[0].postId, 'p-7');
});

test('deleting the latest posts brings the newest page back; deleting the topic takes its pages and counts', async () => {
  const { bucket, store } = await longTopic(140);
  let { topic } = await store.readTopic(OWNER, C, 't1');
  const pages = topic.pages.length;
  for (const p of [...topic.posts].reverse()) await store.apply(OWNER, C, 't1', (f, t) => M.deletePost(f, t, { postId: p.id }, who(p.by.userId)));
  ({ topic } = await store.readTopic(OWNER, C, 't1'));
  assert.equal(topic.pages?.length ?? 0, pages - 1, 'the newest page came back into the topic file');
  assert.ok(topic.posts.length > 0);
  const total = M.postTotal(topic);
  assert.equal((await store.read(OWNER, C)).forum.topics[0].replies, total - 1);
  await store.apply(OWNER, C, 't1', (f, t) => M.deleteTopic(f, t, who(OWNER)));
  const { forum } = await store.read(OWNER, C);
  assert.equal(forum.topics.length, 0);
  assert.deepEqual(Object.values(forum.counts).filter(Boolean), [], 'every post came off its writer\'s count');
  assert.equal(bucket.keys('/topics/').length, 0, 'topic and page files are gone');
});

test('a reply racing an edit in an older page: both land', async () => {
  const { bucket, store } = await longTopic(200);
  bucket.beforePut = { key: topicKey(OWNER, C, 't1'), run: () => reply(store, 200, 'p1') };
  await store.apply(OWNER, C, 't1', (f, t) => M.editPost(f, t, { postId: 'p-1', body: 'Edited' }, who('p2'), at(300)), { postId: 'p-1' });
  const posts = await allPosts(store);
  assert.equal(posts.length, 201);
  assert.equal(posts[1].body, 'Edited');
  assert.equal(posts[200].id, 'p-200');
});

test('a big forum has no topic limit: summaries move to index files, and a post rewrites one of them', async () => {
  const bucket = new Bucket(), store = new ForumStore(bucket), f = M.emptyForum();
  const summary = i => ({ id: `t${i}`, boardId: 'ooc-chat', title: `Topic ${i}`, by: { userId: 'p1', as: null }, at: at(i).toISOString(), last: { userId: 'p1', as: null }, lastAt: at(i).toISOString(), replies: 0, pinned: false, locked: false, cast: [], order: ['*'] });
  // The old app's forum file, at the limit it had.
  await bucket.put(forumKey(OWNER, C), JSON.stringify({ ...f, topics: Array.from({ length: P.INLINE_TOPICS }, (_, i) => summary(i)), counts: { p1: P.INLINE_TOPICS } }));
  for (let i = 0; i < 3; i++) await bucket.put(topicKey(OWNER, C, `t${i}`), JSON.stringify({ schemaVersion: 1, id: `t${i}`, boardId: 'ooc-chat', posts: [{ id: `x${i}`, by: { userId: 'p1', as: null }, body: 'Hi', at: at(i).toISOString() }] }));
  const original = bucket.data.get(forumKey(OWNER, C)).text;
  // One more topic: past the inline limit, the summaries go to index files and the old file is kept.
  await store.apply(OWNER, C, null, g => M.startTopic(g, { boardId: 'ooc-chat', title: 'One more', body: 'Hi', as: null }, who('p2'), { topic: 'new1', post: 'n1' }, at(5000)));
  const raw = JSON.parse(bucket.data.get(forumKey(OWNER, C)).text);
  assert.equal(raw.schemaVersion, 2);
  assert.equal(raw.topics, undefined);
  assert.equal(raw.index.length, Math.ceil((P.INLINE_TOPICS + 1) / P.SHARD_TOPICS));
  assert.equal(bucket.data.get(forumV1Key(OWNER, C)).text, original, 'the forum file as it was is kept');
  let { forum } = await store.read(OWNER, C);
  assert.equal(forum.topics.length, P.INLINE_TOPICS + 1);
  assert.deepEqual(forum.topics.map(t => t.id).slice(0, 3), ['t0', 't1', 't2'], 'order kept');
  assert.equal(forum.counts.p2, 1);
  // A reply to an old topic writes one new index file; the others stay as they were.
  const before = raw.index.map(r => r.key);
  await store.apply(OWNER, C, 't1', (g, t) => M.reply(g, t, { body: 'Back again', as: null }, who('p2'), 'r1', at(6000)));
  const now = JSON.parse(bucket.data.get(forumKey(OWNER, C)).text).index.map(r => r.key);
  assert.equal(now.filter(k => !before.includes(k)).length, 1);
  assert.equal(bucket.keys('/index/').length, now.length, 'replaced index files are deleted');
  ({ forum } = await store.read(OWNER, C));
  assert.equal(forum.topics.find(t => t.id === 't1').replies, 1);
  // Thousands more topics: still no limit.
  for (let i = 0; i < 5; i++) await store.apply(OWNER, C, null, g => M.startTopic(g, { boardId: 'ooc-chat', title: `More ${i}`, body: 'Hi', as: null }, who('p1'), { topic: `m${i}`, post: `mp${i}` }, at(7000 + i)));
  assert.equal((await store.read(OWNER, C)).forum.topics.length, P.INLINE_TOPICS + 6);
  // A new store (another server) reads the same.
  assert.equal((await new ForumStore(bucket).read(OWNER, C)).forum.topics.length, P.INLINE_TOPICS + 6);
});

test('the topic page: 30 posts to a page, opening where new posts start, by page or by post', async () => {
  const { bucket, store } = await longTopic(100);
  resetForumThrottles();
  const deps = (user) => ({
    sameOrigin: () => true, user: async () => user, campaign: async () => ({ owner: OWNER, campaignId: C, list: list() }),
    workspace: async () => workspace, store, now: () => at(10_000), newId: () => 'id' + Math.random().toString(36).slice(2),
  });
  const view = async (user, page) => (await handleForum(new Request('https://x.test/api/forum', { method: 'POST', body: JSON.stringify({ action: 'view', campaign: 'c-camp', page: { kind: 'topic', id: 't1', ...page } }) }), deps(user))).json();
  // The members joined at NOW, so all 100 posts are new: page 1 opens, and is marked read up to its last post.
  let v = await view('p2', {});
  assert.deepEqual(v.page.paging, { page: 1, pages: 4, per: 30, total: 100, first: 1 });
  assert.deepEqual(v.page.posts.map(p => p.number), Array.from({ length: 30 }, (_, i) => i + 1));
  v = await view('p2', {});
  assert.equal(v.page.paging.page, 2, 'next time it opens where the new posts start');
  v = await view('p2', { page: 4 });
  assert.equal(v.page.posts.length, 10);
  assert.equal(v.page.posts[0].number, 91);
  v = await view('p2', { post: 'p-45' });
  assert.equal(v.page.paging.page, 2);
  v = await view('p2', { last: true });
  assert.equal(v.page.posts.length, 30);
  assert.equal(v.page.posts.at(-1).id, 'p-99');
  assert.equal(v.page.posts.find(p => p.mine).canDelete, true);
  v = await view('p1', { page: 1 });
  assert.equal(v.page.posts[0].canDelete, false, 'the first post goes only with the topic');
  v = await view('p1', { page: 9 });
  assert.equal(v.page.paging.page, 4, 'past the end opens the last page');
  assert.ok(bucket.keys('/reads/').length >= 1);
});

test('backups carry page and index files; a copy without posts gets an ordinary forum file', () => {
  for (const p of ['forum/forum.json', 'forum/topics/t1.json', 'forum/topics/t1/abc-123.json', 'forum/index/abc-123.json']) assert.ok(FILE_PATH.test(p), p);
  for (const p of ['forum/topics/t1/a/b.json', 'forum/index/../x.json', 'forum/forum.v1-backup.json']) assert.ok(!FILE_PATH.test(p), p);
  assert.deepEqual(topicPageFiles('forum/topics/t1.json', JSON.stringify({ pages: [{ key: 'k1' }, { key: 'k2' }] })), ['forum/topics/t1/k1.json', 'forum/topics/t1/k2.json']);
  assert.deepEqual(topicPageFiles('forum/topics/t1.json', '{bad'), []);
  assert.deepEqual(topicPageFiles('forum/forum.json', '{}'), []);
  const core = { ...M.emptyForum(), schemaVersion: 2, index: [{ key: 'k', count: 3 }] };
  delete core.topics;
  const copy = JSON.parse(forumSetupOnly(JSON.stringify(core)));
  assert.equal(M.forumSchema.safeParse(copy).success, true);
  assert.equal(copy.index, undefined);
});
