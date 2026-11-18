'use client';
/*
 * The forum's pieces. Class names follow the campaign theme contract (the Campaign Skin Studio prototype), so a
 * campaign theme can restyle them later: .board-head, .category, .forum, .location, .topic-row, .post, .mini…
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowUp, Hourglass, Lock, Pin, MessageSquare, ScrollText, Users, X } from 'lucide-react';
import type { ProseBlock } from '@/lib/encyclopedia/player-prose';
import { postBlocks, postInline } from '@/lib/forum/markup';
import { forumHash, initials, usePicture, when, type Frame, type Picture, type Place } from './forum-api';

export type Go = (place: Place) => void;
type Row = Frame['boards'][number];
type TopicRowData = Frame['footer']['active'][number];

export function Link({ k, to, go, className, children, title }: { k: string; to: Place; go: Go; className?: string; children: ReactNode; title?: string }) {
  return <a className={className} title={title} href={forumHash(k, to)} onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); go(to); }}>{children}</a>;
}

/** A picture from the campaign, framed the way the Encyclopedia frames it; initials when there is none. */
export function Portrait({ k, picture, name, className = 'portrait', style }: { k: string; picture: Picture | null; name: string; className?: string; style?: CSSProperties }) {
  const src = usePicture(k, picture?.imageId);
  const position = picture ? `${(picture.x * 100).toFixed(1)}% ${(picture.y * 100).toFixed(1)}%` : undefined;
  // eslint-disable-next-line @next/next/no-img-element -- a private object URL; next/image can't optimise it
  const img = <img src={src} alt="" style={{ objectPosition: position }} />;
  return <span className={`${className}${src ? '' : ' portrait-empty'}`} style={style} aria-hidden="true">{src ? img : <span>{initials(name)}</span>}</span>;
}
export const Circle = ({ name, title }: { name: string; title?: string }) => <span className="circ" title={title ?? name} aria-hidden="true">{initials(name)}</span>;

/** A group colour: one of the named colours as a class (each theme sets it), or a picked colour as is. */
export const whoStyle = (color: string | null) => color?.startsWith('#') ? { className: 'who', style: { color } } : { className: `who who-${color ?? 'gm'}`, style: undefined };
type Turn = NonNullable<TopicRowData['next']>;
/** "Your turn as Hero", or "Villain’s turn". */
export const turnText = (t: Turn) => t.mine ? `Your turn as ${t.name}` : `${t.name}’s turn`;

type Links = Record<string, { title: string; url: string; summary: string }>;
/** One line of post text: bold, italic, underline, code, “speech” and [[page links]] (a link when the reader may open the page). */
function Inline({ text, links }: { text: string; links?: Links }) {
  return <>{postInline(text).map((p, i) => {
    switch (p.type) {
      case 'bold': return <strong key={i}>{p.text}</strong>;
      case 'italic': return <em key={i}>{p.text}</em>;
      case 'underline': return <u key={i}>{p.text}</u>;
      case 'code': return <code key={i}>{p.text}</code>;
      case 'speech': return <span key={i} className="speech">{p.text}</span>;
      case 'link': { const l = links?.[p.target]; return l ? <a key={i} className="wiki" href={l.url} title={l.summary ? `${l.title}: ${l.summary}` : l.title}>{p.label}</a> : <span key={i} className="wiki">{p.label}</span>; }
      default: return <span key={i}>{p.text}</span>;
    }
  })}</>;
}
function Blocks({ blocks, links }: { blocks: ProseBlock[]; links?: Links }) {
  return <>{blocks.map((b, i) => {
    switch (b.type) {
      case 'heading': { const H = `h${Math.min(b.level + 1, 6)}` as 'h3'; return <H key={i}><Inline text={b.text} links={links} /></H>; }
      case 'bullet': case 'task': return <p className="post-li" key={i} style={{ marginLeft: b.indent * 8 }}>• <Inline text={b.text} links={links} /></p>;
      case 'quote': return <blockquote key={i}><Inline text={b.text} links={links} /></blockquote>;
      case 'code': return <pre key={i}>{b.text || ' '}</pre>;
      case 'paragraph': return <p key={i}><Inline text={b.text} links={links} /></p>;
      default: return null;
    }
  })}</>;
}
/** Post text (lib/forum/markup.ts): page text plus underline, speech and collapsed sections. */
export function PostText({ text, links }: { text: string; links?: Links }) {
  return <div className="prose post-text">{postBlocks(text).map((b, i) => b.type === 'collapse'
    ? <details key={i} className="clps"><summary>{b.title}</summary><div className="clps-body"><Blocks blocks={b.blocks} links={links} /></div></details>
    : <Blocks key={i} blocks={[b]} links={links} />)}</div>;
}

