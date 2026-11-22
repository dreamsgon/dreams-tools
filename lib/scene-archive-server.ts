/**
 * Archiving a Maptable map and bringing it back, against storage. The archive file is written before the workspace
 * that leaves the map out, and removed again if that save loses a race; bringing back removes the file only once
 * the workspace holding the map again is saved. workspace.json stays the one conditional commit (lib/workspace-storage.ts).
 */
import type { Bucket } from "./storage-types.ts";
type Store = Bucket & { delete(key: string): Promise<void> };
import { loadWorkspace, saveFromSnapshot } from "./workspace-storage.ts";
import { archiveScene, bringBackScene, SceneArchiveError } from "./scene-archive.ts";
import type { Workspace } from "./model.ts";

export const archiveKey = (prefix: string, sceneId: string) => `${prefix}scene-archive/${encodeURIComponent(sceneId)}.json`;

/** Null when the workspace moved on since `revision`. */
export async function archiveMap(bucket: Store, prefix: string, revision: string | null, sceneId: string, now = new Date()) {
  const current = await loadWorkspace(bucket, prefix);
  if (!current || current.revision !== revision) return null;
  const { text, next, entry } = archiveScene(current.workspace, sceneId, now.toISOString());
  const key = archiveKey(prefix, sceneId);
  await bucket.put(key, text, { httpMetadata: { contentType: "application/json" } });
  const saved = await saveFromSnapshot(bucket, prefix, next, revision, current).catch(async error => { await bucket.delete(key).catch(() => {}); throw error; });
  if (!saved) { await bucket.delete(key).catch(() => {}); return null; }
  return { revision: saved.revision, entry };
}

/** Null when the workspace moved on since `revision`. */
export async function bringBackMap(bucket: Store, prefix: string, revision: string | null, sceneId: string) {
  const current = await loadWorkspace(bucket, prefix);
  if (!current || current.revision !== revision) return null;
  if (!(current.workspace.archivedScenes ?? []).some(s => s.id === sceneId)) throw new SceneArchiveError("That map isn't archived. Reload to see the latest.");
  const key = archiveKey(prefix, sceneId), object = await bucket.get(key);
  if (!object) throw new SceneArchiveError("This map's archive file is missing. Nothing was changed.");
  const next = bringBackScene(current.workspace, sceneId, await object.json());
  const saved = await saveFromSnapshot(bucket, prefix, next, revision, current);
  if (!saved) return null;
  await bucket.delete(key).catch(() => {});
  return { revision: saved.revision };
}

/**
 * The workspace with a campaign's archived maps put back in, for a campaign backup, Duplicate or the copy kept when a
 * campaign is deleted, so none of them miss the archived maps. `inCampaign` says which archived maps belong.
 * Throws when an archive file can't be read, so a backup never quietly leaves a map out.
 */
export async function withArchivedMaps(bucket: Store, prefix: string, w: Workspace, inCampaign: (containerId: string | null) => boolean): Promise<Workspace> {
  const mine = (w.archivedScenes ?? []).filter(s => inCampaign(s.containerId));
  if (!mine.length) return w;
  let next = w;
  for (const entry of mine) {
    const object = await bucket.get(archiveKey(prefix, entry.id));
    if (!object) throw new SceneArchiveError(`The archived map “${entry.name}” can't be read. Nothing was changed.`);
    next = bringBackScene(next, entry.id, await object.json());
  }
  return next;
}
