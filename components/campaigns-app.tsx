"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, ChevronDown, ChevronRight, ChevronUp, Download, Folder, FolderOpen, FolderPlus, Link2, Map as MapIcon, Pencil, Plus, Search, Tag as TagIcon, Trash2, X } from "lucide-react";
import { campaignLayout, folderChoices, suggestPairs, type CampaignFolder, type CampaignRow, type CampaignSummary } from "@/lib/campaign-links";
import { colourStyle } from "@/lib/colour";
import { canMoveSibling, dropPlace } from "@/lib/folder-order";
import { TagList, TagRow, TagsManager, useTags } from "./tags";
import { campaignTargets, tagsOn } from "@/lib/tags";
import CampaignsJoined from "./campaigns-joined";
import "./campaigns.css";
import { usePageTitle } from "./use-page-title";
import { campaignTitle } from "@/lib/page-title";

type Dialog = null | { kind: "new" } | { kind: "folder" } | { kind: "match" } | { kind: "notes"; row: CampaignRow };
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const mapsHref = (id: string) => `/maptable?campaign=${encodeURIComponent(id)}`;
const COLLAPSED_KEY = "campaigns-collapsed-folders";
/** What is being dragged: a campaign row by key, or a folder by id. */
type Drag = { type: "campaign"; key: string } | { type: "folder"; id: string };
const readCollapsed = (): Set<string> => { try { const v = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]"); return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []); } catch { return new Set(); } };
const notesHref = (id: string) => `/encyclopedia?campaign=${encodeURIComponent(id)}`;

export default function CampaignsApp({ signedIn }: { signedIn: boolean }) {
  const [summary, setSummary] = useState<CampaignSummary | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [query, setQuery] = useState(""), [world, setWorld] = useState<string | null>(null), [archived, setArchived] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null), [dialog, setDialog] = useState<Dialog>(null);
  const { library } = useTags("campaigns"), [tagFilter, setTagFilter] = useState<string | null>(null), [tagsOpen, setTagsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => typeof window === "undefined" ? new Set() : readCollapsed()), [drag, setDrag] = useState<Drag | null>(null), [over, setOver] = useState<string | null>(null);
  // The table only shows after the list loads in the browser, so reading storage here cannot change the server render.
  const [renaming, setRenaming] = useState<string | null>(null), [removing, setRemoving] = useState<string | null>(null);
  function toggleFolder(id: string) {
    const next = new Set(collapsed);
    if (!next.delete(id)) next.add(id);
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next])); } catch { /* Storage is optional. */ }
  }
  const rowTags = (r: CampaignRow) => library ? tagsOn(library, ...campaignTargets(r)) : [];
  const filterTag = library?.tags.find(t => t.id === tagFilter) ?? null;

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    fetch("/api/campaigns", { cache: "no-store" }).then(async r => {
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Could not load your campaigns.");
      if (!live) return;
      setSummary(body);
      // The home page links here with ?new=1 to start a campaign straight away.
      if (new URLSearchParams(window.location.search).get("new") === "1") setDialog({ kind: "new" });
    }).catch(e => live && setError(e instanceof Error ? e.message : "Could not load your campaigns."));
    return () => { live = false; };
  }, [signedIn]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(""), 4000); return () => clearTimeout(t); }, [notice]);

  async function send(body: object, done?: string, after?: (next: CampaignSummary) => void) {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const next = await r.json();
      if (!r.ok) throw new Error(next.error || "Could not save.");
      setSummary(next); if (done) setNotice(done); after?.(next);
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); return false; }
    finally { setBusy(false); }
  }

  const rows = useMemo(() => (summary?.rows ?? []).filter(r =>
    (archived || !r.encyclopedia?.archived) &&
    (!world || r.encyclopedia?.worldId === world) &&
    (!filterTag || (library ? tagsOn(library, ...campaignTargets(r)) : []).some(t => t.id === filterTag.id)) &&
    (!query.trim() || r.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))), [summary, archived, world, query, filterTag, library]);
  const filtered = !!(query.trim() || world || filterTag);
  const folders = useMemo(() => summary?.folders ?? [], [summary]);
  const layout = useMemo(() => campaignLayout(folders, rows, collapsed, filtered), [folders, rows, collapsed, filtered]);
  const descendants = (id: string): Set<string> => {
    const out = new Set([id]);
    for (let grew = true; grew;) { grew = false; for (const f of folders) if (f.parentId && out.has(f.parentId) && !out.has(f.id)) { out.add(f.id); grew = true; } }
    return out;
  };
  const canDrop = (target: string | null) => !!drag && (drag.type === "campaign"
    ? summary?.rows.find(r => r.key === drag.key)?.folderId !== target
    : !(target && descendants(drag.id).has(target)) && folders.find(f => f.id === drag.id)?.parentId !== target);
  function drop(target: string | null) {
    const d = drag;
    setDrag(null); setOver(null);
    if (!d || !canDrop(target)) return;
    const where = target ? `“${folders.find(f => f.id === target)?.name}”` : "the top level";
    if (d.type === "campaign") void send({ action: "moveCampaign", key: d.key, folderId: target }, `Moved to ${where}.`);
    else void send({ action: "moveFolder", folderId: d.id, parentId: target }, `Moved the folder to ${where}.`);
  }
  const dropProps = (target: string | null, id: string) => ({
    onDragOver: (e: React.DragEvent) => { if (canDrop(target)) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (over !== id) setOver(id); } },
    onDragLeave: () => { if (over === id) setOver(null); },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); drop(target); },
  });
  // A folder dragged onto the top or bottom edge of another folder row goes before or after it (in its parent); the middle puts it inside.
  const [edge, setEdge] = useState<{ id: string; place: "before" | "after" } | null>(null);
  const edgeOf = (e: React.DragEvent, folder: CampaignFolder) => {
    if (drag?.type !== "folder" || drag.id === folder.id || descendants(drag.id).has(folder.id) || folder.parentId && descendants(drag.id).has(folder.parentId)) return null;
    const rect = e.currentTarget.getBoundingClientRect(), place = dropPlace(e.clientY - rect.top, rect.height);
    return place === "inside" ? null : { id: folder.id, place };
  };
  const folderDrops = (folder: CampaignFolder) => ({
    onDragOver: (e: React.DragEvent) => {
      const next = edgeOf(e, folder);
      if (next) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (edge?.id !== next.id || edge.place !== next.place) setEdge(next); if (over) setOver(null); return; }
      if (edge) setEdge(null);
      dropProps(folder.id, `f:${folder.id}`).onDragOver(e);
    },
    onDragLeave: () => { setEdge(null); if (over === `f:${folder.id}`) setOver(null); },
    onDrop: (e: React.DragEvent) => {
      const next = edgeOf(e, folder), d = drag; setEdge(null);
      if (!next || d?.type !== "folder") { dropProps(folder.id, `f:${folder.id}`).onDrop(e); return; }
      e.preventDefault(); setDrag(null); setOver(null);
      void send({ action: "placeFolder", folderId: d.id, targetId: folder.id, place: next.place }, `Moved the folder ${next.place} “${folder.name}”.`);
    },
  });
  const dragProps = (d: Drag) => ({
    draggable: !busy, onDragStart: (e: React.DragEvent) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", d.type === "campaign" ? d.key : d.id); setDrag(d); },
    onDragEnd: () => { setDrag(null); setOver(null); },
  });
  const archivedCount = (summary?.rows ?? []).filter(r => r.encyclopedia?.archived).length;
  const worldsInUse = (summary?.worlds ?? []).filter(w => !w.archived && summary!.rows.some(r => r.encyclopedia?.worldId === w.id));
  const campaignTags = useMemo(() => {
    if (!library || !summary) return [];
    const used = new Set(summary.rows.filter(r => !r.encyclopedia?.archived).flatMap(r => tagsOn(library, ...campaignTargets(r)).map(x => x.id)));
    return library.tags.filter(x => used.has(x.id)).sort((x, y) => x.name.localeCompare(y.name));
  }, [library, summary]);
  const unpairedMaps = (summary?.rows ?? []).filter(r => r.maptable && !r.encyclopedia);
  const unpairedNotes = (summary?.rows ?? []).filter(r => r.encyclopedia && !r.maptable && !r.encyclopedia.archived);
  const matchKey = `${unpairedMaps.map(r => r.key).join()}|${unpairedNotes.map(r => r.key).join()}`;
  // The banner only shows after the list loads in the browser, so reading storage here cannot change the server render.
  const [dismissed, setDismissed] = useState<string | null>(() => { try { return typeof window === "undefined" ? null : localStorage.getItem("campaigns-match-dismissed"); } catch { return null; } });
  const dismissMatch = () => { setDismissed(matchKey); try { localStorage.setItem("campaigns-match-dismissed", matchKey); } catch { /* Storage is optional. */ } };
  const selected = summary?.rows.find(r => r.key === selectedKey) ?? null;
  usePageTitle(selected ? campaignTitle(selected.name) : "");

  if (!signedIn) return <section className="campaigns-empty"><h1>Campaigns</h1><p>Sign in to see your campaigns from Maptable and the Encyclopedia in one list.</p><a className="rpg-open" href="/account">Sign in or register</a></section>;

  return <div className={`campaigns-page${selected ? " has-details" : ""}`}>
    <div className="campaigns-main">
      <div className="campaigns-head">
        <div><h1>Campaigns</h1><p>Each campaign has its maps in Maptable and its notes in the Encyclopedia. Manage both here.</p></div>
        <button type="button" className="campaigns-secondary" onClick={() => setDialog({ kind: "folder" })} disabled={!summary}><FolderPlus size={16} aria-hidden="true" />New folder</button>
        <button type="button" className="campaigns-primary" onClick={() => setDialog({ kind: "new" })} disabled={!summary}><Plus size={16} aria-hidden="true" />New campaign</button>
      </div>
      {error && <p className="campaigns-error" role="alert">{error}</p>}
      {!summary && !error && <p className="campaigns-muted">Loading your campaigns…</p>}
      {summary && <>
        {unpairedMaps.length > 0 && unpairedNotes.length > 0 && dismissed !== matchKey && <div className="campaigns-match-banner">
          <Link2 size={18} aria-hidden="true" />
          <span><strong>Match your campaigns.</strong> {plural(unpairedMaps.length, "Maptable campaign")} and {plural(unpairedNotes.length, "Encyclopedia campaign")} aren&apos;t paired yet.</span>
          <button type="button" onClick={() => setDialog({ kind: "match" })}>Match them</button>
          <button type="button" className="campaigns-icon" onClick={dismissMatch} aria-label="Hide until something changes" title="Hide until something changes"><X size={16} /></button>
        </div>}
        <div className="campaigns-filters">
          <label className="campaigns-search"><Search size={16} aria-hidden="true" /><input type="search" placeholder="Find a campaign" aria-label="Find a campaign" value={query} onChange={e => setQuery(e.target.value)} /></label>
          {/* The tags on your campaigns. Pick one to show only the campaigns with it. */}
          {campaignTags.length > 0 && <div className="campaigns-chips" role="group" aria-label="Tag">
            <button type="button" aria-pressed={!filterTag} onClick={() => setTagFilter(null)}>All</button>
            {campaignTags.map(t => <button type="button" key={t.id} className={colourStyle("tag", t.color).className} style={colourStyle("tag", t.color).style} aria-pressed={filterTag?.id === t.id} onClick={() => setTagFilter(filterTag?.id === t.id ? null : t.id)}><i aria-hidden="true" />{t.name}</button>)}
          </div>}
          {worldsInUse.length > 1 && <label className="campaigns-world"><span className="sr-only">World</span><select value={world ?? ""} onChange={e => setWorld(e.target.value || null)}>
            <option value="">All worlds</option>
            {worldsInUse.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select></label>}
          {filterTag && !campaignTags.some(x => x.id === filterTag.id) && <span className={`tag-chip ${colourStyle("tag", filterTag.color).className} campaigns-tag-filter`} style={colourStyle("tag", filterTag.color).style}><span className="tag-chip-name"><i aria-hidden="true" />Tagged {filterTag.name}</span><button type="button" className="tag-chip-remove" aria-label={`Stop filtering by ${filterTag.name}`} onClick={() => setTagFilter(null)}><X size={11} /></button></span>}
        </div>
        {drag && <div className={`campaigns-drop-top${over === "top" ? " over" : ""}`} {...dropProps(null, "top")}><Folder size={15} aria-hidden="true" />Drop here for the top level</div>}
        <div className="campaigns-table" role="table" aria-label="Campaigns">
          <div className="campaigns-row campaigns-row-head" role="row"><span role="columnheader">Campaign</span><span role="columnheader"><MapIcon size={14} aria-hidden="true" />Maptable</span><span role="columnheader"><BookOpen size={14} aria-hidden="true" />Encyclopedia</span><span role="columnheader"><span className="sr-only">Open</span></span></div>
          {layout.map(item => item.type === "folder" ? <FolderRow key={`f:${item.folder.id}`} item={item} busy={busy} renaming={renaming === item.folder.id} removing={removing === item.folder.id}
            over={over === `f:${item.folder.id}`} dragging={drag?.type === "folder" && drag.id === item.folder.id}
            toggle={() => toggleFolder(item.folder.id)} startRename={() => { setRenaming(item.folder.id); setRemoving(null); }} startRemove={() => { setRemoving(item.folder.id); setRenaming(null); }}
            stop={() => { setRenaming(null); setRemoving(null); }} send={send} filtered={filtered}
            drag={dragProps({ type: "folder", id: item.folder.id })} drops={folderDrops(item.folder)} edge={edge?.id === item.folder.id ? edge.place : undefined}
            canStep={d => canMoveSibling(folders, item.folder.id, d)} step={d => void send({ action: "stepFolder", folderId: item.folder.id, delta: d }, `Moved “${item.folder.name}” ${d < 0 ? "up" : "down"}.`)} /> : (r => <div key={r.key} role="row" {...dragProps({ type: "campaign", key: r.key })}
            className={`campaigns-row${r.key === selectedKey ? " selected" : ""}${drag?.type === "campaign" && drag.key === r.key ? " dragging" : ""}`} style={{ "--depth": item.depth } as React.CSSProperties}>
            <span role="cell" className="campaigns-name"><button type="button" onClick={() => setSelectedKey(r.key === selectedKey ? null : r.key)} aria-expanded={r.key === selectedKey}><strong>{r.name}</strong><small>{r.encyclopedia ? r.encyclopedia.worldName : "Maptable only"}</small></button><TagList tags={rowTags(r)} max={4} onClick={t => setTagFilter(t.id)} /></span>
            <span role="cell" className="campaigns-cell">{r.maptable ? <><span>{r.maptable.scenes ? plural(r.maptable.scenes, "scene") : "No scenes yet"}</span>{r.maptable.name !== r.name && <small>Called “{r.maptable.name}”</small>}</> :
              <button type="button" className="campaigns-add" disabled={busy} onClick={() => send({ action: "complete", encyclopediaId: r.encyclopedia!.id }, `Added “${r.name}” to Maptable.`)}><Plus size={14} aria-hidden="true" />Add maps</button>}</span>
            <span role="cell" className="campaigns-cell">{r.encyclopedia ? <><span>{r.encyclopedia.pages ? plural(r.encyclopedia.pages, "page") : "No pages yet"}</span><small>{r.encyclopedia.characters ? plural(r.encyclopedia.characters, "character") : `${r.encyclopedia.worldName} world`}</small></> :
              <button type="button" className="campaigns-add" disabled={busy} onClick={() => setDialog({ kind: "notes", row: r })}><Plus size={14} aria-hidden="true" />Start notes</button>}</span>
            <span role="cell" className="campaigns-open">
              <a href={`/campaigns/${encodeURIComponent(r.key)}`} aria-label={`Open ${r.name}`}>Open<ChevronRight size={15} aria-hidden="true" /></a>
            </span>
          </div>)(item.row))}
          {!rows.length && <p className="campaigns-muted campaigns-none">{summary.rows.length ? "No campaigns match." : "No campaigns yet. Make one with New campaign."}</p>}
        </div>
        <div className="campaigns-foot">
          {archivedCount > 0 && <span>{plural(archivedCount, "campaign")} in archived worlds <button type="button" className="campaigns-link" onClick={() => setArchived(!archived)}>{archived ? "Hide" : "Show"}</button></span>}
          {summary.loose > 0 && <span><MapIcon size={15} aria-hidden="true" />{plural(summary.loose, "map")} not in a campaign <a className="campaigns-link" href="/maptable">Sort them</a></span>}
          <span><TagIcon size={15} aria-hidden="true" /><button type="button" className="campaigns-link" onClick={() => setTagsOpen(true)}>Manage tags</button></span>
          <span><Download size={15} aria-hidden="true" /><a className="campaigns-link" href="/api/campaigns?download=backup">Download a backup of both tools</a></span>
        </div>
      </>}
      <CampaignsJoined />
    </div>
    {tagsOpen && <TagsManager scope="campaigns" onClose={() => setTagsOpen(false)} onShow={t => setTagFilter(t.id)} />}
    {selected && summary && <Details key={selected.key} row={selected} summary={summary} busy={busy} close={() => setSelectedKey(null)} send={send} />}
    {dialog?.kind === "new" && summary && <NewCampaign summary={summary} busy={busy} close={() => setDialog(null)} send={send} />}
    {dialog?.kind === "folder" && summary && <NewFolder summary={summary} busy={busy} close={() => setDialog(null)} send={send} />}
    {dialog?.kind === "notes" && summary && <StartNotes row={dialog.row} summary={summary} busy={busy} close={() => setDialog(null)} send={send} />}
    {dialog?.kind === "match" && summary && <Match summary={summary} busy={busy} close={() => setDialog(null)} send={send} />}
    {notice && <div className="campaigns-toast" role="status"><Check size={16} aria-hidden="true" />{notice}</div>}
  </div>;
}

