"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, BookOpen, BookMarked, CalendarDays, Check, Eye, FileText, Flag, GripVertical, LayoutDashboard, House, Link2, Map as MapIcon, Pencil, Plus, ScrollText, Trash2, User, X } from "lucide-react";
import type { CampaignHub } from "@/lib/campaigns-server";
import { newWidget, widgetNames, type FrontPage, type FrontWidget, type FrontWidgetType } from "@/lib/encyclopedia/front-page";
import { dashInfo, dashSizes, dashSpan, dashWidgets, defaultDashboard, moveWidget, resizeWidget, toggleWidget, type Dashboard, type DashWidget } from "@/lib/encyclopedia/dashboard";
import { stateNames, questStates } from "@/lib/encyclopedia/quests";
import { isNewFind } from "@/lib/encyclopedia/codex";
import { lookAttributes } from "@/lib/encyclopedia/look";
import { FrontPageView, sessionTime } from "./front-page-view";
import { when } from "./home-campaigns";
import { TagRow } from "./tags";
import { LookBanner, LookFont } from "./encyclopedia/look-section";
import { PictureToken, usePictureSrc } from "./encyclopedia/character-picture";
import { campaignTargets } from "@/lib/tags";
import "./campaign-hub.css";

type Tab = "dashboard" | "front";
const notesHref = (id: string, view?: string) => `/encyclopedia?campaign=${encodeURIComponent(id)}${view ? `&view=${view}` : ""}`;
const mapsHref = (id: string) => `/maptable?campaign=${encodeURIComponent(id)}`;
const entryHref = (id: string) => `/encyclopedia?entry=${encodeURIComponent(id)}`;
const post = async (body: object, failed: string): Promise<CampaignHub> => {
  const r = await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = await r.json();
  if (!r.ok) throw new Error(out.error || failed);
  return out;
};

