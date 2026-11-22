/*
 * Where a campaign's forum is kept: in the GM's storage, users/<owner>/encyclopedia/forum/<campaign>/forum.json and
 * topics/<topic>.json beside it, with a long topic's older posts in topics/<topic>/<page>.json and a big forum's topic
 * summaries in index/<key>.json (pages.ts). Every write is conditional on the revision that was read (If-Match, or
 * If-None-Match for a new file), and a change is read again and re-applied when someone else saved in between. Page
 * and index files are new files each time, so only the topic file and the forum file are ever overwritten.
 */
import { createHash, randomUUID } from "node:crypto";
import type { Bucket } from "../storage-types.ts";
import { encyclopediaPrefix } from "../encyclopedia/store.ts";
import { ForumError, emptyForum, forumSchema, postPageSchema, topicSchema, type Change, type Forum, type Post, type Topic, type TopicSummary } from "./model.ts";
import { INLINE_TOPICS, SHARD_TOPICS, forumCoreSchema, partsOf, refOf, sealOf, storedTopic, topicShardSchema, type ShardRef } from "./pages.ts";
import { presenceSchema, readsSchema, touch, type Presence, type Reads } from "./reader.ts";
import { alertsSchema, type Alerts } from "./alerts.ts";

type Store = Bucket & { delete?(key: string): Promise<unknown> };
const base = (owner: string, campaignId: string) => encyclopediaPrefix(owner) + `forum/${encodeURIComponent(campaignId)}/`;
const safeId = (v: string) => { if (!/^[A-Za-z0-9_-]{1,100}$/.test(v)) throw new ForumError("That topic was removed."); return v; };
export const forumKey = (owner: string, campaignId: string) => base(owner, campaignId) + "forum.json";
export const topicKey = (owner: string, campaignId: string, topicId: string) => base(owner, campaignId) + `topics/${safeId(topicId)}.json`;
export const pageKey = (owner: string, campaignId: string, topicId: string, key: string) => base(owner, campaignId) + `topics/${safeId(topicId)}/${safeId(key)}.json`;
export const indexKey = (owner: string, campaignId: string, key: string) => base(owner, campaignId) + `index/${safeId(key)}.json`;
/** The forum file as it was before its summaries first moved to index files, kept in case it's needed. */
export const forumV1Key = (owner: string, campaignId: string) => base(owner, campaignId) + "forum.v1-backup.json";
/** A reader's marks, under a hash of their account so the key never shows it. */
export const readsKey = (owner: string, campaignId: string, userId: string) => base(owner, campaignId) + `reads/${createHash("sha256").update(userId).digest("hex").slice(0, 40)}.json`;
export const alertsKey = (owner: string, campaignId: string, userId: string) => base(owner, campaignId) + `alerts/${createHash("sha256").update(userId).digest("hex").slice(0, 40)}.json`;
export const presenceKey = (owner: string, campaignId: string) => base(owner, campaignId) + "presence.json";
const put = (bucket: Store, key: string, value: unknown, etag: string | null) =>
  bucket.put(key, JSON.stringify(value), { onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json" } });

/** A page or index file went while it was being read (someone saved a change): read again from the top. */
class Stale extends Error {}
/* Page and index files never change once written, so a server keeps the last few it read. */
function lru<T>(max: number) {
  const map = new Map<string, T>();
  return {
    get(k: string) { const v = map.get(k); if (v !== undefined) { map.delete(k); map.set(k, v); } return v; },
    set(k: string, v: T) { map.delete(k); map.set(k, v); while (map.size > max) map.delete(map.keys().next().value!); },
  };
}
const shardCache = lru<TopicSummary[]>(64), pageCache = lru<Post[]>(32);
/** The index files as read: each with its summaries. Null for a forum file that keeps them itself. */
type Layout = { key: string; topics: TopicSummary[] }[] | null;
type Loaded = { forum: Forum; etag: string | null; layout: Layout };
/** The page of a topic a change is about (its index in `pages`), when the post it changes isn't in the topic file. */
type Window = { index: number; posts: Post[] } | null;

export class ForumStore {
  private bucket: Store;
  constructor(bucket: Store) { this.bucket = bucket; }
  private quietly(keys: string[]) { return Promise.all(keys.map(k => Promise.resolve(this.bucket.delete?.(k)).catch(() => undefined))); }

  async read(owner: string, campaignId: string): Promise<{ forum: Forum; etag: string | null }> {
    const { forum, etag } = await this.load(owner, campaignId);
    return { forum, etag };
  }

  private async load(owner: string, campaignId: string): Promise<Loaded> {
    for (let tries = 0; tries < 4; tries++) {
      const object = await this.bucket.get(forumKey(owner, campaignId));
      if (!object) return { forum: emptyForum(), etag: null, layout: null };
      const raw: unknown = await object.json().catch(() => null);
      if ((raw as { schemaVersion?: unknown } | null)?.schemaVersion === 2) {
        const core = forumCoreSchema.safeParse(raw);
        if (!core.success) throw Error("This campaign's forum can't be read.");
        const shards = await Promise.all(core.data.index.map(r => this.shard(owner, campaignId, r.key)));
        if (shards.some(s => !s)) continue;
        const { index, schemaVersion: _v, ...rest } = core.data;
        return { forum: { ...rest, schemaVersion: 1, topics: shards.flatMap(s => s!) }, etag: object.etag, layout: index.map((r, i) => ({ key: r.key, topics: shards[i]! })) };
      }
      const parsed = forumSchema.safeParse(raw);
      if (!parsed.success) throw Error("This campaign's forum can't be read.");
      return { forum: parsed.data, etag: object.etag, layout: null };
    }
    throw new ForumError("The forum was busy. Try again.");
  }

  private async shard(owner: string, campaignId: string, key: string) {
    const k = indexKey(owner, campaignId, key), known = shardCache.get(k);
    if (known) return known;
    const object = await this.bucket.get(k);
    if (!object) return null;
    const parsed = topicShardSchema.safeParse(await object.json().catch(() => null));
    if (!parsed.success) throw Error("This campaign's forum can't be read.");
    shardCache.set(k, parsed.data.topics);
    return parsed.data.topics;
  }

  /**
   * Saves the forum as `next`, conditional on the revision `was` read. A forum of up to INLINE_TOPICS topics that
   * keeps its summaries itself goes on doing so; past that, its summaries go into index files, only the ones that
   * changed written anew. False when someone else saved first.
   */
  private async commit(owner: string, campaignId: string, next: Forum, was: { etag: string | null; layout: Layout }) {
    if (!was.layout && next.topics.length <= INLINE_TOPICS) return !!await put(this.bucket, forumKey(owner, campaignId), forumSchema.parse(next), was.etag);
    const { topics, schemaVersion: _v, ...rest } = next;
    // A topic stays in its index file; new ones fill the last, then new files.
    const where = new Map<string, number>(), groups: TopicSummary[][] = (was.layout ?? []).map(() => []), fresh: TopicSummary[] = [];
    (was.layout ?? []).forEach((s, i) => s.topics.forEach(t => where.set(t.id, i)));
    for (const t of topics) { const i = where.get(t.id); if (i === undefined) fresh.push(t); else groups[i]!.push(t); }
    for (const t of fresh) { const last = groups[groups.length - 1]; if (last && last.length < SHARD_TOPICS) last.push(t); else groups.push([t]); }
    const index: ShardRef[] = [], written: string[] = [];
    for (const [i, g] of groups.entries()) {
      if (!g.length) continue;
      const before = was.layout?.[i];
      if (before && before.topics.length === g.length && before.topics.every((t, n) => t === g[n] || JSON.stringify(t) === JSON.stringify(g[n]))) { index.push({ key: before.key, count: g.length }); continue; }
      const key = randomUUID(), file = topicShardSchema.parse({ schemaVersion: 1, topics: g });
      if (!await put(this.bucket, indexKey(owner, campaignId, key), file, null)) throw new ForumError("The forum was busy. Try again.");
      written.push(key);
      shardCache.set(indexKey(owner, campaignId, key), file.topics);
      index.push({ key, count: g.length });
    }
    const core = forumCoreSchema.parse({ ...rest, schemaVersion: 2, index });
    // The first time, the forum file as it was is kept beside it.
    if (!was.layout && was.etag) {
      const old = await this.bucket.get(forumKey(owner, campaignId));
      if (old && old.etag === was.etag) await this.bucket.put(forumV1Key(owner, campaignId), new Uint8Array(await old.arrayBuffer()), { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json" } });
    }
    if (!await put(this.bucket, forumKey(owner, campaignId), core, was.etag)) {
      await this.quietly(written.map(k => indexKey(owner, campaignId, k)));
      return false;
    }
    const kept = new Set(index.map(r => r.key));
    await this.quietly((was.layout ?? []).filter(s => !kept.has(s.key)).map(s => indexKey(owner, campaignId, s.key)));
    return true;
  }

  /** Whether this campaign has a forum: the GM set one up (Campaigns), or it was used before forums were opt-in. */
  async exists(owner: string, campaignId: string) {
    return !!(await this.bucket.head(forumKey(owner, campaignId)));
  }

  /** Sets up the forum (empty, or as `forum` says), leaving one that is already there as it is. True when this made it. */
  async create(owner: string, campaignId: string, forum: Forum = emptyForum()) {
    if (await this.exists(owner, campaignId)) return false;
    return this.commit(owner, campaignId, forumSchema.parse(forum), { etag: null, layout: null });
  }

  /** A topic file: a short topic's posts, or a long one's latest posts and its pages (pages.ts). */
  async readTopic(owner: string, campaignId: string, topicId: string): Promise<{ topic: Topic; etag: string } | null> {
    const object = await this.bucket.get(topicKey(owner, campaignId, topicId));
    if (!object) return null;
    const parsed = topicSchema.safeParse(await object.json().catch(() => null));
    if (!parsed.success) throw Error("This topic can't be read.");
    return { topic: parsed.data, etag: object.etag };
  }

  private async page(owner: string, campaignId: string, topicId: string, key: string): Promise<Post[]> {
    const k = pageKey(owner, campaignId, topicId, key), known = pageCache.get(k);
    if (known) return known;
    const object = await this.bucket.get(k);
    if (!object) throw new Stale();
    const parsed = postPageSchema.safeParse(await object.json().catch(() => null));
    if (!parsed.success || parsed.data.topicId !== topicId) throw Error("This topic can't be read.");
    pageCache.set(k, parsed.data.posts);
    return parsed.data.posts;
  }

  /**
   * Reads a topic's file and runs `work` on it, reading again when one of its pages went in the meantime (someone
   * changed a post in it). Null when the topic isn't there.
   */
  async withTopic<T>(owner: string, campaignId: string, topicId: string, work: (topic: Topic) => Promise<T>): Promise<T | null> {
    for (let tries = 0; tries < 4; tries++) {
      const got = await this.readTopic(owner, campaignId, topicId);
      if (!got) return null;
      try { return await work(got.topic); } catch (e) { if (!(e instanceof Stale)) throw e; }
    }
    throw new ForumError("This topic was busy. Try again.");
  }

  /** Posts `from` (0 is the first) for `count`, across the topic's pages and its file. Use inside `withTopic`. */
  async readPosts(owner: string, campaignId: string, topic: Topic, from: number, count: number): Promise<Post[]> {
    const parts = partsOf(topic).filter(p => p.count && p.start < from + count && p.start + p.count > from);
    const got = await Promise.all(parts.map(p => p.page ? this.page(owner, campaignId, topic.id, p.page.key) : Promise.resolve(topic.posts)));
    return parts.flatMap((p, i) => got[i]!.slice(Math.max(0, from - p.start), Math.max(0, from + count - p.start)));
  }

  /** The part of a topic a post is in: its posts, where they start and which page (null: the topic file). Use inside `withTopic`. */
  async findPost(owner: string, campaignId: string, topic: Topic, postId: string): Promise<{ posts: Post[]; start: number; index: number | null } | null> {
    const parts = partsOf(topic);
    if (topic.posts.some(p => p.id === postId)) return { posts: topic.posts, start: parts[parts.length - 1]!.start, index: null };
    // The newest pages first: changes and reports are mostly about recent posts.
    for (let i = (topic.pages?.length ?? 0) - 1; i >= 0; i--) {
      const posts = await this.page(owner, campaignId, topic.id, topic.pages![i]!.key);
      if (posts.some(p => p.id === postId)) return { posts, start: parts[i]!.start, index: i };
    }
    return null;
  }

  /** The number (from 0) of the first post after `at`, or null when there's none. Use inside `withTopic`. */
  async firstAfter(owner: string, campaignId: string, topic: Topic, at: string): Promise<number | null> {
    for (const part of partsOf(topic)) {
      if (part.page && part.page.lastAt <= at) continue;
      const posts = part.page ? await this.page(owner, campaignId, topic.id, part.page.key) : topic.posts, i = posts.findIndex(p => p.at > at);
      if (i >= 0) return part.start + i;
    }
    return null;
  }

  /**
   * The files under the forum's folder, as paths in it: the forum file, its index files and each topic file; with
   * `pages`, each topic's page files too (which reads every topic file).
   */
  async files(owner: string, campaignId: string, pages = false): Promise<string[]> {
    const object = await this.bucket.get(forumKey(owner, campaignId));
    if (!object) return [];
    const raw: unknown = await object.json().catch(() => null), out = ["forum.json"];
    const core = forumCoreSchema.safeParse(raw);
    if (core.success) out.push(...core.data.index.map(r => `index/${r.key}.json`));
    const { forum } = await this.load(owner, campaignId).catch(() => ({ forum: null }));
    for (const t of forum?.topics ?? []) out.push(`topics/${t.id}.json`);
    if (pages && forum) {
      const ids = forum.topics.map(t => t.id);
      for (let i = 0; i < ids.length; i += 32) {
        const heads = await Promise.all(ids.slice(i, i + 32).map(id => this.readTopic(owner, campaignId, id).catch(() => null)));
        for (const h of heads) for (const g of h?.topic.pages ?? []) out.push(`topics/${h!.topic.id}/${g.key}.json`);
      }
    }
    return out;
  }

  /**
   * Runs one change. `make` gets the forum and (when `topicId` is given) the topic as stored now and returns a
   * Change (model.ts). With `postId`, a post in one of the topic's older pages, the topic comes with that page's
   * posts in place of its latest ones. The topic file is written first, conditionally; then the forum file, reading
   * it again and re-applying the change until it saves. Each step tries four times.
   */
  async apply<T>(owner: string, campaignId: string, topicId: string | null, make: (forum: Forum, topic: Topic | null) => Change<T>, opts: { postId?: string } = {}): Promise<T | undefined> {
    for (let tries = 0; tries < 4; tries++) {
      const loaded = await this.load(owner, campaignId);
      const stored = topicId ? await this.readTopic(owner, campaignId, topicId) : null;
      if (topicId && !stored && loaded.forum.topics.some(t => t.id === topicId)) throw new ForumError("That topic can't be found.");
      let win: Window = null, drop: string[] = [], change: Change<T>;
      try {
        if (stored && opts.postId) { const found = await this.findPost(owner, campaignId, stored.topic, opts.postId); if (found && found.index !== null) win = { index: found.index, posts: found.posts }; }
        change = make(loaded.forum, stored ? (win ? { ...stored.topic, posts: win.posts } : stored.topic) : null);
        if (change.topic === null) {
          if (stored) {
            await this.bucket.delete?.(topicKey(owner, campaignId, stored.topic.id));
            drop = (stored.topic.pages ?? []).map(g => pageKey(owner, campaignId, stored.topic.id, g.key));
          }
        } else if (change.topic) {
          const out = await this.writeTopic(owner, campaignId, stored, win, change.topic);
          if (!out) continue;
          drop = out.drop;
        }
      } catch (e) { if (e instanceof Stale) continue; throw e; }
      await this.saveForum(owner, campaignId, change.forum, change.topic ? change.topic.id : null);
      await this.quietly(drop);
      return change.out;
    }
    throw new ForumError("Someone else posted at the same moment. Try again.");
  }

  /**
   * Writes a changed topic: the topic file, after any new page files. A change to one of its pages (`win`) writes that
   * page anew (or drops it when it's empty). The topic file's oldest posts go into new pages when it holds too many,
   * and when its last post goes, its newest page comes back into it. Null when someone else wrote the topic first;
   * otherwise the page files that are no longer used, to delete once the forum file is saved.
   */
  private async writeTopic(owner: string, campaignId: string, stored: { topic: Topic; etag: string } | null, win: Window, changed: Topic): Promise<{ drop: string[] } | null> {
    const next = topicSchema.parse(changed), pages = [...(next.pages ?? [])], made: { key: string; posts: Post[] }[] = [], drop: string[] = [];
    let posts: Post[];
    if (win && stored) {
      posts = stored.topic.posts;
      const old = pages[win.index]!;
      drop.push(old.key);
      if (next.posts.length) { const key = randomUUID(); made.push({ key, posts: next.posts }); pages[win.index] = refOf(key, next.posts); }
      else pages.splice(win.index, 1);
    } else {
      posts = next.posts;
      if (!posts.length && pages.length) { const last = pages.pop()!; posts = await this.page(owner, campaignId, next.id, last.key); drop.push(last.key); }
      const sealed = sealOf(posts);
      for (const g of sealed.pages) { const key = randomUUID(); made.push({ key, posts: g }); pages.push(refOf(key, g)); }
      posts = sealed.keep;
    }
    for (const m of made) {
      if (!await put(this.bucket, pageKey(owner, campaignId, next.id, m.key), postPageSchema.parse({ schemaVersion: 1, topicId: next.id, posts: m.posts }), null)) throw new ForumError("The topic was busy. Try again.");
      pageCache.set(pageKey(owner, campaignId, next.id, m.key), m.posts);
    }
    const isNew = !stored || stored.topic.id !== next.id;
    if (!await put(this.bucket, topicKey(owner, campaignId, next.id), storedTopic({ ...next, posts, pages }), isNew ? null : stored!.etag)) {
      await this.quietly(made.map(m => pageKey(owner, campaignId, next.id, m.key)));
      return null;
    }
    return { drop: drop.map(k => pageKey(owner, campaignId, next.id, k)) };
  }
  /** One reader's read marks, or null before their first visit. A damaged file counts as none. */
  async readReads(owner: string, campaignId: string, userId: string): Promise<{ reads: Reads | null; etag: string | null }> {
    const object = await this.bucket.get(readsKey(owner, campaignId, userId));
    if (!object) return { reads: null, etag: null };
    const parsed = readsSchema.safeParse(await object.json().catch(() => null));
    return { reads: parsed.success ? parsed.data : null, etag: object.etag };
  }
  /** Changes a reader's marks; `edit` returns null when there's nothing to write. Returns the marks as saved. */
  async writeReads(owner: string, campaignId: string, userId: string, edit: (r: Reads | null) => Reads | null): Promise<Reads | null> {
    for (let tries = 0; tries < 3; tries++) {
      const { reads, etag } = await this.readReads(owner, campaignId, userId), next = edit(reads);
      if (!next) return reads;
      if (await put(this.bucket, readsKey(owner, campaignId, userId), readsSchema.parse(next), etag)) return next;
    }
    throw new ForumError("Your read marks were busy. Try again.");
  }

  async readAlerts(owner: string, campaignId: string, userId: string): Promise<{ alerts: Alerts | null; etag: string | null }> {
    const object = await this.bucket.get(alertsKey(owner, campaignId, userId));
    if (!object) return { alerts: null, etag: null };
    const parsed = alertsSchema.safeParse(await object.json().catch(() => null));
    return { alerts: parsed.success ? parsed.data : null, etag: object.etag };
  }
  /** Changes someone's alerts; `edit` returns null when there's nothing to write. */
  async writeAlerts(owner: string, campaignId: string, userId: string, edit: (a: Alerts | null) => Alerts | null): Promise<Alerts | null> {
    for (let tries = 0; tries < 3; tries++) {
      const { alerts, etag } = await this.readAlerts(owner, campaignId, userId), next = edit(alerts);
      if (!next) return alerts;
      if (await put(this.bucket, alertsKey(owner, campaignId, userId), alertsSchema.parse(next), etag)) return next;
    }
    throw new ForumError("Your alerts were busy. Try again.");
  }

  async readPresence(owner: string, campaignId: string): Promise<{ presence: Presence | null; etag: string | null }> {
    const object = await this.bucket.get(presenceKey(owner, campaignId));
    if (!object) return { presence: null, etag: null };
    const parsed = presenceSchema.safeParse(await object.json().catch(() => null));
    return { presence: parsed.success ? parsed.data : null, etag: object.etag };
  }
  /** Notes that someone is reading. Best effort: a busy file is left for the next page they open. */
  async touchPresence(owner: string, campaignId: string, userId: string, now: Date, known?: { presence: Presence | null; etag: string | null }) {
    let got = known ?? await this.readPresence(owner, campaignId);
    for (let tries = 0; tries < 2; tries++) {
      const next = touch(got.presence, userId, now);
      if (!next || await put(this.bucket, presenceKey(owner, campaignId), next, got.etag)) return;
      got = await this.readPresence(owner, campaignId);
    }
  }

  /** Saves the forum file. The topic just written is read again each time, so its summary includes replies that landed since. */
  private async saveForum(owner: string, campaignId: string, edit: Change["forum"], topicId: string | null) {
    for (let tries = 0; tries < 6; tries++) {
      const loaded = await this.load(owner, campaignId);
      const latest = topicId ? (await this.readTopic(owner, campaignId, topicId))?.topic : undefined;
      if (await this.commit(owner, campaignId, edit(loaded.forum, latest), loaded)) return;
    }
    throw new ForumError("The forum was busy. Try again.");
  }
}
