import { workspaceSchema, type Workspace } from "./model.ts";

/**
 * A co-GM running one campaign's maps in the GM's Maptable. They get a copy with that campaign's scenes and folders,
 * its saved tokens and the pictures it can use, plus the shared table tools (conditions, effect presets, picture
 * folders). Nothing from the GM's other campaigns is in it. Their saves go back with applyMaptableCoGm: what they
 * changed in the copy is applied, and everything else of the GM's stays exactly as it is.
 *
 * Pictures in the copy load from the GM's storage: their address carries `&member=<ref>`, which the asset routes
 * check against the member list. Pictures a co-GM adds are stored with the GM's (app/api/assets/route.ts).
 */
export class MapCoGmError extends Error {}
const no = (message: string): never => { throw new MapCoGmError(message); };
type Keyed = { id: string };

/** The campaign and the folders inside it, at any depth. A campaign nested inside it is not part of it, nor is anything under that. */
function subtree(w: Workspace, campaignId: string) {
  const ids = new Set([campaignId]);
  for (let grew = true; grew;) { grew = false; for (const c of w.collections) if (c.parentId && c.kind !== "campaign" && ids.has(c.parentId) && !ids.has(c.id)) { ids.add(c.id); grew = true; } }
  return ids;
}
const inCampaign = (campaign: string, value: string | null | undefined) => value === undefined || value === null || value === campaign;

const isForeign = (owner: string | null | undefined, campaign: string) => owner !== undefined && owner !== null && owner !== campaign;

/** Which of the GM's things a co-GM's copy holds. */
function scope(w: Workspace, campaignId: string) {
  const collections = subtree(w, campaignId);
  const scenes = w.scenes.filter(s => s.containerId !== null && collections.has(s.containerId));
  const tokens = w.tokenLibrary.filter(t => inCampaign(campaignId, w.libraryCampaigns[t.id]));
  const used = new Set<string>();
  for (const s of scenes) {
    if (s.mapId) used.add(s.mapId);
    for (const t of s.tokens) { if (t.assetId) used.add(t.assetId); if (t.borderAssetId) used.add(t.borderAssetId); }
    for (const shape of s.drawing?.shapes ?? []) if (shape.stamp) used.add(shape.stamp);
  }
  for (const t of tokens) { if (t.assetId) used.add(t.assetId); if (t.borderAssetId) used.add(t.borderAssetId); }
  for (const c of w.conditions) if (c.assetId) used.add(c.assetId);
  const assets = w.assets.filter(a => used.has(a.id) || inCampaign(campaignId, w.assetCampaigns[a.id]));
  const tokenFolders = (w.tokenFolders ?? []).filter(f => inCampaign(campaignId, f.campaignId));
  // Pictures this campaign uses but the GM gave to another of their campaigns: the co-GM can see them, not change them.
  const locked = new Set(assets.filter(a => isForeign(w.assetCampaigns[a.id], campaignId)).map(a => a.id));
  return { locked, collections, scenes: new Set(scenes.map(s => s.id)), tokens: new Set(tokens.map(t => t.id)), assets: new Set(assets.map(a => a.id)), tokenFolders: new Set(tokenFolders.map(f => f.id)) };
}

