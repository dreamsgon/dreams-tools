import type { Scene, Token } from "./model";

/** Tokens retain their array order: attachments do not change rendering layers. */
export function canAttachToken(scene: Scene, childId: string, parentId: string | null): boolean {
  const tokens = new Map(scene.tokens.map(token => [token.id, token]));
  if (!tokens.has(childId)) return false;
  const seen = new Set([childId]);
  while (parentId !== null) {
    if (seen.has(parentId)) return false;
    seen.add(parentId);
    const parent = tokens.get(parentId);
    if (!parent) return false;
    parentId = parent.attachedToId ?? null;
  }
  return true;
}

/** Attach in place, keeping the current position and elevation offset. */
export function attachToken(scene: Scene, childId: string, parentId: string | null): Scene {
  if (!canAttachToken(scene, childId, parentId)) return scene;
  return { ...scene, tokens: scene.tokens.map(token => token.id === childId ? { ...token, attachedToId: parentId } : token) };
}

/** Carry descendants once; explicitly edited coordinates establish a new offset. */
export function syncTokenAttachments(previousScene: Scene, nextScene: Scene): Scene {
  const previous = new Map(previousScene.tokens.map(token => [token.id, token]));
  const next = new Map(nextScene.tokens.map(token => [token.id, token]));
  const resolved = new Map<string, Token>();
  const resolve = (token: Token): Token => {
    const cached = resolved.get(token.id);
    if (cached) return cached;
    const parentId = token.attachedToId ?? null;
    if (parentId !== null && !canAttachToken(nextScene, token.id, parentId)) {
      const detached = { ...token, attachedToId: null };
      resolved.set(token.id, detached);
      return detached;
    }
    let result = token;
    const before = previous.get(token.id);
    const parent = parentId === null ? undefined : next.get(parentId);
    const oldParent = parentId === null ? undefined : previous.get(parentId);
    if (parent && oldParent && before && before.attachedToId === parentId) {
      const movedParent = resolve(parent);
      const xyEdited = token.x !== before.x || token.y !== before.y;
      const x = xyEdited ? token.x : token.x + movedParent.x - oldParent.x;
      const y = xyEdited ? token.y : token.y + movedParent.y - oldParent.y;
      const elevation = token.elevation !== before.elevation ? token.elevation :
        Math.max(-100000, Math.min(100000, (token.elevation ?? 0) + (movedParent.elevation ?? 0) - (oldParent.elevation ?? 0)));
      if (x !== token.x || y !== token.y || elevation !== token.elevation) result = { ...token, x, y, elevation };
    }
    resolved.set(token.id, result);
    return result;
  };
  const tokens = nextScene.tokens.map(resolve);
  return tokens.some((token, index) => token !== nextScene.tokens[index]) ? { ...nextScene, tokens } : nextScene;
}
