'use client';
/*
 * The composer's Insert menu and emoji picker: a picture (uploaded, or one already added to the forum), a roll, a
 * page link or collapsible text; the campaign's own emoji (Forum settings › Emoji) and standard ones. Pictures and
 * emoji are stored with the GM's pictures through the forum (lib/forum/request.ts, action `upload`).
 */
import { useEffect, useRef, useState } from 'react';
import { Dices, ImagePlus, Link2, PanelTopClose, Smile, Upload } from 'lucide-react';
import { stageTransfer } from '@/lib/transfer-client';
import { forumCall, usePicture, when, type Frame } from './forum-api';
import { Emoji } from './forum-parts';

const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
/** Stores a picture for the forum: for posts (up to 8 MB) or as an emoji (up to 256 KB). Returns its id. */
export async function uploadForumPicture(k: string, file: File, kind: 'post' | 'emoji') {
  if (!TYPES.includes(file.type)) throw new Error('Choose a PNG, JPEG or WebP picture.');
  const max = kind === 'emoji' ? 256 * 1024 : 8 * 1024 * 1024;
  if (file.size > max) throw new Error(kind === 'emoji' ? 'Emoji can be up to 256 KB each.' : 'Choose a picture up to 8 MB.');
  const transferId = await stageTransfer(file, 'image');
  return (await forumCall<{ id: string }>({ action: 'upload', campaign: k, transferId, kind })).id;
}

/** Closes a popover on a click elsewhere or Escape. */
function useAway(open: boolean, close: () => void) {
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) close(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open, close]);
  return box;
}

type Insert = (text: string, select?: [number, number]) => void;
type Wrap = (before: string, after: string, placeholder: string) => void;

/** Insert: a picture, a roll, a page link or collapsible text. */
export function InsertMenu({ frame, k, insert, wrap, disabled }: { frame: Frame; k: string; insert: Insert; wrap: Wrap; disabled: boolean }) {
  const [open, setOpen] = useState<'' | 'menu' | 'picture'>(''), box = useAway(!!open, () => setOpen(''));
  const item = (icon: React.ReactNode, name: string, about: string, run: () => void) =>
    <button type="button" role="menuitem" onClick={run}><span className="ins-ic" aria-hidden="true">{icon}</span><span><b>{name}</b><small>{about}</small></span></button>;
  const done = (run: () => void) => () => { setOpen(''); run(); };
  return <span className="pop-wrap" ref={box}>
    <button type="button" title="Insert a picture, roll, page link or collapsible text" aria-label="Insert" aria-haspopup="menu" aria-expanded={!!open} className={open ? 'on' : ''} disabled={disabled} onClick={() => setOpen(o => o ? '' : 'menu')}><ImagePlus size={15} /><span className="tl">Insert</span></button>
    {open === 'menu' && <span className="tool-pop insert-pop" role="menu" aria-label="Insert">
      <b className="pop-title">Insert</b>
      {frame.you.rights.pictures && item(<ImagePlus size={16} />, 'Picture', 'Upload one, or pick one already in the forum', () => setOpen('picture'))}
      {item(<Dices size={16} />, 'Roll', 'Rolled by the forum when you post, so nobody can change it', done(() => wrap('[roll=Attack]', '[/roll]', '1d20+5')))}
      {item(<Link2 size={16} />, 'Encyclopedia page', 'A link that opens the page for readers who may read it. Or type [[ ]]', done(() => wrap('[[', ']]', 'Page name')))}
      {item(<PanelTopClose size={16} />, 'Collapsible text', 'A title that opens to show more: handouts, long notes', done(() => wrap('[collapse=Read more]\n', '\n[/collapse]', 'Text readers open when they want it')))}
    </span>}
    {open === 'picture' && <PicturePicker k={k} onBack={() => setOpen('menu')} onPick={(id, alt) => { setOpen(''); insert(`\n[img${alt ? `=${alt.replace(/[\]\n]/g, ' ').slice(0, 120)}` : ''}]${id}[/img]\n`); }} />}
  </span>;
}

type Pictures = { pictures: { id: string; at: string; mine: boolean; by: string }[]; total: number };

function Thumb({ k, id, on, label, onClick }: { k: string; id: string; on: boolean; label: string; onClick: () => void }) {
  const src = usePicture(k, id);
  // eslint-disable-next-line @next/next/no-img-element -- a private object URL; next/image can't optimise it
  return <button type="button" className={`pic-thumb${on ? ' on' : ''}`} aria-pressed={on} title={label} aria-label={label} onClick={onClick}>{src ? <img src={src} alt="" /> : <span />}</button>;
}

