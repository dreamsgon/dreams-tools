"use client";
import EncyclopediaAgentAccess from "./agent-access";
import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { LayoutDashboard, CalendarDays, Map as MapIcon, BookOpen, Compass, Plus, Search, ChevronRight, ChevronDown, Folder, FileText, MapPin, Users, Flag, ScrollText, ListChecks, Check, Cloud, Download, Upload, Settings, GitBranch as Github, ArrowUpRight, Menu, X, Archive, Link as LinkIcon, Trash2, Pencil, Globe, ArrowLeft, PanelLeftClose, PanelLeftOpen, LoaderCircle, Dices, Goal, Library } from "lucide-react";
import { emptyWorkspace, demoWorkspace, newId, workspaceSchema, campaignExport, importCopy, canParent, resolveLink, visibleEntries, githubSchema, defaultCharacter, searchableText, compareEntries, folderPath, type Workspace, type Entry } from "@/lib/encyclopedia/world-model";
import { descendantCount, dropProblem, movePage, type DropPlace } from "@/lib/encyclopedia/page-tree";
import {CharactersSection,StatFormBuilder,PlayerSharing} from "./character-tools";
import {newMap} from "@/lib/encyclopedia/map-model";
import {FogImageSync} from "./fog-image-sync";
import {CalendarSection} from './calendar-section';
import {MapsSection} from "./maps-section";
import {WorkspaceDashboard} from "./workspace-dashboard";
import {useNavigationSections,useSidebarLayout,SidebarResize} from "./sidebar-controls";
import {ThemeToggle} from "./theme";
import ToolSwitch,{AccountLink} from "@/components/tool-switch";
import {ArticleEditor} from "./article-editor";
import {QuickSearch} from "./quick-search";
import {TagsManager} from "@/components/tags";
import type {Tag} from "@/lib/tags";
import {RollResults} from "./rolls";
import {DiscordRollsSetting} from "./discord-rolls";
import {RandomTablesSection} from "./random-tables";
import {QuestsSection} from "./quests-section";
import {CodexSection} from "./codex-section";
import Breadcrumbs,{type Crumb} from "@/components/breadcrumbs";
import {placeFromQuery,placeQuery} from "@/lib/encyclopedia/place";
const PLACE_KEY = "encyclopedia:place";
const icons = { map:MapIcon, folder: Folder, note: FileText, character: Users, place: MapPin, faction: Flag, lore: BookOpen, session: ScrollText, tasks: ListChecks, quest: Goal };
const labels = { map:"Map", folder: "Folder", note: "Note", character: "Character", place: "Place", faction: "Faction", lore: "Lore", session: "Session", tasks: "Checklist", quest: "Quest" };
type Modal = {
    type: "world" | "campaign" | "entry" | "settings" | "library" | "rename" | "connections";
    id?: string;
    name?: string;
    /** New entry: the page it goes inside. */
    parent?: string;
};
function excerpt(e: Entry, s: Workspace) { return e.body.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label ?? resolveLink(s, e, target)?.title ?? target).replace(/^[ \t]*- \[[ xX]\] /gm, "").replace(/[#*`]/g, "").replace(/\s+/g, " ").trim().slice(0, 150); }
function download(value: unknown, name: string) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export default function WorkspaceApp() {
    const [data, setData] = useState<Workspace>(emptyWorkspace), [loaded, setLoaded] = useState(false), [signedOut, setSignedOut] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState("Loading"), [worldId, setWorldId] = useState(""), [campaignId, setCampaignId] = useState<string | null>(null), [selected, setSelected] = useState<string | null>(null), [query, setQuery] = useState(""), [editing, setEditing] = useState(false), [modal, setModal] = useState<Modal | null>(null), [palette, setPalette] = useState(false), [paletteTags, setPaletteTags] = useState<string[]>([]), [tagsOpen, setTagsOpen] = useState(false), [mobile, setMobile] = useState(false), [closed, setClosed] = useState<Set<string>>(new Set), [toast, setToast] = useState(""), [dragging, setDragging] = useState<string | null>(null), [dropAt, setDropAt] = useState<{ id: string; place: DropPlace } | null>(null);
    const sidebar=useSidebarLayout(),navigation=useNavigationSections();
    const [view,setView]=useState<"dashboard"|"overview"|"characters"|"maps"|"calendar"|"tables"|"quests"|"codex">("dashboard"),[tool,setTool]=useState<"form"|"share"|null>(null),[tablesHome,setTablesHome]=useState(0);
    const current = useRef(data), revision = useRef(0), version = useRef(0), savedVersion = useRef(0), busy = useRef(false), blocked = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | null>(null), fileInput = useRef<HTMLInputElement>(null);
    const world = data.worlds.find(w => w.id === worldId), campaign = data.campaigns.find(c => c.id === campaignId), entry = data.entries.find(e => e.id === selected);
    const shown = visibleEntries(data, worldId, campaignId), scope = shown.filter(e => e.campaignId === campaignId), articles = shown.filter(e => e.kind !== "folder");
    const searchResults = articles.filter(e => searchableText(e).toLowerCase().includes(query.toLowerCase()));
    const linkQuery = useRef<URLSearchParams | null>(null);
    async function load() { try {
        const res = await fetch("/api/encyclopedia/workspace");
        const body = await res.json() as {
            error?: string;
            data: unknown;
            revision: number;
        };
        if (res.status === 401) {
            setSignedOut(true);
            return;
        }
        if (!res.ok)
            throw new Error(body.error);
        const checked = workspaceSchema.parse(body.data);
        current.current = checked;
        setData(checked);
        revision.current = body.revision;
        const first = checked.worlds.find(w => !w.archived&&!w.isTemplate) ?? checked.worlds.find(w=>!w.isTemplate);
        // The address says where you were (?entry=, ?campaign=, ?world=&view=), so a refresh or Back returns there.
        // Links from Maptable tokens and the Campaigns page use the same address. Without one, this tab's last place is used.
        // Read the address once: a second load must not lose it.
        const query = (linkQuery.current ??= new URLSearchParams(window.location.search));
        let stored: URLSearchParams | null = null;
        try { stored = new URLSearchParams(sessionStorage.getItem(PLACE_KEY) ?? ""); } catch { /* Storage is optional. */ }
        const place = placeFromQuery(query, checked) ?? (stored ? placeFromQuery(stored, checked) : null);
        if (place) { setWorldId(place.worldId); setCampaignId(place.campaignId); setView(place.view); setSelected(place.entryId); }
        else { setWorldId(first?.id ?? ""); setCampaignId(null); }
        setLoaded(true);
        setStatus("All changes saved");
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Could not load");
    } }
    useEffect(() => { load(); const leave = (e: BeforeUnloadEvent) => { if (version.current !== savedVersion.current) {
        e.preventDefault();
    } }; window.addEventListener("beforeunload", leave); return () => { window.removeEventListener("beforeunload", leave); if (timer.current)
        clearTimeout(timer.current); }; }, []);
    useEffect(() => {
        if (!loaded) return;
        const search = placeQuery({ worldId, campaignId, view, entryId: view === "overview" ? selected : null });
        try { sessionStorage.setItem(PLACE_KEY, search); } catch { /* Storage is optional. */ }
        if (search !== window.location.search) window.history.replaceState(window.history.state, "", window.location.pathname + search + window.location.hash);
    }, [loaded, worldId, campaignId, view, selected]);
    useEffect(() => { if (toast) {
        const t = setTimeout(() => setToast(""), 4000);
        return () => clearTimeout(t);
    } }, [toast]);
    async function save() { if (busy.current || blocked.current || version.current === savedVersion.current)
        return; busy.current = true; const sent = version.current; setStatus("Saving…"); try {
        const response = await fetch("/api/encyclopedia/workspace", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: current.current, revision: revision.current }) });
        const value = await response.json() as {
            error?: string;
            revision: number;
        };
        if (!response.ok)
            throw new Error(value.error ?? "Save failed");
        revision.current = value.revision;
        savedVersion.current = sent;
        setStatus(sent === version.current ? "All changes saved" : "Saving…");
    }
    catch (e) {
        blocked.current = true;
        setError(e instanceof Error ? e.message : "Could not save");
        setStatus("Unsaved changes");
    }
    finally {
        busy.current = false;
        if (!blocked.current && version.current !== savedVersion.current)
            void save();
    } }
    /** Save a new workspace, or a change worked out from the latest one so changes made in the same moment don't undo each other. */
    function change(input: Workspace | ((latest: Workspace) => Workspace)) { const next = typeof input === 'function' ? input(current.current) : input; if (next === current.current) return true; const checked=workspaceSchema.safeParse(next); if(!checked.success){setToast(checked.error.issues[0].message);return false;}if(new TextEncoder().encode(JSON.stringify(next)).length>2000000){setToast("The workspace exceeds 2 MB. Export and free space before adding more content.");return false;} current.current = next; setData(next); version.current++; setStatus("Unsaved changes"); if (timer.current)
        clearTimeout(timer.current); timer.current = setTimeout(save, 600); return true; }
    function updateEntry(id: string, patch: Partial<Entry>) { change({ ...current.current, entries: current.current.entries.map(e => e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e) }); }
    /** Clicking a tag opens search with that tag, across pages, scenes and campaigns. */
    const showTag = (t: Tag) => { setPaletteTags([t.id]); setPalette(true); };
    const openSearch = () => { setPaletteTags([]); setPalette(true); };
    useEffect(() => { const open = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); openSearch(); } }; window.addEventListener("keydown", open); return () => window.removeEventListener("keydown", open); }, []);
    function showView(next: "dashboard" | "characters" | "maps" | "calendar" | "quests" | "codex") { if (next === "dashboard") { openDashboard(); return; } setView(next); setSelected(null); setQuery(""); setTool(null); setMobile(false); }
    function openDashboard(){setView("dashboard");setSelected(null);setQuery("");setTool(null);setMobile(false);}
    function selectWorld(id: string) { setView("dashboard");setTool(null); setWorldId(id); setCampaignId(null); setSelected(null); setQuery(""); setMobile(false); }
    function selectCampaign(id: string | null) { setView("overview");setTool(null); setCampaignId(id); setSelected(null); setQuery(""); setMobile(false); }
    function openEntry(id: string) { setView("overview"); setSelected(id); setQuery(""); setEditing(false); setMobile(false); }
    // The one breadcrumb trail: Dashboard, world, campaign, section or folders, page.
    function crumbTrail(): Crumb[] {
        const trail: Crumb[] = [{ id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={14}/>, go: () => { setCampaignId(null); openDashboard(); } }];
        if (!world || (view === "dashboard" && !query)) return trail;
        const worldsList = data.worlds.filter(w => !w.isTemplate && (!w.archived || w.id === world.id));
        trail.push({ id: "world", label: world.name, icon: <Globe size={14}/>, go: () => selectCampaign(null),
            siblings: { heading: "Worlds", items: worldsList.map(w => ({ id: w.id, label: w.name, current: w.id === world.id, go: () => { setWorldId(w.id); selectCampaign(null); } })) } });
        const inCampaign = campaign && (entry ? entry.campaignId !== null : true);
        if (campaign && inCampaign) trail.push({ id: "campaign", label: campaign.name, icon: <Flag size={14}/>, go: () => selectCampaign(campaign.id),
            siblings: { heading: `Campaigns in ${world.name}`, items: data.campaigns.filter(c => c.worldId === world.id).map(c => ({ id: c.id, label: c.name, current: c.id === campaign.id, go: () => selectCampaign(c.id) })) } });
        const sections = [["characters", "Characters", <Users key="i" size={14}/>], ["maps", "Maps", <MapIcon key="i" size={14}/>], ["calendar", "Calendars", <CalendarDays key="i" size={14}/>], ["tables", "Random tables", <ListChecks key="i" size={14}/>], ...(campaign ? [["quests", "Quests", <Goal key="i" size={14}/>] as const, ["codex", "Codex", <Library key="i" size={14}/>] as const] : [])] as const;
        const section = sections.find(([id]) => id === view);
        if (section && !entry) trail.push({ id: "section", label: section[1], icon: section[2], go: () => showSection(section[0]),
            siblings: { heading: "Sections", items: sections.map(([id, label, icon]) => ({ id, label, icon, current: id === view, go: () => showSection(id) })) } });
        if (entry) {
            const chain: Entry[] = [];
            for (let at = entry.parentId ? data.entries.find(e => e.id === entry.parentId) : undefined; at && !chain.includes(at); at = at.parentId ? data.entries.find(e => e.id === at!.parentId) : undefined) chain.unshift(at);
            const levelOf = (e: Entry) => data.entries.filter(x => x.worldId === e.worldId && x.campaignId === e.campaignId && x.parentId === e.parentId).sort(compareEntries);
            const where = (e: Entry) => e.parentId ? data.entries.find(x => x.id === e.parentId)?.title ?? "this folder" : e.campaignId ? campaign?.name ?? "this campaign" : `${world.name} lore`;
            for (const e of [...chain, entry]) trail.push({ id: e.id, label: e.title, icon: <EntryIcon kind={e.kind}/>, go: () => openEntry(e.id),
                siblings: { heading: `In ${where(e)}`, items: levelOf(e).map(x => ({ id: x.id, label: x.title, icon: <EntryIcon kind={x.kind}/>, current: x.id === e.id, go: () => openEntry(x.id) })),
                    ...(e === entry ? { onNew: { label: "New page here", run: () => setModal({ type: "entry" }) } } : {}) } });
        }
        return trail;
    }
    function showSection(id: "characters" | "maps" | "calendar" | "tables" | "quests" | "codex") { setView(id); if (id === "tables") setTablesHome(n => n + 1); setSelected(null); setQuery(""); setMobile(false); }
    function toggleFolder(id: string) { setClosed(old => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
    function exportAll() { download(current.current, "world-manager-backup.json"); }
    async function importFile(file: File) { try {
        if (file.size > 2000000)
            throw new Error("Choose a JSON backup smaller than 2 MB.");
        const incoming = workspaceSchema.parse(JSON.parse(await file.text()));
        if (!incoming.worlds.length)
            throw new Error("This backup contains no worlds.");
        const next = importCopy(current.current, incoming);
        if (JSON.stringify(next).length > 2000000)
            throw new Error("The combined workspace exceeds the 2 MB first-version limit.");
        const first = next.worlds[current.current.worlds.length];
        change(next);
        setWorldId(first.id);
        setCampaignId(next.campaigns.find(c => c.worldId === first.id)?.id ?? null);
        setSelected(null);
        setToast("Imported as a separate copy. Existing worlds are unchanged.");
    }
    catch (e) {
        setToast(e instanceof Error ? e.message : "Invalid backup file");
    }
    finally {
        if (fileInput.current)
            fileInput.current.value = "";
    } }
    function removeEntry(e: Entry) { if (data.entries.some(x => x.parentId === e.id)) {
        setToast("Move or delete the pages inside it first.");
        return;
    } if (!confirm(`Delete “${e.title}”? This cannot be undone. Export a backup first if you need a copy.`))
        return; change({ ...data, entries: data.entries.filter(x => x.id !== e.id) }); setSelected(null); }
    // Any page can hold sub-pages. Drag a row onto the top or bottom edge of another to place it before or after, or onto its middle to put it inside.
    function dropOn(id: string, targetId: string, place: DropPlace) { const latest = current.current, next = movePage(latest, id, targetId, place); setDragging(null); setDropAt(null); if (!next) { setToast(dropProblem(latest, id, targetId, place) ?? "That page can’t go there."); return; } if (change(next) === false) return; const page = latest.entries.find(e => e.id === id), target = latest.entries.find(e => e.id === targetId); if (place === "inside") setClosed(old => { const n = new Set(old); n.delete(targetId); return n; }); setToast(place === "inside" ? `Moved “${page?.title}” inside “${target?.title}”.` : `Moved “${page?.title}”.`); }
    function tree(items: Entry[], parentId: string | null = null, depth = 0): ReactNode { return items.filter(e => e.parentId === parentId).sort(compareEntries).map(e => { const Icon = icons[e.kind], kids = items.some(x => x.parentId === e.id), folds = kids || e.kind === "folder", open = folds && !closed.has(e.id), count = kids ? descendantCount(data, e.id) : 0, drop = dropAt?.id === e.id ? dropAt.place : null; return <div key={e.id}><div className={`tree-row ${selected === e.id ? "selected" : ""}${drop ? ` drop-${drop}` : ""}${dragging === e.id ? " dragging" : ""}`} style={{ paddingLeft: 12 + depth * 15 }} draggable onDragStart={ev => { ev.dataTransfer.setData("text/plain", e.title); ev.dataTransfer.effectAllowed = "move"; setDragging(e.id); }} onDragEnd={() => { setDragging(null); setDropAt(null); }} onDragOver={ev => { if (!dragging) return; const r = ev.currentTarget.getBoundingClientRect(), y = (ev.clientY - r.top) / r.height, place: DropPlace = y < .28 ? "before" : y > .72 ? "after" : "inside"; if (dropProblem(data, dragging, e.id, place)) { if (dropAt) setDropAt(null); return; } ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; if (dropAt?.id !== e.id || dropAt.place !== place) setDropAt({ id: e.id, place }); }} onDrop={ev => { ev.preventDefault(); if (dragging && dropAt?.id === e.id) dropOn(dragging, e.id, dropAt.place); }}>{folds ? <button className="disclosure" aria-label={`${open ? "Collapse" : "Expand"} ${e.title}`} aria-expanded={open} onClick={() => toggleFolder(e.id)}>{open ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}</button> : <span className="disclosure"/>}<button className="tree-item" onClick={() => openEntry(e.id)}><Icon size={15}/><span>{e.title}</span>{count > 0 && <small className="tree-count" aria-label={`${count} pages inside`}>{count}</small>}</button></div>{open && tree(items, e.id, depth + 1)}</div>; }); }
    if (signedOut)
        return <div className="welcome"><div className="welcome-theme"><ThemeToggle/></div><div className="welcome-mark"><Compass size={38}/></div><span className="eyebrow">TTRPG WORLD MANAGER</span><h1>Your worlds.<br />Their stories.</h1><p>A quiet place for world lore, campaign notes, and the threads that connect them.</p><a className="button primary" href="/account" target="_top">Open your workspace <ArrowUpRight size={16}/></a><small>Private by default · Your notes belong to you</small></div>;
    if (!loaded)
        return <div className="welcome"><div className="welcome-theme"><ThemeToggle/></div><Compass size={40}/><h1>{error ? "Couldn’t open your worlds" : "Opening your worlds…"}</h1>{error ? <><p>{error}</p><button onClick={() => location.reload()}>Try again</button></> : <LoaderCircle className="spin"/>}</div>;
    return <div className={`app-shell ${sidebar.collapsed?"sidebar-collapsed":""}`} style={{"--sidebar-width":sidebar.width+"px"} as CSSProperties}>
  <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={e => e.target.files?.[0] && importFile(e.target.files[0])}/>
  {mobile && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobile(false)}/>}
  <aside id="workspace-sidebar" aria-label="Workspace navigation" inert={sidebar.narrow?!mobile:sidebar.collapsed} className={`sidebar ${mobile ? "is-open" : ""}`} onKeyDown={e=>{if(e.key==="Escape")setMobile(false);}}>
   <button className="sidebar-mobile-close icon-button" aria-label="Close navigation" onClick={()=>setMobile(false)}><X size={17}/></button>
   <div className="sidebar-tools"><ToolSwitch active="encyclopedia"/><AccountLink/></div>
   <button className="world-picker" onClick={openDashboard}><Globe size={18}/><span><small>YOUR WORLD</small><strong>{world?.name ?? "Choose a world"}</strong></span><ChevronDown size={15}/></button>
   <div className="side-section dashboard-nav"><button className={`campaign-link ${view==='dashboard'?'active':''}`} onClick={openDashboard}><LayoutDashboard size={16}/><span>Dashboard</span></button>{campaign&&<button className={`campaign-link ${view==='overview'&&!selected?'active':''}`} aria-label={`Open current campaign ${campaign.name}`} onClick={()=>selectCampaign(campaign.id)}><Flag size={15}/><span>{campaign.name}</span></button>}</div>
   {world&&<div className="character-nav">{campaign&&<button className={`campaign-link ${view==='quests'?'active':''}`} onClick={()=>{setView('quests');setSelected(null);setQuery('');setMobile(false);}}><Goal size={16}/> Quests</button>}{campaign&&<button className={`campaign-link ${view==='codex'?'active':''}`} onClick={()=>{setView('codex');setSelected(null);setQuery('');setMobile(false);}}><Library size={16}/> Codex</button>}<button className={`campaign-link ${view==='characters'?'active':''}`} onClick={()=>{setView('characters');setSelected(null);setQuery('');setMobile(false);}}><Users size={16}/> Characters</button><button className={`campaign-link ${view==='maps'?'active':''}`} onClick={()=>{setView('maps');setSelected(null);setQuery('');setMobile(false);}}><MapIcon size={16}/> Maps</button>{campaign&&<button className={`campaign-link ${view==='calendar'?'active':''}`} onClick={()=>{setView('calendar');setSelected(null);setQuery('');setMobile(false);}}><CalendarDays size={16}/> Calendar</button>}<button className={`campaign-link ${view==='tables'?'active':''}`} onClick={()=>{setView('tables');setTablesHome(n=>n+1);setSelected(null);setQuery('');setMobile(false);}}><Dices size={16}/> Random tables</button>{campaign&&<div className="button-row"><button className="text-button" onClick={()=>{setTool('form');setMobile(false);}}>Stat form</button><button className="text-button" onClick={()=>{setTool('share');setMobile(false);}}>Player view</button></div>}</div>}
   <div className="navigation-trees">{world&&<section className="navigation-section"><div className="side-heading"><button className="section-toggle" aria-expanded={navigation.sections.lore} aria-controls="world-lore-tree" onClick={()=>navigation.toggle('lore')}>{navigation.sections.lore?<ChevronDown size={14}/>:<ChevronRight size={14}/>} World Lore</button><span className="shared-tag">shared</span></div>{navigation.sections.lore&&<div id="world-lore-tree"><button className="text-button section-overview" onClick={()=>selectCampaign(null)}>World overview <ArrowUpRight size={12}/></button>{tree(shown.filter(e=>e.campaignId===null))}{!shown.some(e=>e.campaignId===null)&&<p className="side-empty">Places, people, and possibilities.</p>}</div>}</section>}{campaign&&<section className="navigation-section"><div className="side-heading campaign-heading"><button className="section-toggle" aria-expanded={navigation.sections.notes} aria-controls="campaign-notes-tree" onClick={()=>navigation.toggle('notes')}>{navigation.sections.notes?<ChevronDown size={14}/>:<ChevronRight size={14}/>} Campaign Notes</button><button className="add-note" aria-label="New campaign note" onClick={()=>setModal({type:'entry'})}><Plus size={15}/></button></div>{navigation.sections.notes&&<div id="campaign-notes-tree">{tree(scope)}{!scope.length&&<p className="side-empty">Add the first page of this story.</p>}</div>}</section>}</div>
   <div className="sidebar-bottom"><button onClick={() => setModal({ type: "connections" })}><Github size={16}/> AI & GitHub <span className="tiny">BETA</span></button><button onClick={() => setModal({ type: "settings" })}><Settings size={16}/> Workspace & backups</button><div className="save-status"><span className={status === "All changes saved" ? "status-dot" : "status-dot pending"}/>{status}</div></div>
   <SidebarResize width={sidebar.width} maxWidth={sidebar.maxWidth} onChange={sidebar.setWidth}/>
  </aside>
  <main className="main-panel">
   <header className="topbar"><div className="crumbs"><button className="sidebar-toggle icon-button" aria-label={sidebar.collapsed?"Show sidebar":"Hide sidebar"} title={sidebar.collapsed?"Show sidebar":"Hide sidebar"} aria-expanded={!sidebar.collapsed} aria-controls="workspace-sidebar" onClick={()=>sidebar.setCollapsed(!sidebar.collapsed)}>{sidebar.collapsed?<PanelLeftOpen size={18}/>:<PanelLeftClose size={18}/>}</button><button className="mobile-menu" aria-label="Open navigation" aria-expanded={mobile} aria-controls="workspace-sidebar" onClick={() => setMobile(true)}><Menu size={20}/></button><ToolSwitch active="encyclopedia"/></div><Breadcrumbs className="topbar-crumbs" fewest={2} items={crumbTrail()}/><div className="top-actions"><label className="search-box"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search this campaign…" aria-label="Search notes"/>{query ? <button aria-label="Clear search" onClick={() => setQuery("")}><X size={14}/></button> : <button className="quick-hint" aria-label="Open quick search" title="Quick search: jump to or create any entry" onClick={() => openSearch()}><kbd>Ctrl K</kbd></button>}</label><button className="button primary small" disabled={!world} onClick={() => setModal({ type: "entry" })}><Plus size={16}/> New entry</button><ThemeToggle/><AccountLink/></div></header>
   <FogImageSync data={data} change={change}/>{error && <div className="error-banner" role="alert"><div><strong>Your changes need attention.</strong> {error}</div><button onClick={exportAll}>Export unsaved draft</button><button onClick={() => { if (confirm("Reload saved data? Unsaved changes in this tab will be discarded. Export your draft first."))
        location.reload(); }}>Reload</button><button onClick={() => { blocked.current = false; setError(""); void save(); }}>Retry save</button></div>}
   {view==='dashboard'&&!query ? <WorkspaceDashboard data={data} worldId={worldId} change={change} onWorld={selectWorld} onCampaign={(wid,cid)=>{setWorldId(wid);selectCampaign(cid);}} onLore={wid=>{setWorldId(wid);selectCampaign(null);navigation.open('lore');}} onNewCampaign={()=>setModal({type:'campaign'})} onEdit={id=>setModal({type:'rename',id})}/> : !world ? <div className="empty-world"><span className="eyebrow">EVERY WORLD STARTS WITH A PAGE</span><h1>Make room for<br />your next adventure.</h1><p>Keep the world you imagine and the campaigns you play in one thoughtful workspace.</p><div className="button-row"><button className="button primary" onClick={() => setModal({ type: "world" })}><Plus size={17}/> Create a world</button><button className="button" onClick={() => { change(demoWorkspace()); setWorldId("demo-world"); setCampaignId("demo-campaign"); }}>Explore a sample world <ArrowUpRight size={16}/></button></div><button className="text-button" onClick={() => fileInput.current?.click()}><Upload size={15}/> Bring an existing backup</button><div className="empty-illustration"><Compass size={120} strokeWidth={.7}/><span>WORLDS / CAMPAIGNS / STORIES</span></div></div> :
            query ? <section className="page-content"><span className="eyebrow">SEARCH · {campaign?.name ?? "WORLD LORE"}</span><h1>Find a thread</h1><p className="subtitle">{searchResults.length} results for “{query}” · includes shared world lore</p><div className="result-list">{searchResults.map(e => <button key={e.id} onClick={() => openEntry(e.id)}><span className="entry-icon"><EntryIcon kind={e.kind}/></span><span><strong>{e.title}</strong><small>{e.campaignId ? labels[e.kind] : `Shared lore · ${labels[e.kind]}`}</small><p>{excerpt(e, data)}</p></span><ChevronRight size={16}/></button>)}{!searchResults.length && <p>No matches. Try a character, place, or phrase.</p>}</div></section> :
                view==='tables' ? <RandomTablesSection home={tablesHome} campaignId={campaignId} onSaveCharacter={page=>{const id=newId();if(change({...current.current,entries:[...current.current.entries,{id,worldId,campaignId,parentId:null,title:page.title,kind:'character',character:defaultCharacter(),body:page.body,updatedAt:new Date().toISOString()}]})!==false){navigation.open(campaignId?'notes':'lore');openEntry(id);}}} campaigns={data.campaigns.map(c=>({id:c.id,name:c.name,world:data.worlds.find(w=>w.id===c.worldId)?.name??''}))}/> :
                view==='quests'&&campaign ? <QuestsSection key={campaign.id} data={data} worldId={worldId} campaign={campaign} change={change} onOpen={openEntry}/> :
                view==='codex'&&campaign ? <CodexSection key={campaign.id} data={data} worldId={worldId} campaign={campaign} change={change} onOpen={openEntry}/> :
                view==='calendar'&&campaign ? <CalendarSection key={campaign.id} data={data} campaign={campaign} change={change}/> :
                view==='maps' ? <MapsSection key={worldId+campaignId} data={data} worldId={worldId} campaignId={campaignId} change={change} onOpen={openEntry}/> :
                view==='characters' ? <CharactersSection key={worldId+campaignId} data={data} worldId={worldId} campaignId={campaignId} change={change} onOpen={openEntry} onForm={()=>setTool('form')} onShare={()=>setTool('share')} onNewFolder={()=>setModal({type:'entry',id:'folder'})}/> :
                entry ? <ArticleEditor key={entry.id} entry={entry} data={data} campaign={campaign} editing={editing} setEditing={setEditing} update={patch=>updateEntry(entry.id,patch)} change={change} onOpen={openEntry} onOverview={()=>setSelected(null)} onRename={()=>setModal({type:'rename',id:entry.id})} onDelete={()=>removeEntry(entry)} onNew={parent=>setModal({type:"entry",parent})} onForm={()=>setTool('form')} onTag={showTag}/> :
                    <section className="page-content dashboard"><div className="dashboard-intro"><div><span className="eyebrow">{campaign ? "YOUR CAMPAIGN WORKSPACE" : "THE WORLD BETWEEN ADVENTURES"}</span><h1>{campaign?.name ?? world.name}</h1><p className="subtitle">{campaign?.description ?? world.description}</p></div><button className="icon-button" title="Edit details" aria-label="Edit details" onClick={() => setModal({ type: "rename", id: campaign?.id ?? world.id })}><Settings size={19}/></button></div><div className="overview-strip"><span><FileText size={16}/><strong>{scope.filter(e => e.kind !== "folder").length}</strong> {campaign ? "campaign entries" : "world articles"}</span><span><BookOpen size={16}/><strong>{data.entries.filter(e => e.worldId === worldId && e.campaignId === null && e.kind !== "folder").length}</strong> shared articles</span><span><Flag size={16}/><strong>{data.campaigns.filter(c => c.worldId === worldId).length}</strong> campaigns</span></div><div className="section-heading"><h2>Pick up the story</h2><span>Recently updated</span></div><div className="recent-grid">{scope.filter(e => e.kind !== "folder").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4).map(e => <button className="note-card" key={e.id} onClick={() => openEntry(e.id)}><span className="card-top"><span className={`entry-icon ${e.kind}`}><EntryIcon kind={e.kind}/></span><span className="eyebrow">{labels[e.kind]}</span><ArrowUpRight size={16}/></span><h3>{e.title}</h3><p>{excerpt(e, data) || "A page waiting to be written."}</p><span className="card-footer">Open entry <ChevronRight size={14}/></span></button>)}<button className="note-card add-card" onClick={() => setModal({ type: "entry" })}><Plus size={25}/><h3>Start a new page</h3><p>A session, a character,<br />or a thought worth keeping.</p></button></div><div className="dashboard-lower"><div><div className="section-heading"><h2>Shared world lore</h2><button className="text-button" onClick={() => selectCampaign(null)}>Explore world <ArrowUpRight size={14}/></button></div><div className="lore-list">{shown.filter(e => e.campaignId === null && e.kind !== "folder").slice(0, 5).map(e => <button key={e.id} onClick={() => openEntry(e.id)}><EntryIcon kind={e.kind}/><span>{e.title}<small>{labels[e.kind]}</small></span><ChevronRight size={15}/></button>)}{!shown.some(e => e.campaignId === null) && <p className="muted">Create shared lore to connect your campaigns.</p>}</div></div><div className="quiet-card"><Compass size={28} strokeWidth={1.3}/><h3>One world. Many stories.</h3><p>World lore travels with every campaign. Session notes and decisions stay with the story they belong to.</p><button className="text-button" onClick={() => setModal({ type: "campaign" })}>Begin another campaign <Plus size={14}/></button></div></div></section>}
   <footer className="main-footer"><span>YOUR WORLDS, THEIR STORIES.</span><span>Private workspace <span>·</span> v0.11</span></footer>
  </main>
  {toast && <div className="toast" role="status"><Check size={16}/>{toast}</div>}
  {tool==='form'&&campaign&&<StatFormBuilder key={campaign.id} campaign={campaign} data={data} onClose={()=>setTool(null)} onSave={statFields=>change({...data,campaigns:data.campaigns.map(c=>c.id===campaign.id?{...c,statFields}:c)})}/>}
  {tool==='share'&&campaign&&<PlayerSharing key={campaign.id} data={data} campaignId={campaign.id} saved={status==='All changes saved'} onClose={()=>setTool(null)}/>}
  <RollResults discord={campaign?.discord ? { campaignId: campaign.id, label: `#${campaign.discord.route}` } : null} onSetupDiscord={campaign ? () => setModal({ type: "connections" }) : undefined}/>
  {palette && <QuickSearch entries={shown} icons={icons} labels={labels} canCreate={!!world} scopeName={e => e.campaignId ? data.campaigns.find(c => c.id === e.campaignId)?.name ?? "Campaign" : "World lore"} onOpen={openEntry} onCreate={name => setModal({ type: "entry", name })} onView={showView} onClose={() => setPalette(false)} initialTags={paletteTags} onManageTags={() => setTagsOpen(true)}/>}
  {tagsOpen && <TagsManager onClose={() => setTagsOpen(false)} onShow={showTag}/>}
  {modal && <ModalDialog title={{ world: "Create a world", campaign: "Begin a campaign", entry: "Create an entry", settings: "Workspace & backups", library: "Your world library", rename: "Edit details", connections: "AI & campaign repositories" }[modal.type]} onClose={() => setModal(null)}>
   {modal.type === "library" ? <><p className="modal-intro">A home for every world you imagine.</p><div className="world-list">{data.worlds.map(w => <div key={w.id}><button onClick={() => { selectWorld(w.id); setModal(null); }}><Globe size={20}/><span><strong>{w.name}</strong><small>{w.archived ? "Archived" : `${data.campaigns.filter(c => c.worldId === w.id).length} campaigns`}</small></span><ChevronRight size={16}/></button><button aria-label={`${w.archived ? "Restore" : "Archive"} ${w.name}`} title={w.archived ? "Restore world" : "Archive world"} onClick={() => change({ ...data, worlds: data.worlds.map(x => x.id === w.id ? { ...x, archived: !x.archived } : x) })}><Archive size={16}/></button></div>)}</div><button className="button primary" onClick={() => setModal({ type: "world" })}><Plus size={16}/> Create a world</button></> :
                modal.type === "settings" ? <><p className="modal-intro">Keep a copy you control. Backups include your worlds, campaigns, article links, and folder hierarchy.</p><div className="settings-action"><div><strong>Export all worlds</strong><p>Download a complete JSON backup, including unsaved changes.</p></div><button className="button" onClick={exportAll}><Download size={16}/> Export</button></div><div className="settings-action"><div><strong>Import a backup</strong><p>Creates new copies. Existing worlds are preserved.</p></div><button className="button" onClick={() => fileInput.current?.click()}><Upload size={16}/> Import</button></div><p className="info-note">Local and hosted workspaces use their configured storage. Use export and import to move content between them. This version supports up to 2 MB of workspace data. Uploaded map images are stored separately: download each map’s Map package to include its image when moving between local and hosted workspaces.</p><a className="text-button" href="/account" target="_top">Sign out</a></> :
                    modal.type === "connections" ? <><p className="modal-intro">Each campaign can have its own repository. AI can read a selected campaign and its shared lore through authenticated, read-only MCP tools.</p>{campaign ? <><div className="connection-label"><Flag size={17}/>{campaign.name}</div><DetailsForm key={campaign.id} mode="github" initialName={campaign.github.repository} initialDescription={campaign.github.branch} onSubmit={(name, description) => { const result = githubSchema.safeParse({ repository: name.trim(), branch: description.trim() }); if (!result.success)
                        throw new Error(result.error.issues[0].message); change({ ...data, campaigns: data.campaigns.map(c => c.id === campaign.id ? { ...c, github: result.data } : c) }); setToast("Campaign repository settings saved"); }}/><button className="button full" onClick={() => download(campaignExport(current.current, campaign.id), `campaign-${campaign.id}.json`)}><Download size={16}/> Export this campaign for GitHub</button><p className="info-note">Includes shared world lore; excludes every other campaign. The local sync command writes readable Markdown and JSON to the repository you configure. Push and pull are explicit actions; saving here does not contact GitHub.</p><details className="connection-help"><summary>Local sync commands</summary><p>From the app folder, with your campaign export and a local clone of its GitHub repository:</p><code>node --experimental-strip-types scripts/campaign-sync.mjs export --file /path/campaign.json --repo /path/repository --push</code><p>Retrieve the repository copy for import:</p><code>node --experimental-strip-types scripts/campaign-sync.mjs pull --campaign {campaign.id} --repo /path/repository --repository {campaign.github.repository || "owner/repository"} --branch {campaign.github.branch} --out /path/restored.json</code><p>Pull imports are separate copies so existing notes are never silently overwritten. One-click hosted sync is planned.</p></details></> : <p className="info-note">Choose a campaign on the Dashboard to configure its repository and export.</p>}{campaign && <DiscordRollsSetting campaign={campaign} onChange={discord => change({ ...data, campaigns: data.campaigns.map(c => c.id === campaign.id ? { ...c, discord } : c) })}/>}<EncyclopediaAgentAccess campaignId={campaignId}/></> :
                        <DetailsForm key={modal.type + modal.id} defaultKind={modal.id==="folder"?"folder":"note"} mode={modal.type} initialName={modal.type === "entry" ? modal.name ?? "" : modal.type === "rename" ? (data.entries.find(e => e.id === modal.id)?.title ?? data.campaigns.find(c => c.id === modal.id)?.name ?? data.worlds.find(w => w.id === modal.id)?.name ?? "") : ""} initialDescription={data.campaigns.find(c => c.id === modal.id)?.description ?? data.worlds.find(w => w.id === modal.id)?.description ?? ""} showDescription={modal.type === "world" || modal.type === "campaign" || modal.type === "rename" && !data.entries.some(e => e.id === modal.id)} campaignAvailable={!!campaign} defaultParent={modal.parent ?? (entry?.kind === "folder" ? entry.id : entry?.parentId ?? "")} defaultShared={modal.parent ? data.entries.find(e => e.id === modal.parent)?.campaignId === null : entry ? entry.campaignId === null : !campaign} folders={shown.map(e=>({...e,title:[folderPath(data,e),e.title].filter(Boolean).join(" / ")})).sort((a,b)=>a.title.localeCompare(b.title))} onSubmit={(name, description, kind, shared, parent) => { if (!name.trim())
                            throw new Error("A title is required"); if (modal.type === "world") {
                            const id = newId();
                            change({ ...data, worlds: [...data.worlds, { id, name: name.trim(), description, archived: false }] });
                            setWorldId(id);
                            setCampaignId(null);
                            setSelected(null);
                        } if (modal.type === "campaign") {
                            const id = newId();
                            change({ ...data, campaigns: [...data.campaigns, { id, worldId, name: name.trim(), description, github: { repository: "", branch: "main" } }] });
                            setCampaignId(id);
                            setView("overview");
                            setSelected(null);
                        } if (modal.type === "entry") {
                            const id = newId();
                            const scopeId = shared ? null : campaignId;
                            navigation.open(shared?"lore":"notes");
                            const parentEntry = data.entries.find(e => e.id === parent && e.campaignId === scopeId);
                            change({ ...data, entries: [...data.entries, { id, worldId, campaignId: scopeId, parentId: parentEntry?.id ?? null, title: name.trim(), kind: kind ?? "note", character:kind==="character"?defaultCharacter():undefined, mapData:kind==="map"?newMap():undefined, body: kind === "tasks" ? "- [ ] First task\n  - [ ] A smaller step" : "", updatedAt: new Date().toISOString() }] });
                            setView("overview");
                            setSelected(id);
                            setEditing(true);
                            if (parentEntry)
                                setClosed(old => { const next = new Set(old); next.delete(parentEntry.id); return next; });
                        } if (modal.type === "rename") {
                            if (data.entries.some(e => e.id === modal.id))
                                updateEntry(modal.id!, { title: name.trim() });
                            else
                                change({ ...data, worlds: data.worlds.map(w => w.id === modal.id ? { ...w, name: name.trim(), description } : w), campaigns: data.campaigns.map(c => c.id === modal.id ? { ...c, name: name.trim(), description } : c) });
                        } setModal(null); }}/>}
  </ModalDialog>}
 </div>;
}
function EntryIcon({ kind }: {
    kind: Entry["kind"];
}) { const Icon = icons[kind]; return <Icon size={17}/>; }
function ModalDialog({ title, onClose, children }: {
    title: string;
    onClose: () => void;
    children: ReactNode;
}) { const ref = useRef<HTMLDialogElement>(null); useEffect(() => { ref.current?.showModal(); }, []); return <dialog ref={ref} className="modal" onCancel={onClose} onClick={e => { if (e.target === ref.current)
    onClose(); }}><div className="modal-inner"><div className="modal-heading"><h2>{title}</h2><button aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div>{children}</div></dialog>; }