/** One campaign across both tools: a header, a Dashboard for the GM and the Front page players see. */
export default function CampaignHub({ campaignKey }: { campaignKey: string }) {
  const [hub, setHub] = useState<CampaignHub | null>(null), [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "front" ? "front" : "dashboard"), [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Dashboard | null>(null), [saveError, setSaveError] = useState("");
  const saves = useRef(0);
  useEffect(() => {
    let live = true;
    fetch(`/api/campaigns?hub=${encodeURIComponent(campaignKey)}`, { cache: "no-store" }).then(async r => {
      const body = await r.json();
      if (!r.ok) throw new Error(body.error === "Campaign not found" ? "This campaign no longer exists. It may have been renamed or removed." : body.error || "Could not load this campaign.");
      if (live) setHub(body);
    }).catch(e => live && setError(e instanceof Error ? e.message : "Could not load this campaign."));
    return () => { live = false; };
  }, [campaignKey]);
  function choose(next: Tab) {
    setTab(next); setEditing(false); setDraft(null);
    const url = new URL(window.location.href);
    if (next === "front") url.searchParams.set("tab", "front"); else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url);
  }
  /** Shows the change at once, then saves it. Only the newest save's answer is kept. */
  async function save(dashboard: Dashboard) {
    const n = ++saves.current;
    setHub(h => h && { ...h, dashboard }); setSaveError("");
    try { const next = await post({ action: "dashboard", key: campaignKey, dashboard }, "Could not save the dashboard."); if (n === saves.current) setHub(next); }
    catch (e) { if (n === saves.current) setSaveError(e instanceof Error ? e.message : "Could not save the dashboard."); }
  }
  async function saveFront(frontPage: FrontPage) {
    setSaveError("");
    try { setHub(await post({ action: "frontPage", key: campaignKey, frontPage }, "Could not save the next session.")); }
    catch (e) { setSaveError(e instanceof Error ? e.message : "Could not save the next session."); }
  }

  if (error) return <div className="hub-message"><h1>Campaign unavailable</h1><p>{error}</p><Link href="/campaigns">Back to Campaigns</Link></div>;
  if (!hub) return <div className="hub-message"><p>Loading campaign…</p></div>;
  const { row } = hub, e = row.encyclopedia, m = row.maptable, look = hub.look ?? undefined;
  // The campaign's accent and heading font carry over from its look. Its page surface stays in the Encyclopedia.
  const attrs = lookAttributes(look);
  const layout = hub.dashboard ?? defaultDashboard();
  return <div className={`hub${draft ? " hub-customizing" : ""}`} data-look-accent={attrs["data-look-accent"]} style={attrs.style as CSSProperties}>
    <LookFont look={look} />
    <nav className="hub-crumbs" aria-label="Breadcrumb"><Link href="/campaigns">Campaigns</Link><span aria-hidden="true">/</span><span aria-current="page">{row.name}</span></nav>
    {look?.banner && <LookBanner look={look} className="hub-banner" />}
    <div className="hub-head">
      <div className="hub-title">
        <p>Campaign{e?.worldName ? ` · ${e.worldName}` : ""}</p>
        <h1>{row.name}</h1>
        <TagRow className="hub-tags" targets={campaignTargets(row)} />
      </div>
      <div className="hub-actions">
        {draft ? <button className="hub-button hub-button-primary" onClick={() => { void save(draft); setDraft(null); }}><Check size={15} aria-hidden="true" />Done</button> : <>
          {tab === "dashboard" && e && <button className="hub-button" onClick={() => setDraft(layout)}><Pencil size={14} aria-hidden="true" />Customize</button>}
          {tab === "front" && hub.frontConfig && !editing && <button className="hub-button" onClick={() => setEditing(true)}><Pencil size={14} aria-hidden="true" />Customize</button>}
          {e && <a className="hub-button" href={notesHref(e.id)}><BookOpen size={15} aria-hidden="true" />Open notes</a>}
          {m && <a className="hub-button hub-button-primary" href={mapsHref(m.id)}><MapIcon size={15} aria-hidden="true" />Open in Maptable</a>}
        </>}
      </div>
    </div>
    <div className="hub-tabs">
      <div role="tablist" aria-label="Campaign">
        <button role="tab" aria-selected={tab === "dashboard"} onClick={() => choose("dashboard")}><LayoutDashboard size={16} aria-hidden="true" />Dashboard</button>
        <button role="tab" aria-selected={tab === "front"} onClick={() => choose("front")}><House size={16} aria-hidden="true" />Front page</button>
        {m && <a href={mapsHref(m.id)}>Maps<ArrowUpRight size={13} aria-hidden="true" /></a>}
        {e && <a href={notesHref(e.id)}>Notes<ArrowUpRight size={13} aria-hidden="true" /></a>}
      </div>
    </div>
    {saveError && <p className="hub-error" role="alert">{saveError}</p>}
    <div className="hub-body" role="tabpanel">
      {tab === "dashboard" ? draft
        ? <Customize hub={hub} draft={draft} setDraft={setDraft} />
        : <DashboardView hub={hub} layout={layout} save={save} saveFront={saveFront} customize={e ? () => setDraft(layout) : undefined} />
        : !hub.front || !hub.frontConfig ? <NoNotes /> : editing
        ? <FrontEditor hub={hub} campaignKey={campaignKey} done={next => { if (next) setHub(next); setEditing(false); }} />
        : <><p className="hub-note"><Eye size={15} aria-hidden="true" />This is what players see first with their player link.</p><FrontPageView page={hub.front} href={entryHref} /></>}
    </div>
  </div>;
}

function NoNotes() {
  return <div className="hub-card hub-empty"><h2>No front page yet</h2><p>The front page lives in the Encyclopedia. Start notes for this campaign on the <Link href="/campaigns">Campaigns page</Link> to give it one.</p></div>;
}

type Saver = (d: Dashboard) => Promise<void>;