/** The top bar: the in-world date, the staff as circles, and who you are. */
export function TopBar({ frame, k, go }: { frame: Frame; k: string; go: Go }) {
  const r = frame.you.rights;
  return <div className="board-bar">
    <p className="board-date">{frame.date ? <><b>{frame.date}</b></> : <span className="muted">No calendar date yet</span>}</p>
    <div className="board-staff" aria-label="Staff">{frame.staff.slice(0, 8).map(s => <Circle key={s.name + s.role} name={s.name} title={`${s.name} · ${s.role}`} />)}<span className="muted">Staff</span></div>
    <div className="board-you">
      {r.boards && <Link k={k} go={go} to={{ view: 'settings' }} className="f-btn ghost small">Forum settings</Link>}
      {(frame.you.cast.length > 0 || frame.you.waiting.length > 0) && <Waiting frame={frame} k={k} go={go} />}
      <span className="you"><Circle name={frame.you.name} /><span><b>{frame.you.name}</b><small>{frame.you.posts} {frame.you.posts === 1 ? 'post' : 'posts'}</small></span></span>
    </div>
  </div>;
}

/** Waiting on you: every topic you write in and whose turn it is, yours first. */
function Waiting({ frame, k, go }: { frame: Frame; k: string; go: Go }) {
  const [open, setOpen] = useState(false), box = useRef<HTMLDivElement>(null), list = frame.you.waiting, due = list.filter(t => t.next?.mine).length;
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return <div className="wait-wrap" ref={box}>
    <button type="button" className={`f-btn ghost small wait-btn${due ? ' due' : ''}`} aria-expanded={open} onClick={() => setOpen(o => !o)}>
      <Hourglass size={13} aria-hidden="true" />Waiting on you<span className="wait-count" aria-label={`${due} ${due === 1 ? 'topic' : 'topics'}`}>{due}</span>
    </button>
    {open && <div className="wait-panel" role="dialog" aria-label="Waiting on you">
      <header><b>Waiting on you</b><button type="button" className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}><X size={15} /></button></header>
      {list.length ? <ul>{list.map(t => <li key={t.id} className={t.next?.mine ? 'due' : ''}>
        <Portrait k={k} picture={t.next?.picture ?? null} name={t.next?.name ?? '?'} className="portrait small" />
        <div><Link k={k} go={(p) => { setOpen(false); go(p); }} to={{ view: 'topic', id: t.id }}>{t.title}</Link>
          <small>{t.next ? turnText(t.next) : ''}{t.next && !t.next.mine ? ' · not waiting on you' : ` · waiting since ${when(t.last.at)}`}{t.board ? ` · ${t.board}` : ''}</small></div>
      </li>)}</ul> : <p className="muted">Nothing yet. Topics show here once you and someone else have both posted in one.</p>}
      <p className="muted small">Turns go round in the order people first posted, the GM’s narration included.</p>
    </div>}
  </div>;
}

