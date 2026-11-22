/*
 * One campaign as a backup file, a backup imported as a new campaign, and a campaign deleted. Pure: workspaces in,
 * workspaces out. lib/campaign-backup-server.ts does the reading and writing; components/campaign-backup.tsx builds
 * and reads the ZIP in the browser.
 *
 * What a campaign is. Its Maptable campaign folder (the folders and scenes inside it, its saved tokens and token
 * folders, the pictures it uses or owns) and its Encyclopedia campaign (with its world and the world's shared lore,
 * as campaignExport gives it), the random tables used only in it, its member groups (never the members, invite
 * links or bans) and its forum, AI chats and session transcripts (kept as files beside the workspaces). The
 * account's conditions and effect presets go along so the scenes look the same in another account.
 *
 * Never in a backup: anything that grants access. Player and agent links, Maptable agent keys, bridge keys, AI
 * connections, Discord webhooks (Maptable campaign settings) and AI API keys (those are only ever on the device).
 *
 * Import always makes a new campaign beside the others: every id the campaign owns gets a new one, and every
 * reference to it inside the backup follows (ids are UUIDs, so a plain search and replace is exact). Picture ids
 * are kept: a picture is stored once per account under its id, so a picture already there is not uploaded again.
 * When the backup's world is still in the account the campaign joins it and the world's lore is left as it is.
 */
import { initialWorkspace, newScene, uid, workspaceSchema as mapSchema, type Workspace as MapWorkspace } from "./model.ts";
import { campaignExport, workspaceSchema as bookSchema, type Entry, type Workspace as BookWorkspace } from "./encyclopedia/world-model.ts";
import type { RandomTable, TableLibrary } from "./encyclopedia/tables.ts";
import type { Dashboard } from "./encyclopedia/dashboard.ts";

export const BACKUP_FORMAT = "rpg-tools-campaign";
export const BACKUP_VERSION = 1;
/** Where the backup's own data sits in the ZIP; files and pictures sit beside it. */
export const BACKUP_JSON = "campaign.json";
export const FILES_DIR = "files/";
export const IMAGES_DIR = "images/";

/** Which store a picture lives in: Maptable's pictures or the Encyclopedia's. */
export type ImageTool = "maptable" | "encyclopedia";
export type ImageRef = { tool: ImageTool; id: string };
const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
export const isImageId = (v: unknown): v is string => typeof v === "string" && new RegExp(`^${UUID}$`).test(v);

/** The Maptable part: the same lists as a Maptable workspace, holding only this campaign's things. */
export type MapPart = Pick<MapWorkspace, "collections" | "scenes" | "assets" | "assetCampaigns" | "tokenLibrary" | "libraryCampaigns" | "conditions" | "effectPresets"> & {
  campaignId: string;
  tokenFolders: NonNullable<MapWorkspace["tokenFolders"]>;
  tokenFolderLocations: NonNullable<MapWorkspace["tokenFolderLocations"]>;
};
export type MemberPart = { groups: unknown[]; pages?: Record<string, unknown> };
export type CampaignBackup = {
  format: typeof BACKUP_FORMAT; version: typeof BACKUP_VERSION; exportedAt: string; name: string;
  maptable: MapPart | null;
  /** campaignExport of the Encyclopedia campaign: one world, one campaign, the pages it can see. */
  encyclopedia: { campaignId: string; workspace: BookWorkspace } | null;
  /** Random tables used only in listed campaigns, this one among them. Tables used in every campaign stay with the account. */
  tables: RandomTable[];
  /** The member groups and their permissions, and who may edit which page. Never members, links or bans. */
  members: MemberPart | null;
  /** A Maptable-only campaign's dashboard (one with Encyclopedia notes keeps it on the campaign). */
  dashboard: Dashboard | null;
};

/* ---- Maptable ---- */

