/*
 * The handlers behind /api/forum, with who is asking, storage and the clock passed in so they can be tested.
 *
 * A campaign is named by a key: `c-<campaign id>` for the GM's own campaign (the signed-in person must own it) or
 * `m-<ref>` for a campaign they're a member of (lib/members-server.ts). The member list is read again on every
 * request, so a change of group or a removal applies at once. Same-origin only, small bodies, a per-person throttle.
 */
import { z } from "zod";
import { pageRights, type MemberList } from "../members.ts";
import { playerCampaign, type Workspace } from "../encyclopedia/world-model.ts";
import { createThrottle } from "../encyclopedia/throttle.ts";
import {
  FORUM_LIMITS, ForumError, addBoard, boardAccess, setCombat, setMasks, addCategory, canSee, deleteBoard, deleteCategory, deletePost, deleteTopic, editBoard, editCategory, editPost, expiredTrash, forumRights, kindOf, moveItem, reply, setSettings, setTopic, startTopic, trashTopic,
  type Change, type Forum, type Poster, type Topic, type TopicSummary,
} from "./model.ts";
import { activePage, boardPage, castOf, characterIds, forumImages, frameOf, memberName, membersFromKeys, membersPage, namesOf, playersOf, placesOf, searchPage, shownTopics, topicPage, trashPage, type Context } from "./view.ts";
import { addAlerts, mentioned, quoted, unseen, type Alert } from "./alerts.ts";
import { rollPost, secureDie, withRollResults } from "./rolls.ts";
import { orderFromScene, slotSchema } from "./combat.ts";
import type { Scene } from "../model.ts";
import type { ForumStore } from "./store.ts";
import { freshReads, markAll, markTopic } from "./reader.ts";

export type Found = { owner: string; campaignId: string; list: MemberList };
export type Deps = {
  sameOrigin: (r: Request) => boolean;
  /** The signed-in person's account id, or null. */
  user: () => Promise<string | null>;
  /** The campaign a key names for this person, with its member list; null when they may not open it. */
  campaign: (userId: string, key: string) => Promise<Found | null>;
  workspace: (owner: string) => Promise<Workspace>;
  store: Pick<ForumStore, "read" | "readTopic" | "apply" | "readReads" | "writeReads" | "readPresence" | "touchPresence" | "readAlerts" | "writeAlerts">;
  /** A signed address for one of the owner's pictures. */
  image?: (owner: string, imageId: string) => Promise<{ url: string } | null>;
  now?: () => Date;
  newId?: () => string;
  /** Dice: a whole number from 1 to `sides` (tests pass their own). */
  random?: (sides: number) => number;
  /** The GM's Maptable scenes in a Maptable campaign, for starting combat from its initiative. */
  scenes?: (owner: string, maptableCampaignId: string) => Promise<Scene[]>;
};

