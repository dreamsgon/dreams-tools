'use client';
import { useEffect, useMemo, useState } from 'react';
import { Check, ClipboardCopy, Sparkles, X } from 'lucide-react';
import type { Entry } from '@/lib/encyclopedia/world-model';
import { fitWords, pageText, worldCheckPrompt, worldSettings, type Fit, type WorldChange, type WorldCheck, type WorldCheckRequest } from '@/lib/encyclopedia/world-check';
import { rainWord, temperatureWords } from '@/lib/encyclopedia/planet-generator';
import { fetchConnections, keyFields } from '@/lib/ai/device-keys';

type Key = { id: string; name: string; model: string };
type Checked = WorldCheck & { by: string; model: string; tokens: number; skipped: number };
const MAX_PAGES = 8;
const kindWord = (k: string) => k === 'faction' ? 'organization' : k;
const amount = (v: number) => v <= 0 ? 'none' : v < 25 ? 'few' : v < 60 ? 'some' : v < 85 ? 'many' : 'lots';
const choiceWords: Record<string, string> = { spin: 'Spins', locked: 'Tidally locked', medium: 'Earth-sized', none: 'None', simple: 'Simple', complex: 'Complex' };

/** The words on an Apply button: "Set temperature to Cold". */
export function changeLabel(c: WorldChange) {
  const v = c.value, n = typeof v === 'number' ? v : Number(v), label = worldSettings[c.setting].label.toLowerCase();
  const words = c.setting === 'temp' ? temperatureWords[String(n)] : c.setting === 'rain' ? `${rainWord(n)} (${n})` : c.setting === 'tilt' ? `${n}°`
    : c.setting === 'water' || c.setting === 'seaLevel' ? `${n}% sea` : c.setting === 'mountains' || c.setting === 'volcanism' ? `${amount(n)} (${n})`
    : typeof v === 'string' ? choiceWords[v] ?? v.charAt(0).toUpperCase() + v.slice(1) : String(v);
  return `Set ${label} to ${words}`;
}

/** The campaign's connections made with the GM's own API key. */
export function useKeys(campaignId: string | null) {
  const [keys, setKeys] = useState<Key[] | null>(null);
  useEffect(() => {
    if (!campaignId) return;
    let live = true;
    fetchConnections<{ id: string; name: string; api?: { model: string } }>(campaignId).then(list => {
      if (live) setKeys(list.flatMap(c => c.api ? [{ id: c.id, name: c.name, model: c.api.model }] : []));
    }).catch(() => { if (live) setKeys([]); });
    return () => { live = false; };
  }, [campaignId]);
  return campaignId ? keys : [];
}

/**
 * Check with your AI, under the built-in checks: the GM picks the pages it should check against (a galaxy, star system or
 * lore page) and says what to keep in mind; an API-key connection checks it here, or the GM copies a prompt into their
 * AI app. Findings come back with Apply buttons for the settings. Nothing changes until the GM presses Apply.
 */
