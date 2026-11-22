/*
 * The campaign's forum for AI apps over MCP (the forum tools in lib/mcp/tools.ts): its boards and topics, whose turn
 * it is, a topic's posts, and posting as the GM's narration or an NPC. The AI reads as the GM, or, when its connection
 * can't see GM-only things, as a member of the Players group would (no private topics, the boards' masks applied).
 *
 * A post goes up at once with the AI mark, or, when the connection is set to Ask me, waits in the topic for the GM or a
 * co-GM to approve, change or skip (suggestPost). Characters played by players are never posted as.
 */
import type { MemberList } from "../members.ts";
import { playerCampaign, type Workspace } from "../encyclopedia/world-model.ts";
import { ForumError, boardAccess, forumRights, kindOf, postTotal, reply, startTopic, suggestPost, typeOf, type Board, type Poster, type Topic, type TopicSummary } from "./model.ts";
import { activePage, castOf, controls, memberName, shownTopics, topicPage, type Context } from "./view.ts";
import { rollLine, rollPost, secureDie, withRollResults, type Roll } from "./rolls.ts";
import { sendAlerts } from "./request.ts";
import type { ForumStore } from "./store.ts";

export type ForumMcpDeps = {
  store: Pick<ForumStore, "read" | "readTopic" | "withTopic" | "readPosts" | "apply" | "readAlerts" | "writeAlerts">;
  /** The campaign's member list (read when a forum tool is first used). */
  members: () => Promise<MemberList>;
  owner: string; campaignId: string;
  workspace: Workspace;
  /** The connection may see GM-only things, so it reads as the GM. */
  gm: boolean;
  /** The connection's name, shown on its suggested posts. */
  connection: string;
  /** A line in the GM's AI activity log. */
  log?: (tool: "post_to_forum" | "start_topic", summary: string, detail?: string) => Promise<void>;
  now?: () => Date; newId?: () => string; random?: (sides: number) => number;
};
export type ForumMcp = ReturnType<typeof forumMcp>;

const fail = (message: string): never => { throw new ForumError(message); };
const AI_MEMBER = "ai-connection";
const snippet = (s: string) => { const t = s.replace(/\s+/g, " ").trim(); return t.length > 120 ? t.slice(0, 117) + "…" : t; };
const shortDate = (iso: string) => iso.slice(0, 16).replace("T", " ");

/** Finds one by id, else by name: exact, then starts with, then contains, ignoring case. */
function find<T>(items: readonly T[], query: string, id: (t: T) => string, name: (t: T) => string, what: string): T {
  const q = query.trim().toLowerCase(), byId = items.find(t => id(t) === query.trim());
  if (byId) return byId;
  for (const test of [(n: string) => n === q, (n: string) => n.startsWith(q), (n: string) => n.includes(q)]) {
    const found = items.filter(t => test(name(t).toLowerCase()));
    if (found.length === 1) return found[0]!;
    if (found.length > 1) fail(`More than one ${what} matches "${query}": ${found.slice(0, 8).map(name).join(", ")}. Use the full name or the id.`);
  }
  return fail(`No ${what} called "${query}" in the forum.`);
}

