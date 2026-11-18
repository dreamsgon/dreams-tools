'use client';
/*
 * Moderation: multi-moderation on a board, private topics, the Trash, and printing or downloading a topic or a
 * whole board.
 */
import { useMemo, useRef, useState } from 'react';
import { Archive, ArchiveRestore, Download, EyeOff, Lock, LockOpen, Pin, PinOff, Printer, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { confirmDialog } from '../confirm-dialog';
import { forumCall, fullDate, when, type Frame, type PageData, type TopicPage } from './forum-api';
import { download, topicsHtml, topicsText, type ExportTopic } from './forum-export';
import { Crumbs, Link, TopicRow, type Go } from './forum-parts';

type Done = () => Promise<void>;
type Op = 'pin' | 'unpin' | 'lock' | 'unlock' | 'archive' | 'unarchive' | 'trash' | 'move';

/** The bar that shows once a moderator picks topics on a board: what to do to all of them at once. */
export function ModBar({ frame, k, picked, kind, archive, clear, done }: { frame: Frame; k: string; picked: string[]; kind: 'ic' | 'ooc'; archive: boolean; clear: () => void; done: Done }) {
  const [busy, setBusy] = useState(false), [note, setNote] = useState('');
  const n = picked.length, them = n === 1 ? 'it' : 'them';
  const run = async (op: Op, boardId?: string) => {
    if (op === 'trash' && !await confirmDialog({ title: `Move ${n} ${n === 1 ? 'topic' : 'topics'} to the Trash?`, message: `Moderators can bring ${them} back from the Trash for 30 days. After that ${them} ${n === 1 ? 'goes' : 'go'} for good.`, confirm: 'Move to Trash', danger: true })) return;
    setBusy(true); setNote('');
    try {
      const out = await forumCall<{ done: number; problem?: string }>({ action: 'bulk', campaign: k, topicIds: picked, op, ...(boardId ? { boardId } : {}) });
      setNote(out.problem ? `${out.done} of ${n} changed. ${out.problem}` : '');
      if (!out.problem) clear();
      await done();
    } catch (e) { setNote(e instanceof Error ? e.message : 'Could not change those topics.'); } finally { setBusy(false); }
  };
  const boards = frame.boards.filter(b => b.kind === kind);
  if (!n) return null;
  return <div className="mod-bar" role="toolbar" aria-label="Moderate the selected topics">
    <b>{n} selected</b>
    {!archive && <>
      <button type="button" className="f-btn ghost small" disabled={busy} onClick={() => void run('pin')}><Pin size={13} aria-hidden="true" />Pin</button>
      <button type="button" className="f-btn ghost small" disabled={busy} onClick={() => void run('unpin')}><PinOff size={13} aria-hidden="true" />Unpin</button>
      <button type="button" className="f-btn ghost small" disabled={busy} onClick={() => void run('lock')}><Lock size={13} aria-hidden="true" />Lock</button>
      <button type="button" className="f-btn ghost small" disabled={busy} onClick={() => void run('unlock')}><LockOpen size={13} aria-hidden="true" />Unlock</button>
      <button type="button" className="f-btn ghost small" disabled={busy} onClick={() => void run('archive')}><Archive size={13} aria-hidden="true" />Archive</button>
    </>}
    {archive && <button type="button" className="f-btn ghost small" disabled={busy} onClick={() => void run('unarchive')}><ArchiveRestore size={13} aria-hidden="true" />Bring back</button>}
    <label className="f-select small">Move to <select value="" disabled={busy} onChange={e => { if (e.target.value) void run('move', e.target.value); }}><option value="">Choose a board</option>{boards.map(b => <option key={b.id} value={b.id}>{b.parentId ? '— ' : ''}{b.name}</option>)}</select></label>
    <button type="button" className="f-btn ghost small danger" disabled={busy} onClick={() => void run('trash')}><Trash2 size={13} aria-hidden="true" />Trash</button>
    <button type="button" className="f-btn ghost small" disabled={busy} onClick={clear}><X size={13} aria-hidden="true" />Clear</button>
    {note && <p className="form-error" role="alert">{note}</p>}
  </div>;
}

/** Who a new private topic is for: members picked by name. The GMs always see it. */
export function PrivatePicker({ frame, value, onChange }: { frame: Frame; value: string[] | null; onChange: (v: string[] | null) => void }) {
  const [q, setQ] = useState(''), people = frame.you.people;
  const shown = useMemo(() => people.filter(p => !p.gm && !value?.includes(p.key) && p.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8), [people, value, q]);
  if (!people.length) return null;
  return <fieldset className="private-pick">
    <label className="check"><input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked ? [] : null)} /><EyeOff size={13} aria-hidden="true" />Private topic</label>
    {value && <>
      <p className="muted small">Only you, the people you add and the GMs can see it. It stays out of everyone else’s lists and counts.</p>
      <div className="private-chips">
        {value.map(key => { const p = people.find(x => x.key === key); return p && <span key={key} className="chip">{p.name}<button type="button" aria-label={`Remove ${p.name}`} onClick={() => onChange(value.filter(x => x !== key))}><X size={11} /></button></span>; })}
        {value.length < 30 && <span className="private-search"><Search size={13} aria-hidden="true" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Add a member" aria-label="Add a member to this private topic" /></span>}
      </div>
      {q.trim() !== '' && <ul className="private-results">{shown.length ? shown.map(p => <li key={p.key}><button type="button" onClick={() => { onChange([...value, p.key]); setQ(''); }}>{p.name}</button></li>) : <li className="muted small">No member by that name.</li>}</ul>}
    </>}
  </fieldset>;
}

