'use client';
/*
 * The Admin CP: the campaign's themes, docked left or right of the part of the campaign it was opened from (`host`),
 * which shows every change as you make it. In the forum it sits beside the page; in the Encyclopedia, Maptable and the
 * dashboard it floats over one side (components/campaign-theme-dock.tsx). Themes (saved ones, starting points,
 * pasting theme code), Basics (colours for a light and a dark version, fonts, corners, banner), a stylesheet tab for
 * each part of the campaign (Forum, Encyclopedia, Maptable, Dashboard, each with the safety checks' notes by line and
 * that part's class names; the other parts open in a new tab to preview) and Help. Themes belong to the campaign, not
 * its forum, so this works before a forum is set up. For those who may arrange the forum: the GM, and the groups the GM
 * lets. Nothing reaches members until a theme is saved and made live.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, PanelLeft, PanelRight, Palette, X } from 'lucide-react';
import { COLOUR_ROLES, PRESET_NOTES, THEME_AREAS, THEME_FONTS, THEME_LIMITS, THEME_PRESETS, ThemeError, areaCss, contrastChecks, cssSize, importTheme, themeColours, themeCss, themeFontsUrl, type ColourRole, type FontId, type Theme, type ThemeArea } from '@/lib/campaign-theme/model';
import { leavePreview, refreshSkins } from '../campaign-skin';
import { SKIN_SCOPE } from '@/lib/campaign-theme/css';
import './admin-cp.css';
import { cleanCss } from '@/lib/campaign-theme/css';
import { resolveTheme, parseThemeMode, THEME_STORAGE_KEY } from '@/lib/appearance';
import { confirmDialog } from '../confirm-dialog';
import { forumCall } from './forum-api';

type Themes = { live: Theme | null; saved: Theme[] };
/** The theme being edited, compiled for the part beside the Admin CP. */
export type Preview = { name: string; css: string; fonts: string; banner: Theme['banner'] } | null;
type Tab = 'themes' | 'basics' | 'help' | ThemeArea;
/** Where the campaign's parts open, for the Preview links: `key` is the campaign's key as the forum's (`c-` or `m-`). */
type Where = { key: string; campaignId: string; maptableId: string | null; owner: boolean };

