'use client';
/*
 * How the campaign theme's Admin CP (components/forum/forum-theme.tsx) is reached, kept small so the Appearance menu can
 * use it on every page. A part of the campaign that can open the Admin CP offers it while it's on the page
 * (`offerCampaignTheme`); the Appearance menu then shows Campaign theme, which sends the open event.
 */
import { useSyncExternalStore } from 'react';

/** The event that opens the Admin CP, wherever it's docked on the page. */
export const OPEN_ADMIN_CP = 'forum:open-cp';
export const openAdminCp = () => window.dispatchEvent(new Event(OPEN_ADMIN_CP));

let offers = 0;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach(l => l());
/** Says the page can open the Admin CP, until the returned function is called. */
export function offerCampaignTheme(): () => void {
  offers++; changed();
  return () => { offers--; changed(); };
}
/** Whether this page offers the Admin CP (false while rendering on the server). */
export function useCampaignThemeOffered() {
  return useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, () => offers > 0, () => false);
}
