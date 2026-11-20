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
  FORUM_LIMITS, EMOJI_BYTES, PICTURE_BYTES, ForumError, accessOn, addBoard, addUpload, mayUpload, setEmoji, setTopicTags, setCardDesign, setStrip, setProfile, DEFAULT_STRIP, decideSuggestion, dismissReports, reportPost, setAi, boardAccess, setCombat, setMasks, addCategory, canSee, deleteBoard, deleteCategory, deletePost, deleteTopic, editBoard, editCategory, editPost, expiredTrash, forumRights, kindOf, moveItem, reply, setSettings, setTopic, startTopic, trashTopic,
  type Change, type Forum, type Poster, type Topic, type TopicSummary,
} from "./model.ts";
import { cardFields, cardSample, profilePage, picturesPage, sheetPage, activePage, boardPage, reportedPosts, reportsPage, cardOf, castOf, entriesOf, characterIds, forumImages, frameOf, memberName, membersFromKeys, membersPage, namesOf, playersOf, placesOf, searchPage, shownTopics, topicPage, trashPage, type Context } from "./view.ts";
import { addAlerts, mentioned, quoted, unseen, type Alert } from "./alerts.ts";
import { rollPost, secureDie, withRollResults } from "./rolls.ts";
import { POST_FORMATS } from "./markup.ts";
import { CHECK_SYSTEM, DRAFT_SYSTEM, SUMMARY_SYSTEM, aiFor, checkPrompt, checkTool, draftPrompt, draftTool, readCheck, readDraft, readSummary, summaryPrompt, summaryTool, type AiPost } from "./ai.ts";
import { orderFromScene, slotSchema } from "./combat.ts";
import type { Scene } from "../model.ts";
import type { ForumStore } from "./store.ts";
import { freshReads, markAll, markTopic } from "./reader.ts";
import { isSolo, soloCharacters } from "../solo.ts";
import { THEME_AREAS, ThemeError, deleteTheme, liveTheme, makeLive, saveTheme, type ThemeArea } from "../campaign-theme/model.ts";
import type { ThemeStore } from "../campaign-theme/store.ts";

/** The made-up member a solo player's view is worked out for: one of the built-in Players group. */
const SOLO_PLAYER = "solo-player";
function asPlayer(list: MemberList) {
  const players = list.groups.find(g => g.builtin === "players");
  return { ...list, members: [...list.members, { userId: SOLO_PLAYER, name: "Player", groups: players ? [players.id] : [], joinedAt: "" }] };
}
/**
 * What a solo campaign's owner may do in the player view: what the Players group may (reading always, so the view
 * never locks them out of their own forum), and no moderating, board settings or GM-only things.
 */
export function soloPlayerRights(list: MemberList, owner: string) {
  const r = forumRights(asPlayer(list), SOLO_PLAYER, owner);
  return { ...r, owner: false, gm: false, moderate: false, boards: false, read: true };
}
/** The boards as a member of the Players group sees them in the player view, their masks applied. */
function soloPlayerAccess(forum: Forum, list: MemberList, owner: string) {
  const as = asPlayer(list), r = forumRights(as, SOLO_PLAYER, owner);
  return boardAccess(forum, as, SOLO_PLAYER, { ...r, owner: false, gm: false, moderate: false, boards: false });
}

export type Found = { owner: string; campaignId: string; list: MemberList };
export type Deps = {
  sameOrigin: (r: Request) => boolean;
  /** The signed-in person's account id, or null. */
  user: () => Promise<string | null>;
  /** The campaign a key names for this person, with its member list; null when they may not open it. */
  campaign: (userId: string, key: string) => Promise<Found | null>;
  workspace: (owner: string) => Promise<Workspace>;
  store: Pick<ForumStore, "read" | "readTopic" | "apply" | "readReads" | "writeReads" | "readPresence" | "touchPresence" | "readAlerts" | "writeAlerts">;
  /** The campaign's themes (lib/campaign-theme). Without it the forum keeps its own look. */
  themes?: Pick<ThemeStore, "read" | "update">;
  /**
   * Stores a picture someone staged in their own storage (/api/transfers) with the owner's pictures, refusing
   * anything over `maxBytes` or that isn't a PNG, JPEG or WebP. Returns its id.
   */
  savePicture?: (owner: string, uploader: string, transferId: string, maxBytes: number) => Promise<string>;
  /** A signed address for one of the owner's pictures. */
  image?: (owner: string, imageId: string) => Promise<{ url: string } | null>;
  now?: () => Date;
  newId?: () => string;
  /** Dice: a whole number from 1 to `sides` (tests pass their own). */
  random?: (sides: number) => number;
  /** The GM's Maptable scenes in a Maptable campaign, for starting combat from its initiative. */
  scenes?: (owner: string, maptableCampaignId: string) => Promise<Scene[]>;
  /** A scene of the paired Maptable campaign drawn as players see it, stored as a picture; its picture id. */
  mapPicture?: (owner: string, maptableCampaignId: string, sceneId: string) => Promise<string>;
  /**
   * The campaign's API-key AI connections, and one request (lib/ai/forum-ai.ts) with a key from the asker's device: the
   * forum's connection with the GM's key, or the asker's own AI. Keys are never saved.
   */
  ai?: {
    connections: (owner: string, campaignId: string) => Promise<AiConnection[]>;
    run: (owner: string, campaignId: string, use: AiUse, ask: { system: string; prompt: string; tool: { name: string; description: string; inputSchema: Record<string, unknown> }; maxTokens: number }) => Promise<{ input?: Record<string, unknown>; tokens: number; name: string }>;
  };
};
export type AiConnection = { id: string; name: string; model: string; used: number; limit: number | null };
/** The AI one request uses: the forum's connection with its key from this device, or the asker's own AI from this device. */
export type AiUse = { connectionId: string; apiKey: string } | { own: { provider: string; baseUrl?: string; model: string; apiKey: string } };

