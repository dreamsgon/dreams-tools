/*
 * What one reader has read, who is reading now, and whose turn it is in a topic.
 *
 * Read marks are kept per reader (store.ts, reads/<hash of account>.json): a "read everything up to" time and the
 * latest post time they have seen in each topic since. A topic is unread when its last post is newer than both and
 * someone else wrote it. Presence is one small file per forum: when each member last opened a page.
 *
 * Turns: in an in-character topic, the people writing take turns in the order they first posted (each character,
 * and the GM's narration as one more). The one after the last poster is up. With fewer than two there is no turn.
 */
import { z } from "zod";
import type { TopicSummary } from "./model.ts";

const at = z.string().datetime();
export const READ_LIMIT = 3000;
export const readsSchema = z.object({ schemaVersion: z.literal(1), all: at, topics: z.record(z.string().max(100), at) });
export type Reads = z.infer<typeof readsSchema>;

/** Nothing read after `since` (a new reader: when they joined). */
export const freshReads = (since: string): Reads => ({ schemaVersion: 1, all: since, topics: {} });
/** Up to when this reader has read a topic. */
export function readUpTo(r: Reads, topicId: string) {
  const t = r.topics[topicId];
  return t && t > r.all ? t : r.all;
}
export const isUnread = (r: Reads | undefined, t: Pick<TopicSummary, "id" | "lastAt" | "last">, userId: string) =>
  !!r && t.last.userId !== userId && t.lastAt > readUpTo(r, t.id);

/**
 * Marks a topic read up to its last post. Returns null when nothing changes. Marks already covered by "read
 * everything" or for topics no longer in `live` are dropped, and the oldest go past READ_LIMIT.
 */
export function markTopic(r: Reads, topicId: string, lastAt: string, live?: ReadonlySet<string>): Reads | null {
  if (readUpTo(r, topicId) >= lastAt) return null;
  const kept = Object.entries({ ...r.topics, [topicId]: lastAt })
    .filter(([id, t]) => t > r.all && (!live || live.has(id) || id === topicId))
    .sort((a, b) => b[1].localeCompare(a[1])).slice(0, READ_LIMIT);
  return { ...r, topics: Object.fromEntries(kept) };
}
export const markAll = (now: Date): Reads => freshReads(now.toISOString());

export const ONLINE_MS = 15 * 60_000, TOUCH_MS = 60_000, FORGET_MS = 60 * 86_400_000;
export const presenceSchema = z.object({
  schemaVersion: z.literal(1),
  /** When each member last opened a forum page. */
  seen: z.record(z.string().min(1).max(100), at),
  /** The most members reading at once. */
  peak: z.object({ count: z.number().int().min(0), at }).nullable(),
});
export type Presence = z.infer<typeof presenceSchema>;

/** Who is reading now, most recent first. */
export function onlineOf(p: Presence | null | undefined, now: Date) {
  const since = new Date(now.getTime() - ONLINE_MS).toISOString();
  return Object.entries(p?.seen ?? {}).filter(([, t]) => t >= since).sort((a, b) => b[1].localeCompare(a[1])).map(([id]) => id);
}
/** Notes that someone opened a page. Null when they were seen in the last minute, so most views don't write. */
export function touch(p: Presence | null, userId: string, now: Date): Presence | null {
  const last = p?.seen[userId];
  if (last && now.getTime() - new Date(last).getTime() < TOUCH_MS && last <= now.toISOString()) return null;
  const forget = new Date(now.getTime() - FORGET_MS).toISOString();
  const seen = Object.fromEntries(Object.entries({ ...(p?.seen ?? {}), [userId]: now.toISOString() }).filter(([, t]) => t >= forget));
  const next: Presence = { schemaVersion: 1, seen, peak: p?.peak ?? null };
  const count = onlineOf(next, now).length;
  return count > (next.peak?.count ?? 0) ? { ...next, peak: { count, at: now.toISOString() } } : next;
}

/** The GM's narration (posts written as themselves in character) takes a turn like a character. */
export const NARRATION = "*";
/** Who writes in a topic, in the order they first posted. Older summaries without it use the characters only. */
export const orderOf = (t: Pick<TopicSummary, "cast"> & { order?: string[] }) => t.order ?? t.cast;
/** Who is up after the last post, or null when fewer than two take turns. */
export function nextUp(t: Pick<TopicSummary, "cast" | "last"> & { order?: string[] }): string | null {
  const order = orderOf(t);
  if (order.length < 2) return null;
  const i = order.indexOf(t.last.as ?? NARRATION);
  return i < 0 ? order[0]! : order[(i + 1) % order.length]!;
}
