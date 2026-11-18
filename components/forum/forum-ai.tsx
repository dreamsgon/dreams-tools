'use client';
/*
 * The forum's AI help (lib/forum/ai.ts): Summarize and Catch me up on a topic, Check my post and Draft with AI in the
 * post box. What each person may use comes with the page (frame.you.ai); the GM sets it in Forum settings.
 */
import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { forumCall, type Frame, type TopicPage } from './forum-api';

type Summary = { summary: string; points: string[]; posts: number; by?: string };
const errorOf = (e: unknown) => e instanceof Error ? e.message : 'The AI didn’t answer. Try again.';

/** Summarize the topic, or catch up on what's new since you last read it. */
export function AiTopicHelp({ frame, page, k, since }: { frame: Frame; page: TopicPage; k: string; since: string | null }) {
  const [out, setOut] = useState<(Summary & { what: 'summary' | 'catchUp' }) | null>(null), [busy, setBusy] = useState<'' | 'summary' | 'catchUp'>(''), [error, setError] = useState('');
  if (!frame.you.ai.catchUp || page.posts.length < 2) return null;
  const fresh = since ? page.posts.filter(p => !p.mine && p.at > since).length : 0;
  const ask = async (op: 'summary' | 'catchUp') => {
    setBusy(op); setError('');
    try { setOut({ ...await forumCall<Summary>({ action: 'ai', campaign: k, op, topicId: page.topic.id, ...(op === 'catchUp' && since ? { since } : {}) }), what: op }); }
    catch (e) { setError(errorOf(e)); } finally { setBusy(''); }
  };
  return <div className="ai-help">
    <span className="ai-acts">
      {fresh > 0 && <button type="button" className="f-btn ghost small ai-btn" disabled={!!busy} onClick={() => void ask('catchUp')}><Sparkles size={13} aria-hidden="true" />{busy === 'catchUp' ? 'Catching you up…' : `Catch me up (${fresh} new)`}</button>}
      <button type="button" className="f-btn ghost small ai-btn" disabled={!!busy} onClick={() => void ask('summary')}><Sparkles size={13} aria-hidden="true" />{busy === 'summary' ? 'Summarizing…' : 'Summarize'}</button>
    </span>
    {out && <section className="ai-panel" aria-label={out.what === 'catchUp' ? 'Catch me up' : 'Summary'}>
      <header><Sparkles size={14} aria-hidden="true" /><b>{out.what === 'catchUp' ? `What’s new: ${out.posts} ${out.posts === 1 ? 'post' : 'posts'}` : 'The topic so far'}</b><small className="muted">{out.by ? `by ${out.by}, ` : ''}an AI summary: check the posts for the details</small>
        <button type="button" className="icon-btn" aria-label="Close" onClick={() => setOut(null)}><X size={14} /></button></header>
      <p>{out.summary}</p>
      {out.points.length > 0 && <ul>{out.points.map((p, i) => <li key={i}>{p}</li>)}</ul>}
    </section>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}

type Note = { kind: 'continuity' | 'spelling' | 'unclear'; quote?: string; note: string };
const KIND = { continuity: 'Continuity', spelling: 'Spelling', unclear: 'Unclear' } as const;

/**
 * Check my post and Draft with AI, under the post box. `where` is the topic (a reply) or the board (a new topic).
 * `onDraft` puts the AI's post in the box.
 */
export function AiComposerHelp({ frame, k, where, body, as, title, onDraft }: { frame: Frame; k: string; where: { topicId: string } | { boardId: string }; body: string; as: string | null; title?: string; onDraft: (text: string) => void }) {
  const ai = frame.you.ai, [notes, setNotes] = useState<{ list: Note[]; by?: string; for: string } | null>(null), [drafting, setDrafting] = useState(false), [hint, setHint] = useState('');
  const [busy, setBusy] = useState<'' | 'check' | 'draft'>(''), [error, setError] = useState('');
  if (!ai.check && !ai.draft) return null;
  const check = async () => {
    setBusy('check'); setError('');
    try { const got = await forumCall<{ notes: Note[]; by?: string }>({ action: 'ai', campaign: k, op: 'check', ...where, body, as, ...(title ? { title } : {}) }); setNotes({ list: got.notes, by: got.by, for: body }); }
    catch (e) { setError(errorOf(e)); } finally { setBusy(''); }
  };
  const draft = async () => {
    setBusy('draft'); setError('');
    try { const got = await forumCall<{ body: string }>({ action: 'ai', campaign: k, op: 'draft', ...where, as, hint, ...(title ? { title } : {}) }); onDraft(got.body); setDrafting(false); setHint(''); }
    catch (e) { setError(errorOf(e)); } finally { setBusy(''); }
  };
  return <div className="ai-compose">
    <span className="ai-acts">
      {ai.check && <button type="button" className="f-btn ghost small ai-btn" disabled={!!busy || !body.trim()} onClick={() => void check()}><Sparkles size={13} aria-hidden="true" />{busy === 'check' ? 'Checking…' : 'Check my post'}</button>}
      {ai.draft && !drafting && <button type="button" className="f-btn ghost small ai-btn" disabled={!!busy} onClick={() => setDrafting(true)}><Sparkles size={13} aria-hidden="true" />Draft with AI</button>}
    </span>
    {drafting && <div className="ai-draft">
      <input value={hint} maxLength={500} onChange={e => setHint(e.target.value)} placeholder="What should happen? (optional, like: the guards arrive and ask for papers)" aria-label="What the AI should write" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void draft(); } }} />
      <button type="button" className="f-btn small" disabled={!!busy} onClick={() => void draft()}>{busy === 'draft' ? 'Writing…' : 'Write it'}</button>
      <button type="button" className="f-btn ghost small" onClick={() => setDrafting(false)}>Cancel</button>
      <small className="muted">The draft goes in the box for you to read and change. The post shows it was drafted with AI.</small>
    </div>}
    {notes && <section className="ai-panel ai-notes" aria-label="Notes on your post">
      <header><Sparkles size={14} aria-hidden="true" /><b>{notes.list.length ? `${notes.list.length} ${notes.list.length === 1 ? 'thing' : 'things'} to look at` : 'Nothing to fix'}</b><small className="muted">{notes.by ? `${notes.by} · ` : ''}{notes.for !== body ? 'you’ve changed the post since' : 'suggestions only, the post is yours'}</small>
        <button type="button" className="icon-btn" aria-label="Close" onClick={() => setNotes(null)}><X size={14} /></button></header>
      {notes.list.length > 0 && <ul>{notes.list.map((n, i) => <li key={i}><span className={`tag ai-kind ${n.kind}`}>{KIND[n.kind]}</span>{n.quote && <q>{n.quote}</q>} {n.note}</li>)}</ul>}
    </section>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