export const FORUM_BODY = 64_000;
export const keyPattern = /^(?:m-[a-f0-9]{64}|c-[A-Za-z0-9_-]{1,100})$/;
const readThrottle = createThrottle(30, 10_000), writeThrottle = createThrottle(12, 10_000), imageThrottle = createThrottle(120, 10_000);
export const resetForumThrottles = () => { readThrottle.reset(); writeThrottle.reset(); imageThrottle.reset(); };

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const id = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
const key = z.string().regex(keyPattern);
const as = id.nullable();
const boardFields = { categoryId: id, parentId: id.nullable().optional(), name: z.string().max(200), description: z.string().max(1000).optional(), placeId: id.nullable().optional(), locked: z.boolean().optional(), type: z.enum(["location", "campaign", "ooc"]).optional(), width: z.enum(["full", "half"]).optional() };
const pageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("index") }), z.object({ kind: z.literal("active") }), z.object({ kind: z.literal("members") }), z.object({ kind: z.literal("settings") }),
  z.object({ kind: z.literal("board"), id, archive: z.boolean().optional() }), z.object({ kind: z.literal("topic"), id }), z.object({ kind: z.literal("trash") }),
  z.object({ kind: z.literal("search"), q: z.string().trim().min(2).max(100), boardId: id.optional() }),
]);
const bulkOps = ["pin", "unpin", "lock", "unlock", "archive", "unarchive", "trash", "move"] as const;
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("view"), campaign: key, page: pageSchema }),
  z.object({ action: z.literal("start"), campaign: key, boardId: id, title: z.string().max(500), body: z.string().max(40_000), as, private: z.array(z.string().regex(/^[a-f0-9]{16}$/)).max(FORUM_LIMITS.privateMembers).optional() }),
  z.object({ action: z.literal("reply"), campaign: key, topicId: id, body: z.string().max(40_000), as }),
  z.object({ action: z.literal("edit"), campaign: key, topicId: id, postId: id, body: z.string().max(40_000) }),
  z.object({ action: z.literal("delete"), campaign: key, topicId: id, postId: id }),
  z.object({ action: z.literal("deleteTopic"), campaign: key, topicId: id }),
  z.object({ action: z.literal("topic"), campaign: key, topicId: id, pinned: z.boolean().optional(), locked: z.boolean().optional(), archived: z.boolean().optional(), title: z.string().max(500).optional(), boardId: id.optional() }),
  z.object({ action: z.literal("trash"), campaign: key, topicId: id, restore: z.boolean().optional() }),
  z.object({ action: z.literal("bulk"), campaign: key, topicIds: z.array(id).min(1).max(FORUM_LIMITS.bulk), op: z.enum(bulkOps), boardId: id.optional() }),
  z.object({ action: z.literal("export"), campaign: key, boardId: id }),
  z.object({ action: z.literal("alertsSeen"), campaign: key }),
  z.object({ action: z.literal("combat"), campaign: key, topicId: id, op: z.enum(["start", "order", "next", "back", "end"]), order: z.array(slotSchema).max(40).optional(), round: z.number().int().min(1).max(9999).optional(), turn: z.number().int().min(0).max(39).optional(), sceneId: z.string().min(1).max(160).optional() }),
  z.object({ action: z.literal("combatSources"), campaign: key }),
  z.object({ action: z.literal("settings"), campaign: key, settings: z.unknown() }),
  z.object({ action: z.literal("addCategory"), campaign: key, name: z.string().max(200), kind: z.enum(["ic", "ooc"]) }),
  z.object({ action: z.literal("editCategory"), campaign: key, id, name: z.string().max(200) }),
  z.object({ action: z.literal("deleteCategory"), campaign: key, id }),
  z.object({ action: z.literal("addBoard"), campaign: key, ...boardFields }),
  z.object({ action: z.literal("editBoard"), campaign: key, id, ...boardFields }),
  z.object({ action: z.literal("masks"), campaign: key, id, masks: z.record(id, z.object({ read: z.enum(["yes", "no", "never"]).optional(), start: z.enum(["yes", "no", "never"]).optional(), reply: z.enum(["yes", "no", "never"]).optional() })) }),
  z.object({ action: z.literal("deleteBoard"), campaign: key, id }),
  z.object({ action: z.literal("move"), campaign: key, id, what: z.enum(["board", "category"]), by: z.union([z.literal(-1), z.literal(1)]) }),
  z.object({ action: z.literal("readAll"), campaign: key }),
]);
type Body = z.infer<typeof bodySchema>;

const signIn = "Sign in to open the forum.";
const notMember = "You can't open this forum. You may have left the campaign, or the GM changed what your group can do.";

