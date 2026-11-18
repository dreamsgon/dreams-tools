/*
 * A campaign's forum, Jcink style: categories of boards (in character location boards, out of character boards),
 * topics and posts. Players post in character as a character they may edit, or as themselves out of character.
 * Every post counts towards the member's own post count, in character or not.
 *
 * Kept in the GM's storage beside the member list (see store.ts): one forum file (settings, categories, boards,
 * a summary of every topic and the post counts) and one file per topic with its posts. Each change below is pure:
 * it checks who is asking and returns the new topic file and a change to apply to the forum file, so the store can
 * read the forum file again and re-apply it when someone else saved in between.
 */
import { z } from "zod";
import { can, type MemberList } from "../members.ts";
import { NARRATION } from "./reader.ts";
import { afterPost, cleanOrder, combatSchema, countsFor, step, turnMeta, turnMetaSchema, type Combat, type Slot } from "./combat.ts";
import { ROLL_LIMIT, rollSchema, type Roll } from "./rolls.ts";

export const FORUM_LIMITS = { categories: 12, boards: 80, topics: 3000, posts: 1500, body: 30_000, title: 120, links: 8, characters: 2000, recent: 400, privateMembers: 30, bulk: 50 } as const;
/** Days a topic stays in the Trash before it goes for good. */
export const TRASH_DAYS = 30;

const id = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
const userId = z.string().min(1).max(100);
const at = z.string().datetime();
const nameOf = (max: number) => z.string().trim().min(1).max(max);

const tri = z.enum(["yes", "no", "never"]);
/** A link in the banner: site-relative or https only. */
export const forumLinkSchema = z.object({ label: nameOf(40), url: z.string().trim().max(500).regex(/^(?:\/(?!\/)|https:\/\/)\S*$/) });
export const forumSettingsSchema = z.object({
  /** Shown in the banner; empty uses the campaign's name. */
  title: z.string().trim().max(80),
  tagline: z.string().trim().max(160),
  links: z.array(forumLinkSchema).max(FORUM_LIMITS.links),
  /** Use the campaign's banner picture (its Look) behind the title. */
  banner: z.boolean(),
  /** The notices strip under the banner: short lines from the GM, each dismissible by a reader. */
  notices: z.array(z.object({ id, text: z.string().trim().min(1).max(240) })).max(3).optional(),
});
/** `ic`: in character, where players post as their characters. `ooc`: out of character, where they post as themselves. */
export const categorySchema = z.object({ id, name: nameOf(60), kind: z.enum(["ic", "ooc"]) });
export const boardSchema = z.object({
  id, categoryId: id,
  /** A subforum sits inside another board of the same category. */
  parentId: id.nullable(),
  name: nameOf(60), description: z.string().trim().max(300),
  /** A location board's place page in the Encyclopedia: its picture is the board's art. */
  placeId: id.optional(),
  /** Only moderators may start topics here (announcements, rules). */
  locked: z.boolean().optional(),
  /**
   * What kind of board it is: a location (tied to a place, with its art), a campaign board (a story with no single
   * place) or out of character. Left out: as its category says (in character boards are locations).
   */
  type: z.enum(["location", "campaign", "ooc"]).optional(),
  /** Full width or half (half-width boards sit side by side on the index). Left out: in character full, out of character half. */
  width: z.enum(["full", "half"]).optional(),
  /**
   * Permission masks: per group, Yes, No or Never for reading, starting topics and replying here instead of what
   * the group says for the whole forum. A subforum without its own setting follows its board. GMs aren't masked.
   */
  masks: z.record(id, z.object({ read: tri.optional(), start: tri.optional(), reply: tri.optional() })).optional(),
});
/** Who wrote something: the member's account, and the character they wrote as (null: as themselves). */
export const authorSchema = z.object({ userId, as: id.nullable() });
export const topicSummarySchema = z.object({
  id, boardId: id, title: nameOf(FORUM_LIMITS.title), by: authorSchema, at,
  last: authorSchema, lastAt: at, replies: z.number().int().min(0),
  pinned: z.boolean(), locked: z.boolean(),
  /** The characters who have posted in it, in order of their first post. */
  cast: z.array(id).max(40),
  /** Who takes turns, in order of their first post: characters, and "*" for the GM's narration (reader.ts). */
  order: z.array(z.string().min(1).max(100)).max(41).optional(),
  /** Archived: kept out of the board's list (in its Archive instead) and closed to replies. */
  archived: z.boolean().optional(),
  /** In the Trash: hidden from everyone but moderators until restored or deleted for good. */
  trashed: z.object({ at, by: userId }).optional(),
  /** A private topic: only these members (and whoever started it), the GM and co-GMs see it. */
  private: z.array(userId).max(FORUM_LIMITS.privateMembers).optional(),
  /** A fight in progress (combat.ts). */
  combat: combatSchema.optional(),
});
/** One recent post, kept a few days for "Characters who posted today". Never sent to the browser as is. */
export const recentSchema = z.object({ at, userId, as: id.nullable(), topicId: id, postId: id });
export const forumSchema = z.object({
  schemaVersion: z.literal(1),
  settings: forumSettingsSchema,
  categories: z.array(categorySchema).max(FORUM_LIMITS.categories),
  boards: z.array(boardSchema).max(FORUM_LIMITS.boards),
  topics: z.array(topicSummarySchema).max(FORUM_LIMITS.topics),
  /** Posts per member account, in character and out. */
  counts: z.record(userId, z.number().int().min(0)),
  /** Every character that has posted here. Their pictures may be shown to everyone who reads the forum. */
  characters: z.array(id).max(FORUM_LIMITS.characters),
  /** The last few days of posts, newest last (`recentSchema`). Older forums have none. */
  recent: z.array(recentSchema).max(FORUM_LIMITS.recent).optional(),
});
export const postSchema = z.object({
  id, by: authorSchema, body: z.string().min(1).max(FORUM_LIMITS.body), at, editedAt: at.optional(),
  /** The dice for each [roll] tag, in order, rolled by the server (rolls.ts); null for a tag that isn't dice. */
  rolls: z.array(rollSchema.nullable()).max(ROLL_LIMIT).optional(),
  /** Where the post fell in a fight, when it was someone's turn. */
  turn: turnMetaSchema.optional(),
});
export const topicSchema = z.object({ schemaVersion: z.literal(1), id, boardId: id, posts: z.array(postSchema).max(FORUM_LIMITS.posts) });