// Big enough for a theme with a 100 KB stylesheet; posts have their own, smaller limit.
export const FORUM_BODY = 220_000;
export const keyPattern = /^(?:m-[a-f0-9]{64}|c-[A-Za-z0-9_-]{1,100})$/;
const readThrottle = createThrottle(30, 10_000), writeThrottle = createThrottle(12, 10_000), imageThrottle = createThrottle(240, 10_000), aiThrottle = createThrottle(6, 60_000);
export const resetForumThrottles = () => { readThrottle.reset(); writeThrottle.reset(); imageThrottle.reset(); aiThrottle.reset(); };

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const id = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
const key = z.string().regex(keyPattern);
const as = id.nullable();
/** What a post is written in (markup.ts `PostFormat`). */
const format = z.enum(POST_FORMATS).optional();
const boardFields = { categoryId: id, parentId: id.nullable().optional(), name: z.string().max(200), description: z.string().max(1000).optional(), placeId: id.nullable().optional(), locked: z.boolean().optional(), type: z.enum(["location", "campaign", "ooc"]).optional(), width: z.enum(["full", "half"]).optional() };
const pageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("index") }), z.object({ kind: z.literal("active") }), z.object({ kind: z.literal("members") }), z.object({ kind: z.literal("settings") }), z.object({ kind: z.literal("profile") }),
  z.object({ kind: z.literal("board"), id, archive: z.boolean().optional() }), z.object({ kind: z.literal("topic"), id }), z.object({ kind: z.literal("trash") }), z.object({ kind: z.literal("reports") }), z.object({ kind: z.literal("pictures") }), z.object({ kind: z.literal("sheet"), id }),
  z.object({ kind: z.literal("search"), q: z.string().trim().min(2).max(100), boardId: id.optional() }),
]);
const bulkOps = ["pin", "unpin", "lock", "unlock", "archive", "unarchive", "trash", "move"] as const;
/**
 * `skin`: the live theme for one part of the campaign (the Encyclopedia, Maptable or the dashboard), for anyone who may
 * open the campaign, whether or not they read the forum. Besides the forum's keys it takes `mt-<Maptable campaign id>`,
 * the signed-in GM's Maptable campaign, which finds the Encyclopedia campaign paired with it.
 */
const partKey = z.string().regex(/^(?:m-[a-f0-9]{64}|c-[A-Za-z0-9_-]{1,100}|mt-[A-Za-z0-9_-]{1,100})$/);
const skinSchema = z.object({ action: z.literal("skin"), campaign: partKey,
  area: z.enum(THEME_AREAS.map(a => a.id) as [ThemeArea, ...ThemeArea[]]), theme: z.string().max(200).optional() });
async function skinOf(deps: Deps, body: z.infer<typeof skinSchema>) {
  const userId = await deps.user();
  if (!userId) return json({ error: signIn }, 401);
  if (readThrottle.hit(userId)) return json({ error: "Slow down a moment, then try again." }, 429);
  const key = await pairedKey(deps, userId, body.campaign);
  if (!key) return json({ theme: null });
  const found = await deps.campaign(userId, key);
  if (!found) return json({ error: notMember }, 404);
  const file = deps.themes ? (await deps.themes.read(found.owner, found.campaignId)).file : null;
  const theme = liveTheme(file?.live ?? null, body.area);
  return json({ theme: theme && body.theme === theme.key ? { key: theme.key, name: theme.name, mode: theme.mode, banner: theme.banner, same: true } : theme });
}