const pick = <T,>(record: Record<string, T>, keys: Set<string>) => Object.fromEntries(Object.entries(record).filter(([k]) => keys.has(k)));
/** `/api/assets?id=…` and `/api/s3?key=…` in the GM's copy, and the same with `&member=<ref>` in a co-GM's. */
const withMember = (src: string, ref: string) => /^\/api\/(assets|s3)\?/.test(src) ? `${src}&member=${ref}` : src;
const elsewhere = "Co-GMs can use the pictures in this campaign and add new ones here. That picture is somewhere else.";
/** A co-GM's picture address back in the GM's form. An address unchanged from the GM's own keeps the GM's exact spelling. */
function withoutMember(src: string, ref: string, original?: string) {
  if (/^https:\/\//.test(src)) return src;
  if (original !== undefined && withMember(original, ref) === src) return original;
  const kind = /^\/api\/assets\?/.test(src) ? "assets" : /^\/api\/s3\?/.test(src) ? "s3" : null;
  if (!kind) return no(elsewhere);
  let url: URL;
  try { url = new URL(src, "https://x"); } catch { return no(elsewhere); }
  const param = kind === "assets" ? "id" : "key";
  const value = url.searchParams.getAll(param), member = url.searchParams.getAll("member");
  if (url.pathname !== `/api/${kind}` || src.includes("#") || value.length !== 1 || !value[0] || member.length !== 1 || member[0] !== ref || [...url.searchParams.keys()].length !== 2) return no(elsewhere);
  return `/api/${kind}?${param}=${encodeURIComponent(value[0])}`;
}

/** The copy a co-GM opens. Null when the campaign is gone or has no maps yet. */
/** The pictures a co-GM can see but only the GM can change: the campaign uses them, another of the GM's campaigns owns them. */
export const lockedPictures = (w: Workspace, campaignId: string) => [...scope(w, campaignId).locked];

export function maptableExport(w: Workspace, campaignId: string, ref: string): Workspace | null {
  const campaign = w.collections.find(c => c.id === campaignId && c.kind === "campaign");
  if (!campaign) return null;
  const s = scope(w, campaignId);
  const scenes = w.scenes.filter(x => s.scenes.has(x.id));
  if (!scenes.length) return null;
  const copy: Workspace = {
    ...w,
    scenes,
    activeId: s.scenes.has(w.activeId) ? w.activeId : scenes[0].id,
    collections: w.collections.filter(c => s.collections.has(c.id)).map(c => c.id === campaignId ? { ...c, parentId: null } : c),
    assets: w.assets.filter(a => s.assets.has(a.id)).map(a => ({ ...a, src: withMember(a.src, ref) })),
    // A picture another campaign owns but this one uses shows as unsorted, so the other campaign stays out of it.
    assetCampaigns: Object.fromEntries(Object.entries(pick(w.assetCampaigns, s.assets)).map(([id, c]) => [id, c === campaignId ? c : null])),
    assetLocations: pick(w.assetLocations, s.assets),
    tokenLibrary: w.tokenLibrary.filter(t => s.tokens.has(t.id)),
    libraryCampaigns: pick(w.libraryCampaigns, s.tokens),
    libraryLocations: pick(w.libraryLocations, s.tokens),
    tokenFolders: (w.tokenFolders ?? []).filter(f => s.tokenFolders.has(f.id)),
    tokenFolderLocations: pick(w.tokenFolderLocations ?? {}, s.tokens),
  };
  return workspaceSchema.parse(copy);
}

/**
 * Why a co-GM's copy can't become `after`, or null when it can. The app asks before each change, so a co-GM never
 * gets stuck on a save the server would refuse; the server asks again.
 */
export function maptableCoGmRefusal(before: Workspace, after: Workspace, campaignId: string, ref: string, locked: ReadonlySet<string> = new Set()): string | null {
  const lists: Keyed[][] = [after.scenes, after.assets, after.tokenLibrary, after.conditions, after.effectPresets, after.collections, after.assetFolders, after.conditionFolders, after.effectPresetFolders, after.tokenFolders ?? []];
  if (lists.some(l => new Set(l.map(x => x.id)).size !== l.length)) return "Two things share an id; reload and try again.";
  const was = before.collections.find(c => c.id === campaignId), now = after.collections.find(c => c.id === campaignId);
  if (!now || now.kind !== "campaign" || now.parentId !== null) return "Only the GM can move or delete the campaign itself.";
  if (was && now.name !== was.name) return "Only the GM can rename the campaign.";
  if (after.collections.some(c => c.id !== campaignId && c.kind === "campaign")) return "A co-GM can only work inside the campaign they were invited to.";
  const inside = subtree(after, campaignId);
  if (after.collections.some(c => !inside.has(c.id))) return "Keep new folders inside this campaign.";
  if (after.scenes.some(x => x.containerId === null || !inside.has(x.containerId))) return "Keep maps inside this campaign.";
  for (const a of after.assets) {
    const old = before.assets.find(x => x.id === a.id);
    if (old?.src === a.src) continue;
    try { withoutMember(a.src, ref); } catch (e) { return (e as Error).message; }
  }
  const owned = (c: string | null | undefined) => c === undefined || c === null || c === campaignId;
  if (![...Object.values(after.assetCampaigns), ...Object.values(after.libraryCampaigns), ...(after.tokenFolders ?? []).map(f => f.campaignId)].every(owned)) return "Keep pictures and tokens in this campaign.";
  for (const id of locked) {
    const was = before.assets.find(a => a.id === id), a = after.assets.find(x => x.id === id);
    if (was && (!a || JSON.stringify(a) !== JSON.stringify(was) || (after.assetCampaigns[id] ?? null) !== (before.assetCampaigns[id] ?? null) || (after.assetLocations[id] ?? null) !== (before.assetLocations[id] ?? null)))
      return "That picture belongs to another of the GM's campaigns, so only the GM can change it.";
  }
  // Shared by all the GM's campaigns: added to and edited freely, never deleted.
  const kept = (was: Keyed[], now: Keyed[]) => { const ids = new Set(now.map(x => x.id)); return was.every(x => ids.has(x.id)); };
  const shared = (items: Keyed[], campaigns: Record<string, string | null>) => items.filter(x => (campaigns[x.id] ?? null) === null);
  if (!kept(shared(before.assets, before.assetCampaigns), after.assets) || !kept(shared(before.tokenLibrary, before.libraryCampaigns), after.tokenLibrary)
    || !kept(before.conditions, after.conditions) || !kept(before.effectPresets, after.effectPresets) || !kept(before.assetFolders, after.assetFolders)
    || !kept(before.conditionFolders, after.conditionFolders) || !kept(before.effectPresetFolders, after.effectPresetFolders)
    || !kept((before.tokenFolders ?? []).filter(f => f.campaignId === null), after.tokenFolders ?? []))
    return "Only the GM can delete things shared by all their campaigns.";
  return null;
}

/** Puts one field's in-scope items back into the GM's list: changed ones in place, removed ones gone, new ones at the end. */
function merge<T extends Keyed>(full: T[], inScope: Set<string>, edited: T[], what: string): T[] {
  const mine = new Map(edited.map(x => [x.id, x]));
  for (const x of full) if (!inScope.has(x.id) && mine.has(x.id)) no(`That ${what} belongs to another campaign.`);
  const known = new Set(full.map(x => x.id));
  return [...full.flatMap(x => !inScope.has(x.id) ? [x] : mine.has(x.id) ? [mine.get(x.id)!] : []), ...edited.filter(x => !known.has(x.id))];
}
/** The same for a lookup keyed by item: the co-GM's entries for in-scope and new items, the GM's for the rest. */
function mergeRecord<T>(full: Record<string, T>, inScope: Set<string>, known: Set<string>, edited: Record<string, T>) {
  const kept = Object.entries(full).filter(([k]) => !inScope.has(k));
  return Object.fromEntries([...kept, ...Object.entries(edited).filter(([k]) => inScope.has(k) || !known.has(k))]);
}
/** Things shared by all the GM's campaigns: the co-GM's edits in place, their additions at the end, the rest as the GM has them. */
function mergeShared<T extends Keyed>(full: T[], edited: T[]): T[] {
  const mine = new Map(edited.map(x => [x.id, x])), known = new Set(full.map(x => x.id));
  return [...full.map(x => mine.get(x.id) ?? x), ...edited.filter(x => !known.has(x.id))];
}

/** A co-GM's save, put back into the GM's whole Maptable. Throws a MapCoGmError, with a message for them, if it can't be. */
export function applyMaptableCoGm(full: Workspace, campaignId: string, ref: string, input: unknown): Workspace {
  const incoming = workspaceSchema.safeParse(input);
  if (!incoming.success) no(incoming.error.issues[0]?.message ?? "That change would break the maps.");
  const edited = incoming.data!;
  const before = maptableExport(full, campaignId, ref) ?? no("This campaign's maps are gone.");
  const s = scope(full, campaignId);
  const refused = maptableCoGmRefusal(before, edited, campaignId, ref, s.locked);
  if (refused) no(refused);
  const campaign = full.collections.find(c => c.id === campaignId)!;
  const all = <T extends Keyed>(items: T[]) => new Set(items.map(x => x.id));
  const originals = new Map(full.assets.map(a => [a.id, a.src]));
  // The GM's campaign for a picture stays when it is a different campaign's; otherwise the co-GM's choice, unsorted included.
  const assetCampaigns = mergeRecord(full.assetCampaigns, s.assets, all(full.assets), edited.assetCampaigns);
  for (const id of s.locked) assetCampaigns[id] = full.assetCampaigns[id];
  const next: Workspace = {
    ...full,
    scenes: merge(full.scenes, s.scenes, edited.scenes, "map"),
    collections: merge(full.collections, s.collections, edited.collections.map(c => c.id === campaignId ? { ...c, parentId: campaign.parentId } : c), "folder"),
    assets: merge(full.assets, s.assets, edited.assets.map(a => ({ ...a, src: withoutMember(a.src, ref, originals.get(a.id)) })), "picture"),
    assetCampaigns,
    assetLocations: mergeRecord(full.assetLocations, s.assets, all(full.assets), edited.assetLocations),
    tokenLibrary: merge(full.tokenLibrary, s.tokens, edited.tokenLibrary, "token"),
    libraryCampaigns: mergeRecord(full.libraryCampaigns, s.tokens, all(full.tokenLibrary), edited.libraryCampaigns),
    libraryLocations: mergeRecord(full.libraryLocations, s.tokens, all(full.tokenLibrary), edited.libraryLocations),
    tokenFolders: merge(full.tokenFolders ?? [], s.tokenFolders, edited.tokenFolders ?? [], "token folder"),
    tokenFolderLocations: mergeRecord(full.tokenFolderLocations ?? {}, s.tokens, all(full.tokenLibrary), edited.tokenFolderLocations ?? {}),
    // Shared table tools: the co-GM adds and edits, the GM's own stay.
    conditions: mergeShared(full.conditions, edited.conditions),
    conditionFolders: mergeShared(full.conditionFolders, edited.conditionFolders),
    conditionLocations: mergeRecord(full.conditionLocations, all(full.conditions), all(full.conditions), edited.conditionLocations),
    effectPresets: mergeShared(full.effectPresets, edited.effectPresets),
    effectPresetFolders: mergeShared(full.effectPresetFolders, edited.effectPresetFolders),
    presetLocations: mergeRecord(full.presetLocations, all(full.effectPresets), all(full.effectPresets), edited.presetLocations),
    assetFolders: mergeShared(full.assetFolders, edited.assetFolders),
    // Which map the GM has open stays theirs.
    activeId: full.activeId,
  };
  if (!next.scenes.some(x => x.id === next.activeId)) next.activeId = next.scenes[0]?.id ?? no("Keep at least one map.");
  // A co-GM's new picture or token can't land in a campaign other than this one.
  for (const [id, c] of [...Object.entries(next.assetCampaigns), ...Object.entries(next.libraryCampaigns)]) if (!full.assets.some(a => a.id === id) && !full.tokenLibrary.some(t => t.id === id) && c !== null && c !== campaignId) no("Keep new pictures and tokens in this campaign.");
  const parsed = workspaceSchema.safeParse(next);
  if (!parsed.success) no(parsed.error.issues[0]?.message ?? "That change would break the maps.");
  return parsed.data!;
}
