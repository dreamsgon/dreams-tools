"use client";
/*
 * Map notes, part 2: clickable areas on Maptable maps. The layer draws each area's outline and number over
 * the board; the GM draws new ones with a box or a click inside a room, links a page section, and reads it
 * in a card that steps through the areas. Players open shared areas and read only what they already can.
 */
import { useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, EyeOff, Pencil, Trash2, Users, X } from "lucide-react";
import { areaBounds, areaLabel, areaPolygon, linkAllRooms, numberedRooms, orderedAreas, pageSections, sectionNumber, sectionText } from "@/lib/map-areas";
import { pageHref, type NotePage } from "@/lib/map-notes";
import { rollTarget, tableTarget, NOTE } from "@/lib/encyclopedia/inline";
import { SECRET_CLOSE, SECRET_OPEN, type Workspace } from "@/lib/encyclopedia/world-model";
import type { MapArea, MapDrawing } from "@/lib/model";
import { PageSearch, place, type Spot } from "./map-note-card";
import "./map-note-card.css";
import "./map-areas.css";

type Point = { x: number; y: number };
export type BoardView = { x: number; y: number; scale: number; width: number; height: number };
const toScreen = (p: Point, v: BoardView) => ({ x: p.x * v.scale + v.x, y: p.y * v.scale + v.y });

/** Area outlines and their numbered badges. Only the badge and the outline take clicks, so tokens stay easy to grab. */
export function AreaLayer({ areas, view, selectedId, player, onSelect }: { areas: MapArea[]; view: BoardView; selectedId: string | null; player: boolean; onSelect: (id: string) => void }) {
  const ordered = orderedAreas(areas);
  return <svg className={`map-areas${player ? " is-player" : ""}`} width={view.width} height={view.height} aria-hidden={false} role="group" aria-label="Map areas">
    {ordered.map((a, i) => {
      const poly = areaPolygon(a.points).map(p => toScreen(p, view)), b = areaBounds(poly), on = a.id === selectedId, label = areaLabel(a, i);
      return <g key={a.id} className={`map-area${on ? " is-selected" : ""}${a.playersSee ? " is-shared" : ""}`}>
        <polygon points={poly.map(p => `${p.x},${p.y}`).join(" ")} onClick={() => onSelect(a.id)} />
        <g className="map-area-badge" role="button" tabIndex={0} aria-label={`Area ${label}: ${a.section || "page"}`} transform={`translate(${b.x + 14} ${b.y + 14})`} onClick={() => onSelect(a.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(a.id); } }}>
          <circle r={11} /><text textAnchor="middle" dominantBaseline="central">{label.slice(0, 3)}</text>
        </g>
      </g>;
    })}
  </svg>;
}

/** Drawing a new area: drag a box, or click inside a room drawn in the Map Creator to use its outline. */
export function AreaDraw({ view, onBox, onClick, onCancel }: { view: BoardView; onBox: (a: Point, b: Point) => void; onClick: (p: Point) => void; onCancel: () => void }) {
  const start = useRef<Point | null>(null), [drag, setDrag] = useState<{ a: Point; b: Point } | null>(null), host = useRef<HTMLDivElement>(null);
  const local = (e: React.PointerEvent) => { const r = host.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const world = (p: Point) => ({ x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale });
  return <div ref={host} className="map-area-draw" tabIndex={-1} onKeyDown={e => { if (e.key === "Escape") onCancel(); }}
    onPointerDown={e => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); start.current = local(e); setDrag(null); }}
    onPointerMove={e => { if (start.current) setDrag({ a: start.current, b: local(e) }); }}
    onPointerUp={e => { const a = start.current, b = local(e); start.current = null; setDrag(null); if (!a) return; if (Math.hypot(b.x - a.x, b.y - a.y) < 6) onClick(world(b)); else onBox(world(a), world(b)); }}>
    <p className="map-area-hint">Drag a box over the area, or click inside a room drawn on the map to fit the area to it. <button type="button" onClick={onCancel} onPointerDown={e => e.stopPropagation()}>Cancel</button></p>
    {drag && <span className="map-area-box" style={{ left: Math.min(drag.a.x, drag.b.x), top: Math.min(drag.a.y, drag.b.y), width: Math.abs(drag.b.x - drag.a.x), height: Math.abs(drag.b.y - drag.a.y) }} />}
  </div>;
}

