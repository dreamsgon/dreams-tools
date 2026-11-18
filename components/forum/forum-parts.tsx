'use client';
/*
 * The forum's pieces. Class names follow the campaign theme contract (the Campaign Skin Studio prototype), so a
 * campaign theme can restyle them later: .board-head, .category, .forum, .location, .topic-row, .post, .mini…
 */
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Archive, ArrowUp, Crown, UserRound, Bot, Dices, Flag, EyeOff, Hourglass, Swords, Lock, Pin, MessageSquare, ScrollText, Trash2, Users, X } from 'lucide-react';
import type { ProseBlock } from '@/lib/encyclopedia/player-prose';
import { postBlocks, postInline, withEmoji, type HtmlBlock } from '@/lib/forum/markup';
import type { HtmlNode } from '@/lib/forum/html';
import { forumHash, fullDate, initials, usePicture, when, type Frame, type Picture, type Place } from './forum-api';
import { ROLL_TAG, type Roll } from '@/lib/forum/rolls';
import { Alerts, SearchBox } from './forum-find';

export type Go = (place: Place) => void;
type Row = Frame['boards'][number];
type TopicRowData = Frame['footer']['active'][number];

export function Link({ k, to, go, className, children, title }: { k: string; to: Place; go: Go; className?: string; children: ReactNode; title?: string }) {
  return <a className={className} title={title} href={forumHash(k, to)} onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); go(to); }}>{children}</a>;
}

/**
 * What post text needs from the forum around it: the campaign key (pictures load through it) and the campaign's
 * emoji by code. Outside a forum, emoji show as their :code: and pictures don't load.
 */
export const PostContext = createContext<{ k: string; emoji: ReadonlyMap<string, string> } | null>(null);
/** The features and spells the topic's posts name, as this reader may see them (`kind:character:id`). */
export const SheetContext = createContext<Readonly<Record<string, { name: string; group: string; note: string; text: string }>>>({});
/** A feature or spell named in a post: its name, and its text on hover or focus for readers who may see it. */
function FeatureChip({ kind, char, id, name }: { kind: 'feature' | 'spell'; char: string; id: string; name: string }) {
  const line = useContext(SheetContext)[`${kind}:${char}:${id}`];
  return <span className={`feat feat-${kind}`} tabIndex={line ? 0 : undefined} aria-label={line ? `${name}: ${[line.note, line.text].filter(Boolean).join('. ')}` : name}>
    <span aria-hidden="true">{kind === 'spell' ? '✦' : '◆'}</span> {name}
    {line && (line.note || line.text) && <span className="feat-card" aria-hidden="true"><b>{line.name}</b>{line.group && <small>{line.group}</small>}{line.note && <em>{line.note}</em>}{line.text && <span>{line.text}</span>}</span>}
  </span>;
}
export const emojiMap = (frame: Frame) => new Map(frame.emoji.list.map(e => [e.code, e.imageId]));

/** One of the campaign's emoji, about as tall as the text. */
export function Emoji({ k, imageId, code }: { k: string; imageId: string; code: string }) {
  const src = usePicture(k, imageId);
  // eslint-disable-next-line @next/next/no-img-element -- a private object URL; next/image can't optimise it
  return src ? <img className="emo" src={src} alt={`:${code}:`} title={`:${code}:`} /> : <span className="emo emo-wait" title={`:${code}:`} aria-label={`:${code}:`} />;
}
/** Text with the campaign's :emoji: in it (inside bold, italic, underline and speech). */
function Emojified({ text }: { text: string }) {
  const c = useContext(PostContext);
  if (!c?.emoji.size) return <>{text}</>;
  return <>{withEmoji(text).map((p, i) => p.type === 'emoji' && c.emoji.has(p.code) ? <Emoji key={i} k={c.k} imageId={c.emoji.get(p.code)!} code={p.code} /> : p.type === 'emoji' ? `:${p.code}:` : 'text' in p ? p.text : null)}</>;
}
/** A picture in a post; the words the writer gave it for readers who can't see it. */
function PostPicture({ k, id, alt }: { k: string; id: string; alt: string }) {
  const src = usePicture(k, id);
  // eslint-disable-next-line @next/next/no-img-element -- a private object URL; next/image can't optimise it
  return src ? <img className="post-pic" src={src} alt={alt} loading="lazy" /> : <span className="post-pic post-pic-wait" role="img" aria-label={alt || 'A picture'} />;
}

