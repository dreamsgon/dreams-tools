"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { countLabel } from "@/lib/plural";
import { scenesInOrder } from "@/lib/scene-order";
import type { Scene, Workspace } from "@/lib/model";
import { SceneKindIcon, sceneKindLabel } from "./scene-switcher";

type Kind = Scene["mapType"] | "all";
const KINDS: [Kind, string][] = [["all", "All"], ["encounter", "Encounters"], ["area", "Areas"], ["world", "World"]];

/** A campaign's scenes as a picture grid, grouped by folder, with Continue at the top. */
export default function CampaignScenes({ workspace: w, campaignId, lastSceneId, open, addScenes, back }: {
  workspace: Workspace; campaignId: string | null; lastSceneId: string | null;
  open: (sceneId: string) => void; addScenes: () => void; back: () => void;
}) {
  const [query, setQuery] = useState(""), [kind, setKind] = useState<Kind>("all");
  const all = useMemo(() => scenesInOrder(w, campaignId), [w, campaignId]);
  const q = query.trim().toLowerCase();
  const shown = all.filter(i => (kind === "all" || i.scene.mapType === kind) && (!q || `${i.scene.name} ${i.folders.map(f => f.name).join(" ")}`.toLowerCase().includes(q)));
  const groups: { name: string; items: typeof shown }[] = [];
  for (const item of shown) {
    const name = item.folders.map(f => f.name).join(" / ");
    const group = groups.find(g => g.name === name);
    if (group) group.items.push(item); else groups.push({ name, items: [item] });
  }
  const last = all.find(i => i.scene.id === lastSceneId)?.scene ?? all[0]?.scene;
  const image = (s: Scene) => s.mapId ? w.assets.find(a => a.id === s.mapId)?.src : undefined;
  const name = w.collections.find(c => c.id === campaignId)?.name ?? "Maps not in a campaign";
  return <div className="campaign-scenes">
    <button className="campaign-scenes-back" onClick={back}><ChevronLeft size={15} aria-hidden="true" />All campaigns</button>
    <div className="campaign-scenes-head">
      <div><small>{campaignId ? "Campaign" : "Not in a campaign"}</small><h1>{name}</h1></div>
      <button className="primary" onClick={addScenes}><Plus size={16} aria-hidden="true" />Add scenes</button>
    </div>
    {last && <button className="dashboard-continue" onClick={() => open(last.id)}>
      <span><small>Continue</small><strong>{last.name}</strong><span>{sceneKindLabel(last)}</span></span>
      <span className="dashboard-continue-action">Open map <ChevronRight size={17} aria-hidden="true" /></span>
    </button>}
    <div className="campaign-scenes-tools">
      <label className="campaign-scenes-search"><Search size={15} aria-hidden="true" /><input aria-label="Find a scene" placeholder="Find a scene…" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <div className="campaign-scenes-kinds" role="group" aria-label="Kind of map">{KINDS.map(([k, label]) => {
        const n = k === "all" ? all.length : all.filter(i => i.scene.mapType === k).length;
        return (k === "all" || n > 0) && <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{label} <span>{n}</span></button>;
      })}</div>
    </div>
    {groups.map(g => <section key={g.name} className="campaign-scenes-group" aria-label={g.name || "Not in a folder"}>
      <h2>{g.name || "Not in a folder"} <span>{countLabel(g.items.length, "scene")}</span></h2>
      <div className="campaign-scenes-grid">{g.items.map(({ scene: s }) => {
        const src = image(s);
        return <button key={s.id} className={"campaign-scene-card" + (s.id === last?.id ? " last" : "")} onClick={() => open(s.id)}>
          <span className={`campaign-scene-picture kind-${s.mapType}`}>{src
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={src} alt="" loading="lazy" />
            : <SceneKindIcon type={s.mapType} size={26} />}</span>
          <span className="campaign-scene-text"><strong>{s.name}{s.id === last?.id && <em>Last opened</em>}</strong><small>{s.mapType === "encounter" ? `Encounter · ${countLabel(s.tokens.length, "token")}` : sceneKindLabel(s)}</small></span>
        </button>;
      })}</div>
    </section>)}
    {!shown.length && <p className="muted">No scenes match.</p>}
  </div>;
}
