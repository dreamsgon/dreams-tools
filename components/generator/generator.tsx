"use client";
/*
 * The shared shell for every map generator (Dungeon, Hex map, World, Sector and Survey settings), so they look and
 * work the same in the Map Creator and the Encyclopedia:
 *
 *   GenDialog   a real modal (focus stays inside, Escape closes, focus returns where it was), title and close button
 *   Generator   kinds to pick from across the top, settings in folding sections on the left, and on the right the
 *               seed, the live preview and a short summary of it; the actions stay at the bottom. On a phone the
 *               seed and the preview come first.
 *   Section     a folding group of settings that shows its current value when folded
 *   Seed        the seed, with reroll buttons
 *   Choice      pick one: a radio group you can move through with the arrow keys
 *   Cards       pick one kind, as cards with a picture (also a radio group)
 *   Range, Check, Field, Hint   a slider that reads out its word ("Many"), a checkbox, a labelled select or input
 *   Actions     the buttons, and a note on why the main one is disabled
 *
 * The summary under the preview is also read out by screen readers, a moment after the settings stop changing.
 */
import "./generator.css";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Dices, X } from "lucide-react";

/** A modal dialog for a generator. `tabs` sit under the title (the Map Creator's Generate / Trace / Blank). */
export function GenDialog({ title, onClose, tabs, children, className = "" }: { title: string; onClose: () => void; tabs?: ReactNode; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null), titleId = useId();
  useEffect(() => {
    const dialog = ref.current, before = document.activeElement as HTMLElement | null;
    // The dialog itself takes focus, so Tab starts at the top and no button looks pressed when it opens.
    if (dialog && !dialog.open) { dialog.showModal(); dialog.focus(); }
    return () => { if (before?.isConnected) before.focus(); };
  }, []);
  return <dialog ref={ref} tabIndex={-1} className={`gen-dialog ${className}`} aria-labelledby={titleId}
    onCancel={e => { e.preventDefault(); onClose(); }}
    onMouseDown={e => { if (e.target === ref.current) onClose(); }}>
    <header className="gen-dialog-head"><h2 id={titleId}>{title}</h2><button type="button" className="gen-icon" aria-label="Close" onClick={onClose}><X size={18}/></button></header>
    {tabs}
    {children}
  </dialog>;
}

