"use client";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";

/** The bar and the More sheet only exist at phone width; this matches the CSS breakpoint. */
const PHONE = "(max-width: 720px)";
import Link from "next/link";
import { Menu, Search, Plus, Map as MapIcon, Ellipsis, X } from "lucide-react";

/** One row of the More sheet. `href` makes it a link; otherwise `onSelect` runs after the sheet has closed. */
export type MoreItem = { id: string; label: string; icon: ReactNode; current?: boolean; href?: string; onSelect?: () => void };
export type MoreGroup = { heading: string; items: MoreItem[] };

type BarProps = {
  pagesOpen: boolean; pagesCurrent: boolean; onPages: () => void;
  searchOpen: boolean; onSearch: () => void;
  /** A world is open: New and Maps need one. */
  canCreate: boolean; newOpen: boolean; onNew: () => void;
  mapsCurrent: boolean; onMaps: () => void;
  moreOpen: boolean; moreCurrent: boolean; onMore: () => void;
  pagesRef: RefObject<HTMLButtonElement | null>; moreRef: RefObject<HTMLButtonElement | null>;
};

/** The phone's bottom bar (hidden above 720px by CSS): the places a thumb needs most. */
export function BottomBar({ pagesRef, moreRef, ...p }: BarProps) {
  const cls = (on: boolean) => on ? "is-current" : "";
  return <nav className="enc-bar" aria-label="Wiki">
    <button ref={pagesRef} type="button" className={cls(p.pagesOpen || p.pagesCurrent)} aria-expanded={p.pagesOpen} aria-controls="workspace-sidebar" aria-current={!p.pagesOpen && p.pagesCurrent ? "page" : undefined} onClick={p.onPages}><Menu size={20} aria-hidden="true"/><span>Pages</span></button>
    <button type="button" className={cls(p.searchOpen)} aria-haspopup="dialog" onClick={p.onSearch}><Search size={20} aria-hidden="true"/><span>Search</span></button>
    <button type="button" className={`enc-bar-new ${cls(p.newOpen)}`} aria-haspopup="dialog" disabled={!p.canCreate} aria-label="New entry" onClick={p.onNew}><span className="enc-bar-plus"><Plus size={24} aria-hidden="true"/></span><span>New</span></button>
    <button type="button" className={cls(p.mapsCurrent)} disabled={!p.canCreate} aria-current={p.mapsCurrent ? "page" : undefined} onClick={p.onMaps}><MapIcon size={20} aria-hidden="true"/><span>Maps</span></button>
    <button ref={moreRef} type="button" className={cls(p.moreOpen || p.moreCurrent)} aria-haspopup="dialog" aria-expanded={p.moreOpen} aria-current={!p.moreOpen && p.moreCurrent ? "page" : undefined} onClick={p.onMore}><Ellipsis size={20} aria-hidden="true"/><span>More</span></button>
  </nav>;
}

/**
 * The More sheet: a native modal dialog, so Escape, the backdrop and keeping focus inside come from the browser.
 * `onClose(true)` asks the caller to put focus back on the More button; a chosen item closes the sheet first and then acts.
 */
export function MoreSheet({ groups, onClose }: { groups: MoreGroup[]; onClose: (restoreFocus: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null), closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    ref.current?.showModal();
    // Widening past phone size hides the sheet with CSS while it would still hold the page modal: close it instead.
    const wide = window.matchMedia(PHONE), change = () => { if (!wide.matches) closeRef.current(false); };
    wide.addEventListener("change", change);
    return () => wide.removeEventListener("change", change);
  }, []);
  return <dialog ref={ref} className="more-sheet" aria-label="More" aria-modal="true" onCancel={e => { e.preventDefault(); onClose(true); }} onClick={e => { if (e.target === ref.current) onClose(true); }}>
    <div className="more-sheet-inner">
      <div className="more-sheet-head"><h2>More</h2><button type="button" className="icon-button" aria-label="Close more" onClick={() => onClose(true)}><X size={18} aria-hidden="true"/></button></div>
      {groups.filter(g => g.items.length).map(g => <section key={g.heading} aria-label={g.heading}>
        <h3>{g.heading}</h3>
        <ul>{g.items.map(i => <li key={i.id}>{i.href
          ? <Link href={i.href} className={i.current ? "is-current" : ""} onClick={() => onClose(false)}>{i.icon}<span>{i.label}</span></Link>
          : <button type="button" className={i.current ? "is-current" : ""} aria-current={i.current ? "page" : undefined} onClick={() => { onClose(false); i.onSelect?.(); }}>{i.icon}<span>{i.label}</span></button>}</li>)}</ul>
      </section>)}
    </div>
  </dialog>;
}
