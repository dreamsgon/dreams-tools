"use client";
import { uiZoom } from "@/lib/appearance";
import { useFolderExpansion } from "./folder-expansion";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, ChevronUp, Folder, FolderPlus, GripVertical, Pencil } from "lucide-react";
import { canMoveSibling } from "@/lib/folder-order";
import { edgeAtPoint, altStep } from "./folder-reorder";
import { canMoveCollection, collectionPath, type Collection } from "@/lib/model";

export type LibraryOrganizerProps<T extends { id: string; name: string }> = {
  title: string;
  folders: Collection[];
  items: T[];
  locations: Record<string, string | null>;
  location: string | null;
  setLocation: (id: string | null) => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onMoveFolder: (id: string, parentId: string | null) => void;
  canMoveFolder?: (id: string, parentId: string | null) => boolean;
  onRemoveFolder: (id: string) => void;
  /** Moves a folder up or down among its siblings (only the folders shown here count as neighbours). */
  onStepFolder?: (id: string, delta: -1 | 1) => void;
  /** Puts a folder before or after another, in that folder's parent. */
  onPlaceFolder?: (id: string, targetId: string, place: "before" | "after") => void;
  onMoveItem: (id: string, target: string | null) => void;
  renderItem: (item: T) => ReactNode;
  onNewItem?: () => void;
  newItemLabel?: string;
  gallery?: boolean;
};

type DragItem = { id: string; name: string; kind: "folder" | "item" };
type DragState = { item: DragItem; x: number; y: number; px: number; py: number; active: boolean; host: HTMLElement | null; target: string | null | undefined; since: number };