type Send = (body: object, done?: string, after?: (next: CampaignSummary) => void) => Promise<boolean>;

function Details({ row, summary, busy, close, send }: { row: CampaignRow; summary: CampaignSummary; busy: boolean; close: () => void; send: Send }) {
  const [name, setName] = useState(row.name), [description, setDescription] = useState(row.encyclopedia?.description ?? "");
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { ref.current?.scrollIntoView?.({ block: "nearest" }); }, []);
  const changed = name.trim() !== row.name || (row.encyclopedia ? description.trim() !== row.encyclopedia.description : false);
  const pairOptions = row.encyclopedia
    ? summary.rows.filter(r => r.maptable && (!r.encyclopedia || r.key === row.key)).map(r => ({ id: r.maptable!.id, name: r.maptable!.name }))
    : summary.rows.filter(r => r.encyclopedia && !r.maptable).map(r => ({ id: r.encyclopedia!.id, name: r.encyclopedia!.name }));
  const pairedId = row.encyclopedia ? row.maptable?.id ?? "" : "";
  function pair(value: string) {
    if (row.encyclopedia) send({ action: "pair", pairs: [{ encyclopediaId: row.encyclopedia.id, maptableId: value || null }] }, value ? "Paired." : "Pairing removed. Both campaigns are unchanged.");
    else if (value) send({ action: "pair", pairs: [{ encyclopediaId: value, maptableId: row.maptable!.id }] }, "Paired.");
  }
  return <aside className="campaigns-details" ref={ref} aria-label={`${row.name} details`}>
    <div className="campaigns-details-head">
      <small>Campaign</small>
      <button type="button" className="campaigns-icon" onClick={close} aria-label="Close details"><X size={18} /></button>
    </div>
    <h2>{row.name}</h2>
    <TagRow className="campaigns-tags" targets={campaignTargets(row)} />
    {row.encyclopedia?.description && <p className="campaigns-muted">{row.encyclopedia.description}</p>}
    <div className="campaigns-details-open">
      {row.maptable && <a className="campaigns-primary" href={mapsHref(row.maptable.id)}><MapIcon size={16} aria-hidden="true" />Open in Maptable</a>}
      {row.encyclopedia && <a className="campaigns-secondary" href={notesHref(row.encyclopedia.id)}><BookOpen size={16} aria-hidden="true" />Notes</a>}
    </div>
    <dl className="campaigns-facts">
      <div><dt>World</dt><dd>{row.encyclopedia?.worldName || "None yet"}</dd></div>
      <div><dt>Maps</dt><dd>{row.maptable ? plural(row.maptable.scenes, "scene") : "Not in Maptable"}</dd></div>
      <div><dt>Pages</dt><dd>{row.encyclopedia ? `${plural(row.encyclopedia.pages, "page")}, ${plural(row.encyclopedia.characters, "character")}` : "Not in the Encyclopedia"}</dd></div>
      {summary.folders.length > 0 && <div className="campaigns-pair"><dt><label htmlFor="campaign-folder">Folder</label></dt><dd>
        <select id="campaign-folder" value={row.folderId ?? ""} disabled={busy} onChange={e => send({ action: "moveCampaign", key: row.key, folderId: e.target.value || null }, "Moved.")}>
          <option value="">Top level</option>
          {folderChoices(summary.folders).map(f => <option key={f.id} value={f.id}>{f.path}</option>)}
        </select>
      </dd></div>}
      <div className="campaigns-pair"><dt><label htmlFor="campaign-pair">{row.encyclopedia ? "Maptable campaign" : "Encyclopedia campaign"}</label></dt><dd>
        <select id="campaign-pair" value={pairedId} disabled={busy} onChange={e => pair(e.target.value)}>
          <option value="">{row.encyclopedia ? "Not paired" : "Choose one to pair"}</option>
          {pairOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </dd></div>
    </dl>
    <form className="campaigns-rename" onSubmit={e => { e.preventDefault(); if (changed) send({ action: "rename", name, encyclopediaId: row.encyclopedia?.id, maptableId: row.maptable?.id, ...(row.encyclopedia ? { description } : {}) }, "Saved."); }}>
      <label>Name<input value={name} maxLength={120} onChange={e => setName(e.target.value)} /></label>
      {row.encyclopedia && <label>Description<textarea rows={3} maxLength={1000} value={description} onChange={e => setDescription(e.target.value)} /></label>}
      <p className="campaigns-muted">{row.maptable && row.encyclopedia ? "Renaming here renames it in both tools. Maps and notes stay where they are." : "Maps and notes stay where they are."}</p>
      <button type="submit" className="campaigns-primary" disabled={busy || !changed || !name.trim()}>Save changes</button>
    </form>
  </aside>;
}