/** The banner on a topic in the Trash, with what a moderator can do about it. */
export function TrashedBanner({ t, k, go, done }: { t: TopicPage['topic']; k: string; go: Go; done: Done }) {
  const [error, setError] = useState('');
  if (!t.trashed) return null;
  const restore = async () => { try { await forumCall({ action: 'trash', campaign: k, topicId: t.id, restore: true }); await done(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not restore it.'); } };
  return <div className="trash-banner" role="status">
    <Trash2 size={16} aria-hidden="true" />
    <p>In the Trash since {fullDate(t.trashed.at)}, moved by {t.trashed.by}. It goes for good on {fullDate(t.trashed.until)}.</p>
    <button type="button" className="f-btn small" onClick={() => void restore()}><RotateCcw size={13} aria-hidden="true" />Restore</button>
    <button type="button" className="f-btn ghost small danger" onClick={() => void deleteForGood(k, t, setError).then(ok => { if (ok) go({ view: 'trash' }); })}>Delete for good</button>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
async function deleteForGood(k: string, t: { id: string; title: string; replies: number }, setError: (e: string) => void) {
  if (!await confirmDialog({ title: 'Delete this topic for good?', message: `“${t.title}” and its ${t.replies + 1} ${t.replies ? 'posts' : 'post'} are removed and come off everyone’s post counts. This can’t be undone.`, confirm: 'Delete for good', danger: true })) return false;
  try { await forumCall({ action: 'deleteTopic', campaign: k, topicId: t.id }); return true; } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete it.'); return false; }
}

/** The Trash: every topic moved there, with Restore and Delete for good. */
export function TrashView({ frame, page, k, go, done }: { frame: Frame; page: Extract<PageData, { kind: 'trash' }>; k: string; go: Go; done: Done }) {
  const [error, setError] = useState('');
  const restore = async (id: string) => { setError(''); try { await forumCall({ action: 'trash', campaign: k, topicId: id, restore: true }); await done(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not restore it.'); } };
  return <>
    <Crumbs frame={frame} k={k} go={go} last="Trash can" />
    <section className="topics trash">
      <h2 className="category-title">Trash can</h2>
      <p className="muted">Topics stay here for {page.days} days so they can be brought back, then go for good. Only moderators see the Trash.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {page.topics.length ? page.topics.map(t => <div key={t.id} className="trash-item">
        <TopicRow t={t} k={k} go={go} board={t.board} />
        <p className="trash-meta"><span>Moved by {t.trashed!.by} {when(t.trashed!.at)} · goes for good {fullDate(t.trashed!.until)}</span>
          <span className="trash-acts">
            <button type="button" className="f-btn small" onClick={() => void restore(t.id)}><RotateCcw size={13} aria-hidden="true" />Restore</button>
            <button type="button" className="f-btn ghost small danger" onClick={() => void deleteForGood(k, t, setError).then(async ok => { if (ok) await done(); })}>Delete for good</button>
          </span></p>
      </div>) : <p className="muted empty">The Trash is empty.</p>}
    </section>
  </>;
}

/** A topic's posts as the export files want them. */
export function exportTopic(page: TopicPage): ExportTopic {
  const t = page.topic;
  return {
    title: t.title, posts: page.posts.map(p => {
      const card = p.as ? page.cards[p.as] : null;
      return { name: card?.name ?? (t.kind === 'ic' ? 'Game Master' : p.name), by: p.name, at: p.at, body: p.body, rolls: p.rolls };
    }),
  };
}

/** The print page: the topic plainly, with Print and the downloads. */
export function PrintView({ frame, page, k, go }: { frame: Frame; page: TopicPage; k: string; go: Go }) {
  const topic = exportTopic(page), html = topicsHtml(topic.title, [topic]);
  const name = `${frame.settings.title} - ${topic.title}`, sheet = useRef<HTMLIFrameElement>(null);
  return <div className="print-page">
    <div className="print-tools no-print">
      <Crumbs frame={frame} boardId={page.topic.boardId} k={k} go={go} last={page.topic.title} />
      <p className="print-acts">
        <button type="button" className="f-btn" onClick={() => { const w = sheet.current?.contentWindow; if (w) { w.focus(); w.print(); } else window.print(); }}><Printer size={14} aria-hidden="true" />Print</button>
        <button type="button" className="f-btn ghost" onClick={() => download(`${name}.html`, html, 'text/html')}><Download size={14} aria-hidden="true" />Download .html</button>
        <button type="button" className="f-btn ghost" onClick={() => download(`${name}.txt`, topicsText(topic.title, [topic]), 'text/plain')}><Download size={14} aria-hidden="true" />Download .txt</button>
        <Link k={k} go={go} to={{ view: 'topic', id: page.topic.id }}>Back to the topic</Link>
      </p>
    </div>
    <iframe ref={sheet} className="print-preview" title={`${topic.title}, ready to print`} srcDoc={html} sandbox="allow-modals allow-same-origin" />
  </div>;
}

/** GM only: a whole board as one file. */
export function BoardDownload({ k, boardId, name }: { k: string; boardId: string; name: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const get = async (fmt: 'html' | 'txt') => {
    setBusy(true); setError('');
    try {
      const out = await forumCall<{ board: string; topics: ExportTopic[] }>({ action: 'export', campaign: k, boardId });
      if (fmt === 'html') download(`${name}.html`, topicsHtml(out.board, out.topics), 'text/html'); else download(`${name}.txt`, topicsText(out.board, out.topics), 'text/plain');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not download the board.'); } finally { setBusy(false); }
  };
  return <span className="board-download">
    <button type="button" className="f-btn ghost small" disabled={busy} onClick={() => void get('html')}><Download size={13} aria-hidden="true" />{busy ? 'Gathering…' : 'Download board'}</button>
    <button type="button" className="f-btn ghost small" disabled={busy} onClick={() => void get('txt')} aria-label="Download board as text">.txt</button>
    {error && <span className="form-error" role="alert">{error}</span>}
  </span>;
}