export type ForumSettings = z.infer<typeof forumSettingsSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Board = z.infer<typeof boardSchema>;
export type Author = z.infer<typeof authorSchema>;
export type TopicSummary = z.infer<typeof topicSummarySchema>;
export type Forum = z.infer<typeof forumSchema>;
export type Post = z.infer<typeof postSchema>;
export type Topic = z.infer<typeof topicSchema>;
export type Recent = z.infer<typeof recentSchema>;

export class ForumError extends Error { name = "ForumError"; }
const fail = (message: string): never => { throw new ForumError(message); };

/** A new forum: a Locations category for in-character boards and an Out of character one with a chat board. */
export function emptyForum(): Forum {
  return {
    schemaVersion: 1,
    settings: { title: "", tagline: "", links: [], banner: true },
    categories: [{ id: "locations", name: "Locations", kind: "ic" }, { id: "ooc", name: "Out of character", kind: "ooc" }],
    boards: [{ id: "ooc-chat", categoryId: "ooc", parentId: null, name: "General chat", description: "Talk as yourselves: plans, questions and anything else." }],
    topics: [], counts: {}, characters: [],
  };
}

export type ForumRights = { owner: boolean; gm: boolean; read: boolean; start: boolean; reply: boolean; pictures: boolean; moderate: boolean; boards: boolean };
/** What someone may do in the forum, from their groups. The campaign's owner may do everything. */
export function forumRights(list: MemberList, who: string, owner: string): ForumRights {
  const o = who === owner, c = (p: Parameters<typeof can>[2]) => o || can(list, who, p);
  const read = c("forumRead");
  return { owner: o, gm: c("seeGm"), read, start: read && c("forumStart"), reply: read && c("forumReply"), pictures: c("forumPictures"), moderate: read && c("forumModerate"), boards: read && c("forumBoards") };
}

export type BoardAccess = { read: boolean; start: boolean; reply: boolean };
export const MASKED = ["read", "start", "reply"] as const;
const maskPerm = { read: "forumRead", start: "forumStart", reply: "forumReply" } as const;
/**
 * What someone may do on each board once its permission masks are applied: for each of their groups, the board's
 * setting (or its parent board's), else the group's own; then Yes in any group and Never in none, as for the
 * forum. Starting and replying also need reading. GMs and the owner keep their forum rights everywhere.
 */
