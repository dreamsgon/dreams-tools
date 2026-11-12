"use client";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Globe, Grid3x3, Map as MapIcon, Search, Settings2 } from "lucide-react";
import { countLabel } from "@/lib/plural";
import { neighbourScene, scenesInOrder } from "@/lib/scene-order";
import type { Scene, Workspace } from "@/lib/model";
import { usePopover } from "./popover-menu";

export function SceneKindIcon({ type, size = 16 }: { type: Scene["mapType"]; size?: number }) {
  return type === "world" ? <Globe size={size} aria-hidden="true" /> : type === "area" ? <MapIcon size={size} aria-hidden="true" /> : <Grid3x3 size={size} aria-hidden="true" />;
}
export const sceneKindLabel = (s: Scene) => s.mapType === "world" ? "World map" : s.mapType === "area" ? `Area map · ${countLabel(s.tokens.length, "token")}` : countLabel(s.tokens.length, "token");

/** The scene name in the header: opens a quick list of the campaign's scenes, with previous and next. */
export default function SceneSwitcher({ workspace, campaignId, scene, open: openScene, settings }: {
  workspace: Workspace; campaignId: string | null; scene: Scene; open: (id: string) => void; settings: () => void;
}) {
  const { open, setOpen, wrapper } = usePopover();
  const [query, setQuery] = useState("");
  const list = useMemo(() => scenesInOrder(workspace, campaignId), [workspace, campaignId]);
  const q = query.trim().toLowerCase();
  const shown = q ? list.filter(i => `${i.scene.name} ${i.folders.map(f => f.name).join(" ")}`.toLowerCase().includes(q)) : list;
  const go = (step: 1 | -1) => { const next = neighbourScene(workspace, campaignId, scene.id, step); if (next) openScene(next.id); };
  const groupOf = (i: number) => shown[i].folders.map(f => f.name).join(" / ");
  return <div className="scene-switcher" ref={wrapper}>
    <button type="button" className="crumb scene-switcher-trigger" aria-haspopup="dialog" aria-expanded={open} title="Go to another scene" onClick={() => { setOpen(v => !v); setQuery(""); }}>
      <span>{scene.name}</span><ChevronDown size={13} aria-hidden="true" />
    </button>
    {list.length > 1 && <span className="scene-step">
      <button type="button" className="icon-button" aria-label="Previous scene" title="Previous scene" onClick={() => go(-1)}><ChevronLeft size={16} /></button>
      <button type="button" className="icon-button" aria-label="Next scene" title="Next scene" onClick={() => go(1)}><ChevronRight size={16} /></button>
    </span>}
    {open && <div className="scene-switcher-panel" role="dialog" aria-label="Go to a scene">
      <label className="scene-switcher-search"><Search size={14} aria-hidden="true" /><input autoFocus aria-label="Find a scene" placeholder="Go to a scene…" value={query} onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && shown[0]) { openScene(shown[0].scene.id); setOpen(false); } }} /></label>
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
    </div>}
  </div>;
}
