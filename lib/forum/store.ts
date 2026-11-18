/*
 * Where a campaign's forum is kept: in the GM's storage, users/<owner>/encyclopedia/forum/<campaign>/forum.json and
 * topics/<topic>.json beside it. Every write is conditional on the revision that was read (If-Match, or
 * If-None-Match for a new file), and a change is read again and re-applied when someone else saved in between.
 */
import { createHash } from "node:crypto";
import type { Bucket } from "../storage-types.ts";
import { encyclopediaPrefix } from "../encyclopedia/store.ts";
import { ForumError, emptyForum, forumSchema, topicSchema, type Change, type Forum, type Topic } from "./model.ts";
import { presenceSchema, readsSchema, touch, type Presence, type Reads } from "./reader.ts";
import { alertsSchema, type Alerts } from "./alerts.ts";

type Store = Bucket & { delete?(key: string): Promise<unknown> };
const base = (owner: string, campaignId: string) => encyclopediaPrefix(owner) + `forum/${encodeURIComponent(campaignId)}/`;
export const forumKey = (owner: string, campaignId: string) => base(owner, campaignId) + "forum.json";
export const topicKey = (owner: string, campaignId: string, topicId: string) => {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(topicId)) throw new ForumError("That topic was removed.");
  return base(owner, campaignId) + `topics/${topicId}.json`;
};
/** A reader's marks, under a hash of their account so the key never shows it. */
export const readsKey = (owner: string, campaignId: string, userId: string) => base(owner, campaignId) + `reads/${createHash("sha256").update(userId).digest("hex").slice(0, 40)}.json`;
export const alertsKey = (owner: string, campaignId: string, userId: string) => base(owner, campaignId) + `alerts/${createHash("sha256").update(userId).digest("hex").slice(0, 40)}.json`;
export const presenceKey = (owner: string, campaignId: string) => base(owner, campaignId) + "presence.json";
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

  /** Whether this campaign has a forum: the GM set one up (Campaigns), or it was used before forums were opt-in. */
  async exists(owner: string, campaignId: string) {
    return !!(await this.bucket.head(forumKey(owner, campaignId)));
  }

  /** Sets up the forum (empty, or as `forum` says), leaving one that is already there as it is. True when this made it. */
  async create(owner: string, campaignId: string, forum: Forum = emptyForum()) {
    if (await this.exists(owner, campaignId)) return false;
    return !!(await put(this.bucket, forumKey(owner, campaignId), forumSchema.parse(forum), null));
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
      const { forum, etag } = await this.read(owner, campaignId);
      const latest = topicId ? (await this.readTopic(owner, campaignId, topicId))?.topic : undefined;
      if (await put(this.bucket, forumKey(owner, campaignId), forumSchema.parse(edit(forum, latest)), etag)) return;
    }
    throw new ForumError("The forum was busy. Try again.");
  }
}
