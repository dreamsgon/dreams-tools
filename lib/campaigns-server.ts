import type { Bucket } from "./storage-types";
import { loadWorkspace, saveWorkspace } from "./workspace-storage.ts";
import { canMoveCollection, initialWorkspace, uid, type Workspace as MapWorkspace } from "./model.ts";
import { EncyclopediaStore, encyclopediaPrefix } from "./encyclopedia/store.ts";
import { newId, playerCampaign, type Workspace as BookWorkspace } from "./encyclopedia/world-model.ts";
import { defaultFrontPage, frontPageSchema } from "./encyclopedia/front-page.ts";
import { scenesInOrder } from "./scene-order.ts";
import { dashboardSchema, excerpt } from "./encyclopedia/dashboard.ts";
import { questsIn, questProgress, nextStep } from "./encyclopedia/quests.ts";
import { codexIn } from "./encyclopedia/codex.ts";
import { formatDate } from "./encyclopedia/calendar-model.ts";
import { applyPairs, campaignFolders, campaignSummary, cleanName } from "./campaign-links.ts";

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
  const body = JSON.stringify({ createdAt: new Date().toISOString(), note: "Maptable and Encyclopedia data before the Campaigns page changed anything.", maptable: both.map?.workspace ?? null, encyclopedia: both.book.data });
  await s.bucket.put(key, body, { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json" } });
}

const busy = () => new Error("Something else saved at the same moment. Nothing was changed here; reload and try again.");

async function saveMap(s: Session, map: Awaited<ReturnType<typeof loadWorkspace>>, next: MapWorkspace) {
  if (!(await saveWorkspace(s.bucket, s.prefix, next, map?.revision ?? null))) throw busy();
}
async function saveBook(s: Session, revision: number, next: BookWorkspace) {
  if ((await s.book.save(s.owner, next, revision)) === null) throw busy();
}

export function summaryOf(both: { map: { workspace: MapWorkspace } | null; book: { data: BookWorkspace } }) {
  return campaignSummary(both.map?.workspace ?? null, both.book.data);
}


export function backupFile(both: Awaited<ReturnType<typeof readBoth>>) {
  return JSON.stringify({ createdAt: new Date().toISOString(), maptable: both.map?.workspace ?? null, encyclopedia: both.book.data });
}

export type CampaignAction =
  | { action: "pair"; pairs: { encyclopediaId: string; maptableId: string | null }[] }
  | { action: "rename"; encyclopediaId?: string; maptableId?: string; name: string; description?: string }
  | { action: "create"; name: string; description?: string; maptable: boolean; encyclopedia: boolean; worldId?: string; newWorld?: string }
  | { action: "newFolder"; name: string; parentId?: string | null }
  | { action: "renameFolder"; folderId: string; name: string }
  | { action: "removeFolder"; folderId: string }
  | { action: "moveCampaign"; key: string; folderId: string | null }
  | { action: "moveFolder"; folderId: string; parentId: string | null }
  | { action: "complete"; encyclopediaId?: string; maptableId?: string; worldId?: string; newWorld?: string };

const str = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 120 ? v : undefined;
const describe = (v: unknown) => typeof v === "string" ? v.trim().slice(0, 1000) : "";

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
function addBookCampaign(book: BookWorkspace, body: { worldId?: unknown; newWorld?: unknown }, name: string, description: string, maptableId?: string) {
  let worlds = book.worlds, worldId = str(body.worldId);
  if (!worldId || !worlds.some(w => w.id === worldId && !w.isTemplate)) {
    if (typeof body.newWorld !== "string" || !body.newWorld.trim()) throw new Error("Choose a world for the Encyclopedia notes.");
    worldId = newId();
    worlds = [...worlds, { id: worldId, name: cleanName(body.newWorld), description: "", archived: false }];
  }
  const id = newId();
  return { id, next: { ...book, worlds, campaigns: [...book.campaigns, { id, worldId, name, description, github: { repository: "", branch: "main" }, ...(maptableId ? { maptableCampaignId: maptableId } : {}) }] } };
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
      if (!both.book.data.campaigns.some(c => c.id === eid)) throw new Error("That Encyclopedia campaign no longer exists. Reload the page.");
      const description = body.description === undefined ? undefined : describe(body.description);
      await saveBook(s, both.book.revision, { ...both.book.data, campaigns: both.book.data.campaigns.map(c => c.id === eid ? { ...c, name, ...(description === undefined ? {} : { description }) } : c) });
    }
  } else if (body.action === "create") {
    const name = cleanName(body.name), description = describe(body.description);
    if (!body.maptable && !body.encyclopedia) throw new Error("Choose at least one tool.");
    let mapId: string | undefined;
    // Encyclopedia problems (such as no world chosen) are found before Maptable is changed.
    const book = body.encyclopedia ? addBookCampaign(both.book.data, body, name, description) : null;
    if (body.maptable) { const made = addMapCampaign(mapNow, name); mapId = made.id; await saveMap(s, both.map, made.next); }
    if (book) await saveBook(s, both.book.revision, mapId ? applyPairs(book.next, { collections: [...mapNow.collections, { id: mapId, name, kind: "campaign", parentId: null }] }, [{ encyclopediaId: book.id, maptableId: mapId }]) : book.next);
  } else if (body.action === "complete") {
    const eid = str(body.encyclopediaId), mid = str(body.maptableId);
    if (eid) {
      const campaign = both.book.data.campaigns.find(c => c.id === eid);
      if (!campaign) throw new Error("That Encyclopedia campaign no longer exists. Reload the page.");
      if (campaign.maptableCampaignId && mapNow.collections.some(c => c.id === campaign.maptableCampaignId)) throw new Error("This campaign already has a Maptable campaign.");
      const made = addMapCampaign(mapNow, cleanName(campaign.name));
      await saveMap(s, both.map, made.next);
      await saveBook(s, both.book.revision, applyPairs(both.book.data, made.next, [{ encyclopediaId: eid, maptableId: made.id }]));
    } else if (mid) {
      const campaign = mapNow.collections.find(c => c.id === mid && c.kind === "campaign");
      if (!campaign) throw new Error("That Maptable campaign no longer exists. Reload the page.");
      if (both.book.data.campaigns.some(c => c.maptableCampaignId === mid)) throw new Error("This campaign already has Encyclopedia notes.");
      await saveBook(s, both.book.revision, addBookCampaign(both.book.data, body, campaign.name, "", mid).next);
    } else throw new Error("Choose a campaign.");
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
    const row = summaryOf(both).rows.find(r => r.key === key);
    if (!row) throw new Error("That campaign no longer exists. Reload the page.");
    if (row.maptable) await saveMap(s, both.map, { ...mapNow, collections: mapNow.collections.map(c => c.id === row.maptable!.id ? { ...c, parentId: folderId } : c) });
    if (row.encyclopedia) await saveBook(s, both.book.revision, { ...both.book.data, campaigns: both.book.data.campaigns.map(c => c.id === row.encyclopedia!.id ? withFolder(c, folderId) : c) });
  } else if (body.action === "moveFolder") {
    const id = folderOf(mapNow, body.folderId), parentId = parentOf(mapNow, body.parentId);
    if (!canMoveCollection(mapNow.collections, id, parentId)) throw new Error("A folder can't go inside itself or one of its own folders.");
    await saveMap(s, both.map, { ...mapNow, collections: mapNow.collections.map(c => c.id === id ? { ...c, parentId } : c) });
  } else throw new Error("Unknown action.");
  return summaryOf(await readBoth(s));
}

