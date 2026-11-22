"use client";
import { createContext, useContext } from "react";
import { pagesIn } from "@/lib/encyclopedia/wiki-scope-client";
import type { Workspace } from "@/lib/encyclopedia/world-model";

/** Pages per part as the server counts them, for campaigns whose pages this tab hasn't opened (null: the whole Wiki is open). */
export const PageCounts = createContext<ReadonlyMap<string, number> | null>(null);
/** How many pages a campaign has, opened here or not. */
export function usePagesIn(w: Workspace) { const counts = useContext(PageCounts); return (campaignId: string) => pagesIn(w, campaignId, counts); }