/** Tabs under a dialog's title. Arrow keys move between them. */
export function GenTabs<T extends string>({ label, value, tabs, onChange }: { label: string; value: T; tabs: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  const roving = useRoving(tabs.map(t => t[0]), value, onChange);
  return <div className="gen-tabs" role="tablist" aria-label={label} onKeyDown={roving.onKeyDown}>
    {tabs.map(([id, name], i) => <button key={id} ref={roving.ref(i)} type="button" role="tab" aria-selected={value === id} tabIndex={roving.tabIndex(i)} onClick={() => onChange(id)}>{name}</button>)}
  </div>;
}

/** The generator's layout. Everything but `settings` is optional. */
export function Generator({ kinds, settings, seed, picture, summary, extras, actions, label = "Preview" }: {
  kinds?: ReactNode; settings: ReactNode; seed?: ReactNode; picture?: ReactNode;
  /** One line about what the preview shows. It is also read out, a moment after it stops changing. */
  summary?: ReactNode; extras?: ReactNode; actions?: ReactNode; label?: string;
}) {
  return <div className="gen">
    {kinds && <div className="gen-kinds">{kinds}</div>}
    <div className="gen-panes">
      <div className="gen-settings">{settings}</div>
      <section className="gen-preview" aria-label={label}>
        <div className="gen-preview-top">{seed}{picture}{summary}</div>
        {extras && <div className="gen-extras">{extras}</div>}
      </section>
    </div>
    {actions}
  </div>;
}

/** The line under the preview. What it says is announced politely once the settings settle. */
export function Summary({ text, children }: { text: string; children?: ReactNode }) {
  const [said, setSaid] = useState(text);
  useEffect(() => { const t = setTimeout(() => setSaid(text), 900); return () => clearTimeout(t); }, [text]);
  return <>
    <p className="gen-summary">{children ?? text}</p>
    <span className="gen-sr" role="status" aria-live="polite">{said}</span>
  </>;
}

/** The preview picture. `busy` dims it while a slow preview catches up. */
export function Picture({ busy, children, className = "" }: { busy?: boolean; children: ReactNode; className?: string }) {
  return <div className={`gen-picture ${className}`} aria-busy={busy || undefined}>{children}</div>;
}

/** A folding group of settings. `summary` is its current value, shown beside the title. */
export function Section({ title, summary, open, children }: { title: string; summary?: ReactNode; open?: boolean; children: ReactNode }) {
  return <details className="gen-section" open={open}>
    <summary><span className="gen-section-title">{title}</span>{summary ? <span className="gen-section-value">{summary}</span> : null}</summary>
    <div className="gen-section-body">{children}</div>
  </details>;
}

export type Reroll = { label: string; onClick: () => void; title?: string; icon?: ReactNode };
/** The seed and its reroll buttons. The same seed and settings always make the same result. */
export function Seed({ value, onChange, rerolls, maxLength = 80, hint = "The same seed and settings always make the same map." }: { value: string; onChange: (v: string) => void; rerolls: Reroll[]; maxLength?: number; hint?: string }) {
  const id = useId();
  return <div className="gen-seed">
    <label className="gen-label" htmlFor={id}>Seed</label>
    <div className="gen-seed-row">
      <input id={id} value={value} maxLength={maxLength} spellCheck={false} autoComplete="off" aria-describedby={`${id}-hint`} onChange={e => onChange(e.target.value)}/>
      {rerolls.map(r => <button key={r.label} type="button" className="gen-btn" title={r.title} onClick={r.onClick}>{r.icon ?? <Dices size={15} aria-hidden="true"/>}{r.label}</button>)}
    </div>
    <small id={`${id}-hint`} className="gen-hint">{hint}</small>
  </div>;
}

/** Roving focus for a group where one item is chosen: Tab reaches the chosen one, arrow keys move and choose. */
export function useRoving<T>(values: readonly T[], value: T, pick: (v: T) => void) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]), at = values.indexOf(value);
  return {
    refs,
    ref: (i: number) => (el: HTMLButtonElement | null) => { refs.current[i] = el; },
    tabIndex: (i: number) => i === (at < 0 ? 0 : at) ? 0 : -1,
    onKeyDown: (e: KeyboardEvent) => {
      const n = values.length, from = at < 0 ? -1 : at;
      const to = e.key === "ArrowRight" || e.key === "ArrowDown" ? (from + 1) % n : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (from - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
      if (to < 0 || !n) return;
      e.preventDefault(); pick(values[to]); refs.current[to]?.focus();
    },
  };
}

export type Option<T> = readonly [T, ReactNode, string?];
/** How many equal columns a row of options gets: as many as fit the settings column, then balanced across rows. */
function segColumns(options: readonly Option<unknown>[]) {
  const longest = Math.max(...options.map(o => typeof o[1] === "string" ? o[1].length : 6));
  const fit = Math.max(1, Math.floor(318 / (longest * 6.6 + 22))), rows = Math.ceil(options.length / Math.min(options.length, fit));
  return Math.ceil(options.length / rows);
}
/**
 * Pick one of a few options. `look`: "seg" (buttons in a row that wrap when long), "chips" (rounded, for presets)
 * or "tiles" (a grid of small pictures, such as biomes). The third part of an option is its tooltip.
 */
