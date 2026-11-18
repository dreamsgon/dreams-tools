'use client';
/* Forum settings, for the GM and groups that may add and arrange boards: the banner, its links, categories and boards. */
import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { confirmDialog } from '../confirm-dialog';
import { forumCall, type Frame, type PageData } from './forum-api';
import { Crumbs, type Go } from './forum-parts';

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
    <h2>Banner and links</h2>
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
    <div className="settings-foot"><button className="f-btn" disabled={busy} onClick={() => void call({ action: 'settings', settings: s })}>{busy ? 'Saving…' : 'Save banner'}</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}

function BoardForm({ frame, page, k, done, categoryId, row, onClose }: { frame: Frame; page: Settings; k: string; done: Done; categoryId: string; row?: Row; onClose: () => void }) {
  const cat = frame.categories.find(c => c.id === categoryId)!, tops = frame.boards.filter(b => b.categoryId === categoryId && !b.parentId && b.id !== row?.id);
  const [v, setV] = useState({ name: row?.name ?? '', description: row?.description ?? '', parentId: row?.parentId ?? '', placeId: row?.place?.id ?? '', locked: row?.locked ?? false });
  const { call, error, busy } = useCall(k, done);
  const hasSubs = !!row && frame.boards.some(b => b.parentId === row.id);
  const save = async () => { if (await call({ action: row ? 'editBoard' : 'addBoard', ...(row ? { id: row.id } : {}), categoryId, name: v.name, description: v.description, parentId: v.parentId || null, placeId: v.placeId || null, locked: v.locked })) onClose(); };
  return <form className="board-form" onSubmit={e => { e.preventDefault(); void save(); }}>
    <label className="f-field">Name<input value={v.name} maxLength={60} required onChange={e => setV({ ...v, name: e.target.value })} /></label>
    <label className="f-field">Description<input value={v.description} maxLength={300} onChange={e => setV({ ...v, description: e.target.value })} /></label>
    {cat.kind === 'ic' && <label className="f-field">Place in the Encyclopedia <small>(its picture becomes the board’s art)</small><select value={v.placeId} onChange={e => setV({ ...v, placeId: e.target.value })}><option value="">None</option>{page.places.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
    {!hasSubs && <label className="f-field">Sits inside<select value={v.parentId} onChange={e => setV({ ...v, parentId: e.target.value })}><option value="">Nothing (a board of its own)</option>{tops.map(b => <option key={b.id} value={b.id}>{b.name} (as a subforum)</option>)}</select></label>}
    <label className="f-check"><input type="checkbox" checked={v.locked} onChange={e => setV({ ...v, locked: e.target.checked })} /><span>Only moderators start topics here</span></label>
    <div className="settings-foot"><button type="button" className="f-btn ghost" onClick={onClose}>Cancel</button><button className="f-btn" disabled={busy || !v.name.trim()}>{busy ? 'Saving…' : row ? 'Save board' : 'Add board'}</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </form>;
}

function BoardsSettings({ frame, page, k, done }: { frame: Frame; page: Settings; k: string; done: Done }) {
  const [editing, setEditing] = useState<string | null>(null), [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null), [adding, setAdding] = useState<string | null>(null), [catName, setCatName] = useState(''), [catKind, setCatKind] = useState<'ic' | 'ooc'>('ic');
  const { call, error, busy } = useCall(k, done);
  const remove = async (what: 'Board' | 'Category', id: string, name: string) => {
    if (await confirmDialog({ title: `Delete ${name}?`, message: what === 'Board' ? 'Only an empty board can be deleted: move or delete its topics first.' : 'Only an empty category can be deleted.', confirm: `Delete ${what.toLowerCase()}`, danger: true })) await call({ action: what === 'Board' ? 'deleteBoard' : 'deleteCategory', id });
  };
  const line = (b: Row) => <li key={b.id} className={b.parentId ? 'sub' : ''}>
    {editing === b.id ? <BoardForm frame={frame} page={page} k={k} done={done} categoryId={b.categoryId} row={b} onClose={() => setEditing(null)} /> : <>
      <span className="board-line"><b>{b.parentId ? '↳ ' : ''}{b.name}</b><small>{[b.place?.name, b.locked ? 'Moderators start topics' : '', `${b.topics} ${b.topics === 1 ? 'topic' : 'topics'}`].filter(Boolean).join(' · ')}</small></span>
      <span className="line-tools">
        <button className="f-btn ghost small" aria-label={`Move ${b.name} up`} disabled={busy} onClick={() => void call({ action: 'move', what: 'board', id: b.id, by: -1 })}><ArrowUp size={14} aria-hidden="true" /></button>
        <button className="f-btn ghost small" aria-label={`Move ${b.name} down`} disabled={busy} onClick={() => void call({ action: 'move', what: 'board', id: b.id, by: 1 })}><ArrowDown size={14} aria-hidden="true" /></button>
        <button className="f-btn ghost small" onClick={() => setEditing(b.id)}>Edit</button>
        <button className="f-btn ghost small danger" aria-label={`Delete ${b.name}`} onClick={() => void remove('Board', b.id, b.name)}><Trash2 size={14} aria-hidden="true" /></button>
      </span></>}
  </li>;
  return <section className="settings-card">
    <h2>Categories and boards</h2>
    <p className="muted">In-character categories hold location boards, where players post as their characters. Out-of-character ones are for talking as yourselves. Every post counts towards the member’s own post count.</p>
    {frame.categories.map(c => <div key={c.id} className="cat-block">
      <div className="cat-line">{renaming?.id === c.id ? <form className="cat-rename" onSubmit={e => { e.preventDefault(); void call({ action: 'editCategory', id: c.id, name: renaming.name }).then(ok => { if (ok) setRenaming(null); }); }}><input aria-label="Category name" value={renaming.name} maxLength={60} autoFocus onChange={e => setRenaming({ id: c.id, name: e.target.value })} /><button className="f-btn small" disabled={busy || !renaming.name.trim()}>Save</button><button type="button" className="f-btn ghost small" onClick={() => setRenaming(null)}>Cancel</button></form>
        : <h3>{c.name} <span className="tag">{c.kind === 'ic' ? 'In character' : 'Out of character'}</span></h3>}<span className="line-tools">
        <button className="f-btn ghost small" aria-label={`Move ${c.name} up`} disabled={busy} onClick={() => void call({ action: 'move', what: 'category', id: c.id, by: -1 })}><ArrowUp size={14} aria-hidden="true" /></button>
        <button className="f-btn ghost small" aria-label={`Move ${c.name} down`} disabled={busy} onClick={() => void call({ action: 'move', what: 'category', id: c.id, by: 1 })}><ArrowDown size={14} aria-hidden="true" /></button>
        <button className="f-btn ghost small" onClick={() => setRenaming({ id: c.id, name: c.name })}>Rename</button>
        <button className="f-btn ghost small danger" aria-label={`Delete ${c.name}`} onClick={() => void remove('Category', c.id, c.name)}><Trash2 size={14} aria-hidden="true" /></button>
      </span></div>
      <ul className="board-lines">{frame.boards.filter(b => b.categoryId === c.id && !b.parentId).flatMap(b => [line(b), ...frame.boards.filter(x => x.parentId === b.id).map(line)])}</ul>
      {adding === c.id ? <BoardForm frame={frame} page={page} k={k} done={done} categoryId={c.id} onClose={() => setAdding(null)} /> : <button className="f-btn ghost small" onClick={() => setAdding(c.id)}><Plus size={14} aria-hidden="true" />Add a {c.kind === 'ic' ? 'location board' : 'board'}</button>}
    </div>)}
    <form className="cat-add" onSubmit={e => { e.preventDefault(); void call({ action: 'addCategory', name: catName, kind: catKind }).then(ok => { if (ok) setCatName(''); }); }}>
      <input aria-label="New category name" placeholder="New category, like The Northern Reaches" value={catName} maxLength={60} onChange={e => setCatName(e.target.value)} />
      <select aria-label="Kind" value={catKind} onChange={e => setCatKind(e.target.value as 'ic' | 'ooc')}><option value="ic">In character</option><option value="ooc">Out of character</option></select>
      <button className="f-btn" disabled={busy || !catName.trim()}>Add category</button>
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}

export function SettingsView({ frame, page, k, go, done }: { frame: Frame; page: Settings; k: string; go: Go; done: Done }) {
  return <>
    <Crumbs frame={frame} k={k} go={go} last="Forum settings" />
    <header className="topic-head"><h2 className="topic-name">Forum settings</h2><p className="muted">Who can read, post and moderate is set per group on the campaign’s Members tab.</p></header>
    <div className="settings-grid"><BannerSettings page={page} k={k} done={done} /><BoardsSettings frame={frame} page={page} k={k} done={done} /></div>
  </>;
}
