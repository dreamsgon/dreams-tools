'use client';
/* A board's topic list, a topic's posts with their 250×400 portraits and hover cards, and the composer. */
import { useEffect, useRef, useState } from 'react';
import { Lock, Pin, Pencil, Quote, Trash2, PenLine } from 'lucide-react';
import { confirmDialog } from '../confirm-dialog';
import { forumCall, fullDate, when, type BoardPage, type Frame, type TopicPage } from './forum-api';
import { Circle, Crumbs, Link, Portrait, PostText, TopicRow, type Go } from './forum-parts';

type Done = (place?: { view: 'topic'; id: string }) => Promise<void>;

/** Who to post as: in character, your own characters (a GM: any, or narration as themselves); out of character, yourself. */
function useAs(frame: Frame, kind: 'ic' | 'ooc', preferred?: string | null) {
  const cast = frame.you.cast, gm = frame.you.rights.gm, mine = new Set(frame.you.editable);
  const first = cast.find(c => mine.has(c.id)) ?? (gm ? null : cast[0]) ?? null;
  const [as, setAs] = useState<string | null>(kind === 'ic' ? (preferred !== undefined && (preferred === null ? gm : cast.some(c => c.id === preferred)) ? preferred : first?.id ?? null) : null);
  const options = kind === 'ic' ? [...cast.map(c => ({ id: c.id, label: mine.has(c.id) ? c.name : `${c.name} · ${c.role}` })), ...(gm ? [{ id: '', label: `Yourself (${frame.you.name}), as narrator` }] : [])] : [];
  return { as: kind === 'ic' ? as : null, setAs, options, blocked: kind === 'ic' && !cast.length && !gm };
}

function AsPicker({ frame, kind, state }: { frame: Frame; kind: 'ic' | 'ooc'; state: ReturnType<typeof useAs> }) {
  if (kind === 'ooc') return <p className="as-line"><Circle name={frame.you.name} /> Posting as yourself, <b>{frame.you.name}</b></p>;
  return <label className="as-line">Post as <select value={state.as ?? ''} onChange={e => state.setAs(e.target.value || null)}>{state.options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>;
}

const hint = 'Blank lines start new paragraphs. **bold**, *italic*, > quote, # heading.';

/** Write a reply (or, with a title, a new topic). */
export function Composer({ frame, kind, onPost, title: withTitle, draftKey, quote, preferred, onCancel }: {
  frame: Frame; kind: 'ic' | 'ooc'; onPost: (v: { title: string; body: string; as: string | null }) => Promise<void>; title?: boolean; draftKey: string; quote?: { text: string; n: number }; preferred?: string | null; onCancel?: () => void;
}) {
  const storeKey = 'forum-draft:' + draftKey;
  // An unsent post is kept in this browser until it's posted (drafts are a convenience; storage may be off).
  const state = useAs(frame, kind, preferred), [title, setTitle] = useState(''), [body, setBody] = useState(() => { try { return localStorage.getItem(storeKey) ?? ''; } catch { return ''; } }), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const box = useRef<HTMLTextAreaElement>(null), [quoted, setQuoted] = useState(0);
  useEffect(() => { try { if (body) localStorage.setItem(storeKey, body); else localStorage.removeItem(storeKey); } catch { /* ignore */ } }, [body, storeKey]);
  // A Quote click adds the quoted lines to the end of the post.
  if (quote && quote.n !== quoted) { setQuoted(quote.n); setBody(b => (b ? b.replace(/\s*$/, '\n\n') : '') + quote.text + '\n\n'); }
  useEffect(() => { if (quoted) { box.current?.focus(); box.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }, [quoted]);
  if (state.blocked) return <div className="composer composer-note"><p>To post in character you need a character. Ask your GM to add you to your character page’s <b>Who can edit</b>.</p></div>;
  const send = async () => {
    setBusy(true); setError('');
    try { await onPost({ title, body, as: state.as }); setBody(''); setTitle(''); try { localStorage.removeItem(storeKey); } catch { /* ignore */ } }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not post.'); }
    finally { setBusy(false); }
  };
  return <form className="composer" onSubmit={e => { e.preventDefault(); void send(); }}>
    <AsPicker frame={frame} kind={kind} state={state} />
    {withTitle && <input className="composer-title" placeholder="Topic title" value={title} maxLength={120} onChange={e => setTitle(e.target.value)} aria-label="Topic title" />}
    <textarea ref={box} value={body} onChange={e => setBody(e.target.value)} rows={withTitle ? 10 : 7} placeholder={kind === 'ic' ? 'Write your post…' : 'Write to the table…'} aria-label="Post text" onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void send(); }} />
    <div className="composer-foot"><small className="muted">{hint}</small><span>{onCancel && <button type="button" className="f-btn ghost" onClick={onCancel}>Cancel</button>}<button className="f-btn" disabled={busy || !body.trim() || (withTitle && !title.trim())}>{busy ? 'Posting…' : withTitle ? 'Start topic' : 'Post reply'}</button></span></div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </form>;
}

