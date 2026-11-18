/*
 * What one person sees of a campaign's forum: names worked out from the member list, character cards built from the
 * Encyclopedia with only what players may read, and links to pages they can open. Server only; the browser never
 * gets account ids of other members.
 */
import { playerText, visibleEntries, type Entry, type Workspace } from "../encyclopedia/world-model.ts";
import { formatDate } from "../encyclopedia/calendar-model.ts";
import { can, type MemberList } from "../members.ts";
import { createHash } from "node:crypto";
import { TRASH_DAYS, boardTree, canSee, kindOf, type Author, type Board, type Forum, type ForumRights, type Topic, type TopicSummary } from "./model.ts";
import { playerLink } from "../encyclopedia/player-prose.ts";
import { linkTargets } from "./markup.ts";
import { NARRATION, isUnread, nextUp, onlineOf, orderOf, readUpTo, type Presence, type Reads } from "./reader.ts";

export type Viewer = { userId: string; rights: ForumRights; key: string; editable: ReadonlySet<string> };
export type Context = {
  forum: Forum; list: MemberList; owner: string; workspace: Workspace; campaignId: string; viewer: Viewer;
  /** Pages this viewer may open on the player pages; null when they see every page (the GM). */
  readable: ReadonlySet<string> | null;
  /** The viewer's read marks (reader.ts); without them nothing shows as unread. */
  reads?: Reads;
  /** Who has been reading lately. */
  presence?: Presence | null;
  now?: Date;
};

export type Picture = { imageId: string; x: number; y: number };
export type Card = { id: string; name: string; role: string; picture: Picture | null; url: string | null; traits: string[]; fields: { label: string; value: string }[] };
export type Byline = { name: string; as: string | null; picture: Picture | null };
export type LastPost = Byline & { topicId: string; title: string; at: string };

const roleNames: Record<string, string> = { pc: "Player character", companion: "Companion", npc: "NPC", creature: "Creature" };
const pictureOf = (e?: Entry): Picture | null => e?.picture ? { imageId: e.picture.imageId, x: e.picture.x, y: e.picture.y } : null;

function campaignOf(ctx: Context) {
  const c = ctx.workspace.campaigns.find(x => x.id === ctx.campaignId);
  if (!c) throw Error("Campaign not found");
  return c;
}
function entriesOf(ctx: Context) {
  const c = campaignOf(ctx);
  return new Map(visibleEntries(ctx.workspace, c.worldId, c.id).map(e => [e.id, e]));
}

/** A member's name as the campaign knows it. */
export function memberName(ctx: Pick<Context, "list" | "owner">, userId: string) {
  if (userId === ctx.owner) return ctx.list.ownerName || "The GM";
  return ctx.list.members.find(m => m.userId === userId)?.name ?? "A former member";
}

/** Where a character or place page opens for this viewer, or null when they can't read it. */
export function pageUrl(ctx: Context, entryId: string) {
  if (ctx.viewer.rights.owner) return `/encyclopedia?entry=${encodeURIComponent(entryId)}&campaign=${encodeURIComponent(ctx.campaignId)}`;
  if (ctx.readable?.has(entryId) && ctx.viewer.key.startsWith("m-")) return `/encyclopedia/player#${ctx.viewer.key}&entry=${encodeURIComponent(entryId)}`;
  return null;
}

/** The characters this viewer may post as in character: their own (each page's Who can edit), or any for a GM. */
export function castOf(ctx: Context) {
  const all = [...entriesOf(ctx).values()].filter(e => e.kind === "character");
  const mine = ctx.viewer.rights.gm ? all : all.filter(e => ctx.viewer.editable.has(e.id));
  const rank = (e: Entry) => ["pc", "companion", "npc", "creature"].indexOf(e.character?.role ?? "npc");
  return mine.sort((a, b) => Number(ctx.viewer.editable.has(b.id)) - Number(ctx.viewer.editable.has(a.id)) || rank(a) - rank(b) || a.title.localeCompare(b.title)).map(e => ({ id: e.id, name: e.title, role: roleNames[e.character?.role ?? "npc"]!, picture: pictureOf(e) }));
}