/** The campaign and the folders inside it, at any depth. A campaign nested inside it is its own campaign, and not part of it. */
function subtree(w: Pick<MapWorkspace, "collections">, campaignId: string) {
  const ids = new Set([campaignId]);
  for (let grew = true; grew;) { grew = false; for (const c of w.collections) if (c.parentId && c.kind !== "campaign" && ids.has(c.parentId) && !ids.has(c.id)) { ids.add(c.id); grew = true; } }
  return ids;
}
const pick = <T,>(record: Record<string, T> | undefined, keys: Set<string>) => Object.fromEntries(Object.entries(record ?? {}).filter(([k]) => keys.has(k)));
/** Pictures (asset ids) these scenes, tokens and conditions show. */
function usedAssets(scenes: MapWorkspace["scenes"], tokens: MapWorkspace["tokenLibrary"], conditions: MapWorkspace["conditions"]) {
  const used = new Set<string>();
  const add = (id: string | null | undefined) => { if (id) used.add(id); };
  for (const s of scenes) {
    add(s.mapId);
    for (const t of s.tokens) { add(t.assetId); add(t.borderAssetId); }
    for (const shape of s.drawing?.shapes ?? []) add(shape.stamp);
  }
  for (const t of tokens) { add(t.assetId); add(t.borderAssetId); }
  for (const c of conditions) add(c.assetId);
  return used;
}

export function mapPart(w: MapWorkspace, campaignId: string): MapPart | null {
  if (!w.collections.some(c => c.id === campaignId && c.kind === "campaign")) return null;
  const ids = subtree(w, campaignId);
  const scenes = w.scenes.filter(s => s.containerId !== null && ids.has(s.containerId));
  const tokenLibrary = w.tokenLibrary.filter(t => w.libraryCampaigns[t.id] === campaignId);
  const used = usedAssets(scenes, tokenLibrary, w.conditions);
  const assets = w.assets.filter(a => used.has(a.id) || w.assetCampaigns[a.id] === campaignId);
  const assetIds = new Set(assets.map(a => a.id)), tokenIds = new Set(tokenLibrary.map(t => t.id));
  return {
    campaignId,
    collections: w.collections.filter(c => ids.has(c.id)).map(c => c.id === campaignId ? { ...c, parentId: null } : c),
    scenes, assets,
    // A picture another campaign owns but this one uses goes along unsorted.
    assetCampaigns: Object.fromEntries(Object.entries(pick(w.assetCampaigns, assetIds)).map(([id, c]) => [id, c === campaignId ? c : null])),
    tokenLibrary, libraryCampaigns: pick(w.libraryCampaigns, tokenIds),
    tokenFolders: (w.tokenFolders ?? []).filter(f => f.campaignId === campaignId),
    tokenFolderLocations: pick(w.tokenFolderLocations, tokenIds),
    conditions: w.conditions, effectPresets: w.effectPresets,
  };
}

/** The Maptable workspace without the campaign. Campaigns nested inside it move up a level; pictures still used elsewhere stay. */
export function removeMapCampaign(w: MapWorkspace, campaignId: string): MapWorkspace {
  const campaign = w.collections.find(c => c.id === campaignId && c.kind === "campaign");
  if (!campaign) return w;
  const ids = subtree(w, campaignId);
  const goneTokens = new Set(w.tokenLibrary.filter(t => w.libraryCampaigns[t.id] === campaignId).map(t => t.id));
  const goneFolders = new Set((w.tokenFolders ?? []).filter(f => f.campaignId === campaignId).map(f => f.id));
  let scenes = w.scenes.filter(s => !(s.containerId !== null && ids.has(s.containerId)));
  const tokenLibrary = w.tokenLibrary.filter(t => !goneTokens.has(t.id));
  const used = usedAssets(scenes, tokenLibrary, w.conditions);
  const goneAssets = new Set(w.assets.filter(a => w.assetCampaigns[a.id] === campaignId && !used.has(a.id)).map(a => a.id));
  if (!scenes.length) scenes = [newScene()];
  const without = <T,>(record: Record<string, T> | undefined, gone: Set<string>) => Object.fromEntries(Object.entries(record ?? {}).filter(([k]) => !gone.has(k)));
  return mapSchema.parse({
    ...w,
    collections: w.collections.filter(c => !ids.has(c.id)).map(c => c.parentId && ids.has(c.parentId) ? { ...c, parentId: campaign.parentId } : c),
    scenes, activeId: scenes.some(s => s.id === w.activeId) ? w.activeId : scenes[0].id,
    tokenLibrary,
    libraryCampaigns: without(w.libraryCampaigns, goneTokens),
    libraryLocations: without(w.libraryLocations, goneTokens),
    tokenFolders: (w.tokenFolders ?? []).filter(f => !goneFolders.has(f.id)),
    tokenFolderLocations: Object.fromEntries(Object.entries(without(w.tokenFolderLocations, goneTokens)).map(([k, v]) => [k, v && goneFolders.has(v) ? null : v])),
    assets: w.assets.filter(a => !goneAssets.has(a.id)),
    assetCampaigns: Object.fromEntries(Object.entries(without(w.assetCampaigns, goneAssets)).map(([k, v]) => [k, v === campaignId ? null : v])),
    assetLocations: without(w.assetLocations, goneAssets),
  });
}

