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

/** The campaign and the folders inside it, at any depth. */
function subtree(w: Workspace, campaignId: string) {
  const ids = new Set([campaignId]);
  for (let grew = true; grew;) { grew = false; for (const c of w.collections) if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) { ids.add(c.id); grew = true; } }
  return ids;
}
const inCampaign = (campaign: string, value: string | null | undefined) => value === undefined || value === null || value === campaign;

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
  return { collections, scenes: new Set(scenes.map(s => s.id)), tokens: new Set(tokens.map(t => t.id)), assets: new Set(assets.map(a => a.id)), tokenFolders: new Set(tokenFolders.map(f => f.id)) };
}

const pick = <T,>(record: Record<string, T>, keys: Set<string>) => Object.fromEntries(Object.entries(record).filter(([k]) => keys.has(k)));
/** `/api/assets?id=…` and `/api/s3?key=…` in the GM's copy, and the same with `&member=<ref>` in a co-GM's. */
const withMember = (src: string, ref: string) => /^\/api\/(assets|s3)\?/.test(src) ? `${src}&member=${ref}` : src;
function withoutMember(src: string, ref: string) {
  if (!/^\/api\/(assets|s3)\?/.test(src)) return src;
  const tail = `&member=${ref}`;
  return src.endsWith(tail) && !src.slice(0, -tail.length).includes("&member=") ? src.slice(0, -tail.length) : no("Co-GMs can use the pictures in this campaign and add new ones here. That picture is somewhere else.");
}

/** The copy a co-GM opens. Null when the campaign is gone or has no maps yet. */
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
export function maptableCoGmRefusal(before: Workspace, after: Workspace, campaignId: string, ref: string): string | null {
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

/** A co-GM's save, put back into the GM's whole Maptable. Throws a MapCoGmError, with a message for them, if it can't be. */
export function applyMaptableCoGm(full: Workspace, campaignId: string, ref: string, input: unknown): Workspace {
  const edited = workspaceSchema.parse(input);
  const before = maptableExport(full, campaignId, ref) ?? no("This campaign's maps are gone.");
  const refused = maptableCoGmRefusal(before, edited, campaignId, ref);
  if (refused) no(refused);
  const s = scope(full, campaignId);
  const campaign = full.collections.find(c => c.id === campaignId)!;
  const all = <T extends Keyed>(items: T[]) => new Set(items.map(x => x.id));
  const next: Workspace = {
    ...full,
    scenes: merge(full.scenes, s.scenes, edited.scenes, "map"),
    collections: merge(full.collections, s.collections, edited.collections.map(c => c.id === campaignId ? { ...c, parentId: campaign.parentId } : c), "folder"),
    assets: merge(full.assets, s.assets, edited.assets.map(a => ({ ...a, src: withoutMember(a.src, ref) })), "picture"),
    assetCampaigns: mergeRecord(full.assetCampaigns, s.assets, all(full.assets), Object.fromEntries(Object.entries(edited.assetCampaigns).map(([id, c]) => [id, c === null && full.assetCampaigns[id] ? full.assetCampaigns[id] : c]))),
    assetLocations: mergeRecord(full.assetLocations, s.assets, all(full.assets), edited.assetLocations),
    tokenLibrary: merge(full.tokenLibrary, s.tokens, edited.tokenLibrary, "token"),
    libraryCampaigns: mergeRecord(full.libraryCampaigns, s.tokens, all(full.tokenLibrary), edited.libraryCampaigns),
    libraryLocations: mergeRecord(full.libraryLocations, s.tokens, all(full.tokenLibrary), edited.libraryLocations),
    tokenFolders: merge(full.tokenFolders ?? [], s.tokenFolders, edited.tokenFolders ?? [], "token folder"),
    tokenFolderLocations: mergeRecord(full.tokenFolderLocations ?? {}, s.tokens, all(full.tokenLibrary), edited.tokenFolderLocations ?? {}),
    // The shared table tools are all in the copy, so the co-GM's lists are the new ones.
    conditions: edited.conditions, conditionFolders: edited.conditionFolders, conditionLocations: edited.conditionLocations,
    effectPresets: edited.effectPresets, effectPresetFolders: edited.effectPresetFolders, presetLocations: edited.presetLocations,
    assetFolders: edited.assetFolders,
    // Which map the GM has open stays theirs.
    activeId: full.activeId,
  };
  // Picture folders the GM's other pictures still sit in stay, even if the co-GM removed them from their copy.
  const folders = new Map(full.assetFolders.map(f => [f.id, f]));
  for (let id of [...Object.values(next.assetLocations), ...Object.values(next.libraryLocations)]) while (id && !next.assetFolders.some(f => f.id === id) && folders.has(id)) { next.assetFolders = [...next.assetFolders, folders.get(id)!]; id = folders.get(id)!.parentId; }
  if (!next.scenes.some(x => x.id === next.activeId)) next.activeId = next.scenes[0]?.id ?? no("Keep at least one map.");
  // A co-GM's new picture or token can't land in a campaign other than this one.
  for (const [id, c] of [...Object.entries(next.assetCampaigns), ...Object.entries(next.libraryCampaigns)]) if (!full.assets.some(a => a.id === id) && !full.tokenLibrary.some(t => t.id === id) && c !== null && c !== campaignId) no("Keep new pictures and tokens in this campaign.");
  const parsed = workspaceSchema.safeParse(next);
  if (!parsed.success) no(parsed.error.issues[0]?.message ?? "That change would break the maps.");
  return parsed.data!;
}