/** A part's key as the forum's: `mt-<Maptable campaign>` becomes the paired Encyclopedia campaign's, or null when none is. */
async function pairedKey(deps: Deps, userId: string, key: string) {
  if (!key.startsWith("mt-")) return key;
  const paired = (await deps.workspace(userId)).campaigns.find(c => c.maptableCampaignId === key.slice(3));
  return paired ? `c-${paired.id}` : null;
}

/**
 * The Admin CP's themes, from any part of the campaign. A theme belongs to the campaign, not to its forum, so these work
 * before a forum is set up and take a part's keys like `skin`. `themes` reads the saved ones, the live one and where the
 * campaign's parts open (for the Preview links); the others save a theme (and make it live), make a saved theme live (or
 * none) and delete one, returning the themes as stored now. For those who may arrange the forum: the GM, and the groups
 * the GM lets.
 */
const THEME_ACTIONS = new Set(["themes", "saveTheme", "liveTheme", "deleteTheme"]);
const themeBodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("themes"), campaign: partKey }),
  z.object({ action: z.literal("saveTheme"), campaign: partKey, theme: z.unknown(), live: z.boolean().optional() }),
  z.object({ action: z.literal("liveTheme"), campaign: partKey, id: z.string().max(40).nullable() }),
  z.object({ action: z.literal("deleteTheme"), campaign: partKey, id: z.string().max(40) }),
]);
async function themesOf(deps: Deps, body: z.infer<typeof themeBodySchema>, now: Date) {
  const userId = await deps.user();
  if (!userId) return json({ error: signIn }, 401);
  if ((body.action === "themes" ? readThrottle : writeThrottle).hit(userId)) return json({ error: "Slow down a moment, then try again." }, 429);
  const key = await pairedKey(deps, userId, body.campaign);
  if (!key) return json({ error: "This Maptable campaign isn't paired with a Wiki campaign, so it has no theme yet. Pair them from its dashboard first.", code: "unpaired" }, 404);
  const found = await deps.campaign(userId, key);
  if (!found) return json({ error: notMember }, 404);
  const campaign = (await deps.workspace(found.owner)).campaigns.find(c => c.id === found.campaignId);
  if (!campaign) return json({ error: notMember }, 404);
  const rights = forumRights(found.list, userId, found.owner);
  if (!rights.boards) return json({ error: "Your group can't change the campaign's theme." }, 403);
  if (!deps.themes) return json({ error: "Themes aren't available on this site." }, 404);
  if (body.action === "themes") {
    const { file } = await deps.themes.read(found.owner, found.campaignId);
    return json({ themes: { live: file?.live ?? null, saved: file?.saved ?? [] }, where: { key, campaignId: found.campaignId, maptableId: campaign.maptableCampaignId ?? null, owner: rights.owner } });
  }
  const file = await deps.themes.update(found.owner, found.campaignId, f =>
    body.action === "saveTheme" ? saveTheme(f, body.theme, { live: body.live, now }) : body.action === "liveTheme" ? makeLive(f, body.id) : deleteTheme(f, body.id));
  return json({ ok: true, themes: { live: file.live, saved: file.saved } });
}

