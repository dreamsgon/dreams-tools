'use client';
/*
 * A board's topic list; a topic's posts with their 250×400 portraits and hover cards, the GM's narration and the
 * Quick reply; the full reply page (with focus mode and the topic newest first under it) and the edit page.
 */
import { Fragment, useEffect, useState } from 'react';
import { Archive, ArchiveRestore, Check, EyeOff, Flag, Sparkles, Swords, Hourglass, Lock, Maximize2, Minimize2, Pin, Pencil, Printer, Quote, Reply, Trash2, PenLine } from 'lucide-react';
import { confirmDialog } from '../confirm-dialog';
import { forumCall, fullDate, when, type BoardPage, type Frame, type Place, type TopicPage } from './forum-api';
import { Composer, TagChoice, type AfterPost } from './forum-compose';
import { Circle, Crumbs, Link, Portrait, PostText, TopicRow, TopicTagChip, turnText, type Go } from './forum-parts';
import { BoardDownload, ModBar, PrivatePicker, TrashedBanner } from './forum-moderate';
import { CombatPanel, CombatSetup } from './forum-combat';
import { AiTopicHelp } from './forum-ai';
import { SuggestedPosts } from './forum-suggested';
import { CardRows, PlayerStrip } from './forum-profile';

type Done = (place?: Place) => Promise<void>;

/** Pins or locks a topic after posting, when a moderator chose that. */
async function afterPosting(k: string, topicId: string, after: AfterPost) {
  if (!after) return;
  await forumCall({ action: 'topic', campaign: k, topicId, ...(after !== 'lock' ? { pinned: true } : {}), ...(after !== 'pin' ? { locked: true } : {}) });
}

