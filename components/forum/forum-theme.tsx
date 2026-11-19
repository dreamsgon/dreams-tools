'use client';
/*
 * The Admin CP: the campaign's themes, docked left or right of the real forum, which shows every change as you make
 * it. Themes (saved ones, starting points, pasting theme code), Basics (colours for a light and a dark version,
 * fonts, corners, banner), Stylesheet (with the safety checks' notes by line) and Help. For those who may arrange the
 * forum. Nothing reaches members until a theme is saved and made live.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, PanelLeft, PanelRight, Palette, X } from 'lucide-react';
import { COLOUR_ROLES, THEME_FONTS, THEME_LIMITS, THEME_PRESETS, ThemeError, contrastChecks, importTheme, themeCss, themeFontsUrl, type ColourRole, type FontId, type Theme } from '@/lib/campaign-theme/model';
import { cleanCss } from '@/lib/campaign-theme/css';
import { resolveTheme, parseThemeMode, THEME_STORAGE_KEY } from '@/lib/appearance';
import { confirmDialog } from '../confirm-dialog';
import { forumCall, type PageData } from './forum-api';

type Themes = { live: Theme | null; saved: Theme[] };
export type Preview = { css: string; fonts: string; banner: Theme['banner'] } | null;
type Tab = 'themes' | 'basics' | 'css' | 'help';

const OPEN_EVENT = 'forum:open-cp';
/** Opens the Admin CP from anywhere in the forum (Forum settings has the button). */
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
const codeOf = (t: Theme) => JSON.stringify({ name: t.name, mode: t.mode, radius: t.radius, banner: t.banner, fonts: t.fonts, colors: t.colors, css: t.css }, null, 2);

export function AdminCp({ k, dock, setDock, onClose, onPreview, onSaved }: {
  k: string; dock: 'left' | 'right'; setDock: (d: 'left' | 'right') => void; onClose: () => void;
  onPreview: (p: Preview) => void; onSaved: () => void;
}) {
  const [themes, setThemes] = useState<Themes | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [note, setNote] = useState('');
  const [draft, setDraft] = useState<Theme | null>(null), [base, setBase] = useState<Theme | null>(null), [tab, setTab] = useState<Tab>('themes');
  // The Admin CP only renders in the browser, once the forum has loaded.
  const [scheme, setSchemeState] = useState<'light' | 'dark'>(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

  useEffect(() => {
    let live = true;
    forumCall<{ page: PageData }>({ action: 'view', campaign: k, page: { kind: 'themes' } })
      .then(v => { if (live && v.page.kind === 'themes') setThemes({ live: v.page.live, saved: v.page.saved }); }, e => { if (live) setError(e instanceof Error ? e.message : 'The themes could not be read.'); });
    // Closing puts back the member's own light or dark setting, which Basics may have switched to preview a version.
    return () => { live = false; setScheme(ownScheme()); };
  }, [k]);

  // The forum beside the Admin CP shows the theme being edited, as it would look live.
  useEffect(() => {
    if (!draft) { onPreview(null); return; }
    const timer = setTimeout(() => onPreview({ css: themeCss(draft).css, fonts: themeFontsUrl(draft), banner: draft.banner }), 120);
    return () => clearTimeout(timer);
  }, [draft, onPreview]);
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
      setThemes(out.themes); after?.(out.themes); onSaved(); return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); return false; }
    finally { setBusy(false); }
  };
  const save = (live: boolean) => draft && run({ action: 'saveTheme', theme: draft, live }, t => {
    const stored = t.saved.find(x => x.id === draft.id) ?? draft;
    setDraft(stored); setBase(stored); setNote(live ? 'Saved. Members see it now.' : 'Saved. Make it live when it’s ready.');
  });
  const pick = (s: 'light' | 'dark') => { setScheme(s); setSchemeState(s); };

  return <aside className={`admin-cp dock-${dock}`} aria-label="Admin CP">
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
    <nav className="cp-tabs" role="tablist">
      {([['themes', 'Themes'], ['basics', 'Basics'], ['css', 'Stylesheet'], ['help', 'Help']] as const).map(([id, label]) =>
        <button key={id} role="tab" aria-selected={tab === id} disabled={!draft && (id === 'basics' || id === 'css')} onClick={() => setTab(id)}>{label}</button>)}
    </nav>
    <div className="cp-body">
      {error && <p className="form-error" role="alert">{error}</p>}
      {!themes && !error && <p className="muted">Reading the campaign’s themes…</p>}
      {themes && tab === 'themes' && <ThemesTab themes={themes} draft={draft} busy={busy}
        edit={async (t, saved) => { if (await leave()) edit(t, saved); }}
        live={id => run({ action: 'liveTheme', id }, () => setNote(id ? 'Members see that theme now.' : 'The forum is back to its own look.'))}
        remove={async t => { if (await confirmDialog({ title: `Delete ${t.name}?`, message: themes.live?.id === t.id ? 'It stays live until you pick another theme, but you won’t be able to edit it.' : 'This can’t be undone.', confirm: 'Delete', danger: true })) await run({ action: 'deleteTheme', id: t.id }, () => { if (draft?.id === t.id) { setDraft(null); setBase(null); } }); }} />}
      {draft && tab === 'basics' && <BasicsTab t={draft} set={setDraft} scheme={scheme} pick={pick} />}
      {draft && tab === 'css' && <CssTab t={draft} set={setDraft} />}
      {tab === 'help' && <HelpTab />}
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
  return <div className="cp-section">
    <h3>On the campaign now</h3>
    <div className="cp-live">
      {themes.live ? <><b>{themes.live.name}</b><span className="muted small">{modeLabel(themes.live.mode)}</span>
        <button className="f-btn ghost small" disabled={busy} onClick={() => live(null)}>Use the forum’s own look</button></>
        : <><b>The forum’s own look</b><span className="muted small">Parchment and gold, light and dark</span></>}
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
    <h3>Start a new theme from</h3>
    <ul className="cp-list">{THEME_PRESETS.map(p => <li key={p.id}>
      <Swatches t={p} />
      <span className="cp-list-name"><b>{p.name}</b><small>{modeLabel(p.mode)} · {THEME_FONTS[p.fonts.display].label}</small></span>
      <span className="cp-list-actions"><button className="f-btn ghost small" disabled={full} onClick={() => edit({ ...p, id: newId() }, false)}>Start from this</button></span>
    </li>)}</ul>
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

