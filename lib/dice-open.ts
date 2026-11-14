/** A tiny way for any page to ask the global dice tray to open (the Encyclopedia's phone bar has no floating Dice button). */
export type DicePanelName = "dice" | "log";
export const OPEN_DICE_EVENT = "rpg-tools:open-dice";

export function openDiceTray(panel: DicePanelName = "dice"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<DicePanelName>(OPEN_DICE_EVENT, { detail: panel }));
}

/** Listen for open requests. Returns the function that stops listening. */
export function onOpenDiceTray(handler: (panel: DicePanelName) => void): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    handler(detail === "log" ? "log" : "dice");
  };
  window.addEventListener(OPEN_DICE_EVENT, listener);
  return () => window.removeEventListener(OPEN_DICE_EVENT, listener);
}
