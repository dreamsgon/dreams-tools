import type { Bucket } from "./storage-types";
import { loadWorkspace, saveWorkspace } from "./workspace-storage.ts";
import { canMoveCollection, initialWorkspace, uid, type Workspace as MapWorkspace } from "./model.ts";
import { EncyclopediaStore, encyclopediaPrefix } from "./encyclopedia/store.ts";
import { campaignLoreWorldIds, newId, playerCampaign, visibleEntries, type Workspace as BookWorkspace } from "./encyclopedia/world-model.ts";
import { defaultFrontPage, frontPageSchema } from "./encyclopedia/front-page.ts";
import { scenesInOrder } from "./scene-order.ts";
import { dashboardSchema, excerpt, type Dashboard } from "./encyclopedia/dashboard.ts";
import { getInitiativeEntries, getCurrentInitiativeEntry, getInitiativeRound } from "./initiative-tracker.ts";
import { applyHomeAction } from "./home-layout.ts";
import { changeHome, readHome } from "./home-store.ts";
import { inCampaign } from "./encyclopedia/tables.ts";
import { starredTables, type StarredTables } from "./home-tables.ts";
import { questsIn, questProgress, nextStep } from "./encyclopedia/quests.ts";
import { codexIn } from "./encyclopedia/codex.ts";
import { formatDate } from "./encyclopedia/calendar-model.ts";
import { moveSibling, placeBeside, sortSiblings } from "./folder-order.ts";
import { ForumStore } from "./forum/store.ts";
import { applyForumAccess, defaultForumSetup, forumFromSetup, forumSetupSchema } from "./forum/setup.ts";
import { MemberStore } from "./members-server.ts";
import { applyPairs, campaignFolders, campaignSummary, cleanName, rowByKey } from "./campaign-links.ts";

/*
 * The Campaigns page: one list of campaigns across Maptable and the Encyclopedia.
 * Each tool keeps its own saved data. Pairing only sets the optional
 * `maptableCampaignId` on an Encyclopedia campaign. Before the first change made
 * here, both workspaces are copied to a private backup that is never overwritten.
 */

export type Session = { bucket: Bucket; owner: string; prefix: string; book: EncyclopediaStore };
export function campaignSession(bucket: Bucket, owner: string): Session {
  return { bucket, owner, prefix: `users/${encodeURIComponent(owner)}/`, book: new EncyclopediaStore(bucket as ConstructorParameters<typeof EncyclopediaStore>[0]) };
}

export async function readBoth(s: Session) {
  const [map, book] = await Promise.all([loadWorkspace(s.bucket, s.prefix), s.book.read(s.owner)]);
  return { map, book };
}

export const backupKey = (owner: string) => encyclopediaPrefix(owner) + "backups/before-campaigns-page.json";

