'use client';
/*
 * A campaign's forum: /forum#c-<campaign id> for the GM, /forum#m-<ref> for a member. The page in the hash after the
 * key (&board=, &topic=, &view=) so links can be shared and the back button works. Refreshes every 20 seconds while
 * the tab is visible. With no key, /forum lists the forums you can open (forum-pick.tsx).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ThemeToggle } from '../encyclopedia/theme';
import { ForumRequestError, forumCall, forumHash, pageOf, parseForumHash, setPlayerView, validKey, type Place, type View } from './forum-api';
import { BackToTop, Banner, Crumbs, Footer, IndexPage, TopBar, TopicRow, Circle, whoStyle, PostContext, SheetContext, emojiMap } from './forum-parts';
import { BoardView, EditView, ReplyView, TopicView } from './forum-topic';
import { SettingsView } from './forum-settings';
import { PrintView, ReportsView, TrashView } from './forum-moderate';
import { Notices, SearchView } from './forum-find';
import { ForumPicker } from './forum-pick';
import { ProfileView } from './forum-profile';
import { AdminCp, useAdminCp, useDock, type Preview } from './forum-theme';

export default function ForumApp() {
  const [key, setKey] = useState(''), [place, setPlace] = useState<Place>({ view: 'index' }), [view, setView] = useState<View | null>(null);
  const [error, setError] = useState(''), [status, setStatus] = useState(0), [loading, setLoading] = useState(true), [noForum, setNoForum] = useState(false);
  const request = useRef<AbortController | null>(null), shown = useRef('');
  // The campaign's live theme as last sent: refreshes say `same` instead of sending its stylesheet again.
  const theme = useRef<{ key: string; css: string; fonts: string } | null>(null);
  const [preview, setPreview] = useState<Preview>(null);

  const load = useCallback(async (k: string, p: Place, quiet = false) => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    if (!quiet) setLoading(true);
    try {
      const v = await forumCall<View>({ action: 'view', campaign: k, page: pageOf(p), ...(theme.current ? { theme: theme.current.key } : {}) }, controller.signal);
      if (controller.signal.aborted) return;
      const t = v.frame.theme;
      theme.current = !t ? null : t.same && theme.current?.key === t.key ? theme.current : { key: t.key, css: t.css ?? '', fonts: t.fonts ?? '' };
      if (p.view === 'place') {
        // From a place page in the Encyclopedia: its board, with a new topic open when the reader may start one.
        const b = v.frame.boards.find(x => x.place?.id === p.id);
        if (b) { location.replace(forumHash(k, { view: 'board', id: b.id, ...(b.start ? { start: true } : {}) })); return; }
        setView(v); setStatus(0);
        setError(`No board in this forum is tied to that place yet.${v.frame.you.rights.boards ? ' Add a location board for it in Forum settings.' : ''}`);
        return;
      }
      setView(v); setError(''); setStatus(0); setNoForum(false);
      const at = forumHash(k, p);
      if (shown.current !== at) { shown.current = at; if (!quiet) window.scrollTo({ top: 0 }); }
      document.title = `${v.page.kind === 'topic' ? v.page.topic.title + ' · ' : ''}${v.frame.settings.title} · Forum`;
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : 'The forum is unavailable right now.'); setStatus(e instanceof ForumRequestError ? e.status : 0); setNoForum(e instanceof ForumRequestError && e.code === 'no-forum');
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

  const cp = useAdminCp(key), [dock, setDock] = useDock();
  const go = useCallback((p: Place) => { const h = forumHash(key, p); if (location.hash !== h) location.hash = h; else void load(key, p); }, [key, load]);
  const done = useCallback(async (next?: Place) => { if (next) go(next); else await load(key, place, true); }, [go, load, key, place]);
  /** A solo campaign's GM view / Player view: pages only moderators open go back to the index in the player view. */
  const setPlayer = useCallback((on: boolean) => {
    setPlayerView(key, on);
    if (on && (place.view === 'settings' || place.view === 'trash' || place.view === 'reports')) go({ view: 'index' }); else void load(key, place);
  }, [key, place, go, load]);

  /* eslint-disable @next/next/no-html-link-for-pages -- other tools open as full pages (AGENTS.md) */
  // The same tools as the site header everywhere else. Encyclopedia opens this campaign's notes (yours, or as a member).
  const encyclopediaHref = key.startsWith('c-') ? `/encyclopedia?campaign=${key.slice(2)}` : key.startsWith('m-') ? `/encyclopedia#${key}` : '/encyclopedia';
  const appBar = <header className="forum-appbar">
    <a href="/" className="appbar-home" aria-label="RPG Tools home"><span className="tool-switch-mark" aria-hidden="true" />RPG Tools</a>
    <nav className="appbar-links" aria-label="RPG tools">
      <a href="/campaigns">Campaigns</a><a href="/maptable">Maptable</a><a href={encyclopediaHref}>Encyclopedia</a><a href="/forum" aria-current="page">Forum</a><a href="/guide">Guide</a>
    </nav>
    {view && <span className="appbar-campaign">{view.frame.campaign.name}</span>}
    <span className="appbar-spacer" />{loading && view && <span className="muted small">Loading…</span>}<ThemeToggle /><a href="/account" className="appbar-account">Account</a>
  </header>;
  const backLink = <a href="/campaigns">Back to Campaigns</a>;
  /* eslint-enable @next/next/no-html-link-for-pages */

  if (!view && !key && !loading) return <div className="forum-root">{appBar}<div className="forum-page"><ForumPicker /></div></div>;
  if (!view) return <div className="forum-root">{appBar}<div className="forum-page"><div className="forum-message">
    <h1>{loading ? 'Opening the forum…' : status === 401 ? 'Sign in first' : noForum ? 'No forum yet' : 'Forum unavailable'}</h1>
    {!loading && <p>{error}</p>}
    {!loading && noForum && key.startsWith('c-') && <p><a className="f-btn" href={`/campaigns/${encodeURIComponent('e:' + decodeURIComponent(key.slice(2)))}?forum=setup`}>Set up the forum</a></p>}
    {status === 401 && <p><a className="f-btn" href={`/account?mode=login&next=${encodeURIComponent('/forum' + location.hash)}`}>Sign in</a></p>}
    {!loading && <p>{backLink}</p>}
  </div></div></div>;

  const { frame, page } = view, k = key;
  // The theme being edited in the Admin CP, else the live one. The app bar and the Admin CP are never themed.
  const live = frame.theme && theme.current ? { css: theme.current.css, fonts: theme.current.fonts, banner: frame.theme.banner } : null;
  const skin = cp.open && preview ? preview : live;
  const showCp = cp.open && frame.you.rights.boards;
  return <PostContext.Provider value={{ k, emoji: emojiMap(frame) }}><div className={`forum-root${frame.solo?.player ? ' solo-player' : ''}`} id="top">{appBar}
    <div className={`forum-body${showCp ? ` cp-open cp-${dock}` : ''}`}>
    {showCp && <AdminCp k={k} dock={dock} setDock={setDock} onClose={cp.close} onPreview={setPreview} onSaved={() => void load(key, place, true)} />}
    <div className="skin-frame">
    {skin && <>{skin.fonts && <link rel="stylesheet" href={skin.fonts} precedence="default" />}<style>{skin.css}</style></>}
    <div className="campaign-skin">
    <div className="forum-page">
      <TopBar frame={frame} k={k} go={go} setPlayer={setPlayer} />
      <Banner frame={frame} k={k} go={go} plain={skin?.banner === 'plain'} />
      <Notices frame={frame} />
      <SheetContext.Provider value={page.kind === 'topic' ? page.features : {}}><main className="board-main">
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
        {page.kind === 'profile' && <ProfileView frame={frame} page={page} k={k} go={go} done={() => done()} />}
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
      </main></SheetContext.Provider>
      <Footer frame={frame} k={k} go={go} onReadAll={async () => { try { await forumCall({ action: 'readAll', campaign: k }); await done(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not mark the forum read.'); } }} />
      <BackToTop />
    </div>
    </div></div></div>
  </div></PostContext.Provider>;
}
