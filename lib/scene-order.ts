import type { Collection, Scene, Workspace } from "./model";

export type OrderedScene = { scene: Scene; folders: Collection[] };

/**
 * Scenes inside a campaign (or not in any campaign when rootId is null), in the
 * same order as the Scenes panel: each folder's subfolders first, then its scenes.
 * Other campaigns are skipped.
 */
export function scenesInOrder(w: Pick<Workspace, "collections" | "scenes">, rootId: string | null): OrderedScene[] {
  const out: OrderedScene[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | null, folders: Collection[]) => {
    for (const c of w.collections) {
      if (c.parentId !== parentId || c.kind !== "folder" || seen.has(c.id)) continue;
      seen.add(c.id);
      walk(c.id, [...folders, c]);
    }
    for (const scene of w.scenes) if (scene.containerId === parentId) out.push({ scene, folders });
  };
  walk(rootId, []);
  return out;
}

/** The scene before or after this one in the campaign's order, wrapping round. */
export function neighbourScene(w: Pick<Workspace, "collections" | "scenes">, rootId: string | null, sceneId: string, step: 1 | -1): Scene | null {
  const list = scenesInOrder(w, rootId);
  if (list.length < 2) return null;
  const i = list.findIndex(item => item.scene.id === sceneId);
  if (i < 0) return list[0].scene;
  return list[(i + step + list.length) % list.length].scene;
}
