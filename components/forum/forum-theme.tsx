'use client';
/*
 * The Admin CP: the campaign's themes, docked left or right of the part of the campaign it was opened from (`host`),
 * which shows every change as you make it. In the forum it sits beside the page; in the Encyclopedia, Maptable and the
 * dashboard it floats over one side (components/campaign-theme-dock.tsx). A menu along the top picks the theme to
 * change (a saved one, or a skin to start from); Theme (making it live, copying, pasting theme code), Colours (every
 * colour, the main eight and each one the stylesheets draw with, for a light and a dark version, each with a way back
 * to the theme's own), Basics (name, fonts, corners, banner), a stylesheet tab for
 * each part of the campaign (Forum, Encyclopedia, Maptable, Dashboard, each with the safety checks' notes by line and
 * that part's class names; the other parts open in a new tab to preview) and Help. Themes belong to the campaign, not
 * its forum, so this works before a forum is set up. For those who may arrange the forum: the GM, and the groups the GM
 * lets. Nothing reaches members until a theme is saved and made live.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, PanelLeft, PanelRight, Palette, RotateCcw, X } from 'lucide-react';
import { COLOUR_ROLES, PRESET_NOTES, THEME_AREAS, THEME_FONTS, THEME_LIMITS, THEME_PRESETS, ThemeError, areaCss, contrastChecks, cssSize, importTheme, presetOf, themeColours, themeCss, themeFontsUrl, type ColourRole, type FontId, type Theme, type ThemeArea } from '@/lib/campaign-theme/model';
import { colourName, paletteOf, swapColours, type PaletteColour } from '@/lib/campaign-theme/palette';
import { leavePreview, refreshSkins } from '../campaign-skin';
import { SKIN_SCOPE } from '@/lib/campaign-theme/css';
import './admin-cp.css';
import { cleanCss } from '@/lib/campaign-theme/css';
import { resolveTheme, parseThemeMode, THEME_STORAGE_KEY } from '@/lib/appearance';
import { confirmDialog } from '../confirm-dialog';
import { forumCall } from './forum-api';
import { BannerTab } from './admin-cp-banner';
import type { Look } from '@/lib/encyclopedia/look';
import { OPEN_ADMIN_CP as OPEN_EVENT, openAdminCp } from '../campaign-theme-entry';

type Themes = { live: Theme | null; saved: Theme[] };
/** The theme being edited, compiled for the part beside the Admin CP. */
export type Preview = { name: string; css: string; fonts: string; banner: Theme['banner'] } | null;
type Tab = 'themes' | 'colours' | 'basics' | 'banner' | 'help' | ThemeArea;
/** Where the campaign's parts open, for the Preview links: `key` is the campaign's key as the forum's (`c-` or `m-`). */
type Where = { key: string; campaignId: string; maptableId: string | null; owner: boolean };

/** Opens the Admin CP from anywhere on the page: Forum settings, the Appearance menu, the Encyclopedia's Look, the dashboard. */
export { openAdminCp };
export function useAdminCp(k: string) {
  const store = `forum:cp:${k}`;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount (and per campaign), so the server and first client render agree
    try { setOpen(sessionStorage.getItem(store) === '1'); } catch { /* storage may be off */ }
    const on = () => { setOpen(true); try { sessionStorage.setItem(store, '1'); } catch { /* storage may be off */ } };
    window.addEventListener(OPEN_EVENT, on);
    return () => window.removeEventListener(OPEN_EVENT, on);
  }, [store]);
  const close = () => { setOpen(false); try { sessionStorage.removeItem(store); } catch { /* storage may be off */ } };
  return { open, close };
}
export function useDock() {
  const [dock, setDock] = useState<'left' | 'right'>('left');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount, so the server and first client render agree
    try { if (localStorage.getItem('forum:cp-dock') === 'right') setDock('right'); } catch { /* storage may be off */ }
  }, []);
  return [dock, (d: 'left' | 'right') => { setDock(d); try { localStorage.setItem('forum:cp-dock', d); } catch { /* storage may be off */ } }] as const;
}

const newId = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const sameTheme = (a: Theme | null, b: Theme | null) => !!a && !!b && JSON.stringify({ ...a, updatedAt: '' }) === JSON.stringify({ ...b, updatedAt: '' });
/** The member's own light or dark setting, to put back when the Admin CP closes. */
function ownScheme() {
  let mode: ReturnType<typeof parseThemeMode> = null;
  try { mode = parseThemeMode(localStorage.getItem(THEME_STORAGE_KEY)); } catch { /* storage may be off */ }
  return resolveTheme(mode ?? 'system', window.matchMedia('(prefers-color-scheme: dark)').matches);
}
const setScheme = (s: 'light' | 'dark') => { document.documentElement.dataset.theme = s; };
/** What a theme's code looks like when copied: the JSON the theme prompt asks Claude for. */
const codeOf = (t: Theme) => JSON.stringify({ name: t.name, mode: t.mode, radius: t.radius, banner: t.banner, fonts: t.fonts, colors: t.colors, css: t.css, ...(t.areas && Object.values(t.areas).some(Boolean) ? { areas: t.areas } : {}), ...(t.palette && Object.keys(t.palette).length ? { palette: t.palette } : {}), ...(t.from ? { from: t.from } : {}) }, null, 2);
/**
 * A part of the campaign with the theme being edited, in a new tab (components/campaign-skin.tsx). The forum shows the
 * live theme only: to edit beside it, the Admin CP opens from Forum settings.
 */