/** Who is asking and what they may see: the context the views and changes need. */
async function contextOf(deps: Deps, campaign: string, now: Date, marks = true) {
  const userId = await deps.user();
  if (!userId) return { fail: json({ error: signIn }, 401) };
  const found = await deps.campaign(userId, campaign);
  if (!found) return { fail: json({ error: notMember }, 404) };
  const rights = forumRights(found.list, userId, found.owner);
  if (!rights.read) return { fail: json({ error: "Your group can't read the forum." }, 403) };
  const workspace = await deps.workspace(found.owner);
  if (!workspace.campaigns.some(c => c.id === found.campaignId)) return { fail: json({ error: notMember }, 404) };
  const editable = rights.owner ? new Set<string>() : pageRights(found.list, userId).edit;
  // Players read the pages the player view gives them; the GM and co-GMs read every page.
  const readable = rights.gm ? null : new Set(playerCampaign(workspace, found.campaignId, editable).entries.map(e => e.id));
  // Pictures don't need read marks or presence.
  const none = { reads: null, presence: null, alerts: null, etag: null };
  const [{ forum }, mine, presence, alerts] = await Promise.all([
    deps.store.read(found.owner, found.campaignId),
    marks ? deps.store.readReads(found.owner, found.campaignId, userId) : none, marks ? deps.store.readPresence(found.owner, found.campaignId) : none,
    marks ? deps.store.readAlerts(found.owner, found.campaignId, userId).catch(() => none) : none,
  ]);
  // A first visit starts with everything before the member joined (the GM: before now) marked read.
  const joined = found.list.members.find(m => m.userId === userId)?.joinedAt;
  const reads = mine.reads ?? freshReads(joined && joined < now.toISOString() ? joined : now.toISOString());
  const ctx: Context = { forum, list: found.list, owner: found.owner, workspace, campaignId: found.campaignId, viewer: { userId, rights, key: campaign, editable, access: boardAccess(forum, found.list, userId, rights) }, readable, reads, presence: presence.presence, alerts: alerts.alerts, now };
  return { ctx, found, userId, fresh: marks && !mine.reads, presence };
}

async function view(deps: Deps, ctx: Context, found: Found, page: z.infer<typeof pageSchema>) {
  switch (page.kind) {
    case "board": { const p = boardPage(ctx, page.id, { archive: page.archive }); return p ? json({ frame: frameOf(ctx), page: { kind: "board", ...p } }) : json({ error: "That board was removed." }, 404); }
    case "topic": {
      const stored = await deps.store.readTopic(found.owner, found.campaignId, page.id), p = stored ? topicPage(ctx, stored.topic) : null;
      if (!p) return json({ error: "That topic was removed." }, 404);
      // Opening a topic reads it: the frame (unread counts) already shows it read.
      const s = ctx.forum.topics.find(t => t.id === page.id)!, live = new Set(ctx.forum.topics.map(t => t.id));
      const marked = ctx.reads && markTopic(ctx.reads, s.id, s.lastAt, live);
      if (marked) {
        ctx.reads = marked;
        await deps.store.writeReads(found.owner, found.campaignId, ctx.viewer.userId, r => markTopic(r ?? marked, s.id, s.lastAt, live)).catch(() => undefined);
      }
      return json({ frame: frameOf(ctx), page: { kind: "topic", ...p } });
    }
    case "active": return json({ frame: frameOf(ctx), page: { kind: "active", ...activePage(ctx) } });
    case "trash": {
      if (!ctx.viewer.rights.moderate) return json({ error: "Only moderators can open the Trash." }, 403);
      // Topics whose 30 days are up go for good when a moderator next opens the Trash.
      const who = posterOf(ctx);
      for (const topicId of expiredTrash(ctx.forum, ctx.now ?? new Date()).slice(0, 10)) {
        await deps.store.apply(found.owner, found.campaignId, topicId, (f, t) => t ? deleteTopic(f, t, who) : { forum: g => ({ ...g, topics: g.topics.filter(x => x.id !== topicId) }) }).catch(() => undefined);
      }
      ctx.forum = (await deps.store.read(found.owner, found.campaignId)).forum;
      return json({ frame: frameOf(ctx), page: { kind: "trash", ...trashPage(ctx) } });
    }
    case "search": {
      // The latest topics first, at most SEARCH_TOPICS of them read for their posts.
      const all = shownTopics(ctx).filter(t => !page.boardId || t.boardId === page.boardId).sort((a, b) => b.lastAt.localeCompare(a.lastAt));
      const pick = all.slice(0, SEARCH_TOPICS), got: { summary: (typeof pick)[number]; topic: Topic | null }[] = [];
      for (let i = 0; i < pick.length; i += 10) {
        const batch = await Promise.all(pick.slice(i, i + 10).map(t => deps.store.readTopic(found.owner, found.campaignId, t.id).catch(() => null)));
        batch.forEach((b, n) => got.push({ summary: pick[i + n]!, topic: b?.topic ?? null }));
      }
      return json({ frame: frameOf(ctx), page: { kind: "search", boardId: page.boardId ?? null, ...searchPage(ctx, page.q, got, { of: all.length }) } });
    }
    case "members": return json({ frame: frameOf(ctx), page: { kind: "members", ...membersPage(ctx) } });
    case "settings": {
      if (!ctx.viewer.rights.boards) return json({ error: "Your group can't change the boards." }, 403);
      const groups = ctx.list.groups.map(g => ({ id: g.id, name: g.name, read: g.perms.forumRead ?? "no", start: g.perms.forumStart ?? "no", reply: g.perms.forumReply ?? "no", gm: g.perms.seeGm === "yes" }));
      const masks = Object.fromEntries(ctx.forum.boards.flatMap(b => b.masks ? [[b.id, b.masks]] : []));
      return json({ frame: frameOf(ctx), page: { kind: "settings", places: placesOf(ctx), settings: ctx.forum.settings, groups, masks } });
    }
    default: return json({ frame: frameOf(ctx), page: { kind: "index" } });
  }
}

