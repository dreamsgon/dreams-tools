"use client";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, Plus } from "lucide-react";
import { usePopover } from "./popover-menu";
import { fitCount, foldCrumbs } from "@/lib/breadcrumbs";
import "./breadcrumbs.css";

export type CrumbSibling = { id: string; label: string; icon?: ReactNode; current?: boolean; go: () => void };
export type Crumb = {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Goes to this level. Without it, clicking the name opens the sibling list instead. */
  go?: () => void;
  /** Other places at this level, listed by the arrow next to the name. */
  siblings?: { heading: string; items: CrumbSibling[]; onNew?: { label: string; run: () => void } };
  /** Replaces the name button, for a level that brings its own control (such as Maptable's scene switcher). */
  render?: ReactNode;
};

/**
 * The one breadcrumb trail for a page. Every level is a button, the arrow beside it
 * lists the other places at that level, long trails fold their middle into "…", and on
 * a phone it becomes Back plus a title that opens the whole path. Alt+Up goes up a level.
 */
export default function Breadcrumbs({ items, label = "Breadcrumb", className = "" }: { items: Crumb[]; label?: string; className?: string }) {
  const nav = useRef<HTMLElement>(null), measure = useRef<HTMLOListElement>(null);
  const [max, setMax] = useState(items.length);
  useEffect(() => {
    const el = nav.current, ruler = measure.current;
    if (!el || !ruler || typeof ResizeObserver === "undefined") return;
    // Measures every level at its natural width, then shows as many as fit.
    const fit = () => setMax(fitCount([...ruler.children].map(li => li.getBoundingClientRect().width), el.clientWidth));
    const watch = new ResizeObserver(fit);
    watch.observe(el); watch.observe(ruler);
    return () => watch.disconnect();
  }, []);
  const parent = items.length > 1 ? items[items.length - 2] : null;
  useEffect(() => {
    const up = (e: KeyboardEvent) => {
      if (!e.altKey || e.key !== "ArrowUp" || !parent?.go) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault(); parent.go();
    };
    window.addEventListener("keydown", up);
    return () => window.removeEventListener("keydown", up);
  }, [parent]);
  const { shown, hidden } = foldCrumbs(items, max);
  return <nav ref={nav} className={`crumbbar ${className}`.trim()} aria-label={label}>
    <ol className="crumbbar-full">
      {shown.map((c, i) => <Fragment key={c.id}>
        {i > 0 && <li className="crumbbar-sep" aria-hidden="true"><ChevronRight size={13} /></li>}
        {i === 1 && hidden.length > 0 && <><li><Folded items={hidden} /></li><li className="crumbbar-sep" aria-hidden="true"><ChevronRight size={13} /></li></>}
        <li className="crumbbar-item"><Level crumb={c} last={c === items[items.length - 1]} /></li>
      </Fragment>)}
    </ol>
    <ol className="crumbbar-full crumbbar-measure" ref={measure} aria-hidden="true">
      {items.map(c => <li key={c.id}><span className="crumbbar-name">{c.icon}<span>{c.label}</span></span>{(c.render || c.siblings) && <span className="crumbbar-caret" />}</li>)}
    </ol>
    <Compact items={items} />
  </nav>;
}

function Level({ crumb: c, last }: { crumb: Crumb; last: boolean }) {
  const { open, setOpen, wrapper } = usePopover();
  if (c.render) return <>{c.render}</>;
  const list = c.siblings && (c.siblings.items.length > 1 || c.siblings.onNew);
  const name = <>{c.icon}<span>{c.label}</span></>;
  return <div className={`crumbbar-level${last ? " is-current" : ""}${open ? " is-open" : ""}`} ref={wrapper}>
    {last ? <span className="crumbbar-name" aria-current="page">{name}</span>
      : c.go ? <button type="button" className="crumbbar-name" onClick={c.go}>{name}</button>
        : <button type="button" className="crumbbar-name" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(v => !v)}>{name}</button>}
    {list && <button type="button" className="crumbbar-caret" aria-label={`Other places in ${c.siblings!.heading}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(v => !v)}><ChevronDown size={13} /></button>}
    {open && c.siblings && <div className="crumbbar-menu" role="menu" aria-label={c.siblings.heading}>
      <div className="crumbbar-menu-head">{c.siblings.heading}</div>
      <div className="crumbbar-menu-list">
        {c.siblings.items.map(s => <button type="button" role="menuitem" key={s.id} className={s.current ? "is-current" : ""} aria-current={s.current ? "true" : undefined} onClick={() => { setOpen(false); s.go(); }}>
          {s.icon}<span>{s.label}</span>{s.current && <Check size={14} aria-hidden="true" />}
        </button>)}
      </div>
      {c.siblings.onNew && <button type="button" role="menuitem" className="crumbbar-menu-new" onClick={() => { setOpen(false); c.siblings!.onNew!.run(); }}><Plus size={14} aria-hidden="true" />{c.siblings.onNew.label}</button>}
    </div>}
  </div>;
}

function Folded({ items }: { items: Crumb[] }) {
  const { open, setOpen, wrapper } = usePopover();
  return <div className="crumbbar-level" ref={wrapper}>
    <button type="button" className="crumbbar-name crumbbar-more" aria-label={`Show ${items.length} hidden levels`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(v => !v)}><MoreHorizontal size={16} /></button>
    {open && <div className="crumbbar-menu" role="menu" aria-label="Hidden levels">
      <div className="crumbbar-menu-list">
        {items.map((c, i) => <button type="button" role="menuitem" key={c.id} disabled={!c.go} style={{ paddingLeft: 10 + i * 14 }} onClick={() => { setOpen(false); c.go?.(); }}>{c.icon}<span>{c.label}</span></button>)}
      </div>
    </div>}
  </div>;
}

/** Phones: Back to the level above, and a title that opens the whole path. */
function Compact({ items }: { items: Crumb[] }) {
  const { open, setOpen, wrapper } = usePopover();
  const last = items[items.length - 1], parent = items.length > 1 ? items[items.length - 2] : null;
  if (!last) return null;
  return <div className="crumbbar-compact" ref={wrapper}>
    {parent?.go && <button type="button" className="crumbbar-back" aria-label={`Back to ${parent.label}`} onClick={parent.go}><ChevronLeft size={18} /></button>}
    <button type="button" className="crumbbar-title" aria-haspopup="menu" aria-expanded={open} aria-label={`${last.label}. Show the whole path`} onClick={() => setOpen(v => !v)}>
      <span>{parent && <small>{parent.label}</small>}<strong>{last.label}</strong></span><ChevronDown size={15} aria-hidden="true" />
    </button>
    {open && <div className="crumbbar-menu crumbbar-path" role="menu" aria-label="Path">
      {items.map((c, i) => <button type="button" role="menuitem" key={c.id} disabled={!c.go || c === last} aria-current={c === last ? "page" : undefined} style={{ paddingLeft: 12 + i * 12 }} onClick={() => { setOpen(false); c.go?.(); }}>
        {i > 0 && <ChevronRight size={13} aria-hidden="true" />}{c.icon}<span>{c.label}</span>
      </button>)}
    </div>}
  </div>;
}