export function BoardView({ frame, page, k, go, done }: { frame: Frame; page: BoardPage; k: string; go: Go; done: Done }) {
  const b = page.board, art = b.place?.picture ?? null, [writing, setWriting] = useState(false), r = frame.you.rights;
  const subs = frame.boards.filter(x => x.parentId === b.id), canStart = r.start && (!b.locked || r.moderate);
  const start = async (v: { title: string; body: string; as: string | null }) => { const out = await forumCall<{ topicId: string }>({ action: 'start', campaign: k, boardId: b.id, ...v }); setWriting(false); await done({ view: 'topic', id: out.topicId }); };
  return <>
    <Crumbs frame={frame} boardId={b.id} k={k} go={go} />
    {b.kind === 'ic' ? <header className="location">
      <Portrait k={k} picture={art} name={b.place?.name ?? b.name} className="portrait location-art" />
      <div className="location-info">
        <p className="location-kind">Location{b.place ? ` · ${b.place.name}` : ''}</p>
        <h2 className="location-name">{b.name}</h2>
        {(b.description || page.place?.summary) && <p className="location-summary">{b.description || page.place?.summary}</p>}
        <p className="location-now">{frame.date && <><b>{frame.date}</b> · </>}{b.topics} {b.topics === 1 ? 'topic' : 'topics'} · {b.replies} {b.replies === 1 ? 'reply' : 'replies'}{b.place?.url && <> · <a href={b.place.url}>Read about it in the Encyclopedia</a></>}</p>
      </div>
    </header> : <header className="topic-head board-plain"><h2 className="location-name">{b.name}</h2>{b.description && <p className="location-summary">{b.description}</p>}</header>}
    {subs.length > 0 && <section className="subforums"><h2 className="category-title">Subforums</h2>{subs.map(s => <Link key={s.id} k={k} go={go} to={{ view: 'board', id: s.id }} className="forum sub"><span className="forum-name">{s.name}</span><small>{s.topics} topics · {s.replies} replies</small></Link>)}</section>}
    <section className="topics">
      <div className="topics-head"><h2 className="category-title">Topics</h2>{canStart && !writing && <button className="f-btn" onClick={() => setWriting(true)}><PenLine size={14} aria-hidden="true" />New topic</button>}</div>
      {writing && <Composer frame={frame} kind={b.kind} title draftKey={`${k}:new:${b.id}`} onPost={start} onCancel={() => setWriting(false)} />}
      {page.topics.length ? page.topics.map(t => <TopicRow key={t.id} t={t} k={k} go={go} />) : <p className="muted empty">No topics yet.{canStart && ' Start the first one.'}</p>}
    </section>
  </>;
}

type PostData = TopicPage['posts'][number];
type CardData = TopicPage['cards'][string];