/* ---- Encyclopedia ---- */

/** Takes out what a shared page keeps for one campaign: its stats, codex finds and weather links. */
function forgetCampaign(e: Entry, campaignId: string): Entry {
  let next = e;
  if (e.character && campaignId in e.character.statsByCampaign) {
    const { [campaignId]: _gone, ...rest } = e.character.statsByCampaign;
    next = { ...next, character: { ...e.character, statsByCampaign: rest } };
  }
  if (e.codex && campaignId in e.codex.found) {
    const { [campaignId]: _gone, ...rest } = e.codex.found;
    next = { ...next, codex: { ...e.codex, found: rest } };
  }
  if (e.mapData?.pins.some(p => p.weatherLinks?.some(l => l.campaignId === campaignId)))
    next = { ...next, mapData: { ...e.mapData, pins: e.mapData.pins.map(p => p.weatherLinks?.some(l => l.campaignId === campaignId) ? { ...p, weatherLinks: p.weatherLinks.filter(l => l.campaignId !== campaignId) } : p) } };
  return next;
}

/** The Encyclopedia workspace without the campaign and its pages. The world and its lore stay. */
export function removeBookCampaign(s: BookWorkspace, campaignId: string, maptableId: string | null = null): BookWorkspace {
  if (!s.campaigns.some(c => c.id === campaignId)) return s;
  return bookSchema.parse({
    ...s,
    campaigns: s.campaigns.filter(c => c.id !== campaignId).map(c => {
      // Another campaign that sent its rolls to the deleted Maptable campaign's Discord channel stops sending them.
      if (!maptableId || c.discord?.maptableCampaignId !== maptableId) return c;
      const { discord: _gone, ...rest } = c;
      return rest;
    }),
    entries: s.entries.filter(e => e.campaignId !== campaignId).map(e => forgetCampaign(e, campaignId)),
  });
}

/** The tables without the campaign: a table used only in it goes, one also used elsewhere stays there. */
export function removeTablesCampaign(library: TableLibrary, campaignId: string): TableLibrary {
  if (!library.tables.some(t => t.campaignIds?.includes(campaignId))) return library;
  return { ...library, tables: library.tables.flatMap(t => {
    if (!t.campaignIds?.includes(campaignId)) return [t];
    const rest = t.campaignIds.filter(id => id !== campaignId);
    return rest.length ? [{ ...t, campaignIds: rest }] : [];
  }) };
}

/* ---- The backup ---- */

export function buildBackup(input: {
  name: string; now: string;
  map: MapWorkspace | null; maptableId: string | null;
  book: BookWorkspace; encyclopediaId: string | null;
  tables: TableLibrary | null; members: MemberPart | null; dashboard: Dashboard | null;
}): CampaignBackup {
  const maptable = input.map && input.maptableId ? mapPart(input.map, input.maptableId) : null;
  const encyclopedia = input.encyclopediaId && input.book.campaigns.some(c => c.id === input.encyclopediaId)
    ? { campaignId: input.encyclopediaId, workspace: campaignExport(input.book, input.encyclopediaId) } : null;
  if (!maptable && !encyclopedia) throw new Error("That campaign no longer exists. Reload the page.");
  return {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: input.now, name: input.name,
    maptable, encyclopedia,
    tables: encyclopedia ? (input.tables?.tables ?? []).filter(t => t.campaignIds?.includes(encyclopedia.campaignId)) : [],
    members: encyclopedia ? input.members : null,
    dashboard: !encyclopedia ? input.dashboard : null,
  };
}

