'use client';
/*
 * A campaign's live theme outside the forum: the Encyclopedia, Maptable and the campaign's dashboard (lib/campaign-theme).
 * `useCampaignSkin` asks for the theme of one part of the campaign; the page puts `skin.className` on the element that
 * holds the campaign's part (never the app bar) and renders `skin.nodes` inside it. The stylesheet is kept for the
 * browser tab, so moving between pages doesn't flash the app's own look.
 *
 * The Admin CP's Preview links add ?skin-preview=1: the page then shows the theme the GM is editing, which the Admin CP
 * left in this browser's storage, instead of the live one. Nobody else sees it. With the Admin CP open beside the page
 * (components/campaign-theme-dock.tsx), the page shows the theme being edited as it changes (`editing`).
 *
 * The live theme is asked for again when the tab comes back into view and after the Admin CP saves (`refreshSkins`), so
 * a theme made live elsewhere shows without a reload. The browser sends the key it has, so an unchanged theme costs little.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { SKIN_SCOPE } from '@/lib/campaign-theme/css';
import { themeCss, themeFontsUrl, themeSchema, type LiveTheme, type Theme, type ThemeArea } from '@/lib/campaign-theme/model';

type Skin = { key: string; name: string; css: string; fonts: string };
type Answer = { theme: LiveTheme | { key: string; same: true } | null };
/** Where the Admin CP leaves a theme to preview, and how long it's kept. */
export const PREVIEW_STORE = 'campaign-skin:preview';
const PREVIEW_AGE = 2 * 60 * 60 * 1000;
// Read once, before a page tidies its address.
const previewing = typeof location !== 'undefined' && new URLSearchParams(location.search).has('skin-preview');

const memory = new Map<string, Skin | null>();
const stored = (k: string) => `campaign-skin:${k}`;
function remembered(k: string): Skin | null | undefined {
  if (memory.has(k)) return memory.get(k);
  try { const raw = sessionStorage.getItem(stored(k)); return raw ? JSON.parse(raw) as Skin | null : undefined; } catch { return undefined; }
}
function remember(k: string, skin: Skin | null) {
  memory.set(k, skin);
  try { sessionStorage.setItem(stored(k), JSON.stringify(skin)); } catch { /* storage may be off or full */ }
}

/** Leaves a theme for the Preview links to show. */
export function leavePreview(theme: Theme) {
  try { localStorage.setItem(PREVIEW_STORE, JSON.stringify({ at: Date.now(), theme })); } catch { /* storage may be off or full */ }
}
function preview(area: ThemeArea): Skin | null {
  try {
    const raw = JSON.parse(localStorage.getItem(PREVIEW_STORE) ?? 'null') as { at?: number; theme?: unknown } | null;
    if (!raw || typeof raw.at !== 'number' || Date.now() - raw.at > PREVIEW_AGE) return null;
    const t = themeSchema.safeParse(raw.theme);
    return t.success ? { key: 'preview', name: t.data.name, css: themeCss(t.data, SKIN_SCOPE, area).css, fonts: themeFontsUrl(t.data) } : null;
  } catch { return null; }
}
const REFRESH_EVENT = 'campaign-skin:refresh';
/** Asks every part on this page for its live theme again: the Admin CP calls it after a save. */
export const refreshSkins = () => window.dispatchEvent(new Event(REFRESH_EVENT));
/** A theme being edited, compiled for one part: what the Admin CP hands the page beside it. */
export type EditingSkin = { name: string; css: string; fonts: string };
const stopPreview = () => { const url = new URL(location.href); url.searchParams.delete('skin-preview'); location.replace(url.toString()); };

/**
 * The live theme for `area` of the campaign that `campaign` names (`c-<id>`, `m-<member ref>` or `mt-<Maptable campaign
 * id>`; null: no campaign, so no theme). `given`: a theme the page already has (the player pages get it with their data).
 * `editing`: the theme open in the Admin CP beside the page, shown in place of the live one.
 */
export function useCampaignSkin(campaign: string | null, area: ThemeArea, given?: LiveTheme | null, editing?: EditingSkin | null): { on: boolean; className: string; nodes: ReactNode } {
  const k = campaign ? `${campaign}:${area}` : '';
  const [skin, setSkin] = useState<Skin | null>(null), [isPreview, setIsPreview] = useState(false), [asks, setAsks] = useState(0);
  // Ask again when the tab is back in view, or the Admin CP saved.
  useEffect(() => {
    if (given !== undefined || !k) return;
    const again = () => { if (!document.hidden) setAsks(n => n + 1); };
    window.addEventListener(REFRESH_EVENT, again); document.addEventListener('visibilitychange', again);
    return () => { window.removeEventListener(REFRESH_EVENT, again); document.removeEventListener('visibilitychange', again); };
  }, [k, given]);
  useEffect(() => {
    const shown = previewing ? preview(area) : null;
    const known = shown || given !== undefined || !k ? undefined : remembered(k);
    const now = shown ?? (given !== undefined ? given && { key: given.key, name: given.name, css: given.css, fonts: given.fonts } : known ?? null);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- what's known now (a preview, the page's own, or the kept stylesheet), read after mount so the server and first client render agree
    setSkin(now); setIsPreview(!!shown);
    if (shown || given !== undefined || !k) return;
    let live = true;
    fetch('/api/forum', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'skin', campaign, area, ...(known ? { theme: known.key } : {}) }) })
      .then(r => r.ok ? r.json() as Promise<Answer> : null)
      .then(out => {
        const t = out?.theme;
        if (!live || !out || (t && 'same' in t)) return;
        const next = t ? { key: t.key, name: t.name, css: t.css, fonts: t.fonts } : null;
        remember(k, next); setSkin(next);
      })
      .catch(() => { /* the app's own look, until the next visit */ });
    return () => { live = false; };
  }, [k, campaign, area, given, asks]);
  const shown = editing ? { key: 'editing', ...editing } : skin;
  if (!shown) return { on: false, className: '', nodes: null };
  return {
    on: true, className: 'campaign-skin',
    nodes: <>
      <link rel="stylesheet" href={shown.fonts} precedence="default" />
      <style>{shown.css}</style>
      {isPreview && !editing && <div className="skin-preview-note" role="status">Previewing <b>{shown.name}</b>, not saved. Only you see this.<button type="button" onClick={stopPreview}>Stop previewing</button></div>}
    </>,
  };
}