export default function LibraryOrganizer<T extends { id: string; name: string }>({ title, folders, items, locations, location, setLocation, onCreateFolder, onRenameFolder, onMoveFolder, canMoveFolder, onRemoveFolder, onStepFolder, onPlaceFolder, onMoveItem, renderItem, onNewItem, newItemLabel, gallery = false }: LibraryOrganizerProps<T>) {
  const scope = useId();
  const [search, setSearch] = useState("");
  const [closed, setClosed] = useFolderExpansion(`library:${title}`);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [moving, setMoving] = useState<DragItem | null>(null);
  const [over, setOver] = useState<string | null | undefined>(undefined);
  const [message, setMessage] = useState("");
  const [edgeAt, setEdgeAt] = useState<{ id: string; place: "before" | "after" } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const edgeRef = useRef<typeof edgeAt>(null);
  const drag = useRef<DragState | null>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const current = folders.find(f => f.id === location);
  const selected = current?.id ?? null;
  const path = (id: string | null) => id ? collectionPath(folders, id) : `${title} root`;
  const reset = () => { drag.current = null; edgeRef.current = null; setEdgeAt(null); setMoving(null); setOver(undefined); };
  const edgeFor = (item: DragItem, x: number, y: number) => item.kind !== "folder" || !onPlaceFolder ? null : edgeAtPoint(x, y, "data-library-drop", id => { const t = folders.find(f => f.id === id); return !!t && id !== item.id && canMoveCollection(folders, item.id, t.parentId) && (canMoveFolder?.(item.id, t.parentId) ?? true); });
  const step = (id: string, delta: -1 | 1) => { const f = folders.find(x => x.id === id); if (!f || !onStepFolder || !canMoveSibling(folders, id, delta)) return; onStepFolder(id, delta); setMessage(`Moved ${f.name} ${delta < 0 ? "up" : "down"}.`); };
  const accepts = (item: DragItem, target: string | null) => {
    if (target !== null && !folders.some(f => f.id === target)) return false;
    return item.kind === "folder"
      ? folders.find(f => f.id === item.id)?.parentId !== target && canMoveCollection(folders, item.id, target) && (canMoveFolder?.(item.id, target) ?? true)
      : (locations[item.id] ?? null) !== target;
  };
  const targetAt = (item: DragItem, x: number, y: number) => {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-library-drop]");
    if (element?.dataset.libraryScope !== scope) return undefined;
    const value = element.dataset.libraryDrop;
    const target = value === "root" ? null : value;
    return target !== undefined && accepts(item, target) ? target : undefined;
  };
  const expand = (id: string) => setClosed(old => {
    if (!old.has(id)) return old;
    const next = new Set(old); next.delete(id); return next;
  });

  useEffect(() => {
    if (!moving) return;
    const cancel = (event: KeyboardEvent) => { if (event.key === "Escape") { reset(); setMessage("Move cancelled."); } };
    window.addEventListener("keydown", cancel);
    let frame: number;
    let previous = performance.now();
    const tick = (now: number) => {
      const d = drag.current; if (!d) return;
      const dt = Math.min(32, now - previous); previous = now;
      if (ghost.current) ghost.current.style.transform = `translate3d(${Math.max(0, Math.min(d.px + 12, window.innerWidth - 190)) / uiZoom()}px,${Math.max(0, Math.min(d.py + 14, window.innerHeight - 50)) / uiZoom()}px,0)`;
      if (d.host) {
        const bounds = d.host.getBoundingClientRect();
        const top = Math.max(0, bounds.top), bottom = Math.min(window.innerHeight, bounds.bottom);
        d.host.scrollTop += (d.py < top + 50 ? -1 : d.py > bottom - 50 ? 1 : 0) * dt * .5;
      }
      const edge = edgeFor(d.item, d.px, d.py);
      if (edge?.id !== edgeRef.current?.id || edge?.place !== edgeRef.current?.place) { edgeRef.current = edge; setEdgeAt(edge); }
      const target = edge ? undefined : targetAt(d.item, d.px, d.py);
      if (target !== d.target) { d.target = target; d.since = now; setOver(target); }
      if (target && now - d.since > 650) expand(target);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("keydown", cancel); };
  });
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(""), 4000); return () => clearTimeout(timer); }, [message]);

  const dropProps = (id: string | null) => ({ "data-library-drop": id ?? "root", "data-library-scope": scope, "data-drop-state": moving && over === id ? "ready" : undefined, "data-drop-edge": id && edgeAt?.id === id ? edgeAt.place : undefined });
  const grip = (item: DragItem) => <button type="button" className="organizer-grip" aria-label={`Drag ${item.name}`} title={`Drag into a folder or ${title} root`} onClick={e => e.stopPropagation()}
    onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { item, x: e.clientX, y: e.clientY, px: e.clientX, py: e.clientY, active: false, host: e.currentTarget.closest<HTMLElement>(".panel-content, .token-gallery-content"), target: undefined, since: 0 }; }}
    onPointerMove={e => { const d = drag.current; if (!d) return; d.px = e.clientX; d.py = e.clientY; if (!d.active && Math.hypot(d.px - d.x, d.py - d.y) >= 6) { d.active = true; setMoving(d.item); setMessage(""); } }}
    onPointerUp={e => {
      const d = drag.current, edge = d?.active ? edgeFor(d.item, e.clientX, e.clientY) : null;
      if (d?.active && edge) { onPlaceFolder?.(d.item.id, edge.id, edge.place); setMessage(`Moved ${d.item.name} ${edge.place} ${folders.find(f => f.id === edge.id)?.name ?? ""}.`); reset(); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); return; }
      const target = d?.active ? targetAt(d.item, e.clientX, e.clientY) : undefined;
      if (d?.active && target !== undefined) {
        if (d.item.kind === "folder") onMoveFolder(d.item.id, target); else onMoveItem(d.item.id, target);
        if (target) expand(target);
        setMessage(`Moved ${d.item.name} to ${path(target)}.`);
      } else if (d?.active) setMessage(`Not moved. Drop onto a folder or ${title} root.`);
      reset(); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    }} onPointerCancel={reset} onLostPointerCapture={reset}><GripVertical size={16} /></button>;

  const itemCards = (entries: T[]) => <div className={gallery ? "token-folder-grid" : undefined}>{entries.map(item => <div key={item.id} className="asset-list-item"><div className="asset-drag-row">{grip({ id: item.id, name: item.name, kind: "item" })}<div style={{ flex: 1, minWidth: 0 }}>{renderItem(item)}</div></div></div>)}</div>;
  const toggle = (id: string) => setClosed(old => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const tree = (parentId: string | null): ReactNode => folders.filter(f => f.parentId === parentId).map(f => <div key={f.id} className="asset-folder-branch">
    <div {...dropProps(f.id)} className={`organizer-row ${selected === f.id ? "active" : ""}`} data-dragging={moving?.kind === "folder" && moving.id === f.id || undefined} onClick={e => { if (!(e.target as HTMLElement).closest("button, input, a")) { toggle(f.id); setLocation(f.id); setSearch(""); } }} onKeyDown={e => { const d = altStep(e); if (d) { e.preventDefault(); step(f.id, d); } }}>
      {grip({ id: f.id, name: f.name, kind: "folder" })}
      <button type="button" aria-label={`${closed.has(f.id) ? "Expand" : "Collapse"} ${f.name}`} aria-expanded={!closed.has(f.id)} onClick={() => setClosed(old => { const next = new Set(old); if (next.has(f.id)) next.delete(f.id); else next.add(f.id); return next; })}>{closed.has(f.id) ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</button>
      <button type="button" aria-expanded={!closed.has(f.id)} onClick={() => { toggle(f.id); setLocation(f.id); setSearch(""); }}><Folder size={16} /><span>{f.name}</span><small className="folder-item-count">{items.filter(item => locations[item.id] === f.id).length}</small></button>
      <button type="button" className="collection-edit" aria-label={`Edit ${f.name}`} title={`Edit ${f.name}`} aria-pressed={editing === f.id} onClick={() => { setLocation(f.id); setEditing(editing === f.id ? null : f.id); }}><Pencil size={14} /></button>
    </div>
    {!closed.has(f.id) && <div className="organizer-children">{tree(f.id)}{gallery && !search.trim() && itemCards(items.filter(item => locations[item.id] === f.id))}</div>}
  </div>);
  const query = search.trim().toLowerCase();
  const visible = items.filter(item => item.name.toLowerCase().includes(query) && (query || (locations[item.id] ?? null) === (gallery ? null : selected)));

  return <section className={`campaign-assets condition-organizer${gallery ? " token-gallery-organizer" : ""}`}>
    {moving && <div ref={ghost} className="organizer-drag-ghost" aria-hidden="true"><GripVertical size={16} />{moving.name}</div>}
    <p className="asset-drag-status" role="status">{moving ? `Moving ${moving.name} — ${over !== undefined ? "release to move here" : "choose a folder"}. Escape cancels.` : message}</p>
    <input aria-label={`Search ${title.toLowerCase()}`} placeholder="Search all folders…" value={search} onChange={e => setSearch(e.target.value)} />
    <section aria-label={`${title} folders`} className="organizer">
      <div className="asset-folder-toolbar"><button type="button" {...dropProps(null)} className="scene-root-link" onClick={() => { setLocation(null); setSearch(""); }}><Folder size={16} />{title} root</button></div>
      <div className="button-row"><button type="button" title="Create a folder at the root" onClick={() => { setCreating(true); setName(""); }}><FolderPlus size={16} />New folder</button>{onNewItem && <button type="button" onClick={onNewItem}>{newItemLabel ?? "New item"}</button>}</div>
      {creating && <form className="organizer-editor" onSubmit={e => { e.preventDefault(); if (!name.trim()) return; onCreateFolder(name.trim()); setCreating(false); setName(""); }}>
        <label>Folder name<input autoFocus required maxLength={120} value={name} onChange={e => setName(e.target.value)} /></label>
        <div className="button-row"><button disabled={!name.trim()}>Create folder</button><button type="button" onClick={() => setCreating(false)}>Cancel</button></div>
      </form>}
      <div className="folder-view-actions"><button type="button" onClick={() => setClosed(new Set())}>Expand all</button><button type="button" onClick={() => setClosed(new Set(folders.map(f => f.id)))}>Collapse all</button></div>{tree(null)}
      {current && editing === current.id && <details open key={current.id} className="asset-folder-settings"><summary>Folder settings</summary><div className="organizer-editor">
        <label>Folder name<input key={current.id + current.name} maxLength={120} defaultValue={current.name} onBlur={e => { const value = e.target.value.trim(); if (value && value !== current.name) onRenameFolder(current.id, value); else e.target.value = current.name; }} /></label>
        <label>Move folder to<select value={current.parentId ?? ""} onChange={e => { const target = e.target.value || null; if (canMoveCollection(folders, current.id, target) && (canMoveFolder?.(current.id, target) ?? true)) onMoveFolder(current.id, target); }}><option value="">{title} root</option>{folders.filter(f => canMoveCollection(folders, current.id, f.id) && (canMoveFolder?.(current.id, f.id) ?? true)).map(f => <option key={f.id} value={f.id}>{path(f.id)}</option>)}</select></label>
        {onStepFolder && <div className="button-row organizer-order" role="group" aria-label={`Order of ${current.name}`}><button type="button" disabled={!canMoveSibling(folders, current.id, -1)} onClick={() => step(current.id, -1)}><ChevronUp size={14} aria-hidden="true" />Move up</button><button type="button" disabled={!canMoveSibling(folders, current.id, 1)} onClick={() => step(current.id, 1)}><ChevronDown size={14} aria-hidden="true" />Move down</button></div>}
        <button type="button" onClick={() => { onRemoveFolder(current.id); setLocation(current.parentId); }}>Remove folder, keep contents</button>
      </div></details>}
      <p className="muted">Viewing: {path(selected)}</p>
    </section>
    {query && <p className="muted">Results across all folders</p>}
    {itemCards(visible)}
    {!visible.length && (!gallery || query || !items.length) && <p className="muted">{query ? "No matching items." : "No items in this folder."}</p>}
  </section>;
}