const SEARCH_TOPICS = 150;
const posterOf = (ctx: Context): Poster => ({ userId: ctx.viewer.userId, rights: ctx.viewer.rights, cast: new Set(castOf(ctx).map(c => c.id)), access: ctx.viewer.access });

/** A board's topics with their posts, as text (GMs only, as players shouldn't take a whole board away). */
async function exportBoard(deps: Deps, ctx: Context, found: Found, boardId: string) {
  if (!ctx.viewer.rights.gm) throw new ForumError("Only the GM can download a whole board.");
  const board = ctx.forum.boards.find(b => b.id === boardId) ?? (() => { throw new ForumError("That board was removed."); })();
  const ic = kindOf(ctx.forum, board) === "ic", names = new Map(castOf(ctx).map(c => [c.id, c.name]));
  const topics = shownTopics(ctx).filter(t => t.boardId === boardId).sort((a, b) => a.at.localeCompare(b.at)).slice(0, 300), out = [];
  for (let i = 0; i < topics.length; i += 10) {
    const batch = await Promise.all(topics.slice(i, i + 10).map(t => deps.store.readTopic(found.owner, found.campaignId, t.id)));
    for (const [n, got] of batch.entries()) {
      if (!got) continue;
      out.push({ title: topics[i + n]!.title, posts: got.topic.posts.map(p => ({ name: p.by.as ? names.get(p.by.as) ?? "A character" : ic ? "Game Master" : memberName(ctx, p.by.userId), by: memberName(ctx, p.by.userId), at: p.at, body: withRollResults(p.body, p.rolls) })) });
    }
  }
  return { board: board.name, topics: out };
}