const bodySchema = z.discriminatedUnion("action", [
  // `theme`: the live theme's key the browser already has, so the stylesheet isn't sent again.
  z.object({ action: z.literal("view"), campaign: key, page: pageSchema, theme: z.string().max(200).optional() }),
  z.object({ action: z.literal("start"), campaign: key, boardId: id, title: z.string().max(500), body: z.string().max(40_000), as, private: z.array(z.string().regex(/^[a-f0-9]{16}$/)).max(FORUM_LIMITS.privateMembers).optional(), ai: z.boolean().optional(), tags: z.array(id).max(10).optional(), format }),
  z.object({ action: z.literal("reply"), campaign: key, topicId: id, body: z.string().max(40_000), as, ai: z.boolean().optional(), format }),
  z.object({ action: z.literal("ai"), campaign: key, op: z.enum(["summary", "catchUp", "check", "draft"]), topicId: id.optional(), boardId: id.optional(), title: z.string().max(500).optional(), body: z.string().max(40_000).optional(), as: as.optional(), hint: z.string().max(500).optional(), since: z.string().datetime().optional(),
    // The key from the asker's device, for the forum's connection; or their own AI. Used for this request only.
    apiKey: z.string().max(500).optional(), own: z.object({ provider: z.string().max(20), baseUrl: z.string().max(400).optional(), model: z.string().max(200), apiKey: z.string().max(500) }).optional() }),
  z.object({ action: z.literal("aiSettings"), campaign: key, ai: z.unknown() }),
  z.object({ action: z.literal("edit"), campaign: key, topicId: id, postId: id, body: z.string().max(40_000), format }),
  z.object({ action: z.literal("report"), campaign: key, topicId: id, postId: id, reason: z.string().max(600) }),
  z.object({ action: z.literal("dismissReports"), campaign: key, postId: id }),
  z.object({ action: z.literal("suggestion"), campaign: key, topicId: id, suggestionId: id, op: z.enum(["approve", "skip"]), body: z.string().max(40_000).optional() }),
  z.object({ action: z.literal("delete"), campaign: key, topicId: id, postId: id }),
  z.object({ action: z.literal("deleteTopic"), campaign: key, topicId: id }),
  z.object({ action: z.literal("topic"), campaign: key, topicId: id, pinned: z.boolean().optional(), locked: z.boolean().optional(), archived: z.boolean().optional(), title: z.string().max(500).optional(), boardId: id.optional(), tags: z.array(id).max(10).optional() }),
  z.object({ action: z.literal("trash"), campaign: key, topicId: id, restore: z.boolean().optional() }),
  z.object({ action: z.literal("bulk"), campaign: key, topicIds: z.array(id).min(1).max(FORUM_LIMITS.bulk), op: z.enum(bulkOps), boardId: id.optional() }),
  z.object({ action: z.literal("export"), campaign: key, boardId: id }),
  z.object({ action: z.literal("alertsSeen"), campaign: key }),
  z.object({ action: z.literal("combat"), campaign: key, topicId: id, op: z.enum(["start", "order", "next", "back", "end"]), order: z.array(slotSchema).max(40).optional(), round: z.number().int().min(1).max(9999).optional(), turn: z.number().int().min(0).max(39).optional(), sceneId: z.string().min(1).max(160).optional() }),
  z.object({ action: z.literal("combatSources"), campaign: key }),
  z.object({ action: z.literal("mapScenes"), campaign: key }),
  z.object({ action: z.literal("map"), campaign: key, sceneId: z.string().min(1).max(160) }),
  z.object({ action: z.literal("settings"), campaign: key, settings: z.unknown() }),
  z.object({ action: z.literal("upload"), campaign: key, transferId: z.string().uuid(), kind: z.enum(["post", "emoji"]) }),
  z.object({ action: z.literal("emoji"), campaign: key, emoji: z.unknown() }),
  z.object({ action: z.literal("topicTags"), campaign: key, tags: z.unknown() }),
  z.object({ action: z.literal("cardDesign"), campaign: key, card: z.unknown() }),
  z.object({ action: z.literal("strip"), campaign: key, strip: z.unknown() }),
  z.object({ action: z.literal("profile"), campaign: key, profile: z.unknown() }),
  z.object({ action: z.literal("addCategory"), campaign: key, name: z.string().max(200), kind: z.enum(["ic", "ooc"]) }),
  z.object({ action: z.literal("editCategory"), campaign: key, id, name: z.string().max(200) }),
  z.object({ action: z.literal("deleteCategory"), campaign: key, id }),
  z.object({ action: z.literal("addBoard"), campaign: key, ...boardFields }),
  z.object({ action: z.literal("editBoard"), campaign: key, id, ...boardFields }),
  z.object({ action: z.literal("masks"), campaign: key, id, masks: z.record(id, z.object({ read: z.enum(["yes", "no", "never"]).optional(), start: z.enum(["yes", "no", "never"]).optional(), reply: z.enum(["yes", "no", "never"]).optional(), html: z.enum(["yes", "no", "never"]).optional() })) }),
  z.object({ action: z.literal("deleteBoard"), campaign: key, id }),
  z.object({ action: z.literal("move"), campaign: key, id, what: z.enum(["board", "category"]), by: z.union([z.literal(-1), z.literal(1)]) }),
  z.object({ action: z.literal("readAll"), campaign: key }),
]);
type Body = z.infer<typeof bodySchema>;

const signIn = "Sign in to open the forum.";
const notMember = "You can't open this forum. You may have left the campaign, or the GM changed what your group can do.";

