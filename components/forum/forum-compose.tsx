'use client';
/*
 * Writing a post: who to post as (searchable, so a GM can find any NPC), a toolbar for the forum's markup
 * (lib/forum/markup.ts), emoji, a preview, a word count and, for moderators, what to do with the topic after
 * posting. The same box is the Quick reply under a topic, the full reply page and the edit page.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Bold, ChevronDown, Eye, Italic, MessageSquareQuote, PanelTopClose, Quote, Search, Underline } from 'lucide-react';
import { EmojiPicker, InsertMenu } from './forum-insert';
import { wordCount } from '@/lib/forum/markup';
import { type Frame } from './forum-api';
import { Circle, Portrait, PostText } from './forum-parts';
import { AiComposerHelp } from './forum-ai';
import { confirmDialog } from '../confirm-dialog';

type CastMember = Frame['you']['cast'][number];
export type AfterPost = '' | 'pin' | 'lock' | 'both';

/** Who to post as: in character, your own characters (a GM: any, or narration); out of character, yourself. */
export function useAs(frame: Frame, kind: 'ic' | 'ooc', preferred?: string | null) {
  const cast = frame.you.cast, gm = frame.you.rights.gm, mine = new Set(frame.you.editable);
  const first = cast.find(c => mine.has(c.id)) ?? (gm ? null : cast[0]) ?? null;
  const [as, setAs] = useState<string | null>(kind === 'ic' ? (preferred !== undefined && (preferred === null ? gm : cast.some(c => c.id === preferred)) ? preferred : first?.id ?? null) : null);
  return { as: kind === 'ic' ? as : null, setAs, blocked: kind === 'ic' && !cast.length && !gm };
}
type AsState = ReturnType<typeof useAs>;

/** The Post as button and its menu: your characters, narration, NPCs and the rest, with a search box. */
function AsPicker({ frame, k, kind, state }: { frame: Frame; k: string; kind: 'ic' | 'ooc'; state: AsState }) {
  const [open, setOpen] = useState(false), [q, setQ] = useState(''), box = useRef<HTMLDivElement>(null), search = useRef<HTMLInputElement>(null);
  const gm = frame.you.rights.gm, mine = useMemo(() => new Set(frame.you.editable), [frame.you.editable]);
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  if (kind === 'ooc') return <p className="as-line"><Circle name={frame.you.name} /> Posting as yourself, <b>{frame.you.name}</b></p>;
  const current = frame.you.cast.find(c => c.id === state.as);
  const pick = (id: string | null) => { state.setAs(id); setOpen(false); setQ(''); };
  const word = q.trim().toLowerCase(), hits = (c: CastMember) => !word || c.name.toLowerCase().includes(word) || c.role.toLowerCase().includes(word);
  const groups: [string, CastMember[]][] = gm
    ? [['Your characters', frame.you.cast.filter(c => mine.has(c.id))], ['NPCs and creatures', frame.you.cast.filter(c => !mine.has(c.id) && /NPC|Creature/.test(c.role))], ['Player characters and companions', frame.you.cast.filter(c => !mine.has(c.id) && !/NPC|Creature/.test(c.role))]]
    : [['Your characters', frame.you.cast]];
  const shown = groups.map(([label, list]) => [label, list.filter(hits)] as const).filter(([, list]) => list.length);
  const total = shown.reduce((n, [, l]) => n + l.length, 0), narration = gm && (!word || 'narration game master narrator'.includes(word));
  const option = (id: string | null, name: string, sub: ReactNode, picture: CastMember['picture'] | null) =>
    <button type="button" role="option" aria-selected={state.as === id} key={id ?? '-'} className={state.as === id ? 'on' : ''} onClick={() => pick(id)}>
      {id === null ? <span className="as-seal" aria-hidden="true">✦</span> : <Portrait k={k} picture={picture} name={name} className="portrait small" />}
      <span><b>{name}</b><small>{sub}</small></span>
    </button>;
  return <div className="as-pick" ref={box}>
    <span className="as-label">Post as</span>
    <button type="button" className="as-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)}>
      {current ? <Portrait k={k} picture={current.picture} name={current.name} className="portrait small" /> : <span className="as-seal" aria-hidden="true">✦</span>}
      <span><b>{current?.name ?? 'Game Master'}</b><small>{current ? (mine.has(current.id) ? 'Posting in character' : current.role) : `Narration, written by ${frame.you.name}`}</small></span>
      <ChevronDown size={15} aria-hidden="true" />
    </button>
    {open && <div className="as-menu" role="listbox" aria-label="Post as" onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}>
      {frame.you.cast.length > 6 && <label className="as-search"><Search size={14} aria-hidden="true" /><input ref={search} value={q} onChange={e => setQ(e.target.value)} placeholder={gm ? 'Search characters and NPCs…' : 'Search your characters…'} aria-label="Search characters" /></label>}
      {narration && <><h5>Narration</h5>{option(null, 'Game Master', 'Narration, written as the GM', null)}</>}
      {shown.map(([label, list]) => <div key={label}><h5>{label}{word && ` · ${list.length}`}</h5>{list.slice(0, 60).map(c => option(c.id, c.name, c.role, c.picture))}</div>)}
      {!total && !narration && <p className="muted as-none">Nobody called “{q.trim()}”. NPCs come from the campaign’s character pages in the Encyclopedia.</p>}
    </div>}
  </div>;
}