/** Runs one change through the store. Changes that touch a topic read it there first. */
function change(deps: Deps, ctx: Context, found: Found, body: Exclude<Body, { action: "view" }>, now: Date) {
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const who = posterOf(ctx);
  const run = <T>(topicId: string | null, make: (f: Forum, t: Topic | null) => Change<T>) => deps.store.apply(found.owner, found.campaignId, topicId, make);
  const random = deps.random ?? secureDie;
  const needTopic = (t: Topic | null) => t ?? (() => { throw new ForumError("That topic was removed."); })();
  switch (body.action) {
    case "start": {
      const ids = { topic: newId(), post: newId() }, only = body.private ? membersFromKeys(ctx, body.private) : undefined;
      return run(null, f => startTopic(f, { ...body, private: only, rolls: rollPost(body.body, random) }, who, ids, now));
    }
    case "reply": { const postId = newId(), rolls = rollPost(body.body, random); return run(body.topicId, (f, t) => reply(f, needTopic(t), { ...body, rolls }, who, postId, now)); }
    case "edit": return run(body.topicId, (f, t) => editPost(f, needTopic(t), { ...body, reroll: (old, text) => rollPost(text, random, old ?? [], now) }, who, now));
    case "combat": return runCombat(deps, ctx, found, body, who, now);
    case "combatSources": return combatSources(deps, ctx, found);
    case "delete": return run(body.topicId, (f, t) => deletePost(f, needTopic(t), body, who));
    case "deleteTopic": return run(body.topicId, (f, t) => deleteTopic(f, needTopic(t), who));
    case "topic": return run(body.boardId !== undefined ? body.topicId : null, (f, t) => setTopic(f, t, body, who));
    case "settings": return run(null, f => setSettings(f, body.settings, who));
    case "addCategory": { const n = newId(); return run(null, f => addCategory(f, body, who, n)); }
    case "editCategory": return run(null, f => editCategory(f, body, who));
    case "deleteCategory": return run(null, f => deleteCategory(f, body, who));
    case "addBoard": { const n = newId(); return run(null, f => addBoard(f, body, who, n)); }
    case "editBoard": return run(null, f => editBoard(f, body, who));
    case "masks": return run(null, f => setMasks(f, body, who, ctx.list.groups.map(g => g.id)));
    case "deleteBoard": return run(null, f => deleteBoard(f, body, who));
    case "move": return run(null, f => moveItem(f, body, who));
    case "trash": return run(null, f => trashTopic(f, body, who, now));
    case "bulk": return bulk(deps, ctx, found, body, who, now);
    case "export": return exportBoard(deps, ctx, found, body.boardId);
    case "alertsSeen": return deps.store.writeAlerts(found.owner, found.campaignId, ctx.viewer.userId, a => a && unseen(a) ? { ...a, seen: now.toISOString() } : null).then(() => undefined);
    case "readAll": return deps.store.writeReads(found.owner, found.campaignId, ctx.viewer.userId, () => markAll(now)).then(() => undefined);
  }
}

/** Multi-moderation: one change per topic, in turn. Reports how many changed and the first problem, if any. */
async function bulk(deps: Deps, ctx: Context, found: Found, body: Extract<Body, { action: "bulk" }>, who: Poster, now: Date) {
  if (!who.rights.moderate) throw new ForumError("Only moderators can moderate topics.");
  if (body.op === "move" && !body.boardId) throw new ForumError("Choose a board to move them to.");
  let done = 0, problem = "";
  for (const topicId of [...new Set(body.topicIds)]) {
    const s = ctx.forum.topics.find(t => t.id === topicId);
    if (!s || !canSee(s, ctx.viewer)) continue;
    try {
      if (body.op === "trash") await deps.store.apply(found.owner, found.campaignId, null, f => trashTopic(f, { topicId }, who, now));
      else {
        const patch = { pin: { pinned: true }, unpin: { pinned: false }, lock: { locked: true }, unlock: { locked: false }, archive: { archived: true }, unarchive: { archived: false }, move: { boardId: body.boardId } }[body.op];
        await deps.store.apply(found.owner, found.campaignId, body.op === "move" ? topicId : null, (f, t) => setTopic(f, t, { topicId, ...patch }, who));
      }
      done++;
    } catch (e) { if (!problem) problem = e instanceof ForumError ? e.message : "Some topics couldn't be changed."; }
  }
  return { done, ...(problem ? { problem } : {}) };
}