/** The pictures a backup (or one of its files) shows, by the store they live in. */
export function imageRefs(value: unknown): ImageRef[] {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const out = new Map<string, ImageRef>();
  const add = (tool: ImageTool, id: string) => { const lower = id.toLowerCase(); out.set(`${tool}:${lower}`, { tool, id: lower }); };
  for (const m of text.matchAll(new RegExp(`/api/assets\\?id=(${UUID})`, "g"))) add("maptable", m[1]);
  for (const m of text.matchAll(new RegExp(`/api/encyclopedia/map-images\\?id=(${UUID})`, "g"))) add("encyclopedia", m[1]);
  for (const m of text.matchAll(new RegExp(`\\\\?"(?:imageId|previewImageId)\\\\?":\\s*\\\\?"(${UUID})`, "g"))) add("encyclopedia", m[1]);
  return [...out.values()];
}

/** Whether this is a campaign backup this version can read, with a reason when it isn't. */
export function checkBackup(value: unknown): { ok: true; backup: CampaignBackup } | { ok: false; error: string } {
  const v = value as Partial<CampaignBackup> | null;
  if (!v || typeof v !== "object" || v.format !== BACKUP_FORMAT) return { ok: false, error: "This isn't an RPG Tools campaign backup. Choose the ZIP made by Download backup." };
  if (v.version !== BACKUP_VERSION) return { ok: false, error: "This backup was made by a newer version of RPG Tools. Reload the page and try again." };
  if (typeof v.name !== "string" || !Array.isArray(v.tables ?? []) || (v.maptable === undefined && v.encyclopedia === undefined)) return { ok: false, error: "This campaign backup is damaged." };
  if (!v.maptable && !v.encyclopedia) return { ok: false, error: "This campaign backup has no maps or notes in it." };
  if (v.maptable && (typeof v.maptable.campaignId !== "string" || !Array.isArray(v.maptable.collections) || !Array.isArray(v.maptable.scenes))) return { ok: false, error: "The maps in this backup are damaged." };
  if (v.encyclopedia && (typeof v.encyclopedia.campaignId !== "string" || !v.encyclopedia.workspace || !Array.isArray(v.encyclopedia.workspace.campaigns))) return { ok: false, error: "The notes in this backup are damaged." };
  return { ok: true, backup: { ...v, tables: v.tables ?? [], members: v.members ?? null, dashboard: v.dashboard ?? null } as CampaignBackup };
}

/* ---- New ids ---- */

const uuidAnywhere = new RegExp(UUID, "g");
/**
 * Every id in `ids` replaced by its new one, wherever it appears: as a value, as a key, and inside text (links such
 * as [[id|label]]). Other strings are left exactly as they are.
 */
export function remapIds<T>(value: T, ids: ReadonlyMap<string, string> | Record<string, string>): T {
  const map = ids instanceof Map ? ids : new Map(Object.entries(ids));
  if (!map.size) return value;
  const str = (s: string) => {
    const exact = map.get(s);
    if (exact !== undefined) return exact;
    // Wiki links name pages by id, [[id]] or [[id|label]], whatever the id looks like.
    const linked = s.includes("[[") ? s.replace(/\[\[([^\]|]+)/g, (all, id: string) => map.has(id) ? `[[${map.get(id)}` : all) : s;
    return linked.length >= 36 ? linked.replace(uuidAnywhere, m => map.get(m) ?? m) : linked;
  };
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return str(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [str(k), walk(x)]));
    return v;
  };
  return walk(value) as T;
}

/* ---- Import ---- */

