/** What a click on the token gallery arms for placing on the map. Pure state helpers, no UI. */

export type ArmedToken = { id: string; name: string; source: "library" | "encyclopedia"; side?: "party" | "ally" | "neutral" | "enemy" };

/** Clicking the armed tile again puts it down; any other tile takes over. */
export function toggleArmed(current: ArmedToken | null, next: ArmedToken): ArmedToken | null {
  return current?.id === next.id ? null : next;
}

/** After a placement: Shift keeps the token armed, otherwise the pointer is free again. */
export function armedAfterPlacing(current: ArmedToken | null, keepPlacing: boolean): ArmedToken | null {
  return keepPlacing ? current : null;
}

/** Placement ids for Encyclopedia characters share the drop channel with saved tokens. */
export const ENCYCLOPEDIA_PREFIX = "ency:";
export const encyclopediaPlacementId = (entryId: string) => ENCYCLOPEDIA_PREFIX + entryId;
export function encyclopediaEntryOf(placementId: string): string | null {
  return placementId.startsWith(ENCYCLOPEDIA_PREFIX) ? placementId.slice(ENCYCLOPEDIA_PREFIX.length) : null;
}

/** The text of the pill over the map. */
export function armedPrompt(armed: ArmedToken): string {
  return `Click the map to place ${armed.name || "token"}`;
}
