import { dropPlace } from "@/lib/folder-order";

/** Which folder row's top or bottom edge a dragged folder is over. `attr` is the row's drop attribute, e.g. "data-asset-drop". */
export function edgeAtPoint(x: number, y: number, attr: string, allowed: (targetId: string) => boolean): { id: string; place: "before" | "after" } | null {
  const row = document.elementFromPoint(x, y)?.closest<HTMLElement>(`.organizer-row[${attr}]`);
  const id = row?.getAttribute(attr);
  if (!row || !id || id === "root" || !allowed(id)) return null;
  const rect = row.getBoundingClientRect(), place = dropPlace(y - rect.top, rect.height);
  return place === "inside" ? null : { id, place };
}

/**
 * Alt+Up / Alt+Down on a focused folder row: returns -1 or 1 and claims the key (so the breadcrumbs' Alt+Up
 * shortcut on the window does not also fire), or 0 for any other key or when the key came from a text field.
 */
export function altStep(e: { altKey: boolean; key: string; target: EventTarget | null; preventDefault: () => void; stopPropagation: () => void }): -1 | 0 | 1 {
  const step = e.altKey ? (e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0) : 0;
  if (!step || (e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable='true']")) return 0;
  e.preventDefault(); e.stopPropagation();
  return step;
}