function DetailsForm({ mode, initialName = "", initialDescription = "", onSubmit, showDescription = false, campaignAvailable = false, defaultParent = "", defaultShared = false, defaultKind = "note", folders = [] }: {
    mode: string;
    initialName?: string;
    initialDescription?: string;
    showDescription?: boolean;
    campaignAvailable?: boolean;
    defaultParent?: string;
    defaultShared?: boolean;
    folders?: Entry[];
    defaultKind?: Entry["kind"];
    onSubmit: (name: string, description: string, kind?: Entry["kind"], shared?: boolean, parent?: string) => void;
}) {
    const [name, setName] = useState(initialName), [description, setDescription] = useState(initialDescription), [kind, setKind] = useState<Entry["kind"]>(defaultKind), [shared, setShared] = useState(defaultShared), [parent, setParent] = useState(defaultParent), [error, setError] = useState("");
    return <form className="details-form" onSubmit={e => { e.preventDefault(); try {
        onSubmit(name, description, kind, shared, parent);
        setError("");
    }
    catch (err) {
        setError(err instanceof Error ? err.message : "Please check your input");
    } }}><label>{mode === "github" ? "GitHub repository" : "Name"}<input autoFocus required={mode !== "github"} maxLength={mode === "github" ? 200 : 160} placeholder={mode === "github" ? "owner/repository" : "Give it a name…"} value={name} onChange={e => setName(e.target.value)}/></label>{(showDescription || mode === "github") && <label>{mode === "github" ? "Branch" : "A short description"}<input required={mode === "github"} maxLength={mode === "github" ? 100 : 1000} value={description} onChange={e => setDescription(e.target.value)} placeholder={mode === "github" ? "main" : "What makes this story yours?"}/></label>}{mode === "entry" && <><label>Entry type<select value={kind} onChange={e => setKind(e.target.value as Entry["kind"])}>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Belongs to<select value={shared ? "shared" : "campaign"} onChange={e => { setShared(e.target.value === "shared"); setParent(""); }}>{campaignAvailable && <option value="campaign">Current campaign</option>}<option value="shared">Shared world lore</option></select></label><label>Inside<select value={parent} onChange={e => setParent(e.target.value)}><option value="">Top level</option>{folders.filter(e => shared ? e.campaignId === null : e.campaignId !== null).map(e => <option key={e.id} value={e.id}>{e.title}</option>)}</select></label></>}{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary" type="submit">{mode === "github" || mode === "rename" ? "Save details" : "Create"}<Check size={16}/></button></form>;
}