function FolderRow({ item, busy, renaming, removing, over, dragging, toggle, startRename, startRemove, stop, send, filtered, drag, drops, edge, canStep, step }: {
  item: { folder: CampaignFolder; depth: number; count: number; open: boolean }; busy: boolean; renaming: boolean; removing: boolean; over: boolean; dragging: boolean; filtered: boolean;
  toggle: () => void; startRename: () => void; startRemove: () => void; stop: () => void; send: Send; drag: React.HTMLAttributes<HTMLDivElement>; drops: React.HTMLAttributes<HTMLDivElement>;
  edge?: "before" | "after"; canStep: (delta: -1 | 1) => boolean; step: (delta: -1 | 1) => void;
}) {
  const { folder, depth, count, open } = item, [name, setName] = useState(folder.name);
  const Icon = open ? FolderOpen : Folder;
  return <div role="row" className={`campaigns-row campaigns-folder-row${over ? " over" : ""}${dragging ? " dragging" : ""}`} style={{ "--depth": depth } as React.CSSProperties} data-drop-edge={edge} {...drag} {...drops}
    onClick={e => { if (!filtered && !renaming && !(e.target as HTMLElement).closest("button, input, a, form")) toggle(); }}
    onKeyDown={e => { if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); const d = e.key === "ArrowUp" ? -1 : 1; if (canStep(d) && !busy) step(d); } }}>
    <span role="cell" className="campaigns-folder-main">
      <button type="button" className="campaigns-icon campaigns-chevron" onClick={toggle} disabled={filtered} aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${folder.name}`}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
      <Icon size={18} aria-hidden="true" className="campaigns-folder-icon" />
      {renaming ? <form className="campaigns-folder-rename" onSubmit={e => { e.preventDefault(); if (name.trim() && name.trim() !== folder.name) void send({ action: "renameFolder", folderId: folder.id, name }, "Folder renamed.", stop); else stop(); }}>
        <input autoFocus aria-label={`New name for ${folder.name}`} value={name} maxLength={120} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Escape") stop(); }} />
        <button type="submit" className="campaigns-icon" disabled={busy || !name.trim()} aria-label="Save folder name"><Check size={16} /></button>
        <button type="button" className="campaigns-icon" onClick={stop} aria-label="Cancel rename"><X size={16} /></button>
      </form> : <strong className="campaigns-folder-name">{folder.name}</strong>}
      <small className="campaigns-folder-count">{plural(count, "campaign")}</small>
    </span>
    {removing ? <span role="cell" className="campaigns-folder-actions campaigns-folder-confirm">
      <span>Remove this folder? Its campaigns move up a level; none are deleted.</span>
      <button type="button" className="campaigns-danger" disabled={busy} onClick={() => void send({ action: "removeFolder", folderId: folder.id }, "Folder removed. Its campaigns moved up a level.", stop)}>Remove folder</button>
      <button type="button" className="campaigns-secondary" onClick={stop}>Keep it</button>
    </span> : <span role="cell" className="campaigns-folder-actions">
      <button type="button" className="campaigns-mini" disabled={busy || !canStep(-1)} onClick={() => step(-1)} aria-label={`Move ${folder.name} up`}><ChevronUp size={13} aria-hidden="true" />Up</button>
      <button type="button" className="campaigns-mini" disabled={busy || !canStep(1)} onClick={() => step(1)} aria-label={`Move ${folder.name} down`}><ChevronDown size={13} aria-hidden="true" />Down</button>
      <button type="button" className="campaigns-mini" disabled={busy} onClick={() => { setName(folder.name); startRename(); }} aria-label={`Rename ${folder.name}`}><Pencil size={13} aria-hidden="true" />Rename</button>
      <button type="button" className="campaigns-mini" disabled={busy} onClick={startRemove} aria-label={`Remove ${folder.name}`}><Trash2 size={13} aria-hidden="true" />Remove</button>
    </span>}
  </div>;
}

function NewFolder({ summary, busy, close, send }: { summary: CampaignSummary; busy: boolean; close: () => void; send: Send }) {
  const [name, setName] = useState(""), [parentId, setParentId] = useState("");
  return <Modal title="New folder" intro="Folders group campaigns here and in Maptable's campaign list." close={close} footer={<>
    <button type="button" className="campaigns-secondary" onClick={close}>Cancel</button>
    <button type="submit" form="new-folder" className="campaigns-primary" disabled={busy || !name.trim()}>Create folder</button>
  </>}>
    <form id="new-folder" className="campaigns-form" onSubmit={e => { e.preventDefault(); if (name.trim()) void send({ action: "newFolder", name, parentId: parentId || null }, `Created the folder “${name.trim()}”.`, close); }}>
      <label>Name<input autoFocus value={name} maxLength={120} onChange={e => setName(e.target.value)} placeholder="For example, Lantern Coast" /></label>
      <label>Inside<select value={parentId} onChange={e => setParentId(e.target.value)}>
        <option value="">Top level</option>
        {folderChoices(summary.folders).map(f => <option key={f.id} value={f.id}>{f.path}</option>)}
      </select></label>
    </form>
  </Modal>;
}

function Modal({ title, intro, children, footer, close, wide }: { title: string; intro?: string; children: React.ReactNode; footer: React.ReactNode; close: () => void; wide?: boolean }) {
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [close]);
  return <div className="campaigns-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <div className={`campaigns-modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="campaigns-modal-head"><h2>{title}</h2>{intro && <p>{intro}</p>}</div>
      <div className="campaigns-modal-body">{children}</div>
      <div className="campaigns-modal-foot">{footer}</div>
    </div>
  </div>;
}

