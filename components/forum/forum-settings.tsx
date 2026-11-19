'use client';
/* Forum settings, for the GM and groups that may add and arrange boards: the banner, its links, categories and boards, and (the GM) the AI. */
import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Megaphone, Palette, Plus, ShieldCheck, Smile, Sparkles, Tag, Trash2, Upload } from 'lucide-react';
import type { TopicTag } from '@/lib/forum/model';
import { Emoji } from './forum-parts';
import { uploadForumPicture } from './forum-insert';
import { confirmDialog } from '../confirm-dialog';
import { forumCall, type Frame, type Masks, type PageData, type Tri } from './forum-api';
import { Crumbs, type Go } from './forum-parts';
import { CardDesigner, StripSettings } from './forum-profile';
import { openAdminCp } from './forum-theme';

type Settings = Extract<PageData, { kind: 'settings' }>;
type Row = Frame['boards'][number];
type Done = () => Promise<void>;

function useCall(k: string, done: Done) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const call = async (body: Record<string, unknown>) => {
    setBusy(true); setError('');
    try { await forumCall({ campaign: k, ...body }); await done(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); return false; }
    finally { setBusy(false); }
  };
  return { call, error, busy };
}

function BannerSettings({ page, k, done }: { page: Settings; k: string; done: Done }) {
  const [s, setS] = useState(page.settings), { call, error, busy } = useCall(k, done);
  const link = (i: number, patch: Partial<{ label: string; url: string }>) => setS({ ...s, links: s.links.map((l, n) => n === i ? { ...l, ...patch } : l) });
  return <section className="settings-card">
    <h2>Banner, links, notices and writing</h2>
    <label className="f-field">Title<input value={s.title} maxLength={80} placeholder="The campaign’s name" onChange={e => setS({ ...s, title: e.target.value })} /></label>
    <label className="f-field">Tagline<input value={s.tagline} maxLength={160} placeholder="A line under the title" onChange={e => setS({ ...s, tagline: e.target.value })} /></label>
    <label className="f-check"><input type="checkbox" checked={s.banner} onChange={e => setS({ ...s, banner: e.target.checked })} /><span>Use the campaign’s banner picture behind the title <small>(set it in the campaign’s Look in the Encyclopedia)</small></span></label>
    <h3>Links in the banner</h3>
    <p className="muted">Forum, Active topics and Members are always there. Add the Encyclopedia, a Discord server, a rules page…</p>
    {s.links.map((l, i) => <div className="link-row" key={i}>
      <input aria-label="Link name" placeholder="Name" value={l.label} maxLength={40} onChange={e => link(i, { label: e.target.value })} />
      <input aria-label="Link address" placeholder="/encyclopedia or https://…" value={l.url} maxLength={500} onChange={e => link(i, { url: e.target.value })} />
      <button className="f-btn ghost small" aria-label="Remove link" onClick={() => setS({ ...s, links: s.links.filter((_, n) => n !== i) })}><Trash2 size={14} aria-hidden="true" /></button>
    </div>)}
    {s.links.length < 8 && <button className="f-btn ghost small" onClick={() => setS({ ...s, links: [...s.links, { label: '', url: '' }] })}><Plus size={14} aria-hidden="true" />Add a link</button>}
    <h3><Megaphone size={14} aria-hidden="true" /> Notices</h3>
    <p className="muted">Up to three short lines shown under the banner, like “Session on Saturday at 7” or “The Back Room scene closes Friday”. Each reader can hide one; an edited notice shows again.</p>
    {(s.notices ?? []).map((n, i) => <div className="link-row notice-row" key={n.id}>
      <input aria-label={`Notice ${i + 1}`} placeholder="Write the notice" value={n.text} maxLength={240} onChange={e => setS({ ...s, notices: (s.notices ?? []).map(x => x.id === n.id ? { ...x, text: e.target.value } : x) })} />
      <button className="f-btn ghost small" aria-label="Remove notice" onClick={() => setS({ ...s, notices: (s.notices ?? []).filter(x => x.id !== n.id) })}><Trash2 size={14} aria-hidden="true" /></button>
    </div>)}
    {(s.notices ?? []).length < 3 && <button className="f-btn ghost small" onClick={() => setS({ ...s, notices: [...(s.notices ?? []), { id: 'n' + Date.now().toString(36), text: '' }] })}><Plus size={14} aria-hidden="true" />Add a notice</button>}
    <h3>Writing posts</h3>
    <label className="f-field">New posts start in<select value={s.markup ?? 'markdown'} onChange={e => setS({ ...s, markup: e.target.value as 'markdown' | 'bbcode' })}>
      <option value="markdown">Markdown: **bold**, *italic*, &gt; quote</option><option value="bbcode">BBCode: [b]bold[/b], [i]italic[/i], [quote]</option>
    </select><small>Each poster can switch a post to the other in the post box, and their browser remembers it. [dohtml]…[/dohtml] is HTML in either, where a group may use HTML.</small></label>
    <div className="settings-foot"><button className="f-btn" disabled={busy} onClick={() => void call({ action: 'settings', settings: { ...s, notices: (s.notices ?? []).filter(n => n.text.trim()) } })}>{busy ? 'Saving…' : 'Save these settings'}</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}