function previewHref(k: string, where: Where | null, area: ThemeArea): string | null {
  const enc = encodeURIComponent, member = k.startsWith('m-');
  if (area === 'forum') return where ? `/forum#${where.key}` : null;
  if (area === 'encyclopedia') return member ? `/encyclopedia?skin-preview=1#${k}` : where ? `/encyclopedia?campaign=${enc(where.campaignId)}&skin-preview=1` : null;
  if (area === 'maptable') return member ? `/maptable?skin-preview=1#${k}` : where?.maptableId ? `/maptable?campaign=${enc(where.maptableId)}&skin-preview=1` : null;
  if (area === 'dashboard') return !member && where?.owner ? `/campaigns/${enc(`e:${where.campaignId}`)}?skin-preview=1` : null;
  return null;
}

export function AdminCp({ k, host = 'forum', floating = false, dock, setDock, onClose, onPreview, onSaved }: {
  k: string; host?: ThemeArea; floating?: boolean; dock: 'left' | 'right'; setDock: (d: 'left' | 'right') => void; onClose: () => void;
  onPreview: (p: Preview) => void; onSaved: () => void;
}) {
  const hostLabel = THEME_AREAS.find(a => a.id === host)?.label ?? 'Forum';
  const [themes, setThemes] = useState<Themes | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [note, setNote] = useState('');
  const [where, setWhere] = useState<Where | null>(null), [banner, setBanner] = useState<Look['banner'] | null>(null);
  const [draft, setDraft] = useState<Theme | null>(null), [base, setBase] = useState<Theme | null>(null), [tab, setTab] = useState<Tab>('themes');
  // The Admin CP only renders in the browser, once the page beside it has loaded.
  const [scheme, setSchemeState] = useState<'light' | 'dark'>(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

  useEffect(() => {
    let live = true;
    forumCall<{ themes: Themes; where: Where; banner?: Look['banner'] | null }>({ action: 'themes', campaign: k })
      .then(v => {
        if (!live) return;
        setThemes(v.themes); setWhere(v.where); setBanner(v.banner ?? null);
        // Opens on the theme members see now, ready to change.
        const current = v.themes.live && v.themes.saved.find(t => t.id === v.themes.live!.id);
        if (current) { setDraft(current); setBase(current); if (current.mode !== 'both') { setScheme(current.mode); setSchemeState(current.mode); } }
      }, e => { if (live) setError(e instanceof Error ? e.message : 'The themes could not be read.'); });
    // Closing puts back the member's own light or dark setting, which Basics may have switched to preview a version.
    return () => { live = false; setScheme(ownScheme()); };
  }, [k]);

  // The part beside the Admin CP shows the theme being edited, as it would look live.
  useEffect(() => {
    if (!draft) { onPreview(null); return; }
    const timer = setTimeout(() => onPreview({ name: draft.name, css: (host === 'forum' ? themeCss(draft) : themeCss(draft, SKIN_SCOPE, host)).css, fonts: themeFontsUrl(draft), banner: draft.banner }), 120);
    return () => clearTimeout(timer);
  }, [draft, onPreview, host]);
  useEffect(() => () => onPreview(null), [onPreview]);

  const dirty = !!draft && !sameTheme(draft, base);
  const edit = (t: Theme, saved: boolean, to?: Tab) => {
    setDraft(t); setBase(saved ? t : null); setNote('');
    if (to) setTab(to);
    // Show the version members with the current setting would see; a one-version theme shows that version.
    if (t.mode !== 'both') { setScheme(t.mode); setSchemeState(t.mode); }
  };
  const leave = async () => !dirty || await confirmDialog({ title: 'Leave without saving?', message: 'Your changes to this theme haven’t been saved.', confirm: 'Leave without saving', cancel: 'Keep editing' });
  const run = async (body: Record<string, unknown>, after?: (t: Themes) => void) => {
    setBusy(true); setError('');
    try {
      const out = await forumCall<{ themes: Themes }>({ campaign: k, ...body });
      setThemes(out.themes); after?.(out.themes); onSaved(); refreshSkins(); return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); return false; }
    finally { setBusy(false); }
  };
  const save = (live: boolean) => draft && run({ action: 'saveTheme', theme: draft, live }, t => {
    const stored = t.saved.find(x => x.id === draft.id) ?? draft;
    setDraft(stored); setBase(stored); setNote(live ? 'Saved. Members see it now.' : 'Saved. Make it live when it’s ready.');
  });
  const pick = (s: 'light' | 'dark') => { setScheme(s); setSchemeState(s); };

  // Escape closes the Admin CP, and so does a click on the page beside a floating one (each asks first when there are unsaved changes).
  // Not while a dialog is open over it, and not for the buttons that open it.
  const panel = useRef<HTMLElement>(null), closing = useRef({ leave, onClose });
  closing.current = { leave, onClose };
  useEffect(() => {
    const done = async () => { if (await closing.current.leave()) closing.current.onClose(); };
    const overlay = () => !!document.querySelector('dialog[open], [role="dialog"][aria-modal="true"], .modal-backdrop');
    const key = (e: KeyboardEvent) => { if (e.key !== 'Escape' || e.defaultPrevented || overlay()) return; e.preventDefault(); void done(); };
    const down = (e: PointerEvent) => {
      const at = e.target instanceof Element ? e.target : null;
      if (!floating || !at || panel.current?.contains(at) || overlay() || at.closest('[data-opens-admin-cp], [role="dialog"], [role="menu"]')) return;
      void done();
    };
    document.addEventListener('keydown', key); document.addEventListener('pointerdown', down);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', down); };
  }, [floating]);

  // The Admin CP wears the colours of the theme being edited, else the live one: only colours, so it stays usable.
  const shown = draft ?? themes?.live ?? null;
  const colours = useMemo(() => shown ? themeColours(shown, '.admin-cp') : '', [shown]);

  return <aside ref={panel} className={`admin-cp dock-${dock}${floating ? ' floating' : ''}`} aria-label="Campaign theme">
    {colours && <style data-cp-colours="">{colours}</style>}
    <div className="cp-head">
      <Palette size={16} aria-hidden="true" /><b>Campaign theme</b><span className="cp-sub">Admin CP</span>
      <span className="cp-spacer" />
      <span className="cp-seg" role="group" aria-label="Dock the Admin CP">
        <button aria-pressed={dock === 'left'} title="Dock on the left" onClick={() => setDock('left')}><PanelLeft size={15} aria-hidden="true" /><span className="sr-only">Left</span></button>
        <button aria-pressed={dock === 'right'} title="Dock on the right" onClick={() => setDock('right')}><PanelRight size={15} aria-hidden="true" /><span className="sr-only">Right</span></button>
      </span>
      <button className="cp-close" title="Close the Admin CP" onClick={async () => { if (await leave()) onClose(); }}><X size={16} aria-hidden="true" /><span className="sr-only">Close</span></button>
    </div>
    {themes && <ThemePicker themes={themes} draft={draft} saved={!!base}
      pick={async (t, saved) => { if (await leave()) edit(t, saved, tab === 'themes' && !draft ? 'colours' : undefined); }}
      status={!draft ? null : !base ? <span className="cp-tag warn">Not saved yet</span> : dirty ? <span className="cp-tag warn">Unsaved changes</span> : themes.live?.id === draft.id ? <span className="cp-tag live">Live</span> : <span className="cp-tag">Saved</span>} />}
    <nav className="cp-tabs" role="tablist" aria-label="Admin CP">
      <div className="cp-tab-row">{([['themes', 'Theme'], ['colours', 'Colours'], ['basics', 'Basics'], ['banner', 'Banner'], ['help', 'Help']] as const).map(([id, label]) =>
        <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}</div>
      <div className="cp-tab-row parts"><span className="cp-tab-label" aria-hidden="true">Stylesheets</span>{THEME_AREAS.map(a =>
        <button key={a.id} role="tab" aria-selected={tab === a.id} title={`${a.label} stylesheet`} onClick={() => setTab(a.id)}>{a.label}<span className="sr-only"> stylesheet</span>{draft && areaCss(draft, a.id).trim() && <i className="cp-dot" aria-hidden="true" />}</button>)}</div>
    </nav>
    <div className="cp-body">
      {error && <p className="form-error" role="alert">{error}</p>}
      {!themes && !error && <p className="muted">Reading the campaign’s themes…</p>}
      {themes && tab === 'themes' && <ThemesTab themes={themes} draft={draft} saved={!!base} busy={busy}
        edit={async (t, saved) => { if (await leave()) edit(t, saved, 'colours'); }}
        live={id => run({ action: 'liveTheme', id }, () => setNote(id ? 'Members see that theme now.' : 'The campaign is back to the app’s own look.'))}
        remove={async t => { if (await confirmDialog({ title: `Delete ${t.name}?`, message: themes.live?.id === t.id ? 'It stays live until you pick another theme, but you won’t be able to edit it.' : 'This can’t be undone.', confirm: 'Delete', danger: true })) await run({ action: 'deleteTheme', id: t.id }, () => { if (draft?.id === t.id) { setDraft(null); setBase(null); } }); }} />}
      {!draft && themes && (tab === 'colours' || tab === 'basics' || THEME_AREAS.some(a => a.id === tab)) && <div className="cp-pick-first">
        <p>{tab === 'colours' ? 'Colours changes every colour in a theme.' : tab === 'basics' ? 'Basics sets a theme’s name, fonts and corners.' : 'Each stylesheet adds CSS for one part of the campaign.'} Pick a theme from the menu above first.</p>
      </div>}
      {draft && tab === 'colours' && <ColoursTab t={draft} set={setDraft} scheme={scheme} pick={pick} beside={hostLabel} saved={base} />}
      {draft && tab === 'basics' && <BasicsTab t={draft} set={setDraft} pick={pick} />}
      {draft && THEME_AREAS.some(a => a.id === tab) && <CssTab key={tab} t={draft} set={setDraft} area={tab as ThemeArea} beside={tab === host} href={tab === host ? null : previewHref(k, where, tab as ThemeArea)} />}
      {themes && tab === 'banner' && <BannerTab k={k} banner={banner ?? null} setBanner={setBanner} owner={!!where?.owner} onSaved={onSaved} />}
      {tab === 'help' && <HelpTab beside={hostLabel} />}
      {note && <p className="cp-note" role="status"><Check size={14} aria-hidden="true" /> {note}</p>}
    </div>
    {draft && <div className="cp-foot">
      <button className="f-btn ghost small" disabled={busy} onClick={async () => { if (await leave()) { setDraft(null); setBase(null); setTab('themes'); } }}>{dirty ? 'Discard' : 'Done'}</button>
      <span className="cp-spacer" />
      <button className="f-btn ghost small" disabled={busy || !draft.name.trim()} onClick={() => void save(false)}>Save theme</button>
      <button className="f-btn small" disabled={busy || !draft.name.trim()} onClick={() => void save(true)}>{busy ? 'Saving…' : 'Save and make live'}</button>
    </div>}
  </aside>;
}

/**
 * The menu along the top of the Admin CP: the theme being changed. The campaign's saved themes, then every skin to
 * start from. Picking a skin makes this campaign's own copy of it (saved only when you save), and the page beside the
 * Admin CP shows it at once, so trying skins on is one pick each.
 */
function ThemePicker({ themes, draft, saved, pick, status }: {
  themes: Themes; draft: Theme | null; saved: boolean; pick: (t: Theme, saved: boolean) => void; status: ReactNode;
}) {
  const full = themes.saved.length >= THEME_LIMITS.saved;
  const value = !draft ? '' : saved ? `saved:${draft.id}` : 'draft';
  const choose = (v: string) => {
    if (v.startsWith('saved:')) { const t = themes.saved.find(x => `saved:${x.id}` === v); if (t) pick(t, true); }
    else if (v.startsWith('preset:')) { const p = THEME_PRESETS.find(x => `preset:${x.id}` === v); if (p) pick({ ...p, id: newId(), from: p.id }, false); }
  };
  return <div className="cp-picker">
    <label className="cp-pick">
      <span>Theme</span>
      <select value={value} onChange={e => choose(e.target.value)} aria-label="Theme to change">
        {!draft && <option value="" disabled>Pick a theme…</option>}
        {draft && !saved && <option value="draft">{draft.name || 'New theme'} (new)</option>}
        {themes.saved.length > 0 && <optgroup label={`Saved in this campaign (${themes.saved.length} of ${THEME_LIMITS.saved})`}>
          {themes.saved.map(t => <option key={t.id} value={`saved:${t.id}`}>{t.name}{themes.live?.id === t.id ? ' · live' : ''}</option>)}
        </optgroup>}
        <optgroup label={full ? 'Start from a skin (delete a saved theme first)' : `Start from a skin (${THEME_PRESETS.length})`}>
          {THEME_PRESETS.map(p => <option key={p.id} value={`preset:${p.id}`} disabled={full}>{p.name}{PRESET_NOTES[p.id] ? ` · ${PRESET_NOTES[p.id]}` : ''}</option>)}
        </optgroup>
      </select>
    </label>
    {status}
  </div>;
}

function ThemesTab({ themes, draft, saved, busy, edit, live, remove }: {
  themes: Themes; draft: Theme | null; saved: boolean; busy: boolean;
  edit: (t: Theme, saved: boolean) => void; live: (id: string | null) => void; remove: (t: Theme) => void;
}) {
  const [paste, setPaste] = useState(''), [pasteError, setPasteError] = useState(''), [copied, setCopied] = useState('');
  const full = themes.saved.length >= THEME_LIMITS.saved;
  const copy = async (t: Theme) => { try { await navigator.clipboard.writeText(codeOf(t)); setCopied(t.id); setTimeout(() => setCopied(''), 1800); } catch { setPaste(codeOf(t)); } };
  const fromPaste = () => {
    setPasteError('');
    try {
      const text = paste.trim(), json = text.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
      const { theme, notes } = importTheme(JSON.parse(json), newId());
      edit(theme, false); setPaste('');
      if (notes.length) setPasteError(notes.join(' '));
    } catch (e) { setPasteError(e instanceof ThemeError ? e.message : 'That isn’t theme code. Paste the whole JSON object, from { to }.'); }
  };
  const stored = draft && saved ? themes.saved.find(t => t.id === draft.id) : undefined;
  const isLive = !!stored && themes.live?.id === stored.id, older = isLive && themes.live!.updatedAt !== stored!.updatedAt;
  const from = draft ? presetOf(draft) : undefined;
  return <div className="cp-section">
    <h3>On the campaign now</h3>
    <div className="cp-live">
      {themes.live ? <><b>{themes.live.name}</b><span className="muted small">{modeLabel(themes.live.mode)}</span>
        <button className="f-btn ghost small" disabled={busy} onClick={() => live(null)}>Use the app’s own look</button></>
        : <><b>The app’s own look</b><span className="muted small">No theme: each part looks as it does everywhere else</span></>}
    </div>
    {draft ? <>
      <h3>The theme you’re changing</h3>
      <div className="cp-current">
        <Swatches t={draft} />
        <span className="cp-list-name"><b>{draft.name || 'New theme'}</b><small>{from && PRESET_NOTES[from.id] ? `Inspired by ${PRESET_NOTES[from.id]} · ` : ''}{modeLabel(draft.mode)}</small></span>
        <span className="cp-list-actions">
          {stored && (!isLive || older) && <button className="f-btn small" disabled={busy} onClick={() => live(stored.id)}>{older ? 'Make the saved version live' : 'Make live'}</button>}
          <button className="f-btn ghost small" disabled={full} title={full ? 'Delete a theme first' : undefined} onClick={() => edit({ ...draft, id: newId(), name: `${draft.name} (copy)`.slice(0, THEME_LIMITS.name), updatedAt: undefined }, false)}>Duplicate</button>
          <button className="f-btn ghost small" onClick={() => void copy(draft)}>{copied === draft.id ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />} Copy theme code</button>
          {stored && <button className="f-btn ghost small danger" disabled={busy} onClick={() => remove(stored)}>Delete</button>}
        </span>
        {!stored && <p className="muted small cp-current-note">This is the campaign’s own copy. Change its colours, then press Save at the bottom: members see it once you make it live.</p>}
      </div>
    </> : <p className="muted small">Pick a theme from the menu above: one saved in this campaign, or a skin to start from. A skin becomes this campaign’s own copy, so changing it never changes anyone else’s.</p>}
    <details className="cp-paste">
      <summary>Paste theme code</summary>
      <p className="muted small">Theme code is a theme as JSON: copy it from another campaign’s saved theme, or have Claude write one. It opens here to look over before you save it.</p>
      <textarea className="cp-code" rows={5} value={paste} onChange={e => setPaste(e.target.value)} placeholder='{ "name": "…", "mode": "both", "colors": { … } }' spellCheck={false} />
      <button className="f-btn ghost small" disabled={!paste.trim() || full} onClick={fromPaste}>Open the pasted theme</button>
      {pasteError && <p className="cp-warn small" role="status">{pasteError}</p>}
    </details>
  </div>;
}

const modeLabel = (m: Theme['mode']) => m === 'both' ? 'Light and dark' : m === 'dark' ? 'Dark only' : 'Light only';
function Swatches({ t }: { t: Theme }) {
  const sets = t.mode === 'both' ? [t.colors.light, t.colors.dark] : [t.mode === 'dark' ? t.colors.dark : t.colors.light];
  return <span className="cp-swatches" aria-hidden="true">{sets.map((c, i) => <span key={i} style={{ background: c.bg, borderColor: c.line }}><i style={{ background: c.accent }} /><i style={{ background: c.accent2 }} /><i style={{ background: c.ink }} /></span>)}</span>;
}

/** The light or dark switch over the colours, and the way to add the other version to a one-version theme. */
function VersionSwitch({ t, set, which, pick }: { t: Theme; set: (t: Theme) => void; which: 'light' | 'dark'; pick: (s: 'light' | 'dark') => void }) {
  const other = t.mode === 'dark' ? 'light' : 'dark';
  return t.mode === 'both'
    ? <span className="cp-seg text" role="group" aria-label="Version to change"><button aria-pressed={which === 'light'} onClick={() => pick('light')}>Light version</button><button aria-pressed={which === 'dark'} onClick={() => pick('dark')}>Dark version</button></span>
    : <button className="f-btn ghost small" onClick={() => { set({ ...t, mode: 'both' }); pick(other); }}>Add a {other} version</button>;
}

/** One colour to change: a swatch that opens the colour picker, its name, and a way back to the theme's own. */
function Swatch({ label, value, own, onChange, wide }: { label: string; value: string; own: string | undefined; onChange: (v: string) => void; wide?: boolean }) {
  const changed = !!own && own !== value;
  return <div className={`cp-swatch${changed ? ' changed' : ''}${wide ? ' wide' : ''}`}>
    <label title={`${label}: ${value}${changed ? ` (the theme’s own is ${own})` : ''}`}>
      <input type="color" value={value} onChange={e => onChange(e.target.value.toLowerCase())} />
      <span className="cp-swatch-name">{label}</span>
    </label>
    {changed && <button type="button" className="cp-reset" title={`Back to the theme’s own, ${own}`} onClick={() => onChange(own!)}><RotateCcw size={11} aria-hidden="true" /><span className="sr-only">Reset {label}</span></button>}
  </div>;
}

/**
 * Every colour in the theme. The main eight (Page, Panels, Text, Accent…) are what the whole app reads; below them,
 * every colour the theme's stylesheets draw with (its golds, browns and purples, the stops of its gradients, its
 * shadows), for the version being changed. A changed colour can go back on its own, or all of them at once.
 */
function ColoursTab({ t, set, scheme, pick, beside, saved }: { t: Theme; set: (t: Theme) => void; scheme: 'light' | 'dark'; pick: (s: 'light' | 'dark') => void; beside: string; saved: Theme | null }) {
  const which: 'light' | 'dark' = t.mode === 'both' ? scheme : t.mode, colours = t.colors[which];
  // The theme's own colours: the skin it started from, else the theme as it was last saved.
  const own = presetOf(t) ?? saved ?? undefined;
  const sheets = useMemo(() => THEME_AREAS.map(a => areaCss(t, a.id)), [t.css, t.areas]); // eslint-disable-line react-hooks/exhaustive-deps -- only the stylesheets
  const found = useMemo(() => paletteOf(sheets), [sheets]);
  const ownPalette = own?.palette ?? {}, palette = t.palette ?? {};
  const shown = found.colours.filter(c => c.version === 'both' || c.version === which);
  const solid = shown.filter(c => !c.faint), faint = shown.filter(c => c.faint);
  const gradients = found.gradients.filter(g => g.version === 'both' || g.version === which);
  const role = (r: ColourRole, value: string) => set({ ...t, colors: { ...t.colors, [which]: { ...colours, [r]: value.toLowerCase() } } });
  const swap = (from: string, to: string) => {
    const next = { ...palette };
    if (to === from) delete next[from]; else next[from] = to;
    set({ ...t, palette: Object.keys(next).length ? next : undefined });
  };
  const ownOf = (hex: string) => ownPalette[hex] ?? hex, now = (hex: string) => palette[hex] ?? hex;
  const changes = (own ? COLOUR_ROLES.filter(([r]) => (['light', 'dark'] as const).some(v => own.colors[v][r] !== t.colors[v][r])).length : 0)
    + found.colours.filter(c => now(c.hex) !== ownOf(c.hex)).length;
  const reset = async () => {
    if (!own || !await confirmDialog({ title: 'Reset every colour?', message: `Every colour goes back to how ${own.name} has it, in both versions. Fonts, corners and stylesheets stay as they are.`, confirm: 'Reset colours' })) return;
    set({ ...t, colors: own.colors, palette: own.palette });
  };
  // Several colours can share a name (a gradient's stops): they're numbered, Trim, Trim 2, Trim 3.
  const labels = useMemo(() => {
    const seen = new Map<string, number>(), out = new Map<string, string>();
    for (const c of found.colours) {
      if (!c.names.length) { out.set(c.hex, c.hex); continue; }
      const name = colourName(c.names[0]!), n = (seen.get(name) ?? 0) + 1;
      seen.set(name, n); out.set(c.hex, n > 1 ? `${name} ${n}` : name);
    }
    return out;
  }, [found]);
  const label = (c: PaletteColour) => labels.get(c.hex) ?? c.hex;
  return <div className="cp-section">
    <div className="cp-row-head">
      <h3>Colours</h3>
      <VersionSwitch t={t} set={set} which={which} pick={pick} />
    </div>
    <p className="muted small">Tap a colour to change it. The {beside} beside this shows the {which} version as you go.</p>
    <h3>Main colours</h3>
    <div className="cp-swatch-grid main">{COLOUR_ROLES.map(([r, name]) => <Swatch key={r} wide label={name} value={colours[r]} own={own?.colors[which][r]} onChange={v => role(r, v)} />)}</div>
    <p className="cp-chips">{contrastChecks(colours).map(c => <span key={c.label} className={`cp-chip${c.ratio < c.need ? ' low' : ''}`} title={`Needs ${c.need} or more`}>{c.label} {(Math.floor(c.ratio * 10) / 10).toFixed(1)}</span>)}</p>
    {gradients.length > 0 && <>
      <h3>Gradients <span className="muted small">{gradients.length}</span></h3>
      <ul className="cp-gradients">{gradients.map(g => <li key={`${g.name}:${g.version}`}>
        <span className="cp-gradient-bar" style={{ background: swapColours(`{a:${g.value}}`, palette).slice(3, -1) }} aria-hidden="true" />
        <span className="cp-gradient-name">{colourName(g.name)}</span>
        <span className="cp-gradient-stops">{g.stops.map(hex => <Swatch key={hex} label={`${colourName(g.name)}, ${hex}`} value={now(hex)} own={ownOf(hex)} onChange={v => swap(hex, v)} />)}</span>
      </li>)}</ul>
    </>}
    {solid.length > 0 && <>
      <h3>The theme’s own colours <span className="muted small">{solid.length}</span></h3>
      <div className="cp-swatch-grid">{solid.map(c => <Swatch key={c.hex} label={label(c)} value={now(c.hex)} own={ownOf(c.hex)} onChange={v => swap(c.hex, v)} />)}</div>
    </>}
    {faint.length > 0 && <details className="cp-faint">
      <summary>Shadows and see-through tints <span className="muted small">{faint.length}</span></summary>
      <div className="cp-swatch-grid">{faint.map(c => <Swatch key={c.hex} label={label(c)} value={now(c.hex)} own={ownOf(c.hex)} onChange={v => swap(c.hex, v)} />)}</div>
    </details>}
    {found.colours.length > 0 && <p className="muted small">A colour changes everywhere the theme uses it, in every part of the campaign. See-through uses stay see-through.</p>}
    <div className="cp-reset-all">
      <button className="f-btn ghost small" disabled={!own || !changes} onClick={() => void reset()}><RotateCcw size={13} aria-hidden="true" /> Reset all colours</button>
      <span className="muted small">{!own ? 'This theme has nothing to go back to yet: save it first.' : changes ? `${changes} ${changes === 1 ? 'colour differs' : 'colours differ'} from ${own.name}` : `Every colour matches ${own.name}`}</span>
    </div>
  </div>;
}

function BasicsTab({ t, set, pick }: { t: Theme; set: (t: Theme) => void; pick: (s: 'light' | 'dark') => void }) {
  const font = (role: keyof Theme['fonts'], id: string) => set({ ...t, fonts: { ...t.fonts, [role]: id as FontId } });
  return <div className="cp-section">
    <label className="f-field">Name<input value={t.name} maxLength={THEME_LIMITS.name} onChange={e => set({ ...t, name: e.target.value })} /></label>
    <label className="f-field">Light and dark<select value={t.mode} onChange={e => { const mode = e.target.value as Theme['mode']; set({ ...t, mode }); if (mode !== 'both') pick(mode); }}>
      <option value="both">Light and dark versions</option><option value="dark">Dark only</option><option value="light">Light only</option>
    </select><small>Each member sees the version that matches their own light or dark setting. A theme with one version shows it to everyone. Colours has each version’s colours.</small></label>
    <h3>Fonts</h3>
    <div className="cp-fonts">{([['display', 'Headings'], ['reading', 'Posts'], ['ui', 'Labels']] as const).map(([role, label]) =>
      <label key={role} className="f-field">{label}<select value={t.fonts[role]} onChange={e => font(role, e.target.value)}>
        {Object.entries(THEME_FONTS).map(([id, f]) => <option key={id} value={id}>{f.label}</option>)}
      </select></label>)}</div>
    <label className="f-field">Corners · {t.radius}px<input type="range" min={0} max={16} value={t.radius} onChange={e => set({ ...t, radius: Number(e.target.value) })} /></label>
    <label className="f-field">Banner without a picture<select value={t.banner} onChange={e => set({ ...t, banner: e.target.value as Theme['banner'] })}>
      <option value="picture">The app’s own header colours</option><option value="plain">The theme’s colours</option>
    </select><small>When the campaign has a banner picture (the Banner tab), it always shows and the theme’s art gives way to it.</small></label>
    <p className="muted small">In a stylesheet, aim a rule at one version with <code>:root[data-theme=&quot;dark&quot;]</code>.</p>
  </div>;
}

/** The class names each part of the campaign is built from, for its stylesheet. */
const CLASSES: Record<ThemeArea, [string, string][]> = {
  forum: [
    ['.board-head, .board-title, .board-tagline, .board-nav', 'The banner, its title and links'],
    ['.board-bar', 'The bar above the banner: date, staff, you'],
    ['.category, .category-title', 'A category and its heading'],
    ['.forum, .forum-location, .forum-ooc, .forum-art', 'A board in the index, location boards and their picture'],
    ['.topic-row', 'A topic in a board'],
    ['.topic-head, .topic-name', 'The top of a topic'],
    ['.post, .post-band, .post-name, .post-side, .post-body', 'A post, its name band, the character side and the text'],
    ['.mini, .mini-card', 'Character hover cards'],
    ['.board-foot', 'The footer: who is online, stats'],
  ],
  encyclopedia: [
    ['.sidebar, .world-picker, .side-section, .tree-row, .tree-item', 'The sidebar: the campaign, its sections and the page tree'],
    ['.topbar, .crumbs, .search-box', 'The bar along the top: where you are, search'],
    ['.main-panel, .page-content', 'The page area'],
    ['.dashboard-intro, .eyebrow, .note-card, .recent-grid', 'The campaign’s overview: heading, recent pages'],
    ['.article-layout, .article-aside, .prose', 'A page, its side facts and its text'],
    ['.button, .icon-button, .text-button', 'Buttons'],
    ['.player-layout', 'The player pages (player links and members)'],
  ],
  maptable: [
    ['.app-header, .header-scene, .header-actions', 'The bar along the top: the scene and its buttons'],
    ['.campaign-dashboard, .dashboard-content, .scene-card', 'The Scene Picker and its scenes'],
    ['.rail', 'The tool rail down the left'],
    ['.map-topbar, .map-title, .toolbar', 'The bar above the map and the map tools'],
    ['.side-panel, .panel-title, .panel-content', 'The side panel: tokens, scenes, settings'],
    ['.map-workspace', 'Around the map (the map itself keeps its own colours)'],
  ],
  dashboard: [
    ['.hub-crumbs, .hub-head, .hub-title, .hub-actions', 'The top: the campaign’s name and its buttons'],
    ['.hub-head.has-picture', 'The header when the campaign has a banner picture (the theme’s drawn art gives way to it)'],
    ['.hub-tabs', 'Dashboard, Front page and Members'],
    ['.hub-grid, .hub-card', 'The dashboard’s cards'],
    ['.hub-button, .hub-button-primary', 'Buttons'],
  ],
};
function CssTab({ t, set, area, beside, href }: { t: Theme; set: (t: Theme) => void; area: ThemeArea; beside: boolean; href: string | null }) {
  const css = areaCss(t, area), checked = useMemo(() => cleanCss(css), [css]);
  const label = THEME_AREAS.find(a => a.id === area)!.label, total = cssSize(t);
  const write = (value: string) => set(area === 'forum' ? { ...t, css: value } : { ...t, areas: { ...t.areas, [area]: value } });
  return <div className="cp-section">
    {area === 'forum'
      ? <p className="muted small">The forum’s stylesheet. It applies to the campaign’s part of the page: never the app bar or this Admin CP. Use the theme’s colours through variables (<code>var(--accent)</code>) so both versions work.</p>
      : <p className="muted small">The {label}’s stylesheet. Colours, fonts and corners from Basics already apply there; this is for the rest. Use the theme’s colours through variables (<code>var(--accent)</code>) so both versions work.</p>}
    {beside ? <p className="muted small">The {label} beside this shows it as you type.</p>
      : area === 'forum' ? <>
        {href && <a className="f-btn ghost small cp-preview" href={href} target="_blank" rel="noopener">Open the forum<span className="sr-only"> (opens a new tab)</span></a>}
        <p className="muted small">The forum shows this stylesheet once the theme is live. To see it as you type, open the Admin CP from the forum’s settings.</p></>
      : <>{href ? <a className="f-btn ghost small cp-preview" href={href} target="_blank" rel="noopener" onClick={() => leavePreview(t)}>Preview in the {label}<span className="sr-only"> (opens a new tab)</span></a>
          : <p className="muted small">{area === 'maptable' ? 'This campaign has no Maptable campaign paired with it, so there’s nothing to preview yet.' : 'Only the GM can preview the dashboard.'}</p>}
        {href && <p className="muted small">The preview opens in a new tab and shows this theme as it is now, saved or not. Only you see it.</p>}</>}
    <textarea className="cp-code tall" value={css} maxLength={THEME_LIMITS.css} onChange={e => write(e.target.value)} spellCheck={false} aria-label={`${label} stylesheet`} placeholder={area === 'forum' ? '.post-name {\n  color: var(--accent-2);\n}' : area === 'encyclopedia' ? '.topbar {\n  border-bottom: 2px solid var(--accent);\n}' : area === 'maptable' ? '.app-header {\n  border-bottom: 2px solid var(--accent);\n}' : '.hub-card {\n  border-top: 2px solid var(--accent);\n}'} />
    <p className={`small ${total > THEME_LIMITS.allCss ? 'cp-warn' : 'muted'}`}>{checked.rules} {checked.rules === 1 ? 'rule' : 'rules'} in use · {(css.length / 1000).toFixed(1)} of {THEME_LIMITS.css / 1000} KB · all parts {(total / 1000).toFixed(1)} of {THEME_LIMITS.allCss / 1000} KB</p>
    {checked.problems.length > 0 && <div className="cp-problems" role="status"><b>Left out or changed by the safety checks</b>
      <ul>{checked.problems.map((p, i) => <li key={i}><span>Line {p.line}</span>{p.message}</li>)}</ul></div>}
    <h3>Class names</h3>
    <dl className="cp-ref">{CLASSES[area].map(([c, what]) => <div key={c}><dt><code>{c}</code></dt><dd>{what}</dd></div>)}</dl>
  </div>;
}

function HelpTab({ beside }: { beside: string }) {
  return <div className="cp-section cp-help">
    <h3>How themes work</h3>
    <p>Pick a theme from the menu at the top: one saved in this campaign, or a skin to start from. Colours changes any colour in it, including the ones its art and gradients are drawn with, and Reset puts the theme’s own colours back.</p>
    <p>A theme is colours, fonts, corners, the banner and stylesheets. Save as many as {THEME_LIMITS.saved}; one is live, and members see it across the campaign: the forum, the Wiki, Maptable and the campaign’s dashboard. Saving a theme that’s live doesn’t change what members see until you press Save and make live.</p>
    <h3>A stylesheet for each part</h3>
    <p>Colours, fonts and corners apply everywhere. Each part is built differently, so each has its own stylesheet tab with its class names. The {beside} beside this shows its own as you type; Preview opens the others in a new tab with the theme you’re editing.</p>
    <h3>Open it from anywhere</h3>
    <p>This Admin CP opens from every part of the campaign: Forum settings, the Wiki’s Look, the palette button in Maptable’s header and Theme on the campaign’s dashboard. A campaign doesn’t need a forum to have a theme.</p>
    <h3>Variables</h3>
    <p><code>--bg --panel --raised --line --line-strong --ink --muted --accent --accent-2 --on-accent --accent-soft --font-display --font-reading --font-sans --radius</code></p>
    <h3>What the safety checks do</h3>
    <ul>
      <li>Every rule is kept inside the campaign’s part of the page; <code>:root</code>, <code>html</code> and <code>body</code> mean that part. On Maptable the map itself keeps its own colours.</li>
      <li>Nothing loads from another site: <code>url()</code>, <code>@import</code> and <code>@font-face</code> are left out. Fonts come from the list in Basics.</li>
      <li><code>position: fixed</code> becomes absolute, and selectors starting with <code>+</code> or <code>~</code> are left out, so a theme can’t cover or restyle the app’s own controls.</li>
      <li>Nested rules, backslash escapes and <code>&lt;</code> are left out. Animations keep working under their own names.</li>
    </ul>
  </div>;
}
