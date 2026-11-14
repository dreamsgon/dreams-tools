"use client";
import { uiZoom } from "@/lib/appearance";
import { useFolderExpansion } from "./folder-expansion";
import { countLabel } from "@/lib/plural";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Folder, FolderOpen, Plus, BookOpen, ChevronDown, ChevronRight, ChevronUp, GripVertical, Pencil, Pin, Settings2, Map as MapIcon } from "lucide-react";
import { SceneKindIcon, sceneKindLabel } from "./scene-switcher";
import { uid, collectionPath, canMoveCollection, type Workspace, type Collection } from "@/lib/model";
import { altStep } from "./folder-reorder";
import { moveSibling, canMoveSibling, placeBeside, dropPlace } from "@/lib/folder-order";

type Props = {
  workspace: Workspace;
  location: string | null;
  setLocation: (id: string | null) => void;
  commit: (fn: (w: Workspace) => void) => void;
  activate: (id: string) => void;
  search: string;
  dashboard?: boolean;
  rootId?: string | null;
  openCampaign?: (id: string) => void;
  /** Dashboard only: campaign holding the scene that was open last. */
  lastCampaignId?: string | null;
  /** Dashboard only: extra buttons shown beside New campaign. */
  extraActions?: React.ReactNode;
  /** Scenes panel: opens a scene's settings. */
  onSettings?: (id: string) => void;
  /** Scenes panel: bump to start a new folder (from the New menu). */
  newFolderRequest?: number;
};
export function LocationOptions({ workspace, exclude, dashboard = false }: { workspace: Workspace; exclude?: string; dashboard?: boolean }) {
  return <><option value="">All campaigns & scenes</option>{workspace.collections
    .filter((c) => !exclude || canMoveCollection(workspace.collections, exclude, c.id))
    .filter((c) => {
      if (!dashboard) return true;
      let item: Collection | undefined = c;
      while (item) {
        if (item.kind === "campaign") return false;
        item = workspace.collections.find((parent) => parent.id === item!.parentId);
      }
      return true;
    })
    .sort((a, b) => collectionPath(workspace.collections, a.id).localeCompare(collectionPath(workspace.collections, b.id)))
    .map((c) => <option key={c.id} value={c.id}>{collectionPath(workspace.collections, c.id)}</option>)}</>;
}
export default function SceneOrganizer({ workspace: w, location, setLocation, commit, activate, search, dashboard = false, rootId = null, openCampaign, lastCampaignId = null, extraActions, onSettings, newFolderRequest = 0 }: Props) {
  const [closed, setClosed] = useFolderExpansion(dashboard ? "dashboard" : `scenes:${rootId ?? "root"}`);
  const [creating, setCreating] = useState<Collection["kind"] | null>(null);
  const [name, setName] = useState("");
  const [seenRequest, setSeenRequest] = useState(newFolderRequest);
  if (newFolderRequest !== seenRequest) { setSeenRequest(newFolderRequest); setCreating("folder"); setName(""); }
  type Moving = { kind: "scene" | "collection"; id: string; name: string };
  const pending = useRef<{item: Moving; x: number; y: number; active: boolean; px:number; py:number; host:HTMLElement|null; target: string | null | undefined} | null>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const hover = useRef<{id:string|null|undefined; since:number}>({id:undefined,since:0});
  const [moving, setMoving] = useState<Moving | null>(null);
  const [over, setOver] = useState<string | null | undefined>(undefined);
  const [edgeAt, setEdgeAt] = useState<{ id: string; place: "before" | "after" } | null>(null);
  const edgeRef = useRef<{ id: string; place: "before" | "after" } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (!announcement) return;
    const timer = window.setTimeout(() => setAnnouncement(""), 5000);
    return () => window.clearTimeout(timer);
  }, [announcement]);
  const resetDrag = () => { pending.current = null; edgeRef.current = null; setEdgeAt(null); setMoving(null); setOver(undefined); hover.current={id:undefined,since:0}; };
  useEffect(() => {
    const cancel = (e: KeyboardEvent) => { if(e.key === "Escape") {resetDrag();setAnnouncement("Move cancelled.");} };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, []);
  const current = w.collections.find((c) => c.id === location);
  const hasFolders = w.collections.some((c) => c.kind === "folder");
  const showFolderTools = !dashboard || hasFolders || !!moving;
  const sceneCount = (campaignId: string) => w.scenes.filter((s) => {
    let id = s.containerId;
    while (id) { if (id === campaignId) return true; id = w.collections.find((c) => c.id === id)?.parentId ?? null; }
    return false;
  }).length;
  const query = search.trim().toLowerCase();
  const inScope = (id: string | null) => {
    while (id !== rootId) {
      const c = w.collections.find((item) => item.id === id);
      if (!c || c.kind === "campaign") return false;
      id = c.parentId;
    }
    return true;
  };
  const container = (target: string | null) => {
    if (target !== rootId) {
      const folder = w.collections.find((c) => c.id === target);
      if (!folder) return false;
      if (dashboard && (folder.kind !== "folder" || !inScope(folder.parentId))) return false;
      if (!dashboard && folder.kind !== "campaign" && !inScope(folder.parentId)) return false;
    }
    return true;
  };
  const shownHere = (c: Collection) => dashboard || c.kind !== "campaign";
  const reorder = (id: string, delta: -1 | 1) => {
    const c = w.collections.find(item => item.id === id); if (!c || !canMoveSibling(w.collections, id, delta, shownHere)) return;
    commit(next => { next.collections = moveSibling(next.collections, id, delta, shownHere); });
    setAnnouncement(`Moved ${c.name} ${delta < 0 ? "up" : "down"}.`);
  };
  // A folder dragged onto the top or bottom edge of another folder row goes before or after it, in that folder's parent.
  const findEdge = (item: Moving, x: number, y: number) => {
    if (item.kind !== "collection") return null;
    const row = document.elementFromPoint(x, y)?.closest<HTMLElement>(".organizer-row[data-folder-drop]");
    const id = row?.dataset.folderDrop; if (!row || !id || id === "root" || id === item.id) return null;
    const target = w.collections.find(c => c.id === id);
    if (!target || target.kind !== "folder" || !container(target.parentId) || !canMoveCollection(w.collections, item.id, target.parentId)) return null;
    const rect = row.getBoundingClientRect(), place = dropPlace(y - rect.top, rect.height);
    return place === "inside" ? null : { id, place };
  };
  const accepts = (item: Moving, target: string | null) => {
    if (!container(target)) return false;
    if (item.kind === "scene") return !dashboard && w.scenes.some((s) => s.id === item.id && s.containerId !== target);
    const collection = w.collections.find((c) => c.id === item.id);
    return !!collection && collection.parentId !== target && canMoveCollection(w.collections, item.id, target);
  };
  const findTarget = (item:Moving,x:number,y:number) => {
    const raw=document.elementFromPoint(x,y)?.closest<HTMLElement>("[data-folder-drop]")?.dataset.folderDrop;
    const id=raw==="root" ? null : raw;
    return id!==undefined && accepts(item,id) ? id : undefined;
  };
  useEffect(() => {
    if(!moving) return;
    let frame:number;
    let previous=performance.now();
    const tick=(now:number)=>{
      const drag=pending.current;
      if(!drag?.active)return;
      const dt=Math.min(32,now-previous);previous=now;
      if(ghost.current) ghost.current.style.transform=`translate3d(${Math.min(drag.px+14,window.innerWidth-200)/uiZoom()}px,${Math.min(drag.py+16,window.innerHeight-60)/uiZoom()}px,0)`;
      if(drag.host){
        const rect=drag.host.getBoundingClientRect();
        const top=Math.max(rect.top,0), bottom=Math.min(rect.bottom,window.innerHeight);
        const speed=drag.py<top+60 ? -Math.min(1,(top+60-drag.py)/60) : drag.py>bottom-60 ? Math.min(1,(drag.py-bottom+60)/60) : 0;
        drag.host.scrollTop+=speed*dt*0.6;
      }
      const edge=findEdge(drag.item,drag.px,drag.py);
      if(edge?.id!==edgeRef.current?.id||edge?.place!==edgeRef.current?.place){edgeRef.current=edge;setEdgeAt(edge);}
      const target=edge?undefined:findTarget(drag.item,drag.px,drag.py);
      if(drag.target!==target){drag.target=target;setOver(target);hover.current={id:target,since:now};}
      if(target && now-hover.current.since>650) {
        setClosed((old)=>{if(!old.has(target))return old;const next=new Set(old);next.delete(target);return next;});
      }
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(frame);
  },[moving,w,rootId,dashboard]);
  const dropProps = (id: string | null) => ({
    "data-folder-drop": id ?? "root",
    "data-drop-state": moving && over === id ? "ready" : undefined,
    "data-drop-edge": id !== null && edgeAt?.id === id ? edgeAt.place : undefined,
  });
  const grip = (item: Moving) => <button className="organizer-grip" aria-label={`Drag ${item.name}`} title={`Drag ${item.name} into a folder`} onClick={(e) => e.stopPropagation()}
    onPointerDown={(e) => {
      if (e.button !== 0) return;
      e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
      pending.current = {item, x:e.clientX, y:e.clientY, px:e.clientX, py:e.clientY,
        host:e.currentTarget.closest<HTMLElement>(".panel-content, .campaign-dashboard"), active:false, target:undefined};
    }}
    onPointerMove={(e) => {
      const drag = pending.current; if (!drag) return;
      if (!drag.active && Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<6) return;
      drag.px=e.clientX; drag.py=e.clientY;
      if(!drag.active){drag.active=true;setMoving(drag.item);}

    }}
    onPointerUp={(e) => {
      const drag = pending.current;
      const edge = drag?.active ? findEdge(drag.item,e.clientX,e.clientY) : null;
      if(drag?.active && edge) {
        const name = w.collections.find(c => c.id === edge.id)?.name ?? "";
        commit((next) => { next.collections = placeBeside(next.collections, drag.item.id, edge.id, edge.place); });
        setAnnouncement(`Moved ${drag.item.name} ${edge.place} ${name}. Undo restores the move.`);
        resetDrag();
        if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
        return;
      }
      if(drag?.active) drag.target=findTarget(drag.item,e.clientX,e.clientY);
      if(drag?.active && drag.target !== undefined && accepts(drag.item,drag.target)) {
        const target = drag.target;
        commit((next) => {
          if(drag.item.kind === "scene") {const s=next.scenes.find((s)=>s.id===drag.item.id)!;s.containerId=target;s.folder="";}
          else next.collections.find((c)=>c.id===drag.item.id)!.parentId=target;
        });
        setClosed((old)=>{const next=new Set(old);if(target)next.delete(target);return next;});
        setAnnouncement(`Moved ${drag.item.name} to ${collectionPath(w.collections,target)}. Undo restores the move.`);
      } else if(drag?.active) setAnnouncement("Not moved. Drop on a folder or the top-level button.");
      resetDrag();
      if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
    }} onPointerCancel={resetDrag} onLostPointerCapture={resetDrag}><GripVertical size={16}/></button>;
  const sceneRow = (s: Workspace["scenes"][number]) => <div key={s.id} className="organizer-item" data-dragging={moving?.id===s.id || undefined}>
    {grip({kind:"scene",id:s.id,name:s.name})}<button
    className={"organizer-scene " + (w.activeId === s.id ? "active" : "")}
    onClick={() => { setLocation(s.containerId); activate(s.id); }}>
    <span className="scene-kind"><SceneKindIcon type={s.mapType} /></span><span><strong>{s.name}</strong><small>{query ? collectionPath(w.collections, s.containerId) : sceneKindLabel(s)}</small></span>
  </button>{onSettings && <button className="organizer-scene-settings" aria-label={`Settings for ${s.name}`} title="Scene settings" onClick={() => { setLocation(s.containerId); onSettings(s.id); }}><Settings2 size={15}/></button>}</div>;
  const toggle = (id: string) => setClosed(old => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const collectionButton = (c: Collection, searched = false) => <>
    <button className="collection-primary" aria-expanded={c.kind === "folder" && !searched ? !closed.has(c.id) : undefined} onClick={() => c.kind === "campaign" ? (dashboard ? openCampaign?.(c.id) : setLocation(c.id)) : searched ? setLocation(c.id) : toggle(c.id)}>
      {c.kind === "campaign" ? <BookOpen size={18} /> : closed.has(c.id) ? <Folder size={18} /> : <FolderOpen size={18} />}
      <span><strong>{searched ? collectionPath(w.collections, c.id) : c.name}</strong>{dashboard && c.id === lastCampaignId && <em className="collection-badge">Last opened</em>}<small>{c.kind === "campaign" ? (dashboard ? countLabel(sceneCount(c.id), "scene") : "Open campaign →") : `${w.collections.filter(child => child.parentId === c.id).length + w.scenes.filter(scene => scene.containerId === c.id).length} items`}</small></span>
    </button>
    {dashboard && c.kind === "campaign" && <button className="collection-pin" aria-label={`${c.pinned ? "Unpin" : "Pin"} ${c.name}`} aria-pressed={!!c.pinned} title={c.pinned ? "Unpin campaign" : "Pin campaign"} onClick={() => commit(next => { const campaign = next.collections.find(item => item.id === c.id); if(campaign) campaign.pinned = !campaign.pinned; })}><Pin size={15} /></button>}
    <button className="collection-edit" title={`Edit ${c.name}`} aria-label={`Edit ${c.name}`} onClick={() => setLocation(location === c.id ? rootId : c.id)}><Pencil size={14} /></button>
  </>;
  const tree = (parentId: string | null): React.ReactNode => <>
    {w.collections.filter((c) => c.parentId === parentId && (dashboard || c.kind !== "campaign")).map((c) => <div key={c.id} data-kind={c.kind} {...(c.kind === "folder" ? dropProps(c.id) : {})} data-dragging={moving?.id===c.id || undefined}>
      <div {...(c.kind === "folder" ? dropProps(c.id) : {})} className={"organizer-row " + (location === c.id ? "active" : "")}
        onClick={c.kind === "folder" ? (e) => { if (!(e.target as HTMLElement).closest("button, input, a")) toggle(c.id); } : undefined}
        onKeyDown={(e) => { const d = altStep(e); if (d) reorder(c.id, d); }}>
        {grip({kind:"collection",id:c.id,name:c.name})}
        {c.kind === "folder" && <button aria-label={`${closed.has(c.id) ? "Expand" : "Collapse"} ${c.name}`} aria-expanded={!closed.has(c.id)} onClick={() => setClosed((old) => {
          const next = new Set(old); if (next.has(c.id)) next.delete(c.id); else next.add(c.id); return next;
        })}>{closed.has(c.id) ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</button>}
        {collectionButton(c)}
      </div>
      {!(c.kind === "campaign" && dashboard) && !closed.has(c.id) && <div className="organizer-children">{tree(c.id)}
        {!w.collections.some((f) => f.parentId === c.id) && !w.scenes.some((s) => s.containerId === c.id) && <p className="muted">Empty</p>}
      </div>}
    </div>)}
    {!dashboard && w.scenes.filter((s) => s.containerId === parentId).map(sceneRow)}
  </>;
  // With no campaign yet, one sentence and one button (handoff 2.2); New folder and Create a map wait for a campaign.
  const noCampaigns = dashboard && !w.collections.some(c => c.kind === "campaign");
  return <section className={`organizer scene-organizer ${dashboard ? "dashboard-organizer" : ""}`} aria-label="Campaign and scene organizer">
    {dashboard && w.collections.some(c => c.kind === "campaign" && c.pinned) && <section className="pinned-campaigns" aria-label="Pinned campaigns"><h3><Pin size={16}/> Pinned campaigns</h3>{w.collections.filter(c => c.kind === "campaign" && c.pinned && (!query || collectionPath(w.collections,c.id).toLowerCase().includes(query))).map(c => <div key={c.id} className="organizer-row">{collectionButton(c)}</div>)}</section>}
    {noCampaigns && !creating && <div className="dashboard-first-campaign"><span aria-hidden="true"><MapIcon size={22}/></span><h3>No campaigns yet</h3><p>A campaign holds your maps and tokens. Make one, then upload or draw its first map.{w.scenes.length ? " Maps you already have are under Maps not in a campaign." : ""}</p><button className="primary" onClick={() => {setCreating("campaign");setName("");}}><Plus size={16} aria-hidden="true" />Create your first campaign</button></div>}
    {dashboard && !noCampaigns && <div className="button-row dashboard-actions"><button className="primary" onClick={() => {setCreating("campaign");setName("");}}><Plus size={16} aria-hidden="true" />New campaign</button><button onClick={() => {setCreating("folder");setName("");}}><Folder size={16} aria-hidden="true" />New folder</button>{extraActions}</div>}
    {(dashboard ? showFolderTools : !!moving) && <button {...dropProps(rootId)} className={(dashboard ? "organizer-root " : "scene-root-link ") + (location === rootId ? "active" : "")} onClick={() => setLocation(rootId)}>{dashboard ? "All campaigns" : "Move out of folders"}{dashboard && moving && <small>Drop here to move out of folders</small>}</button>}
    {moving && createPortal(<div ref={ghost} className="organizer-drag-ghost" aria-hidden="true"><GripVertical size={16}/>{moving.name}</div>,document.body)}
    {dashboard && moving && <p className="muted organizer-drag-help">Drag into a folder or onto {dashboard ? "Dashboard root" : "All scenes"} to move out of folders.</p>}
    <p className="organizer-drag-status" role="status">{moving ? `Moving ${moving.name} — ${over !== undefined ? "release to move here" : "choose a folder"}. Escape cancels.` : announcement}</p>
    {dashboard && showFolderTools && <p className="muted organizer-path">Selected folder: {collectionPath(w.collections, dashboard && current?.kind === "campaign" ? current.parentId : location)}</p>}
    {creating && <form className="organizer-editor" onSubmit={(e) => {
      e.preventDefault(); if (!name.trim()) return;
      const id = uid(); commit((next) => next.collections.push({id, name: name.trim(), kind: creating, parentId: creating === "folder" ? rootId : dashboard && current?.kind === "campaign" ? current.parentId : current?.id ?? rootId}));
      setClosed((old) => {const next = new Set(old); if (location) next.delete(location); return next;});
      setLocation(dashboard && creating === "campaign" ? rootId : id); setCreating(null); setName("");
    }}>
      {creating === "folder" && <p className="muted">Created at {dashboard ? "the dashboard root" : rootId ? "the campaign root" : "the scene root"}. Drag it into another folder afterward if needed.</p>}
      <label>{creating === "campaign" ? "Campaign name" : "Folder name"}<input autoFocus required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <div className="button-row"><button type="submit" disabled={!name.trim()}>Create {creating}</button><button type="button" onClick={() => setCreating(null)}>Cancel</button></div>
    </form>}
    {dashboard && showFolderTools && <div className="folder-view-actions"><button onClick={() => setClosed(new Set())}>Expand all</button><button onClick={() => setClosed(new Set(w.collections.filter(c => c.kind === "folder").map(c => c.id)))}>Collapse all</button></div>}<div className="organizer-tree">{query ? <>
      {w.collections.filter((c) => (dashboard || c.kind !== "campaign") && inScope(c.parentId) && collectionPath(w.collections, c.id).toLowerCase().includes(query)).map((c) => <div key={c.id} className="organizer-row" {...(c.kind === "folder" ? dropProps(c.id) : {})}>{grip({kind:"collection",id:c.id,name:c.name})}{collectionButton(c, true)}</div>)}
      {!dashboard && w.scenes.filter((s) => inScope(s.containerId) && `${s.name} ${collectionPath(w.collections, s.containerId)}`.toLowerCase().includes(query)).map(sceneRow)}
    </> : tree(rootId)}</div>
    {current && current.id !== rootId && <div className="organizer-editor">
      {dashboard && current.kind === "campaign" && <button className="primary" onClick={() => openCampaign?.(current.id)}>Open campaign</button>}
      <h3>{current.kind === "campaign" ? "Campaign" : "Folder"} details</h3>
      <label>{current.kind === "campaign" ? "Campaign" : "Folder"} name<input key={current.id} maxLength={120} defaultValue={current.name} onBlur={(e) => {
        const value = e.target.value.trim(); if (value && value !== current.name) commit((next) => {next.collections.find((c) => c.id === current.id)!.name = value;});
        else e.target.value = current.name;
      }} /></label>
      <label>Move {current.kind} to<select value={current.parentId ?? ""} onChange={(e) => {
        const parentId = e.target.value || null;
        if (canMoveCollection(w.collections, current.id, parentId)) commit((next) => {next.collections.find((c) => c.id === current.id)!.parentId = parentId;});
      }}><LocationOptions workspace={w} exclude={current.id} dashboard={dashboard} /></select></label>
      <div className="button-row organizer-order" role="group" aria-label={`Order of ${current.name}`}>
        <button disabled={!canMoveSibling(w.collections, current.id, -1, shownHere)} onClick={() => reorder(current.id, -1)}><ChevronUp size={14} aria-hidden="true" />Move up</button>
        <button disabled={!canMoveSibling(w.collections, current.id, 1, shownHere)} onClick={() => reorder(current.id, 1)}><ChevronDown size={14} aria-hidden="true" />Move down</button>
      </div>
      <button className="danger" onClick={() => {
        commit((next) => {
          next.collections = next.collections.filter((c) => c.id !== current.id);
          next.collections.forEach((c) => {if(c.parentId === current.id) c.parentId = current.parentId;});
          next.scenes.forEach((s) => {if(s.containerId === current.id) s.containerId = current.parentId;});
          for(const id in next.assetCampaigns) if(next.assetCampaigns[id]===current.id)next.assetCampaigns[id]=null;
          for(const folder of next.tokenFolders)if(folder.campaignId===current.id)folder.campaignId=null;
          for(const id in next.libraryCampaigns) if(next.libraryCampaigns[id]===current.id)next.libraryCampaigns[id]=null;
        }); setLocation(current.parentId);
      }}>Remove {current.kind}, keep contents</button>
      <p className="muted">Contents move to the parent folder. Undo restores the {current.kind}.</p>
    </div>}
  </section>;
}