/**
 * The hover card for a character who posted: their picture and what players may read of them (shared facts and
 * traits from the Profile tab, shared stats). Posting as a character shows their name and picture to the forum.
 */
export function cardOf(ctx: Context, e: Entry): Card {
  const c = campaignOf(ctx), fields: Card["fields"] = [], traits: string[] = [];
  const p = e.profile, ch = e.character;
  if (p?.visibility === "players") {
    for (const f of p.facts ?? []) if (!f.gm && f.value.trim()) fields.push({ label: f.label, value: f.value });
    for (const t of p.traits) if (!t.gm && t.label.trim()) traits.push(t.label);
  }
  if (ch?.statsVisibility === "players") {
    const off = new Set(ch.statLayout?.off ?? []), values = ch.statsByCampaign[c.id] ?? {};
    for (const f of c.statFields ?? []) {
      if (f.archived || f.visibility !== "players" || off.has(f.id) || !["text", "number", "select"].includes(f.type)) continue;
      const v = values[f.id];
      if (v === null || v === undefined || v === "" || typeof v === "boolean") continue;
      fields.push({ label: f.label, value: String(v).slice(0, 120) });
    }
  }
  return { id: e.id, name: e.title, role: roleNames[ch?.role ?? "npc"]!, picture: pictureOf(e), url: pageUrl(ctx, e.id), traits: traits.slice(0, 6), fields: fields.slice(0, 8) };
}

function bylineOf(ctx: Context, entries: Map<string, Entry>, a: Author): Byline {
  const e = a.as ? entries.get(a.as) : undefined;
  return { name: e?.title ?? (a.as ? "A character no longer in the campaign" : memberName(ctx, a.userId)), as: e ? e.id : null, picture: pictureOf(e) };
}
const lastOf = (ctx: Context, entries: Map<string, Entry>, t: TopicSummary): LastPost => ({ ...bylineOf(ctx, entries, t.last), topicId: t.id, title: t.title, at: t.lastAt });

/** Whose turn it is in a topic, and whether that's the viewer (one of their characters, or for a GM, an NPC or narration). */
export type Turn = { name: string; picture: Picture | null; mine: boolean };
export type TopicRow = {
  id: string; boardId: string; title: string; pinned: boolean; locked: boolean; replies: number;
  by: Byline; at: string; last: LastPost; cast: { id: string; name: string; picture: Picture | null }[];
  unread: boolean; next: Turn | null; archived: boolean;
  /** Who a private topic is for (names), or null. */
  only: string[] | null;
  /** In the Trash: when, by whom and when it goes for good. */
  trashed: { at: string; by: string; until: string } | null;
};
/** Characters a member other than the GM may edit: the rest are the GM's to play. */
const playerRunOf = (ctx: Context) => {
  const out = new Set<string>();
  for (const [page, a] of Object.entries(ctx.list.pages ?? {})) if (Object.values(a.people).some(p => p.edit) || Object.values(a.groups).some(Boolean)) out.add(page);
  return out;
};
const memo = new WeakMap<Context, Set<string>>(), seen = new WeakMap<Context, TopicSummary[]>();
/** The topics this viewer sees: not in the Trash, and private ones only for their members and GMs. */
export function shownTopics(ctx: Context) {
  let list = seen.get(ctx);
  if (!list) seen.set(ctx, list = ctx.forum.topics.filter(t => canSee(t, ctx.viewer)));
  return list;
}
const live = (ctx: Context) => shownTopics(ctx).filter(t => !t.archived);
/**
 * A member as the browser may name them for a private topic: a short key made from the campaign and their account,
 * never the account itself. The server turns keys back into members.
 */