/** A section's text as the card shows it: read-aloud quotes, GM secrets, lists, bold, and roll chips. */
export function SectionText({ text }: { text: string }) {
  const blocks: ReactNode[] = [], lines = text.split(/\r?\n/);
  let i = 0;
  const inline = (s: string, key: string) => s.split(/(\[\[[^\]\n]+\]\]|\*\*[^*]+\*\*|`[^`]+`|\{\{[^{}\n]+\}\})/g).map((part, j) => {
    const k = `${key}-${j}`;
    if (part.startsWith("[[")) { const inner = part.slice(2, -2), roll = rollTarget(inner); if (roll) return <span key={k} className="map-area-roll" title={roll.label ?? undefined}>{roll.formula}</span>; const table = tableTarget(inner); if (table) return <span key={k} className="map-area-roll">{table.label ?? table.name}</span>; const [target, label] = inner.split("|"); return <span key={k} className="map-area-link">{(label ?? target ?? "").replace(/^maptable:.*/, "Battle map").trim()}</span>; }
    if (part.startsWith("**")) return <strong key={k}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`")) return <code key={k}>{part.slice(1, -1)}</code>;
    if (part.startsWith("{{")) return part.replace(NOTE, (_, w: string) => w);
    return part;
  });
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) { i++; continue; }
    if (SECRET_OPEN.test(line)) { const body: string[] = []; i++; while (i < lines.length && !SECRET_CLOSE.test(lines[i]!)) body.push(lines[i++]!); i++; blocks.push(<div key={i} className="map-area-secret"><span><EyeOff size={11} /> GM secret</span>{body.filter(Boolean).map((l, j) => <p key={j}>{inline(l, `s${i}-${j}`)}</p>)}</div>); continue; }
    if (/^\s*>/.test(line)) { const body: string[] = []; while (i < lines.length && /^\s*>/.test(lines[i]!)) body.push(lines[i++]!.replace(/^\s*>\s?/, "")); blocks.push(<blockquote key={i} className="map-note-read">{inline(body.join(" "), `q${i}`)}</blockquote>); continue; }
    if (/^\s*([-*]|\d+\.)\s/.test(line)) { const items: string[] = []; while (i < lines.length && /^\s*([-*]|\d+\.)\s/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*([-*]|\d+\.)\s+(\[[ xX]\]\s+)?/, "")); blocks.push(<ul key={i}>{items.map((t, j) => <li key={j}>{inline(t, `l${i}-${j}`)}</li>)}</ul>); continue; }
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) { blocks.push(<h4 key={i}>{inline(h[1]!, `h${i}`)}</h4>); i++; continue; }
    const para: string[] = []; while (i < lines.length && lines[i]!.trim() && !/^\s*(>|[-*]\s|\d+\.\s|#{1,6}\s)/.test(lines[i]!) && !SECRET_OPEN.test(lines[i]!)) para.push(lines[i++]!);
    blocks.push(<p key={i}>{inline(para.join(" "), `p${i}`)}</p>);
  }
  return <div className="map-area-text">{blocks.length ? blocks : <p className="note-muted">Nothing written under this heading yet.</p>}</div>;
}

const anchor = (a: MapArea, view: BoardView): Spot => { const b = areaBounds(areaPolygon(a.points).map(p => toScreen(p, view))); return { x: b.x + b.width, y: b.y + 30, width: view.width, height: view.height }; };