export function Choice<T extends string | number>({ label, value, options, onChange, hint, look = "seg", hideLabel }: {
  label: string; value: T; options: readonly Option<T>[]; onChange: (v: T) => void; hint?: ReactNode; look?: "seg" | "chips" | "tiles"; hideLabel?: boolean;
}) {
  const id = useId(), roving = useRoving(options.map(o => o[0]), value, onChange);
  return <div className="gen-field">
    <span className={hideLabel ? "gen-sr" : "gen-label"} id={id}>{label}</span>
    <div className={`gen-choice gen-${look}`} style={look === "seg" ? { gridTemplateColumns: `repeat(${segColumns(options)}, minmax(0, 1fr))` } : undefined} role="radiogroup" aria-labelledby={id} aria-describedby={hint ? `${id}-hint` : undefined} onKeyDown={roving.onKeyDown}>
      {options.map(([v, name, title], i) => <button key={String(v)} ref={roving.ref(i)} type="button" role="radio" aria-checked={value === v} tabIndex={roving.tabIndex(i)} title={title} onClick={() => onChange(v)}>{name}</button>)}
    </div>
    {hint && <small id={`${id}-hint`} className="gen-hint">{hint}</small>}
  </div>;
}

export type Card<T> = { id: T; name: string; hint: string; icon?: ReactNode; wide?: boolean };
/** Pick what to generate, as cards. */
export function Cards<T extends string>({ label, value, cards, onChange }: { label: string; value: T | null; cards: readonly Card<T>[]; onChange: (v: T) => void }) {
  const roving = useRoving(cards.map(c => c.id), value as T, onChange), at = cards.findIndex(c => c.id === value);
  // On a phone the cards scroll sideways: keep the chosen one in view.
  useEffect(() => {
    // After a frame, so it also works when the dialog has only just opened.
    const frame = requestAnimationFrame(() => {
      const el = roving.refs.current[at], strip = el?.parentElement;
      if (!el || !strip || strip.scrollWidth <= strip.clientWidth) return;
      const a = el.getBoundingClientRect(), b = strip.getBoundingClientRect();
      if (a.left < b.left || a.right > b.right) strip.scrollBy({ left: a.left - b.left - 14 });
    });
    return () => cancelAnimationFrame(frame);
  }, [at, roving.refs]);
  return <div className="gen-cards" role="radiogroup" aria-label={label} onKeyDown={roving.onKeyDown}>
    {cards.map((c, i) => <button key={c.id} ref={roving.ref(i)} type="button" role="radio" aria-checked={value === c.id} tabIndex={roving.tabIndex(i)} className={c.wide ? "is-wide" : undefined} onClick={() => onChange(c.id)}>
      {c.icon}<span><b>{c.name}</b><small>{c.hint}</small></span></button>)}
  </div>;
}

/** A slider. `shown` is its value in words, shown beside the label and read out instead of the number. */
export function Range({ label, value, min, max, step = 1, shown, onChange, hint, disabled }: {
  label: string; value: number; min: number; max: number; step?: number; shown: string; onChange: (v: number) => void; hint?: ReactNode; disabled?: boolean;
}) {
  const id = useId();
  return <div className="gen-field">
    <label className="gen-label" htmlFor={id}><span>{label}</span><output htmlFor={id}>{shown}</output></label>
    <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} aria-valuetext={shown} aria-describedby={hint ? `${id}-hint` : undefined} onChange={e => onChange(+e.target.value)}/>
    {hint && <small id={`${id}-hint`} className="gen-hint">{hint}</small>}
  </div>;
}

/** A checkbox with an optional line under it. */
export function Check({ label, checked, onChange, hint, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode; disabled?: boolean }) {
  return <label className="gen-check"><input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)}/><span>{label}{hint && <small>{hint}</small>}</span></label>;
}

/** A labelled select, text or number input (the control goes in `children`). */
export function Field({ label, hint, children, className = "" }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return <label className={`gen-field ${className}`}><span className="gen-label">{label}</span>{children}{hint && <small className="gen-hint">{hint}</small>}</label>;
}

/** A short note among the settings. */
export function Hint({ children, alert }: { children: ReactNode; alert?: boolean }) {
  return <p className={alert ? "gen-hint gen-alert" : "gen-hint"} role={alert ? "alert" : undefined}>{children}</p>;
}

/** The dialog's buttons. `start` holds extra controls on the left; `why` says why the main button is disabled. */
export function Actions({ why, start, children }: { why?: string | false | null; start?: ReactNode; children: ReactNode }) {
  return <div className="gen-actions">
    {start}
    <span className="gen-why" role="status">{why || ""}</span>
    {children}
  </div>;
}
