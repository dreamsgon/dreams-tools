"use client";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { AUTOSAVE_EVENT, AUTOSAVE_KEY, readAutosave, writeAutosave } from "@/lib/autosave";

function subscribe(change: () => void) {
  const storage = (e: StorageEvent) => { if (e.key === AUTOSAVE_KEY || e.key === null) change(); };
  window.addEventListener(AUTOSAVE_EVENT, change);
  window.addEventListener("storage", storage);
  return () => { window.removeEventListener(AUTOSAVE_EVENT, change); window.removeEventListener("storage", storage); };
}
/**
 * The Save automatically switch, kept in step across tabs and both tools. `ref` is for timers and callbacks
 * that read it later; `on` is for showing it.
 */
export function useAutosave() {
  const on = useSyncExternalStore(subscribe, readAutosave, () => true);
  const ref = useRef(on);
  useEffect(() => { ref.current = on; }, [on]);
  const set = useCallback((next: boolean) => { ref.current = next; writeAutosave(next); }, []);
  return { on, ref, set };
}