/** Upload a picture, or pick one already in the forum, then say what it shows. */
function PicturePicker({ k, onPick, onBack }: { k: string; onPick: (id: string, alt: string) => void; onBack: () => void }) {
  const [list, setList] = useState<Pictures | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [picked, setPicked] = useState(''), [alt, setAlt] = useState(''), [more, setMore] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let live = true;
    forumCall<{ page: Pictures }>({ action: 'view', campaign: k, page: { kind: 'pictures' } }).then(v => { if (live) setList(v.page); }, e => { if (live) setError(e instanceof Error ? e.message : 'Couldn’t list the pictures.'); });
    return () => { live = false; };
  }, [k]);
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setError('');
    try { const id = await uploadForumPicture(k, f, 'post'); setList(l => ({ pictures: [{ id, at: new Date().toISOString(), mine: true, by: 'you' }, ...(l?.pictures ?? [])], total: (l?.total ?? 0) + 1 })); setPicked(id); }
    catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t add that picture.'); }
    finally { setBusy(false); if (file.current) file.current.value = ''; }
  };
  const shown = (list?.pictures ?? []).slice(0, more ? 120 : 24);
  return <span className="tool-pop picture-pop" role="dialog" aria-label="Put a picture in your post">
    <b className="pop-title">Put a picture in your post</b>
    <span className="pic-actions">
      <button type="button" className="f-btn small" disabled={busy} onClick={() => file.current?.click()}><Upload size={13} aria-hidden="true" />{busy ? 'Adding…' : 'Upload a picture'}</button>
      <small className="muted">PNG, JPEG or WebP, up to 8 MB. Everyone who can read the topic sees it.</small>
      <input ref={file} type="file" accept={TYPES.join(',')} hidden onChange={e => void upload(e.target.files?.[0])} />
    </span>
    {!list && !error ? <small className="muted">Looking for the forum’s pictures…</small>
      : list && !list.pictures.length ? <small className="muted">No pictures in the forum yet. Upload the first.</small>
      : <span className="pic-grid">{shown.map(p => <Thumb key={p.id} k={k} id={p.id} on={picked === p.id} label={`Added by ${p.mine ? 'you' : p.by}, ${when(p.at)}`} onClick={() => setPicked(p.id)} />)}</span>}
    {list && list.pictures.length > shown.length && <button type="button" className="f-btn ghost small" onClick={() => setMore(true)}>Show more</button>}
    {picked && <label className="f-field small">What it shows <small className="muted">(for readers who can’t see it)</small><input value={alt} maxLength={120} placeholder="A gull on the harbour wall" onChange={e => setAlt(e.target.value)} /></label>}
    {error && <small className="form-error" role="alert">{error}</small>}
    <span className="pop-foot"><button type="button" className="f-btn ghost small" onClick={onBack}>Back</button><button type="button" className="f-btn small" disabled={!picked} onClick={() => onPick(picked, alt.trim())}>Put it in</button></span>
  </span>;
}

/* A small set of standard emoji for roleplay posts. */
const STANDARD = ['😀', '😂', '😅', '😊', '😍', '😘', '😎', '🤔', '😏', '😬', '😢', '😭', '😡', '😱', '🙄', '😴', '🤫', '🥺', '👍', '👎', '👏', '🙏', '💪', '🤝', '❤️', '💔', '✨', '🔥', '⚔️', '🛡️', '🏹', '🗡️', '🪄', '📜', '🎲', '🍺', '🌙', '☀️', '🌊', '💀'];

/** The emoji picker: the campaign's own (by set), if this person may use them, then standard ones. */
export function EmojiPicker({ frame, k, insert, disabled }: { frame: Frame; k: string; insert: Insert; disabled: boolean }) {
  const [open, setOpen] = useState(false), box = useAway(open, () => setOpen(false));
  const own = frame.emoji.may ? frame.emoji.list : [], sets = [...new Set(own.map(e => e.set))];
  const pick = (text: string) => { insert(text); setOpen(false); };
  return <span className="pop-wrap" ref={box}>
    <button type="button" title="Emoji" aria-label="Emoji" aria-expanded={open} className={open ? 'on' : ''} disabled={disabled} onClick={() => setOpen(o => !o)}><Smile size={15} /><span className="tl">Emoji</span></button>
    {open && <span className="tool-pop emoji-pop" role="dialog" aria-label="Emoji">
      {sets.map(set => <span key={set} className="emo-set"><b className="pop-title">{set || `${frame.settings.title}’s emoji`}</b>
        <span className="emo-grid">{own.filter(e => e.set === set).map(e => <button type="button" key={e.code} title={`:${e.code}:`} aria-label={`:${e.code}:`} onClick={() => pick(`:${e.code}:`)}><Emoji k={k} imageId={e.imageId} code={e.code} /></button>)}</span></span>)}
      {own.length > 0 && <b className="pop-title">Standard</b>}
      <span className="emo-grid">{STANDARD.map(e => <button type="button" key={e} onClick={() => pick(e)}>{e}</button>)}</span>
      {own.length > 0 && <small className="muted">Or type a colon and a name, like :{own[0]!.code}:.</small>}
    </span>}
  </span>;
}
