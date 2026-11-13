"use client";
import { useMemo, useState } from "react";
import { ArrowUpRight, BookOpen, EyeOff, Pencil, Plus, Search, Users, X } from "lucide-react";
import type { PointOfInterest } from "@/lib/model";
import { MAX_NOTE_PAGES, PAGE_DRAG, pageHref, type NotePage, type PageGroup } from "@/lib/map-notes";
import "./map-note-card.css";

const groupColor: Record<PageGroup, string> = { Places: "#4f7f6a", Characters: "#8f5a3c", "Factions and lore": "#5f5a8a", Quests: "#a0782c", Notes: "#5f6870" };
const initial = (title: string) => title.trim().charAt(0).toUpperCase() || "?";
type Spot = { x: number; y: number; width: number; height: number };

/** Places the card beside the marker, flipping left or up so it stays inside the board. */
function place(at: Spot, w = 340) {
  const left = at.x + 26 + w > at.width - 8 ? Math.max(8, at.x - 26 - w) : at.x + 26;
  const top = Math.max(8, Math.min(at.y - 40, at.height - 120));
  return { left, top, maxHeight: Math.max(160, at.height - top - 12), width: Math.min(w, at.width - 16) };
}

function PageRow({ page, onRemove }: { page: Pick<NotePage, "id" | "title" | "kind" | "excerpt"> & { group?: PageGroup }; onRemove?: () => void }) {
  return <li className="note-page">
    <span className="note-page-badge" style={{ background: groupColor[page.group ?? "Notes"] }} aria-hidden="true">{initial(page.title)}</span>
    <div className="note-page-text">
      <strong>{page.title}</strong>
      {page.kind && <small>{page.kind}</small>}
      {page.excerpt && <p>{page.excerpt}</p>}
    </div>
    {onRemove && <div className="note-page-actions">
      <a className="note-icon" href={pageHref(page.id)} target="_blank" rel="noopener" aria-label={`Open ${page.title} in the Encyclopedia`} title="Open in the Encyclopedia"><ArrowUpRight size={14} /></a>
      <button type="button" className="note-icon" aria-label={`Take ${page.title} off this note`} title="Take off this note" onClick={onRemove}><X size={14} /></button>
    </div>}
  </li>;
}

/** Search for a page to add. Rows can also be dragged onto the map. */
export function PageSearch({ pages, taken, onPick, autoFocus, placeholder = "Find a page" }: { pages: NotePage[]; taken?: readonly string[]; onPick: (page: NotePage) => void; autoFocus?: boolean; placeholder?: string }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const found = useMemo(() => pages.filter(p => !taken?.includes(p.id) && (!q || `${p.title} ${p.kind}`.toLowerCase().includes(q))).slice(0, q ? 12 : 8), [pages, taken, q]);
  return <div className="note-search">
    <label className="note-search-box"><Search size={14} /><input autoFocus={autoFocus} value={query} placeholder={placeholder} aria-label={placeholder} onChange={e => setQuery(e.target.value)} /></label>
    {found.length ? <ul className="note-search-list">{found.map(p => <li key={p.id}>
      <button type="button" draggable onDragStart={e => { e.dataTransfer.effectAllowed = "copy"; e.dataTransfer.setData(PAGE_DRAG, p.id); e.dataTransfer.setData("text/plain", p.title); }} onClick={() => onPick(p)}>
        <span className="note-page-badge" style={{ background: groupColor[p.group] }} aria-hidden="true">{initial(p.title)}</span>
        <span><strong>{p.title}</strong><small>{p.kind}</small></span>
      </button></li>)}</ul>
      : <p className="note-muted">{pages.length ? `No pages match “${query}”.` : "No Encyclopedia pages to link yet."}</p>}
  </div>;
}

