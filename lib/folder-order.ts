/** Folder re-ordering for lists that keep their order in array position (scene folders, asset folders and so on). Pure, so it can be tested. */
export type Ordered = { id: string; parentId: string | null };

/** Moves a folder one place up (-1) or down (1) among folders with the same parent (only those `shown` counts as neighbours). Returns the same array when it can't move. */
export function moveSibling<T extends Ordered>(list: T[], id: string, delta: -1 | 1, shown: (f: T) => boolean = () => true): T[] {
  const item = list.find(f => f.id === id);
  if (!item) return list;
  const siblings = list.filter(f => (f.parentId ?? null) === (item.parentId ?? null) && shown(f));
  const at = siblings.findIndex(f => f.id === id), other = siblings[at + delta];
  if (!other) return list;
  const next = list.slice(), from = next.findIndex(f => f.id === id), to = next.findIndex(f => f.id === other.id);
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Whether the folder has a neighbour to swap with in that direction. */
export function canMoveSibling<T extends Ordered>(list: T[], id: string, delta: -1 | 1, shown?: (f: T) => boolean): boolean {
  return moveSibling(list, id, delta, shown) !== list;
}

/** Puts a folder directly before or after another and gives it that folder's parent. The caller checks the move is allowed (not into itself). */
export function placeBeside<T extends Ordered>(list: T[], id: string, targetId: string, place: "before" | "after"): T[] {
  if (id === targetId) return list;
  const item = list.find(f => f.id === id), target = list.find(f => f.id === targetId);
  if (!item || !target) return list;
  const rest = list.filter(f => f.id !== id), at = rest.findIndex(f => f.id === targetId) + (place === "after" ? 1 : 0);
  rest.splice(at, 0, { ...item, parentId: target.parentId ?? null });
  return rest;
}

/** Which part of a row a pointer is over: top quarter is before, bottom quarter is after, the middle is inside. */
export function dropPlace(offsetY: number, height: number): "before" | "inside" | "after" {
  const ratio = height > 0 ? offsetY / height : .5;
  return ratio < .25 ? "before" : ratio > .75 ? "after" : "inside";
}
