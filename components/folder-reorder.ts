import { dropPlace } from "@/lib/folder-order";

/** Which folder row's top or bottom edge a dragged folder is over. `attr` is the row's drop attribute, e.g. "data-asset-drop". */
export function edgeAtPoint(x: number, y: number, attr: string, allowed: (targetId: string) => boolean): { id: string; place: "before" | "after" } | null {
  const row = document.elementFromPoint(x, y)?.closest<HTMLElement>(`.organizer-row[${attr}]`);
  const id = row?.getAttribute(attr);
  if (!row || !id || id === "root" || !allowed(id)) return null;
  const rect = row.getBoundingClientRect(), place = dropPlace(y - rect.top, rect.height);
  return place === "inside" ? null : { id, place };
}

/** Alt+Up / Alt+Down on a focused row. Returns -1 or 1, or 0 for any other key. */
export function altStep(e: { altKey: boolean; key: string }): -1 | 0 | 1 {
  return e.altKey ? (e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0) : 0;
}
