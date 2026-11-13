"use client";
import { useEffect } from "react";

type Loader = () => Promise<unknown>;

/**
 * Fetches code-split parts of a page one at a time while the browser is idle,
 * so they are already cached by the time someone opens them.
 * The loaders should be the same `import()` calls the page passes to `next/dynamic`.
 */
export function useIdlePreload(loaders: readonly Loader[]) {
  useEffect(() => {
    let cancelled = false;
    let handle: number | undefined;
    const queue = [...loaders];
    const idle = (run: () => void) =>
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(run, { timeout: 4000 })
        : window.setTimeout(run, 1500);
    const next = () => {
      const load = queue.shift();
      if (cancelled || !load) return;
      handle = idle(() => { void load().catch(() => {}).finally(next); });
    };
    next();
    return () => {
      cancelled = true;
      if (handle === undefined) return;
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
    // The loaders are module-level constants; run once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