/** Keeps a copy of both workspaces as they were before this page first changed anything. */
async function backupOnce(s: Session, both: Awaited<ReturnType<typeof readBoth>>) {
  const key = backupKey(s.owner);
  if (await s.bucket.head(key)) return;
  const body = JSON.stringify({ createdAt: new Date().toISOString(), note: "Maptable and Wiki data before the Campaigns page changed anything.", maptable: both.map?.workspace ?? null, encyclopedia: both.book.data });
  await s.bucket.put(key, body, { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json" } });
}

const busy = () => new Error("Something else saved at the same moment. Nothing was changed here; reload and try again.");

async function saveMap(s: Session, map: Awaited<ReturnType<typeof loadWorkspace>>, next: MapWorkspace) {
  if (!(await saveWorkspace(s.bucket, s.prefix, next, map?.revision ?? null))) throw busy();
}
async function saveBook(s: Session, revision: number, next: BookWorkspace) {
  if ((await s.book.save(s.owner, next, revision)) === null) throw busy();
}

export function summaryOf(both: { map: { workspace: MapWorkspace } | null; book: { data: BookWorkspace } }, recentLimit = 6) {
  return campaignSummary(both.map?.workspace ?? null, both.book.data, recentLimit);
}


export function backupFile(both: Awaited<ReturnType<typeof readBoth>>) {
  return JSON.stringify({ createdAt: new Date().toISOString(), maptable: both.map?.workspace ?? null, encyclopedia: both.book.data });
}

export type CampaignAction =
  | { action: "pair"; pairs: { encyclopediaId: string; maptableId: string | null }[] }
  | { action: "rename"; encyclopediaId?: string; maptableId?: string; name: string; description?: string }
  | { action: "create"; name: string; description?: string; maptable: boolean; encyclopedia: boolean; worldId?: string; newWorld?: string; solo?: boolean }
  | { action: "newFolder"; name: string; parentId?: string | null }
  | { action: "renameFolder"; folderId: string; name: string }
  | { action: "removeFolder"; folderId: string }
  | { action: "moveCampaign"; key: string; folderId: string | null }
  | { action: "moveFolder"; folderId: string; parentId: string | null }
  | { action: "stepFolder"; folderId: string; delta: -1 | 1 }
  | { action: "placeFolder"; folderId: string; targetId: string; place: "before" | "after" }
  | { action: "complete"; encyclopediaId?: string; maptableId?: string; worldId?: string; newWorld?: string }
  | { action: "forum"; encyclopediaId: string; setup?: unknown }
  | { action: "solo"; encyclopediaId: string; on: boolean };

const str = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 120 ? v : undefined;
const describe = (v: unknown) => typeof v === "string" ? v.trim().slice(0, 1000) : "";

/** Before the first hand-made order the page lists folders by name: save that order so a move starts from what was on screen. */
function namedOrder(map: MapWorkspace): MapWorkspace {
  if (map.campaignFoldersOrdered) return map;
  const ids = new Set(campaignFolders(map.collections).map(f => f.id));
  return { ...map, collections: sortSiblings(map.collections, (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }), c => ids.has(c.id)) };
}
/** A campaign folder that exists, from an id in a request. */
function folderOf(map: MapWorkspace, id: unknown) {
  const folder = campaignFolders(map.collections).find(f => f.id === str(id));
  if (!folder) throw new Error("That folder no longer exists. Reload the page.");
  return folder.id;
}
/** Where something may go: a campaign folder, or null for the top level. */
const parentOf = (map: MapWorkspace, id: unknown) => id === null || id === undefined ? null : folderOf(map, id);
function withFolder<T extends { folderId?: string }>(c: T, folderId: string | null): T {
  const next = { ...c };
  delete next.folderId;
  return folderId ? { ...next, folderId } : next;
}

function addMapCampaign(map: MapWorkspace, name: string) {
  const id = uid();
  return { id, next: { ...map, collections: [...map.collections, { id, name, kind: "campaign" as const, parentId: null }] } };
}
function addBookCampaign(book: BookWorkspace, body: { worldId?: unknown; newWorld?: unknown; solo?: unknown }, name: string, description: string, maptableId?: string) {
  let worlds = book.worlds, worldId = str(body.worldId);
  if (!worldId || !worlds.some(w => w.id === worldId && !w.isTemplate)) {
    if (typeof body.newWorld !== "string" || !body.newWorld.trim()) throw new Error("Choose a world for the Wiki.");
    worldId = newId();
    worlds = [...worlds, { id: worldId, name: cleanName(body.newWorld), description: "", archived: false }];
  }
  const id = newId();
  return { id, next: { ...book, worlds, campaigns: [...book.campaigns, { id, worldId, name, description, github: { repository: "", branch: "main" }, ...(maptableId ? { maptableCampaignId: maptableId } : {}), ...(body.solo === true ? { solo: true } : {}) }] } };
}

/** Runs one change from the Campaigns page and returns the new list. */
export async function campaignAction(s: Session, body: CampaignAction) {
  const both = await readBoth(s);
  await backupOnce(s, both);
  const mapNow = both.map?.workspace ?? initialWorkspace();
  if (body.action === "pair") {
    if (!Array.isArray(body.pairs) || body.pairs.length > 500) throw new Error("Invalid pairs.");
    const pairs = body.pairs.map(p => ({ encyclopediaId: str(p?.encyclopediaId) ?? "", maptableId: p?.maptableId === null ? null : str(p?.maptableId) ?? "" }));
    await saveBook(s, both.book.revision, applyPairs(both.book.data, both.map?.workspace ?? null, pairs));
  } else if (body.action === "rename") {
    const name = cleanName(body.name), eid = str(body.encyclopediaId), mid = str(body.maptableId);
    if (!eid && !mid) throw new Error("Choose a campaign.");
    if (mid) {
      if (!mapNow.collections.some(c => c.id === mid && c.kind === "campaign")) throw new Error("That Maptable campaign no longer exists. Reload the page.");
      await saveMap(s, both.map, { ...mapNow, collections: mapNow.collections.map(c => c.id === mid ? { ...c, name } : c) });
    }
    if (eid) {
      if (!both.book.data.campaigns.some(c => c.id === eid)) throw new Error("That Wiki campaign no longer exists. Reload the page.");
      const description = body.description === undefined ? undefined : describe(body.description);
      await saveBook(s, both.book.revision, { ...both.book.data, campaigns: both.book.data.campaigns.map(c => c.id === eid ? { ...c, name, ...(description === undefined ? {} : { description }) } : c) });
    }
  } else if (body.action === "create") {
    const name = cleanName(body.name), description = describe(body.description);
    if (!body.maptable && !body.encyclopedia) throw new Error("Choose at least one tool.");
    // Solo play is kept with the Encyclopedia notes, where the characters are.
    if (body.solo === true && !body.encyclopedia) throw new Error("A solo campaign needs a Wiki: it holds your characters.");
    let mapId: string | undefined;
    // Encyclopedia problems (such as no world chosen) are found before Maptable is changed.
    const book = body.encyclopedia ? addBookCampaign(both.book.data, body, name, description) : null;
    if (body.maptable) { const made = addMapCampaign(mapNow, name); mapId = made.id; await saveMap(s, both.map, made.next); }
    if (book) await saveBook(s, both.book.revision, mapId ? applyPairs(book.next, { collections: [...mapNow.collections, { id: mapId, name, kind: "campaign", parentId: null }] }, [{ encyclopediaId: book.id, maptableId: mapId }]) : book.next);
  } else if (body.action === "complete") {
    const eid = str(body.encyclopediaId), mid = str(body.maptableId);
    if (eid) {
      const campaign = both.book.data.campaigns.find(c => c.id === eid);
      if (!campaign) throw new Error("That Wiki campaign no longer exists. Reload the page.");
      if (campaign.maptableCampaignId && mapNow.collections.some(c => c.id === campaign.maptableCampaignId)) throw new Error("This campaign already has a Maptable campaign.");
      const made = addMapCampaign(mapNow, cleanName(campaign.name));
      await saveMap(s, both.map, made.next);
      await saveBook(s, both.book.revision, applyPairs(both.book.data, made.next, [{ encyclopediaId: eid, maptableId: made.id }]));
    } else if (mid) {
      const campaign = mapNow.collections.find(c => c.id === mid && c.kind === "campaign");
      if (!campaign) throw new Error("That Maptable campaign no longer exists. Reload the page.");
      if (both.book.data.campaigns.some(c => c.maptableCampaignId === mid)) throw new Error("This campaign already has a Wiki.");
      await saveBook(s, both.book.revision, addBookCampaign(both.book.data, body, campaign.name, "", mid).next);
    } else throw new Error("Choose a campaign.");
  } else if (body.action === "forum") {
    // Sets up the campaign's forum: an empty one in storage, and the flag the campaign pages read.
    const eid = str(body.encyclopediaId), campaign = both.book.data.campaigns.find(c => c.id === eid);
    if (!campaign) throw new Error("That campaign has no Wiki, which its forum lives with. Reload the page.");
    // `setup` is what the GM confirmed (lib/forum/setup.ts); left out, the forum starts as it always did. A forum that is
    // already there (used before forums were opt-in) keeps its boards, settings and the groups' permissions.
    const parsed = body.setup === undefined ? { success: true as const, data: defaultForumSetup() } : forumSetupSchema.safeParse(body.setup);
    if (!parsed.success) throw new Error("Check the forum's settings: a name up to 80 letters and a tagline up to 160.");
    if (await new ForumStore(s.bucket).create(s.owner, campaign.id, forumFromSetup(parsed.data))) {
      const members = new MemberStore(s.bucket as ConstructorParameters<typeof MemberStore>[0]), { list, etag } = await members.read(s.owner, campaign.id), next = applyForumAccess(list, parsed.data);
      // A campaign that has never had members has no list yet: only write one when the choices differ from the defaults.
      if (etag || JSON.stringify(next.groups) !== JSON.stringify(list.groups)) await members.change(s.owner, campaign.id, l => applyForumAccess(l, parsed.data));
    }
    if (!campaign.forum) await saveBook(s, both.book.revision, { ...both.book.data, campaigns: both.book.data.campaigns.map(c => c.id === campaign.id ? { ...c, forum: true } : c) });
  } else if (body.action === "solo") {
    // Solo play: just the GM, with an oracle or an AI. Nothing else changes, so it can be switched back at any time.
    const eid = str(body.encyclopediaId), campaign = both.book.data.campaigns.find(c => c.id === eid);
    if (!campaign) throw new Error("That campaign has no Wiki, which solo play lives with. Reload the page.");
    if (typeof body.on !== "boolean") throw new Error("Choose solo play on or off.");
    if ((campaign.solo === true) !== body.on) await saveBook(s, both.book.revision, { ...both.book.data, campaigns: both.book.data.campaigns.map(c => {
      if (c.id !== campaign.id) return c;
      const next = { ...c };
      delete next.solo;
      return body.on ? { ...next, solo: true } : next;
    }) });
  } else if (body.action === "newFolder") {
    const name = cleanName(body.name, "folder"), parentId = parentOf(mapNow, body.parentId);
    await saveMap(s, both.map, { ...mapNow, collections: [...mapNow.collections, { id: uid(), name, kind: "folder", parentId }] });
  } else if (body.action === "renameFolder") {
    const name = cleanName(body.name, "folder"), id = folderOf(mapNow, body.folderId);
    await saveMap(s, both.map, { ...mapNow, collections: mapNow.collections.map(c => c.id === id ? { ...c, name } : c) });
  } else if (body.action === "removeFolder") {
    const id = folderOf(mapNow, body.folderId), up = mapNow.collections.find(c => c.id === id)!.parentId;
    // Everything inside moves up a level; nothing is deleted.
    await saveMap(s, both.map, {
      ...mapNow,
      collections: mapNow.collections.filter(c => c.id !== id).map(c => c.parentId === id ? { ...c, parentId: up } : c),
      scenes: mapNow.scenes.map(sc => sc.containerId === id ? { ...sc, containerId: up } : sc),
    });
    if (both.book.data.campaigns.some(c => c.folderId === id)) await saveBook(s, both.book.revision, { ...both.book.data, campaigns: both.book.data.campaigns.map(c => c.folderId === id ? withFolder(c, up) : c) });
  } else if (body.action === "moveCampaign") {
    const key = str(body.key) ?? "", folderId = parentOf(mapNow, body.folderId);
    const row = rowByKey(summaryOf(both).rows, key);
    if (!row) throw new Error("That campaign no longer exists. Reload the page.");
    if (row.maptable) await saveMap(s, both.map, { ...mapNow, collections: mapNow.collections.map(c => c.id === row.maptable!.id ? { ...c, parentId: folderId } : c) });
    if (row.encyclopedia) await saveBook(s, both.book.revision, { ...both.book.data, campaigns: both.book.data.campaigns.map(c => c.id === row.encyclopedia!.id ? withFolder(c, folderId) : c) });
  } else if (body.action === "moveFolder") {
    const id = folderOf(mapNow, body.folderId), parentId = parentOf(mapNow, body.parentId);
    if (!canMoveCollection(mapNow.collections, id, parentId)) throw new Error("A folder can't go inside itself or one of its own folders.");
    await saveMap(s, both.map, { ...mapNow, collections: mapNow.collections.map(c => c.id === id ? { ...c, parentId } : c) });
  } else if (body.action === "stepFolder") {
    const id = folderOf(mapNow, body.folderId), delta = body.delta === -1 ? -1 : 1;
    const { collections } = namedOrder(mapNow);
    await saveMap(s, both.map, { ...mapNow, campaignFoldersOrdered: true, collections: moveSibling(collections, id, delta, c => c.kind === "folder") });
  } else if (body.action === "placeFolder") {
    const id = folderOf(mapNow, body.folderId), targetId = folderOf(mapNow, body.targetId), place = body.place === "before" ? "before" : "after";
    const target = mapNow.collections.find(c => c.id === targetId)!;
    if (!canMoveCollection(mapNow.collections, id, target.parentId)) throw new Error("A folder can't go inside itself or one of its own folders.");
    await saveMap(s, both.map, { ...mapNow, campaignFoldersOrdered: true, collections: placeBeside(namedOrder(mapNow).collections, id, targetId, place) });
  } else throw new Error("Unknown action.");
  return summaryOf(await readBoth(s));
}

export type HubInitiativeRow = { id: string; name: string; initiative: number; active: boolean; skipped: boolean; stats: string };
export type HubInitiative = { sceneId: string; sceneName: string; round: number | null; rows: HubInitiativeRow[] };

/**
 * The initiative order of the campaign's most recently used scene that has one: the scene open in Maptable when it
 * qualifies (Maptable keeps no per-scene timestamp), otherwise the last such scene in the campaign's order.
 */
export function lastEncounter(map: MapWorkspace, rootId: string): HubInitiative | null {
  const withInitiative = scenesInOrder(map, rootId).map(x => x.scene).filter(s => (s.tokens ?? []).some(t => typeof t.initiative === "number" && Number.isFinite(t.initiative)));
  const scene = withInitiative.find(s => s.id === map.activeId) ?? withInitiative[withInitiative.length - 1];
  if (!scene) return null;
  const current = getCurrentInitiativeEntry(scene);
  const rows = getInitiativeEntries(scene).filter(e => e.initiative !== null).slice(0, 40).map(e => {
    const one = e.tokens.length === 1 ? e.tokens[0] : null;
    return {
      id: e.id, name: e.label, initiative: e.initiative!, active: e.id === current?.id, skipped: e.tokens.every(t => t.skipInitiative),
      stats: one ? (one.maxHp > 0 ? `${one.hp}/${one.maxHp} HP` : "") : `×${e.tokens.length}`,
    };
  });
  return { sceneId: scene.id, sceneName: scene.name, round: scene.initiativeState ? getInitiativeRound(scene) : null, rows };
}

/** Things a campaign's dashboard needs from outside the two workspaces. */
export type HubExtras = {
  /** Dashboards of Maptable-only campaigns, from the account's home file (keyed "m:<id>"). */
  dashboards?: Record<string, Dashboard>;
  /** The campaign's starred random tables, for Quick roll. */
  tables?: StarredTables;
};

/** One campaign for the campaign hub: its dashboard and its front page. */
export function hubOf(both: { map: { workspace: MapWorkspace } | null; book: { data: BookWorkspace } }, key: string, extras: HubExtras = {}) {
  const summary = summaryOf(both), row = rowByKey(summary.rows, key);
  if (!row) throw new Error("Campaign not found");
  const map = both.map?.workspace ?? null, book = both.book.data;
  const campaign = row.encyclopedia ? book.campaigns.find(c => c.id === row.encyclopedia!.id) ?? null : null;
  const own = campaign ? book.entries.filter(e => e.campaignId === campaign.id && e.kind !== "folder") : [];
  // Shared world pages count too, as they do inside the campaign in the Encyclopedia.
  const seen = campaign ? visibleEntries(book, campaign.worldId, campaign.id).filter(e => e.kind !== "folder") : [];
  const player = campaign ? playerCampaign(book, campaign.id) : null;
  const titleOf = (id: string | null) => id ? book.entries.find(e => e.id === id)?.title ?? "" : "";
  const quests = campaign ? questsIn(book, campaign.worldId, campaign.id, campaignLoreWorldIds(book, campaign))
    .sort((a, b) => (a.quest.rank ?? 1e9) - (b.quest.rank ?? 1e9) || b.entry.updatedAt.localeCompare(a.entry.updatedAt))
    .map(({ entry, quest }) => ({ id: entry.id, title: entry.title, state: quest.state, type: quest.type, ...questProgress(quest), next: nextStep(quest) })) : [];
  const codex = campaign ? codexIn(book.entries, campaign.worldId, campaign.id, campaignLoreWorldIds(book, campaign))
    .map(e => ({ id: e.id, title: e.title, category: e.codex.category, foundAt: e.codex.found[campaign.id]?.at ?? null, at: e.codex.found[campaign.id]?.at ?? e.updatedAt }))
    .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8) : [];
  const session = seen.filter(e => e.kind === "session").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const calendar = campaign?.calendars?.find(c => c.visibility === "players") ?? campaign?.calendars?.[0];
  return {
    row,
    scenes: map && row.maptable ? scenesInOrder(map, row.maptable.id).map(({ scene: s }) => ({ id: s.id, name: s.name, mapType: s.mapType, tokens: s.tokens?.length ?? 0, src: s.mapId ? map.assets?.find(a => a.id === s.mapId)?.src ?? null : null })) : [],
    party: seen.filter(e => e.kind === "character" && (e.character?.role === "pc" || e.character?.role === "companion"))
      .sort((a, b) => (a.character?.role === "pc" ? 0 : 1) - (b.character?.role === "pc" ? 0 : 1) || a.title.localeCompare(b.title))
      .map(e => ({ id: e.id, title: e.title, role: e.character!.role, group: e.character!.group, picture: e.picture ?? null })),
    recent: [...own].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12).map(e => ({ id: e.id, title: e.title, kind: e.kind, updatedAt: e.updatedAt, parent: titleOf(e.parentId) })),
    initiative: map && row.maptable ? lastEncounter(map, row.maptable.id) : null,
    tables: extras.tables?.tables ?? [],
    library: extras.tables?.library ?? { schemaVersion: 1 as const, tables: [] },
    quests, codex,
    lastSession: session ? { id: session.id, title: session.title, updatedAt: session.updatedAt, excerpt: excerpt(session.body) } : null,
    gameDate: calendar ? { name: calendar.name, date: formatDate(calendar, calendar.current) } : null,
    // Notes keep the dashboard in the Encyclopedia campaign; a Maptable-only campaign (or one whose notes have none saved yet) uses the one in the home file.
    dashboard: campaign?.dashboard ?? (row.maptable ? extras.dashboards?.[`m:${row.maptable.id}`] ?? null : null),
    look: campaign?.look ?? null,
    front: player?.frontPage ?? null,
    frontConfig: campaign ? campaign.frontPage ?? defaultFrontPage(campaign.calendars ?? []) : null,
    // How the AI writes (the GM's own styles), for the Style menu under The story so far.
    writing: campaign?.aiWriting ?? null,
    calendars: (campaign?.calendars ?? []).map(c => ({ id: c.id, name: c.name, shared: c.visibility === "players" })),
    playerPages: (player?.entries ?? []).map(e => ({ id: e.id, title: e.title })),
  };
}
export type CampaignHub = ReturnType<typeof hubOf>;