function WorldPicker({ summary, worldId, setWorldId, newWorld, setNewWorld }: { summary: CampaignSummary; worldId: string; setWorldId: (v: string) => void; newWorld: string; setNewWorld: (v: string) => void }) {
  const worlds = summary.worlds.filter(w => !w.archived);
  return <>
    <label>World<select value={worldId} onChange={e => setWorldId(e.target.value)}>
      {worlds.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
      <option value="">A new world…</option>
    </select><small>Lore in a world is shared with its other campaigns.</small></label>
    {!worldId && <label>New world&apos;s name<input value={newWorld} maxLength={120} onChange={e => setNewWorld(e.target.value)} placeholder="For example, Ashenwood" /></label>}
  </>;
}

function NewCampaign({ summary, busy, close, send }: { summary: CampaignSummary; busy: boolean; close: () => void; send: Send }) {
  const firstWorld = summary.worlds.find(w => !w.archived)?.id ?? "";
  const [name, setName] = useState(""), [description, setDescription] = useState(""), [worldId, setWorldId] = useState(firstWorld), [newWorld, setNewWorld] = useState("");
  const [maptable, setMaptable] = useState(true), [encyclopedia, setEncyclopedia] = useState(true);
  const worldName = worldId ? summary.worlds.find(w => w.id === worldId)?.name : newWorld.trim() || "a new";
  const ready = name.trim() && (maptable || encyclopedia) && (!encyclopedia || worldId || newWorld.trim());
  return <Modal title="New campaign" close={close} footer={<>
    <button type="button" className="campaigns-secondary" onClick={close}>Cancel</button>
    <button type="submit" form="new-campaign" className="campaigns-primary" disabled={busy || !ready}>Create campaign</button>
  </>}>
    <form id="new-campaign" className="campaigns-form" onSubmit={e => { e.preventDefault(); if (ready) send({ action: "create", name, description, maptable, encyclopedia, worldId, newWorld }, `Created “${name.trim()}”.`, close); }}>
      <label>Name<input autoFocus value={name} maxLength={120} onChange={e => setName(e.target.value)} /></label>
      <label>Description<input value={description} maxLength={1000} placeholder="Optional: one line your players would recognise" onChange={e => setDescription(e.target.value)} /></label>
      {encyclopedia && <WorldPicker summary={summary} worldId={worldId} setWorldId={setWorldId} newWorld={newWorld} setNewWorld={setNewWorld} />}
      <fieldset><legend>Set it up in</legend>
        <label className="campaigns-check"><input type="checkbox" checked={maptable} onChange={e => setMaptable(e.target.checked)} /><MapIcon size={16} aria-hidden="true" /><span><strong>Maptable</strong> a campaign folder for its scenes</span></label>
        <label className="campaigns-check"><input type="checkbox" checked={encyclopedia} onChange={e => setEncyclopedia(e.target.checked)} /><BookOpen size={16} aria-hidden="true" /><span><strong>Encyclopedia</strong> campaign notes in {worldId ? `the ${worldName}` : "a new"} world</span></label>
      </fieldset>
    </form>
  </Modal>;
}

function StartNotes({ row, summary, busy, close, send }: { row: CampaignRow; summary: CampaignSummary; busy: boolean; close: () => void; send: Send }) {
  const [worldId, setWorldId] = useState(summary.worlds.find(w => !w.archived)?.id ?? ""), [newWorld, setNewWorld] = useState("");
  const ready = worldId || newWorld.trim();
  return <Modal title={`Start notes for ${row.name}`} intro="This makes an Encyclopedia campaign with the same name, paired with these maps." close={close} footer={<>
    <button type="button" className="campaigns-secondary" onClick={close}>Cancel</button>
    <button type="submit" form="start-notes" className="campaigns-primary" disabled={busy || !ready}>Start notes</button>
  </>}>
    <form id="start-notes" className="campaigns-form" onSubmit={e => { e.preventDefault(); if (ready) send({ action: "complete", maptableId: row.maptable!.id, worldId, newWorld }, `Started notes for “${row.name}”.`, close); }}>
      <WorldPicker summary={summary} worldId={worldId} setWorldId={setWorldId} newWorld={newWorld} setNewWorld={setNewWorld} />
    </form>
  </Modal>;
}

function Match({ summary, busy, close, send }: { summary: CampaignSummary; busy: boolean; close: () => void; send: Send }) {
  const maps = summary.rows.filter(r => r.maptable && !r.encyclopedia);
  const notes = summary.rows.filter(r => r.encyclopedia && !r.maptable);
  const [choice, setChoice] = useState<Record<string, string>>(() => Object.fromEntries(suggestPairs(summary).map(p => [p.maptableId, p.encyclopediaId])));
  const suggested = useMemo(() => new Set(suggestPairs(summary).map(p => `${p.maptableId}:${p.encyclopediaId}`)), [summary]);
  const pairs = Object.entries(choice).filter(([, e]) => e).map(([maptableId, encyclopediaId]) => ({ maptableId, encyclopediaId }));
  const used = new Set(pairs.map(p => p.encyclopediaId));
  return <Modal wide title="Match your campaigns" intro="Maptable and the Encyclopedia keep separate campaign lists. Pair them once, and each campaign shows up here with its maps and its notes. Nothing is moved or copied." close={close} footer={<>
    <small>A private copy of both tools&apos; data is kept before the first change. You can change a pairing later from the campaign&apos;s details.</small>
    <button type="button" className="campaigns-secondary" onClick={close}>Later</button>
    <button type="button" className="campaigns-primary" disabled={busy || !pairs.length} onClick={() => send({ action: "pair", pairs }, `Paired ${plural(pairs.length, "campaign")}.`, close)}>{pairs.length ? `Pair ${plural(pairs.length, "campaign")}` : "Pair campaigns"}</button>
  </>}>
    <div className="campaigns-match" role="table" aria-label="Pairings">
      <div className="campaigns-match-row campaigns-match-head" role="row"><span role="columnheader">In Maptable</span><span role="columnheader">In the Encyclopedia</span></div>
      {maps.map(m => {
        const value = choice[m.maptable!.id] ?? "";
        return <div className="campaigns-match-row" role="row" key={m.key}>
          <span role="cell"><MapIcon size={16} aria-hidden="true" />{m.maptable!.name}</span>
          <span role="cell"><select aria-label={`Encyclopedia campaign for ${m.maptable!.name}`} value={value} onChange={e => setChoice({ ...choice, [m.maptable!.id]: e.target.value })}>
            <option value="">Leave unpaired</option>
            {notes.filter(n => n.encyclopedia!.id === value || !used.has(n.encyclopedia!.id)).map(n => <option key={n.key} value={n.encyclopedia!.id}>{n.encyclopedia!.name} ({n.encyclopedia!.worldName})</option>)}
          </select>{value && suggested.has(`${m.maptable!.id}:${value}`) && <small className="campaigns-same">Same name</small>}</span>
        </div>;
      })}
    </div>
  </Modal>;
}
