'use client';
/* The forum's requests (app/api/forum) and the shapes they return (lib/forum/view.ts). */
import { useEffect, useState } from 'react';
import type { CardDesign, EmojiSettings, ForumSettings, Strip, TopicTag } from '@/lib/forum/model';
import type { ForumAi } from '@/lib/forum/ai';
import { setViewAsPlayer, viewAsPlayer } from '@/lib/view-as-player';
import type { AiConnection } from '@/lib/forum/request';
import type { Frame, Picture, CardRow, StripItem, cardFields, cardSample, profilePage, picturesPage, activePage, boardPage, membersPage, reportsPage, searchPage, topicPage, trashPage } from '@/lib/forum/view';

export type { Frame, Picture, CardRow, StripItem };
export type CardField = ReturnType<typeof cardFields>[number];
export type CardSample = ReturnType<typeof cardSample>;
export type BoardPage = NonNullable<ReturnType<typeof boardPage>>;
export type TopicPage = NonNullable<ReturnType<typeof topicPage>>;
export type PageData =
  | { kind: 'index' }
  | ({ kind: 'board' } & BoardPage)
  | ({ kind: 'topic' } & TopicPage)
  | ({ kind: 'active' } & ReturnType<typeof activePage>)
  | ({ kind: 'members' } & ReturnType<typeof membersPage>)
  | ({ kind: 'trash' } & ReturnType<typeof trashPage>)
  | ({ kind: 'reports' } & ReturnType<typeof reportsPage>)
  | ({ kind: 'pictures' } & ReturnType<typeof picturesPage>)
  | ({ kind: 'profile' } & ReturnType<typeof profilePage>)
  | ({ kind: 'search'; boardId: string | null } & ReturnType<typeof searchPage>)
  | { kind: 'settings'; places: { id: string; name: string }[]; settings: ForumSettings; groups: SettingsGroup[]; masks: Record<string, Masks>; emoji: EmojiSettings; topicTags: TopicTag[]; card: CardDesign & { fields: CardField[]; sample: CardSample }; strip: Strip; ai: { settings: ForumAi | null; connections: AiConnection[]; may: boolean; players?: boolean } };
export type Tri = 'yes' | 'no' | 'never';
export type SettingsGroup = { id: string; name: string; read: Tri; start: Tri; reply: Tri; gm: boolean };
export type Masks = Record<string, Partial<Record<'read' | 'start' | 'reply' | 'html', Tri>>>;
export type View = { frame: Frame; page: PageData };
export type Place = { view: 'index' | 'active' | 'members' | 'settings' | 'trash' | 'reports' | 'profile' } | { view: 'board'; id: string; archive?: boolean; start?: boolean } | { view: 'topic'; id: string; page?: number; post?: string } | { view: 'place'; id: string }
  | { view: 'reply'; id: string } | { view: 'edit'; id: string; post: string } | { view: 'print'; id: string } | { view: 'search'; q: string; board?: string };

/**
 * The forum keeps its campaign in the address hash: #<key>, then &board=<id> (&new=1 opens a new topic), &topic=<id>
 * (with &page=<n> or &post=<id> for the page with that post, or &reply=1 or &edit=<post>), &place=<Encyclopedia place> (its board) or &view=<page>.
 */