export function WorldAiCheck({ campaignId, campaign, pages, suggested, request, onApply }: {
  campaignId: string | null; campaign: { name: string; description?: string };
  /** Pages the GM can pick from, and the ones ticked to begin with. */
  pages: Entry[]; suggested: string[];
  request: Omit<WorldCheckRequest, 'pages' | 'note'>;
  onApply: (c: WorldChange) => void;
}) {
  const keys = useKeys(campaignId);
  const [open, setOpen] = useState(false), [picked, setPicked] = useState<string[]>(() => suggested.slice(0, MAX_PAGES)), [note, setNote] = useState('');
  const [keyId, setKeyId] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [copied, setCopied] = useState('');
  const [result, setResult] = useState<Checked | null>(null), [applied, setApplied] = useState<number[]>([]);
  const chosen = keys?.find(k => k.id === keyId) ?? keys?.[0];
  const byId = useMemo(() => new Map(pages.map(e => [e.id, e])), [pages]);
  const others = useMemo(() => pages.filter(e => !picked.includes(e.id)).sort((a, b) => a.title.localeCompare(b.title)), [pages, picked]);
  const full: WorldCheckRequest = { ...request, pages: picked, ...(note.trim() ? { note: note.trim() } : {}) };
  const prompt = () => worldCheckPrompt(full, campaign, picked.flatMap(id => { const e = byId.get(id); return e ? [{ title: e.title, kind: kindWord(e.kind), text: pageText(e.body) }] : []; }), true);
  const estimate = Math.round((prompt().length / 4 + 1800) / 100) * 100;

  const copy = async () => {
    try { await navigator.clipboard.writeText(prompt()); setCopied('Prompt copied. Paste it into your AI app.'); }
    catch { setCopied('Couldn’t copy here. Open See the prompt and copy it from there.'); }
  };
  const run = async () => {
    if (!chosen || !campaignId) return;
    setBusy(true); setError('');
    const r = await fetch('/api/encyclopedia/tie-writer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaignId, ...keyFields(chosen.id), check: full }) })
      .then(r => r.json().then(b => ({ ok: r.ok, b }))).catch(() => ({ ok: false, b: { error: 'Couldn’t reach RPG Tools. Check your connection and try again.' } }));
    setBusy(false);
    if (!r.ok) { setError(r.b.error ?? 'Could not check the world.'); return; }
    setResult(r.b as Checked); setApplied([]);
  };
  const verdict = (f: Fit) => <span className={`ai-fit is-${f}`}>{fitWords[f]}</span>;

  if (!open) return <section className="world-ai-check" aria-label="Check with your AI">
    <div className="world-ai-head"><h3>Check with your AI</h3><button type="button" className="button small" onClick={() => setOpen(true)}><Sparkles size={13}/> Check with your AI</button></div>
    <p className="aside-hint">Your own AI reads these settings and the map, plus pages you pick, such as your galaxy, star system or lore, and says what fits and what&apos;s a stretch.</p>
  </section>;

  return <section className="world-ai-check is-open" aria-label="Check with your AI">
    <div className="world-ai-head"><h3>Check with your AI</h3><button type="button" className="icon-button" aria-label="Close the AI check" onClick={() => setOpen(false)}><X size={14}/></button></div>
    {!result && <>
      <div className="world-field">Pages to check against <output>{picked.length ? `${picked.length} picked` : 'None'}</output>
        <div className="world-ai-pages">
          {picked.map(id => { const e = byId.get(id); return e ? <span key={id} className="world-ai-page">{e.title}<small>{kindWord(e.kind)}</small><button type="button" aria-label={`Leave out ${e.title}`} onClick={() => setPicked(p => p.filter(x => x !== id))}><X size={12}/></button></span> : null; })}
        </div>
        {picked.length < MAX_PAGES && others.length > 0 && <select aria-label="Add a page" value="" onChange={e => { const v = e.target.value; if (v) setPicked(p => [...p, v].slice(0, MAX_PAGES)); }}>
          <option value="">Add a page…</option>{others.map(e => <option key={e.id} value={e.id}>{e.title} ({kindWord(e.kind)})</option>)}
        </select>}
      </div>
      <label className="world-field">Anything it should keep in mind? <small className="aside-hint">optional</small>
        <textarea rows={2} maxLength={500} value={note} placeholder="A frontier world settlers struggle to tame" onChange={e => setNote(e.target.value)}/>
      </label>
      {keys && keys.length > 1 && <label className="world-field">Checked by<select value={chosen?.id} onChange={e => setKeyId(e.target.value)}>{keys.map(k => <option key={k.id} value={k.id}>{k.name} · {k.model}</option>)}</select></label>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {copied && <p className="aside-hint" role="status">{copied}</p>}
      <p className="aside-hint">{chosen ? `About ${estimate.toLocaleString('en-US')} tokens from ${chosen.name}’s monthly limit. It reads only the pages that connection may see. Nothing changes until you press Apply.` : keys === null ? 'Looking for your AI connections…' : 'Add an API key with Connect an AI to check here, or copy the prompt into your AI app.'}</p>
      <details className="world-ai-prompt"><summary>See the prompt</summary><textarea readOnly rows={8} aria-label="The prompt" value={prompt()}/></details>
      <div className="button-row world-ai-actions">
        <button type="button" className="button small" onClick={() => void copy()}><ClipboardCopy size={13}/> Copy prompt for my AI app</button>
        {chosen && <button type="button" className="button small primary" disabled={busy} onClick={() => void run()}><Sparkles size={13}/> {busy ? `Checking with ${chosen.name}…` : `Check with ${chosen.name}`}</button>}
      </div>
    </>}
    {result && <>
      <p className="world-ai-verdict">{verdict(result.verdict)} <span>{result.verdict === 'fits' ? 'It all hangs together.' : result.verdict === 'stretch' ? 'Mostly fits, with things to look at.' : 'Something important doesn’t fit.'}</span></p>
      <ul className="world-ai-findings">{result.findings.map((f, i) => <li key={i}>
        <div className="world-ai-finding-head"><strong>{f.title}</strong>{applied.includes(i) ? <span className="ai-fit is-fits"><Check size={11}/> Done</span> : verdict(f.fit)}</div>
        {f.quote && <blockquote>{f.quote}{f.page && <cite> {f.page}</cite>}</blockquote>}
        <p>{f.text}</p>
        {f.change && !applied.includes(i) && <button type="button" className="button small" onClick={() => { onApply(f.change!); setApplied(a => [...a, i]); }}>{changeLabel(f.change)}</button>}
      </li>)}</ul>
      <p className="aside-hint">Checked by {result.by} · {result.model} ({result.tokens.toLocaleString('en-US')} tokens).{result.skipped ? ` It left out ${result.skipped} page${result.skipped === 1 ? '' : 's'} that connection may not read.` : ''} The AI can be wrong: you have the last word.</p>
      <div className="button-row world-ai-actions"><button type="button" className="button small" onClick={() => setResult(null)}>Change what it reads</button><button type="button" className="button small primary" disabled={busy} onClick={() => void run()}><Sparkles size={13}/> {busy ? 'Checking…' : 'Check again'}</button></div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </>}
  </section>;
}
