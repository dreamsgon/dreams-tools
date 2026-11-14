"use client";
import { useEffect } from "react";

/**
 * Sets the browser tab title while a page is open and puts the previous one back when it goes away.
 * Not React state, so setting document.title in an effect is fine. An empty title leaves the current one alone.
 */
export function usePageTitle(title: string) {
  useEffect(() => {
    if (!title) return;
    const before = document.title;
    document.title = title;
    return () => { document.title = before; };
  }, [title]);
}