export function forumMcp(d: ForumMcpDeps) {
  const now = () => d.now?.() ?? new Date(), newId = d.newId ?? (() => crypto.randomUUID()), random = d.random ?? secureDie;

  /** The forum as the GM sees it, and as this connection sees it (the same when it may see GM-only things). */
  async function load() {
    const [list, { forum, etag }] = await Promise.all([d.members(), d.store.read(d.owner, d.campaignId)]);
    if (etag === null) fail("This campaign has no forum yet. The GM sets one up from the campaign's page in RPG Tools.");
    const base = { forum, list, owner: d.owner, workspace: d.workspace, campaignId: d.campaignId, readable: null, now: now() };
    const rights = forumRights(list, d.owner, d.owner);
    const gm: Context = { ...base, viewer: { userId: d.owner, rights, key: `c-${d.campaignId}`, editable: new Set(), access: boardAccess(forum, list, d.owner, rights) } };
    if (d.gm) return { gm, ctx: gm, list };
    // As a player: the Players group's forum rights and the boards' masks, and only the pages players may read.
    const players = list.groups.find(g => g.builtin === "players"), as = { ...list, members: [...list.members, { userId: AI_MEMBER, name: "AI", groups: players ? [players.id] : [], joinedAt: base.now.toISOString() }] };
    const own = forumRights(as, AI_MEMBER, d.owner), pr = { ...own, owner: false, gm: false, moderate: false, boards: false };
    if (!pr.read) fail("Players can't read this forum, and this connection only sees what players see.");
    const ctx: Context = { ...base, list: as, readable: new Set(playerCampaign(d.workspace, d.campaignId, new Set()).entries.map(e => e.id)), viewer: { userId: AI_MEMBER, rights: pr, key: `c-${d.campaignId}`, editable: new Set(), access: boardAccess(forum, as, AI_MEMBER, pr) } };
    return { gm, ctx, list };
  }
  const boardsOf = (ctx: Context) => ctx.forum.boards.filter(b => ctx.viewer.access?.[b.id]?.read ?? ctx.viewer.rights.read);
  const boardName = (ctx: Context, id: string) => ctx.forum.boards.find(b => b.id === id)?.name ?? "";
  const topicOf = (ctx: Context, q: string) => find(shownTopics(ctx).filter(t => !t.trashed), q, t => t.id, t => t.title, "topic");
  const boardOf = (ctx: Context, q: string) => find(boardsOf(ctx), q, b => b.id, b => b.name, "board");
  const kindName = (f: Context["forum"], b: Board) => ({ location: "location (in character)", campaign: "campaign board (in character)", ooc: "out of character" })[typeOf(f, b)];

  /** The GM, posting: every board, and the characters they play. */
  const posterOf = (gm: Context): Poster => ({ userId: d.owner, rights: gm.viewer.rights, cast: new Set(castOf(gm).map(c => c.id)), access: gm.viewer.access });
  /** Who a post is from: the GM's narration (in character), an NPC the GM plays, or the GM themselves out of character. */
  function asOf(gm: Context, board: Board, q: string | undefined) {
    const narration = !q || /^(narration|narrator|gm|game master|the game master|dm)$/i.test(q.trim());
    if (kindOf(gm.forum, board) === "ooc") return narration ? null : fail(`“${board.name}” is out of character: posts there are the GM's own, so leave out as.`);
    if (narration) return null;
    const c = find(castOf(gm), q!, x => x.id, x => x.name, "character");
    if (!controls(gm, c.id)) fail(`${c.name} is played by a player. Write the GM's narration or an NPC instead, and leave ${c.name}'s actions to their player.`);
    return c.id;
  }
  const rollsText = (rolls: readonly (Roll | null)[]) => rolls.flatMap(r => r ? [rollLine(r)] : []);

  function row(ctx: Context, gmRows: Map<string, ReturnType<typeof activePage>["topics"][number]>, t: TopicSummary) {
    const r = gmRows.get(t.id), mine = ctx.viewer.userId === d.owner;
    return {
      id: t.id, title: t.title, board: boardName(ctx, t.boardId), replies: t.replies, startedBy: r?.by.name, last: r ? { name: r.last.name, at: shortDate(r.last.at) } : undefined,
      next: r?.next ? `${r.next.name}${r.next.mine ? " (the GM's turn)" : ""}` : undefined, combatRound: t.combat?.round,
      pinned: t.pinned || undefined, locked: t.locked || undefined, archived: t.archived || undefined,
      ...(mine && t.private ? { privateFor: [...new Set([t.by.userId, ...t.private])].map(u => memberName(ctx, u)) } : {}),
      ...(mine && t.suggested ? { suggestedPostsWaiting: t.suggested } : {}),
    };
  }
  const gmRowsOf = (gm: Context) => new Map(activePage(gm, 3000).topics.map(r => [r.id, r]));


  return {
    /** list_forum: categories and their boards, with subforums. */
    async boards() {
      const { ctx } = await load(), shown = boardsOf(ctx), topics = shownTopics(ctx).filter(t => !t.archived);
      const one = (b: Board): Record<string, unknown> => {
        const mine = topics.filter(t => t.boardId === b.id), last = mine.reduce<TopicSummary | null>((a, t) => !a || t.lastAt > a.lastAt ? t : a, null);
        const place = b.placeId ? d.workspace.entries.find(e => e.id === b.placeId && (!ctx.readable || ctx.readable.has(e.id))) : undefined;
        const subs = shown.filter(x => x.parentId === b.id);
        return { id: b.id, name: b.name, kind: kindName(ctx.forum, b), description: b.description || undefined, place: place?.title, onlyModeratorsStartTopics: b.locked || undefined, topics: mine.length, lastActivity: last ? `${shortDate(last.lastAt)} in “${last.title}”` : undefined, ...(subs.length ? { subforums: subs.map(one) } : {}) };
      };
      return { categories: ctx.forum.categories.map(c => ({ name: c.name, kind: c.kind === "ic" ? "in character" : "out of character", boards: shown.filter(b => b.categoryId === c.id && !b.parentId).map(one) })).filter(c => c.boards.length) };
    },

    /** list_topics: a board's topics, or the latest across the forum. */
    async topics(a: { board?: string; archived?: boolean; limit?: number }) {
      const { ctx, gm } = await load(), board = a.board ? boardOf(ctx, a.board) : null, rows = gmRowsOf(gm);
      const list = shownTopics(ctx).filter(t => !t.trashed && (!board || t.boardId === board.id) && !!t.archived === !!a.archived)
        .sort((x, y) => (board ? Number(!!y.pinned) - Number(!!x.pinned) : 0) || y.lastAt.localeCompare(x.lastAt));
      const limit = Math.min(Math.max(a.limit ?? 25, 1), 100);
      return { board: board?.name, shown: Math.min(limit, list.length), of: list.length, topics: list.slice(0, limit).map(t => row(ctx, rows, t)) };
    },

    /** read_topic: a topic's posts with the dice written in, its fight and whose turn it is. */
    async read(a: { topic: string; from?: number; last?: number }) {
      const { ctx, gm } = await load(), s = topicOf(ctx, a.topic), count = Math.min(Math.max(a.last ?? 30, 1), 100);
      // Only the posts asked for are read: a long topic keeps its older posts in pages (pages.ts).
      const got = await d.store.withTopic(d.owner, d.campaignId, s.id, async topic => {
        const total = postTotal(topic), start = a.from ? Math.min(Math.max(a.from, 1), total) - 1 : Math.max(0, total - count);
        return { total, start, page: topicPage(ctx, topic, { posts: await d.store.readPosts(d.owner, d.campaignId, topic, start, count), start, total, page: 1, pages: 1, per: count }) };
      });
      const page = got?.page ?? fail("That topic was removed."), { total, start } = got!;
      const board = ctx.forum.boards.find(b => b.id === s.boardId), ic = !!board && kindOf(ctx.forum, board) === "ic";
      const posts = page.posts.map(p => ({
        number: p.number, name: p.as ? page.cards[p.as]?.name ?? "A character" : ic ? "Game Master" : p.name, player: p.name, at: shortDate(p.at),
        ...(p.turn ? { turn: `Round ${p.turn.round}, ${p.turn.name}'s turn` } : {}), ...(p.ai ? { draftedWithAi: true } : {}), ...(p.editedAt ? { edited: true } : {}),
        body: withRollResults(p.body, p.rolls),
      }));
      const r = gmRowsOf(gm).get(s.id);
      return {
        id: s.id, title: s.title, board: board?.name, kind: board ? kindName(ctx.forum, board) : undefined, locked: s.locked || undefined, archived: s.archived || undefined,
        showing: `posts ${posts[0]?.number ?? 0}–${posts.at(-1)?.number ?? 0} of ${total}`, ...(start > 0 ? { earlier: `Posts 1–${start} aren't shown: pass from to read them.` } : {}),
        next: r?.next ? `${r.next.name}${r.next.mine ? " (the GM's turn: narration or an NPC)" : " (a player's turn: wait for them)"}` : undefined,
        ...(page.combat ? { combat: { round: page.combat.round, order: page.combat.order.map(x => ({ name: x.name, ...(x.init !== undefined ? { initiative: x.init } : {}), ...(x.now ? { now: true } : {}), characters: x.as.map(c => `${c.name}${c.done ? " (posted)" : ""}`), npcTurn: !x.as.length || undefined })) } } : {}),
        ...(page.suggested.length ? { suggestedPostsWaiting: page.suggested.map(x => ({ as: x.name, at: shortDate(x.at), by: x.connection, body: snippet(x.body) })) } : {}),
        posts,
      };
    },

    /** whose_turn: in-character topics waiting on the GM, and the ones waiting on players. */
    async turns() {
      const { ctx, gm } = await load(), seen = new Set(shownTopics(ctx).map(t => t.id)), rows = activePage(gm, 3000).topics.filter(r => r.next && seen.has(r.id));
      const line = (r: (typeof rows)[number]) => ({ id: r.id, title: r.title, board: boardName(gm, r.boardId), next: r.next!.name, since: shortDate(r.last.at), lastPostBy: r.last.name, ...(r.combat ? { combatRound: r.combat.round } : {}) });
      const gmTurn = rows.filter(r => r.next!.mine), players = rows.filter(r => !r.next!.mine);
      return { gmTurn: gmTurn.slice(0, 40).map(line), waitingOnPlayers: players.slice(0, 40).map(line), note: "Oldest waits first matter most. Only post for the GM's own turns; never write the player characters' actions." };
    },

    /** post_to_forum: a reply as narration or an NPC (in character) or as the GM (out of character). */
    async post(a: { topic: string; body: string; as?: string }, mode: "do" | "ask") {
      const { ctx, gm, list } = await load(), s = topicOf(ctx, a.topic), board = gm.forum.boards.find(b => b.id === s.boardId) ?? fail("That topic was removed.");
      const as = asOf(gm, board, a.as), who = posterOf(gm), stamp = now(), name = as ? castOf(gm).find(c => c.id === as)!.name : kindOf(gm.forum, board) === "ic" ? "narration" : "the GM";
      const need = (t: Topic | null) => t ?? fail("That topic was removed.");
      if (mode === "ask") {
        const id = newId();
        await d.store.apply(d.owner, d.campaignId, s.id, (f, t) => suggestPost(f, need(t), { body: a.body, as }, who, { id, connection: d.connection }, stamp));
        await d.log?.("post_to_forum", `Suggested a post as ${name} in “${s.title}”`, snippet(a.body)).catch(() => undefined);
        return { waitingForGM: true, suggestion: id, note: "This post waits in the topic for the GM to approve, change or skip, so it isn't posted yet: don't describe it as posted. read_topic shows what is still waiting." };
      }
      const postId = newId(), rolls = rollPost(a.body, random);
      await d.store.apply(d.owner, d.campaignId, s.id, (f, t) => reply(f, need(t), { body: a.body, as, rolls, ai: true }, who, postId, stamp));
      await sendAlerts(d, gm, { owner: d.owner, campaignId: d.campaignId, list }, { topicId: s.id, postId, body: a.body, as, private: [] }, stamp).catch(() => undefined);
      await d.log?.("post_to_forum", `Posted as ${name} in “${s.title}”`, snippet(a.body)).catch(() => undefined);
      return { posted: true, topic: s.title, as: name, ...(rolls.some(Boolean) ? { rolls: rollsText(rolls) } : {}) };
    },

    /** start_topic: a new topic, opened by narration, an NPC or the GM. */
    async start(a: { board: string; title: string; body: string; as?: string }) {
      const { ctx, gm, list } = await load(), board = boardOf(ctx, a.board), as = asOf(gm, board, a.as), who = posterOf(gm), stamp = now();
      const ids = { topic: newId(), post: newId() }, rolls = rollPost(a.body, random);
      await d.store.apply(d.owner, d.campaignId, null, f => startTopic(f, { boardId: board.id, title: a.title, body: a.body, as, rolls, ai: true }, who, ids, stamp));
      await sendAlerts(d, gm, { owner: d.owner, campaignId: d.campaignId, list }, { topicId: ids.topic, postId: ids.post, body: a.body, as, private: [] }, stamp).catch(() => undefined);
      await d.log?.("start_topic", `Started “${a.title.trim()}” on ${board.name}`, snippet(a.body)).catch(() => undefined);
      return { started: true, topic: a.title.trim(), id: ids.topic, board: board.name, ...(rolls.some(Boolean) ? { rolls: rollsText(rolls) } : {}) };
    },
  };
}