/** The GM's note card beside a selected marker: quick notes, read-aloud text and linked pages. */
export function GmNoteCard({ point, at, pages, linkable, loadError, onClose, onEdit, onShare, onAdd, onRemove }: {
  point: PointOfInterest; at: Spot; pages: NotePage[]; linkable: NotePage[]; loadError: string;
  onClose: () => void; onEdit: () => void; onShare: (on: boolean) => void; onAdd: (id: string) => void; onRemove: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const missing = (point.pages?.length ?? 0) - pages.length;
  const full = (point.pages?.length ?? 0) >= MAX_NOTE_PAGES;
  const empty = !point.notes?.trim() && !point.readAloud?.trim() && !point.pages?.length;
  return <section className="map-note" role="dialog" aria-label={`Note: ${point.name}`} style={place(at)} onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
    <header>
      <i className="map-note-dot" style={{ background: point.color }} aria-hidden="true" />
      <h3>{point.name.trim() || "Unnamed marker"}</h3>
      <span className={`map-note-badge${point.playersSee && !point.hidden ? " is-shared" : ""}`}>{point.hidden ? <><EyeOff size={11} /> Hidden</> : point.playersSee ? <><Users size={11} /> Players see it</> : "GM only"}</span>
      <button type="button" className="note-icon" aria-label="Close note" onClick={onClose}><X size={16} /></button>
    </header>
    <div className="map-note-body">
      {point.notes?.trim() && <div className="map-note-section"><span className="map-note-label">Quick notes</span><p className="map-note-text">{point.notes}</p></div>}
      {point.readAloud?.trim() && <div className="map-note-section"><span className="map-note-label">Read aloud</span><blockquote className="map-note-read">{point.readAloud}</blockquote></div>}
      {(pages.length > 0 || missing > 0) && <div className="map-note-section"><span className="map-note-label">From the Encyclopedia</span>
        <ul className="note-pages">{pages.map(p => <PageRow key={p.id} page={p} onRemove={() => onRemove(p.id)} />)}</ul>
        {loadError ? <p className="note-muted" role="alert">{loadError}</p> : missing > 0 && <p className="note-muted">{missing === 1 ? "One linked page was" : `${missing} linked pages were`} deleted or moved to another campaign.</p>}
      </div>}
      {empty && !adding && <p className="note-muted">No notes yet. Add quick notes or read-aloud text with Edit, add a page, or drag a page from the Exploration panel onto this marker.</p>}
      {adding && <PageSearch autoFocus pages={linkable} taken={point.pages} onPick={p => { onAdd(p.id); setAdding(false); }} />}
    </div>
    <footer>
      <label className="map-note-share" title={point.hidden ? "This marker is hidden from players" : "Players can click the marker for its read-aloud text and the pages they can already read"}>
        <input type="checkbox" disabled={point.hidden} checked={!!point.playersSee && !point.hidden} onChange={e => onShare(e.target.checked)} /> Players see this note
      </label>
      <span className="spacer" />
      <button type="button" disabled={full && !adding} aria-pressed={adding} onClick={() => setAdding(v => !v)} title={full ? `A note holds up to ${MAX_NOTE_PAGES} pages` : undefined}>{adding ? "Done" : <><Plus size={14} /> Page</>}</button>
      <button type="button" onClick={onEdit}><Pencil size={14} /> Edit</button>
    </footer>
  </section>;
}

/** What players see when they click a shared marker: read-aloud text and pages already shared with them. */
export function PlayerNoteCard({ note, color, at, onClose }: { note: { name: string; readAloud: string; pages: { id: string; title: string; kind: string; excerpt: string }[] }; color: string; at: Spot; onClose: () => void }) {
  return <section className="map-note is-player" role="dialog" aria-label={`Note: ${note.name}`} style={place(at, 320)} onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
    <header><i className="map-note-dot" style={{ background: color }} aria-hidden="true" /><h3>{note.name}</h3><button type="button" className="note-icon" aria-label="Close note" onClick={onClose}><X size={16} /></button></header>
    <div className="map-note-body">
      {note.readAloud && <blockquote className="map-note-read">{note.readAloud}</blockquote>}
      {note.pages.length > 0 && <div className="map-note-section"><span className="map-note-label"><BookOpen size={12} /> What you know</span><ul className="note-pages">{note.pages.map(p => <PageRow key={p.id} page={p} />)}</ul></div>}
    </div>
  </section>;
}
