'use client';
/*
 * Combat in a topic, for any game system: the order of turns with whose turn it is, the GM's buttons to move it on,
 * and the form that sets the order up, by hand, from the topic's characters, or from a Maptable scene's initiative.
 */
import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, ListOrdered, Map as MapIcon, Plus, Square, Swords, X } from 'lucide-react';
import { confirmDialog } from '../confirm-dialog';
import { forumCall, type Frame, type TopicPage } from './forum-api';
import { Portrait } from './forum-parts';

type Done = () => Promise<void>;
type CombatData = NonNullable<TopicPage['combat']>;
type Slot = { name: string; init: number | null; as: string[] };
type Row = { key: number; name: string; init: string; as: string[] };
type Source = { sceneId: string; name: string; round: number; turn: number; order: Slot[] };

const errorOf = (e: unknown, fallback: string) => e instanceof Error ? e.message : fallback;
let nextKey = 1;
const rowOf = (s: Slot): Row => ({ key: nextKey++, name: s.name, init: s.init === null ? '' : String(s.init), as: s.as });

/** The fight's order: each turn, who is in it, who has posted, and the GM's buttons. */
export function CombatPanel({ frame, page, k, done }: { frame: Frame; page: TopicPage; k: string; done: Done }) {
  const c = page.combat, t = page.topic, [editing, setEditing] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  if (!c) return null;
  const open = frame.you.rights.moderate && !t.archived && !t.trashed;
  const call = async (op: 'next' | 'back' | 'end') => {
    if (op === 'end' && !await confirmDialog({ title: 'End this fight?', message: 'The order goes away. Posts keep the rounds they were written in.', confirm: 'End combat' })) return;
    setBusy(true); setError('');
    try { await forumCall({ action: 'combat', campaign: k, topicId: t.id, op }); await done(); } catch (e) { setError(errorOf(e, 'Could not change the fight.')); } finally { setBusy(false); }
  };
  const now = c.order.find(s => s.now);
  return <section className="combat" aria-label="Combat">
    <header className="combat-head">
      <Swords size={16} aria-hidden="true" /><b>Combat</b><span className="combat-round">Round {c.round}</span>
      {now && <span className="combat-now">{now.name}’s turn</span>}
      {c.source && <small className="muted combat-source"><MapIcon size={12} aria-hidden="true" />Order from the Maptable scene {c.source.name}</small>}
    </header>
    {!editing && <ol className="combat-order">{c.order.map((s, i) => {
      const posted = s.as.filter(a => a.done).length;
      return <li key={i} className={`${s.now ? 'now' : ''}${s.gone ? ' gone' : ''}${s.mine ? ' mine' : ''}`} aria-current={s.now ? 'step' : undefined}>
        <span className="combat-init" title="Initiative">{s.init ?? '–'}</span>
        <span className="combat-pics">{s.as.length ? s.as.slice(0, 4).map(a => <span key={a.id} className={`combat-pic${a.done ? ' done' : ''}`} title={`${a.name}${a.done ? ' has posted' : ''}`}><Portrait k={k} picture={a.picture} name={a.name} className="portrait tiny" />{a.done && <Check size={11} aria-label="Posted" />}</span>) : <span className="as-seal tiny" aria-hidden="true">✦</span>}</span>
        <span className="combat-name"><b>{s.name}</b><small>{!s.as.length ? 'The GM’s turn' : s.as.length > 1 ? (s.now ? `Group turn · ${posted} of ${s.as.length} posted` : `Group turn · ${s.as.length} characters`) : s.mine ? 'Yours' : ''}</small></span>
        {s.now && <span className="tag now">Now</span>}
      </li>;
    })}</ol>}
    {editing ? <CombatSetup frame={frame} page={page} k={k} initial={c} onCancel={() => setEditing(false)} done={async () => { setEditing(false); await done(); }} />
      : open && <div className="combat-acts">
        <button type="button" className="f-btn ghost small" disabled={busy || (c.round === 1 && c.turn === 0)} onClick={() => void call('back')}><ChevronLeft size={13} aria-hidden="true" />Back</button>
        <button type="button" className="f-btn small" disabled={busy} onClick={() => void call('next')}>Next turn<ChevronRight size={13} aria-hidden="true" /></button>
        <button type="button" className="f-btn ghost small" disabled={busy} onClick={() => setEditing(true)}><ListOrdered size={13} aria-hidden="true" />Edit order</button>
        <button type="button" className="f-btn ghost small danger" disabled={busy} onClick={() => void call('end')}><Square size={12} aria-hidden="true" />End combat</button>
      </div>}
    {!editing && <p className="muted small combat-help">A post written as the character whose turn it is ends their part of it. A group turn ends once everyone in it has posted; an NPC turn ends with the GM’s post.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}

/** Sets the order up: turns with an optional initiative, the characters in each (two or more make a group turn), or none for the GM's NPCs. */
export function CombatSetup({ frame, page, k, initial, onCancel, done }: { frame: Frame; page: TopicPage; k: string; initial?: CombatData; onCancel: () => void; done: Done }) {
  const t = page.topic, cast = frame.you.cast, nameOf = (id: string) => cast.find(c => c.id === id)?.name ?? 'A character';
  const [rows, setRows] = useState<Row[]>(() => initial
    ? initial.order.map(s => rowOf({ name: s.name, init: s.init, as: s.as.map(a => a.id) }))
    : t.cast.map(c => rowOf({ name: c.name, init: null, as: [c.id] })));
  const [source, setSource] = useState<Source | null>(null), [sources, setSources] = useState<Source[] | null>(null), [note, setNote] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const used = new Set(rows.flatMap(r => r.as)), free = cast.filter(c => !used.has(c.id));
  const set = (key: number, change: Partial<Row>) => setRows(rs => rs.map(r => r.key === key ? { ...r, ...change } : r));
  const move = (i: number, by: -1 | 1) => setRows(rs => { const out = [...rs], j = i + by; if (j < 0 || j >= out.length) return rs; [out[i], out[j]] = [out[j]!, out[i]!]; return out; });
  const sort = () => setRows(rs => [...rs].sort((a, b) => (a.init.trim() === '' ? -Infinity : Number(a.init)) > (b.init.trim() === '' ? -Infinity : Number(b.init)) ? -1 : (a.init.trim() === '' ? -Infinity : Number(a.init)) < (b.init.trim() === '' ? -Infinity : Number(b.init)) ? 1 : 0));
  const findScenes = async () => {
    setNote(''); setError('');
    try {
      const got = await forumCall<{ paired: boolean; scenes: Source[] }>({ action: 'combatSources', campaign: k });
      if (!got.paired) setNote('This campaign isn’t paired with a Maptable campaign yet. Pair it from the campaign’s settings to bring initiative across.');
      else if (!got.scenes.length) setNote('No Maptable scene in the paired campaign has a fight in its initiative tracker.');
      setSources(got.paired ? got.scenes : null);
    } catch (e) { setError(errorOf(e, 'Could not reach Maptable.')); }
  };
  const take = (s: Source) => { setSource(s); setSources(null); setRows(s.order.map(rowOf)); };
  const save = async () => {
    setBusy(true); setError('');
    const order = rows.filter(r => r.name.trim()).map(r => ({ name: r.name.trim(), init: r.init.trim() === '' || !Number.isFinite(Number(r.init)) ? null : Number(r.init), as: r.as }));
    try {
      await forumCall({ action: 'combat', campaign: k, topicId: t.id, op: initial ? 'order' : 'start', order, ...(source ? { sceneId: source.sceneId } : {}) });
      await done();
    } catch (e) { setError(errorOf(e, 'Could not set up the fight.')); } finally { setBusy(false); }
  };
  return <div className="combat-setup">
    <div className="combat-setup-head">
      <h3><Swords size={15} aria-hidden="true" />{initial ? 'Edit the order' : 'Start combat'}</h3>
      <span className="combat-tools">
        <button type="button" className="f-btn ghost small" onClick={sort}><ArrowDown size={13} aria-hidden="true" />Sort by initiative</button>
        <button type="button" className="f-btn ghost small" onClick={() => void findScenes()}><MapIcon size={13} aria-hidden="true" />From Maptable</button>
      </span>
    </div>
    <p className="muted small">Any game system: give each turn an initiative number if you use them, or just put the turns in order. Put two or more characters in one turn for a group turn. A turn with no characters is the GM’s, for NPCs and monsters.</p>
    {sources && sources.length > 0 && <ul className="combat-sources">{sources.map(s => <li key={s.sceneId}><button type="button" className="f-btn ghost small" onClick={() => take(s)}><MapIcon size={13} aria-hidden="true" />{s.name}</button><small className="muted">{s.order.length} {s.order.length === 1 ? 'turn' : 'turns'} · round {s.round}</small></li>)}</ul>}
    {source && <p className="combat-source-note"><MapIcon size={13} aria-hidden="true" />From the Maptable scene <b>{source.name}</b>, round {source.round}. Tokens hidden on the map were left out.<button type="button" className="icon-btn" aria-label="Don’t use this scene" onClick={() => setSource(null)}><X size={13} /></button></p>}
    {note && <p className="muted small">{note}</p>}
    <ol className="combat-rows">{rows.map((r, i) => <li key={r.key}>
      <input className="combat-init-in" inputMode="decimal" value={r.init} onChange={e => set(r.key, { init: e.target.value.slice(0, 8) })} placeholder="Init" aria-label={`Initiative for ${r.name || 'this turn'}`} />
      <div className="combat-row-main">
        <input value={r.name} maxLength={80} onChange={e => set(r.key, { name: e.target.value })} placeholder="Who acts (Goblins, the Duke…)" aria-label="Turn name" />
        <span className="combat-chars">
          {r.as.length ? r.as.map(a => <span key={a} className="cast-chip">{nameOf(a)}<button type="button" className="icon-btn" aria-label={`Take ${nameOf(a)} out of this turn`} onClick={() => set(r.key, { as: r.as.filter(x => x !== a) })}><X size={11} /></button></span>) : <small className="muted">The GM’s turn</small>}
          {free.length > 0 && r.as.length < 12 && <select className="combat-add" value="" aria-label="Add a character to this turn" onChange={e => { const id = e.target.value; if (id) set(r.key, { as: [...r.as, id], ...(!r.name.trim() ? { name: nameOf(id) } : {}) }); }}>
            <option value="">+ character</option>{free.map(c => <option key={c.id} value={c.id}>{c.name} · {c.role}</option>)}
          </select>}
        </span>
      </div>
      <span className="combat-row-acts">
        <button type="button" className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
        <button type="button" className="icon-btn" aria-label="Move down" disabled={i === rows.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
        <button type="button" className="icon-btn" aria-label="Remove this turn" onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))}><X size={14} /></button>
      </span>
    </li>)}</ol>
    <div className="combat-setup-foot">
      <span className="combat-tools">
        {free.length > 0 && rows.length < 40 && <select className="f-btn ghost small" value="" aria-label="Add a turn for a character" onChange={e => { const id = e.target.value; if (id) setRows(rs => [...rs, rowOf({ name: nameOf(id), init: null, as: [id] })]); }}>
          <option value="">+ Character’s turn</option>{free.map(c => <option key={c.id} value={c.id}>{c.name} · {c.role}</option>)}
        </select>}
        {rows.length < 40 && <button type="button" className="f-btn ghost small" onClick={() => setRows(rs => [...rs, rowOf({ name: '', init: null, as: [] })])}><Plus size={13} aria-hidden="true" />NPC turn</button>}
      </span>
      <span className="combat-tools">
        <button type="button" className="f-btn ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="f-btn" disabled={busy || !rows.some(r => r.name.trim())} onClick={() => void save()}>{busy ? 'Saving…' : initial ? 'Save the order' : 'Start combat'}</button>
      </span>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