/** The toolbar: each button wraps the selection (or inserts a placeholder) in the post's markup. */
function Toolbar({ frame, k, box, set, preview, setPreview }: { frame: Frame; k: string; box: RefObject<HTMLTextAreaElement | null>; set: (v: string) => void; preview: boolean; setPreview: (v: boolean) => void }) {
  const edit = (make: (sel: string) => { text: string; select?: [number, number] }) => {
    const t = box.current; if (!t) return;
    const { selectionStart: a, selectionEnd: b, value } = t, made = make(value.slice(a, b));
    const next = value.slice(0, a) + made.text + value.slice(b);
    set(next);
    requestAnimationFrame(() => { t.focus(); const [x, y] = made.select ?? [made.text.length, made.text.length]; t.setSelectionRange(a + x, a + y); });
  };
  const wrap = (before: string, after: string, placeholder: string) => edit(sel => { const inner = sel || placeholder; return { text: before + inner + after, select: [before.length, before.length + inner.length] }; });
  const lines = (prefix: string, placeholder: string) => edit(sel => { const text = (sel || placeholder).split('\n').map(l => prefix + l.replace(/^> ?/, '')).join('\n'); return { text, select: sel ? undefined : [prefix.length, text.length] }; });
  const tool = (label: string, icon: ReactNode, run: () => void, extra?: string) => <button type="button" title={label} aria-label={label} className={extra} disabled={preview} onClick={run}>{icon}<span className="tl">{label}</span></button>;
  return <div className="tools" role="toolbar" aria-label="Formatting">
    {tool('Bold', <Bold size={15} />, () => wrap('**', '**', 'bold text'))}
    {tool('Italic', <Italic size={15} />, () => wrap('*', '*', 'italic text'))}
    {tool('Underline', <Underline size={15} />, () => wrap('__', '__', 'underlined text'))}
    <span className="sep" />
    {tool('Speech', <MessageSquareQuote size={15} />, () => wrap('“', '”', 'What they say'))}
    {tool('Quote', <Quote size={15} />, () => lines('> ', 'Quoted text'))}
    {tool('Collapse', <PanelTopClose size={15} />, () => edit(sel => { const head = '[collapse=Read more]\n', inner = sel || 'Text readers open when they want it'; return { text: `${head}${inner}\n[/collapse]`, select: [head.length, head.length + inner.length] }; }))}
    <span className="sep" />
    <InsertMenu frame={frame} k={k} disabled={preview} wrap={wrap} insert={text => edit(() => ({ text }))} />
    <EmojiPicker frame={frame} k={k} disabled={preview} insert={text => edit(() => ({ text }))} />
    <span className="sep" />
    <button type="button" title="Preview" aria-label="Preview" aria-pressed={preview} className={preview ? 'on' : ''} onClick={() => setPreview(!preview)}><Eye size={15} /><span className="tl">Preview</span></button>
  </div>;
}

export const MARKUP_HINT = 'Blank lines start paragraphs. **bold**, *italic*, __underline__, “speech”, > quote, [[page link]], [collapse=Title]…[/collapse], [roll=Attack vs 15]1d20+5[/roll] (the forum rolls it when you post), :emoji:.';

/**
 * Write a reply, a new topic (with `title`) or an edit (with `initial`). Unsent text stays in this browser under
 * `draftKey` until it's posted, so the Quick reply and the full reply page share one draft.
 */
