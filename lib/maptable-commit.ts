/**
 * The workspace a Maptable edit makes: the edit itself, then the clean-ups every edit gets (condition rounds, zero-HP
 * status, attached tokens, hex-crawl reveals, auras following their tokens).
 *
 * An edit to one scene (`sceneId`) copies only that scene; every other scene stays the very object it was. The editor
 * copied the whole workspace (every scene, its fog, walls and tokens) on every edit, which lagged with many scenes.
 * The clean-ups run on the copied scene only: each one leaves a scene it has already run on as it is when that scene
 * and the campaign settings haven't changed, so the scenes left out are the ones they would not change.
 */
import { auraSize } from "./effects.ts";
import { revealAroundTokens } from "./hex-fog.ts";
import { syncConditionRounds } from "./initiative-tracker.ts";
import type { Scene, Workspace } from "./model";
import { syncTokenAttachments } from "./token-attachments.ts";
import { applyWorkspaceHpStates } from "./token-hp-state.ts";

export function editWorkspace(previous: Workspace, edit: (w: Workspace) => void, sceneId?: string): Workspace {
  const next: Workspace = sceneId ? { ...previous, scenes: previous.scenes.map(s => s.id === sceneId ? structuredClone(s) : s) } : structuredClone(previous);
  edit(next);
  const before = new Map(previous.scenes.map(s => [s.id, s]));
  const edited = (scene: Scene) => !sceneId || scene.id === sceneId;
  for (const scene of next.scenes) if (edited(scene)) syncConditionRounds(scene, before.get(scene.id));
  applyWorkspaceHpStates(previous, next, sceneId);
  next.scenes = next.scenes.map(scene => edited(scene) ? syncTokenAttachments(before.get(scene.id) ?? scene, scene) : scene);
  // Hex crawls: party tokens that moved clear the hexes around them, in the same undo step as the move.
  for (const scene of next.scenes) if (edited(scene)) revealAroundTokens(before.get(scene.id), scene);
  // Keep attached origins saved, and leave auras in place when their token is removed.
  for (const scene of next.scenes) {
    if (!edited(scene)) continue;
    for (const area of scene.effects) {
      if (!area.tokenId) continue;
      const token = scene.tokens.find(t => t.id === area.tokenId);
      const origin = token ?? before.get(scene.id)?.tokens.find(t => t.id === area.tokenId);
      if (origin) { area.x = origin.x; area.y = origin.y; if (area.reach !== undefined && area.type !== "custom") area.size = auraSize(area.type, origin.size, area.reach); }
      if (!token) area.tokenId = null;
    }
  }
  return next;
}
/** The scene an edit of "the open scene" changes: the active one, else the first. */
export function activeSceneId(w: Workspace | null | undefined): string | undefined {
  return (w?.scenes.find(s => s.id === w.activeId) ?? w?.scenes[0])?.id;
}
