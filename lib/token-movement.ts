import { snap, type Grid, type Point, type Scene, type Token } from "./model.ts";

/** Measure and move the token center, preserving the pointer's original grab offset. `free` (Alt) skips the grid. */
export function tokenDragPosition(original: Point, grab: Point, pointer: Point, grid: Grid, size = 1, free = false): Point {
  return snap({ x: original.x + pointer.x - grab.x, y: original.y + pointer.y - grab.y }, free ? { ...grid, snap: false } : grid, size);
}

export type TokenMovePlan = {
  sceneId: string;
  tokenId: string;
  original: Point;
  size: number;
  points: Point[];
};

export function startTokenMovePlan(sceneId: string, token: Pick<Token, "id" | "x" | "y" | "size">): TokenMovePlan {
  const original = { x: token.x, y: token.y };
  return { sceneId, tokenId: token.id, original, size: token.size, points: [original] };
}

/** Fail closed if the token moved, resized, disappeared, or belongs to another scene. */
export function tokenMovePlanValid(plan: TokenMovePlan, scene: Pick<Scene, "id" | "tokens">): boolean {
  const token = scene.tokens.find(item => item.id === plan.tokenId);
  return scene.id === plan.sceneId && !!token && token.x === plan.original.x && token.y === plan.original.y && token.size === plan.size;
}

export function appendTokenMovePoint(plan: TokenMovePlan, pointer: Point, grid: Grid, bounds: { width: number; height: number }): TokenMovePlan {
  const snapped = snap(pointer, grid, plan.size);
  const point = { x: Math.max(0, Math.min(bounds.width, snapped.x)), y: Math.max(0, Math.min(bounds.height, snapped.y)) };
  const last = plan.points.at(-1)!;
  if (plan.points.length >= 200 || (point.x === last.x && point.y === last.y)) return plan;
  return { ...plan, points: [...plan.points, point] };
}

export function undoTokenMovePoint(plan: TokenMovePlan): TokenMovePlan {
  return plan.points.length > 1 ? { ...plan, points: plan.points.slice(0, -1) } : plan;
}

/** Resolving the final destination is the only operation needed at explicit commit time. */
export function tokenMovePlanDestination(plan: TokenMovePlan, scene: Pick<Scene, "id" | "tokens">): Point | null {
  return plan.points.length > 1 && tokenMovePlanValid(plan, scene) ? { ...plan.points.at(-1)! } : null;
}