export function boardAccess(f: Forum, list: MemberList, who: string, rights: ForumRights): Record<string, BoardAccess> {
  const out: Record<string, BoardAccess> = {}, member = list.members.find(m => m.userId === who);
  for (const b of f.boards) {
    if (rights.gm || !member || !(b.masks || f.boards.find(x => x.id === b.parentId)?.masks)) { out[b.id] = { read: rights.read, start: rights.start, reply: rights.reply }; continue; }
    const parent = b.parentId ? f.boards.find(x => x.id === b.parentId) : undefined;
    const says = (r: (typeof MASKED)[number]) => {
      const said = member.groups.map(g => b.masks?.[g]?.[r] ?? parent?.masks?.[g]?.[r] ?? list.groups.find(x => x.id === g)?.perms[maskPerm[r]]).filter(Boolean);
      return said.includes("yes") && !said.includes("never");
    };
    const read = says("read");
    out[b.id] = { read, start: read && says("start"), reply: read && says("reply") };
  }
  // A subforum can't be read when its board can't.
  for (const b of f.boards) if (b.parentId && out[b.parentId] && !out[b.parentId]!.read) out[b.id] = { read: false, start: false, reply: false };
  return out;
}

/** The person asking: their account, rights and the characters they may post as. GMs may also post in character as themselves (narration). */
export type Poster = { userId: string; rights: ForumRights; cast: ReadonlySet<string>; access?: Readonly<Record<string, BoardAccess>> };
/** Someone's rights on one board (their forum rights when no masks were worked out). */
export const accessOn = (who: { rights: ForumRights; access?: Readonly<Record<string, BoardAccess>> }, boardId: string): BoardAccess =>
  who.access?.[boardId] ?? { read: who.rights.read, start: who.rights.start, reply: who.rights.reply };

/** Whether someone sees a topic: not in the Trash, and for a private topic, one of its members, its starter or a GM. */
export function canSee(t: Pick<TopicSummary, "trashed" | "private" | "by" | "boardId">, who: { userId: string; rights: Pick<ForumRights, "gm">; access?: Readonly<Record<string, BoardAccess>> }) {
  if (t.trashed || who.access?.[t.boardId]?.read === false) return false;
  return !t.private || who.rights.gm || t.by.userId === who.userId || t.private.includes(who.userId);
}

