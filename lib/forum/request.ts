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
  ForumError, addBoard, addCategory, deleteBoard, deleteCategory, deletePost, deleteTopic, editBoard, editCategory, editPost, forumRights, moveItem, reply, setSettings, setTopic, startTopic,
  type Change, type Forum, type Poster, type Topic,
} from "./model.ts";
import { activePage, boardPage, castOf, forumImages, frameOf, membersPage, placesOf, topicPage, type Context } from "./view.ts";
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
  store: Pick<ForumStore, "read" | "readTopic" | "apply" | "readReads" | "writeReads" | "readPresence" | "touchPresence">;
  /** A signed address for one of the owner's pictures. */
  image?: (owner: string, imageId: string) => Promise<{ url: string } | null>;
  now?: () => Date;
  newId?: () => string;
};

export const FORUM_BODY = 64_000;
export const keyPattern = /^(?:m-[a-f0-9]{64}|c-[A-Za-z0-9_-]{1,100})$/;
const readThrottle = createThrottle(30, 10_000), writeThrottle = createThrottle(12, 10_000), imageThrottle = createThrottle(120, 10_000);
export const resetForumThrottles = () => { readThrottle.reset(); writeThrottle.reset(); imageThrottle.reset(); };

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const id = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
const key = z.string().regex(keyPattern);
const as = id.nullable();
const boardFields = { categoryId: id, parentId: id.nullable().optional(), name: z.string().max(200), description: z.string().max(1000).optional(), placeId: id.nullable().optional(), locked: z.boolean().optional() };
const pageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("index") }), z.object({ kind: z.literal("active") }), z.object({ kind: z.literal("members") }), z.object({ kind: z.literal("settings") }),
  z.object({ kind: z.literal("board"), id }), z.object({ kind: z.literal("topic"), id }),
]);
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("view"), campaign: key, page: pageSchema }),
  z.object({ action: z.literal("start"), campaign: key, boardId: id, title: z.string().max(500), body: z.string().max(40_000), as }),
  z.object({ action: z.literal("reply"), campaign: key, topicId: id, body: z.string().max(40_000), as }),
  z.object({ action: z.literal("edit"), campaign: key, topicId: id, postId: id, body: z.string().max(40_000) }),
  z.object({ action: z.literal("delete"), campaign: key, topicId: id, postId: id }),
  z.object({ action: z.literal("deleteTopic"), campaign: key, topicId: id }),
  z.object({ action: z.literal("topic"), campaign: key, topicId: id, pinned: z.boolean().optional(), locked: z.boolean().optional(), title: z.string().max(500).optional(), boardId: id.optional() }),
  z.object({ action: z.literal("settings"), campaign: key, settings: z.unknown() }),
  z.object({ action: z.literal("addCategory"), campaign: key, name: z.string().max(200), kind: z.enum(["ic", "ooc"]) }),
  z.object({ action: z.literal("editCategory"), campaign: key, id, name: z.string().max(200) }),
  z.object({ action: z.literal("deleteCategory"), campaign: key, id }),
  z.object({ action: z.literal("addBoard"), campaign: key, ...boardFields }),
  z.object({ action: z.literal("editBoard"), campaign: key, id, ...boardFields }),
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
  const none = { reads: null, presence: null, etag: null };
  const [{ forum }, mine, presence] = await Promise.all([
    deps.store.read(found.owner, found.campaignId),
    marks ? deps.store.readReads(found.owner, found.campaignId, userId) : none, marks ? deps.store.readPresence(found.owner, found.campaignId) : none,
  ]);
  // A first visit starts with everything before the member joined (the GM: before now) marked read.
  const joined = found.list.members.find(m => m.userId === userId)?.joinedAt;
  const reads = mine.reads ?? freshReads(joined && joined < now.toISOString() ? joined : now.toISOString());
  const ctx: Context = { forum, list: found.list, owner: found.owner, workspace, campaignId: found.campaignId, viewer: { userId, rights, key: campaign, editable }, readable, reads, presence: presence.presence, now };
  return { ctx, found, userId, fresh: marks && !mine.reads, presence };
}

async function view(deps: Deps, ctx: Context, found: Found, page: z.infer<typeof pageSchema>) {
  switch (page.kind) {
    case "board": { const p = boardPage(ctx, page.id); return p ? json({ frame: frameOf(ctx), page: { kind: "board", ...p } }) : json({ error: "That board was removed." }, 404); }
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
    case "members": return json({ frame: frameOf(ctx), page: { kind: "members", ...membersPage(ctx) } });
    case "settings": return ctx.viewer.rights.boards ? json({ frame: frameOf(ctx), page: { kind: "settings", places: placesOf(ctx), settings: ctx.forum.settings } }) : json({ error: "Your group can't change the boards." }, 403);
    default: return json({ frame: frameOf(ctx), page: { kind: "index" } });
  }
}

/** Runs one change through the store. Changes that touch a topic read it there first. */
function change(deps: Deps, ctx: Context, found: Found, body: Exclude<Body, { action: "view" }>, now: Date) {
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const who: Poster = { userId: ctx.viewer.userId, rights: ctx.viewer.rights, cast: new Set(castOf(ctx).map(c => c.id)) };
  const run = <T>(topicId: string | null, make: (f: Forum, t: Topic | null) => Change<T>) => deps.store.apply(found.owner, found.campaignId, topicId, make);
  const needTopic = (t: Topic | null) => t ?? (() => { throw new ForumError("That topic was removed."); })();
  switch (body.action) {
    case "start": { const ids = { topic: newId(), post: newId() }; return run(null, f => startTopic(f, body, who, ids, now)); }
    case "reply": { const postId = newId(); return run(body.topicId, (f, t) => reply(f, needTopic(t), body, who, postId, now)); }
    case "edit": return run(body.topicId, (f, t) => editPost(f, needTopic(t), body, who, now));
    case "delete": return run(body.topicId, (f, t) => deletePost(f, needTopic(t), body, who));
    case "deleteTopic": return run(body.topicId, (f, t) => deleteTopic(f, needTopic(t), who));
    case "topic": return run(body.boardId !== undefined ? body.topicId : null, (f, t) => setTopic(f, t, body, who));
    case "settings": return run(null, f => setSettings(f, body.settings, who));
    case "addCategory": { const n = newId(); return run(null, f => addCategory(f, body, who, n)); }
    case "editCategory": return run(null, f => editCategory(f, body, who));
    case "deleteCategory": return run(null, f => deleteCategory(f, body, who));
    case "addBoard": { const n = newId(); return run(null, f => addBoard(f, body, who, n)); }
    case "editBoard": return run(null, f => editBoard(f, body, who));
    case "deleteBoard": return run(null, f => deleteBoard(f, body, who));
    case "move": return run(null, f => moveItem(f, body, who));
    case "readAll": return deps.store.writeReads(found.owner, found.campaignId, ctx.viewer.userId, () => markAll(now)).then(() => undefined);
  }
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
