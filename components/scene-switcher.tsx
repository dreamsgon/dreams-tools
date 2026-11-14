"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { KeyboardEvent as ReactKeyEvent } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Globe, Grid3x3, Map as MapIcon, Search, Settings2 } from "lucide-react";
import { countLabel } from "@/lib/plural";
import { neighbourScene, scenesInOrder } from "@/lib/scene-order";
import type { Scene, Workspace } from "@/lib/model";
import { usePopover } from "./popover-menu";

export function SceneKindIcon({ type, size = 16 }: { type: Scene["mapType"]; size?: number }) {
  return type === "world" ? <Globe size={size} aria-hidden="true" /> : type === "area" ? <MapIcon size={size} aria-hidden="true" /> : <Grid3x3 size={size} aria-hidden="true" />;
}
export const sceneKindLabel = (s: Scene) => s.mapType === "world" ? "World map" : s.mapType === "area" ? `Area map · ${countLabel(s.tokens.length, "token")}` : countLabel(s.tokens.length, "token");

/** The scene name in the header: opens a quick list of the campaign's scenes, with previous and next. On a phone it is a bottom sheet drawn over the whole page. */
export default function SceneSwitcher({ workspace, campaignId, scene, open: openScene, settings, phone = false }: {
  workspace: Workspace; campaignId: string | null; scene: Scene; open: (id: string) => void; settings: () => void;
  /** Phone header: the name fills the row and the list opens as a bottom sheet (with previous and next inside it). */
  phone?: boolean;
}) {
  const { open: popOpen, setOpen: setPopOpen, wrapper } = usePopover();
  const [sheet, setSheet] = useState(false);
  // A phone sheet is drawn in the page body, outside the popover's wrapper, so it keeps its own open state and Escape handling.
  const open = phone ? sheet : popOpen, setOpen = phone ? setSheet : setPopOpen;
  const trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null), wasOpen = useRef(false);
  useEffect(() => {
    if (!phone) return;
    if (open) panel.current?.focus();
    else if (wasOpen.current) trigger.current?.focus();
    wasOpen.current = open;
  }, [open, phone]);
  useEffect(() => {
    if (!phone || !open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setSheet(false); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phone, open]);
  const [query, setQuery] = useState("");
  const list = useMemo(() => scenesInOrder(workspace, campaignId), [workspace, campaignId]);
  const q = query.trim().toLowerCase();
  const shown = q ? list.filter(i => `${i.scene.name} ${i.folders.map(f => f.name).join(" ")}`.toLowerCase().includes(q)) : list;
  const go = (step: 1 | -1) => { const next = neighbourScene(workspace, campaignId, scene.id, step); if (next) openScene(next.id); };
  const hasStep = (step: 1 | -1) => !!neighbourScene(workspace, campaignId, scene.id, step);
  const groupOf = (i: number) => shown[i].folders.map(f => f.name).join(" / ");
  // Keeps Tab inside the sheet.
  const trap = (e: ReactKeyEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input")];
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1], at = document.activeElement;
    if (e.shiftKey && (at === first || at === e.currentTarget)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
  };
  const content = <>
    <div className="scene-switcher-search-row">
      <label className="scene-switcher-search"><Search size={14} aria-hidden="true" /><input autoFocus={!phone} aria-label="Find a scene" placeholder="Go to a scene…" value={query} onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && shown[0]) { openScene(shown[0].scene.id); setOpen(false); } }} /></label>
      {phone && <span className="scene-sheet-step">
        <button type="button" className="icon-button" aria-label="Previous scene" title="Previous scene" disabled={!hasStep(-1)} onClick={() => { go(-1); setOpen(false); }}><ChevronLeft size={18} /></button>
        <button type="button" className="icon-button" aria-label="Next scene" title="Next scene" disabled={!hasStep(1)} onClick={() => { go(1); setOpen(false); }}><ChevronRight size={18} /></button>
      </span>}
    </div>
    <div className="scene-switcher-list">
      {shown.map(({ scene: s }, i) => {
        const group = groupOf(i);
        const heading = !i || group !== groupOf(i - 1) ? <div className="scene-switcher-group">{group || "Not in a folder"}</div> : null;
        return <div key={s.id}>{heading}<button type="button" className={s.id === scene.id ? "active" : ""} aria-current={s.id === scene.id ? "true" : undefined} onClick={() => { openScene(s.id); setOpen(false); }}>
          <span className="scene-kind"><SceneKindIcon type={s.mapType} /></span><strong>{s.name}</strong><small>{s.id === scene.id ? "Open now" : sceneKindLabel(s)}</small>
        </button></div>;
      })}
      {!shown.length && <p className="muted">No scenes match.</p>}
    </div>
    <div className="scene-switcher-foot"><button type="button" onClick={() => { setOpen(false); settings(); }}><Settings2 size={14} aria-hidden="true" />Scene settings</button></div>
  </>;
  return <div className={phone ? "scene-switcher is-phone" : "scene-switcher"} ref={wrapper}>
    <button type="button" ref={trigger} className="crumb scene-switcher-trigger" aria-haspopup="dialog" aria-expanded={open} title="Go to another scene" onClick={() => { setOpen(!open); setQuery(""); }}>
      <span>{scene.name}</span><ChevronDown size={13} aria-hidden="true" />
    </button>
    {!phone && list.length > 1 && <span className="scene-step">
      <button type="button" className="icon-button" aria-label="Previous scene" title="Previous scene" onClick={() => go(-1)}><ChevronLeft size={16} /></button>
      <button type="button" className="icon-button" aria-label="Next scene" title="Next scene" onClick={() => go(1)}><ChevronRight size={16} /></button>
    </span>}
    {!phone && open && <div className="scene-switcher-panel" role="dialog" aria-label="Go to a scene">{content}</div>}
    {phone && open && createPortal(<>
      <div className="scene-sheet-backdrop" aria-hidden="true" onClick={() => setOpen(false)} />
      <div className="scene-sheet" ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Scenes" onKeyDown={trap}><span className="scene-switcher-grab" aria-hidden="true" />{content}</div>
    </>, document.body)}
  </div>;
}