function DashboardView({ hub, layout, save, saveFront, customize }: { hub: CampaignHub; layout: Dashboard; save: Saver; saveFront: (p: FrontPage) => Promise<void>; customize?: () => void }) {
  if (!layout.widgets.length) return <div className="hub-card hub-empty"><h2>Nothing on the dashboard</h2><p>{customize ? <>Choose what to show with <button className="hub-text-button" onClick={customize}>Customize</button>.</> : "Start notes for this campaign to customize its dashboard."}</p></div>;
  return <div className="hub-grid">
    {layout.widgets.map(w => <section key={w.type} className={`hub-card hub-w-${w.type}`} style={{ gridColumn: `span ${dashSpan[w.size]}` }} aria-label={dashInfo[w.type].name}>
      <WidgetBody type={w.type} size={w.size} hub={hub} layout={layout} save={save} saveFront={saveFront} />
    </section>)}
  </div>;
}

/** Customize: drag widgets (or use the arrow keys on the handle), pick a width, and choose widgets in the side panel. */
function Customize({ hub, draft, setDraft: replace }: { hub: CampaignHub; draft: Dashboard; setDraft: (d: (current: Dashboard | null) => Dashboard | null) => void }) {
  const [dragging, setDragging] = useState<DashWidget | null>(null);
  // Always change the newest layout: drag events can come faster than React renders.
  const setDraft = (next: Dashboard | ((d: Dashboard) => Dashboard)) => replace(d => d && (typeof next === "function" ? next(d) : next));
  const dragOver = (over: DashWidget) => { if (dragging && dragging !== over) setDraft(d => moveWidget(d, d.widgets.findIndex(w => w.type === dragging), d.widgets.findIndex(w => w.type === over))); };
  const noop: Saver = async () => {};
  return <div className="hub-custom">
    <div className="hub-grid hub-grid-edit" onDragOver={ev => ev.preventDefault()}>
      {draft.widgets.map(w => <section key={w.type} className={`hub-card hub-w-${w.type}${dragging === w.type ? " dragging" : ""}`} style={{ gridColumn: `span ${dashSpan[w.size]}` }} aria-label={dashInfo[w.type].name}
        draggable onDragStart={ev => { ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", w.type); setDragging(w.type); }} onDragEnd={() => setDragging(null)}
        onDragEnter={() => dragOver(w.type)}>
        <div className="hub-edit-bar">
          <button className="hub-grip" aria-label={`Move ${dashInfo[w.type].name}. Use the arrow keys.`} onKeyDown={ev => {
            const by = ev.key === "ArrowUp" || ev.key === "ArrowLeft" ? -1 : ev.key === "ArrowDown" || ev.key === "ArrowRight" ? 1 : 0;
            if (by) { ev.preventDefault(); setDraft(d => moveWidget(d, d.widgets.findIndex(x => x.type === w.type), d.widgets.findIndex(x => x.type === w.type) + by)); }
          }}><GripVertical size={15} aria-hidden="true" /></button>
          <h2>{dashInfo[w.type].name}</h2>
          <div className="hub-sizes" role="radiogroup" aria-label={`Width of ${dashInfo[w.type].name}`}>{dashSizes.map(sz => <button key={sz} role="radio" aria-checked={w.size === sz} onClick={() => setDraft(d => resizeWidget(d, w.type, sz))}>{sz.toUpperCase()}</button>)}</div>
          <button className="hub-icon" aria-label={`Remove ${dashInfo[w.type].name}`} onClick={() => setDraft(d => toggleWidget(d, w.type, false))}><X size={15} /></button>
        </div>
        <div className="hub-edit-preview" inert><WidgetBody type={w.type} size={w.size} hub={hub} layout={draft} save={noop} saveFront={async () => {}} bare /></div>
      </section>)}
      {!draft.widgets.length && <p className="hub-muted hub-grid-empty">Turn widgets on in the panel to add them.</p>}
    </div>
    <aside className="hub-drawer" aria-label="Dashboard widgets">
      <h2>Dashboard widgets</h2>
      <p className="hub-muted">Only you see the dashboard. Drag widgets to arrange them, and pick S, M or L for their width.</p>
      <ul>{dashWidgets.map(t => { const on = draft.widgets.some(w => w.type === t); const Icon = icons[t]; return <li key={t}>
        <label><Icon size={16} aria-hidden="true" /><span><strong>{dashInfo[t].name}</strong><small>{dashInfo[t].hint}</small></span>
          <input type="checkbox" role="switch" checked={on} onChange={ev => { const on = ev.target.checked; setDraft(d => toggleWidget(d, t, on)); }} /></label>
      </li>; })}</ul>
      <button className="hub-text-button" onClick={() => setDraft(defaultDashboard({ threads: draft.threads, notes: draft.notes, links: draft.links }))}>Reset to the starting layout</button>
    </aside>
  </div>;
}

const icons: Record<DashWidget, typeof Flag> = {
  next: CalendarDays, quests: Flag, board: LayoutDashboard, scenes: MapIcon, party: User, recent: FileText,
  codex: BookMarked, threads: Check, date: CalendarDays, recap: ScrollText, notes: Pencil, links: Link2,
};

function Head({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="hub-card-head"><h2>{title}</h2>{children}</div>;
}
const typeClass = (t: string) => `hub-flag type-${t}`;

function WidgetBody({ type, size, hub, layout, save, saveFront, bare }: { type: DashWidget; size: "s" | "m" | "l"; hub: CampaignHub; layout: Dashboard; save: Saver; saveFront: (p: FrontPage) => Promise<void>; bare?: boolean }) {
  const { row } = hub, e = row.encyclopedia, m = row.maptable, name = dashInfo[type].name;
  const head = (link?: ReactNode) => bare ? null : <Head title={name}>{link}</Head>;
  const noNotes = <p className="hub-muted">Start Encyclopedia notes for this campaign on the <Link href="/campaigns">Campaigns page</Link>.</p>;
  switch (type) {
    case "next": return <>{head()}<NextSession hub={hub} saveFront={saveFront} showDate={!layout.widgets.some(w => w.type === "date")} bare={bare} /></>;
    case "date": return <>{head()}{hub.gameDate ? <><strong className="hub-big">{hub.gameDate.date}</strong><p className="hub-muted">{hub.gameDate.name}</p></>
      : <p className="hub-muted">{e ? <>No calendar yet. <a href={notesHref(e.id, "calendar")}>Add one</a></> : "No calendar yet."}</p>}</>;
    case "quests": {
      const active = hub.quests.filter(q => q.state === "active");
      return <>{head(e && <a href={notesHref(e.id, "quests")}>Quest board</a>)}
        {!e ? noNotes : active.length ? <ul className="hub-quests">{active.slice(0, size === "s" ? 3 : 5).map(q => <li key={q.id}><a href={entryHref(q.id)}>
          <Flag size={14} className={typeClass(q.type)} aria-hidden="true" />
          <span className="hub-quest-text"><strong>{q.title}</strong>{q.next && <small>Next: {q.next}</small>}
            {q.total > 0 && <span className="hub-progress" role="progressbar" aria-label={`${q.done} of ${q.total} steps`} aria-valuemin={0} aria-valuemax={q.total} aria-valuenow={q.done}><span className={`type-${q.type}`} style={{ width: `${(q.done / q.total) * 100}%` }} /></span>}</span>
          {q.total > 0 && <small className="hub-quest-count">{q.done} of {q.total} steps</small>}
        </a></li>)}</ul>
        : <p className="hub-muted">No active quests. <a href={notesHref(e.id, "quests")}>Open the quest board</a></p>}</>;
    }
    case "board": return <>{head(e && <a href={notesHref(e.id, "quests")}>Open the board</a>)}
      {!e ? noNotes : <div className="hub-board">{questStates.map(st => { const col = hub.quests.filter(q => q.state === st); return <div key={st}>
        <h3>{stateNames[st]} <span>{col.length}</span></h3>
        {col.slice(0, 4).map(q => <a key={q.id} href={entryHref(q.id)}><Flag size={12} className={typeClass(q.type)} aria-hidden="true" />{q.title}</a>)}
        {col.length > 4 && <small>{col.length - 4} more</small>}
      </div>; })}</div>}</>;
    case "scenes": return <>{head(m && <a href={mapsHref(m.id)}>{hub.scenes.length > 8 ? `All ${hub.scenes.length} scenes` : "Open Maptable"}</a>)}
      {!m ? <p className="hub-muted">No Maptable campaign yet. Add one on the <Link href="/campaigns">Campaigns page</Link>.</p>
        : hub.scenes.length ? <ul className="hub-scene-grid">{hub.scenes.slice(0, { s: 2, m: 4, l: 8 }[size]).map(s => <li key={s.id}><a href={`/maptable?scene=${encodeURIComponent(s.id)}`}>
          <span className="hub-scene-art" style={s.src ? { backgroundImage: `url("${s.src}")` } : undefined} aria-hidden="true">{!s.src && <MapIcon size={18} />}</span>
          <strong>{s.name}</strong><small>{s.mapType === "encounter" ? `Encounter · ${s.tokens} token${s.tokens === 1 ? "" : "s"}` : s.mapType === "world" ? "World map" : "Area map"}</small></a></li>)}</ul>
        : <p className="hub-muted">No scenes yet. <a href={mapsHref(m.id)}>Add the first map in Maptable</a>.</p>}</>;
    case "party": return <>{head(e && <a href={notesHref(e.id, "characters")}>Characters</a>)}
      {hub.party.length ? <ul className="hub-party">{hub.party.map(p => <PartyMember key={p.id} member={p} />)}</ul>
        : <p className="hub-muted">Mark characters as player characters or companions in the Encyclopedia and they show up here.</p>}</>;
    case "recent": return <>{head(e && <a href={notesHref(e.id)}>Notes</a>)}
      {hub.recent.length ? <ul className="hub-list">{hub.recent.map(p => <li key={p.id}><a href={entryHref(p.id)}>{p.kind === "character" ? <User size={15} aria-hidden="true" /> : <FileText size={15} aria-hidden="true" />}<span><strong>{p.title}</strong>{p.parent && <small>{p.parent}</small>}</span><time dateTime={p.updatedAt}>{when(p.updatedAt)}</time></a></li>)}</ul>
        : <p className="hub-muted">{e ? "No pages yet." : "No Encyclopedia notes yet."}</p>}</>;
    case "codex": return <>{head(e && <a href={notesHref(e.id, "codex")}>Open codex</a>)}
      {!e ? noNotes : hub.codex.length ? <ul className="hub-list">{hub.codex.slice(0, size === "s" ? 4 : 8).map(c => <li key={c.id}><a href={entryHref(c.id)}><BookMarked size={15} aria-hidden="true" /><span><strong>{c.title}</strong><small>{c.category}{c.foundAt ? isNewFind({ at: c.foundAt }) ? " · new" : "" : " · not found yet"}</small></span><time dateTime={c.at}>{when(c.at)}</time></a></li>)}</ul>
        : <p className="hub-muted">No codex entries yet. <a href={notesHref(e.id, "codex")}>Start the codex</a></p>}</>;
    case "threads": return <Threads layout={layout} save={save} head={head} />;
    case "recap": return <>{head(hub.lastSession && <a href={entryHref(hub.lastSession.id)}>Open</a>)}
      {hub.lastSession ? <><strong className="hub-recap-title">{hub.lastSession.title}</strong><p className="hub-muted">{hub.lastSession.excerpt || "This session page is empty."}</p></>
        : <p className="hub-muted">No session pages yet. Session pages you write in the Encyclopedia show up here.</p>}</>;
    case "notes": return <Notes layout={layout} save={save} head={head} />;
    case "links": return <Links layout={layout} save={save} head={head} />;
  }
}

function PartyMember({ member: p }: { member: CampaignHub["party"][number] }) {
  const { src } = usePictureSrc(p.picture?.imageId);
  return <li><a href={entryHref(p.id)}>
    {p.picture ? <PictureToken picture={p.picture} src={src} size={36} /> : <span className="hub-token-empty" aria-hidden="true"><User size={16} /></span>}
    <span><strong>{p.title}</strong><small>{[p.role === "pc" ? "Player character" : "Companion", p.group].filter(Boolean).join(" · ")}</small></span>
  </a></li>;
}

/** datetime-local wants "2026-11-18T19:00" in local time. */
const toLocal = (iso: string) => { const d = new Date(iso); if (!iso || Number.isNaN(d.getTime())) return ""; const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

/** The next session comes from the front page, so changing it here changes what players see too. */
function NextSession({ hub, saveFront, showDate, bare }: { hub: CampaignHub; saveFront: (p: FrontPage) => Promise<void>; showDate: boolean; bare?: boolean }) {
  const config = hub.frontConfig, widget = config?.widgets.find(w => w.type === "next");
  const next = widget?.type === "next" ? widget : null, time = next ? sessionTime(next.when) : null;
  const [editing, setEditing] = useState(false), [whenAt, setWhen] = useState(""), [where, setWhere] = useState("");
  function start() { setWhen(toLocal(next?.when ?? "")); setWhere(next?.where ?? ""); setEditing(true); }
  async function done() {
    if (!config) return;
    const value = { when: whenAt ? new Date(whenAt).toISOString() : "", where: where.trim() };
    const widgets = next ? config.widgets.map(w => w.type === "next" ? { ...w, ...value } : w) : [{ id: "next", type: "next" as const, ...value }, ...config.widgets];
    setEditing(false);
    await saveFront({ widgets });
  }
  return <>
    {editing ? <div className="hub-next-form">
      <label>Date and time<input type="datetime-local" value={whenAt} onChange={ev => setWhen(ev.target.value)} /></label>
      <label>Where<input maxLength={120} value={where} placeholder="On Discord" onChange={ev => setWhere(ev.target.value)} /></label>
      <div className="hub-row"><button className="hub-button hub-button-primary" onClick={() => void done()}>Save</button><button className="hub-button" onClick={() => setEditing(false)}>Cancel</button></div>
    </div> : <>
      {time ? <><strong className="hub-big">{time.label}</strong><p className="hub-muted">{[time.relative[0].toUpperCase() + time.relative.slice(1), next?.where].filter(Boolean).join(" · ")}</p></>
        : <p className="hub-muted">Not scheduled yet.</p>}
      {!bare && config && <div className="hub-row"><button className="hub-button" onClick={start}><CalendarDays size={14} aria-hidden="true" />{time ? "Change" : "Schedule it"}</button></div>}
      {!config && <p className="hub-muted">Start Encyclopedia notes to schedule sessions.</p>}
    </>}
    {showDate && hub.gameDate && <div className="hub-subblock"><h3>In the game</h3><p>{hub.gameDate.date}</p></div>}
  </>;
}

type Part = { layout: Dashboard; save: Saver; head: (link?: ReactNode) => ReactNode };
const newId = () => Math.random().toString(36).slice(2, 10);

function Threads({ layout, save, head }: Part) {
  const items = layout.threads ?? [], [adding, setAdding] = useState(false), [text, setText] = useState("");
  const set = (threads: NonNullable<Dashboard["threads"]>) => void save({ ...layout, threads });
  function add() { const t = text.trim(); if (t) set([...items, { id: newId(), text: t.slice(0, 200), done: false }]); setText(""); setAdding(false); }
  return <>{head(items.length < 50 && <button className="hub-text-button" onClick={() => setAdding(true)}>Add</button>)}
    {items.length ? <ul className="hub-threads">{items.map(t => <li key={t.id} className={t.done ? "done" : ""}>
      <label><input type="checkbox" checked={t.done} onChange={ev => set(items.map(x => x.id === t.id ? { ...x, done: ev.target.checked } : x))} /><span>{t.text}</span></label>
      <button className="hub-icon" aria-label={`Remove ${t.text}`} onClick={() => set(items.filter(x => x.id !== t.id))}><Trash2 size={14} /></button>
    </li>)}</ul> : !adding && <p className="hub-muted">Questions and promises to come back to. Only you see them.</p>}
    {adding && <form className="hub-inline-add" onSubmit={ev => { ev.preventDefault(); add(); }}>
      <input autoFocus maxLength={200} aria-label="New loose thread" placeholder="Who sent the letter?" value={text} onChange={ev => setText(ev.target.value)} onKeyDown={ev => { if (ev.key === "Escape") setAdding(false); }} />
      <button className="hub-button" type="submit"><Plus size={14} aria-hidden="true" />Add</button>
    </form>}
  </>;
}

function Notes({ layout, save, head }: Part) {
  const [text, setText] = useState(layout.notes ?? "");
  return <>{head()}<textarea className="hub-notes" rows={6} maxLength={4000} aria-label="GM notes" placeholder="Anything to keep in mind. Only you see this." value={text}
    onChange={ev => setText(ev.target.value)} onBlur={() => { if (text !== (layout.notes ?? "")) void save({ ...layout, notes: text }); }} /></>;
}

function Links({ layout, save, head }: Part) {
  const links = layout.links ?? [], [adding, setAdding] = useState(false), [label, setLabel] = useState(""), [url, setUrl] = useState("");
  const ok = label.trim() && /^https?:\/\/\S+$/i.test(url.trim());
  function add() { if (!ok) return; void save({ ...layout, links: [...links, { label: label.trim(), url: url.trim() }] }); setLabel(""); setUrl(""); setAdding(false); }
  return <>{head(links.length < 12 && <button className="hub-text-button" onClick={() => setAdding(true)}>Add</button>)}
    {links.length ? <ul className="hub-list">{links.map((l, i) => <li key={i} className="hub-link-row"><a href={l.url} target="_blank" rel="noreferrer"><Link2 size={15} aria-hidden="true" /><span>{l.label}</span><ArrowUpRight size={13} aria-hidden="true" /></a>
      <button className="hub-icon" aria-label={`Remove ${l.label}`} onClick={() => void save({ ...layout, links: links.filter((_, j) => j !== i) })}><Trash2 size={14} /></button></li>)}</ul>
      : !adding && <p className="hub-muted">Character sheets, music, your VTT. Only you see these.</p>}
    {adding && <form className="hub-inline-add hub-link-form" onSubmit={ev => { ev.preventDefault(); add(); }}>
      <input autoFocus maxLength={80} aria-label="Link label" placeholder="Label" value={label} onChange={ev => setLabel(ev.target.value)} />
      <input type="url" maxLength={500} aria-label="Web address" placeholder="https://" value={url} onChange={ev => setUrl(ev.target.value)} />
      <button className="hub-button" type="submit" disabled={!ok}><Plus size={14} aria-hidden="true" />Add</button>
    </form>}
  </>;
}

const addable: FrontWidgetType[] = ["next", "date", "party", "recap", "text", "links"];

function FrontEditor({ hub, campaignKey, done }: { hub: CampaignHub; campaignKey: string; done: (next?: CampaignHub) => void }) {
  const [page, setPage] = useState<FrontPage>(hub.frontConfig!), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [adding, setAdding] = useState<FrontWidgetType>("text");
  const shared = hub.calendars.filter(c => c.shared);
  const set = (widgets: FrontWidget[]) => setPage({ widgets });
  const patch = (i: number, w: Partial<FrontWidget>) => set(page.widgets.map((x, j) => j === i ? { ...x, ...w } as FrontWidget : x));
  const move = (i: number, by: number) => { const w = [...page.widgets], [item] = w.splice(i, 1); w.splice(i + by, 0, item); set(w); };
  function add() {
    let n = 1; while (page.widgets.some(w => w.id === `${adding}-${n}`)) n++;
    set([...page.widgets, newWidget(adding, `${adding}-${n}`, shared)]);
  }
  async function save() {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "frontPage", key: campaignKey, frontPage: page }) });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Could not save the front page.");
      done(body);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the front page."); } finally { setBusy(false); }
  }
  return <div className="hub-editor">
    <p className="hub-note"><Pencil size={15} aria-hidden="true" />Arrange what players see first. Only pages you share with players can appear here.</p>
    {page.widgets.map((w, i) => <section key={w.id} className="hub-card hub-edit-widget" aria-label={widgetNames[w.type]}>
      <div className="hub-edit-head">
        <strong>{widgetNames[w.type]}</strong>
        <label className="hub-check"><input type="checkbox" checked={!!w.wide} onChange={ev => patch(i, { wide: ev.target.checked })} />Wide</label>
        <button className="hub-icon" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={15} /></button>
        <button className="hub-icon" aria-label="Move down" disabled={i === page.widgets.length - 1} onClick={() => move(i, 1)}><ArrowDown size={15} /></button>
        <button className="hub-icon" aria-label={`Remove ${widgetNames[w.type]}`} onClick={() => set(page.widgets.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
      </div>
      <label>Heading<input maxLength={80} value={w.title ?? ""} placeholder={widgetNames[w.type]} onChange={ev => patch(i, { title: ev.target.value })} /></label>
      <Fields widget={w} hub={hub} update={next => patch(i, next)} />
    </section>)}
    <div className="hub-edit-add">
      <label>Add a widget<select value={adding} onChange={ev => setAdding(ev.target.value as FrontWidgetType)}>{addable.map(t => <option key={t} value={t}>{widgetNames[t]}</option>)}</select></label>
      <button className="hub-button" onClick={add} disabled={page.widgets.length >= 24}><Plus size={15} aria-hidden="true" />Add</button>
    </div>
    {error && <p className="hub-error" role="alert">{error}</p>}
    <div className="hub-edit-foot">
      <button className="hub-button" onClick={() => done()} disabled={busy}><X size={15} aria-hidden="true" />Cancel</button>
      <button className="hub-button hub-button-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save front page"}</button>
    </div>
  </div>;
}


function Fields({ widget: w, hub, update }: { widget: FrontWidget; hub: CampaignHub; update: (w: Partial<FrontWidget>) => void }) {
  switch (w.type) {
    case "next": return <div className="hub-edit-row">
      <label>Date and time<input type="datetime-local" value={toLocal(w.when)} onChange={ev => update({ when: ev.target.value ? new Date(ev.target.value).toISOString() : "" })} /></label>
      <label>Where<input maxLength={120} value={w.where} placeholder="On Discord" onChange={ev => update({ where: ev.target.value })} /></label>
    </div>;
    case "date": {
      const shared = hub.calendars.filter(c => c.shared);
      return shared.length ? <label>Calendar<select value={w.calendarId} onChange={ev => update({ calendarId: ev.target.value })}>{shared.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        : <p className="hub-muted">Share a calendar with players in the Encyclopedia to show today&apos;s date in the game.</p>;
    }
    case "party": return <p className="hub-muted">Shows player characters that players can see.</p>;
    case "recap": return <p className="hub-muted">Shows the newest session page that players can see.</p>;
    case "text": return <label>Text<textarea rows={5} maxLength={4000} value={w.body} placeholder="House rules, a welcome, or how to make a character." onChange={ev => update({ body: ev.target.value })} /></label>;
    case "links": return <div className="hub-links">
      {w.links.map((l, i) => <div className="hub-edit-row" key={i}>
        <label>Label<input maxLength={80} value={l.label} onChange={ev => update({ links: w.links.map((x, j) => j === i ? { ...x, label: ev.target.value } : x) })} /></label>
        <label>Goes to<select value={l.entryId ? `page:${l.entryId}` : "web"} onChange={ev => update({ links: w.links.map((x, j) => j === i ? (ev.target.value === "web" ? { label: x.label, url: x.url ?? "https://" } : { label: x.label, entryId: ev.target.value.slice(5) }) : x) })}>
          <option value="web">A web address</option>
          {hub.playerPages.map(p => <option key={p.id} value={`page:${p.id}`}>Page: {p.title}</option>)}
        </select></label>
        {!l.entryId && <label>Address<input type="url" maxLength={500} value={l.url ?? ""} onChange={ev => update({ links: w.links.map((x, j) => j === i ? { ...x, url: ev.target.value } : x) })} /></label>}
        <button className="hub-icon" aria-label="Remove link" onClick={() => update({ links: w.links.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
      </div>)}
      <button className="hub-text-button" disabled={w.links.length >= 12} onClick={() => update({ links: [...w.links, { label: "New link", url: "https://" }] })}><Plus size={14} aria-hidden="true" />Add a link</button>
    </div>;
  }
}
