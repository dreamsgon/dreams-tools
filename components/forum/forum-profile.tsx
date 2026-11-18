'use client';
/*
 * Writing extras about the people behind the characters: the GM's hover card design and player strip (Forum
 * settings), the strip under posts written as a character, and each member's forum profile with their post styles.
 */
import { useState } from 'react';
import { ArrowDown, ArrowUp, IdCard, Plus, Rows3, Trash2, UserRound } from 'lucide-react';
import type { CARD_STYLES as CardStyles, STRIP_FIELDS as StripFields, CardDesign, ForumProfile, Strip } from '@/lib/forum/model';
import { forumCall, type CardRow, type Frame, type PageData, type StripItem } from './forum-api';
import { Crumbs, Portrait, PostText, type Go } from './forum-parts';
import { fillStyle } from '@/lib/forum/markup';

type Settings = Extract<PageData, { kind: 'settings' }>;
type ProfilePage = Extract<PageData, { kind: 'profile' }>;
type Done = () => Promise<void>;
type Style = (typeof CardStyles)[number];
/* The same lists as lib/forum/model.ts, which stays out of the browser bundle. */
const CARD_STYLES: readonly Style[] = ['title', 'sub', 'rule', 'chips', 'box', 'pair', 'quote'];
const STRIP_FIELDS: readonly (typeof StripFields)[number][] = ['pronouns', 'timezone', 'activity', 'mature', 'nogoes'];

export const STYLE_NAMES: Record<Style, string> = { title: 'Big title', sub: 'Small caps line', rule: 'Ruled line', chips: 'Chips', box: 'Labelled box', pair: 'Two boxes', quote: 'Quote' };
/** How many fields a new row of each style starts with. */
const STARTS: Record<Style, number> = { title: 1, sub: 1, rule: 1, chips: 2, box: 1, pair: 2, quote: 1 };

/** A designed card's rows (lib/forum/view.ts `cardRows`). Rows with a GM-only field get a dashed edge. */
export function CardRows({ rows }: { rows: CardRow[] }) {
  return <div className="card-rows">{rows.map((r, i) => {
    const gm = r.gm ? ' r-gm' : '', first = r.items[0]!, joined = r.items.map(x => x.value).join(' · ');
    const tip = r.gm ? 'Only the GM sees this row' : undefined;
    switch (r.style) {
      case 'title': return <p key={i} className={`r-title${gm}`} title={tip}>{joined}</p>;
      case 'sub': return <p key={i} className={`r-sub${gm}`} title={tip}>{joined}</p>;
      case 'rule': return <p key={i} className={`r-rule${gm}`} title={tip}>{joined}</p>;
      case 'chips': return <p key={i} className={`r-chips${gm}`} title={tip}>{r.items.map((x, n) => <span key={n}>{x.value}</span>)}</p>;
      case 'quote': return <p key={i} className={`r-quote${gm}`} title={tip}>“{first.value}”</p>;
      case 'pair': return <div key={i} className={`r-pair${gm}`} title={tip}>{r.items.map((x, n) => <div key={n}><small>{x.label}</small><span>{x.value}</span></div>)}</div>;
      default: return <div key={i} className={`r-boxes${gm}`} title={tip}>{r.items.map((x, n) => <div key={n} className="r-box"><small>{x.label}</small><span>{x.value}</span></div>)}</div>;
    }
  })}</div>;
}

/** The rows a design makes for the sample character, worked out here so the preview follows each change. */
function previewRows(rows: CardDesign['rows'], values: Record<string, { label: string; value: string; gm: boolean }>): CardRow[] {
  return rows.flatMap(r => {
    const got = r.fields.map(f => values[f]).filter((x): x is NonNullable<typeof x> => !!x);
    if (!got.length) return [];
    const items = got.flatMap(x => x.value.includes('\u0000') ? x.value.split('\u0000').map(v => ({ label: x.label, value: v })) : [{ label: x.label, value: x.value }]);
    return [{ style: r.style, items, gm: got.some(x => x.gm) }];
  });
}

function useSave(k: string, done: Done) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false);
  const call = async (body: Record<string, unknown>) => {
    setBusy(true); setError(''); setSaved(false);
    try { await forumCall({ campaign: k, ...body }); await done(); setSaved(true); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); return false; }
    finally { setBusy(false); }
  };
  return { call, error, busy, saved };
}