export type ImportTarget = { map: MapWorkspace | null; book: BookWorkspace; tables: TableLibrary };
export type ImportResult = {
  map: MapWorkspace | null; book: BookWorkspace | null; tables: TableLibrary | null;
  /** Old id to new id, for the files that go with the backup (forum, AI chats, transcripts). */
  ids: Record<string, string>;
  name: string; maptableId: string | null; encyclopediaId: string | null;
  members: MemberPart | null; dashboard: Dashboard | null;
};

/** A name not used by another campaign: the one given, or it with “(imported)” (or the word given). */
export function freeName(name: string, taken: Set<string>, word = "imported") {
  const base = name.trim().slice(0, 120) || "Imported campaign";
  if (!taken.has(base.toLocaleLowerCase())) return base;
  for (let n = 1; n < 100; n++) {
    const next = `${base.slice(0, 100)} (${word}${n > 1 ? ` ${n}` : ""})`;
    if (!taken.has(next.toLocaleLowerCase())) return next;
  }
  return `${base.slice(0, 100)} (${word})`;
}

/** The names of the campaigns already in an account, lowercased. */
export function takenNames(target: Pick<ImportTarget, "map" | "book">) {
  return new Set([...(target.map?.collections ?? []).filter(c => c.kind === "campaign").map(c => c.name), ...target.book.campaigns.map(c => c.name)].map(n => n.toLocaleLowerCase()));
}

/**
 * How a backup joins the account. A duplicate (see duplicateCampaign in campaign-backup-server.ts) is a backup
 * imported straight back: it names the copy, may give it a world of its own, and sits in the original's folder.
 */
export type ImportOptions = {
  /** The new campaign's name; another campaign's name gets “(copy)” after it. Left out: the backup's, or it with “(imported)”. */
  name?: string;
  /** Copy the world and its shared lore too, even when the backup's world is still here. */
  copyWorld?: boolean;
  /** The Campaigns page folder to put it in. Left out: the top level. */
  folderId?: string | null;
};

