import type { Point } from "./model";

export const LIBRARY_TOKEN_DROP = "maptable-library-token-drop";
export type LibraryTokenDrop = { tokenId: string; clientX: number; clientY: number; previewOnly?: boolean };

/** Share the board's current transform with pointer drags, without global board state. */
export function libraryTokenDropTarget(x: number, y: number, tokenId: string): HTMLCanvasElement | null {
  const target = document.elementFromPoint(x, y);
  if (!(target instanceof HTMLCanvasElement) || target.dataset.libraryTokenDrop !== "true") return null;
  const accepted = !target.dispatchEvent(new CustomEvent<LibraryTokenDrop>(LIBRARY_TOKEN_DROP, {
    cancelable: true, detail: { tokenId, clientX: x, clientY: y, previewOnly: true },
  }));
  return accepted ? target : null;
}

export function libraryTokenDropPoint(
  client: Point, rect: Pick<DOMRect, "left" | "top">,
  view: { x: number; y: number; scale: number },
  bounds: { x: number; y: number; width: number; height: number },
): Point | null {
  const point = { x: (client.x - rect.left - view.x) / view.scale, y: (client.y - rect.top - view.y) / view.scale };
  return Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= bounds.x && point.y >= bounds.y &&
    point.x <= bounds.x + bounds.width && point.y <= bounds.y + bounds.height ? point : null;
}