/** The banner the GM sets: title, tagline, campaign picture and links. */
export function Banner({ frame, k, go }: { frame: Frame; k: string; go: Go }) {
  const src = usePicture(k, frame.banner?.imageId);
  return <header className={`board-head${src ? ' has-art' : ''}`} style={src ? { '--banner': `url("${src}")`, '--banner-y': `${(frame.banner!.y * 100).toFixed(1)}%` } as CSSProperties : undefined}>
    <div className="board-head-text">
      <h1 className="board-title"><Link k={k} go={go} to={{ view: 'index' }}>{frame.settings.title}</Link></h1>
      {frame.settings.tagline && <p className="board-tagline">{frame.settings.tagline}</p>}
    </div>
    <nav className="board-nav" aria-label="Forum links">
      <Link k={k} go={go} to={{ view: 'index' }}>Forum</Link>
      <Link k={k} go={go} to={{ view: 'active' }}>Active topics</Link>
      <Link k={k} go={go} to={{ view: 'members' }}>Members</Link>
      {frame.settings.links.map((l, i) => <a key={i} href={l.url} rel={l.url.startsWith('https://') ? 'noopener noreferrer' : undefined} target={l.url.startsWith('https://') ? '_blank' : undefined}>{l.label}</a>)}
    </nav>
  </header>;
}

function LastLine({ last, k, go }: { last: Row['last']; k: string; go: Go }) {
  if (!last) return <div className="forum-last"><div><span className="last-label">Latest activity</span><small className="muted">No topics yet</small></div></div>;
  return <div className="forum-last">
    <Portrait k={k} picture={last.picture} name={last.name} className="portrait small" />
    <div><span className="last-label">Latest activity</span><Link k={k} go={go} to={{ view: 'topic', id: last.topicId }}>{last.title}</Link><small>by {last.name} · {when(last.at)}</small></div>
  </div>;
}

/** One board in the index: location boards with their place art, out-of-character boards as cards. */
function BoardRow({ row, subs, k, go }: { row: Row; subs: Row[]; k: string; go: Go }) {
  const art = usePicture(k, row.place?.picture?.imageId);
  return <article className={`forum${row.kind === 'ic' ? ' forum-ic' : ' forum-ooc'}`}>
    {row.kind === 'ic' && <div className="forum-art" style={art ? { backgroundImage: `url("${art}")`, backgroundPosition: `${(row.place!.picture!.x * 100).toFixed(1)}% ${(row.place!.picture!.y * 100).toFixed(1)}%` } : undefined} aria-hidden="true" />}
    <div className="forum-info">
      <h3 className="forum-name">{row.unread && <span className="unread-dot" title="New posts" />}<Link k={k} go={go} to={{ view: 'board', id: row.id }}>{row.name}</Link>{row.unread && <span className="sr-only"> (new posts)</span>}{row.locked && <Lock size={13} aria-label="Moderators start topics here" />}</h3>
      {row.description && <p className="forum-desc">{row.description}</p>}
      {subs.length > 0 && <p className="forum-subs">{subs.map(s => <Link key={s.id} k={k} go={go} to={{ view: 'board', id: s.id }} className="chip">{s.name}</Link>)}</p>}
      {row.place && <p className="forum-place">Location · {row.place.url ? <a href={row.place.url}>{row.place.name}</a> : row.place.name}</p>}
    </div>
    <p className="forum-counts"><span><b>{row.topics}</b> {row.topics === 1 ? 'topic' : 'topics'}</span><span><b>{row.replies}</b> {row.replies === 1 ? 'reply' : 'replies'}</span></p>
    <LastLine last={row.last} k={k} go={go} />
  </article>;
}

export function IndexPage({ frame, k, go }: { frame: Frame; k: string; go: Go }) {
  return <>{frame.categories.map(c => {
    const top = frame.boards.filter(b => b.categoryId === c.id && !b.parentId);
    return <section key={c.id} className={`category category-${c.kind}`}>
      <h2 className="category-title">{c.name} <span className="tag">{c.kind === 'ic' ? 'In character' : 'Out of character'}</span></h2>
      <div className="category-forums">
        {top.length ? top.map(b => <BoardRow key={b.id} row={b} subs={frame.boards.filter(x => x.parentId === b.id)} k={k} go={go} />) : <p className="muted empty">No boards here yet.{frame.you.rights.boards && <> <Link k={k} go={go} to={{ view: 'settings' }}>Add one in Forum settings</Link>.</>}</p>}
      </div>
    </section>;
  })}</>;
}