/** The GM's card for an area: its section of the page, with the areas before and after it. */
export function GmAreaCard({ area, areas, book, view, onSelect, onEdit, onShare, onRemove, onClose }: { area: MapArea; areas: MapArea[]; book: Workspace | null; view: BoardView; onSelect: (id: string) => void; onEdit: () => void; onShare: (on: boolean) => void; onRemove: () => void; onClose: () => void }) {
  const page = book?.entries.find(e => e.id === area.pageId), text = page ? sectionText(page.body, area.section) : null;
  const order = orderedAreas(areas), i = order.findIndex(a => a.id === area.id), prev = order[i - 1], next = order[i + 1], n = sectionNumber(area.section);
  const tag = (a: MapArea | undefined, k: number) => a ? areaLabel(a, k) : "";
  return <section className="map-note map-area-card" role="dialog" aria-label={area.section || page?.title || "Area"} style={place(anchor(area, view), 360)} onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
    <header>
      <span className="map-area-crumb">{page ? `${page.title}${n ? `, area ${n}` : ""}` : "Page not found"}</span>
      <span className={`map-note-badge${area.playersSee ? " is-shared" : ""}`}>{area.playersSee ? <><Users size={11} /> Players can click it</> : "GM only"}</span>
      <button type="button" className="note-icon" aria-label="Close area" onClick={onClose}><X size={16} /></button>
    </header>
    <div className="map-note-body">
      <h3 className="map-area-title">{area.section || page?.title || "Area"}</h3>
      {!book ? <p className="note-muted">Loading your Encyclopedia…</p> : !page ? <p className="note-muted">This area’s page was deleted or moved. Edit the area to link another.</p>
        : text === null ? <p className="note-muted">The heading “{area.section}” isn’t on {page.title} any more. Edit the area to pick another section.</p> : <SectionText text={text} />}
    </div>
    <footer>
      <button type="button" disabled={!prev} onClick={() => prev && onSelect(prev.id)} aria-label="Previous area"><ChevronLeft size={14} /> {tag(prev, i - 1)}</button>
      <button type="button" disabled={!next} onClick={() => next && onSelect(next.id)} aria-label="Next area">{tag(next, i + 1)} <ChevronRight size={14} /></button>
      <span className="spacer" />
      <label className="map-note-share" title="Players can click this area and read the section, if they can already read the page"><input type="checkbox" checked={!!area.playersSee} onChange={e => onShare(e.target.checked)} /> Players</label>
      <button type="button" className="note-icon" aria-label="Edit area" title="Edit area" onClick={onEdit}><Pencil size={14} /></button>
      <button type="button" className="note-icon" aria-label="Remove area" title="Remove area" onClick={onRemove}><Trash2 size={14} /></button>
      {page && <a className="map-area-open" href={pageHref(page.id)} target="_blank" rel="noopener"><ArrowUpRight size={14} /> Open the page</a>}
    </footer>
  </section>;
}

/** What players read when they click a shared area. */
export function PlayerAreaCard({ shown, area, view, onClose }: { shown: { pageTitle: string; title: string; text: string }; area: MapArea; view: BoardView; onClose: () => void }) {
  return <section className="map-note map-area-card is-player" role="dialog" aria-label={shown.title} style={place(anchor(area, view), 340)} onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
    <header><span className="map-area-crumb">{shown.pageTitle}</span><button type="button" className="note-icon" aria-label="Close" onClick={onClose}><X size={16} /></button></header>
    <div className="map-note-body"><h3 className="map-area-title">{shown.title}</h3><SectionText text={shown.text} /></div>
  </section>;
}