/** A forum picture inside a post's HTML, with the writer's styles. */
function HtmlPicture({ id, alt, style }: { id: string; alt: string; style: CSSProperties }) {
  const k = useContext(PostContext)?.k, src = usePicture(k ?? '', k ? id : undefined);
  // eslint-disable-next-line @next/next/no-img-element -- a private object URL; next/image can't optimise it
  return src ? <img src={src} alt={alt} style={style} loading="lazy" /> : <span className="post-pic-wait" role="img" aria-label={alt || 'A picture'} style={{ display: 'inline-block', width: 120, height: 80, ...style }} />;
}
const camel = (k: string) => k.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
/**
 * A post's HTML, from the tree html.ts left (allowed tags, attributes and styles only): built as elements, never set
 * as HTML. Links open in a new tab.
 */
export function HtmlTree({ nodes }: { nodes: readonly HtmlNode[] }): ReactNode {
  return <>{nodes.map((n, i) => {
    if (typeof n === 'string') return n;
    const style = Object.fromEntries(Object.entries(n.style).map(([k, v]) => [camel(k), v])) as CSSProperties;
    if (n.tag === 'img') return <HtmlPicture key={i} id={n.attrs.src!} alt={n.attrs.alt ?? ''} style={style} />;
    if (n.tag === 'br' || n.tag === 'hr') { const T = n.tag; return <T key={i} style={style} />; }
    const props: Record<string, unknown> = { key: i, style, ...(n.attrs.title ? { title: n.attrs.title } : {}) };
    if (n.tag === 'a') return n.attrs.href ? <a {...props} key={i} href={n.attrs.href} className="ext" target="_blank" rel="nofollow noopener noreferrer ugc"><HtmlTree nodes={n.children} /></a> : <span {...props} key={i}><HtmlTree nodes={n.children} /></span>;
    if (n.tag === 'td' || n.tag === 'th') { props.colSpan = n.attrs.colspan ? Number(n.attrs.colspan) : undefined; props.rowSpan = n.attrs.rowspan ? Number(n.attrs.rowspan) : undefined; }
    if (n.tag === 'ol' && n.attrs.start) props.start = Number(n.attrs.start);
    if (n.tag === 'details' && 'open' in n.attrs) props.open = true;
    const T = n.tag as 'div';
    return <T {...props} key={i}><HtmlTree nodes={n.children} /></T>;
  })}</>;
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
/** The post's rolls and the index of the first roll tag in this piece of text (tags take results in the order they appear). */
type RollList = { list?: readonly (Roll | null)[]; first: number };
const tagCount = (text: string) => (text.match(ROLL_TAG) ?? []).length;
/** A roll in a post: the dice the server rolled, the total, and Hit or Miss against a number when the tag gave one. */
function RollCard({ r, label, expr, preview }: { r: Roll | null | undefined; label: string; expr: string; preview: boolean }) {
  if (!r) return preview ? <span className="roll-card pending"><Dices size={15} aria-hidden="true" /><b>{label || 'Roll'}</b><span className="roll-expr">{expr}</span><span className="muted small">rolled when you post</span></span>
    : <code>[roll{label ? `=${label}` : ''}]{expr}[/roll]</code>;
  const d20 = r.dice.length === 1 && r.dice[0]!.sides === 20 && r.dice[0]!.keep.filter(Boolean).length === 1 ? r.dice[0]!.values[r.dice[0]!.keep.indexOf(true)] : null;
  const hit = r.vs === null ? null : r.total >= r.vs;
  return <span className="roll-card" title={`${r.expr}${r.at ? ` · rolled again when the post was edited, ${fullDate(r.at)}` : ' · rolled by the forum when posted'}`}>
    <Dices size={15} aria-hidden="true" />
    <span className="roll-what"><b>{r.label || 'Roll'}</b><span className="roll-expr">{r.expr}</span></span>
    <span className="roll-dice" aria-label={`Dice: ${r.dice.map(d => d.values.join(', ')).join('; ')}`}>{r.dice.map((d, i) => <span key={i} className="roll-group">{d.sign < 0 && '−'}{d.values.map((v, j) => <i key={j} className={`${d.keep[j] ? '' : 'drop'}${v === d.sides ? ' max' : v === 1 ? ' min' : ''}`}>{v}</i>)}</span>)}{r.mod !== 0 && <span className="roll-mod">{r.mod > 0 ? '+' : '−'} {Math.abs(r.mod)}</span>}</span>
    <b className="roll-total">{r.total}</b>
    {hit !== null && <span className={`roll-stamp ${hit ? 'hit' : 'miss'}`}>{hit ? 'Hit' : 'Miss'} · vs {r.vs}</span>}
    {d20 === 20 && <span className="roll-stamp nat">Natural 20</span>}{d20 === 1 && <span className="roll-stamp nat1">Natural 1</span>}
    {r.at && <span className="roll-stamp edit">Rerolled on edit</span>}
  </span>;
}
/** One line of post text: bold, italic, underline, code, “speech” and [[page links]] (a link when the reader may open the page) and roll cards. */
function Inline({ text, links, rolls }: { text: string; links?: Links; rolls?: RollList }) {
  const c = useContext(PostContext);
  const parts = postInline(text), nth = parts.map((p, i) => parts.slice(0, i).filter(q => q.type === 'roll').length);
  return <>{parts.map((p, i) => {
    switch (p.type) {
      case 'bold': return <strong key={i}><Emojified text={p.text} /></strong>;
      case 'italic': return <em key={i}><Emojified text={p.text} /></em>;
      case 'underline': return <u key={i}><Emojified text={p.text} /></u>;
      case 'feature': return <FeatureChip key={i} kind={p.kind} char={p.char} id={p.id} name={p.name} />;
      case 'strike': return <s key={i}><Emojified text={p.text} /></s>;
      case 'url': return <a key={i} className="ext" href={p.href} target="_blank" rel="nofollow noopener noreferrer ugc">{p.label}</a>;
      case 'code': return <code key={i}>{p.text}</code>;
      case 'speech': return <span key={i} className="speech"><Emojified text={p.text} /></span>;
      case 'link': { const l = links?.[p.target]; return l ? <a key={i} className="wiki" href={l.url} title={l.summary ? `${l.title}: ${l.summary}` : l.title}>{p.label}</a> : <span key={i} className="wiki">{p.label}</span>; }
      case 'roll': { return <RollCard key={i} r={rolls?.list?.[(rolls?.first ?? 0) + nth[i]!]} label={p.label} expr={p.expr} preview={!rolls?.list} />; }
      case 'emoji': { const id = c?.emoji.get(p.code); return id ? <Emoji key={i} k={c!.k} imageId={id} code={p.code} /> : <span key={i}>:{p.code}:</span>; }
      case 'picture': return c ? <PostPicture key={i} k={c.k} id={p.id} alt={p.alt} /> : <span key={i} className="muted">[picture{p.alt ? `: ${p.alt}` : ''}]</span>;
      default: return <span key={i}>{p.text}</span>;
    }
  })}</>;
}
function Blocks({ blocks, links, rolls }: { blocks: (ProseBlock | HtmlBlock)[]; links?: Links; rolls?: RollList }) {
  const starts = blocks.map((_, i) => (rolls?.first ?? 0) + blocks.slice(0, i).reduce((n, b) => n + ('text' in b ? tagCount(b.text) : 0), 0));
  return <>{blocks.map((b, i) => {
    const r = rolls && { list: rolls.list, first: starts[i]! };
    switch (b.type) {
      case 'heading': { const H = `h${Math.min(b.level + 1, 6)}` as 'h3'; return <H key={i}><Inline text={b.text} links={links} rolls={r} /></H>; }
      case 'bullet': case 'task': return <p className="post-li" key={i} style={{ marginLeft: b.indent * 8 }}>• <Inline text={b.text} links={links} rolls={r} /></p>;
      case 'quote': return <blockquote key={i}><Inline text={b.text} links={links} rolls={r} /></blockquote>;
      case 'code': return <pre key={i}>{b.text || ' '}</pre>;
      case 'html': return <div key={i} className="post-html"><HtmlTree nodes={b.nodes} /></div>;
      case 'paragraph': return <p key={i}><Inline text={b.text} links={links} rolls={r} /></p>;
      default: return null;
    }
  })}</>;
}
/**
 * Post text (lib/forum/markup.ts): page text plus underline, speech, collapsed sections and roll cards. `rolls` are
 * the post's dice in tag order; left out (a preview), roll tags show as still to roll.
 */
export function PostText({ text, links, rolls }: { text: string; links?: Links; rolls?: readonly (Roll | null)[] }) {
  // Roll tags take their results in the order they appear in the whole post, code blocks included.
  const blocks = postBlocks(text), at = (i: number) => blocks.slice(0, i).reduce((n, b) => n + (b.type === 'collapse' ? b.blocks.reduce((m, x) => m + ('text' in x ? tagCount(x.text) : 0), 0) : 'text' in b ? tagCount(b.text) : 0), 0);
  return <div className="prose post-text">{blocks.map((b, i) => b.type === 'collapse'
    ? <details key={i} className="clps"><summary>{b.title}</summary><div className="clps-body"><Blocks blocks={b.blocks} links={links} rolls={{ list: rolls, first: at(i) }} /></div></details>
    : <Blocks key={i} blocks={[b]} links={links} rolls={{ list: rolls, first: at(i) }} />)}</div>;
}

/** The top bar: the in-world date, the staff as circles, and who you are. */
export function TopBar({ frame, k, go, setPlayer }: { frame: Frame; k: string; go: Go; setPlayer?: (on: boolean) => void }) {
  const r = frame.you.rights;
  return <>{frame.solo && setPlayer && <SoloSwitch player={frame.solo.player} setPlayer={setPlayer} />}<div className="board-bar">
    <p className="board-date">{frame.date ? <><b>{frame.date}</b></> : <span className="muted">No calendar date yet</span>}</p>
    <div className="board-staff" aria-label="Staff">{frame.staff.slice(0, 8).map(s => <Circle key={s.name + s.role} name={s.name} title={`${s.name} · ${s.role}`} />)}<span className="muted">Staff</span></div>
    <div className="board-you">
      <SearchBox go={go} />
      {r.boards && <Link k={k} go={go} to={{ view: 'settings' }} className="f-btn ghost small">Forum settings</Link>}
      <Alerts frame={frame} k={k} go={go} />
      {(frame.you.cast.length > 0 || frame.you.waiting.length > 0) && <Waiting frame={frame} k={k} go={go} />}
      <Link k={k} go={go} to={{ view: 'profile' }} className="you" title="Your forum profile: pronouns, timezone, no-goes and post styles"><Circle name={frame.you.name} /><span><b>{frame.you.name}</b><small>{frame.you.posts} {frame.you.posts === 1 ? 'post' : 'posts'} · Profile</small></span></Link>
    </div>
  </div></>;
}

/** A solo campaign's GM view / Player view switch: the player view reads the forum as players would and posts as your characters. */
function SoloSwitch({ player, setPlayer }: { player: boolean; setPlayer: (on: boolean) => void }) {
  return <div className={`solo-bar${player ? ' player' : ''}`}>
    <span className="solo-tag">Solo</span>
    <div className="solo-switch" role="group" aria-label="View the forum as">
      <button type="button" aria-pressed={!player} className={player ? '' : 'on'} onClick={() => player && setPlayer(false)}><Crown size={13} aria-hidden="true" />GM view</button>
      <button type="button" aria-pressed={player} className={player ? 'on' : ''} onClick={() => !player && setPlayer(true)}><UserRound size={13} aria-hidden="true" />Player view</button>
    </div>
    <span className="muted small">{player
      ? 'You see what players see, and post as your player characters or as yourself. GM-only things are hidden.'
      : 'Every GM power, and your player characters are at the top of Post as. Switch to Player view to write your character posts.'}</span>
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

/** One board in the index: location boards with their place art, campaign boards plain, out-of-character boards as cards. Half-width boards sit two to a row. */
function BoardRow({ row, subs, k, go }: { row: Row; subs: Row[]; k: string; go: Go }) {
  const art = usePicture(k, row.place?.picture?.imageId), located = row.type === 'location';
  return <article className={`forum forum-${row.type}${row.kind === 'ic' ? ' forum-ic' : ' forum-ooc'}${row.width === 'half' ? ' half' : ''}`}>
    {located && <div className="forum-art" style={art ? { backgroundImage: `url("${art}")`, backgroundPosition: `${(row.place!.picture!.x * 100).toFixed(1)}% ${(row.place!.picture!.y * 100).toFixed(1)}%` } : undefined} aria-hidden="true" />}
    <div className="forum-info">
      <h3 className="forum-name">{row.unread && <span className="unread-dot" title="New posts" />}<Link k={k} go={go} to={{ view: 'board', id: row.id }}>{row.name}</Link>{row.unread && <span className="sr-only"> (new posts)</span>}{row.locked && <Lock size={13} aria-label="Moderators start topics here" />}</h3>
      {row.description && <p className="forum-desc">{row.description}</p>}
      {subs.length > 0 && <p className="forum-subs">{subs.map(s => <Link key={s.id} k={k} go={go} to={{ view: 'board', id: s.id }} className="chip">{s.name}</Link>)}</p>}
      {row.place && <p className="forum-place">Location · {row.place.url ? <a href={row.place.url}>{row.place.name}</a> : row.place.name}</p>}
      {row.type === 'campaign' && <p className="forum-place">Campaign · in character</p>}
    </div>
    <p className="forum-counts"><span><b>{row.topics}</b> {row.topics === 1 ? 'topic' : 'topics'}</span><span><b>{row.replies}</b> {row.replies === 1 ? 'reply' : 'replies'}</span></p>
    <LastLine last={row.last} k={k} go={go} />
  </article>;
}

export function IndexPage({ frame, k, go }: { frame: Frame; k: string; go: Go }) {
  return <>{frame.categories.map(c => {
    const top = frame.boards.filter(b => b.categoryId === c.id && !b.parentId), kinds = new Set(top.map(b => b.kind));
    // The category's tag says in or out of character only while its boards agree.
    const kind = kinds.size > 1 ? null : top[0]?.kind ?? c.kind;
    return <section key={c.id} className={`category category-${c.kind}`}>
      <h2 className="category-title">{c.name}{kind && <span className="tag">{kind === 'ic' ? 'In character' : 'Out of character'}</span>}</h2>
      <div className="category-forums">
        {top.length ? top.map(b => <BoardRow key={b.id} row={b} subs={frame.boards.filter(x => x.parentId === b.id)} k={k} go={go} />) : <p className="muted empty">No boards here yet.{frame.you.rights.boards && <> <Link k={k} go={go} to={{ view: 'settings' }}>Add one in Forum settings</Link>.</>}</p>}
      </div>
    </section>;
  })}
    {frame.you.rights.moderate && <section className="category category-staff">
      <h2 className="category-title">Staff only <span className="tag">Moderators</span></h2>
      <div className="category-forums"><article className="forum forum-ooc trash-row">
        <div className="forum-info">
          <h3 className="forum-name"><Trash2 size={15} aria-hidden="true" /><Link k={k} go={go} to={{ view: 'trash' }}>Trash can</Link></h3>
          <p className="forum-desc">Topics moved to the Trash wait 30 days, so they can be brought back, then go for good.</p>
        </div>
        <p className="forum-counts"><span><b>{frame.footer.stats.trash}</b> {frame.footer.stats.trash === 1 ? 'topic' : 'topics'}</span></p>
      </article>
      <article className={`forum forum-ooc trash-row${frame.footer.stats.reported ? ' reported' : ''}`}>
        <div className="forum-info">
          <h3 className="forum-name"><Flag size={15} aria-hidden="true" /><Link k={k} go={go} to={{ view: 'reports' }}>Reported posts</Link></h3>
          <p className="forum-desc">Posts readers reported to the moderating team, with their reasons, until you dismiss them.</p>
        </div>
        <p className="forum-counts"><span><b>{frame.footer.stats.reported}</b> {frame.footer.stats.reported === 1 ? 'post' : 'posts'}</span></p>
      </article></div>
    </section>}
  </>;
}

/** A topic in a list. Moderators get a box to pick it for multi-moderation. */
/** One of the forum's preset topic tags, in its colour. */
export const TopicTagChip = ({ tag }: { tag: { label: string; color: string } }) => <span className={`tag topic-tag tc-${tag.color}`}>{tag.label}</span>;

export function TopicRow({ t, k, go, board, pick }: { t: TopicRowData; k: string; go: Go; board?: string; pick?: { on: boolean; set: (on: boolean) => void } }) {
  return <article className={`topic-row${t.pinned ? ' pinned' : ''}${t.unread ? ' unread' : ''}${pick ? ' pickable' : ''}${pick?.on ? ' picked' : ''}`}>
    {pick && <label className="topic-pick"><input type="checkbox" checked={pick.on} onChange={e => pick.set(e.target.checked)} aria-label={`Select ${t.title}`} /></label>}
    <div className="topic-main">
      <h3 className="topic-title">{t.unread && <span className="unread-dot" title="New posts" />}{t.pinned && <span className="tag"><Pin size={11} aria-hidden="true" /> Pinned</span>}{t.locked && <span className="tag"><Lock size={11} aria-hidden="true" /> Locked</span>}{t.archived && <span className="tag"><Archive size={11} aria-hidden="true" /> Archived</span>}{t.combat && <span className="tag fight"><Swords size={11} aria-hidden="true" /> Combat · round {t.combat.round}</span>}{t.only && <span className="tag private" title={`Only for ${t.only.join(', ')} and the GMs`}><EyeOff size={11} aria-hidden="true" /> Private</span>}{t.suggested > 0 && <span className="tag ai-mark" title="Posts your AI suggested, waiting for you to approve, change or skip"><Bot size={11} aria-hidden="true" /> {t.suggested === 1 ? 'AI suggestion' : `${t.suggested} AI suggestions`}</span>}{t.tags.map(x => <TopicTagChip key={x.id} tag={x} />)}<Link k={k} go={go} to={{ view: 'topic', id: t.id }}>{t.title}</Link>{t.unread && <span className="tag new">New</span>}</h3>
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