export function BoardView({ frame, page, k, go, done, startOpen }: { frame: Frame; page: BoardPage; k: string; go: Go; done: Done; startOpen?: boolean }) {
  const b = page.board, art = b.place?.picture ?? null, [writing, setWriting] = useState(!!startOpen && b.start && !page.archive), r = frame.you.rights;
  const subs = frame.boards.filter(x => x.parentId === b.id), canStart = b.start && !page.archive;
  const [only, setOnly] = useState<string[] | null>(null), [picked, setPicked] = useState<string[]>([]);
  const shown = new Set(page.topics.map(t => t.id)), chosen = picked.filter(id => shown.has(id));
  const start = async (v: { title: string; body: string; as: string | null; after: AfterPost; ai: boolean; tags: string[] }) => {
    const out = await forumCall<{ topicId: string }>({ action: 'start', campaign: k, boardId: b.id, title: v.title, body: v.body, as: v.as, ...(only ? { private: only } : {}), ...(v.ai ? { ai: true } : {}), ...(v.tags.length ? { tags: v.tags } : {}) });
    await afterPosting(k, out.topicId, v.after);
    setWriting(false); setOnly(null); await done({ view: 'topic', id: out.topicId });
  };
  const all = page.topics.length > 0 && chosen.length === page.topics.length;
  return <>
    <Crumbs frame={frame} boardId={b.id} k={k} go={go} last={page.archive ? 'Archive' : undefined} />
    {b.type === 'location' ? <header className="location">
      <Portrait k={k} picture={art} name={b.place?.name ?? b.name} className="portrait location-art" />
      <div className="location-info">
        <p className="location-kind">Location{b.place ? ` · ${b.place.name}` : ''}</p>
        <h2 className="location-name">{b.name}</h2>
        {(b.description || page.place?.summary) && <p className="location-summary">{b.description || page.place?.summary}</p>}
        <p className="location-now">{frame.date && <><b>{frame.date}</b> · </>}{b.topics} {b.topics === 1 ? 'topic' : 'topics'} · {b.replies} {b.replies === 1 ? 'reply' : 'replies'}{b.place?.url && <> · <a href={b.place.url}>Read about it in the Encyclopedia</a></>}</p>
      </div>
    </header> : <header className="topic-head board-plain">{b.kind === 'ic' && <p className="location-kind">Campaign · in character</p>}<h2 className="location-name">{b.name}</h2>{b.description && <p className="location-summary">{b.description}</p>}</header>}
    {subs.length > 0 && !page.archive && <section className="subforums"><h2 className="category-title">Subforums</h2>{subs.map(s => <Link key={s.id} k={k} go={go} to={{ view: 'board', id: s.id }} className="forum sub"><span className="forum-name">{s.name}</span><small>{s.topics} topics · {s.replies} replies</small></Link>)}</section>}
    <section className="topics">
      <div className="topics-head">
        <h2 className="category-title">{page.archive ? <><Archive size={15} aria-hidden="true" /> Archive</> : 'Topics'}</h2>
        <span className="topics-tools">
          {page.archive ? <Link k={k} go={go} to={{ view: 'board', id: b.id }} className="f-btn ghost small">Back to the topics</Link>
            : page.archived > 0 && <Link k={k} go={go} to={{ view: 'board', id: b.id, archive: true }} className="f-btn ghost small"><Archive size={13} aria-hidden="true" />Archive ({page.archived})</Link>}
          {r.gm && page.topics.length > 0 && <BoardDownload k={k} boardId={b.id} name={`${frame.settings.title} - ${b.name}`} />}
          {canStart && !writing && <button className="f-btn" onClick={() => setWriting(true)}><PenLine size={14} aria-hidden="true" />New topic</button>}
        </span>
      </div>
      {page.archive && <p className="muted">Finished topics, kept to read. Nobody can reply until a moderator brings one back.</p>}
      {writing && <>
        <PrivatePicker frame={frame} value={only} onChange={setOnly} />
        <Composer frame={frame} k={k} kind={b.kind} title after mode="full" label={only ? 'New private topic' : 'New topic'} draftKey={`${k}:new:${b.id}`} where={{ boardId: b.id }} html={b.html} onPost={start} onCancel={() => { setWriting(false); setOnly(null); }} />
      </>}
      {r.moderate && page.topics.length > 0 && <div className="mod-pickall"><label className="check"><input type="checkbox" checked={all} onChange={e => setPicked(e.target.checked ? page.topics.map(t => t.id) : [])} />Select all</label></div>}
      <ModBar frame={frame} k={k} picked={chosen} kind={b.kind} archive={page.archive} clear={() => setPicked([])} done={() => done()} />
      {page.topics.length ? page.topics.map(t => <TopicRow key={t.id} t={t} k={k} go={go} pick={r.moderate ? { on: chosen.includes(t.id), set: on => setPicked(p => on ? [...p, t.id] : p.filter(x => x !== t.id)) } : undefined} />)
        : <p className="muted empty">{page.archive ? 'Nothing is archived here.' : <>No topics yet.{canStart && ' Start the first one.'}</>}</p>}
    </section>
  </>;
}

type PostData = TopicPage['posts'][number];
type CardData = TopicPage['cards'][string];