export function planImport(backup: CampaignBackup, target: ImportTarget, newId: () => string = uid, options: ImportOptions = {}): ImportResult {
  const ids = new Map<string, string>();
  const fresh = (id: string | undefined | null) => { if (id && !ids.has(id)) ids.set(id, newId()); };
  const m = backup.maptable, e = backup.encyclopedia;

  if (m) {
    for (const c of m.collections) fresh(c.id);
    for (const s of m.scenes) { fresh(s.id); for (const t of s.tokens) fresh(t.id); }
    for (const t of m.tokenLibrary) fresh(t.id);
    for (const f of m.tokenFolders) fresh(f.id);
  }
  let keepWorld = false;
  if (e) {
    const world = e.workspace.worlds[0];
    keepWorld = !options.copyWorld && !!world && target.book.worlds.some(w => w.id === world.id && !w.isTemplate);
    for (const c of e.workspace.campaigns) fresh(c.id);
    if (!keepWorld) for (const w of e.workspace.worlds) fresh(w.id);
    for (const entry of e.workspace.entries) if (!keepWorld || entry.campaignId !== null) fresh(entry.id);
    for (const t of backup.tables) fresh(t.id);
  }
  const b = remapIds(backup, ids);
  const maptableId = b.maptable ? b.maptable.campaignId : null, encyclopediaId = b.encyclopedia ? b.encyclopedia.campaignId : null;
  const name = options.name !== undefined ? freeName(options.name, takenNames(target), "copy") : freeName(b.name, takenNames(target));
  // A web address is unique in the account: the new campaign only keeps the backup's when nothing here uses it.
  const slugs = new Set([...(target.map?.collections ?? []).map(c => c.slug), ...target.book.campaigns.map(c => c.slug)].filter(Boolean));
  const freeSlug = <T extends { slug?: string },>(c: T): T => { if (!c.slug || !slugs.has(c.slug)) return c; const { slug: _taken, ...rest } = c; return rest as T; };
  const folderId = options.folderId && (target.map?.collections ?? []).some(c => c.id === options.folderId && c.kind === "folder") ? options.folderId : null;

  let map: MapWorkspace | null = null;
  if (b.maptable) {
    const p = b.maptable, base = target.map ?? { ...initialWorkspace(), scenes: [] as MapWorkspace["scenes"] };
    const has = (list: { id: string }[]) => { const known = new Set(list.map(x => x.id)); return (x: { id: string }) => !known.has(x.id); };
    const newAssets = p.assets.filter(has(base.assets));
    const scenes = [...base.scenes, ...p.scenes];
    if (!scenes.length) scenes.push(newScene());
    map = mapSchema.parse({
      ...base,
      scenes, activeId: scenes.some(s => s.id === base.activeId) ? base.activeId : scenes[0].id,
      collections: [...base.collections, ...p.collections.map(c => c.id === maptableId ? freeSlug({ ...c, name, parentId: folderId }) : c)],
      assets: [...base.assets, ...newAssets],
      assetCampaigns: { ...base.assetCampaigns, ...Object.fromEntries(newAssets.map(a => [a.id, p.assetCampaigns[a.id] === maptableId ? maptableId : null])) },
      tokenLibrary: [...base.tokenLibrary, ...p.tokenLibrary],
      libraryCampaigns: { ...base.libraryCampaigns, ...Object.fromEntries(p.tokenLibrary.map(t => [t.id, maptableId])) },
      tokenFolders: [...(base.tokenFolders ?? []), ...p.tokenFolders.map(f => ({ ...f, campaignId: maptableId }))],
      tokenFolderLocations: { ...(base.tokenFolderLocations ?? {}), ...p.tokenFolderLocations },
      conditions: [...base.conditions, ...p.conditions.filter(has(base.conditions))],
      effectPresets: [...base.effectPresets, ...p.effectPresets.filter(has(base.effectPresets))],
    });
  }

  let book: BookWorkspace | null = null, tables: TableLibrary | null = null;
  if (b.encyclopedia) {
    const ws = b.encyclopedia.workspace, campaign = ws.campaigns.find(c => c.id === encyclopediaId);
    if (!campaign) throw new Error("The notes in this backup are damaged.");
    const { folderId: _folder, maptableCampaignId: _paired, ...rest } = campaign;
    const copy = freeSlug({ ...rest, name, ...(maptableId ? { maptableCampaignId: maptableId } : {}), ...(!maptableId && folderId ? { folderId } : {}) });
    // Rolls sent to a Maptable campaign's Discord channel only go on when that campaign came along.
    if (copy.discord && copy.discord.maptableCampaignId !== maptableId) delete copy.discord;
    let entries = target.book.entries;
    if (keepWorld) {
      // The world's pages are already here: keep what they held for this campaign (stats, codex finds, weather links).
      const shared = new Map(ws.entries.filter(x => x.campaignId === null).map(x => [x.id, x]));
      entries = entries.map(x => { const from = shared.get(x.id); return from ? withCampaignParts(x, from, encyclopediaId!) : x; });
    }
    book = bookSchema.parse({
      ...target.book,
      worlds: keepWorld ? target.book.worlds : [...target.book.worlds, ...ws.worlds.map(w => ({ ...w, archived: false, isTemplate: false }))],
      campaigns: [...target.book.campaigns, copy],
      entries: [...entries, ...ws.entries.filter(x => !keepWorld || x.campaignId !== null)],
    });
    if (b.tables.length) tables = { ...target.tables, tables: [...target.tables.tables, ...b.tables.map(t => ({ ...t, campaignIds: [encyclopediaId!] }))] };
  }
  return { map, book, tables, ids: Object.fromEntries(ids), name, maptableId, encyclopediaId, members: b.members, dashboard: b.dashboard };
}