/** The hub with everything its dashboard needs, including saved Maptable-only dashboards and the campaign's starred tables. */
export async function loadHub(s: Session, key: string) {
  const both = await readBoth(s), row = rowByKey(summaryOf(both).rows, key);
  if (!row) throw new Error("Campaign not found");
  const eid = row.encyclopedia?.id ?? null;
  const [home, tables] = await Promise.all([
    row.maptable ? readHome(s.bucket, s.owner).then(h => h.layout.campaignDashboards).catch(() => undefined) : undefined,
    starredTables(s, t => inCampaign(t, eid)).catch(() => undefined),
  ]);
  return hubOf(both, key, { dashboards: home, tables });
}

/**
 * Saves the GM's dashboard layout (and its threads, notes and links) and returns the updated hub.
 * A campaign with Encyclopedia notes keeps it on that campaign; a Maptable-only campaign keeps it in the account's home file.
 */
export async function saveDashboard(s: Session, key: string, input: unknown) {
  const both = await readBoth(s);
  const row = rowByKey(summaryOf(both).rows, key);
  if (!row) throw new Error("Campaign not found");
  const parsed = dashboardSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "That dashboard could not be saved.");
  if (row.encyclopedia) await saveBook(s, both.book.revision, { ...both.book.data, campaigns: both.book.data.campaigns.map(c => c.id === row.encyclopedia!.id ? { ...c, dashboard: parsed.data } : c) });
  else if (row.maptable) await changeHome(s.bucket, s.owner, l => applyHomeAction(l, { action: "campaignDashboard", key: `m:${row.maptable!.id}`, dashboard: parsed.data }));
  else throw new Error("Campaign not found");
  return loadHub(s, key);
}

/** Saves the front page of an Encyclopedia campaign and returns the updated hub. */
export async function saveFrontPage(s: Session, key: string, input: unknown) {
  const both = await readBoth(s);
  const row = rowByKey(summaryOf(both).rows, key);
  if (!row?.encyclopedia) throw new Error("Start a Wiki for this campaign to give it a front page.");
  const parsed = frontPageSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "That front page could not be saved.");
  const frontPage = parsed.data;
  await backupOnce(s, both);
  await saveBook(s, both.book.revision, { ...both.book.data, campaigns: both.book.data.campaigns.map(c => c.id === row.encyclopedia!.id ? { ...c, frontPage } : c) });
  return loadHub(s, key);
}