/** The character card that fades in over the portrait: picked fields from what players may read. */
function HoverCard({ card }: { card: CardData }) {
  return <div className="mini-card" role="tooltip">
    <p className="mini-name">{card.name}</p>
    {card.rows ? (card.rows.length ? <CardRows rows={card.rows} /> : <p className="mini-quote">Nothing shared about them yet.</p>) : <>
    <p className="mini-role">{card.role}</p>
    {card.traits.length > 0 && <p className="mini-traits">{card.traits.map(t => <span key={t} className="chip">{t}</span>)}</p>}
    {card.fields.length > 0 ? <dl className="mini-fields">{card.fields.map(f => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl> : <p className="mini-quote">Nothing shared about them yet.</p>}</>}
    {card.url && <a className="mini-link" href={card.url}>Open their page</a>}
  </div>;
}

function Post({ p, card, k, go, flip, fresh, topic, links, onQuote, done }: { p: PostData; card: CardData | null; k: string; go: Go; flip: boolean; fresh: boolean; topic: TopicPage['topic']; links: TopicPage['links']; onQuote: (text: string) => void; done: Done }) {
  const [error, setError] = useState(''), [open, setOpen] = useState(false), [reporting, setReporting] = useState(false), [reason, setReason] = useState(''), [sent, setSent] = useState(false);
  const report = async () => {
    setError('');
    try { await forumCall({ action: 'report', campaign: k, topicId: topic.id, postId: p.id, reason }); setReporting(false); setReason(''); setSent(true); } catch (e) { setError(e instanceof Error ? e.message : 'Could not report it.'); }
  };
  const dismiss = async () => { try { await forumCall({ action: 'dismissReports', campaign: k, postId: p.id }); await done(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not dismiss them.'); } };
  const remove = async () => {
    if (!await confirmDialog({ title: 'Delete this post?', message: 'It comes off the post count too. This can’t be undone.', confirm: 'Delete post', danger: true })) return;
    try { await forumCall({ action: 'delete', campaign: k, topicId: topic.id, postId: p.id }); await done(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete.'); }
  };
  // In character, a post written as nobody is the GM's narration.
  const narration = !card && topic.kind === 'ic' && !p.as, name = card?.name ?? (narration ? 'Game Master' : p.name);
  const quote = () => onQuote(p.body.split('\n').filter(l => l.trim()).slice(0, 3).map(l => '> ' + l.replace(/^>\s?/, '')).join('\n') + `\n> — ${name}`);
  const meta = <span className="post-meta"><a href={`#post-${p.id}`} onClick={e => { e.preventDefault(); document.getElementById(`post-${p.id}`)?.scrollIntoView({ behavior: 'smooth' }); }}>#{p.number}</a> · <time dateTime={p.at} title={fullDate(p.at)}>{when(p.at)}</time>{fresh && <span className="tag new">New</span>}{p.editedAt && <span className="muted" title={fullDate(p.editedAt)}> · edited</span>}{p.ai && <span className="tag ai-mark" title={`Drafted with the forum’s AI and posted by ${p.name}`}><Sparkles size={10} aria-hidden="true" />AI draft</span>}{p.turn && <span className="tag turn-meta" title={`Written in round ${p.turn.round}, turn ${p.turn.n} of ${p.turn.of}: ${p.turn.name}`}><Swords size={10} aria-hidden="true" />R{p.turn.round} · {p.turn.name}</span>}{p.reports.length > 0 && <span className="tag reported" title={p.reports.map(r => `${r.by}: ${r.reason}`).join('\n')}><Flag size={10} aria-hidden="true" />Reported{p.reports.length > 1 ? ` ×${p.reports.length}` : ''}</span>}</span>;
  const actions = <><footer className="post-actions">
    {topic.canReply && <button type="button" onClick={quote}><Quote size={13} aria-hidden="true" />Quote</button>}
    {p.canEdit && <button type="button" onClick={() => go({ view: 'edit', id: topic.id, post: p.id })}><Pencil size={13} aria-hidden="true" />Edit</button>}
    {p.canDelete && <button type="button" onClick={() => void remove()}><Trash2 size={13} aria-hidden="true" />Delete</button>}
    {p.reports.length > 0 && <button type="button" onClick={() => void dismiss()}><Check size={13} aria-hidden="true" />Dismiss reports</button>}
    {p.canReport && !reporting && <button type="button" className="report-btn" disabled={sent} onClick={() => setReporting(true)}><Flag size={13} aria-hidden="true" />{sent || p.reported ? 'Reported' : 'Report'}</button>}
  </footer>
    {reporting && <form className="report-form" onSubmit={e => { e.preventDefault(); void report(); }}>
      <input autoFocus value={reason} maxLength={300} onChange={e => setReason(e.target.value)} placeholder="What’s wrong? The moderators see this and your name." aria-label="Why you’re reporting this post" />
      <button type="submit" className="f-btn small" disabled={!reason.trim()}>Send report</button>
      <button type="button" className="f-btn ghost small" onClick={() => { setReporting(false); setReason(''); }}>Cancel</button>
    </form>}
  </>;
  if (narration) return <article className={`post post-gm${fresh ? ' fresh' : ''}`} id={`post-${p.id}`}>
    <header className="gm-band"><span className="gm-seal" aria-hidden="true">✦</span><div><h3 className="post-name">Game Master</h3><small>Narration by {p.name}</small></div>{meta}</header>
    <div className="gm-body"><PostText text={p.body} links={links} rolls={p.rolls} />{actions}{error && <p className="form-error" role="alert">{error}</p>}</div>
  </article>;
  return <article className={`post${flip ? ' flip' : ''}${card ? ' post-ic' : ' post-ooc'}${fresh ? ' fresh' : ''}`} id={`post-${p.id}`}>
    <header className="post-band"><h3 className="post-name">{card?.url ? <a href={card.url}>{name}</a> : name}</h3>{meta}</header>
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
        <div className="post-body"><PostText text={p.body} links={links} rolls={p.rolls} /></div>
        {actions}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </div>
    <PlayerStrip items={p.strip} />
  </article>;
}

function ModTools({ frame, page, k, done, go, fight }: { frame: Frame; page: TopicPage; k: string; done: Done; go: Go; fight?: () => void }) {
  const t = page.topic, r = frame.you.rights, [error, setError] = useState(''), [renaming, setRenaming] = useState(false), [title, setTitle] = useState(t.title), [tags, setTags] = useState(t.tags.map(x => x.id));
  const call = async (body: Record<string, unknown>) => { setError(''); try { await forumCall({ campaign: k, topicId: t.id, ...body }); await done(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not change the topic.'); } };
  const sameKind = frame.boards.filter(b => b.kind === t.kind);
  const trash = async () => {
    if (!await confirmDialog({ title: 'Move this topic to the Trash?', message: `Moderators can bring “${t.title}” back from the Trash for 30 days. After that it goes for good.`, confirm: 'Move to Trash', danger: true })) return;
    try { await forumCall({ action: 'trash', campaign: k, topicId: t.id }); go({ view: 'board', id: t.boardId }); } catch (e) { setError(e instanceof Error ? e.message : 'Could not move it to the Trash.'); }
  };
  const print = <Link k={k} go={go} to={{ view: 'print', id: t.id }} className="f-btn ghost small"><Printer size={13} aria-hidden="true" />Print · download</Link>;
  if (t.trashed) return null;
  return <div className="mod-tools">
    {renaming ? <form className="rename-form" onSubmit={e => { e.preventDefault(); void call({ action: 'topic', title, ...(frame.topicTags.length ? { tags } : {}) }).then(() => setRenaming(false)); }}><input value={title} maxLength={120} onChange={e => setTitle(e.target.value)} aria-label="Topic title" />
        {frame.topicTags.length > 0 && <TagChoice frame={frame} tags={tags} set={setTags} />}
        <button className="f-btn small">Save</button><button type="button" className="f-btn ghost small" onClick={() => { setRenaming(false); setTitle(t.title); setTags(t.tags.map(x => x.id)); }}>Cancel</button></form>
      : t.canRename && <button className="f-btn ghost small" onClick={() => setRenaming(true)}><Pencil size={13} aria-hidden="true" />{frame.topicTags.length ? 'Title and tags' : 'Rename'}</button>}
    {r.moderate && <>
      {!t.archived && <button className="f-btn ghost small" onClick={() => void call({ action: 'topic', pinned: !t.pinned })}><Pin size={13} aria-hidden="true" />{t.pinned ? 'Unpin' : 'Pin'}</button>}
      {!t.archived && <button className="f-btn ghost small" onClick={() => void call({ action: 'topic', locked: !t.locked })}><Lock size={13} aria-hidden="true" />{t.locked ? 'Unlock' : 'Lock'}</button>}
      <button className="f-btn ghost small" onClick={() => void call({ action: 'topic', archived: !t.archived })}>{t.archived ? <><ArchiveRestore size={13} aria-hidden="true" />Bring back</> : <><Archive size={13} aria-hidden="true" />Archive</>}</button>
      <label className="f-select small">Move to <select value={t.boardId} onChange={e => void call({ action: 'topic', boardId: e.target.value })}>{sameKind.map(b => <option key={b.id} value={b.id}>{b.parentId ? '— ' : ''}{b.name}</option>)}</select></label>
      {fight && <button className="f-btn ghost small" onClick={fight}><Swords size={13} aria-hidden="true" />Start combat</button>}
      <button className="f-btn ghost small danger" onClick={() => void trash()}><Trash2 size={13} aria-hidden="true" />Move to Trash</button>
    </>}
    {print}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}

/** Why a topic takes no replies. */
const closedNote = (t: TopicPage['topic']) => t.trashed ? 'This topic is in the Trash.' : t.archived ? 'This topic is archived. A moderator can bring it back to reply.' : t.locked ? 'This topic is locked.' : 'Your group can read this topic but not reply.';

export function TopicView({ frame, page, k, go, done }: { frame: Frame; page: TopicPage; k: string; go: Go; done: Done }) {
  const t = page.topic, [quote, setQuote] = useState<{ text: string; n: number }>(), [setup, setSetup] = useState(false);
  const canFight = frame.you.rights.moderate && t.kind === 'ic' && !page.combat && !t.archived && !t.trashed;
  const slot = page.combat?.order.find(s => s.now);
  const yours = slot?.as.filter(x => x.mine && !x.done).map(x => x.name) ?? [];
  // What was new when the topic was opened stays marked while you read, though the server now has it read.
  const [readBefore] = useState(page.readBefore);
  const isFresh = (p: TopicPage['posts'][number]) => !!readBefore && !p.mine && p.at > readBefore;
  const firstNew = page.posts.find(isFresh);
  useEffect(() => {
    if (firstNew && firstNew.number > 1 && !location.hash.includes('post-')) document.getElementById(`post-${firstNew.id}`)?.scrollIntoView({ block: 'start' });
    // Only when the topic opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Reply as the character you last posted as here.
  const mine = [...page.posts].reverse().find(p => p.mine), preferred = mine ? mine.as : undefined;
  const send = async (v: { body: string; as: string | null; after: AfterPost; ai: boolean }) => { await sendReply(k, t.id, v); await done(); };
  const addReply = t.canReply && <button type="button" className="f-btn" onClick={() => go({ view: 'reply', id: t.id })}><Reply size={14} aria-hidden="true" />Add reply</button>;
  return <>
    <Crumbs frame={frame} boardId={t.boardId} k={k} go={go} last={t.title} />
    <header className="topic-head">
      <div className="topic-title-row"><h2 className="topic-name">{t.pinned && <Pin size={16} aria-label="Pinned" />}{t.locked && <Lock size={16} aria-label="Locked" />}{t.archived && <Archive size={16} aria-label="Archived" />}{t.title}</h2>{addReply}</div>
      {t.tags.length > 0 && <p className="topic-tags">{t.tags.map(x => <TopicTagChip key={x.id} tag={x} />)}</p>}
      <p className="muted">{t.kind === 'ic' ? 'In character' : 'Out of character'} · started by {t.by.name} · {t.replies + 1} {t.replies ? 'posts' : 'post'}</p>
      {t.only && <p className="private-line"><EyeOff size={13} aria-hidden="true" />Private: only {t.only.join(', ')} and the GMs can see this topic.</p>}
      <TrashedBanner t={t} k={k} go={go} done={() => done()} />
      {t.next && <p className={`turn-line${t.next.mine ? ' mine' : ''}`}><Hourglass size={13} aria-hidden="true" />{turnText(t.next)}{firstNew && <> · <a href={`#post-${firstNew.id}`} onClick={e => { e.preventDefault(); document.getElementById(`post-${firstNew.id}`)?.scrollIntoView({ behavior: 'smooth' }); }}>First new post</a></>}</p>}
      {!t.next && firstNew && <p className="turn-line"><a href={`#post-${firstNew.id}`} onClick={e => { e.preventDefault(); document.getElementById(`post-${firstNew.id}`)?.scrollIntoView({ behavior: 'smooth' }); }}>First new post</a></p>}
      {t.cast.length > 0 && <p className="topic-cast">{t.cast.map(c => <span key={c.id} className="cast-chip"><Portrait k={k} picture={c.picture} name={c.name} className="portrait tiny" />{c.name}</span>)}</p>}
      <AiTopicHelp frame={frame} page={page} k={k} since={readBefore} />
      <ModTools frame={frame} page={page} k={k} done={done} go={go} fight={canFight && !setup ? () => setSetup(true) : undefined} />
    </header>
    {setup && canFight && <CombatSetup frame={frame} page={page} k={k} onCancel={() => setSetup(false)} done={async () => { setSetup(false); await done(); }} />}
    <CombatPanel frame={frame} page={page} k={k} done={() => done()} />
    <div className="posts">{page.posts.map((p, i) => <Fragment key={p.id}>{p.turn && p.turn.round !== page.posts[i - 1]?.turn?.round && <p className="sysline"><Swords size={13} aria-hidden="true" />{page.posts[i - 1]?.turn ? `Round ${p.turn.round}` : `Combat · round ${p.turn.round}`}</p>}<Post p={p} card={p.as ? page.cards[p.as] ?? null : null} k={k} go={go} flip={i % 2 === 1} fresh={isFresh(p)} topic={t} links={page.links} onQuote={text => setQuote(q => ({ text, n: (q?.n ?? 0) + 1 }))} done={done} /></Fragment>)}</div>
    <SuggestedPosts page={page} k={k} done={() => done()} />
    {t.canReply ? <section className="reply">
      {slot && t.next?.mine && <p className="your-turn"><Swords size={15} aria-hidden="true" /><span>It’s your turn in round {page.combat!.round}{yours.length ? <> as <b>{yours.join(' and ')}</b></> : <>: <b>{slot.name}</b></>}. {slot.as.length ? (slot.as.length > 1 ? `${slot.name} is a group turn: it moves on once each of them has posted.` : 'Posting as them moves the fight on.') : 'Narration, or a post as an NPC, moves the fight on.'}</span></p>}
      <div className="reply-head"><h2 className="category-title">Quick reply</h2>{addReply && <span className="reply-full">For more room, a preview of the topic and focus mode, use {addReply}</span>}</div>
      <Composer frame={frame} k={k} kind={t.kind} html={!!frame.boards.find(b => b.id === t.boardId)?.html} draftKey={`${k}:${t.id}`} where={{ topicId: t.id }} quote={quote} preferred={preferred} onPost={send} after label="Quick reply" />
    </section>
      : <p className="muted locked-note">{closedNote(t)}</p>}
  </>;
}

async function sendReply(k: string, topicId: string, v: { body: string; as: string | null; after: AfterPost; ai: boolean }) {
  await forumCall({ action: 'reply', campaign: k, topicId, body: v.body, as: v.as, ...(v.ai ? { ai: true } : {}) });
  await afterPosting(k, topicId, v.after);
}

/** The latest posts, newest first, under the full reply and edit pages (Jcink's topic review). */
function TopicReview({ page, k }: { page: TopicPage; k: string }) {
  const posts = [...page.posts].reverse().slice(0, 15);
  return <section className="review" aria-label="Topic review">
    <h2 className="category-title">Topic review <small className="muted">newest first{page.posts.length > posts.length ? ` · the last ${posts.length} of ${page.posts.length}` : ''}</small></h2>
    {posts.map(p => {
      const card = p.as ? page.cards[p.as] : null, name = card?.name ?? (page.topic.kind === 'ic' ? 'Game Master' : p.name);
      return <article key={p.id} className="review-post">
        <header>{!card && page.topic.kind === 'ic' ? <span className="as-seal tiny" aria-hidden="true">✦</span> : <Portrait k={k} picture={card?.picture ?? null} name={name} className="portrait tiny" />}<b>{name}</b><small className="muted">#{p.number} · {when(p.at)}</small></header>
        <PostText text={p.body} links={page.links} rolls={p.rolls} />
      </article>;
    })}
  </section>;
}

/** Focus mode: the page's chrome fades away and the box fills the window. Escape leaves it. */
function useFocusMode() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle('forum-focus', on);
    if (!on) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOn(false); };
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('keydown', esc); document.documentElement.classList.remove('forum-focus'); };
  }, [on]);
  const button = <button type="button" className="f-btn ghost small" aria-pressed={on} onClick={() => setOn(o => !o)}>{on ? <><Minimize2 size={13} aria-hidden="true" />Leave focus mode</> : <><Maximize2 size={13} aria-hidden="true" />Focus mode</>}</button>;
  return { on, button };
}

/** The full reply page: a bigger box, focus mode and the topic's latest posts newest first underneath. */
export function ReplyView({ frame, page, k, go, done }: { frame: Frame; page: TopicPage; k: string; go: Go; done: Done }) {
  const t = page.topic, focus = useFocusMode(), mine = [...page.posts].reverse().find(p => p.mine);
  const send = async (v: { body: string; as: string | null; after: AfterPost; ai: boolean }) => { await sendReply(k, t.id, v); await done({ view: 'topic', id: t.id }); };
  if (!t.canReply) return <><Crumbs frame={frame} boardId={t.boardId} k={k} go={go} last={t.title} /><p className="muted locked-note">{closedNote(t)}</p></>;
  return <div className={`reply-page${focus.on ? ' focus' : ''}`}>
    <Crumbs frame={frame} boardId={t.boardId} k={k} go={go} last={t.title} />
    <header className="page-head"><h2 className="topic-name">Reply to {t.title}</h2>{focus.button}</header>
    {t.next && <p className={`turn-line${t.next.mine ? ' mine' : ''}`}><Hourglass size={13} aria-hidden="true" />{turnText(t.next)}</p>}
    <Composer frame={frame} k={k} kind={t.kind} html={!!frame.boards.find(b => b.id === t.boardId)?.html} draftKey={`${k}:${t.id}`} where={{ topicId: t.id }} preferred={mine ? mine.as : undefined} onPost={send} after mode="full" big label="Full reply" onCancel={() => go({ view: 'topic', id: t.id })} foot={focus.on ? focus.button : undefined} />
    {!focus.on && <TopicReview page={page} k={k} />}
  </div>;
}

/** The full edit page for one post. */
export function EditView({ frame, page, k, go, done, postId }: { frame: Frame; page: TopicPage; k: string; go: Go; done: Done; postId: string }) {
  const t = page.topic, p = page.posts.find(x => x.id === postId), focus = useFocusMode();
  if (!p || !p.canEdit) return <><Crumbs frame={frame} boardId={t.boardId} k={k} go={go} last={t.title} /><p className="muted locked-note">{p ? 'You can’t edit this post.' : 'That post was removed.'}</p></>;
  const save = async (v: { body: string }) => { await forumCall({ action: 'edit', campaign: k, topicId: t.id, postId: p.id, body: v.body }); await done({ view: 'topic', id: t.id }); };
  const card = p.as ? page.cards[p.as] : null;
  return <div className={`reply-page${focus.on ? ' focus' : ''}`}>
    <Crumbs frame={frame} boardId={t.boardId} k={k} go={go} last={t.title} />
    <header className="page-head"><h2 className="topic-name">Edit post #{p.number}</h2>{focus.button}</header>
    <p className="muted">Written as <b>{card?.name ?? (t.kind === 'ic' ? 'Game Master' : p.name)}</b> · {fullDate(p.at)}</p>
    <Composer frame={frame} k={k} kind={t.kind} html={!!frame.boards.find(b => b.id === t.boardId)?.html} mode="edit" initial={p.body} draftKey={`${k}:edit:${p.id}`} onPost={save} big label="Edit" onCancel={() => go({ view: 'topic', id: t.id })} foot={focus.on ? focus.button : undefined} />
    {!focus.on && <TopicReview page={page} k={k} />}
  </div>;
}