export function parseForumHash(hash: string): { key: string; place: Place } {
  const text = hash.replace(/^#/, ''), at = text.indexOf('&'), key = at < 0 ? text : text.slice(0, at);
  const rest = new URLSearchParams(at < 0 ? '' : text.slice(at + 1)), ok = (v: string | null) => !!v && /^[A-Za-z0-9_-]{1,100}$/.test(v);
  const board = rest.get('board'), topic = rest.get('topic'), view = rest.get('view'), edit = rest.get('edit'), placeId = rest.get('place');
  const n = Number(rest.get('page')), page = Number.isInteger(n) && n >= 1 && n <= 1_000_000 ? n : undefined, post = rest.get('post');
  const place: Place = ok(topic) ? (ok(edit) ? { view: 'edit', id: topic!, post: edit! } : rest.get('reply') === '1' ? { view: 'reply', id: topic! } : rest.get('print') === '1' ? { view: 'print', id: topic! }
    : { view: 'topic', id: topic!, ...(page ? { page } : {}), ...(ok(post) ? { post: post! } : {}) })
    : ok(board) ? { view: 'board', id: board!, ...(rest.get('archive') === '1' ? { archive: true } : rest.get('new') === '1' ? { start: true } : {}) }
    : ok(placeId) ? { view: 'place', id: placeId! }
    : view === 'search' ? { view: 'search', q: (rest.get('q') ?? '').slice(0, 100), ...(ok(rest.get('in')) ? { board: rest.get('in')! } : {}) } : view === 'active' || view === 'members' || view === 'settings' || view === 'trash' || view === 'reports' || view === 'profile' ? { view } : { view: 'index' };
  return { key, place };
}
export function forumHash(key: string, place: Place) {
  const at = place.view === 'board' ? `&board=${place.id}${place.archive ? '&archive=1' : place.start ? '&new=1' : ''}` : place.view === 'place' ? `&place=${place.id}` : place.view === 'topic' ? `&topic=${place.id}${place.page ? `&page=${place.page}` : ''}${place.post ? `&post=${place.post}` : ''}` : place.view === 'reply' ? `&topic=${place.id}&reply=1` : place.view === 'print' ? `&topic=${place.id}&print=1`
    : place.view === 'edit' ? `&topic=${place.id}&edit=${place.post}` : place.view === 'search' ? `&view=search&q=${encodeURIComponent(place.q)}${place.board ? `&in=${place.board}` : ''}` : place.view === 'index' ? '' : `&view=${place.view}`;
  return `#${key}${at}`;
}
export const validKey = (key: string) => /^(?:m-[a-f0-9]{64}|c-[A-Za-z0-9_-]{1,100})$/.test(key);

export class ForumRequestError extends Error { status: number; code: string; constructor(message: string, status: number, code = '') { super(message); this.status = status; this.code = code; } }
/*
 * Solo campaigns: their owner may read and post in the player view (lib/forum/request.ts); any other campaign's owner may
 * preview it, read only. The choice is kept per
 * campaign on this device, and every request for that campaign carries it; the server ignores it for anyone else.
 */
const playerViews = new Map<string, boolean>(), viewKey = (key: string) => `forum:player-view:${key}`;
/** On for this campaign (a solo campaign's switch), or everywhere (the account menu's Switch to Player view, which any campaign's owner may use). */
export function playerViewOn(key: string) {
  if (viewAsPlayer()) return true;
  if (!playerViews.has(key)) { try { playerViews.set(key, localStorage.getItem(viewKey(key)) === '1'); } catch { playerViews.set(key, false); } }
  return playerViews.get(key)!;
}
export function setPlayerView(key: string, on: boolean) {
  // Back to the GM view also turns off the account menu's player view, or the forum would stay in it.
  if (!on) setViewAsPlayer(false);
  playerViews.set(key, on);
  try { if (on) localStorage.setItem(viewKey(key), '1'); else localStorage.removeItem(viewKey(key)); } catch { /* storage may be off */ }
}

export async function forumCall<T = Record<string, unknown>>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const send = typeof body.campaign === 'string' && playerViewOn(body.campaign) ? { ...body, playerView: true } : body;
  const r = await fetch('/api/forum', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(send), signal });
  const value = await r.json().catch(() => ({})) as T & { error?: string; code?: string };
  if (!r.ok) throw new ForumRequestError(value.error ?? 'The forum is unavailable right now.', r.status, value.code);
  return value;
}
/**
 * The page the server builds for a place: the reply page reads the topic's last page, the edit page the page with its
 * post. A topic without a page or post opens where the reader's new posts start (or its last page).
 */