const boardOf = (f: Forum, boardId: string) => f.boards.find(b => b.id === boardId) ?? fail("That board was removed.");
export const kindOf = (f: Forum, board: Pick<Board, "categoryId" | "type">) => board.type ? (board.type === "ooc" ? "ooc" : "ic") : f.categories.find(c => c.id === board.categoryId)?.kind ?? "ooc";
/** A board's kind in full, and its width, with the defaults worked out. */
export const typeOf = (f: Forum, board: Pick<Board, "categoryId" | "type">) => board.type ?? (kindOf(f, board) === "ic" ? "location" : "ooc");
export const widthOf = (f: Forum, board: Pick<Board, "categoryId" | "type" | "width">) => board.width ?? (kindOf(f, board) === "ic" ? "full" : "half");
const summaryOf = (f: Forum, topicId: string) => f.topics.find(t => t.id === topicId) ?? fail("That topic was removed.");
/** The topic's summary, if the person may see it; trashed topics only for moderators when `trash` is set. */
const seenBy = (f: Forum, topicId: string, who: Poster, trash = false) => {
  const s = summaryOf(f, topicId);
  if (s.trashed ? !(trash && who.rights.moderate) : !canSee(s, who)) fail("That topic was removed.");
  return s;
};
const cleanTitle = (s: unknown) => { const v = typeof s === "string" ? s.replace(/\s+/g, " ").trim() : ""; return v ? v.slice(0, FORUM_LIMITS.title) : fail("Give the topic a title."); };
const cleanBody = (s: unknown) => {
  const v = typeof s === "string" ? s.replace(/\r\n?/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim() : "";
  if (!v) fail("Write something first.");
  return v.length > FORUM_LIMITS.body ? fail(`Keep a post under ${FORUM_LIMITS.body.toLocaleString("en")} characters.`) : v;
};

/** Checks who a post is written as: a character of theirs in character (GMs: any, or themselves), themselves out of character. */
export function checkAs(f: Forum, board: Board, as: string | null, who: Poster): string | null {
  if (kindOf(f, board) === "ooc") return as === null ? null : fail("Out of character boards are for posting as yourself.");
  if (as === null) return who.rights.gm ? null : fail("Choose which of your characters this post is from.");
  return who.cast.has(as) ? as : fail("You can't post as that character.");
}

const cleanBoard = (f: Forum, boardId: string, who: Poster, starting: boolean) => {
  const b = boardOf(f, boardId);
  const may = accessOn(who, boardId);
  if (!may.read) fail("That board was removed.");
  if (!(starting ? may.start : may.reply)) fail(starting ? (who.rights.start ? "Your group can't start topics on this board." : "Your group can't start topics.") : (who.rights.reply ? "Your group can't reply on this board." : "Your group can't reply."));
  if (starting && b.locked && !who.rights.moderate) fail("Only moderators start topics on this board.");
  return b;
};

/** The topic's summary worked out again from its posts, keeping what moderators set (pinned, locked, title). */
type Kept = Pick<TopicSummary, "title" | "pinned" | "locked"> & Partial<Pick<TopicSummary, "archived" | "trashed" | "private" | "combat">>;
export function summarize(topic: Topic, base: Kept): TopicSummary {
  const first = topic.posts[0] ?? fail("A topic needs a post."), last = topic.posts[topic.posts.length - 1]!;
  const cast: string[] = [], order: string[] = [];
  for (const p of topic.posts) {
    if (p.by.as && !cast.includes(p.by.as) && cast.length < 40) cast.push(p.by.as);
    const who = p.by.as ?? NARRATION;
    if (!order.includes(who) && order.length < 41) order.push(who);
  }
  return {
    id: topic.id, boardId: topic.boardId, title: base.title, by: first.by, at: first.at, last: last.by, lastAt: last.at, replies: topic.posts.length - 1, pinned: base.pinned, locked: base.locked, cast, order,
    ...(base.archived ? { archived: true } : {}), ...(base.trashed ? { trashed: base.trashed } : {}), ...(base.private ? { private: base.private } : {}), ...(base.combat ? { combat: base.combat } : {}),
  };
}
const putSummary = (f: Forum, s: TopicSummary): Forum => ({ ...f, topics: f.topics.some(t => t.id === s.id) ? f.topics.map(t => t.id === s.id ? s : t) : [...f.topics, s] });
const addCount = (f: Forum, userId: string, n: number): Forum => ({ ...f, counts: { ...f.counts, [userId]: Math.max(0, (f.counts[userId] ?? 0) + n) } });
const RECENT_MS = 3 * 86_400_000;
/** Notes a post in the recent list, dropping posts older than three days. */
const logPost = (f: Forum, r: Recent): Forum => {
  const since = new Date(new Date(r.at).getTime() - RECENT_MS).toISOString();
  return { ...f, recent: [...(f.recent ?? []).filter(x => x.at >= since && x.postId !== r.postId), r].slice(-FORUM_LIMITS.recent) };
};
const unlog = (f: Forum, drop: (r: Recent) => boolean): Forum => f.recent ? { ...f, recent: f.recent.filter(r => !drop(r)) } : f;
const addCharacter = (f: Forum, as: string | null): Forum => !as || f.characters.includes(as) ? f : { ...f, characters: [...f.characters, as].slice(-FORUM_LIMITS.characters) };

/** A change: the topic file to write (null deletes it, undefined leaves it), and the change to make to the forum file. */
export type Change<T = undefined> = { topic?: Topic | null; forum: (f: Forum, latest?: Topic) => Forum; out?: T };
/* `latest` is the topic file as stored when the forum file is saved: another reply may have landed after this one. */

const withRolls = (rolls: readonly (Roll | null)[] | undefined) => rolls?.length ? { rolls: rolls.slice(0, ROLL_LIMIT) } : {};
export function startTopic(f: Forum, input: { boardId: string; title: unknown; body: unknown; as: string | null; private?: string[]; rolls?: (Roll | null)[] }, who: Poster, ids: { topic: string; post: string }, now: Date): Change<{ topicId: string }> {
  const board = cleanBoard(f, input.boardId, who, true), as = checkAs(f, board, input.as, who);
  const only = input.private ? [...new Set(input.private.filter(u => u !== who.userId))].slice(0, FORUM_LIMITS.privateMembers) : undefined;
  const title = cleanTitle(input.title), body = cleanBody(input.body);
  if (f.topics.length >= FORUM_LIMITS.topics) fail("This forum has as many topics as it can hold. Ask your GM to remove old ones.");
  const by = { userId: who.userId, as }, stamp = now.toISOString();
  const topic: Topic = { schemaVersion: 1, id: ids.topic, boardId: board.id, posts: [{ id: ids.post, by, body, at: stamp, ...withRolls(input.rolls) }] };
  const summary = summarize(topic, { title, pinned: false, locked: false, ...(only ? { private: only } : {}) });
  const log: Recent = { at: stamp, userId: who.userId, as, topicId: topic.id, postId: ids.post };
  return { topic, forum: g => logPost(addCharacter(addCount(putSummary(g, summary), who.userId, 1), as), log), out: { topicId: topic.id } };
}

export function reply(f: Forum, topic: Topic, input: { body: unknown; as: string | null; rolls?: (Roll | null)[] }, who: Poster, postId: string, now: Date): Change<{ postId: string }> {
  const s = seenBy(f, topic.id, who), board = cleanBoard(f, s.boardId, who, false);
  if (s.archived) fail("This topic is archived. A moderator can bring it back to reply.");
  if (s.locked && !who.rights.moderate) fail("This topic is locked.");
  if (topic.posts.length >= FORUM_LIMITS.posts) fail("This topic is full. Start a new one to carry on.");
  const as = checkAs(f, board, input.as, who), body = cleanBody(input.body);
  // In a fight, a post in the current turn is marked with it.
  const turn = s.combat && countsFor(s.combat, as, who.rights.gm) ? turnMeta(s.combat) : undefined;
  const next: Topic = { ...topic, boardId: s.boardId, posts: [...topic.posts, { id: postId, by: { userId: who.userId, as }, body, at: now.toISOString(), ...withRolls(input.rolls), ...(turn ? { turn } : {}) }] };
  const log: Recent = { at: now.toISOString(), userId: who.userId, as, topicId: topic.id, postId };
  return {
    topic: next, out: { postId },
    forum: (g, latest) => {
      const cur = g.topics.find(t => t.id === topic.id) ?? s, combat = cur.combat ? afterPost(cur.combat, as, who.rights.gm) : undefined;
      return logPost(addCharacter(addCount(putSummary(g, summarize(latest ?? next, { ...cur, combat })), who.userId, 1), as), log);
    },
  };
}

const postOf = (topic: Topic, postId: string) => topic.posts.find(p => p.id === postId) ?? fail("That post was removed.");
const mayChange = (p: Post, who: Poster) => p.by.userId === who.userId || who.rights.moderate;

export function editPost(f: Forum, topic: Topic, input: { postId: string; body: unknown; reroll?: (old: (Roll | null)[] | undefined, body: string) => (Roll | null)[] }, who: Poster, now: Date): Change {
  const s = seenBy(f, topic.id, who), p = postOf(topic, input.postId);
  if (!mayChange(p, who)) fail("You can only edit your own posts.");
  if (s.locked && !who.rights.moderate) fail("This topic is locked.");
  const body = cleanBody(input.body);
  const rolls = input.reroll ? input.reroll(p.rolls, body) : p.rolls;
  const next: Topic = { ...topic, posts: topic.posts.map(x => { if (x.id !== p.id) return x; const y = { ...x, body, editedAt: now.toISOString() }; delete y.rolls; return { ...y, ...withRolls(rolls) }; }) };
  return { topic: next, forum: g => g };
}

/** Deletes one post. The first post can only go with the whole topic. */
export function deletePost(f: Forum, topic: Topic, input: { postId: string }, who: Poster): Change {
  const s = seenBy(f, topic.id, who), p = postOf(topic, input.postId);
  if (!mayChange(p, who)) fail("You can only delete your own posts.");
  if (s.locked && !who.rights.moderate) fail("This topic is locked.");
  if (topic.posts[0]!.id === p.id) return topic.posts.length === 1 ? removeTopic(topic) : fail("The first post starts the topic. Delete the topic instead.");
  const next: Topic = { ...topic, posts: topic.posts.filter(x => x.id !== p.id) };
  return { topic: next, forum: (g, latest) => { const cur = g.topics.find(t => t.id === topic.id) ?? s; return unlog(addCount(putSummary(g, summarize(latest ?? next, cur)), p.by.userId, -1), r => r.postId === p.id); } };
}

const removeTopic = (topic: Topic): Change => ({
  topic: null,
  forum: g => unlog(topic.posts.reduce((x, p) => addCount(x, p.by.userId, -1), { ...g, topics: g.topics.filter(t => t.id !== topic.id) }), r => r.topicId === topic.id),
});
/** Moderators delete a whole topic for good (from the Trash); its posts come off their writers' counts. */
export function deleteTopic(f: Forum, topic: Topic, who: Poster): Change {
  summaryOf(f, topic.id);
  if (!who.rights.moderate) fail("Only moderators can delete a topic.");
  return removeTopic(topic);
}
/** Moderators move a topic to the Trash, or bring it back. It keeps its posts and counts until deleted for good. */
export function trashTopic(f: Forum, input: { topicId: string; restore?: boolean }, who: Poster, now: Date): Change {
  const s = summaryOf(f, input.topicId);
  if (!who.rights.moderate) fail("Only moderators can move topics to the Trash.");
  if (!input.restore && !canSee({ ...s, trashed: undefined }, who)) fail("That topic was removed.");
  const trashed = input.restore ? undefined : { at: now.toISOString(), by: who.userId };
  return { forum: g => ({ ...g, topics: g.topics.map(t => { if (t.id !== s.id) return t; const rest = { ...t }; delete rest.trashed; return trashed ? { ...rest, trashed } : rest; }) }) };
}
/** Moderators run a fight: start it (or change the order), move the turn on or back, or end it. */
export function setCombat(f: Forum, input: { topicId: string; op: "start" | "order" | "next" | "back" | "end"; order?: Slot[]; round?: number; turn?: number; source?: Combat["source"] }, who: Poster, known: ReadonlySet<string>, now: Date): Change {
  const s = seenBy(f, input.topicId, who);
  if (!who.rights.moderate) fail("Only moderators can run combat.");
  if (s.archived || s.trashed) fail(s.trashed ? "This topic is in the Trash." : "This topic is archived. A moderator can bring it back first.");
  if (input.op === "start" && kindOf(f, boardOf(f, s.boardId)) !== "ic") fail("Combat runs in in-character topics.");
  let combat: Combat | undefined;
  if (input.op === "start" || input.op === "order") {
    const order = cleanOrder(input.order ?? [], known);
    if (!order.length) fail("Add at least one turn.");
    const old = input.op === "order" ? s.combat : undefined;
    const round = Math.max(1, Math.min(9999, Math.floor(input.round ?? old?.round ?? 1))), turn = Math.max(0, Math.min(order.length - 1, Math.floor(input.turn ?? old?.turn ?? 0)));
    combat = { round, turn, order, done: [], at: now.toISOString(), ...(input.source ? { source: input.source } : old?.source && input.op === "order" ? { source: old.source } : {}) };
  } else if (input.op === "next" || input.op === "back") {
    if (!s.combat) fail("This topic isn't in combat.");
  }
  const op = input.op;
  return {
    forum: g => ({
      ...g, topics: g.topics.map(t => {
        if (t.id !== s.id) return t;
        const rest = { ...t }; delete rest.combat;
        if (op === "end") return rest;
        const c = combat ?? (t.combat ? step(t.combat, op === "back" ? -1 : 1) : undefined);
        return c ? { ...rest, combat: c } : rest;
      }),
    }),
  };
}
/** Topics whose time in the Trash is up. */
export const expiredTrash = (f: Forum, now: Date) => f.topics.filter(t => t.trashed && now.getTime() - new Date(t.trashed.at).getTime() > TRASH_DAYS * 86_400_000).map(t => t.id);

/** Pin, lock, rename or move a topic. Moderators, or the person who started it for its title. */
export function setTopic(f: Forum, topic: Topic | null, input: { topicId: string; pinned?: boolean; locked?: boolean; archived?: boolean; title?: unknown; boardId?: string }, who: Poster): Change {
  const s = seenBy(f, input.topicId, who), starter = s.by.userId === who.userId;
  const mod = input.pinned !== undefined || input.locked !== undefined || input.boardId !== undefined || input.archived !== undefined;
  if (mod && !who.rights.moderate) fail("Only moderators can pin, lock, archive or move topics.");
  if (input.title !== undefined && !starter && !who.rights.moderate) fail("Only the person who started it or a moderator can rename a topic.");
  const title = input.title === undefined ? undefined : cleanTitle(input.title);
  let moved: Topic | undefined;
  if (input.boardId !== undefined && input.boardId !== s.boardId) {
    const from = boardOf(f, s.boardId), to = boardOf(f, input.boardId);
    if (kindOf(f, from) !== kindOf(f, to)) fail("Topics move between in-character boards, or between out-of-character boards.");
    moved = { ...(topic ?? fail("That topic was removed.")), boardId: to.id };
  }
  const patch = (t: TopicSummary): TopicSummary => {
    const next: TopicSummary = { ...t, ...(input.pinned !== undefined ? { pinned: input.pinned } : {}), ...(input.locked !== undefined ? { locked: input.locked } : {}), ...(title ? { title } : {}), ...(moved ? { boardId: moved.boardId } : {}) };
    if (input.archived === true) next.archived = true;
    if (input.archived === false) delete next.archived;
    return next;
  };
  return { ...(moved ? { topic: moved } : {}), forum: g => ({ ...g, topics: g.topics.map(t => t.id === s.id ? patch(t) : t) }) };
}

/* Boards and settings: the GM, or groups that may add and arrange boards. */
const needBoards = (who: Poster) => { if (!who.rights.boards) fail("Your group can't change the boards."); };

export function setSettings(_f: Forum, input: unknown, who: Poster): Change {
  needBoards(who);
  const parsed = forumSettingsSchema.safeParse(input);
  if (!parsed.success) fail(parsed.error.issues.some(i => i.path[0] === "links") ? "Links need a name and an address starting with / or https://." : "Check the banner settings.");
  const settings = parsed.data!;
  return { forum: g => ({ ...g, settings }) };
}

export function addCategory(f: Forum, input: { name: unknown; kind: "ic" | "ooc" }, who: Poster, newId: string): Change<{ id: string }> {
  needBoards(who);
  const name = nameOf(60).safeParse(input.name);
  if (!name.success) fail("Give the category a name.");
  if (f.categories.length >= FORUM_LIMITS.categories) fail("That's as many categories as a forum can have.");
  const c: Category = { id: newId, name: name.data!, kind: input.kind === "ic" ? "ic" : "ooc" };
  return { forum: g => ({ ...g, categories: [...g.categories, c] }), out: { id: newId } };
}
export function editCategory(f: Forum, input: { id: string; name: unknown }, who: Poster): Change {
  needBoards(who);
  if (!f.categories.some(c => c.id === input.id)) fail("That category was removed.");
  const name = nameOf(60).safeParse(input.name);
  if (!name.success) fail("Give the category a name.");
  return { forum: g => ({ ...g, categories: g.categories.map(c => c.id === input.id ? { ...c, name: name.data! } : c) }) };
}
export function deleteCategory(f: Forum, input: { id: string }, who: Poster): Change {
  needBoards(who);
  if (f.boards.some(b => b.categoryId === input.id)) fail("Move or delete its boards first.");
  return { forum: g => ({ ...g, categories: g.categories.filter(c => c.id !== input.id) }) };
}

type BoardInput = { categoryId: string; parentId?: string | null; name: unknown; description?: unknown; placeId?: string | null; locked?: boolean; type?: Board["type"]; width?: Board["width"] };
function cleanBoardInput(f: Forum, input: BoardInput, self?: string): Omit<Board, "id"> {
  if (!f.categories.some(c => c.id === input.categoryId)) fail("That category was removed.");
  const parentId = input.parentId || null;
  if (parentId) {
    const parent = boardOf(f, parentId);
    if (parent.categoryId !== input.categoryId) fail("A subforum sits in the same category as its board.");
    if (parent.parentId) fail("Subforums go one level deep.");
    if (self && (parentId === self || f.boards.some(b => b.parentId === self))) fail("A board with subforums can't become a subforum.");
  }
  const name = nameOf(60).safeParse(input.name);
  if (!name.success) fail("Give the board a name.");
  const description = typeof input.description === "string" ? input.description.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  const cat = f.categories.find(c => c.id === input.categoryId)!.kind;
  // The kind is kept only when it differs from what the category gives, so a board follows its category by default.
  const type = input.type && input.type !== (cat === "ic" ? "location" : "ooc") ? input.type : undefined;
  const kind = type ? (type === "ooc" ? "ooc" : "ic") : cat;
  const width = input.width && input.width !== (kind === "ic" ? "full" : "half") ? input.width : undefined;
  // Only a location board is tied to a place.
  const placeId = (type ?? (cat === "ic" ? "location" : "ooc")) === "location" && input.placeId && id.safeParse(input.placeId).success ? input.placeId : undefined;
  return { categoryId: input.categoryId, parentId, name: name.data!, description, ...(placeId ? { placeId } : {}), ...(input.locked ? { locked: true } : {}), ...(type ? { type } : {}), ...(width ? { width } : {}) };
}
export function addBoard(f: Forum, input: BoardInput, who: Poster, newId: string): Change<{ id: string }> {
  needBoards(who);
  if (f.boards.length >= FORUM_LIMITS.boards) fail("That's as many boards as a forum can have.");
  const board: Board = { id: newId, ...cleanBoardInput(f, input) };
  return { forum: g => ({ ...g, boards: [...g.boards, board] }), out: { id: newId } };
}
export function editBoard(f: Forum, input: BoardInput & { id: string }, who: Poster): Change {
  needBoards(who);
  const old = boardOf(f, input.id), next: Board = { id: old.id, ...cleanBoardInput(f, input, old.id), ...(old.masks ? { masks: old.masks } : {}) };
  if (kindOf(f, old) !== kindOf(f, next) && f.topics.some(t => t.boardId === old.id)) fail("A board with topics stays in character or out of character.");
  return { forum: g => ({ ...g, boards: g.boards.map(b => b.id === old.id ? next : b) }) };
}
/** Sets a board's permission masks: per group, Yes, No or Never (left out: as the group says for the forum). */
export function setMasks(f: Forum, input: { id: string; masks: Record<string, Partial<Record<(typeof MASKED)[number], "yes" | "no" | "never">>> }, who: Poster, groups: readonly string[]): Change {
  needBoards(who);
  boardOf(f, input.id);
  const masks: NonNullable<Board["masks"]> = {};
  for (const [g, m] of Object.entries(input.masks)) {
    if (!groups.includes(g)) continue;
    const kept = Object.fromEntries(MASKED.flatMap(r => m[r] ? [[r, m[r]]] : []));
    if (Object.keys(kept).length) masks[g] = kept;
  }
  return { forum: g => ({ ...g, boards: g.boards.map(b => { if (b.id !== input.id) return b; const rest = { ...b }; delete rest.masks; return Object.keys(masks).length ? { ...rest, masks } : rest; }) }) };
}
export function deleteBoard(f: Forum, input: { id: string }, who: Poster): Change {
  needBoards(who);
  boardOf(f, input.id);
  if (f.boards.some(b => b.parentId === input.id)) fail("Delete or move its subforums first.");
  if (f.topics.some(t => t.boardId === input.id)) fail("Move or delete its topics first.");
  return { forum: g => ({ ...g, boards: g.boards.filter(b => b.id !== input.id) }) };
}
/** Moves a board up or down among the boards beside it (same category and parent), or a category among categories. */
export function moveItem(f: Forum, input: { id: string; what: "board" | "category"; by: -1 | 1 }, who: Poster): Change {
  needBoards(who);
  const swap = <T extends { id: string }>(list: T[], same: (x: T) => boolean): T[] => {
    const i = list.findIndex(x => x.id === input.id);
    if (i < 0) fail("That was removed.");
    const peers = list.map((x, n) => [x, n] as const).filter(([x]) => same(x)).map(([, n]) => n), at = peers.indexOf(i), j = peers[at + input.by];
    if (j === undefined) return list;
    const next = [...list];[next[i], next[j]] = [next[j]!, next[i]!];
    return next;
  };
  if (input.what === "category") return { forum: g => ({ ...g, categories: swap(g.categories, () => true) }) };
  const b = boardOf(f, input.id);
  return { forum: g => ({ ...g, boards: swap(g.boards, x => x.categoryId === b.categoryId && x.parentId === b.parentId) }) };
}

/** Boards in display order: each category's top boards, each followed by its subforums. */
export function boardTree(f: Forum) {
  return f.categories.map(c => ({ category: c, boards: f.boards.filter(b => b.categoryId === c.id && !b.parentId).map(b => ({ board: b, subs: f.boards.filter(x => x.parentId === b.id) })) }));
}
