/*
 * Dragging things into place: the list after dropping one item before or after another. Pure.
 */

/** The list with `id` moved to just before (or after) `target`. Unchanged when either is missing or they're the same. */
export function moveTo<T extends { id: string }>(list: readonly T[], id: string, target: string, after: boolean): T[] {
  if (id === target) return [...list];
  const item = list.find(x => x.id === id);
  if (!item || !list.some(x => x.id === target)) return [...list];
  const rest = list.filter(x => x.id !== id), at = rest.findIndex(x => x.id === target) + (after ? 1 : 0);
  return [...rest.slice(0, at), item, ...rest.slice(at)];
}