/** Forum settings › Hover card: rows top to bottom, each a style and the fields it shows, with a live preview. */
export function CardDesigner({ page, k, done }: { page: Settings; k: string; done: Done }) {
  const fields = page.card.fields, [rows, setRows] = useState<CardDesign['rows']>(page.card.rows), { call, error, busy, saved } = useSave(k, done);
  const first = fields.find(f => f.id !== 'role' && f.id !== 'traits')?.id ?? 'role';
  const set = (i: number, patch: Partial<CardDesign['rows'][number]>) => setRows(rows.map((r, n) => n === i ? { ...r, ...patch } : r));
  const move = (i: number, by: -1 | 1) => { const next = [...rows], j = i + by; if (j < 0 || j >= next.length) return; [next[i], next[j]] = [next[j]!, next[i]!]; setRows(next); };
  const add = (style: Style) => setRows([...rows, { style, fields: Array.from({ length: STARTS[style] }, (_, n) => style === 'chips' && n === 0 ? 'traits' : fields[n]?.id ?? first) }]);
  const known = new Set(fields.map(f => f.id)), sample = page.card.sample;
  const select = (value: string, onChange: (v: string) => void, label: string) => <select aria-label={label} value={value} onChange={e => onChange(e.target.value)}>
    {!known.has(value) && <option value={value}>{value.replace(/^(stat|fact):/, '')} (gone)</option>}
    {fields.map(f => <option key={f.id} value={f.id}>{f.label} · {f.from}</option>)}
  </select>;
  return <section className="settings-card card-designer">
    <h2><IdCard size={15} aria-hidden="true" /> Hover card</h2>
    <p className="muted">The card that fades in over a character’s portrait in posts. Each row is one line of it, top to bottom: pick a style and the fields it shows. Fields come from the campaign’s stats and the Profile facts its characters use. With no rows, the card lists everything players may read.</p>
    {rows.length > 0 && <ol className="design-rows">{rows.map((r, i) => <li key={i}>
      <select aria-label={`Row ${i + 1} style`} value={r.style} onChange={e => { const style = e.target.value as Style; set(i, { style, fields: r.fields.length >= STARTS[style] ? r.fields : [...r.fields, first] }); }}>
        {CARD_STYLES.map(s => <option key={s} value={s}>{STYLE_NAMES[s]}</option>)}
      </select>
      <span className="design-fields">
        {r.fields.map((f, j) => <span key={j} className="design-field">{select(f, v => set(i, { fields: r.fields.map((x, n) => n === j ? v : x) }), `Row ${i + 1} field ${j + 1}`)}
          {r.fields.length > 1 && <button type="button" className="icon-btn" aria-label={`Take field ${j + 1} off row ${i + 1}`} onClick={() => set(i, { fields: r.fields.filter((_, n) => n !== j) })}><Trash2 size={12} aria-hidden="true" /></button>}</span>)}
        {r.fields.length < 4 && <button type="button" className="f-btn ghost small" onClick={() => set(i, { fields: [...r.fields, first] })}><Plus size={12} aria-hidden="true" />Field</button>}
      </span>
      <span className="mini-btns">
        <button type="button" className="icon-btn" aria-label={`Move row ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={13} aria-hidden="true" /></button>
        <button type="button" className="icon-btn" aria-label={`Move row ${i + 1} down`} disabled={i === rows.length - 1} onClick={() => move(i, 1)}><ArrowDown size={13} aria-hidden="true" /></button>
        <button type="button" className="icon-btn" aria-label={`Remove row ${i + 1}`} onClick={() => setRows(rows.filter((_, n) => n !== i))}><Trash2 size={13} aria-hidden="true" /></button>
      </span>
    </li>)}</ol>}
    {rows.length < 12 && <div className="add-rows"><span className="muted small"><Rows3 size={13} aria-hidden="true" /> Add a row:</span>{CARD_STYLES.map(s => <button key={s} type="button" className="f-btn ghost small" onClick={() => add(s)}>{STYLE_NAMES[s]}</button>)}</div>}
    <p className="muted small">Players only get rows whose fields they may read: shared stats and facts. A row holding a GM-only field is left off for them, and the GM sees it with a dashed edge. Fields left empty on a character are skipped.</p>
    {sample && <div className="design-preview">
      <span className="muted small">Preview with {sample.name}</span>
      <div className="mini-portrait preview-card">
        <Portrait k={k} picture={sample.picture} name={sample.name} className="portrait big" />
        <div className="mini-card shown">
          <p className="mini-name">{sample.name}</p>
          {rows.length ? (() => { const made = previewRows(rows, sample.values); return made.length ? <CardRows rows={made} /> : <p className="mini-quote">None of these fields are filled in on {sample.name}.</p>; })() : <p className="mini-quote">The card as it is now: their role, traits and everything players may read.</p>}
        </div>
      </div>
    </div>}
    <div className="settings-foot">{rows.length > 0 && <button type="button" className="f-btn ghost" onClick={() => setRows([])}>Clear the design</button>}<button className="f-btn" disabled={busy} onClick={() => void call({ action: 'cardDesign', card: { rows } })}>{busy ? 'Saving…' : 'Save the card'}</button></div>
    {saved && !error && <p className="muted small" role="status">Saved. Cards in posts use it now.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}

const STRIP_NAMES: Record<(typeof STRIP_FIELDS)[number], string> = { pronouns: 'Player pronouns', timezone: 'Timezone', activity: 'Activity', mature: 'Mature threads?', nogoes: 'No-goes' };

/** Forum settings › Player strip: which forum profile answers show under posts written as a character. */
export function StripSettings({ page, k, done }: { page: Settings; k: string; done: Done }) {
  const [strip, setStrip] = useState<Strip>(page.strip), { call, error, busy, saved } = useSave(k, done);
  const on = (f: (typeof STRIP_FIELDS)[number], yes: boolean) => setStrip({ ...strip, fields: STRIP_FIELDS.filter(x => x === f ? yes : strip.fields.includes(x)) });
  const hide = (f: (typeof STRIP_FIELDS)[number], yes: boolean) => setStrip({ ...strip, hidden: yes ? [...strip.hidden.filter(x => x !== f), f] : strip.hidden.filter(x => x !== f) });
  return <section className="settings-card strip-settings">
    <h2><UserRound size={15} aria-hidden="true" /> Player strip</h2>
    <p className="muted">A strip under every post written as a character, about the player rather than the character. Members fill it in once on their forum profile (their name in the top bar). An answer set to Hidden until hovered stays covered until someone points at it or taps it.</p>
    <ul className="strip-rows">{STRIP_FIELDS.map(f => <li key={f}>
      <label className="f-check"><input type="checkbox" checked={strip.fields.includes(f)} onChange={e => on(f, e.target.checked)} /><span>{STRIP_NAMES[f]}</span></label>
      <select aria-label={`${STRIP_NAMES[f]}: when it shows`} disabled={!strip.fields.includes(f)} value={strip.hidden.includes(f) ? 'hidden' : 'shown'} onChange={e => hide(f, e.target.value === 'hidden')}>
        <option value="shown">Always shown</option><option value="hidden">Hidden until hovered</option>
      </select>
    </li>)}</ul>
    <div className="settings-foot"><button className="f-btn" disabled={busy} onClick={() => void call({ action: 'strip', strip })}>{busy ? 'Saving…' : 'Save the strip'}</button></div>
    {saved && !error && <p className="muted small" role="status">Saved.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}

/** One answer covered until hovered, focused or tapped. */
function Reveal({ label, value }: { label: string; value: string }) {
  const [shown, setShown] = useState(false);
  return <button type="button" className={`reveal${shown ? ' shown' : ''}`} aria-expanded={shown} aria-label={shown ? undefined : `${label}: show`} onClick={() => setShown(s => !s)}>
    <span className="cover" aria-hidden="true">Hover to show</span><span className="secret" aria-hidden={!shown}>{value}</span>
  </button>;
}

/** The strip under a post written as a character: the player's forum profile answers. */
export function PlayerStrip({ items }: { items: StripItem[] }) {
  if (!items.length) return null;
  return <dl className="player-strip" aria-label="About the player">{items.map(x => <div key={x.field}><dt>{x.label}</dt><dd>{x.hidden ? <Reveal label={x.label} value={x.value} /> : x.value}</dd></div>)}</dl>;
}

type PostStyle = NonNullable<ForumProfile['styles']>[number];

const SAMPLE = 'Seren didn’t turn around. “You’re late,” she said.';
const STARTER = '[quote]\n{text}\n[/quote]';

/** Your forum profile: answers for the player strip, and your saved post styles. */
export function ProfileView({ frame, page, k, go, done }: { frame: Frame; page: ProfilePage; k: string; go: Go; done: Done }) {
  const [p, setP] = useState<ForumProfile>(page.profile), { call, error, busy, saved } = useSave(k, done);
  const styles = p.styles ?? [], setStyles = (list: PostStyle[]) => setP({ ...p, styles: list });
  const shows = page.strip;
  const note = (f: (typeof STRIP_FIELDS)[number]) => { const s = shows.find(x => x.field === f); return !s ? 'Not shown under posts in this forum' : s.hidden ? 'Covered under posts until someone hovers or taps it' : 'Shown under your posts as a character'; };
  const text = (f: 'pronouns' | 'timezone' | 'activity', label: string, max: number, hint: string) => <label className="f-field">{label}<input value={p[f] ?? ''} maxLength={max} placeholder={hint} onChange={e => setP({ ...p, [f]: e.target.value })} /><small>{note(f)}</small></label>;
  const noSlot = styles.some(s => !s.body.includes('{text}'));
  return <>
    <Crumbs frame={frame} k={k} go={go} last="Your forum profile" />
    <div className="profile-page">
      <section className="settings-card">
        <h2><UserRound size={15} aria-hidden="true" /> About you, the player</h2>
        <p className="muted">These are about you, not your characters, and only for this forum. Everyone who reads it can see what the GM shows under posts. Leave anything blank to keep it to yourself.</p>
        {text('pronouns', 'Your pronouns', 40, 'she/her, they/them…')}
        {text('timezone', 'Timezone', 60, 'New York (GMT−5)')}
        {text('activity', 'Activity', 120, 'Posts every 2–3 days')}
        <label className="f-field">Mature threads?<select value={p.mature ?? ''} onChange={e => setP({ ...p, mature: (e.target.value || undefined) as ForumProfile['mature'] })}>
          <option value="">Not saying</option><option value="yes">Yes</option><option value="ask">Ask first</option><option value="no">No</option>
        </select><small>{note('mature')}</small></label>
        <label className="f-field">No-goes<textarea rows={3} value={p.nogoes ?? ''} maxLength={400} placeholder="Themes you’d rather not write, like spiders or harm to animals" onChange={e => setP({ ...p, nogoes: e.target.value })} /><small>{note('nogoes')}</small></label>
      </section>
      <section className="settings-card post-styles">
        <h2>Your post styles</h2>
        <p className="muted">Layouts you use again and again, like a coloured box or a header with your character’s name. Write <code>{'{text}'}</code> where your words go; in a post, Insert › My post styles wraps what you’ve written in it. BBCode and Markdown work, and HTML too on boards where the GM lets your group use it: put <code>{'{text}'}</code> inside the HTML, as in <code>{'[html]<div style="…">{text}</div>[/html]'}</code>, and your words go in as plain text.</p>
        {styles.map((s, i) => <div key={s.id} className="style-row">
          <div className="style-head">
            <input aria-label={`Post style ${i + 1} name`} placeholder="Name" value={s.name} maxLength={40} onChange={e => setStyles(styles.map(x => x.id === s.id ? { ...x, name: e.target.value } : x))} />
            <button type="button" className="f-btn ghost small" aria-label={`Remove ${s.name || 'this style'}`} onClick={() => setStyles(styles.filter(x => x.id !== s.id))}><Trash2 size={13} aria-hidden="true" />Remove</button>
          </div>
          <textarea aria-label={`Post style ${i + 1}`} rows={5} value={s.body} maxLength={2000} spellCheck={false} onChange={e => setStyles(styles.map(x => x.id === s.id ? { ...x, body: e.target.value } : x))} />
          <div className="style-preview"><span className="muted small">Preview</span><PostText text={fillStyle(s.body, SAMPLE).text} /></div>
        </div>)}
        {styles.length < 4 && <button type="button" className="f-btn ghost small" onClick={() => setStyles([...styles, { id: 's' + Date.now().toString(36), name: styles.length ? '' : 'Quoted', body: STARTER }])}><Plus size={13} aria-hidden="true" />Add a post style</button>}
        {noSlot && <p className="muted small">A style without <code>{'{text}'}</code> goes in before what you’ve written.</p>}
      </section>
      <div className="settings-foot profile-foot">
        <button className="f-btn" disabled={busy || styles.some(s => !s.name.trim())} onClick={() => void call({ action: 'profile', profile: { ...p, styles: styles.map(s => ({ ...s, name: s.name.trim() })) } })}>{busy ? 'Saving…' : 'Save your profile'}</button>
        {saved && !error && <span className="muted small" role="status">Saved.</span>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </div>
  </>;
}