/** Who is asking and what they may see: the context the views and changes need. */
async function contextOf(deps: Deps, campaign: string, now: Date, marks = true, playerView = false) {
  const userId = await deps.user();
  if (!userId) return { fail: json({ error: signIn }, 401) };
  const found = await deps.campaign(userId, campaign);
  if (!found) return { fail: json({ error: notMember }, 404) };
  let rights = forumRights(found.list, userId, found.owner);
  if (!rights.read) return { fail: json({ error: "Your group can't read the forum." }, 403) };
  const workspace = await deps.workspace(found.owner);
  if (!workspace.campaigns.some(c => c.id === found.campaignId)) return { fail: json({ error: notMember }, 404) };
  // A solo campaign's owner plays its player characters and companions (lib/solo.ts), and may switch to the player view:
  // the Players group's forum rights and the pages players may read, posting as those characters or as themselves.
  const solo = rights.owner && isSolo(workspace, found.campaignId) ? { player: playerView } : undefined;
  if (solo?.player) rights = soloPlayerRights(found.list, found.owner);
  const editable = solo ? soloCharacters(workspace, found.campaignId) : rights.owner ? new Set<string>() : pageRights(found.list, userId).edit;
  // Players read the pages the player view gives them; the GM and co-GMs read every page.
  const readable = rights.gm ? null : new Set(playerCampaign(workspace, found.campaignId, editable).entries.map(e => e.id));
  // Pictures don't need read marks or presence.
  const none = { reads: null, presence: null, alerts: null, etag: null };
  const [{ forum, etag: stored }, mine, presence, alerts, themes] = await Promise.all([
    deps.store.read(found.owner, found.campaignId),
    marks ? deps.store.readReads(found.owner, found.campaignId, userId) : none, marks ? deps.store.readPresence(found.owner, found.campaignId) : none,
    marks ? deps.store.readAlerts(found.owner, found.campaignId, userId).catch(() => none) : none,
    // The campaign's theme; a problem reading it leaves the forum's own look.
    marks && deps.themes ? deps.themes.read(found.owner, found.campaignId).then(t => t.file, () => null) : null,
  ]);
  // Forums start switched off: the GM sets one up from the campaign's page.
  if (stored === null) return { fail: json({ error: rights.owner ? "This campaign's forum isn't set up yet." : "The GM hasn't set up a forum for this campaign yet.", code: "no-forum" }, 404) };
  // A first visit starts with everything before the member joined (the GM: before now) marked read.
  const joined = found.list.members.find(m => m.userId === userId)?.joinedAt;
  const reads = mine.reads ?? freshReads(joined && joined < now.toISOString() ? joined : now.toISOString());
  const ctx: Context = { forum, list: found.list, owner: found.owner, workspace, campaignId: found.campaignId, viewer: { userId, rights, key: campaign, editable, access: solo?.player ? soloPlayerAccess(forum, found.list, found.owner) : boardAccess(forum, found.list, userId, rights) }, readable, reads, presence: presence.presence, alerts: alerts.alerts, theme: liveTheme(themes?.live ?? null), now, ...(solo ? { solo } : {}) };
  return { ctx, found, userId, fresh: marks && !mine.reads, presence, themes };
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
    case "reports": {
      if (!ctx.viewer.rights.moderate) return json({ error: "Only moderators can read reports." }, 403);
      const ids = [...new Set([...reportedPosts(ctx).values()].map(r => r[0]!.topicId))].slice(0, 100), topics = new Map<string, Topic | null>();
      for (let i = 0; i < ids.length; i += 10) {
        const batch = await Promise.all(ids.slice(i, i + 10).map(t => deps.store.readTopic(found.owner, found.campaignId, t).catch(() => null)));
        batch.forEach((b, n) => topics.set(ids[i + n]!, b?.topic ?? null));
      }
      return json({ frame: frameOf(ctx), page: { kind: "reports", ...reportsPage(ctx, topics) } });
    }
    case "sheet": {
      const sheet = sheetPage(ctx, page.id);
      return sheet ? json({ frame: frameOf(ctx), page: { kind: "sheet", ...sheet } }) : json({ error: "You can't post as that character." }, 403);
    }
    case "pictures": {
      if (!ctx.viewer.rights.pictures) return json({ error: "Your group can't add pictures to posts." }, 403);
      return json({ frame: frameOf(ctx), page: { kind: "pictures", ...picturesPage(ctx) } });
    }
    case "settings": {
      if (!ctx.viewer.rights.boards) return json({ error: "Your group can't change the boards." }, 403);
      const groups = ctx.list.groups.map(g => ({ id: g.id, name: g.name, read: g.perms.forumRead ?? "no", start: g.perms.forumStart ?? "no", reply: g.perms.forumReply ?? "no", gm: g.perms.seeGm === "yes" }));
      const masks = Object.fromEntries(ctx.forum.boards.flatMap(b => b.masks ? [[b.id, b.masks]] : []));
      // Only the campaign's owner chooses the forum's AI, as it spends their API key.
      const connections = ctx.viewer.rights.owner && deps.ai ? await deps.ai.connections(found.owner, found.campaignId).catch(() => []) : [];
      return json({ frame: frameOf(ctx), page: { kind: "settings", places: placesOf(ctx), settings: ctx.forum.settings, groups, masks, emoji: ctx.forum.emoji ?? { use: "all", list: [] }, topicTags: ctx.forum.topicTags ?? [], card: { rows: ctx.forum.card?.rows ?? [], fields: cardFields(ctx), sample: cardSample(ctx) }, strip: ctx.forum.strip ?? DEFAULT_STRIP, ai: { settings: ctx.forum.settings.ai ?? null, connections, may: ctx.viewer.rights.owner } } });
    }
    case "profile": return json({ frame: frameOf(ctx), page: { kind: "profile", ...profilePage(ctx) } });
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
      out.push({ title: topics[i + n]!.title, posts: got.topic.posts.map(p => ({ name: p.by.as ? names.get(p.by.as) ?? "A character" : ic ? "Game Master" : memberName(ctx, p.by.userId), by: memberName(ctx, p.by.userId), at: p.at, body: withRollResults(p.body, p.rolls), ...(p.format ? { format: p.format } : {}) })) });
    }
  }
  return { board: board.name, topics: out };
}

