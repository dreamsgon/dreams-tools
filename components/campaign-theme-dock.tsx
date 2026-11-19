'use client';
/*
 * The Admin CP (components/forum/forum-theme.tsx) beside the Encyclopedia, Maptable and the campaign's dashboard, so the
 * campaign's theme can be changed from any part of the campaign. It floats over one side of the page (docked left or
 * right; a sheet along the bottom on phones), and the page shows the theme being edited as it changes: pass `editing`
 * to that part's useCampaignSkin. The forum docks its own beside the page.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AdminCp, useAdminCp, useDock, type Preview } from './forum/forum-theme';
import { offerCampaignTheme, openAdminCp } from './campaign-theme-entry';
import type { EditingSkin } from './campaign-skin';
import type { ThemeArea } from '@/lib/campaign-theme/model';

export { openAdminCp as openThemeEditor };

/**
 * The Admin CP for `area` of the campaign that `campaign` names (`c-<id>`, `m-<member ref>` or `mt-<Maptable campaign>`;
 * null or undefined: none, so it never opens). `node` goes anywhere on the page (it's drawn over the page, outside the
 * theme), and `editing` goes to the part's useCampaignSkin. `offer`: whoever is looking may restyle the campaign, so the
 * Appearance menu shows Campaign theme.
 */
export function useThemeDock(key: string | null | undefined, area: ThemeArea, offer: boolean): { editing: EditingSkin | null; node: ReactNode } {
  const campaign = key ?? null;
  useEffect(() => campaign && offer ? offerCampaignTheme() : undefined, [campaign, offer]);
  // Open or closed is kept per part, so opening the Admin CP in the forum doesn't open it over the Encyclopedia too.
  const cp = useAdminCp(`${campaign ?? 'none'}:${area}`), [dock, setDock] = useDock(), [editing, setEditing] = useState<Preview>(null);
  const open = !!campaign && cp.open;
  // Keyed by campaign: another campaign's Admin CP starts afresh, so a draft never carries over to it.
  const node = open ? createPortal(<AdminCp key={campaign} k={campaign} host={area} floating dock={dock} setDock={setDock}
    onClose={() => { cp.close(); setEditing(null); }} onPreview={setEditing} onSaved={() => undefined} />, document.body) : null;
  return { editing: open ? editing : null, node };
}