/** The Maptable campaign paired with this one, if any. */
const maptableOf = (ctx: Context) => ctx.workspace.campaigns.find(c => c.id === ctx.campaignId)?.maptableCampaignId ?? null;

/** Scenes in the paired Maptable campaign whose initiative tracker has a fight in it (moderators). */
async function combatSources(deps: Deps, ctx: Context, found: Found) {
  if (!ctx.viewer.rights.moderate) throw new ForumError("Only moderators can run combat.");
  const mt = maptableOf(ctx);
  if (!mt || !deps.scenes) return { paired: false, scenes: [] };
  const known = characterIds(ctx), scenes = (await deps.scenes(found.owner, mt).catch(() => [])).flatMap(sc => { const o = orderFromScene(sc, known); return o ? [o] : []; });
  return { paired: true, scenes: scenes.slice(0, 30) };
}
async function runCombat(deps: Deps, ctx: Context, found: Found, body: Extract<Body, { action: "combat" }>, who: Poster, now: Date) {
  let input: Parameters<typeof setCombat>[1] = { topicId: body.topicId, op: body.op, order: body.order, round: body.round, turn: body.turn };
  if (body.sceneId) {
    // The order comes from the scene as it is now, read on the server.
    const mt = maptableOf(ctx), scene = mt && deps.scenes ? (await deps.scenes(found.owner, mt).catch(() => [])).find(sc => sc.id === body.sceneId) : undefined;
    const o = scene ? orderFromScene(scene, characterIds(ctx)) : null;
    if (!o) throw new ForumError("That Maptable scene has no fight in its initiative tracker.");
    input = { ...input, order: body.order ?? o.order, round: body.round ?? o.round, turn: body.turn ?? o.turn, source: { sceneId: o.sceneId, name: o.name } };
  }
  return deps.store.apply(found.owner, found.campaignId, null, f => setCombat(f, input, who, characterIds(ctx), now));
}

/**
 * Alerts for a new post: members it @names (or whose characters it names), members it quotes, and members a new
 * private topic is for. Only those who can see the topic hear about it, never the writer. Best effort.
 */
async function sendAlerts(deps: Deps, ctx: Context, found: Found, post: { topicId: string; postId?: string; body: string; as: string | null; private: string[] }, now: Date) {
  const { forum } = await deps.store.read(found.owner, found.campaignId), s = forum.topics.find(t => t.id === post.topicId);
  if (!s) return;
  const names = namesOf(ctx), all = [...names.keys()], to = new Map<string, Alert["kind"]>();
  for (const n of mentioned(post.body, all)) for (const u of names.get(n)!) to.set(u, "mention");
  for (const n of quoted(post.body, all)) for (const u of names.get(n)!) if (!to.has(u)) to.set(u, "quote");
  for (const u of post.private) if (!to.has(u)) to.set(u, "private");
  for (const u of turnTakers(ctx, found, s)) if (!to.has(u)) to.set(u, "turn");
  to.delete(ctx.viewer.userId);
  await Promise.all([...to].slice(0, 30).map(async ([u, kind]) => {
    const rights = forumRights(ctx.list, u, found.owner);
    if (!rights.read || !canSee(s, { userId: u, rights, access: boardAccess(forum, ctx.list, u, rights) })) return;
    const item: Alert = { id: kind === "turn" ? `turn:${post.topicId}:${s.combat!.round}:${s.combat!.turn}` : `${kind}:${post.topicId}:${post.postId ?? "first"}`, at: now.toISOString(), kind, topicId: post.topicId, ...(post.postId ? { postId: post.postId } : {}), by: ctx.viewer.userId, as: post.as };
    await deps.store.writeAlerts(found.owner, found.campaignId, u, a => addAlerts(a, [item], now)).catch(() => undefined);
  }));
}