export const memberKey = (ctx: Pick<Context, "owner" | "campaignId">, userId: string) => createHash("sha256").update(`${ctx.owner}|${ctx.campaignId}|${userId}`).digest("hex").slice(0, 16);
export function membersFromKeys(ctx: Context, keys: readonly string[]) {
  const want = new Set(keys);
  return [ctx.owner, ...ctx.list.members.map(m => m.userId)].filter(u => want.has(memberKey(ctx, u)));
}
/** Who a private topic is for, by name. */
const privateNames = (ctx: Context, t: TopicSummary) => t.private ? [...new Set([t.by.userId, ...t.private])].map(u => memberName(ctx, u)) : null;
/** Whether the viewer writes for this participant of a topic. */
function controls(ctx: Context, who: string) {
  if (who === NARRATION) return ctx.viewer.rights.gm;
  if (ctx.viewer.editable.has(who)) return true;
  if (!ctx.viewer.rights.gm) return false;
  let run = memo.get(ctx);
  if (!run) memo.set(ctx, run = playerRunOf(ctx));
  return !run.has(who);
}
function turnOf(ctx: Context, entries: Map<string, Entry>, t: TopicSummary): Turn | null {
  if (t.locked || t.archived || t.trashed) return null;
  const board = ctx.forum.boards.find(b => b.id === t.boardId);
  if (!board || kindOf(ctx.forum, board) !== "ic") return null;
  const who = nextUp(t);
  if (!who) return null;
  const e = who === NARRATION ? undefined : entries.get(who);
  if (who !== NARRATION && !e) return null;
  return { name: e ? e.title : "the Game Master", picture: pictureOf(e), mine: controls(ctx, who) };
}
function topicRow(ctx: Context, entries: Map<string, Entry>, t: TopicSummary): TopicRow {
  return {
    id: t.id, boardId: t.boardId, title: t.title, pinned: t.pinned, locked: t.locked, replies: t.replies, by: bylineOf(ctx, entries, t.by), at: t.at, last: lastOf(ctx, entries, t),
    cast: t.cast.flatMap(id => { const e = entries.get(id); return e ? [{ id, name: e.title, picture: pictureOf(e) }] : []; }).slice(0, 6),
    unread: isUnread(ctx.reads, t, ctx.viewer.userId), next: turnOf(ctx, entries, t), archived: !!t.archived, only: privateNames(ctx, t),
    trashed: t.trashed ? { at: t.trashed.at, by: memberName(ctx, t.trashed.by), until: new Date(new Date(t.trashed.at).getTime() + TRASH_DAYS * 86_400_000).toISOString() } : null,
  };
}

export type BoardRow = {
  id: string; categoryId: string; parentId: string | null; name: string; description: string; kind: "ic" | "ooc"; locked: boolean;
  place: { id: string; name: string; picture: Picture | null; url: string | null } | null;
  topics: number; replies: number; last: LastPost | null; unread: boolean;
};
function boardRow(ctx: Context, entries: Map<string, Entry>, b: Board): BoardRow {
  const ids = new Set([b.id, ...ctx.forum.boards.filter(x => x.parentId === b.id).map(x => x.id)]);
  const topics = shownTopics(ctx).filter(t => ids.has(t.boardId)), latest = topics.reduce<TopicSummary | null>((a, t) => !a || t.lastAt > a.lastAt ? t : a, null);
  const place = b.placeId ? entries.get(b.placeId) : undefined;
  return {
    id: b.id, categoryId: b.categoryId, parentId: b.parentId, name: b.name, description: b.description, kind: kindOf(ctx.forum, b), locked: !!b.locked,
    place: place ? { id: place.id, name: place.title, picture: pictureOf(place), url: pageUrl(ctx, place.id) } : null,
    topics: topics.length, replies: topics.reduce((n, t) => n + t.replies, 0), last: latest ? lastOf(ctx, entries, latest) : null,
    unread: topics.some(t => isUnread(ctx.reads, t, ctx.viewer.userId)),
  };
}

/** The current in-world date: the first calendar this viewer may see. */
function dateOf(ctx: Context) {
  const cals = campaignOf(ctx).calendars ?? [], cal = ctx.viewer.rights.gm ? cals[0] : cals.find(x => x.visibility === "players");
  try { return cal ? formatDate(cal, cal.current) : null; } catch { return null; }
}