/** A shared page here, given what the backup's copy of it held for this campaign. */
function withCampaignParts(here: Entry, from: Entry, campaignId: string): Entry {
  let next = here;
  const stats = from.character?.statsByCampaign[campaignId];
  if (stats && next.character) next = { ...next, character: { ...next.character, statsByCampaign: { ...next.character.statsByCampaign, [campaignId]: stats } } };
  const found = from.codex?.found[campaignId];
  if (found && next.codex) next = { ...next, codex: { ...next.codex, found: { ...next.codex.found, [campaignId]: found } } };
  if (from.mapData && next.mapData) {
    const links = new Map(from.mapData.pins.map(p => [p.id, (p.weatherLinks ?? []).filter(l => l.campaignId === campaignId)]));
    if ([...links.values()].some(l => l.length)) next = { ...next, mapData: { ...next.mapData, pins: next.mapData.pins.map(p => links.get(p.id)?.length ? { ...p, weatherLinks: [...(p.weatherLinks ?? []), ...links.get(p.id)!] } : p) } };
  }
  return next;
}

/* ---- Files kept beside the workspaces ---- */

/**
 * The files a backup carries, by their path in it. Forum: forum/forum.json, forum/topics/<id>.json, a long topic's
 * pages forum/topics/<id>/<page>.json and a big forum's index files forum/index/<key>.json (lib/forum/pages.ts). AI chats:
 * ai-chats/index.json, older.json, <id>.json and <id>.part-<n>.json. A session page's transcript: transcripts/<page id>.txt.
 * The campaign's themes (lib/campaign-theme): theme.json.
 */
export const FILE_PATH = /^(theme\.json|forum\/forum\.json|forum\/topics\/[A-Za-z0-9_-]{1,100}(\/[A-Za-z0-9_-]{1,100})?\.json|forum\/index\/[A-Za-z0-9_-]{1,100}\.json|ai-chats\/(index|older)\.json|ai-chats\/[A-Za-z0-9-]{8,64}(\.part-[1-9][0-9]{0,4})?\.json|transcripts\/[A-Za-z0-9_-]{1,120}\.txt)$/;
export const isBackupFile = (path: unknown): path is string => typeof path === "string" && FILE_PATH.test(path);
/** A file's path and text in the imported campaign: ids follow the new ones. The forum file goes last, after its topics. */
export function remapFile(path: string, text: string, ids: Record<string, string>) {
  const page = /^transcripts\/(.+)\.txt$/.exec(path)?.[1];
  return { path: page !== undefined ? `transcripts/${ids[page] ?? page}.txt` : remapIds(path, ids), text: path.endsWith(".json") ? JSON.stringify(remapIds(JSON.parse(text), ids)) : text };
}
/**
 * The forum file with its boards, categories, settings, tags, emoji and card design, but no topics, posts or
 * anything about the people who posted: what a duplicated campaign starts with when its posts stay behind.
 */
export function forumSetupOnly(text: string) {
  const f = JSON.parse(text) as Record<string, unknown> & { uploads?: { kind?: string }[] };
  // A big forum's file lists index files instead of topics: the copy has none, so it's an ordinary forum file again.
  const { profiles: _people, index: _index, ...rest } = f;
  return JSON.stringify({ ...rest, schemaVersion: 1, topics: [], counts: {}, characters: [], recent: [], reports: [], ...(Array.isArray(f.uploads) ? { uploads: f.uploads.filter(u => u?.kind === "emoji") } : {}) });
}
/** A long topic's page files, from its topic file (they're read after it, as an AI chat's parts are). */
export function topicPageFiles(path: string, text: string): string[] {
  const topic = /^forum\/topics\/([A-Za-z0-9_-]{1,100})\.json$/.exec(path)?.[1];
  if (!topic) return [];
  let pages: unknown;
  try { pages = (JSON.parse(text) as { pages?: unknown }).pages; } catch { return []; }
  return Array.isArray(pages) ? pages.map((g: { key?: unknown } | null) => `forum/topics/${topic}/${String(g?.key)}.json`).filter(p => FILE_PATH.test(p)) : [];
}
export const fileOrder = (a: { path: string }, b: { path: string }) => Number(a.path === "forum/forum.json") - Number(b.path === "forum/forum.json");

/** A picture's type from its first bytes: PNG, JPEG or WebP, or null. */
export function sniffImage(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}
export const imageExtension = (type: string) => type === "image/png" ? "png" : type === "image/jpeg" ? "jpg" : "webp";
