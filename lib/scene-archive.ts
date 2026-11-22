/**
 * Archived Maptable maps: a scene moved out of the live workspace into its own file, so it isn't loaded or saved
 * with the rest. The workspace keeps a short entry for it (`archivedScenes`) so the Scene Picker can list it and
 * bring it back. Pure parts here; reading and writing storage is in lib/scene-archive-server.ts.
 */
import { z } from "zod";
import { assetSchema, type ArchivedScene, type Asset, type Scene, type Workspace } from "./model.ts";

/** Pictures (asset ids) these scenes, tokens and conditions show. */
export function usedAssets(scenes: Workspace["scenes"], tokens: Workspace["tokenLibrary"], conditions: Workspace["conditions"]) {
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

export const ARCHIVE_FORMAT = "maptable-archived-scene-v1";
/** An archived map's file: the scene, and the pictures it shows in case they are removed from the library meanwhile. */
export const archiveFileSchema = z.object({
  format: z.literal(ARCHIVE_FORMAT),
  at: z.string().max(40),
  scene: z.object({ id: z.string().max(120) }).passthrough(),
  assets: z.array(assetSchema).max(10000),
  assetCampaigns: z.record(z.string(), z.string().max(120).nullable()),
});
export type ArchiveFile = { format: typeof ARCHIVE_FORMAT; at: string; scene: Scene; assets: Asset[]; assetCampaigns: Record<string, string | null> };

export class SceneArchiveError extends Error {}

/** The archive file for a scene, and the workspace without it. Throws when it can't be archived. */
export function archiveScene(w: Workspace, sceneId: string, at: string): { file: ArchiveFile; text: string; next: Workspace; entry: ArchivedScene } {
  const scene = w.scenes.find(s => s.id === sceneId);
  if (!scene) throw new SceneArchiveError("That map isn't in your Maptable any more. Reload to see the latest.");
  const scenes = w.scenes.filter(s => s.id !== sceneId);
  if (!scenes.length) throw new SceneArchiveError("Keep at least one map out of the archive.");
  const used = usedAssets([scene], [], []);
  const assets = w.assets.filter(a => used.has(a.id));
  const file: ArchiveFile = { format: ARCHIVE_FORMAT, at, scene, assets, assetCampaigns: Object.fromEntries(assets.map(a => [a.id, w.assetCampaigns[a.id] ?? null])) };
  const text = JSON.stringify(file);
  const entry: ArchivedScene = { id: scene.id, name: scene.name, mapType: scene.mapType, containerId: scene.containerId, at, bytes: new TextEncoder().encode(text).length, tokens: scene.tokens.length };
  const next: Workspace = {
    ...w, scenes,
    activeId: w.activeId === sceneId ? scenes[0].id : w.activeId,
    archivedScenes: [...(w.archivedScenes ?? []).filter(s => s.id !== sceneId), entry],
  };
  return { file, text, next, entry };
}

/** The workspace with an archived map back in it, where it was (or outside any folder if that folder is gone). */
export function bringBackScene(w: Workspace, sceneId: string, input: unknown): Workspace {
  const entry = (w.archivedScenes ?? []).find(s => s.id === sceneId);
  if (!entry) throw new SceneArchiveError("That map isn't archived. Reload to see the latest.");
  if (w.scenes.some(s => s.id === sceneId)) throw new SceneArchiveError("That map is already in your Maptable.");
  const parsed = archiveFileSchema.safeParse(input);
  if (!parsed.success || parsed.data.scene.id !== sceneId) throw new SceneArchiveError("This map's archive file can't be read. Nothing was changed.");
  const file = parsed.data as unknown as ArchiveFile;
  const containerId = entry.containerId && w.collections.some(c => c.id === entry.containerId) ? entry.containerId : null;
  const have = new Set(w.assets.map(a => a.id)), campaigns = new Set(w.collections.filter(c => c.kind === "campaign").map(c => c.id));
  const missing = file.assets.filter(a => !have.has(a.id));
  const assetCampaigns = { ...w.assetCampaigns };
  for (const a of missing) { const c = file.assetCampaigns[a.id] ?? null; assetCampaigns[a.id] = c && campaigns.has(c) ? c : null; }
  return {
    ...w,
    scenes: [...w.scenes, { ...file.scene, containerId }],
    assets: [...w.assets, ...missing],
    assetCampaigns,
    archivedScenes: (w.archivedScenes ?? []).filter(s => s.id !== sceneId),
  };
}

/** Archived maps in a campaign (or in no campaign when rootId is null), newest first. */
export function archivedIn(w: Pick<Workspace, "collections" | "archivedScenes">, rootId: string | null): ArchivedScene[] {
  const campaignOf = (id: string | null) => {
    let c = w.collections.find(x => x.id === id);
    for (let i = 0; c && c.kind !== "campaign" && i < 100; i++) c = w.collections.find(x => x.id === c!.parentId);
    return c?.kind === "campaign" ? c.id : null;
  };
  return (w.archivedScenes ?? []).filter(s => campaignOf(s.containerId) === rootId).sort((a, b) => b.at.localeCompare(a.at));
}
