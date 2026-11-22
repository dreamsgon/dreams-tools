'use client';
/* Finding your way: alerts in the top bar, the notices strip under the banner, and search. */
import { useEffect, useRef, useState } from 'react';
import { AtSign, Bell, EyeOff, Megaphone, Quote, Search, Swords, X, Flag } from 'lucide-react';
import { forumCall, when, type Frame, type PageData } from './forum-api';
import { Crumbs, Link, Portrait, TopicRow, type Go } from './forum-parts';

type SearchData = Extract<PageData, { kind: 'search' }>;

/** Closes a popover on a click elsewhere or Escape. */
function useAway(open: boolean, close: () => void) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) close(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open, close]);
  return box;
}

const alertText = { mention: 'mentioned you in', quote: 'quoted you in', private: 'added you to the private topic', turn: 'says it’s your turn in', report: 'reported a post in' } as const;
const alertIcon = { mention: AtSign, quote: Quote, private: EyeOff, turn: Swords, report: Flag } as const;

/** The bell: who named you, quoted you, added you to a private topic or says it's your turn. Opening it marks them seen. */
export function Alerts({ frame, k, go }: { frame: Frame; k: string; go: Go }) {
  const a = frame.you.alerts, [open, setOpen] = useState(false), [seen, setSeen] = useState(false);
  const box = useAway(open, () => setOpen(false));
  const count = seen ? 0 : a.unseen;
  const toggle = () => {
    setOpen(o => !o);
    if (!open && a.unseen && !seen) { setSeen(true); void forumCall({ action: 'alertsSeen', campaign: k }).catch(() => setSeen(false)); }
  };
  return <div className="wait-wrap alerts-wrap" ref={box}>
    <button type="button" className={`f-btn ghost small alert-btn${count ? ' due' : ''}`} aria-expanded={open} onClick={toggle} aria-label={count ? `Alerts, ${count} new` : 'Alerts'}>
      <Bell size={13} aria-hidden="true" />Alerts{count > 0 && <span className="wait-count">{count}</span>}
    </button>
    {open && <div className="wait-panel alert-panel" role="dialog" aria-label="Alerts">
      <header><b>Alerts</b><button type="button" className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}><X size={15} /></button></header>
      {a.items.length ? <ul>{a.items.map(x => {
        const Icon = alertIcon[x.kind];
        return <li key={x.id} className={x.fresh ? 'due' : ''}>
          <Portrait k={k} picture={x.picture} name={x.name} className="portrait small" />
          <div><span className="alert-line"><Icon size={12} aria-hidden="true" /><b>{x.name}</b> {alertText[x.kind]}</span>
            <Link k={k} go={p => { setOpen(false); go(p); }} to={{ view: 'topic', id: x.topicId, ...(x.postId ? { post: x.postId } : {}) }}>{x.title}</Link>
            <small>{when(x.at)}</small></div>
        </li>;
      })}</ul> : <p className="muted">Nothing yet. You’ll hear here when someone writes @ and your name or your character’s, quotes you, adds you to a private topic, or a fight comes round to your turn.</p>}
    </div>}
  </div>;
}

/** The search box in the top bar. */
export function SearchBox({ go, board }: { go: Go; board?: string }) {
  const [q, setQ] = useState('');
  return <form className="search-box" role="search" onSubmit={e => { e.preventDefault(); if (q.trim().length >= 2) go({ view: 'search', q: q.trim(), ...(board ? { board } : {}) }); }}>
    <Search size={14} aria-hidden="true" />
    <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search the forum" aria-label="Search the forum" maxLength={100} />
  </form>;
}

/** The notices strip: short lines from the GM under the banner. A reader can hide each one in this browser. */
export function Notices({ frame }: { frame: Frame }) {
  // Hidden notices are kept per browser by their text, so an edited notice shows again.
  const list = frame.settings.notices, [hidden, setHidden] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('forum:hidden-notices') ?? '[]'); } catch { return []; } });
  const keyOf = (n: { id: string; text: string }) => `${n.id}:${n.text.length}:${n.text.slice(0, 40)}`;
  const shown = list.filter(n => !hidden.includes(keyOf(n)));
  if (!shown.length) return null;
  const hide = (n: { id: string; text: string }) => {
    const next = [...hidden, keyOf(n)].slice(-30); setHidden(next);
    try { localStorage.setItem('forum:hidden-notices', JSON.stringify(next)); } catch { /* storage may be off */ }
  };
  return <section className="notices" aria-label="Notices">
    {shown.map(n => <p key={n.id} className="notice"><Megaphone size={14} aria-hidden="true" /><span>{n.text}</span><button type="button" className="icon-btn" aria-label="Hide this notice" onClick={() => hide(n)}><X size={14} /></button></p>)}
  </section>;
}

/** Search results: topics whose title or posts have every word, with the matching posts. */
export function SearchView({ frame, page, k, go }: { frame: Frame; page: SearchData; k: string; go: Go }) {
  const [q, setQ] = useState(page.q), [board, setBoard] = useState(page.boardId ?? '');
  const n = page.results.length;
  return <>
    <Crumbs frame={frame} k={k} go={go} last="Search" />
    <section className="topics search-page">
      <h2 className="category-title"><Search size={15} aria-hidden="true" /> Search</h2>
      <form className="search-form" onSubmit={e => { e.preventDefault(); if (q.trim().length >= 2) go({ view: 'search', q: q.trim(), ...(board ? { board } : {}) }); }}>
        <input type="search" value={q} onChange={e => setQ(e.target.value)} aria-label="Search for" maxLength={100} />
        <label className="f-select">In <select value={board} onChange={e => setBoard(e.target.value)}><option value="">Every board</option>{frame.boards.map(b => <option key={b.id} value={b.id}>{b.parentId ? '— ' : ''}{b.name}</option>)}</select></label>
        <button className="f-btn">Search</button>
      </form>
      <p className="muted">{n ? `${n}${n === 40 ? '+' : ''} ${n === 1 ? 'topic' : 'topics'} with “${page.q}”` : `Nothing found for “${page.q}”.`}{page.of > page.searched ? ` Searched the latest ${page.searched} of ${page.of} topics.` : ''}</p>
      {page.results.map(t => <div key={t.id} className="search-hit">
        <TopicRow t={t} k={k} go={go} board={t.board} />
        {t.hits.length > 0 && <ul className="hit-posts">{t.hits.map(h => <li key={h.postId}><b>{h.name}</b> <small className="muted"><Link k={k} go={go} to={{ view: 'topic', id: t.id, post: h.postId }}>#{h.number}</Link></small><p>{mark(h.snippet, page.q)}</p></li>)}{t.more > 0 && <li className="muted small">and {t.more} more {t.more === 1 ? 'post' : 'posts'}</li>}</ul>}
      </div>)}
    </section>
  </>;
}
/** The words searched for, picked out. */
function mark(text: string, q: string) {
  const words = q.toLocaleLowerCase().split(/\s+/).filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return text;
  return text.split(new RegExp(`(${words.join('|')})`, 'gi')).map((part, i) => i % 2 ? <mark key={i}>{part}</mark> : part);
}