/** One campaign for the campaign hub: its dashboard and its front page. */
export function hubOf(both: { map: { workspace: MapWorkspace } | null; book: { data: BookWorkspace } }, key: string) {
  const summary = summaryOf(both), row = summary.rows.find(r => r.key === key);
  if (!row) throw new Error("Campaign not found");
  const map = both.map?.workspace ?? null, book = both.book.data;
  const campaign = row.encyclopedia ? book.campaigns.find(c => c.id === row.encyclopedia!.id) ?? null : null;
  const own = campaign ? book.entries.filter(e => e.campaignId === campaign.id && e.kind !== "folder") : [];
  // Shared world pages count too, as they do inside the campaign in the Encyclopedia.
  const seen = campaign ? book.entries.filter(e => e.worldId === campaign.worldId && (e.campaignId === null || e.campaignId === campaign.id) && e.kind !== "folder") : [];
  const player = campaign ? playerCampaign(book, campaign.id) : null;
  const titleOf = (id: string | null) => id ? book.entries.find(e => e.id === id)?.title ?? "" : "";
  const quests = campaign ? questsIn(book, campaign.worldId, campaign.id)
    .sort((a, b) => (a.quest.rank ?? 1e9) - (b.quest.rank ?? 1e9) || b.entry.updatedAt.localeCompare(a.entry.updatedAt))
    .map(({ entry, quest }) => ({ id: entry.id, title: entry.title, state: quest.state, type: quest.type, ...questProgress(quest), next: nextStep(quest) })) : [];
  const codex = campaign ? codexIn(book.entries, campaign.worldId, campaign.id)
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
    recent: [...own].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5).map(e => ({ id: e.id, title: e.title, kind: e.kind, updatedAt: e.updatedAt, parent: titleOf(e.parentId) })),
    quests, codex,
    lastSession: session ? { id: session.id, title: session.title, updatedAt: session.updatedAt, excerpt: excerpt(session.body) } : null,
    gameDate: calendar ? { name: calendar.name, date: formatDate(calendar, calendar.current) } : null,
    dashboard: campaign?.dashboard ?? null,
    look: campaign?.look ?? null,
    front: player?.frontPage ?? null,
    frontConfig: campaign ? campaign.frontPage ?? defaultFrontPage(campaign.calendars ?? []) : null,
    calendars: (campaign?.calendars ?? []).map(c => ({ id: c.id, name: c.name, shared: c.visibility === "players" })),
    playerPages: (player?.entries ?? []).map(e => ({ id: e.id, title: e.title })),
  };
}
export type CampaignHub = ReturnType<typeof hubOf>;