export const pageOf = (place: Place) => place.view === 'board' ? { kind: 'board', id: place.id, ...(place.archive ? { archive: true } : {}) }
  : place.view === 'topic' ? { kind: 'topic', id: place.id, ...(place.page ? { page: place.page } : place.post ? { post: place.post } : {}) }
  : place.view === 'reply' ? { kind: 'topic', id: place.id, last: true } : place.view === 'edit' ? { kind: 'topic', id: place.id, post: place.post }
  : place.view === 'print' ? { kind: 'topic', id: place.id, page: 1, per: WHOLE_PER }
  : place.view === 'search' ? { kind: 'search', q: place.q, ...(place.board ? { boardId: place.board } : {}) } : place.view === 'place' ? { kind: 'index' } : { kind: place.view };

/** Posts read at once when a whole topic is gathered (lib/forum/pages.ts MAX_PER_PAGE). */
const WHOLE_PER = 200;
/**
 * Every post of a topic, for printing, downloads and recaps: `first` (a page of it) and the rest of its pages, read
 * in turn. Cards, links and features of every page are kept. `progress` hears how many posts are in so far.
 */
export async function wholeTopic(k: string, first: TopicPage, progress?: (got: number, of: number) => void): Promise<TopicPage> {
  const { total } = first.paging;
  if (first.posts.length >= total) return first;
  // The print page already has the first page at this size.
  const reuse = first.paging.page === 1 && first.paging.per === WHOLE_PER;
  const out: TopicPage = { ...first, posts: reuse ? [...first.posts] : [], cards: { ...first.cards }, links: { ...first.links }, features: { ...first.features } };
  for (let page = reuse ? 2 : 1; out.posts.length < total && page <= Math.ceil(total / WHOLE_PER) + 1; page++) {
    let got: { page: TopicPage } | null = null;
    for (let tries = 0; !got; tries++) {
      try { got = await forumCall<{ page: TopicPage }>({ action: 'view', campaign: k, page: { kind: 'topic', id: first.topic.id, page, per: WHOLE_PER } }); }
      catch (e) { if (!(e instanceof ForumRequestError && e.status === 429) || tries > 5) throw e; await new Promise(r => setTimeout(r, 2500)); }
    }
    if (got.page.paging.page !== page) break;
    out.posts.push(...got.page.posts);
    Object.assign(out.cards, got.page.cards); Object.assign(out.links, got.page.links); Object.assign(out.features, got.page.features);
    progress?.(out.posts.length, total);
  }
  return { ...out, paging: { page: 1, pages: 1, per: out.posts.length, total: out.posts.length, first: 1 } };
}

/* Pictures load once per page visit and stay as object URLs, so a refresh doesn't fetch them again. */
const pictures = new Map<string, Promise<string>>();
function loadPicture(key: string, imageId: string) {
  const k = key + '|' + imageId;
  let p = pictures.get(k);
  if (!p) {
    p = fetch(`/api/forum?c=${encodeURIComponent(key)}&image=${encodeURIComponent(imageId)}`).then(async r => { if (!r.ok) throw new Error(); return URL.createObjectURL(await r.blob()); });
    p.catch(() => pictures.delete(k));
    pictures.set(k, p);
  }
  return p;
}
export function usePicture(key: string, imageId: string | undefined | null) {
  const [got, setGot] = useState({ id: '', url: '' });
  useEffect(() => {
    let live = true;
    if (imageId) loadPicture(key, imageId).then(url => { if (live) setGot({ id: imageId, url }); }, () => { if (live) setGot({ id: imageId, url: '' }); });
    return () => { live = false; };
  }, [key, imageId]);
  return imageId && got.id === imageId ? got.url : '';
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '?';
export function when(iso: string, now = Date.now()) {
  const t = new Date(iso).getTime(), s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = new Date(t), y = new Date(now);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(d.getFullYear() !== y.getFullYear() ? { year: 'numeric' } : {}) });
}
export const fullDate = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