/** Runs one change through the store. Changes that touch a topic read it there first. */
function change(deps: Deps, ctx: Context, found: Found, body: Exclude<Body, { action: "view" | "ai" }>, now: Date) {
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
    case "report": { const n = newId(); return run(body.topicId, (f, t) => reportPost(f, needTopic(t), body, who, n, now)); }
    case "dismissReports": return run(null, f => dismissReports(f, body, who));
    case "suggestion": {
      const postId = newId();
      return run(body.topicId, (f, t) => {
        const topic = needTopic(t), text = body.body ?? topic.suggested?.find(x => x.id === body.suggestionId)?.body ?? "";
        return decideSuggestion(f, topic, { ...body, rolls: body.op === "approve" ? rollPost(text, random) : undefined }, who, postId, now);
      });
    }
    case "edit": return run(body.topicId, (f, t) => editPost(f, needTopic(t), { ...body, reroll: (old, text) => rollPost(text, random, old ?? [], now) }, who, now));
    case "combat": return runCombat(deps, ctx, found, body, who, now);
    case "combatSources": return combatSources(deps, ctx, found);
    case "mapScenes": return mapScenes(deps, ctx, found);
    case "map": return (async () => {
      // A picture of a Maptable scene as players see it: GM-only tokens and layers stay out.
      if (!ctx.viewer.rights.gm) throw new ForumError("Only the GM can put Maptable scenes in posts.");
      mayUpload(ctx.forum, who, "post");
      const mt = maptableOf(ctx);
      if (!mt || !deps.mapPicture || !deps.scenes) throw new ForumError("This campaign has no Maptable campaign paired with it.");
      const scene = (await deps.scenes(found.owner, mt).catch(() => [])).find(sc => sc.id === body.sceneId);
      if (!scene) throw new ForumError("That scene isn't in the paired Maptable campaign any more.");
      let id: string;
      try { id = await deps.mapPicture(found.owner, mt, scene.id); }
      catch (e) { throw new ForumError(e instanceof Error && e.message ? e.message : "The map picture couldn't be drawn."); }
      const out = await run(null, f => addUpload(f, { id, kind: "post" }, who, now));
      return { ...out, name: scene.name };
    })();
    case "aiSettings": return (async () => { const ids = deps.ai && ctx.viewer.rights.owner ? (await deps.ai.connections(found.owner, found.campaignId)).map(c => c.id) : []; return run(null, f => setAi(f, body.ai, who, ids)); })();
    case "delete": return run(body.topicId, (f, t) => deletePost(f, needTopic(t), body, who));
    case "deleteTopic": return run(body.topicId, (f, t) => deleteTopic(f, needTopic(t), who));
    case "topic": return run(body.boardId !== undefined ? body.topicId : null, (f, t) => setTopic(f, t, body, who));
    case "settings": return run(null, f => setSettings(f, body.settings, who));
    case "upload": return (async () => {
      // Checked before storing, so a refused picture never lands in the GM's storage; checked again when noted.
      mayUpload(ctx.forum, who, body.kind);
      if (!deps.savePicture) throw new ForumError("Pictures can't be added right now.");
      let id: string;
      try { id = await deps.savePicture(found.owner, ctx.viewer.userId, body.transferId, body.kind === "emoji" ? EMOJI_BYTES : PICTURE_BYTES); }
      catch (e) { throw new ForumError(e instanceof Error && e.message ? e.message : "That picture couldn't be added."); }
      return run(null, f => addUpload(f, { id, kind: body.kind }, who, now));
    })();
    case "emoji": return run(null, f => setEmoji(f, body.emoji, who));
    case "topicTags": return run(null, f => setTopicTags(f, body.tags, who));
    case "cardDesign": return run(null, f => setCardDesign(f, body.card, who));
    case "strip": return run(null, f => setStrip(f, body.strip, who));
    case "profile": return run(null, f => setProfile(f, body.profile, who));
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

/** The paired Maptable campaign's scenes, to put one in a post as a picture (the GM). */
async function mapScenes(deps: Deps, ctx: Context, found: Found) {
  if (!ctx.viewer.rights.gm) throw new ForumError("Only the GM can put Maptable scenes in posts.");
  const mt = maptableOf(ctx);
  if (!mt || !deps.scenes || !deps.mapPicture) return { paired: false, scenes: [] };
  const scenes = await deps.scenes(found.owner, mt).catch(() => []);
  return { paired: true, scenes: scenes.slice(0, 200).map(sc => ({ id: sc.id, name: sc.name })) };
}

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
export async function sendAlerts(deps: { store: Pick<ForumStore, "read" | "writeAlerts"> }, ctx: Context, found: Found, post: { topicId: string; postId?: string; body: string; as: string | null; private: string[] }, now: Date) {
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

/** Tells the moderating team who can see the topic about a report (never the reporter). Best effort. */
async function reportAlerts(deps: Deps, ctx: Context, found: Found, report: { topicId: string; postId: string }, now: Date) {
  const { forum } = await deps.store.read(found.owner, found.campaignId), s = forum.topics.find(t => t.id === report.topicId);
  if (!s) return;
  const staff = [found.owner, ...ctx.list.members.map(m => m.userId)].filter(u => u !== ctx.viewer.userId);
  await Promise.all(staff.slice(0, 40).map(async u => {
    const rights = forumRights(ctx.list, u, found.owner);
    if (!rights.moderate || !canSee(s, { userId: u, rights, access: boardAccess(forum, ctx.list, u, rights) })) return;
    const item: Alert = { id: `report:${report.postId}:${ctx.viewer.userId}`, at: now.toISOString(), kind: "report", topicId: report.topicId, postId: report.postId, by: ctx.viewer.userId, as: null };
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

/**
 * The forum's AI help: Summarize or Catch me up on a topic, Check my post, Draft with AI. Only text the asker can read
 * goes to the AI, and characters as players see them. Nothing is saved.
 */
async function aiHelp(deps: Deps, ctx: Context, found: Found, body: Extract<Body, { action: "ai" }>) {
  const settings = ctx.forum.settings.ai, may = aiFor(settings, ctx.viewer.rights);
  if (!settings || !deps.ai) throw new ForumError("The AI is off in this forum.");
  const allowed = body.op === "summary" || body.op === "catchUp" ? may.catchUp : may[body.op];
  if (!allowed) throw new ForumError("Your group can't use that here.");
  // The topic, when there is one, as this reader sees it.
  let page: ReturnType<typeof topicPage> = null;
  if (body.topicId) {
    const s = shownTopics(ctx).find(t => t.id === body.topicId), got = s ? await deps.store.readTopic(found.owner, found.campaignId, s.id) : null;
    page = got ? topicPage(ctx, got.topic) : null;
    if (!page) throw new ForumError("That topic was removed.");
  }
  const boardId = page?.topic.boardId ?? body.boardId, board = ctx.forum.boards.find(b => b.id === boardId && accessOn(ctx.viewer, b.id).read);
  if (!board) throw new ForumError(body.topicId ? "That topic was removed." : "Choose a board first.");
  const kind = kindOf(ctx.forum, board), about = { title: page?.topic.title ?? (body.title?.trim() || "A new topic"), board: board.name };
  const posts: AiPost[] = page ? page.posts.map(p => ({ name: p.as ? page!.cards[p.as]?.name ?? "A character" : kind === "ic" ? "Game Master" : p.name, player: p.name, body: p.body, rolls: p.rolls, at: p.at })) : [];
  const cast = new Map(castOf(ctx).map(c => [c.id, c])), entries = entriesOf(ctx);
  const cardFor = (as: string | null | undefined) => { const e = as && cast.has(as) ? entries.get(as) : undefined; return e ? cardOf(ctx, e) : null; };
  if (!body.apiKey && !body.own) throw new ForumError("Add your AI to this device first, in Account settings › AI on this device. Its key stays on your device.");
  const use: AiUse = body.apiKey ? { connectionId: settings.connectionId, apiKey: body.apiKey } : { own: body.own! };
  const ask = (a: Parameters<NonNullable<Deps["ai"]>["run"]>[3]) => deps.ai!.run(found.owner, found.campaignId, use, a);
  switch (body.op) {
    case "summary": case "catchUp": {
      if (!page) throw new ForumError("Open a topic first.");
      const since = body.op === "catchUp" && body.since ? body.since : null, fresh = since ? posts.filter(p => p.at > since) : posts;
      if (!fresh.length) return { summary: since ? "Nothing new since you last read it." : "Nothing to summarize yet.", points: [], posts: 0 };
      const out = await ask({ system: SUMMARY_SYSTEM, prompt: summaryPrompt(about, posts, since), tool: summaryTool, maxTokens: 1500 });
      const got = readSummary(out.input);
      if (!got) throw new ForumError("The AI didn't send a summary. Try again.");
      return { ...got, posts: fresh.length, by: out.name };
    }
    case "check": {
      if (!body.body?.trim()) throw new ForumError("Write something first.");
      const card = cardFor(body.as);
      const out = await ask({ system: CHECK_SYSTEM, prompt: checkPrompt(page ? about : null, posts.slice(-20), { body: body.body, as: card, narration: !card && kind === "ic" }), tool: checkTool, maxTokens: 1500 });
      const notes = readCheck(out.input);
      if (!notes) throw new ForumError("The AI didn't send its notes. Try again.");
      return { notes, by: out.name };
    }
    case "draft": {
      const card = kind === "ic" ? cardFor(body.as) : null;
      const out = await ask({ system: DRAFT_SYSTEM, prompt: draftPrompt({ ...about, about: board.description }, posts.slice(-30), card, body.hint?.trim() ?? "", kind), tool: draftTool, maxTokens: 2500 });
      const text = readDraft(out.input);
      if (!text) throw new ForumError("The AI didn't send a draft. Try again.");
      return { body: text, by: out.name };
    }
  }
}

export async function handleForum(request: Request, deps: Deps) {
  try {
    if (!deps.sameOrigin(request)) return json({ error: "A same-origin request is required." }, 403);
    if (Number(request.headers.get("content-length") ?? 0) > FORUM_BODY) return json({ error: "That post is too long." }, 413);
    const text = await request.text();
    if (text.length > FORUM_BODY) return json({ error: "That post is too long." }, 413);
    const raw: unknown = JSON.parse(text);
    const action = typeof raw === "object" && raw !== null ? (raw as { action?: unknown }).action : undefined;
    if (action === "skin") return await skinOf(deps, skinSchema.parse(raw));
    if (typeof action === "string" && THEME_ACTIONS.has(action)) return await themesOf(deps, themeBodySchema.parse(raw), deps.now?.() ?? new Date());
    const body = bodySchema.parse(raw), now = deps.now?.() ?? new Date();
    // The player view of a solo campaign's owner (contextOf); ignored for anyone else.
    const playerView = typeof raw === "object" && raw !== null && (raw as { playerView?: unknown }).playerView === true;
    const got = await contextOf(deps, body.campaign, now, true, playerView);
    if (got.fail) return got.fail;
    const { ctx, found, userId } = got;
    if ((body.action === "view" ? readThrottle : writeThrottle).hit(userId)) return json({ error: "Slow down a moment, then try again." }, 429);
    // Any visit notes that they're online and, the first time, keeps where their read marks start. Best effort.
    await Promise.all([
      deps.store.touchPresence(found.owner, found.campaignId, userId, now, got.presence).catch(() => undefined),
      got.fresh && ctx.reads ? deps.store.writeReads(found.owner, found.campaignId, userId, r => r ? null : ctx.reads!).catch(() => undefined) : undefined,
    ]);
    if (body.action === "view") {
      // The browser already has this version of the theme: don't send the stylesheet again.
      if (ctx.theme && body.theme === ctx.theme.key) ctx.theme = { key: ctx.theme.key, name: ctx.theme.name, mode: ctx.theme.mode, banner: ctx.theme.banner, same: true };
      return await view(deps, ctx, found, body.page);
    }
    if (body.action === "ai") {
      // A request without a key is refused before any AI is asked, so it doesn't use up the minute's requests.
      if ((body.apiKey || body.own) && aiThrottle.hit(userId)) return json({ error: "The AI needs a minute between a few requests. Try again shortly." }, 429);
      return json(await aiHelp(deps, ctx, found, body));
    }
    const out = await change(deps, ctx, found, body, now);
    if (body.action === "start" || body.action === "reply") {
      const made = out as { topicId?: string; postId?: string } | undefined;
      const topicId = body.action === "start" ? made?.topicId : body.topicId;
      if (topicId) await sendAlerts(deps, ctx, found, { topicId, postId: made?.postId, body: body.body, as: body.as, private: body.action === "start" && body.private ? membersFromKeys(ctx, body.private) : [] }, now).catch(() => undefined);
    }
    if (body.action === "suggestion" && out && "postId" in out) { const p = out as { postId: string; body: string; as: string | null }; await sendAlerts(deps, ctx, found, { topicId: body.topicId, postId: p.postId, body: p.body, as: p.as, private: [] }, now).catch(() => undefined); }
    if (body.action === "report") await reportAlerts(deps, ctx, found, body, now).catch(() => undefined);
    if (body.action === "combat") await sendAlerts(deps, ctx, found, { topicId: body.topicId, body: "", as: null, private: [] }, now).catch(() => undefined);
    return json({ ok: true, ...(out ?? {}) });
  } catch (e) {
    if (e instanceof ForumError || e instanceof ThemeError) return json({ error: e.message }, 400);
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