/** The character card that fades in over the portrait: picked fields from what players may read. */
function HoverCard({ card }: { card: CardData }) {
  return <div className="mini-card" role="tooltip">
    <p className="mini-name">{card.name}</p>
    <p className="mini-role">{card.role}</p>
    {card.traits.length > 0 && <p className="mini-traits">{card.traits.map(t => <span key={t} className="chip">{t}</span>)}</p>}
    {card.fields.length > 0 ? <dl className="mini-fields">{card.fields.map(f => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl> : <p className="mini-quote">Nothing shared about them yet.</p>}
    {card.url && <a className="mini-link" href={card.url}>Open their page</a>}
  </div>;
}

function Post({ p, card, k, flip, topic, onQuote, done }: { p: PostData; card: CardData | null; k: string; flip: boolean; topic: TopicPage['topic']; onQuote: (text: string) => void; done: Done }) {
  const [editing, setEditing] = useState(false), [text, setText] = useState(p.body), [busy, setBusy] = useState(false), [error, setError] = useState(''), [open, setOpen] = useState(false);
  const save = async () => { setBusy(true); setError(''); try { await forumCall({ action: 'edit', campaign: k, topicId: topic.id, postId: p.id, body: text }); setEditing(false); await done(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(false); } };
  const remove = async () => {
    if (!await confirmDialog({ title: 'Delete this post?', message: 'It comes off the post count too. This can’t be undone.', confirm: 'Delete post', danger: true })) return;
    try { await forumCall({ action: 'delete', campaign: k, topicId: topic.id, postId: p.id }); await done(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete.'); }
  };
  const name = card?.name ?? p.name;
  const quote = () => onQuote(p.body.split('\n').filter(l => l.trim()).slice(0, 3).map(l => '> ' + l.replace(/^>\s?/, '')).join('\n') + `\n> — ${name}`);
  return <article className={`post${flip ? ' flip' : ''}${card ? ' post-ic' : ' post-ooc'}`} id={`post-${p.id}`}>
    <header className="post-band"><h3 className="post-name">{card?.url ? <a href={card.url}>{name}</a> : name}</h3><span className="post-meta"><a href={`#post-${p.id}`} onClick={e => { e.preventDefault(); document.getElementById(`post-${p.id}`)?.scrollIntoView({ behavior: 'smooth' }); }}>#{p.number}</a> · <time dateTime={p.at} title={fullDate(p.at)}>{when(p.at)}</time>{p.editedAt && <span className="muted" title={fullDate(p.editedAt)}> · edited</span>}</span></header>
    <div className="post-grid">
      <aside className="post-side">
        {card ? <div className={`mini${open ? ' open' : ''}`}>
          {/* Hover (or focus, or tap on a phone) shows the card over the portrait. */}
          <div className="mini-portrait" tabIndex={0} role="group" aria-label={`${card.name}: hover or tap for details`} onClick={() => setOpen(o => !o)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } if (e.key === 'Escape') setOpen(false); }} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}>
            <Portrait k={k} picture={card.picture} name={card.name} className="portrait big" />
            <HoverCard card={card} />
          </div>
          <small className="mini-player">Played by <b>{p.name}</b><br />{p.posts} {p.posts === 1 ? 'post' : 'posts'}</small>
        </div> : <div className="mini mini-self"><Circle name={p.name} /><small className="mini-player"><b>{p.name}</b><br />{p.posts} {p.posts === 1 ? 'post' : 'posts'}</small></div>}
      </aside>
      <div className="post-main">
        {editing ? <div className="composer inline"><textarea value={text} onChange={e => setText(e.target.value)} rows={8} aria-label="Edit post" /><div className="composer-foot"><small className="muted">{hint}</small><span><button className="f-btn ghost" onClick={() => { setEditing(false); setText(p.body); }}>Cancel</button><button className="f-btn" disabled={busy || !text.trim()} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button></span></div></div>
          : <div className="post-body"><PostText text={p.body} /></div>}
        <footer className="post-actions">
          {topic.canReply && <button type="button" onClick={quote}><Quote size={13} aria-hidden="true" />Quote</button>}
          {p.canEdit && !editing && <button type="button" onClick={() => setEditing(true)}><Pencil size={13} aria-hidden="true" />Edit</button>}
          {p.canDelete && <button type="button" onClick={() => void remove()}><Trash2 size={13} aria-hidden="true" />Delete</button>}
        </footer>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </div>
  </article>;
}

function ModTools({ frame, page, k, done, go }: { frame: Frame; page: TopicPage; k: string; done: Done; go: Go }) {
  const t = page.topic, r = frame.you.rights, [error, setError] = useState(''), [renaming, setRenaming] = useState(false), [title, setTitle] = useState(t.title);
  const call = async (body: Record<string, unknown>) => { setError(''); try { await forumCall({ campaign: k, topicId: t.id, ...body }); await done(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not change the topic.'); } };
  const sameKind = frame.boards.filter(b => b.kind === t.kind);
  if (!r.moderate && !t.canRename) return null;
  return <div className="mod-tools">
    {renaming ? <form onSubmit={e => { e.preventDefault(); void call({ action: 'topic', title }).then(() => setRenaming(false)); }}><input value={title} maxLength={120} onChange={e => setTitle(e.target.value)} aria-label="Topic title" /><button className="f-btn small">Save</button><button type="button" className="f-btn ghost small" onClick={() => setRenaming(false)}>Cancel</button></form>
      : t.canRename && <button className="f-btn ghost small" onClick={() => setRenaming(true)}><Pencil size={13} aria-hidden="true" />Rename</button>}
    {r.moderate && <>
      <button className="f-btn ghost small" onClick={() => void call({ action: 'topic', pinned: !t.pinned })}><Pin size={13} aria-hidden="true" />{t.pinned ? 'Unpin' : 'Pin'}</button>
      <button className="f-btn ghost small" onClick={() => void call({ action: 'topic', locked: !t.locked })}><Lock size={13} aria-hidden="true" />{t.locked ? 'Unlock' : 'Lock'}</button>
      <label className="f-select small">Move to <select value={t.boardId} onChange={e => void call({ action: 'topic', boardId: e.target.value })}>{sameKind.map(b => <option key={b.id} value={b.id}>{b.parentId ? '— ' : ''}{b.name}</option>)}</select></label>
      <button className="f-btn ghost small danger" onClick={() => void (async () => { if (await confirmDialog({ title: 'Delete this topic?', message: `“${t.title}” and its ${t.replies + 1} posts are removed, and they come off everyone’s post counts. This can’t be undone.`, confirm: 'Delete topic', danger: true })) { try { await forumCall({ action: 'deleteTopic', campaign: k, topicId: t.id }); go({ view: 'board', id: t.boardId }); } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete.'); } } })()}><Trash2 size={13} aria-hidden="true" />Delete topic</button>
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}

export function TopicView({ frame, page, k, go, done }: { frame: Frame; page: TopicPage; k: string; go: Go; done: Done }) {
  const t = page.topic, [quote, setQuote] = useState<{ text: string; n: number }>();
  // Reply as the character you last posted as here.
  const mine = [...page.posts].reverse().find(p => p.mine), preferred = mine ? mine.as : undefined;
  const send = async (v: { body: string; as: string | null }) => { await forumCall({ action: 'reply', campaign: k, topicId: t.id, body: v.body, as: v.as }); await done(); };
  return <>
    <Crumbs frame={frame} boardId={t.boardId} k={k} go={go} last={t.title} />
    <header className="topic-head">
      <h2 className="topic-name">{t.pinned && <Pin size={16} aria-label="Pinned" />}{t.locked && <Lock size={16} aria-label="Locked" />}{t.title}</h2>
      <p className="muted">{t.kind === 'ic' ? 'In character' : 'Out of character'} · started by {t.by.name} · {t.replies + 1} {t.replies ? 'posts' : 'post'}</p>
      {t.cast.length > 0 && <p className="topic-cast">{t.cast.map(c => <span key={c.id} className="cast-chip"><Portrait k={k} picture={c.picture} name={c.name} className="portrait tiny" />{c.name}</span>)}</p>}
      <ModTools frame={frame} page={page} k={k} done={done} go={go} />
    </header>
    <div className="posts">{page.posts.map((p, i) => <Post key={p.id} p={p} card={p.as ? page.cards[p.as] ?? null : null} k={k} flip={i % 2 === 1} topic={t} onQuote={text => setQuote(q => ({ text, n: (q?.n ?? 0) + 1 }))} done={done} />)}</div>
    {t.canReply ? <section className="reply"><h2 className="category-title">Reply</h2><Composer frame={frame} kind={t.kind} draftKey={`${k}:${t.id}`} quote={quote} preferred={preferred} onPost={send} /></section>
      : <p className="muted locked-note">{t.locked ? 'This topic is locked.' : 'Your group can read this topic but not reply.'}</p>}
  </>;
}