type BoardType = 'location' | 'campaign' | 'ooc';
const BOARD_TYPES: [BoardType, string][] = [['location', 'Location: tied to a place'], ['campaign', 'Campaign: a story with no single place'], ['ooc', 'Out of character']];
const TYPE_NAME: Record<BoardType, string> = { location: 'Location', campaign: 'Campaign', ooc: 'Out of character' };

function BoardForm({ frame, page, k, done, categoryId, row, onClose }: { frame: Frame; page: Settings; k: string; done: Done; categoryId: string; row?: Row; onClose: () => void }) {
  const cat = frame.categories.find(c => c.id === categoryId)!, tops = frame.boards.filter(b => b.categoryId === categoryId && !b.parentId && b.id !== row?.id);
  const [v, setV] = useState({ name: row?.name ?? '', description: row?.description ?? '', parentId: row?.parentId ?? '', placeId: row?.place?.id ?? '', locked: row?.locked ?? false, type: row?.type ?? (cat.kind === 'ic' ? 'location' : 'ooc') as BoardType, width: row?.width ?? (cat.kind === 'ic' ? 'full' : 'half') as 'full' | 'half' });
  // A board with topics stays in character or out of character, so the other side's kinds are left out.
  const fixed = !!row && row.topics > 0 ? row.kind : null;
  const { call, error, busy } = useCall(k, done);
  const hasSubs = !!row && frame.boards.some(b => b.parentId === row.id);
  const save = async () => { if (await call({ action: row ? 'editBoard' : 'addBoard', ...(row ? { id: row.id } : {}), categoryId, name: v.name, description: v.description, parentId: v.parentId || null, placeId: v.type === 'location' ? v.placeId || null : null, locked: v.locked, type: v.type, width: v.width })) onClose(); };
  return <form className="board-form" onSubmit={e => { e.preventDefault(); void save(); }}>
    <label className="f-field">Name<input value={v.name} maxLength={60} required onChange={e => setV({ ...v, name: e.target.value })} /></label>
    <label className="f-field">Description<input value={v.description} maxLength={300} onChange={e => setV({ ...v, description: e.target.value })} /></label>
    <div className="board-form-row">
      <label className="f-field">Kind of board<select value={v.type} onChange={e => setV({ ...v, type: e.target.value as BoardType, width: row?.width ?? (e.target.value === 'ooc' ? 'half' : 'full') })}>
        {BOARD_TYPES.filter(([t]) => !fixed || (t === 'ooc') === (fixed === 'ooc')).map(([t, label]) => <option key={t} value={t}>{label}</option>)}
      </select></label>
      {!v.parentId && <label className="f-field">Width on the forum page<select value={v.width} onChange={e => setV({ ...v, width: e.target.value as 'full' | 'half' })}>
        <option value="full">Full width</option><option value="half">Half width (side by side)</option>
      </select></label>}
    </div>
    {fixed && <p className="muted small">This board has topics, so it stays {fixed === 'ic' ? 'in character' : 'out of character'}.</p>}
    {v.type === 'location' && <label className="f-field">Place in the Encyclopedia <small>(its picture becomes the board’s art)</small><select value={v.placeId} onChange={e => setV({ ...v, placeId: e.target.value })}><option value="">None</option>{page.places.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
    {!hasSubs && <label className="f-field">Sits inside<select value={v.parentId} onChange={e => setV({ ...v, parentId: e.target.value })}><option value="">Nothing (a board of its own)</option>{tops.map(b => <option key={b.id} value={b.id}>{b.name} (as a subforum)</option>)}</select></label>}
    <label className="f-check"><input type="checkbox" checked={v.locked} onChange={e => setV({ ...v, locked: e.target.checked })} /><span>Only moderators start topics here</span></label>
    <div className="settings-foot"><button type="button" className="f-btn ghost" onClick={onClose}>Cancel</button><button className="f-btn" disabled={busy || !v.name.trim()}>{busy ? 'Saving…' : row ? 'Save board' : 'Add board'}</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </form>;
}

const TRI_LABEL: Record<Tri, string> = { yes: 'Yes', no: 'No', never: 'Never' };
const RIGHTS = [['read', 'Read'], ['start', 'Start topics'], ['reply', 'Reply'], ['html', 'Use HTML']] as const;
/** A board's permission masks: per group, Yes, No or Never here instead of what the group says for the forum. */
function MaskForm({ page, k, done, row, onClose }: { page: Settings; k: string; done: Done; row: Row; onClose: () => void }) {
  const [m, setM] = useState<Masks>(page.masks[row.id] ?? {}), { call, error, busy } = useCall(k, done);
  const parent = row.parentId ? page.masks[row.parentId] : undefined;
  const set = (g: string, r: (typeof RIGHTS)[number][0], v: string) => setM(x => { const cur = { ...x[g] }; if (v) cur[r] = v as Tri; else delete cur[r]; return { ...x, [g]: cur }; });
  return <form className="mask-form" onSubmit={e => { e.preventDefault(); void call({ action: 'masks', id: row.id, masks: m }).then(ok => { if (ok) onClose(); }); }}>
    <p className="muted small">What each group may do on <b>{row.name}</b>{row.parentId ? ' (left as is, a subforum follows its board)' : ' and, unless they say otherwise, its subforums'}. A member can when any of their groups says Yes and none says Never. The GM, and groups that see GM-only things (like Co-GMs), can always. <b>Use HTML</b> lets a group write a [dohtml] part in posts here, with styles; scripts and outside pictures are always taken out.</p>
    <div className="mask-table" role="table" aria-label={`Permissions on ${row.name}`}>
      <div role="row" className="mask-head"><span role="columnheader">Group</span>{RIGHTS.map(([, label]) => <span role="columnheader" key={label}>{label}</span>)}</div>
      {page.groups.filter(g => !g.gm).map(g => <div role="row" key={g.id}>
        <span role="rowheader"><b>{g.name}</b></span>
        {RIGHTS.map(([r, label]) => {
          // HTML has no forum-wide setting: off unless a board turns it on.
          const inherited = parent?.[g.id]?.[r] ?? (r === 'html' ? 'no' : g[r]);
          return <span role="cell" key={r}><select aria-label={`${g.name}: ${label}`} value={m[g.id]?.[r] ?? ''} className={m[g.id]?.[r] ? 'set' : ''} onChange={e => set(g.id, r, e.target.value)}>
            <option value="">As usual ({TRI_LABEL[inherited]})</option><option value="yes">Yes</option><option value="no">No</option><option value="never">Never</option>
          </select></span>;
        })}
      </div>)}
    </div>
    <div className="settings-foot"><button type="button" className="f-btn ghost" onClick={() => setM({})}>Clear all</button><button type="button" className="f-btn ghost" onClick={onClose}>Cancel</button><button className="f-btn" disabled={busy}>{busy ? 'Saving…' : 'Save permissions'}</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </form>;
}

function BoardsSettings({ frame, page, k, done }: { frame: Frame; page: Settings; k: string; done: Done }) {
  const [editing, setEditing] = useState<string | null>(null), [masking, setMasking] = useState<string | null>(null), [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null), [adding, setAdding] = useState<string | null>(null), [catName, setCatName] = useState(''), [catKind, setCatKind] = useState<'ic' | 'ooc'>('ic');
  const { call, error, busy } = useCall(k, done);
  const remove = async (what: 'Board' | 'Category', id: string, name: string) => {
    if (await confirmDialog({ title: `Delete ${name}?`, message: what === 'Board' ? 'Only an empty board can be deleted: move or delete its topics first.' : 'Only an empty category can be deleted.', confirm: `Delete ${what.toLowerCase()}`, danger: true })) await call({ action: what === 'Board' ? 'deleteBoard' : 'deleteCategory', id });
  };
  const line = (b: Row) => <li key={b.id} className={b.parentId ? 'sub' : ''}>
    {editing === b.id ? <BoardForm frame={frame} page={page} k={k} done={done} categoryId={b.categoryId} row={b} onClose={() => setEditing(null)} />
      : masking === b.id ? <MaskForm page={page} k={k} done={done} row={b} onClose={() => setMasking(null)} /> : <>
      <span className="board-line"><b>{b.parentId ? '↳ ' : ''}{b.name}</b><small>{[TYPE_NAME[b.type] + (b.place ? `: ${b.place.name}` : ''), b.parentId ? '' : b.width === 'half' ? 'Half width' : 'Full width', b.locked ? 'Moderators start topics' : '', page.masks[b.id] ? 'Own permissions' : '', `${b.topics} ${b.topics === 1 ? 'topic' : 'topics'}`].filter(Boolean).join(' · ')}</small></span>
      <span className="line-tools">
        <button className="f-btn ghost small" aria-label={`Move ${b.name} up`} disabled={busy} onClick={() => void call({ action: 'move', what: 'board', id: b.id, by: -1 })}><ArrowUp size={14} aria-hidden="true" /></button>
        <button className="f-btn ghost small" aria-label={`Move ${b.name} down`} disabled={busy} onClick={() => void call({ action: 'move', what: 'board', id: b.id, by: 1 })}><ArrowDown size={14} aria-hidden="true" /></button>
        <button className="f-btn ghost small" onClick={() => setEditing(b.id)}>Edit</button>
        <button className={`f-btn ghost small${page.masks[b.id] ? ' on' : ''}`} onClick={() => setMasking(b.id)}><ShieldCheck size={14} aria-hidden="true" />Permissions</button>
        <button className="f-btn ghost small danger" aria-label={`Delete ${b.name}`} onClick={() => void remove('Board', b.id, b.name)}><Trash2 size={14} aria-hidden="true" /></button>
      </span></>}
  </li>;
  return <section className="settings-card">
    <h2>Categories and boards</h2>
    <p className="muted">Each board is a location (tied to a place in the Encyclopedia, with its picture), a campaign board (in character, for a story with no single place) or out of character, for talking as yourselves. A new board takes its category’s kind. Half-width boards sit side by side on the forum page. Every post counts towards the member’s own post count.</p>
    {frame.categories.map(c => <div key={c.id} className="cat-block">
      <div className="cat-line">{renaming?.id === c.id ? <form className="cat-rename" onSubmit={e => { e.preventDefault(); void call({ action: 'editCategory', id: c.id, name: renaming.name }).then(ok => { if (ok) setRenaming(null); }); }}><input aria-label="Category name" value={renaming.name} maxLength={60} autoFocus onChange={e => setRenaming({ id: c.id, name: e.target.value })} /><button className="f-btn small" disabled={busy || !renaming.name.trim()}>Save</button><button type="button" className="f-btn ghost small" onClick={() => setRenaming(null)}>Cancel</button></form>
        : <h3>{c.name} <span className="tag">{c.kind === 'ic' ? 'In character' : 'Out of character'}</span></h3>}<span className="line-tools">
        <button className="f-btn ghost small" aria-label={`Move ${c.name} up`} disabled={busy} onClick={() => void call({ action: 'move', what: 'category', id: c.id, by: -1 })}><ArrowUp size={14} aria-hidden="true" /></button>
        <button className="f-btn ghost small" aria-label={`Move ${c.name} down`} disabled={busy} onClick={() => void call({ action: 'move', what: 'category', id: c.id, by: 1 })}><ArrowDown size={14} aria-hidden="true" /></button>
        <button className="f-btn ghost small" onClick={() => setRenaming({ id: c.id, name: c.name })}>Rename</button>
        <button className="f-btn ghost small danger" aria-label={`Delete ${c.name}`} onClick={() => void remove('Category', c.id, c.name)}><Trash2 size={14} aria-hidden="true" /></button>
      </span></div>
      <ul className="board-lines">{frame.boards.filter(b => b.categoryId === c.id && !b.parentId).flatMap(b => [line(b), ...frame.boards.filter(x => x.parentId === b.id).map(line)])}</ul>
      {adding === c.id ? <BoardForm frame={frame} page={page} k={k} done={done} categoryId={c.id} onClose={() => setAdding(null)} /> : <button className="f-btn ghost small" onClick={() => setAdding(c.id)}><Plus size={14} aria-hidden="true" />Add a board</button>}
    </div>)}
    <form className="cat-add" onSubmit={e => { e.preventDefault(); void call({ action: 'addCategory', name: catName, kind: catKind }).then(ok => { if (ok) setCatName(''); }); }}>
      <input aria-label="New category name" placeholder="New category, like The Northern Reaches" value={catName} maxLength={60} onChange={e => setCatName(e.target.value)} />
      <select aria-label="Kind" value={catKind} onChange={e => setCatKind(e.target.value as 'ic' | 'ooc')}><option value="ic">In character</option><option value="ooc">Out of character</option></select>
      <button className="f-btn" disabled={busy || !catName.trim()}>Add category</button>
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}

const USE_LABEL = { all: 'Everyone who can post', staff: 'Moderators only', off: 'Off' } as const;
/** The forum's AI: which of the campaign's API-key connections it uses, and who may use what. The GM only. */
function AiSettings({ page, k, done }: { page: Settings; k: string; done: Done }) {
  const cur = page.ai.settings, list = page.ai.connections, { call, error, busy } = useCall(k, done);
  const [v, setV] = useState({ connectionId: cur?.connectionId ?? '', catchUp: cur?.catchUp ?? 'all', check: cur?.check ?? 'all', draft: cur?.draft ?? 'staff' });
  const use = (key: 'catchUp' | 'check', label: string, note: string) => <label className="ai-use"><span><b>{label}</b><small>{note}</small></span>
    <select value={v[key]} onChange={e => setV({ ...v, [key]: e.target.value })}>{(['all', 'staff', 'off'] as const).map(u => <option key={u} value={u}>{USE_LABEL[u]}</option>)}</select></label>;
  return <section className="settings-card ai-settings">
    <h2><Sparkles size={15} aria-hidden="true" /> AI</h2>
    <p className="muted">Turn the forum’s AI on with one of this campaign’s API-key connections (Connect an AI, on the campaign’s page in the Encyclopedia). AI keys stay on each person’s own device and RPG Tools never saves them: you use this connection’s key from your device, and its tokens count toward its monthly limit. Everyone else uses their own AI, added under Account settings › AI on this device. The AI only gets forum text the person asking can read, with characters as players see them, never GM-only pages.</p>
    <div className="ai-pick" role="radiogroup" aria-label="Connection the forum uses">
      {list.map(c => <label key={c.id} className={`ai-choice${v.connectionId === c.id ? ' on' : ''}`}><input type="radio" name="ai-conn" checked={v.connectionId === c.id} onChange={() => setV({ ...v, connectionId: c.id })} />
        <span><b>{c.name}</b><small>{c.model} · {c.used.toLocaleString()}{c.limit ? ` of ${c.limit.toLocaleString()}` : ''} tokens this month</small></span></label>)}
      <label className={`ai-choice${!v.connectionId ? ' on' : ''}`}><input type="radio" name="ai-conn" checked={!v.connectionId} onChange={() => setV({ ...v, connectionId: '' })} /><span><b>No AI in the forum</b><small>Nothing goes to an AI</small></span></label>
    </div>
    {!list.length && <p className="muted small">This campaign has no API-key connection yet. Add one under Connect an AI on the campaign’s page in the Encyclopedia, then come back.</p>}
    {v.connectionId && <>
      <h3>What members may use</h3>
      {use('catchUp', 'Summarize and Catch me up', 'A short summary of a topic, or of what’s new since you last read it.')}
      {use('check', 'Check my post', 'Continuity and spelling notes on a draft before posting, against the topic and the character’s card.')}
      <label className="ai-use"><span><b>Draft with AI</b><small>A post written by the AI into the box, as narration or an NPC, for a moderator to read, change and post. It carries an AI mark.</small></span>
        <select value={v.draft} onChange={e => setV({ ...v, draft: e.target.value as 'staff' | 'off' })}><option value="staff">Moderators only</option><option value="off">Off</option></select></label>
    </>}
    <div className="settings-foot"><button className="f-btn" disabled={busy} onClick={() => void call({ action: 'aiSettings', ai: v.connectionId ? v : null })}>{busy ? 'Saving…' : 'Save AI settings'}</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}

type EmojiRow = Settings['emoji']['list'][number];
/** A code from a file name: lowercase letters, digits and _, starting with a letter, not one already taken. */
function codeFrom(name: string, taken: Set<string>) {
  let base = name.replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^[^a-z]+/, '').replace(/_+$/, '').slice(0, 28);
  if (base.length < 2) base = 'emoji';
  let code = base, n = 2;
  while (taken.has(code)) code = `${base}${n++}`;
  taken.add(code);
  return code;
}
const CODE = /^[a-z][a-z0-9_]{1,31}$/;

/** The campaign's own emoji: upload pictures, give each a :code: and a set, and say who may use them. */
function EmojiSettings({ page, k, done }: { page: Settings; k: string; done: Done }) {
  const [use, setUse] = useState(page.emoji.use), [list, setList] = useState<EmojiRow[]>(page.emoji.list), [adding, setAdding] = useState(''), { call, error, busy } = useCall(k, done);
  const [problem, setProblem] = useState(''), file = useRef<HTMLInputElement>(null);
  const save = (next: EmojiRow[], u = use) => call({ action: 'emoji', emoji: { use: u, list: next.map(e => ({ code: e.code, imageId: e.imageId, ...(e.set?.trim() ? { set: e.set.trim() } : {}) })) } });
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setProblem('');
    const taken = new Set(list.map(e => e.code)), added: EmojiRow[] = [], room = 200 - list.length;
    const picked = [...files].slice(0, room);
    for (const [i, f] of picked.entries()) {
      setAdding(`Adding ${i + 1} of ${picked.length}…`);
      try { added.push({ code: codeFrom(f.name, taken), imageId: await uploadForumPicture(k, f, 'emoji') }); }
      catch (e) { setProblem(`${f.name}: ${e instanceof Error ? e.message : 'couldn’t be added'}`); }
    }
    setAdding(''); if (file.current) file.current.value = '';
    if (files.length > room) setProblem(`A forum holds 200 emoji, so ${files.length - room} weren’t added.`);
    if (added.length) { const next = [...list, ...added]; setList(next); await save(next); }
  };
  const bad = list.find(e => !CODE.test(e.code)), twice = list.find((e, i) => list.findIndex(x => x.code === e.code) !== i);
  return <section className="settings-card emoji-settings">
    <h2><Smile size={16} aria-hidden="true" /> Emoji</h2>
    <p className="muted">The campaign’s own emoji. Members type <code>:code:</code> or pick one from the Emoji button when they write. Pictures are PNG, JPEG or WebP up to 256 KB, shown about as tall as the text; the file name becomes the code, and you can change it.</p>
    <div className="emoji-add">
      <button type="button" className="f-btn small" disabled={!!adding || busy || list.length >= 200} onClick={() => file.current?.click()}><Upload size={13} aria-hidden="true" />{adding || 'Add emoji'}</button>
      <small className="muted">{list.length} of 200</small>
      <input ref={file} type="file" multiple accept="image/png,image/jpeg,image/webp" hidden onChange={e => void add(e.target.files)} />
    </div>
    {list.length > 0 && <ul className="emoji-set">{list.map((e, i) => <li key={e.imageId + i}>
      <Emoji k={k} imageId={e.imageId} code={e.code} />
      <label className="emoji-code"><span aria-hidden="true">:</span><input aria-label="Code" value={e.code} maxLength={32} onChange={x => setList(list.map((y, n) => n === i ? { ...y, code: x.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') } : y))} /><span aria-hidden="true">:</span></label>
      <input className="emoji-group" aria-label="Set" placeholder="Set (optional)" value={e.set ?? ''} maxLength={30} onChange={x => setList(list.map((y, n) => n === i ? { ...y, set: x.target.value } : y))} />
      <button type="button" className="icon-btn" aria-label={`Remove :${e.code}:`} onClick={() => setList(list.filter((_, n) => n !== i))}><Trash2 size={14} /></button>
    </li>)}</ul>}
    <h3>Who may use them</h3>
    <div className="f-radios" role="radiogroup" aria-label="Who may use the campaign's emoji">
      {([['all', 'Everyone who can post'], ['staff', 'Moderators only'], ['off', 'No custom emoji']] as const).map(([v, l]) => <label key={v} className="f-check"><input type="radio" name="emoji-use" checked={use === v} onChange={() => setUse(v)} /><span>{l}</span></label>)}
    </div>
    <p className="muted small">Sets keep the picker tidy: emoji with the same set sit together. With no custom emoji, posts show the :codes: as text.</p>
    {(bad || twice) && <p className="form-error">{bad ? `:${bad.code}: needs 2 to 32 lowercase letters, digits or _, starting with a letter.` : `Two emoji use :${twice!.code}:.`}</p>}
    <div className="settings-foot"><button className="f-btn" disabled={busy || !!adding || !!bad || !!twice} onClick={() => void save(list)}>{busy ? 'Saving…' : 'Save emoji'}</button></div>
    {(problem || error) && <p className="form-error" role="alert">{problem || error}</p>}
  </section>;
}

// The same colours as TAG_COLOURS in lib/forum/model.ts, which stays out of the browser bundle.
const COLOUR_NAMES: Record<TopicTag['color'], string> = { gold: 'Gold', green: 'Green', blue: 'Blue', violet: 'Violet', red: 'Red', grey: 'Grey' };
const TAG_COLOURS = Object.keys(COLOUR_NAMES) as TopicTag['color'][];

/** Preset topic tags: names and colours a topic's starter can pick (up to three), like Open, Mature or Plot. */
function TopicTagSettings({ page, k, done }: { page: Settings; k: string; done: Done }) {
  const [list, setList] = useState<TopicTag[]>(page.topicTags), { call, error, busy } = useCall(k, done);
  const set = (i: number, v: Partial<TopicTag>) => setList(list.map((x, n) => n === i ? { ...x, ...v } : x));
  const add = () => setList([...list, { id: 't' + Math.random().toString(36).slice(2, 10), label: '', color: TAG_COLOURS[list.length % TAG_COLOURS.length] }]);
  const empty = list.some(x => !x.label.trim()), twice = list.find((x, i) => list.findIndex(y => y.label.trim().toLowerCase() === x.label.trim().toLowerCase()) !== i);
  return <section className="settings-card tag-settings">
    <h2><Tag size={16} aria-hidden="true" /> Topic tags</h2>
    <p className="muted">Tags a topic’s starter can put on it, up to three, such as Open, Closed, Mature or Main plot. They show beside the topic’s title. Moderators can change them on any topic.</p>
    {list.length > 0 && <ul className="tag-rows">{list.map((x, i) => <li key={x.id}>
      <span className={`tag topic-tag tc-${x.color}`}>{x.label.trim() || 'Tag'}</span>
      <input aria-label="Tag name" value={x.label} maxLength={24} placeholder="Tag name" onChange={e => set(i, { label: e.target.value })} />
      <label className="f-select small"><span className="sr-only">Colour</span><select value={x.color} onChange={e => set(i, { color: e.target.value as TopicTag['color'] })}>{TAG_COLOURS.map(c => <option key={c} value={c}>{COLOUR_NAMES[c]}</option>)}</select></label>
      <button type="button" className="icon-btn" aria-label={`Remove ${x.label || 'this tag'}`} onClick={() => setList(list.filter((_, n) => n !== i))}><Trash2 size={14} /></button>
    </li>)}</ul>}
    <button type="button" className="f-btn ghost small" disabled={list.length >= 20} onClick={add}><Plus size={13} aria-hidden="true" />Add a tag</button>
    {list.length < page.topicTags.length && <p className="muted small">Removing a tag takes it off every topic that has it.</p>}
    {(empty || twice) && <p className="form-error">{empty ? 'Every tag needs a name.' : `Two tags are called ${twice!.label.trim()}.`}</p>}
    <div className="settings-foot"><button className="f-btn" disabled={busy || empty || !!twice} onClick={() => void call({ action: 'topicTags', tags: list.map(x => ({ ...x, label: x.label.trim() })) })}>{busy ? 'Saving…' : 'Save tags'}</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}

/** The campaign theme lives in the Admin CP, which docks beside the forum so every change shows as you make it. */
function ThemeCard({ frame }: { frame: Frame }) {
  return <section className="settings-card">
    <h2><Palette size={15} aria-hidden="true" /> Campaign theme</h2>
    <p className="muted">Colours for a light and a dark version, fonts, the banner and your own stylesheet, like a Jcink skin. Save several and choose which one members see.</p>
    <p>Now: <b>{frame.theme ? frame.theme.name : 'the forum’s own look'}</b></p>
    <button className="f-btn" onClick={openAdminCp}>Open the Admin CP</button>
  </section>;
}

export function SettingsView({ frame, page, k, go, done }: { frame: Frame; page: Settings; k: string; go: Go; done: Done }) {
  return <>
    <Crumbs frame={frame} k={k} go={go} last="Forum settings" />
    <header className="topic-head"><h2 className="topic-name">Forum settings</h2><p className="muted">Who can read, post and moderate is set per group on the campaign’s Members tab. Permissions on a board change that for the board alone.</p></header>
    <div className="settings-grid"><div className="settings-col"><ThemeCard frame={frame} /><BannerSettings page={page} k={k} done={done} /><EmojiSettings page={page} k={k} done={done} /><TopicTagSettings page={page} k={k} done={done} /><StripSettings page={page} k={k} done={done} />{page.ai.may && <AiSettings page={page} k={k} done={done} />}</div><div className="settings-col"><BoardsSettings frame={frame} page={page} k={k} done={done} /><CardDesigner page={page} k={k} done={done} /></div></div>
  </>;
}
