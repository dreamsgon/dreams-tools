'use client';
/*
 * A campaign's forum: /forum#c-<campaign id> for the GM, /forum#m-<ref> for a member. The page in the hash after the
 * key (&board=, &topic=, &view=) so links can be shared and the back button works. Refreshes every 20 seconds while
 * the tab is visible. With no key, /forum lists the forums you can open (forum-pick.tsx).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ThemeToggle } from '../encyclopedia/theme';
import { ForumRequestError, forumCall, forumHash, pageOf, parseForumHash, validKey, type Place, type View } from './forum-api';
import { BackToTop, Banner, Crumbs, Footer, IndexPage, TopBar, TopicRow, Circle, whoStyle, PostContext, emojiMap } from './forum-parts';
import { BoardView, EditView, ReplyView, TopicView } from './forum-topic';
import { SettingsView } from './forum-settings';
import { PrintView, ReportsView, TrashView } from './forum-moderate';
import { Notices, SearchView } from './forum-find';
import { ForumPicker } from './forum-pick';

export default function ForumApp() {
  const [key, setKey] = useState(''), [place, setPlace] = useState<Place>({ view: 'index' }), [view, setView] = useState<View | null>(null);
  const [error, setError] = useState(''), [status, setStatus] = useState(0), [loading, setLoading] = useState(true);
  const request = useRef<AbortController | null>(null), shown = useRef('');

  const load = useCallback(async (k: string, p: Place, quiet = false) => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    if (!quiet) setLoading(true);
    try {
      const v = await forumCall<View>({ action: 'view', campaign: k, page: pageOf(p) }, controller.signal);
      if (controller.signal.aborted) return;
      if (p.view === 'place') {
        // From a place page in the Encyclopedia: its board, with a new topic open when the reader may start one.
        const b = v.frame.boards.find(x => x.place?.id === p.id);
        if (b) { location.replace(forumHash(k, { view: 'board', id: b.id, ...(b.start ? { start: true } : {}) })); return; }
        setView(v); setStatus(0);
        setError(`No board in this forum is tied to that place yet.${v.frame.you.rights.boards ? ' Add a location board for it in Forum settings.' : ''}`);
        return;
      }
      setView(v); setError(''); setStatus(0);
      const at = forumHash(k, p);
      if (shown.current !== at) { shown.current = at; if (!quiet) window.scrollTo({ top: 0 }); }
      document.title = `${v.page.kind === 'topic' ? v.page.topic.title + ' · ' : ''}${v.frame.settings.title} · Forum`;
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : 'The forum is unavailable right now.'); setStatus(e instanceof ForumRequestError ? e.status : 0);
      if (!quiet) setView(v => v && (e instanceof ForumRequestError && e.status === 404) ? v : null);
    } finally { if (request.current === controller) { request.current = null; setLoading(false); } }
  }, []);

  useEffect(() => {
    const read = () => { const { key: k, place: p } = parseForumHash(location.hash); setKey(k); setPlace(p); if (validKey(k)) void load(k, p); else { setError(k ? 'This forum link is incomplete. Open the forum from the campaign.' : ''); setLoading(false); } };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [load]);

  useEffect(() => {
    if (!validKey(key)) return;
    const tick = () => { if (!document.hidden && !request.current) void load(key, place, true); };
    const timer = setInterval(tick, 20_000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [key, place, load]);

  const go = useCallback((p: Place) => { const h = forumHash(key, p); if (location.hash !== h) location.hash = h; else void load(key, p); }, [key, load]);
  const done = useCallback(async (next?: Place) => { if (next) go(next); else await load(key, place, true); }, [go, load, key, place]);

  /* eslint-disable @next/next/no-html-link-for-pages -- other tools open as full pages (AGENTS.md) */
  const appBar = <div className="forum-appbar">
    <a href="/campaigns" className="appbar-home">RPG Tools</a><span className="muted">·</span><a href="/campaigns">Campaigns</a><span className="muted">·</span><a href="/forum">Forums</a>
    {view && <span className="appbar-campaign">{view.frame.campaign.name}</span>}
    <span className="appbar-spacer" />{loading && view && <span className="muted small">Loading…</span>}<ThemeToggle />
  </div>;
  const backLink = <a href="/campaigns">Back to Campaigns</a>;
  /* eslint-enable @next/next/no-html-link-for-pages */

  if (!view && !key && !loading) return <div className="forum-root">{appBar}<div className="forum-page"><ForumPicker /></div></div>;
  if (!view) return <div className="forum-root">{appBar}<div className="forum-page"><div className="forum-message">
    <h1>{loading ? 'Opening the forum…' : status === 401 ? 'Sign in first' : 'Forum unavailable'}</h1>
    {!loading && <p>{error}</p>}
    {status === 401 && <p><a className="f-btn" href={`/account?mode=login&next=${encodeURIComponent('/forum' + location.hash)}`}>Sign in</a></p>}
    {!loading && <p>{backLink}</p>}
  </div></div></div>;

  const { frame, page } = view, k = key;
  return <PostContext.Provider value={{ k, emoji: emojiMap(frame) }}><div className="forum-root" id="top">{appBar}
    <div className="forum-page">
      <TopBar frame={frame} k={k} go={go} />
      <Banner frame={frame} k={k} go={go} />
      <Notices frame={frame} />
      <main className="board-main">
        {error && <p className="form-error banner-error" role="alert">{error}</p>}
        {page.kind === 'index' && <IndexPage frame={frame} k={k} go={go} />}
        {page.kind === 'board' && <BoardView key={page.board.id + (page.archive ? ':a' : '')} frame={frame} page={page} k={k} go={go} done={done} startOpen={place.view === 'board' && !!place.start} />}
        {page.kind === 'topic' && place.view === 'reply' && <ReplyView key={'r' + page.topic.id} frame={frame} page={page} k={k} go={go} done={done} />}
        {page.kind === 'topic' && place.view === 'edit' && <EditView key={'e' + place.post} frame={frame} page={page} k={k} go={go} done={done} postId={place.post} />}
        {page.kind === 'topic' && place.view === 'print' && <PrintView key={'p' + page.topic.id} frame={frame} page={page} k={k} go={go} />}
        {page.kind === 'topic' && place.view !== 'reply' && place.view !== 'edit' && place.view !== 'print' && <TopicView key={page.topic.id} frame={frame} page={page} k={k} go={go} done={done} />}
        {page.kind === 'search' && <SearchView key={forumHash(k, place)} frame={frame} page={page} k={k} go={go} />}
        {page.kind === 'trash' && <TrashView frame={frame} page={page} k={k} go={go} done={() => done()} />}
        {page.kind === 'reports' && <ReportsView frame={frame} page={page} k={k} go={go} done={() => done()} />}
        {page.kind === 'settings' && <SettingsView frame={frame} page={page} k={k} go={go} done={() => done()} />}
        {page.kind === 'active' && <>
          <Crumbs frame={frame} k={k} go={go} last="Active topics" />
          <section className="topics"><h2 className="category-title">Active topics</h2><p className="muted">Every topic, latest post first.</p>
            {page.topics.length ? page.topics.map(t => <TopicRow key={t.id} t={t} k={k} go={go} board={frame.boards.find(b => b.id === t.boardId)?.name} />) : <p className="muted empty">No topics yet.</p>}</section>
        </>}
        {page.kind === 'members' && <>
          <Crumbs frame={frame} k={k} go={go} last="Members" />
          <section className="members"><h2 className="category-title">Members</h2><p className="muted">Posts in character count towards the member’s own total.</p>
            <ol className="member-list">{page.members.map(m => { const w = whoStyle(m.color); return <li key={m.name + m.role}><Circle name={m.name} /><span><b className={w.className} style={w.style}>{m.name}</b><small>{m.role}{m.online && <> · <span className="online-dot" />online now</>}</small></span><span className="member-posts"><b>{m.posts}</b> {m.posts === 1 ? 'post' : 'posts'}</span></li>; })}</ol></section>
        </>}
      </main>
      <Footer frame={frame} k={k} go={go} onReadAll={async () => { try { await forumCall({ action: 'readAll', campaign: k }); await done(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not mark the forum read.'); } }} />
      <BackToTop />
    </div>
  </div></PostContext.Provider>;
}
