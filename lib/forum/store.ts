/*
 * Where a campaign's forum is kept: in the GM's storage, users/<owner>/encyclopedia/forum/<campaign>/forum.json and
 * topics/<topic>.json beside it. Every write is conditional on the revision that was read (If-Match, or
 * If-None-Match for a new file), and a change is read again and re-applied when someone else saved in between.
 */
import type { Bucket } from "../storage-types.ts";
import { encyclopediaPrefix } from "../encyclopedia/store.ts";
import { ForumError, emptyForum, forumSchema, topicSchema, type Change, type Forum, type Topic } from "./model.ts";

type Store = Bucket & { delete?(key: string): Promise<unknown> };
const base = (owner: string, campaignId: string) => encyclopediaPrefix(owner) + `forum/${encodeURIComponent(campaignId)}/`;
export const forumKey = (owner: string, campaignId: string) => base(owner, campaignId) + "forum.json";
export const topicKey = (owner: string, campaignId: string, topicId: string) => {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(topicId)) throw new ForumError("That topic was removed.");
  return base(owner, campaignId) + `topics/${topicId}.json`;
};
const put = (bucket: Store, key: string, value: unknown, etag: string | null) =>
  bucket.put(key, JSON.stringify(value), { onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json" } });

export class ForumStore {
  private bucket: Store;
  constructor(bucket: Store) { this.bucket = bucket; }

  async read(owner: string, campaignId: string): Promise<{ forum: Forum; etag: string | null }> {
    const object = await this.bucket.get(forumKey(owner, campaignId));
    if (!object) return { forum: emptyForum(), etag: null };
    const parsed = forumSchema.safeParse(await object.json().catch(() => null));
    if (!parsed.success) throw Error("This campaign's forum can't be read.");
    return { forum: parsed.data, etag: object.etag };
  }

  async readTopic(owner: string, campaignId: string, topicId: string): Promise<{ topic: Topic; etag: string } | null> {
    const object = await this.bucket.get(topicKey(owner, campaignId, topicId));
    if (!object) return null;
    const parsed = topicSchema.safeParse(await object.json().catch(() => null));
    if (!parsed.success) throw Error("This topic can't be read.");
    return { topic: parsed.data, etag: object.etag };
  }

  /**
   * Runs one change. `make` gets the forum and (when `topicId` is given) the topic as stored now and returns a
   * Change (model.ts). The topic file is written first, conditionally; then the forum file, reading it again and
   * re-applying the change until it saves. Each step tries four times.
   */
  async apply<T>(owner: string, campaignId: string, topicId: string | null, make: (forum: Forum, topic: Topic | null) => Change<T>): Promise<T | undefined> {
    for (let tries = 0; tries < 4; tries++) {
      const { forum } = await this.read(owner, campaignId);
      const stored = topicId ? await this.readTopic(owner, campaignId, topicId) : null;
      if (topicId && !stored && forum.topics.some(t => t.id === topicId)) throw new ForumError("That topic can't be found.");
      const change = make(forum, stored?.topic ?? null);
      if (change.topic === null) {
        if (stored) await this.bucket.delete?.(topicKey(owner, campaignId, stored.topic.id));
      } else if (change.topic) {
        const topic = topicSchema.parse(change.topic);
        const isNew = !stored || stored.topic.id !== topic.id;
        if (!await put(this.bucket, topicKey(owner, campaignId, topic.id), topic, isNew ? null : stored!.etag)) continue;
      }
      const written = change.topic ? change.topic.id : null;
      await this.saveForum(owner, campaignId, change.forum, written);
      return change.out;
    }
    throw new ForumError("Someone else posted at the same moment. Try again.");
  }

  /** Saves the forum file. The topic just written is read again each time, so its summary includes replies that landed since. */
  private async saveForum(owner: string, campaignId: string, edit: Change["forum"], topicId: string | null) {
    for (let tries = 0; tries < 6; tries++) {
      const { forum, etag } = await this.read(owner, campaignId);
      const latest = topicId ? (await this.readTopic(owner, campaignId, topicId))?.topic : undefined;
      if (await put(this.bucket, forumKey(owner, campaignId), forumSchema.parse(edit(forum, latest)), etag)) return;
    }
    throw new ForumError("The forum was busy. Try again.");
  }
}