/** Who to tell that a fight came round to them: the players of the new turn's characters, or the GM for NPCs. */
function turnTakers(ctx: Context, found: Found, s: TopicSummary) {
  const before = ctx.forum.topics.find(t => t.id === s.id)?.combat, after = s.combat;
  if (!after || (before && before.round === after.round && before.turn === after.turn)) return [];
  const slot = after.order[after.turn];
  if (!slot) return [];
  return slot.as.length ? [...new Set(slot.as.flatMap(a => [...playersOf(ctx, a)]))] : [found.owner];
}

export async function handleForum(request: Request, deps: Deps) {
  try {
    if (!deps.sameOrigin(request)) return json({ error: "A same-origin request is required." }, 403);
    if (Number(request.headers.get("content-length") ?? 0) > FORUM_BODY) return json({ error: "That post is too long." }, 413);
    const text = await request.text();
    if (text.length > FORUM_BODY) return json({ error: "That post is too long." }, 413);
    const body = bodySchema.parse(JSON.parse(text)), now = deps.now?.() ?? new Date();
    const got = await contextOf(deps, body.campaign, now);
    if (got.fail) return got.fail;
    const { ctx, found, userId } = got;
    if ((body.action === "view" ? readThrottle : writeThrottle).hit(userId)) return json({ error: "Slow down a moment, then try again." }, 429);
    // Any visit notes that they're online and, the first time, keeps where their read marks start. Best effort.
    await Promise.all([
      deps.store.touchPresence(found.owner, found.campaignId, userId, now, got.presence).catch(() => undefined),
      got.fresh && ctx.reads ? deps.store.writeReads(found.owner, found.campaignId, userId, r => r ? null : ctx.reads!).catch(() => undefined) : undefined,
    ]);
    if (body.action === "view") return await view(deps, ctx, found, body.page);
    const out = await change(deps, ctx, found, body, now);
    if (body.action === "start" || body.action === "reply") {
      const made = out as { topicId?: string; postId?: string } | undefined;
      const topicId = body.action === "start" ? made?.topicId : body.topicId;
      if (topicId) await sendAlerts(deps, ctx, found, { topicId, postId: made?.postId, body: body.body, as: body.as, private: body.action === "start" && body.private ? membersFromKeys(ctx, body.private) : [] }, now).catch(() => undefined);
    }
    if (body.action === "combat") await sendAlerts(deps, ctx, found, { topicId: body.topicId, body: "", as: null, private: [] }, now).catch(() => undefined);
    return json({ ok: true, ...(out ?? {}) });
  } catch (e) {
    if (e instanceof ForumError) return json({ error: e.message }, 400);
    if (e instanceof z.ZodError || e instanceof SyntaxError) return json({ error: "That request isn't valid." }, 400);
    return json({ error: "The forum is unavailable right now." }, 500);
  }
}

/** GET /api/forum?c=<key>&image=<id>: a picture the forum shows (forumImages), as a short-lived signed address. */
export async function handleForumImage(request: Request, deps: Deps) {
  try {
    const url = new URL(request.url), campaign = url.searchParams.get("c") ?? "", imageId = url.searchParams.get("image") ?? "";
    if (!keyPattern.test(campaign) || !/^[A-Za-z0-9_-]{1,100}$/.test(imageId)) return json({ error: "Picture unavailable" }, 404);
    const got = await contextOf(deps, campaign, deps.now?.() ?? new Date(), false);
    if (got.fail) return got.fail;
    if (imageThrottle.hit(got.userId)) return json({ error: "Slow down a moment." }, 429);
    if (!forumImages(got.ctx).has(imageId) || !deps.image) return json({ error: "Picture unavailable" }, 404);
    const image = await deps.image(got.found.owner, imageId);
    return image ? new Response(null, { status: 303, headers: { Location: image.url, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } }) : json({ error: "Picture unavailable" }, 404);
  } catch { return json({ error: "Picture unavailable" }, 404); }
}
