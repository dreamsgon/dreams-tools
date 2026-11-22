/*
 * Long topics and big forums, kept in pieces so neither has a limit and a post never rewrites more than a page.
 *
 * A topic file keeps its latest posts. Once it holds more than TAIL_POSTS (or TAIL_BYTES of them), its oldest posts
 * go into a page file of their own, topics/<topic>/<key>.json, and the topic file keeps a reference to it (`PageRef`,
 * model.ts): how many posts, the first, who wrote them. A page file is never changed in place: an edit or delete in
 * it writes a new page file under a new key, then the topic file (the one conditional write that decides), and the
 * old page file goes after. A reader who read the topic file just before may find a page gone and reads again.
 *
 * The forum file works the same way once it summarizes more than INLINE_TOPICS topics: the summaries go into index
 * files of up to SHARD_TOPICS each, index/<key>.json, and the forum file lists them (`ShardRef`). Smaller forums and
 * shorter topics keep the version 1 files they always had, which older versions of the app can still read.
 */
import { z } from "zod";
import { NARRATION } from "./reader.ts";
import { forumSchema, topicSummarySchema, type PageRef, type Post, type Topic } from "./model.ts";

export const TAIL_POSTS = 120, TAIL_BYTES = 2_000_000, PAGE_POSTS = 100, PAGE_BYTES = 1_500_000;
export const INLINE_TOPICS = 1000, SHARD_TOPICS = 500;
/** Posts the forum shows on one page of a topic, and the most a request may ask for at once. */
export const PER_PAGE = 30, MAX_PER_PAGE = 200;

const key = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
export const shardRefSchema = z.object({ key, count: z.number().int().min(1) });
export type ShardRef = z.infer<typeof shardRefSchema>;
/** A big forum's file: everything but the topic summaries, which are in its index files. */
export const forumCoreSchema = forumSchema.omit({ schemaVersion: true, topics: true }).extend({ schemaVersion: z.literal(2), index: z.array(shardRefSchema) });
export const topicShardSchema = z.object({ schemaVersion: z.literal(1), topics: z.array(topicSummarySchema) });
export type ForumCore = z.infer<typeof forumCoreSchema>;

const size = (p: Post) => JSON.stringify(p).length;

/** What a topic file says about a page of posts. */
export function refOf(pageKey: string, posts: readonly Post[]): PageRef {
  const first = posts[0]!, authors: Record<string, number> = {}, cast: string[] = [], order: string[] = [];
  for (const p of posts) {
    authors[p.by.userId] = (authors[p.by.userId] ?? 0) + 1;
    if (p.by.as && !cast.includes(p.by.as) && cast.length < 40) cast.push(p.by.as);
    const who = p.by.as ?? NARRATION;
    if (!order.includes(who) && order.length < 41) order.push(who);
  }
  return { key: pageKey, count: posts.length, first: { id: first.id, by: first.by, at: first.at }, lastAt: posts[posts.length - 1]!.at, authors, cast, order };
}

/** The oldest posts that should leave the topic file for pages of their own, page by page; the topic file keeps the rest. */
export function sealOf(posts: readonly Post[]): { pages: Post[][]; keep: Post[] } {
  const pages: Post[][] = [];
  let rest = [...posts], bytes = rest.reduce((n, p) => n + size(p), 0);
  while (rest.length > 1 && (rest.length > TAIL_POSTS || bytes > TAIL_BYTES)) {
    const page: Post[] = [];
    let n = 0;
    // At least one post, and the topic file keeps at least one.
    while (page.length < PAGE_POSTS && page.length < rest.length - 1 && (!page.length || n + size(rest[page.length]!) <= PAGE_BYTES)) {
      n += size(rest[page.length]!);
      page.push(rest[page.length]!);
    }
    pages.push(page);
    rest = rest.slice(page.length);
    bytes -= n;
  }
  return { pages, keep: rest };
}

/** Where each part of a topic falls in it: its pages in order, then the topic file's own posts. */
export function partsOf(topic: Pick<Topic, "posts" | "pages">) {
  const out: { page: PageRef | null; start: number; count: number }[] = [];
  let at = 0;
  for (const page of topic.pages ?? []) { out.push({ page, start: at, count: page.count }); at += page.count; }
  out.push({ page: null, start: at, count: topic.posts.length });
  return out;
}

/** The topic file as stored: version 2 with its pages, or version 1 when it has none. */
export function storedTopic(topic: Topic): Topic {
  const { pages, ...rest } = topic;
  return pages?.length ? { ...rest, schemaVersion: 2, pages } : { ...rest, schemaVersion: 1 };
}

/** The display page a post number (from 1) is on, with `per` posts to a page. */
export const pageFor = (number: number, per: number) => Math.max(1, Math.ceil(number / per));