/** The staff shown in the top bar and footer: the GM, co-GMs and moderators. */
function staffOf(ctx: Context) {
  const out = [{ name: memberName(ctx, ctx.owner), role: "GM" }];
  for (const m of ctx.list.members) {
    if (can(ctx.list, m.userId, "seeGm")) out.push({ name: m.name, role: "Co-GM" });
    else if (can(ctx.list, m.userId, "forumModerate")) out.push({ name: m.name, role: "Moderator" });
  }
  return out;
}

/** A member's colour in the online list: their first group's, or null for the GM (the theme's accent). */
function colourOf(ctx: Context, userId: string) {
  if (userId === ctx.owner) return null;
  const m = ctx.list.members.find(x => x.userId === userId), g = m && ctx.list.groups.find(x => m.groups.includes(x.id));
  return g?.color ?? "gray";
}
/**
 * The topics the viewer writes in, and whose turn it is in each: theirs first (oldest waiting first), then the
 * ones waiting on someone else.
 */
function waitingOf(ctx: Context, entries: Map<string, Entry>) {
  const out: (TopicRow & { board: string })[] = [];
  for (const t of live(ctx)) {
    if (t.locked || !orderOf(t).some(who => controls(ctx, who))) continue;
    const row = topicRow(ctx, entries, t);
    if (row.next) out.push({ ...row, board: ctx.forum.boards.find(b => b.id === t.boardId)?.name ?? "" });
  }
  out.sort((a, b) => Number(b.next!.mine) - Number(a.next!.mine) || (a.next!.mine ? a.last.at.localeCompare(b.last.at) : b.last.at.localeCompare(a.last.at)));
  return out.slice(0, 30);
}
/** Characters who posted in the last day and a half, with the times of their posts; the browser keeps today's. */
function recentCharacters(ctx: Context, entries: Map<string, Entry>, now: Date) {
  const since = new Date(now.getTime() - 36 * 3_600_000).toISOString(), by = new Map<string, string[]>();
  const ok = new Set(shownTopics(ctx).map(t => t.id));
  for (const r of ctx.forum.recent ?? []) if (r.as && r.at >= since && entries.has(r.as) && ok.has(r.topicId)) by.set(r.as, [...(by.get(r.as) ?? []), r.at]);
  return [...by].map(([id, at]) => { const e = entries.get(id)!; return { id, name: e.title, picture: pictureOf(e), url: pageUrl(ctx, id), at }; }).sort((a, b) => b.at.length - a.at.length || a.name.localeCompare(b.name));
}