export function TopicRow({ t, k, go, board }: { t: TopicRowData; k: string; go: Go; board?: string }) {
  return <article className={`topic-row${t.pinned ? ' pinned' : ''}${t.unread ? ' unread' : ''}`}>
    <div className="topic-main">
      <h3 className="topic-title">{t.unread && <span className="unread-dot" title="New posts" />}{t.pinned && <span className="tag"><Pin size={11} aria-hidden="true" /> Pinned</span>}{t.locked && <span className="tag"><Lock size={11} aria-hidden="true" /> Locked</span>}<Link k={k} go={go} to={{ view: 'topic', id: t.id }}>{t.title}</Link>{t.unread && <span className="tag new">New</span>}</h3>
      <small>Started by {t.by.name} · {when(t.at)}{board ? ` · ${board}` : ''}</small>
      {t.next && <span className={`turn-line${t.next.mine ? ' mine' : ''}`}><Hourglass size={12} aria-hidden="true" />{turnText(t.next)}</span>}
      {t.cast.length > 0 && <span className="topic-cast" aria-label="Characters in this topic">{t.cast.map(c => <Portrait key={c.id} k={k} picture={c.picture} name={c.name} className="portrait tiny" />)}</span>}
    </div>
    <p className="topic-count"><b>{t.replies}</b> {t.replies === 1 ? 'reply' : 'replies'}</p>
    <div className="topic-last">
      <Portrait k={k} picture={t.last.picture} name={t.last.name} className="portrait small" />
      <small><b>{t.last.name}</b><br />{when(t.last.at)}</small>
    </div>
  </article>;
}

/** Today's posts by each character, in this browser's time zone. */
function postedToday(list: Frame['footer']['today'], now = new Date()) {
  const day = now.toDateString();
  return list.map(c => ({ ...c, n: c.at.filter(a => new Date(a).toDateString() === day).length })).filter(c => c.n > 0);
}

