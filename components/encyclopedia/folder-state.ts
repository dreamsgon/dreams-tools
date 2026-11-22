"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { openFoldersKey, parseOpenFolders, withClosed, withOpened } from "@/lib/encyclopedia/folder-state";

function readSaved(): string[] {
  if (typeof window === "undefined") return [];
  try { return parseOpenFolders(localStorage.getItem(openFoldersKey)); } catch { return []; /* Storage is optional. */ }
}

/**
 * The page tree's open folders, remembered in this browser. Closed unless opened. The saved list is read on the
 * first render in the browser; the tree only draws once the Wiki has loaded, so the server's empty list never shows.
 */
export function useOpenFolders() {
  const [list, setList] = useState<string[]>(readSaved);
  useEffect(() => { try { localStorage.setItem(openFoldersKey, JSON.stringify(list)); } catch { /* Storage is optional. */ } }, [list]);
  const set = useMemo(() => new Set(list), [list]);
  const isOpen = useCallback((id: string) => set.has(id), [set]);
  const open = useCallback((...ids: string[]) => setList(l => ids.every(id => l.includes(id)) ? l : withOpened(l, ids)), []);
  const close = useCallback((...ids: string[]) => setList(l => withClosed(l, ids)), []);
  const toggle = useCallback((id: string) => setList(l => l.includes(id) ? withClosed(l, [id]) : withOpened(l, [id])), []);
  return { isOpen, open, close, toggle };
}