export function Composer({ frame, k, kind, onPost, title: withTitle, draftKey, quote, preferred, onCancel, mode = 'quick', initial, label, foot, after: withAfter, big, where }: {
  frame: Frame; k: string; kind: 'ic' | 'ooc'; onPost: (v: { title: string; body: string; as: string | null; after: AfterPost; ai: boolean }) => Promise<void>;
  /** The topic or board, for the AI help (forum-ai.tsx). */
  where?: { topicId: string } | { boardId: string };
  title?: boolean; draftKey: string; quote?: { text: string; n: number }; preferred?: string | null; onCancel?: () => void;
  mode?: 'quick' | 'full' | 'edit'; initial?: string; label?: string; foot?: ReactNode; after?: boolean; big?: boolean;
}) {
  const storeKey = 'forum-draft:' + draftKey, editing = mode === 'edit';
  const state = useAs(frame, kind, preferred), [title, setTitle] = useState('');
  const [body, setBody] = useState(() => { if (editing) return initial ?? ''; try { return localStorage.getItem(storeKey) ?? ''; } catch { return ''; } });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [preview, setPreview] = useState(false), [after, setAfter] = useState<AfterPost>(''), [drafted, setDrafted] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null), [quoted, setQuoted] = useState(0);
  useEffect(() => { if (editing) return; try { if (body) localStorage.setItem(storeKey, body); else localStorage.removeItem(storeKey); } catch { /* storage may be off */ } }, [body, storeKey, editing]);
  // A Quote click adds the quoted lines to the end of the post.
  if (quote && quote.n !== quoted) { setQuoted(quote.n); setBody(b => (b ? b.replace(/\s*$/, '\n\n') : '') + quote.text + '\n\n'); }
  useEffect(() => { if (quoted) { box.current?.focus(); box.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }, [quoted]);
  if (state.blocked) return <div className="composer composer-note"><p>To post in character you need a character. Ask your GM to add you to your character page’s <b>Who can edit</b>.</p></div>;
  const send = async () => {
    setBusy(true); setError('');
    try {
      await onPost({ title, body, as: state.as, after, ai: drafted });
      if (!editing) { setBody(''); setTitle(''); setAfter(''); setDrafted(false); setPreview(false); try { localStorage.removeItem(storeKey); } catch { /* ignore */ } }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not post.'); }
    finally { setBusy(false); }
  };
  const words = wordCount(body), mod = frame.you.rights.moderate && withAfter;
  return <form className={`composer composer-${mode}${big ? ' big' : ''}`} onSubmit={e => { e.preventDefault(); void send(); }}>
    <div className="composer-head">
      {editing ? <span className="as-label">Editing your post</span> : <AsPicker frame={frame} k={k} kind={kind} state={state} />}
      {label && <span className="composer-kind">{label}</span>}
    </div>
    {withTitle && <input className="composer-title" placeholder="Topic title" value={title} maxLength={120} onChange={e => setTitle(e.target.value)} aria-label="Topic title" />}
    <Toolbar frame={frame} k={k} box={box} set={setBody} preview={preview} setPreview={setPreview} />
    {preview ? <div className="composer-preview" aria-label="Preview">{body.trim() ? <PostText text={body} /> : <p className="muted">Nothing to preview yet.</p>}</div>
      : <textarea ref={box} value={body} onChange={e => setBody(e.target.value)} rows={big ? 18 : withTitle ? 10 : 7} placeholder={kind === 'ic' ? 'Write your post…' : 'Write to the table…'} aria-label="Post text" onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void send(); }} />}
    <div className="composer-foot">
      <small className="muted">{words} {words === 1 ? 'word' : 'words'}<span className="hint"> · {MARKUP_HINT}</span></small>
      <span className="composer-acts">
        {mod && <label className="f-select small">After posting <select value={after} onChange={e => setAfter(e.target.value as AfterPost)}>
          <option value="">Leave the topic as it is</option><option value="pin">Pin this topic</option><option value="lock">Lock this topic</option><option value="both">Pin and lock it</option>
        </select></label>}
        {foot}
        {onCancel && <button type="button" className="f-btn ghost" onClick={onCancel}>Cancel</button>}
        <button className="f-btn" disabled={busy || !body.trim() || (withTitle && !title.trim())}>{busy ? (editing ? 'Saving…' : 'Posting…') : editing ? 'Save changes' : withTitle ? 'Start topic' : 'Post reply'}</button>
      </span>
    </div>
    {drafted && <p className="muted small ai-note">Drafted with AI: read it through and change what you like. The post will show it was drafted with AI.</p>}
    {where && !editing && <AiComposerHelp frame={frame} k={k} where={where} body={body} as={state.as} title={withTitle ? title : undefined} onDraft={text => { void (async () => {
      if (body.trim() && !await confirmDialog({ title: 'Replace what you wrote?', message: 'The AI’s draft takes the place of the text in the box.', confirm: 'Replace it' })) return;
      setBody(text); setDrafted(true); setPreview(false);
    })(); }} />}
    {error && <p className="form-error" role="alert">{error}</p>}
  </form>;
}
