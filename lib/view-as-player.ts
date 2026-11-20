"use client";
import { useSyncExternalStore } from "react";

/*
 * "Switch to Player view" from the account menu: a GM sees each tool the way their players do. Saved on this
 * device only. Maptable switches the open scene to its player view, the Wiki shows the campaign's player pages,
 * and the Forum reads as the Players group (read only, lib/forum/request.ts). It never changes what anyone may
 * do on the server: the GM can switch back at any time.
 */
export const VIEW_AS_PLAYER_KEY = "rpg:view-as-player";
const EVENT = "rpg:view-as-player";

export function viewAsPlayer(): boolean {
  try { return localStorage.getItem(VIEW_AS_PLAYER_KEY) === "1"; } catch { return false; }
}
export function setViewAsPlayer(on: boolean) {
  if (on === viewAsPlayer()) return;
  try { if (on) localStorage.setItem(VIEW_AS_PLAYER_KEY, "1"); else localStorage.removeItem(VIEW_AS_PLAYER_KEY); } catch { /* storage off: nothing to remember */ }
  window.dispatchEvent(new Event(EVENT));
}
function subscribe(changed: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === VIEW_AS_PLAYER_KEY || e.key === null) changed(); };
  window.addEventListener(EVENT, changed);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(EVENT, changed); window.removeEventListener("storage", onStorage); };
}
/** Whether the player view is on. False on the server and in the first render, so pages hydrate the same. */
export function useViewAsPlayer(): boolean {
  return useSyncExternalStore(subscribe, viewAsPlayer, () => false);
}