function BasicsTab({ t, set, scheme, pick }: { t: Theme; set: (t: Theme) => void; scheme: 'light' | 'dark'; pick: (s: 'light' | 'dark') => void }) {
  // The colour set being edited follows the version the forum shows.
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
    <p className="muted small">The forum beside this shows the version you’re editing. In the stylesheet, aim a rule at one version with <code>:root[data-theme=&quot;dark&quot;]</code>.</p>
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

const CLASSES = [
  ['.board-head, .board-title, .board-tagline, .board-nav', 'The banner, its title and links'],
  ['.board-bar', 'The bar above the banner: date, staff, you'],
  ['.category, .category-title', 'A category and its heading'],
  ['.forum, .forum-location, .forum-ooc, .forum-art', 'A board in the index, location boards and their picture'],
  ['.topic-row', 'A topic in a board'],
  ['.topic-head, .topic-name', 'The top of a topic'],
  ['.post, .post-band, .post-name, .post-side, .post-body', 'A post, its name band, the character side and the text'],
  ['.mini, .mini-card', 'Character hover cards'],
  ['.board-foot', 'The footer: who is online, stats'],
];
function CssTab({ t, set }: { t: Theme; set: (t: Theme) => void }) {
  const checked = useMemo(() => cleanCss(t.css), [t.css]);
  return <div className="cp-section">
    <p className="muted small">Your CSS applies to the campaign’s part of the page: never the app bar or this Admin CP. Use the theme’s colours through variables (<code>var(--accent)</code>) so both versions work.</p>
    <textarea className="cp-code tall" value={t.css} maxLength={THEME_LIMITS.css} onChange={e => set({ ...t, css: e.target.value })} spellCheck={false} aria-label="Stylesheet" placeholder={'.post-name {\n  color: var(--accent-2);\n}'} />
    <p className="muted small">{checked.rules} {checked.rules === 1 ? 'rule' : 'rules'} in use · {(t.css.length / 1000).toFixed(1)} of {THEME_LIMITS.css / 1000} KB</p>
    {checked.problems.length > 0 && <div className="cp-problems" role="status"><b>Left out or changed by the safety checks</b>
      <ul>{checked.problems.map((p, i) => <li key={i}><span>Line {p.line}</span>{p.message}</li>)}</ul></div>}
    <h3>Class names</h3>
    <dl className="cp-ref">{CLASSES.map(([c, what]) => <div key={c}><dt><code>{c}</code></dt><dd>{what}</dd></div>)}</dl>
  </div>;
}

function HelpTab() {
  return <div className="cp-section cp-help">
    <h3>How themes work</h3>
    <p>A theme is colours, fonts, corners, the banner and a stylesheet. Save as many as {THEME_LIMITS.saved}; one is live, and members see it on every forum page. Saving a theme that’s live doesn’t change what members see until you press Save and make live.</p>
    <h3>Variables</h3>
    <p><code>--bg --panel --raised --line --line-strong --ink --muted --accent --accent-2 --on-accent --accent-soft --font-display --font-reading --font-sans --radius</code></p>
    <h3>What the safety checks do</h3>
    <ul>
      <li>Every rule is kept inside the campaign’s part of the page; <code>:root</code>, <code>html</code> and <code>body</code> mean that part.</li>
      <li>Nothing loads from another site: <code>url()</code>, <code>@import</code> and <code>@font-face</code> are left out. Fonts come from the list in Basics.</li>
      <li><code>position: fixed</code> becomes absolute, and selectors starting with <code>+</code> or <code>~</code> are left out, so a theme can’t cover or restyle the app’s own controls.</li>
      <li>Nested rules, backslash escapes and <code>&lt;</code> are left out. Animations keep working under their own names.</li>
    </ul>
  </div>;
}