/** What every forum page shows: the banner, top bar, board list and footer, and who the viewer is. */
export function frameOf(ctx: Context) {
  const c = campaignOf(ctx), entries = entriesOf(ctx), s = ctx.forum.settings, f = ctx.forum, now = ctx.now ?? new Date();
  const waiting = waitingOf(ctx, entries), online = onlineOf(ctx.presence, now).filter(id => id === ctx.owner || ctx.list.members.some(m => m.userId === id));
  const newest = [...ctx.list.members].sort((a, b) => b.joinedAt.localeCompare(a.joinedAt))[0];
  const counts = Object.entries(f.counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const banner = s.banner && c.look?.banner && (ctx.viewer.rights.gm || c.look.players !== false) ? { imageId: c.look.banner.imageId, y: c.look.banner.y } : null;
  return {
    campaign: { name: c.name },
    settings: { title: s.title || c.name, tagline: s.tagline, links: s.links, banner: s.banner },
    banner, date: dateOf(ctx), staff: staffOf(ctx),
    you: {
      name: memberName(ctx, ctx.viewer.userId), rights: ctx.viewer.rights, posts: f.counts[ctx.viewer.userId] ?? 0, cast: castOf(ctx), editable: [...ctx.viewer.editable],
      unread: shownTopics(ctx).filter(t => isUnread(ctx.reads, t, ctx.viewer.userId)).length, waiting,
      /** Members by key and name, for choosing who a private topic is for. */
      people: ctx.viewer.rights.start ? [ctx.owner, ...ctx.list.members.filter(m => can(ctx.list, m.userId, "forumRead")).map(m => m.userId)].filter(u => u !== ctx.viewer.userId).map(u => ({ key: memberKey(ctx, u), name: memberName(ctx, u), gm: u === ctx.owner || can(ctx.list, u, "seeGm") })) : [],
    },
    categories: f.categories,
    boards: boardTree(f).flatMap(({ boards }) => boards.flatMap(({ board, subs }) => [board, ...subs])).map(b => boardRow(ctx, entries, b)),
    footer: {
      active: live(ctx).sort((a, b) => b.lastAt.localeCompare(a.lastAt)).slice(0, 5).map(t => topicRow(ctx, entries, t)),
      top: counts.slice(0, 5).map(([userId, posts]) => ({ name: memberName(ctx, userId), posts })),
      stats: {
        topics: shownTopics(ctx).length, posts: shownTopics(ctx).reduce((n, t) => n + t.replies + 1, 0), trash: ctx.viewer.rights.moderate ? f.topics.filter(t => t.trashed).length : 0, members: ctx.list.members.length + 1, characters: f.characters.length,
        peak: ctx.presence?.peak ?? null, newest: newest ? newest.name : null,
      },
      online: online.map(id => ({ name: memberName(ctx, id), color: colourOf(ctx, id), you: id === ctx.viewer.userId })),
      groups: [{ name: "Game Master", color: null as string | null }, ...ctx.list.groups.filter(g => ctx.list.members.some(m => m.groups[0] === g.id)).map(g => ({ name: g.name, color: g.color as string | null }))],
      today: recentCharacters(ctx, entries, now),
    },
  };
}
export type Frame = ReturnType<typeof frameOf>;

export function boardPage(ctx: Context, boardId: string, opts: { archive?: boolean } = {}) {
  const b = ctx.forum.boards.find(x => x.id === boardId);
  if (!b) return null;
  const entries = entriesOf(ctx), place = b.placeId ? entries.get(b.placeId) : undefined;
  const all = shownTopics(ctx).filter(t => t.boardId === b.id), archive = !!opts.archive;
  const topics = all.filter(t => !!t.archived === archive).sort((x, y) => Number(y.pinned && !archive) - Number(x.pinned && !archive) || y.lastAt.localeCompare(x.lastAt));
  return { board: boardRow(ctx, entries, b), place: place ? { summary: summaryOf(ctx, place) } : null, topics: topics.map(t => topicRow(ctx, entries, t)), archive, archived: all.filter(t => t.archived).length };
}
/** A page's first line, as this viewer may read it: players get the shared overview without its secrets. */
const summaryOf = (ctx: Context, e: Entry) => ctx.viewer.rights.gm ? firstLine(e.body) : e.overviewVisibility === "players" ? firstLine(playerText(e.body)) : "";
const firstLine = (text: string) => text.split("\n").map(l => l.replace(/[#>*`[\]]/g, "").trim()).find(l => l && !/^:::/.test(l))?.slice(0, 200) ?? "";

/** A topic with its posts, the hover card of each character in it and what the viewer may do to each post. */
export function topicPage(ctx: Context, topic: Topic) {
  const s = ctx.forum.topics.find(t => t.id === topic.id);
  // Moderators may open a topic in the Trash to look before restoring it.
  if (!s || !(canSee(s, ctx.viewer) || (s.trashed && ctx.viewer.rights.moderate && canSee({ ...s, trashed: undefined }, ctx.viewer)))) return null;
  const entries = entriesOf(ctx), board = ctx.forum.boards.find(b => b.id === s.boardId), r = ctx.viewer.rights;
  const cards: Record<string, Card> = {};
  for (const p of topic.posts) if (p.by.as && !cards[p.by.as]) { const e = entries.get(p.by.as); if (e) cards[e.id] = cardOf(ctx, e); }
  // [[Page]] links in the posts: the ones this reader may open, with a line to preview.
  const pages = [...entries.values()].filter(e => !ctx.readable || ctx.readable.has(e.id)), links: Record<string, { title: string; url: string; summary: string }> = {};
  for (const p of topic.posts) for (const target of linkTargets(p.body)) {
    if (links[target] || Object.keys(links).length >= 200) continue;
    const e = playerLink(pages, target), url = e && pageUrl(ctx, e.id);
    if (e && url) links[target] = { title: e.title, url, summary: summaryOf(ctx, e) };
  }
  return {
    links,
    topic: { ...topicRow(ctx, entries, s), kind: board ? kindOf(ctx.forum, board) : "ooc" as const, canRename: r.moderate || s.by.userId === ctx.viewer.userId, canReply: r.reply && (!s.locked || r.moderate) && !s.archived && !s.trashed },
    /** Posts after this, by others, are new to the viewer (null: all read, as for a first visit before marks). */
    readBefore: ctx.reads ? readUpTo(ctx.reads, s.id) : null,
    posts: topic.posts.map((p, i) => {
      const mine = p.by.userId === ctx.viewer.userId, open = (!s.locked || r.moderate) && !s.trashed;
      return { id: p.id, number: i + 1, at: p.at, editedAt: p.editedAt ?? null, body: p.body, as: p.by.as && cards[p.by.as] ? p.by.as : null, name: memberName(ctx, p.by.userId), posts: ctx.forum.counts[p.by.userId] ?? 0, mine, canEdit: (mine || r.moderate) && open, canDelete: (mine || r.moderate) && open && (i > 0 || topic.posts.length === 1) };
    }),
    cards,
  };
}

/** Every topic, latest activity first. */
export function activePage(ctx: Context, limit = 50) {
  const entries = entriesOf(ctx);
  return { topics: live(ctx).sort((a, b) => b.lastAt.localeCompare(a.lastAt)).slice(0, limit).map(t => topicRow(ctx, entries, t)) };
}

/** The Trash (moderators): topics waiting to go for good, newest first. */
export function trashPage(ctx: Context) {
  const entries = entriesOf(ctx);
  const topics = ctx.forum.topics.filter(t => t.trashed && canSee({ ...t, trashed: undefined }, ctx.viewer)).sort((a, b) => b.trashed!.at.localeCompare(a.trashed!.at));
  return { topics: topics.map(t => ({ ...topicRow(ctx, entries, t), board: ctx.forum.boards.find(b => b.id === t.boardId)?.name ?? "" })), days: TRASH_DAYS };
}

/** The members and their post counts, most posts first. */
export function membersPage(ctx: Context) {
  const staff = new Map(staffOf(ctx).map(s => [s.name, s.role]));
  const people = [{ userId: ctx.owner, name: memberName(ctx, ctx.owner) }, ...ctx.list.members.map(m => ({ userId: m.userId, name: m.name }))];
  const online = new Set(onlineOf(ctx.presence, ctx.now ?? new Date()));
  return { members: people.map(p => ({ name: p.name, role: staff.get(p.name) ?? (can(ctx.list, p.userId, "forumReply") ? "Player" : "Guest"), posts: ctx.forum.counts[p.userId] ?? 0, online: online.has(p.userId), color: colourOf(ctx, p.userId) })).sort((a, b) => b.posts - a.posts || a.name.localeCompare(b.name)) };
}

/** Places the GM can link a location board to. */
export function placesOf(ctx: Context) {
  return [...entriesOf(ctx).values()].filter(e => e.kind === "place").map(e => ({ id: e.id, name: e.title })).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Pictures the forum may show this campaign's readers: characters who have posted, the places of location boards,
 * the campaign banner, and (for the person posting) their own characters.
 */
export function forumImages(ctx: Context) {
  const entries = entriesOf(ctx), out = new Set<string>(), add = (e?: Entry) => { if (e?.picture) out.add(e.picture.imageId); };
  for (const id of ctx.forum.characters) add(entries.get(id));
  for (const b of ctx.forum.boards) if (b.placeId) add(entries.get(b.placeId));
  for (const c of castOf(ctx)) if (c.picture) out.add(c.picture.imageId);
  const look = campaignOf(ctx).look;
  if (look?.banner && ctx.forum.settings.banner) out.add(look.banner.imageId);
  return out;
}