const OPEN_EVENT = 'forum:open-cp';
/** Opens the Admin CP from anywhere on the page: Forum settings, the Encyclopedia's Look, Maptable's header, the dashboard. */
export const openAdminCp = () => window.dispatchEvent(new Event(OPEN_EVENT));
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
const codeOf = (t: Theme) => JSON.stringify({ name: t.name, mode: t.mode, radius: t.radius, banner: t.banner, fonts: t.fonts, colors: t.colors, css: t.css, ...(t.areas && Object.values(t.areas).some(Boolean) ? { areas: t.areas } : {}) }, null, 2);
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
  const [where, setWhere] = useState<Where | null>(null);
  const [draft, setDraft] = useState<Theme | null>(null), [base, setBase] = useState<Theme | null>(null), [tab, setTab] = useState<Tab>('themes');
  // The Admin CP only renders in the browser, once the page beside it has loaded.
  const [scheme, setSchemeState] = useState<'light' | 'dark'>(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

  useEffect(() => {
    let live = true;
    forumCall<{ themes: Themes; where: Where }>({ action: 'themes', campaign: k })
      .then(v => { if (live) { setThemes(v.themes); setWhere(v.where); } }, e => { if (live) setError(e instanceof Error ? e.message : 'The themes could not be read.'); });
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
  const edit = (t: Theme, saved: boolean) => {
    setDraft(t); setBase(saved ? t : null); setTab('basics'); setNote('');
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

  // The Admin CP wears the colours of the theme being edited, else the live one: only colours, so it stays usable.
  const shown = draft ?? themes?.live ?? null;
  const colours = useMemo(() => shown ? themeColours(shown, '.admin-cp') : '', [shown]);

  return <aside className={`admin-cp dock-${dock}${floating ? ' floating' : ''}`} aria-label="Admin CP">
    {colours && <style data-cp-colours="">{colours}</style>}
    <div className="cp-head">
      <Palette size={16} aria-hidden="true" /><b>Admin CP</b><span className="cp-sub">Campaign theme</span>
      <span className="cp-spacer" />
      <span className="cp-seg" role="group" aria-label="Dock the Admin CP">
        <button aria-pressed={dock === 'left'} title="Dock on the left" onClick={() => setDock('left')}><PanelLeft size={15} aria-hidden="true" /><span className="sr-only">Left</span></button>
        <button aria-pressed={dock === 'right'} title="Dock on the right" onClick={() => setDock('right')}><PanelRight size={15} aria-hidden="true" /><span className="sr-only">Right</span></button>
      </span>
      <button className="cp-close" title="Close the Admin CP" onClick={async () => { if (await leave()) onClose(); }}><X size={16} aria-hidden="true" /><span className="sr-only">Close</span></button>
    </div>
    {draft && <div className="cp-editing">
      <span>Editing <b>{draft.name || 'a new theme'}</b>{themes?.live?.id === draft.id && <span className="cp-tag live">Live</span>}</span>
      {!base ? <span className="cp-tag warn">Not saved yet</span> : dirty ? <span className="cp-tag warn">Unsaved changes</span> : <span className="cp-tag">Saved</span>}
    </div>}
    <nav className="cp-tabs" role="tablist" aria-label="Admin CP">
      <div className="cp-tab-row">{([['themes', 'Themes'], ['basics', 'Basics'], ['help', 'Help']] as const).map(([id, label]) =>
        <button key={id} role="tab" aria-selected={tab === id} disabled={!draft && id === 'basics'} onClick={() => setTab(id)}>{label}</button>)}</div>
      <div className="cp-tab-row parts"><span className="cp-tab-label" aria-hidden="true">Stylesheets</span>{THEME_AREAS.map(a =>
        <button key={a.id} role="tab" aria-selected={tab === a.id} disabled={!draft} title={draft ? `${a.label} stylesheet` : 'Pick a theme to edit first'} onClick={() => setTab(a.id)}>{a.label}<span className="sr-only"> stylesheet</span>{draft && areaCss(draft, a.id).trim() && <i className="cp-dot" aria-hidden="true" />}</button>)}</div>
    </nav>
    <div className="cp-body">
      {error && <p className="form-error" role="alert">{error}</p>}
      {!themes && !error && <p className="muted">Reading the campaign’s themes…</p>}
      {themes && tab === 'themes' && <ThemesTab themes={themes} draft={draft} busy={busy}
        edit={async (t, saved) => { if (await leave()) edit(t, saved); }}
        live={id => run({ action: 'liveTheme', id }, () => setNote(id ? 'Members see that theme now.' : 'The campaign is back to the app’s own look.'))}
        remove={async t => { if (await confirmDialog({ title: `Delete ${t.name}?`, message: themes.live?.id === t.id ? 'It stays live until you pick another theme, but you won’t be able to edit it.' : 'This can’t be undone.', confirm: 'Delete', danger: true })) await run({ action: 'deleteTheme', id: t.id }, () => { if (draft?.id === t.id) { setDraft(null); setBase(null); } }); }} />}
      {draft && tab === 'basics' && <BasicsTab t={draft} set={setDraft} scheme={scheme} pick={pick} beside={hostLabel} />}
      {draft && THEME_AREAS.some(a => a.id === tab) && <CssTab key={tab} t={draft} set={setDraft} area={tab as ThemeArea} beside={tab === host} href={tab === host ? null : previewHref(k, where, tab as ThemeArea)} />}
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

function ThemesTab({ themes, draft, busy, edit, live, remove }: {
  themes: Themes; draft: Theme | null; busy: boolean;
  edit: (t: Theme, saved: boolean) => void; live: (id: string | null) => void; remove: (t: Theme) => void;
}) {
  const [paste, setPaste] = useState(''), [pasteError, setPasteError] = useState(''), [copied, setCopied] = useState('');
  const full = themes.saved.length >= THEME_LIMITS.saved, [find, setFind] = useState('');
  const words = find.toLowerCase().split(/\s+/).filter(Boolean);
  const presets = THEME_PRESETS.filter(p => { const text = `${p.name} ${PRESET_NOTES[p.id] ?? ''} ${THEME_FONTS[p.fonts.display].label}`.toLowerCase(); return words.every(w => text.includes(w)); });
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
  return <div className="cp-section">
    <h3>On the campaign now</h3>
    <div className="cp-live">
      {themes.live ? <><b>{themes.live.name}</b><span className="muted small">{modeLabel(themes.live.mode)}</span>
        <button className="f-btn ghost small" disabled={busy} onClick={() => live(null)}>Use the app’s own look</button></>
        : <><b>The app’s own look</b><span className="muted small">No theme: each part looks as it does everywhere else</span></>}
    </div>
    <h3>Saved themes <span className="muted small">{themes.saved.length} of {THEME_LIMITS.saved}</span></h3>
    {!themes.saved.length && <p className="muted small">None yet. Start one from below, or paste theme code.</p>}
    <ul className="cp-list">{themes.saved.map(t => {
      const isLive = themes.live?.id === t.id, older = isLive && themes.live!.updatedAt !== t.updatedAt;
      return <li key={t.id} className={draft?.id === t.id ? 'editing' : ''}>
        <Swatches t={t} />
        <span className="cp-list-name"><b>{t.name}</b><small>{modeLabel(t.mode)}{isLive && <span className="cp-tag live">{older ? 'Live, older version' : 'Live'}</span>}</small></span>
        <span className="cp-list-actions">
          <button className="f-btn ghost small" onClick={() => edit(t, true)}>Edit</button>
          {(!isLive || older) && <button className="f-btn ghost small" disabled={busy} onClick={() => live(t.id)}>Make live</button>}
          <button className="f-btn ghost small" disabled={full} title={full ? 'Delete a theme first' : undefined} onClick={() => edit({ ...t, id: newId(), name: `${t.name} (copy)`.slice(0, THEME_LIMITS.name), updatedAt: undefined }, false)}>Duplicate</button>
          <button className="f-btn ghost small" title="Copy theme code" onClick={() => void copy(t)}>{copied === t.id ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}<span className="sr-only">Copy theme code</span></button>
          <button className="f-btn ghost small danger" disabled={busy} onClick={() => remove(t)}>Delete</button>
        </span>
      </li>;
    })}</ul>
    <h3>Start a new theme from <span className="muted small">{THEME_PRESETS.length} skins</span></h3>
    <input className="cp-find" type="search" value={find} onChange={e => setFind(e.target.value)} placeholder="Find a skin by its name or what inspired it" aria-label="Find a skin" />
    <ul className="cp-list presets">{presets.map(p => <li key={p.id}>
      <Swatches t={p} />
      <span className="cp-list-name"><b>{p.name}</b><small>{PRESET_NOTES[p.id] ? `Inspired by ${PRESET_NOTES[p.id]}` : `${modeLabel(p.mode)} · ${THEME_FONTS[p.fonts.display].label}`}</small></span>
      <button className="f-btn ghost small" disabled={full} onClick={() => edit({ ...p, id: newId() }, false)}>Start<span className="sr-only"> from {p.name}</span></button>
    </li>)}</ul>
    {!presets.length && <p className="muted small">No skin matches that.</p>}
    <h3>Paste theme code</h3>
    <p className="muted small">Theme code is a theme as JSON: copy it from another campaign’s saved theme, or have Claude write one. It opens here to look over before you save it.</p>
    <textarea className="cp-code" rows={5} value={paste} onChange={e => setPaste(e.target.value)} placeholder='{ "name": "…", "mode": "both", "colors": { … } }' spellCheck={false} />
    <button className="f-btn ghost small" disabled={!paste.trim() || full} onClick={fromPaste}>Open the pasted theme</button>
    {pasteError && <p className="cp-warn small" role="status">{pasteError}</p>}
  </div>;
}

const modeLabel = (m: Theme['mode']) => m === 'both' ? 'Light and dark' : m === 'dark' ? 'Dark only' : 'Light only';
function Swatches({ t }: { t: Theme }) {
  const sets = t.mode === 'both' ? [t.colors.light, t.colors.dark] : [t.mode === 'dark' ? t.colors.dark : t.colors.light];
  return <span className="cp-swatches" aria-hidden="true">{sets.map((c, i) => <span key={i} style={{ background: c.bg, borderColor: c.line }}><i style={{ background: c.accent }} /><i style={{ background: c.accent2 }} /><i style={{ background: c.ink }} /></span>)}</span>;
}

function BasicsTab({ t, set, scheme, pick, beside }: { t: Theme; set: (t: Theme) => void; scheme: 'light' | 'dark'; pick: (s: 'light' | 'dark') => void; beside: string }) {
  // The colour set being edited follows the version the page beside it shows.
  const which: 'light' | 'dark' = t.mode === 'both' ? scheme : t.mode, colours = t.colors[which];
  const colour = (role: ColourRole, value: string) => set({ ...t, colors: { ...t.colors, [which]: { ...colours, [role]: value.toLowerCase() } } });
  const font = (role: keyof Theme['fonts'], id: string) => set({ ...t, fonts: { ...t.fonts, [role]: id as FontId } });
  const other = t.mode === 'dark' ? 'light' : 'dark';
  return <div className="cp-section">
    <label className="f-field">Name<input value={t.name} maxLength={THEME_LIMITS.name} onChange={e => set({ ...t, name: e.target.value })} /></label>
    <label className="f-field">Light and dark<select value={t.mode} onChange={e => { const mode = e.target.value as Theme['mode']; set({ ...t, mode }); if (mode !== 'both') pick(mode); }}>
      <option value="both">Light and dark versions</option><option value="dark">Dark only</option><option value="light">Light only</option>
    </select><small>Each member sees the version that matches their own light or dark setting. A theme with one version shows it to everyone.</small></label>
    <div className="cp-row-head">
      <h3>Colours</h3>
      {t.mode === 'both'
        ? <span className="cp-seg text" role="group" aria-label="Version to edit"><button aria-pressed={which === 'light'} onClick={() => pick('light')}>Light version</button><button aria-pressed={which === 'dark'} onClick={() => pick('dark')}>Dark version</button></span>
        : <button className="f-btn ghost small" onClick={() => { set({ ...t, mode: 'both' }); pick(other); }}>Add a {other} version</button>}
    </div>
    <div className="cp-colours">{COLOUR_ROLES.map(([role, label]) => <label key={role} className="cp-colour">
      <input type="color" value={colours[role]} onChange={e => colour(role, e.target.value)} aria-label={label} />
      <span>{label}</span>
      <input className="cp-hex" value={colours[role]} maxLength={7} aria-label={`${label}, hex`} onChange={e => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) colour(role, e.target.value); }} />
    </label>)}</div>
    <p className="cp-chips">{contrastChecks(colours).map(c => <span key={c.label} className={`cp-chip${c.ratio < c.need ? ' low' : ''}`} title={`Needs ${c.need} or more`}>{c.label} {(Math.floor(c.ratio * 10) / 10).toFixed(1)}</span>)}</p>
    <p className="muted small">The {beside} beside this shows the version you’re editing. In the stylesheet, aim a rule at one version with <code>:root[data-theme=&quot;dark&quot;]</code>.</p>
    <h3>Fonts</h3>
    <div className="cp-fonts">{([['display', 'Headings'], ['reading', 'Posts'], ['ui', 'Labels']] as const).map(([role, label]) =>
      <label key={role} className="f-field">{label}<select value={t.fonts[role]} onChange={e => font(role, e.target.value)}>
        {Object.entries(THEME_FONTS).map(([id, f]) => <option key={id} value={id}>{f.label}</option>)}
      </select></label>)}</div>
    <label className="f-field">Corners · {t.radius}px<input type="range" min={0} max={16} value={t.radius} onChange={e => set({ ...t, radius: Number(e.target.value) })} /></label>
    <label className="f-field">Banner<select value={t.banner} onChange={e => set({ ...t, banner: e.target.value as Theme['banner'] })}>
      <option value="picture">The campaign’s banner picture</option><option value="plain">The theme’s colours, no picture</option>
    </select><small>The picture shows when Forum settings uses it and the campaign has one.</small></label>
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
    ['.hub-banner', 'The campaign’s banner picture, from its look'],
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
    <p>A theme is colours, fonts, corners, the banner and stylesheets. Save as many as {THEME_LIMITS.saved}; one is live, and members see it across the campaign: the forum, the Encyclopedia, Maptable and the campaign’s dashboard. Saving a theme that’s live doesn’t change what members see until you press Save and make live.</p>
    <h3>A stylesheet for each part</h3>
    <p>Colours, fonts and corners apply everywhere. Each part is built differently, so each has its own stylesheet tab with its class names. The {beside} beside this shows its own as you type; Preview opens the others in a new tab with the theme you’re editing.</p>
    <h3>Open it from anywhere</h3>
    <p>This Admin CP opens from every part of the campaign: Forum settings, the Encyclopedia’s Look, the palette button in Maptable’s header and Theme on the campaign’s dashboard. A campaign doesn’t need a forum to have a theme.</p>
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
