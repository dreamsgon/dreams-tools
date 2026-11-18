'use client';
/*
 * The composer's Insert menu and emoji picker: a picture (uploaded, or one already added to the forum), a Maptable
 * scene (the GM), a feature or spell, a roll, a page link or collapsible text; @tags; the campaign's own emoji (Forum settings › Emoji) and standard ones. Pictures and
 * emoji are stored with the GM's pictures through the forum (lib/forum/request.ts, action `upload`).
 */
import { useEffect, useRef, useState } from 'react';
import { AtSign, Brush, Code2, Dices, Gem, ImagePlus, Link2, Map as MapIcon, PanelTopClose, Search, Smile, Upload } from 'lucide-react';
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

/** Insert: a picture, a feature or spell of the character you post as, a roll, a page link or collapsible text. */
export function InsertMenu({ frame, k, insert, wrap, style, disabled, as, html }: { frame: Frame; k: string; insert: Insert; wrap: Wrap; style: (body: string) => void; disabled: boolean; as: string | null; html: boolean }) {
  const [open, setOpen] = useState<'' | 'menu' | 'picture' | 'feature' | 'map' | 'styles'>(''), box = useAway(!!open, () => setOpen(''));
  const item = (icon: React.ReactNode, name: string, about: string, run: () => void) =>
    <button type="button" role="menuitem" onClick={run}><span className="ins-ic" aria-hidden="true">{icon}</span><span><b>{name}</b><small>{about}</small></span></button>;
  const done = (run: () => void) => () => { setOpen(''); run(); };
  return <span className="pop-wrap" ref={box}>
    <button type="button" title="Insert a picture, roll, page link or collapsible text" aria-label="Insert" aria-haspopup="menu" aria-expanded={!!open} className={open ? 'on' : ''} disabled={disabled} onClick={() => setOpen(o => o ? '' : 'menu')}><ImagePlus size={15} /><span className="tl">Insert</span></button>
    {open === 'menu' && <span className="tool-pop insert-pop" role="menu" aria-label="Insert">
      <b className="pop-title">Insert</b>
      {frame.you.rights.pictures && item(<ImagePlus size={16} />, 'Picture', 'Upload one, or pick one already in the forum', () => setOpen('picture'))}
      {frame.you.rights.gm && frame.you.rights.pictures && item(<MapIcon size={16} />, 'Map from Maptable', 'A picture of a scene as players see it, without GM-only tokens', () => setOpen('map'))}
      {as && item(<Gem size={16} />, 'Feature or spell', 'From your character’s sheet. Readers who may see it get its text on hover', () => setOpen('feature'))}
      {item(<Dices size={16} />, 'Roll', 'Rolled by the forum when you post, so nobody can change it', done(() => wrap('[roll=Attack]', '[/roll]', '1d20+5')))}
      {item(<Link2 size={16} />, 'Encyclopedia page', 'A link that opens the page for readers who may read it. Or type [[ ]]', done(() => wrap('[[', ']]', 'Page name')))}
      {html && item(<Code2 size={16} />, 'HTML', 'Your own layout: tags and styles. Scripts and outside pictures are taken out', done(() => wrap('[html]\n<div style="padding: 14px 18px; border: 1px solid #b8891c; background: #fbf3dc; color: #2b261d; font-family: Georgia, serif">\n', '\n</div>\n[/html]', 'Your text')))}
      {frame.you.styles.length > 0 && item(<Brush size={16} />, 'My post styles', 'Wraps what you’ve written in one of your saved layouts', () => setOpen('styles'))}
      {item(<PanelTopClose size={16} />, 'Collapsible text', 'A title that opens to show more: handouts, long notes', done(() => wrap('[collapse=Read more]\n', '\n[/collapse]', 'Text readers open when they want it')))}
    </span>}
    {open === 'styles' && <span className="tool-pop insert-pop" role="menu" aria-label="My post styles">
      <b className="pop-title">My post styles</b>
      {frame.you.styles.map(s => { const needs = !html && /\[html\]/i.test(s.body), at = s.body.indexOf('{text}');
        return <button key={s.id} type="button" role="menuitem" disabled={needs} onClick={done(() => style(s.body))}><span className="ins-ic" aria-hidden="true"><Brush size={16} /></span><span><b>{s.name}</b><small>{needs ? 'Uses HTML, which your group can’t use on this board' : at < 0 ? 'Goes in before your text' : 'Your text goes in its {text}'}</small></span></button>; })}
      <button type="button" className="f-btn ghost small" onClick={() => setOpen('menu')}>Back</button>
    </span>}
    {open === 'feature' && as && <FeaturePicker k={k} as={as} onBack={() => setOpen('menu')} onPick={(kind, id, name) => { setOpen(''); insert(`[${kind}=${as}/${id}]${name.replace(/[[\]\n]/g, ' ').slice(0, 80)}[/${kind}]`); }} />}
    {open === 'map' && <MapPicker k={k} onBack={() => setOpen('menu')} onPick={(id, name) => { setOpen(''); insert(`\n[img=Map: ${name.replace(/[\]\n]/g, ' ').slice(0, 110)}]${id}[/img]\n`); }} />}
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

/** A scene of the paired Maptable campaign, drawn as players see it and stored as a picture (the GM). */
function MapPicker({ k, onPick, onBack }: { k: string; onPick: (id: string, name: string) => void; onBack: () => void }) {
  const [list, setList] = useState<{ paired: boolean; scenes: { id: string; name: string }[] } | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(''), [q, setQ] = useState('');
  useEffect(() => {
    let live = true;
    forumCall<{ paired: boolean; scenes: { id: string; name: string }[] }>({ action: 'mapScenes', campaign: k }).then(v => { if (live) setList(v); }, e => { if (live) setError(e instanceof Error ? e.message : 'Couldn’t read the scenes.'); });
    return () => { live = false; };
  }, [k]);
  const pick = async (id: string) => {
    setBusy(id); setError('');
    try { const out = await forumCall<{ id: string; name: string }>({ action: 'map', campaign: k, sceneId: id }); onPick(out.id, out.name); }
    catch (e) { setError(e instanceof Error ? e.message : 'The map picture couldn’t be drawn.'); }
    finally { setBusy(''); }
  };
  const word = q.trim().toLowerCase(), shown = list?.scenes.filter(sc => !word || sc.name.toLowerCase().includes(word)) ?? [];
  return <span className="tool-pop feature-pop" role="dialog" aria-label="Put a Maptable scene in your post">
    <b className="pop-title">Map from Maptable</b>
    {list && list.scenes.length > 8 && <label className="pop-search"><Search size={13} aria-hidden="true" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a scene" aria-label="Find a scene" /></label>}
    {!list && !error ? <small className="muted">Reading the scenes…</small>
      : list && !list.paired ? <small className="muted">Pair this campaign with a Maptable campaign on the campaign’s page to put its scenes in posts.</small>
      : list && !list.scenes.length ? <small className="muted">The paired Maptable campaign has no scenes yet.</small>
      : list && <span className="feat-list">{shown.slice(0, 60).map(sc => <button type="button" key={sc.id} disabled={!!busy} onClick={() => void pick(sc.id)}><span><b>{sc.name}</b><small>{busy === sc.id ? 'Drawing the map…' : 'Grid, map and the tokens players can see'}</small></span></button>)}</span>}
    {error && <small className="form-error" role="alert">{error}</small>}
    <span className="pop-foot"><button type="button" className="f-btn ghost small" onClick={onBack}>Back</button></span>
  </span>;
}

type Sheet = { name: string; features: Line[]; spells: Line[] };
type Line = { id: string; name: string; group: string; note: string; text: string };
/** A feature or spell from the sheet of the character you post as. */
function FeaturePicker({ k, as, onPick, onBack }: { k: string; as: string; onPick: (kind: 'feature' | 'spell', id: string, name: string) => void; onBack: () => void }) {
  const [sheet, setSheet] = useState<Sheet | null>(null), [error, setError] = useState(''), [q, setQ] = useState('');
  useEffect(() => {
    let live = true;
    forumCall<{ page: Sheet }>({ action: 'view', campaign: k, page: { kind: 'sheet', id: as } }).then(v => { if (live) setSheet(v.page); }, e => { if (live) setError(e instanceof Error ? e.message : 'Couldn’t read the sheet.'); });
    return () => { live = false; };
  }, [k, as]);
  const word = q.trim().toLowerCase(), hit = (l: Line) => !word || l.name.toLowerCase().includes(word) || l.group.toLowerCase().includes(word);
  const part = (kind: 'feature' | 'spell', title: string, list: Line[]) => list.filter(hit).length > 0 && <span className="feat-list"><b className="pop-title">{title}</b>
    {list.filter(hit).slice(0, 60).map(l => <button type="button" key={l.id} onClick={() => onPick(kind, l.id, l.name)}><span><b>{l.name}</b><small>{[l.group, l.note].filter(Boolean).join(' · ') || (l.text ? l.text.slice(0, 80) : '')}</small></span></button>)}</span>;
  return <span className="tool-pop feature-pop" role="dialog" aria-label="Put a feature or spell in your post">
    <b className="pop-title">{sheet ? `From ${sheet.name}’s sheet` : 'From your character’s sheet'}</b>
    {sheet && sheet.features.length + sheet.spells.length > 8 && <label className="pop-search"><Search size={13} aria-hidden="true" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Find one" aria-label="Find a feature or spell" /></label>}
    {!sheet && !error ? <small className="muted">Reading the sheet…</small>
      : sheet && !sheet.features.length && !sheet.spells.length ? <small className="muted">{sheet.name} has no features or spells you can see. Add them on the character’s Features and Spells tabs in the Encyclopedia.</small>
      : sheet && <>{part('feature', 'Features', sheet.features)}{part('spell', 'Spells', sheet.spells)}</>}
    {error && <small className="form-error" role="alert">{error}</small>}
    <span className="pop-foot"><button type="button" className="f-btn ghost small" onClick={onBack}>Back</button></span>
  </span>;
}

/** Tag someone: @ and a member's or character's name, which sends them an alert when the post goes up. */
export function TagPicker({ frame, insert, disabled }: { frame: Frame; insert: Insert; disabled: boolean }) {
  const [open, setOpen] = useState(false), [q, setQ] = useState(''), box = useAway(open, () => setOpen(false));
  const word = q.trim().toLowerCase(), list = frame.mentionable.filter(m => !word || m.name.toLowerCase().includes(word));
  return <span className="pop-wrap" ref={box}>
    <button type="button" title="Tag someone" aria-label="Tag someone" aria-expanded={open} className={open ? 'on' : ''} disabled={disabled} onClick={() => { setOpen(o => !o); setQ(''); }}><AtSign size={15} /><span className="tl">Tag</span></button>
    {open && <span className="tool-pop tag-pop" role="dialog" aria-label="Tag someone">
      <b className="pop-title">Tag someone</b>
      <label className="pop-search"><Search size={13} aria-hidden="true" /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="A character or a member" aria-label="Find someone to tag" /></label>
      <span className="tag-list">{list.slice(0, 40).map(m => <button type="button" key={(m.character ? 'c:' : 'm:') + m.name} onClick={() => { insert(`@${m.name} `); setOpen(false); }}><b>@{m.name}</b><small>{m.character ? 'Character: tells whoever plays them' : 'Member'}</small></button>)}
        {!list.length && <small className="muted">Nobody called “{q.trim()}”.</small>}</span>
      <small className="muted">They get an alert when your post goes up, if they can read the topic.</small>
    </span>}
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
