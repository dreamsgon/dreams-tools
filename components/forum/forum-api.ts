'use client';
/* The forum's requests (app/api/forum) and the shapes they return (lib/forum/view.ts). */
import { useEffect, useState } from 'react';
import type { ForumSettings } from '@/lib/forum/model';
import type { Frame, Picture, activePage, boardPage, membersPage, topicPage, trashPage } from '@/lib/forum/view';

export type { Frame, Picture };
export type BoardPage = NonNullable<ReturnType<typeof boardPage>>;
export type TopicPage = NonNullable<ReturnType<typeof topicPage>>;
export type PageData =
  | { kind: 'index' }
  | ({ kind: 'board' } & BoardPage)
  | ({ kind: 'topic' } & TopicPage)
  | ({ kind: 'active' } & ReturnType<typeof activePage>)
  | ({ kind: 'members' } & ReturnType<typeof membersPage>)
  | ({ kind: 'trash' } & ReturnType<typeof trashPage>)
  | { kind: 'settings'; places: { id: string; name: string }[]; settings: ForumSettings };
export type View = { frame: Frame; page: PageData };
export type Place = { view: 'index' | 'active' | 'members' | 'settings' | 'trash' } | { view: 'board'; id: string; archive?: boolean } | { view: 'topic'; id: string }
  | { view: 'reply'; id: string } | { view: 'edit'; id: string; post: string } | { view: 'print'; id: string };

/** The forum keeps its campaign in the address hash: #<key>, then &board=<id>, &topic=<id> (with &reply=1 or &edit=<post>) or &view=<page>. */
export function parseForumHash(hash: string): { key: string; place: Place } {
  const text = hash.replace(/^#/, ''), at = text.indexOf('&'), key = at < 0 ? text : text.slice(0, at);
  const rest = new URLSearchParams(at < 0 ? '' : text.slice(at + 1)), ok = (v: string | null) => !!v && /^[A-Za-z0-9_-]{1,100}$/.test(v);
  const board = rest.get('board'), topic = rest.get('topic'), view = rest.get('view'), edit = rest.get('edit');
  const place: Place = ok(topic) ? (ok(edit) ? { view: 'edit', id: topic!, post: edit! } : rest.get('reply') === '1' ? { view: 'reply', id: topic! } : rest.get('print') === '1' ? { view: 'print', id: topic! } : { view: 'topic', id: topic! })
    : ok(board) ? { view: 'board', id: board!, ...(rest.get('archive') === '1' ? { archive: true } : {}) } : view === 'active' || view === 'members' || view === 'settings' || view === 'trash' ? { view } : { view: 'index' };
  return { key, place };
}
export function forumHash(key: string, place: Place) {
  const at = place.view === 'board' ? `&board=${place.id}${place.archive ? '&archive=1' : ''}` : place.view === 'topic' ? `&topic=${place.id}` : place.view === 'reply' ? `&topic=${place.id}&reply=1` : place.view === 'print' ? `&topic=${place.id}&print=1`
    : place.view === 'edit' ? `&topic=${place.id}&edit=${place.post}` : place.view === 'index' ? '' : `&view=${place.view}`;
  return `#${key}${at}`;
}
export const validKey = (key: string) => /^(?:m-[a-f0-9]{64}|c-[A-Za-z0-9_-]{1,100})$/.test(key);

export class ForumRequestError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } }
export async function forumCall<T = Record<string, unknown>>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const r = await fetch('/api/forum', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  const value = await r.json().catch(() => ({})) as T & { error?: string };
  if (!r.ok) throw new ForumRequestError(value.error ?? 'The forum is unavailable right now.', r.status);
  return value;
}
/** The page the server builds for a place: the reply and edit pages read the topic. */
export const pageOf = (place: Place) => place.view === 'board' ? { kind: 'board', id: place.id, ...(place.archive ? { archive: true } : {}) }
  : place.view === 'topic' || place.view === 'reply' || place.view === 'edit' || place.view === 'print' ? { kind: 'topic', id: place.id } : { kind: place.view };

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