/** New area or Edit area: pick the page, then the section; or link every numbered room at once. */
export function AreaDialog({ area, areas, drawing, pages, book, onSave, onLinkAll, onClose }: {
  area: { id?: string; points: Point[]; pageId?: string; section?: string; playersSee?: boolean }; areas: MapArea[]; drawing: MapDrawing | null; pages: NotePage[]; book: Workspace | null;
  onSave: (a: { pageId: string; section: string; playersSee: boolean }) => void; onLinkAll: (made: MapArea[]) => void; onClose: () => void;
}) {
  const [pageId, setPageId] = useState(area.pageId ?? ""), [section, setSection] = useState<string | null>(area.section ?? null), [players, setPlayers] = useState(!!area.playersSee);
  const page = book?.entries.find(e => e.id === pageId), sections = useMemo(() => page ? pageSections(page.body) : [], [page]);
  const used = new Map(areas.filter(a => a.pageId === pageId && a.id !== area.id).map((a, i) => [a.section.toLowerCase(), areaLabel(a, i)]));
  const rooms = numberedRooms(drawing), canLinkAll = page ? linkAllRooms(drawing, page.body, page.id, areas, () => "x") : [];
  const picked = section === null ? null : sections.find(s => s.title === section) ?? (section === "" ? { title: "" } : null);
  return <div className="map-area-dialog" role="dialog" aria-label={area.id ? "Edit area" : "New area"} onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
    <header><h3>{area.id ? "Edit area" : "New area"}</h3><button type="button" className="note-icon" aria-label="Close" onClick={onClose}><X size={16} /></button></header>
    <div className="map-area-dialog-body">
      <span className="map-note-label">Encyclopedia page</span>
      {page ? <div className="map-area-page"><strong>{page.title}</strong><button type="button" className="text-button" onClick={() => { setPageId(""); setSection(null); }}>Change</button></div>
        : <PageSearch autoFocus pages={pages} onPick={p => { setPageId(p.id); setSection(null); }} placeholder="Find the page for this area" />}
      {page && <>
        <span className="map-note-label">Section</span>
        <ul className="map-area-sections">
          <li><button type="button" aria-pressed={section === ""} onClick={() => setSection("")}><span>The whole page</span></button></li>
          {sections.map(s => <li key={s.title}><button type="button" aria-pressed={section === s.title} style={{ paddingLeft: 8 + Math.max(0, s.level - 1) * 10 }} onClick={() => setSection(s.title)}>
            <span>{s.title}</span>{used.has(s.title.toLowerCase()) && <small>✓ Area {used.get(s.title.toLowerCase())}</small>}</button></li>)}
          {!sections.length && <li className="note-muted">This page has no headings. Add headings like “6. The Flooded Chapel” to link areas to parts of it.</li>}
        </ul>
        <label className="map-note-share"><input type="checkbox" checked={players} onChange={e => setPlayers(e.target.checked)} /> Players can click this area</label>
        <button type="button" className="primary" disabled={!picked} onClick={() => picked && onSave({ pageId, section: picked.title, playersSee: players })}>{picked ? `Link to ${picked.title || "the whole page"}` : "Pick a section"}</button>
        {!area.id && canLinkAll.length > 1 && <div className="map-area-all"><p className="note-muted">Numbered rooms on this map match the numbered sections of {page.title}.</p>
          <button type="button" onClick={() => onLinkAll(linkAllRooms(drawing, page.body, page.id, areas, () => crypto.randomUUID(), players))}>Link all {canLinkAll.length} rooms to their sections</button></div>}
        {!area.id && canLinkAll.length <= 1 && rooms.length > 1 && <p className="note-muted">Tip: rooms numbered with a label in the Map Creator can be linked all at once when their numbers match headings on the page.</p>}
      </>}
    </div>
  </div>;
}

/** The Exploration panel's list of areas, with Draw an area. */
export function AreasPanel({ areas, book, selectedId, drawing, onSelect, onDraw }: { areas: MapArea[]; book: Workspace | null; selectedId: string | null; drawing: boolean; onSelect: (id: string) => void; onDraw: (on: boolean) => void }) {
  const ordered = orderedAreas(areas);
  return <section className="areas-panel" aria-label="Areas">
    <div className="areas-panel-head"><h3>Areas · {areas.length}</h3><button type="button" aria-pressed={drawing} onClick={() => onDraw(!drawing)}>{drawing ? "Cancel" : "Draw an area"}</button></div>
    {ordered.length ? <ul>{ordered.map((a, i) => <li key={a.id}><button type="button" aria-pressed={a.id === selectedId} onClick={() => onSelect(a.id)}>
      <b>{areaLabel(a, i).slice(0, 3)}</b><span>{a.section || "Whole page"}<small>{book?.entries.find(e => e.id === a.pageId)?.title ?? "…"}{a.playersSee ? " · players can click it" : ""}</small></span></button></li>)}</ul>
      : <p className="note-muted">Draw a box over a room, or click inside a drawn room, then pick the page and section it opens. Click the number on the map to read it during play.</p>}
  </section>;
}
