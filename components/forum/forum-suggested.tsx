'use client';
/*
 * Posts an AI connection suggested in a topic (MCP post_to_forum, set to Ask me), waiting for the GM or a co-GM:
 * Approve posts it with the AI mark (dice roll then), Change opens it in a box first, Skip drops it.
 */
import { useState } from 'react';
import { Bot, Check, Pencil, X } from 'lucide-react';
import { forumCall, fullDate, when, type TopicPage } from './forum-api';
import { Portrait, PostText } from './forum-parts';
import { ROLL_TAG } from '@/lib/forum/rolls';

/** Dice aren't rolled until the post goes up, so a tag shows what it will roll. */
const unrolled = (body: string) => body.replace(ROLL_TAG, (_m, label: string | undefined, expr: string) => `**🎲 ${label?.trim() ? `${label.trim()}: ` : ''}${expr.trim()}**`);

type Suggested = TopicPage['suggested'][number];

export function SuggestedPosts({ page, k, done }: { page: TopicPage; k: string; done: () => Promise<void> }) {
  if (!page.suggested.length) return null;
  return <section className="suggested" aria-label="Suggested posts">
    <h2 className="category-title"><Bot size={15} aria-hidden="true" />Waiting for you <small className="muted">{page.suggested.length === 1 ? 'a post your AI suggested' : `${page.suggested.length} posts your AI suggested`}: only the GMs see these</small></h2>
    {page.suggested.map(s => <SuggestedPost key={s.id} s={s} page={page} k={k} done={done} />)}
  </section>;
}

function SuggestedPost({ s, page, k, done }: { s: Suggested; page: TopicPage; k: string; done: () => Promise<void> }) {
  const [text, setText] = useState<string | null>(null), [busy, setBusy] = useState<'' | 'approve' | 'skip'>(''), [error, setError] = useState('');
  const narration = !s.as && page.topic.kind === 'ic';
  const answer = async (op: 'approve' | 'skip') => {
    setBusy(op); setError('');
    try { await forumCall({ action: 'suggestion', campaign: k, topicId: page.topic.id, suggestionId: s.id, op, ...(op === 'approve' && text !== null ? { body: text } : {}) }); await done(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not do that.'); setBusy(''); }
  };
  return <article className="suggested-post">
    <header>
      {narration ? <span className="as-seal tiny" aria-hidden="true">✦</span> : <Portrait k={k} picture={s.picture} name={s.name} className="portrait tiny" />}
      <span className="suggested-who"><b>{s.name}</b><small className="muted">Suggested by {s.connection} · <time dateTime={s.at} title={fullDate(s.at)}>{when(s.at)}</time></small></span>
    </header>
    {text === null ? <div className="suggested-body"><PostText text={unrolled(s.body)} links={page.links} rolls={[]} /></div>
      : <textarea className="suggested-edit" value={text} rows={Math.min(16, Math.max(5, text.split('\n').length + 1))} maxLength={30000} aria-label="The suggested post" onChange={e => setText(e.target.value)} />}
    <footer className="suggested-acts">
      <button type="button" className="f-btn small" disabled={!!busy || (text !== null && !text.trim())} onClick={() => void answer('approve')}><Check size={13} aria-hidden="true" />{busy === 'approve' ? 'Posting…' : text === null ? 'Approve' : 'Post it'}</button>
      {text === null ? <button type="button" className="f-btn ghost small" disabled={!!busy} onClick={() => setText(s.body)}><Pencil size={13} aria-hidden="true" />Change</button>
        : <button type="button" className="f-btn ghost small" disabled={!!busy} onClick={() => setText(null)}>Cancel changes</button>}
      <button type="button" className="f-btn ghost small" disabled={!!busy} onClick={() => void answer('skip')}><X size={13} aria-hidden="true" />{busy === 'skip' ? 'Skipping…' : 'Skip'}</button>
      <small className="muted">Posted as you with the AI draft mark. Dice in it roll when it’s posted.</small>
    </footer>
    {error && <p className="form-error" role="alert">{error}</p>}
  </article>;
}