/** The footer: moderating team, active topics and top posters, who's online, who posted today, then the forum's totals. */
export function Footer({ frame, k, go, onReadAll }: { frame: Frame; k: string; go: Go; onReadAll?: () => Promise<void> }) {
  const f = frame.footer, today = postedToday(f.today), [busy, setBusy] = useState(false);
  return <footer className="board-foot">
    <div className="foot-cols">
      <section><h3><Users size={14} aria-hidden="true" />Moderating team</h3><ul className="foot-staff">{frame.staff.map(s => <li key={s.name + s.role}><Circle name={s.name} /><span><b>{s.name}</b><small>{s.role}</small></span></li>)}</ul></section>
      <section><h3><MessageSquare size={14} aria-hidden="true" /><Link k={k} go={go} to={{ view: 'active' }}>Active topics</Link></h3>
        {f.active.length ? <ul className="foot-list">{f.active.map(t => <li key={t.id}><Link k={k} go={go} to={{ view: 'topic', id: t.id }}>{t.title}</Link><small>{t.last.name} · {when(t.last.at)}</small></li>)}</ul> : <p className="muted">Nothing yet.</p>}
        <Link k={k} go={go} to={{ view: 'active' }} className="foot-more">See all active topics</Link></section>
      <section><h3><ScrollText size={14} aria-hidden="true" /><Link k={k} go={go} to={{ view: 'members' }}>Top posters</Link></h3>
        {f.top.length ? <ol className="foot-list">{f.top.map(p => <li key={p.name}><span>{p.name}</span><small>{p.posts} {p.posts === 1 ? 'post' : 'posts'}</small></li>)}</ol> : <p className="muted">No posts yet.</p>}
        <Link k={k} go={go} to={{ view: 'members' }} className="foot-more">All members</Link></section>
    </div>
    <div className="foot-line">
      <h3>Currently online <small>{f.online.length} {f.online.length === 1 ? 'member' : 'members'} in the last 15 minutes</small></h3>
      <p className="foot-names">{f.online.length ? f.online.map((o, i) => { const w = whoStyle(o.color); return <span key={o.name + i} className={w.className} style={w.style}>{o.name}{o.you ? ' (you)' : ''}</span>; }) : <span className="muted">Nobody right now.</span>}</p>
      {f.groups.length > 1 && <p className="foot-legend"><span className="muted">Groups:</span>{f.groups.map(g => { const w = whoStyle(g.color); return <span key={g.name} className={w.className} style={w.style}>{g.name}</span>; })}</p>}
    </div>
    <div className="foot-line">
      <h3>Characters who posted today <small>{today.length} {today.length === 1 ? 'character' : 'characters'}, {today.reduce((n, c) => n + c.n, 0)} posts</small></h3>
      {today.length ? <p className="foot-today">{today.map(c => {
        const inner = <><Portrait k={k} picture={c.picture} name={c.name} className="portrait tiny" />{c.name}<small>{c.n}</small></>;
        return c.url ? <a key={c.id} href={c.url} className="today-chip">{inner}</a> : <span key={c.id} className="today-chip">{inner}</span>;
      })}</p> : <p className="muted foot-names">No posts in character yet today.</p>}
    </div>
    <div className="foot-stats">
      <span><b>{f.stats.members}</b> {f.stats.members === 1 ? 'member' : 'members'}</span>
      <span><b>{f.stats.characters}</b> {f.stats.characters === 1 ? 'character' : 'characters'}</span>
      <span><b>{f.stats.topics}</b> {f.stats.topics === 1 ? 'topic' : 'topics'}</span>
      <span><b>{f.stats.posts}</b> {f.stats.posts === 1 ? 'post' : 'posts'}</span>
      {f.stats.peak && <span title={new Date(f.stats.peak.at).toLocaleString()}>Most online at once: <b>{f.stats.peak.count}</b></span>}
      {f.stats.newest && <span>Newest member: <b>{f.stats.newest}</b></span>}
      <span className="foot-spacer" />
      {onReadAll && frame.you.unread > 0 && <button type="button" className="link-btn" disabled={busy} onClick={() => { setBusy(true); void onReadAll().finally(() => setBusy(false)); }}>{busy ? 'Marking…' : 'Mark all as read'}</button>}
      <a href="#top" className="link-btn" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><ArrowUp size={12} aria-hidden="true" />Back to top</a>
    </div>
  </footer>;
}

/** Breadcrumbs: Forum › category › board (› topic). */
export function Crumbs({ frame, boardId, k, go, last }: { frame: Frame; boardId?: string; k: string; go: Go; last?: string }) {
  const board = frame.boards.find(b => b.id === boardId), parent = board?.parentId ? frame.boards.find(b => b.id === board.parentId) : undefined, cat = frame.categories.find(c => c.id === board?.categoryId);
  return <nav className="crumbs" aria-label="Breadcrumb">
    <Link k={k} go={go} to={{ view: 'index' }}>Forum</Link>
    {cat && <><span aria-hidden="true">›</span><span>{cat.name}</span></>}
    {parent && <><span aria-hidden="true">›</span><Link k={k} go={go} to={{ view: 'board', id: parent.id }}>{parent.name}</Link></>}
    {board && <><span aria-hidden="true">›</span>{last ? <Link k={k} go={go} to={{ view: 'board', id: board.id }}>{board.name}</Link> : <span aria-current="page">{board.name}</span>}</>}
    {last && <><span aria-hidden="true">›</span><span aria-current="page">{last}</span></>}
  </nav>;
}

/** A round Back to top button that shows once the page has been scrolled a long way. */
export function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(window.scrollY > 900);
    on(); window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return <button type="button" className={`to-top${show ? ' show' : ''}`} aria-label="Back to top" tabIndex={show ? 0 : -1} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><ArrowUp size={18} /></button>;
}

/** Shown while a hover card is open on a phone, where there's no hover: tap the portrait. */
export function useToggle() { const [open, setOpen] = useState(false); return { open, toggle: () => setOpen(o => !o), close: () => setOpen(false) }; }