/** Saves the GM's dashboard layout (and its threads, notes and links) and returns the updated hub. */
export async function saveDashboard(s: Session, key: string, input: unknown) {
  const both = await readBoth(s);
  const row = summaryOf(both).rows.find(r => r.key === key);
  if (!row?.encyclopedia) throw new Error("Start Encyclopedia notes for this campaign to customize its dashboard.");
  const parsed = dashboardSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "That dashboard could not be saved.");
  await saveBook(s, both.book.revision, { ...both.book.data, campaigns: both.book.data.campaigns.map(c => c.id === row.encyclopedia!.id ? { ...c, dashboard: parsed.data } : c) });
  return hubOf(await readBoth(s), key);
}

/** Saves the front page of an Encyclopedia campaign and returns the updated hub. */
export async function saveFrontPage(s: Session, key: string, input: unknown) {
  const both = await readBoth(s);
  const row = summaryOf(both).rows.find(r => r.key === key);
  if (!row?.encyclopedia) throw new Error("Start Encyclopedia notes for this campaign to give it a front page.");
  const parsed = frontPageSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "That front page could not be saved.");
  const frontPage = parsed.data;
  await backupOnce(s, both);
  await saveBook(s, both.book.revision, { ...both.book.data, campaigns: both.book.data.campaigns.map(c => c.id === row.encyclopedia!.id ? { ...c, frontPage } : c) });
  return hubOf(await readBoth(s), key);
}
