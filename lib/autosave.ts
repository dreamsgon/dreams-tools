/*
 * Save automatically: on unless switched off. The choice is kept per device and shared by Maptable and the
 * Encyclopedia. With it off, edits wait for Save or Ctrl/Cmd+S; nothing else about saving changes.
 */
export const AUTOSAVE_KEY = "rpg-tools:autosave";
export const AUTOSAVE_EVENT = "rpg-tools:autosave";

export function readAutosave(): boolean {
  try { return localStorage.getItem(AUTOSAVE_KEY) !== "off"; } catch { return true; }
}
export function writeAutosave(on: boolean) {
  try { if (on) localStorage.removeItem(AUTOSAVE_KEY); else localStorage.setItem(AUTOSAVE_KEY, "off"); } catch { /* Storage is optional; the switch still works for this page. */ }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(AUTOSAVE_EVENT, { detail: on }));
}
/** "3 unsaved changes", "1 unsaved change". */
export const unsavedLabel = (n: number) => `${n > 0 ? n : "Some"} unsaved change${n === 1 ? "" : "s"}`;
