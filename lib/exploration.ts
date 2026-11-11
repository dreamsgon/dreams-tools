import type { Point, PointOfInterest, Scene, Workspace } from "./model";

/** Find the nearest campaign, rejecting ambiguous IDs and invalid ancestry. */
export function campaignForScene(workspace: Workspace, sceneOrId: Scene | string): string | null {
  const id = typeof sceneOrId === "string" ? sceneOrId : sceneOrId.id;
  const matches = workspace.scenes.filter(scene => scene.id === id);
  if (matches.length !== 1) return null;
  let parent = matches[0].containerId;
  let campaign: string | null = null;
  const seen = new Set<string>();
  while (parent !== null) {
    if (seen.has(parent)) return null;
    seen.add(parent);
    const ancestors = workspace.collections.filter(collection => collection.id === parent);
    if (ancestors.length !== 1) return null;
    const ancestor = ancestors[0];
    if (campaign === null && ancestor.kind === "campaign") campaign = ancestor.id;
    parent = ancestor.parentId;
  }
  return campaign;
}

/** Only other scenes in the same campaign can be exploration destinations. */
export function sceneTargets(workspace: Workspace, sourceId: string): Scene[] {
  const campaign = campaignForScene(workspace, sourceId);
  if (campaign === null) return [];
  return workspace.scenes.filter(scene => scene.id !== sourceId && campaignForScene(workspace, scene) === campaign);
}

/** Recheck at activation time: deletion or moving scenes may invalidate saved links. */
export function resolvePointOfInterestTarget(workspace: Workspace, sourceId: string, poi: PointOfInterest): Scene | null {
  if (!poi.targetSceneId) return null;
  return sceneTargets(workspace, sourceId).find(scene => scene.id === poi.targetSceneId) ?? null;
}

export function newPointOfInterest(point: Point, activation: PointOfInterest["activation"] = "double"): PointOfInterest {
  return {
    id: crypto.randomUUID(),
    folderId: null,
    name: activation === "single" ? "New transition" : "New point of interest",
    x: point.x,
    y: point.y,
    color: "#d4a44c",
    hidden: false,
    targetSceneId: null,
    activation,
  };
}
