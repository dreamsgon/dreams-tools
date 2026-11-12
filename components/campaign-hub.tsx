"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, BookOpen, Eye, FileText, LayoutDashboard, House, Map as MapIcon, Pencil, Plus, Trash2, User, X } from "lucide-react";
import type { CampaignHub } from "@/lib/campaigns-server";
import { newWidget, widgetNames, type FrontPage, type FrontWidget, type FrontWidgetType } from "@/lib/encyclopedia/front-page";
import { FrontPageView, sessionTime } from "./front-page-view";
import { when } from "./home-campaigns";
import { TagRow } from "./tags";
import { campaignTargets } from "@/lib/tags";
import "./campaign-hub.css";

type Tab = "dashboard" | "front";
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const notesHref = (id: string) => `/encyclopedia?campaign=${encodeURIComponent(id)}`;
const mapsHref = (id: string) => `/maptable?campaign=${encodeURIComponent(id)}`;
const entryHref = (id: string) => `/encyclopedia?entry=${encodeURIComponent(id)}`;

/** One campaign across both tools: a header, a Dashboard for the GM and the Front page players see. */
export default function CampaignHub({ campaignKey }: { campaignKey: string }) {
  const [hub, setHub] = useState<CampaignHub | null>(null), [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "front" ? "front" : "dashboard"), [editing, setEditing] = useState(false);
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
    setTab(next); setEditing(false);
    const url = new URL(window.location.href);
    if (next === "front") url.searchParams.set("tab", "front"); else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url);
  }

  if (error) return <div className="hub-message"><h1>Campaign unavailable</h1><p>{error}</p><Link href="/campaigns">Back to Campaigns</Link></div>;
  if (!hub) return <div className="hub-message"><p>Loading campaign…</p></div>;
  const { row } = hub, e = row.encyclopedia, m = row.maptable;
  return <div className="hub">
    <nav className="hub-crumbs" aria-label="Breadcrumb"><Link href="/campaigns">Campaigns</Link><span aria-hidden="true">/</span><span aria-current="page">{row.name}</span></nav>
    <div className="hub-head">
      <div className="hub-banner" aria-hidden="true" />
      <div className="hub-title">
        <p>Campaign{e?.worldName ? ` · ${e.worldName}` : ""}</p>
        <h1>{row.name}</h1>
        <TagRow className="hub-tags" targets={campaignTargets(row)} />
      </div>
    </div>
    <div className="hub-tabs">
      <div role="tablist" aria-label="Campaign">
        <button role="tab" aria-selected={tab === "dashboard"} onClick={() => choose("dashboard")}><LayoutDashboard size={16} aria-hidden="true" />Dashboard</button>
        <button role="tab" aria-selected={tab === "front"} onClick={() => choose("front")}><House size={16} aria-hidden="true" />Front page</button>
        {m && <a href={mapsHref(m.id)}><MapIcon size={16} aria-hidden="true" />Maps<ArrowUpRight size={13} aria-hidden="true" /></a>}
        {e && <a href={notesHref(e.id)}><BookOpen size={16} aria-hidden="true" />Notes<ArrowUpRight size={13} aria-hidden="true" /></a>}
      </div>
      {tab === "dashboard" && m && <a className="hub-button hub-button-primary" href={mapsHref(m.id)}><MapIcon size={15} aria-hidden="true" />Open in Maptable</a>}
      {tab === "front" && hub.frontConfig && !editing && <button className="hub-button" onClick={() => setEditing(true)}><Pencil size={14} aria-hidden="true" />Customize</button>}
    </div>
    <div className="hub-body" role="tabpanel">
      {tab === "dashboard" ? <Dashboard hub={hub} /> : !hub.front || !hub.frontConfig ? <NoNotes /> : editing
        ? <FrontEditor hub={hub} campaignKey={campaignKey} done={next => { if (next) setHub(next); setEditing(false); }} />
        : <><p className="hub-note"><Eye size={15} aria-hidden="true" />This is what players see first with their player link.</p><FrontPageView page={hub.front} href={entryHref} /></>}
    </div>
  </div>;
}

function NoNotes() {
  return <div className="hub-card hub-empty"><h2>No front page yet</h2><p>The front page lives in the Encyclopedia. Start notes for this campaign on the <Link href="/campaigns">Campaigns page</Link> to give it one.</p></div>;
}

function Dashboard({ hub }: { hub: CampaignHub }) {
  const { row } = hub, e = row.encyclopedia, m = row.maptable;
  const next = hub.front?.widgets.find(w => w.type === "next");
  const time = next?.type === "next" ? sessionTime(next.when) : null;
  return <div className="hub-dash">
    <section className="hub-card hub-scenes">
      <div className="hub-card-head"><h2>Scenes</h2>{m && <a href={mapsHref(m.id)}>{hub.scenes.length > 6 ? `All ${hub.scenes.length} scenes` : "Open Maptable"}</a>}</div>
      {!m ? <p className="hub-muted">No Maptable campaign yet. Add one on the <Link href="/campaigns">Campaigns page</Link>.</p>
        : hub.scenes.length ? <ul className="hub-scene-grid">{hub.scenes.slice(0, 6).map(s => <li key={s.id}><a href={`/maptable?scene=${encodeURIComponent(s.id)}`}><span className="hub-scene-art" aria-hidden="true"><MapIcon size={18} /></span>{s.name}</a></li>)}</ul>
        : <p className="hub-muted">No scenes yet. <a href={mapsHref(m.id)}>Add the first map in Maptable</a>.</p>}
    </section>
    <section className="hub-card">
      <div className="hub-card-head"><h2>Next session</h2></div>
      {time ? <><strong className="hub-big">{time.label}</strong><p className="hub-muted">{[time.relative, next?.type === "next" ? next.where : ""].filter(Boolean).join(" · ")}</p></>
        : <p className="hub-muted">Not scheduled. {e ? "Set it on the Front page with Customize." : ""}</p>}
    </section>
    <section className="hub-card">
      <div className="hub-card-head"><h2>Recently edited pages</h2>{e && <a href={notesHref(e.id)}>Notes</a>}</div>
      {hub.recent.length ? <ul className="hub-list">{hub.recent.map(p => <li key={p.id}><a href={entryHref(p.id)}>{p.kind === "character" ? <User size={15} aria-hidden="true" /> : <FileText size={15} aria-hidden="true" />}<span>{p.title}</span><time dateTime={p.updatedAt}>{when(p.updatedAt)}</time></a></li>)}</ul>
        : <p className="hub-muted">{e ? "No pages yet." : "No Encyclopedia notes yet."}</p>}
    </section>
    <section className="hub-card">
      <div className="hub-card-head"><h2>The party</h2></div>
      {hub.party.length ? <ul className="hub-list">{hub.party.map(p => <li key={p.id}><a href={entryHref(p.id)}><User size={15} aria-hidden="true" /><span>{p.title}</span></a></li>)}</ul>
        : <p className="hub-muted">Mark characters as player characters in the Encyclopedia and they show up here.</p>}
    </section>
    <section className="hub-card">
      <div className="hub-card-head"><h2>At a glance</h2></div>
      <ul className="hub-facts">
        <li><strong>{m ? plural(m.scenes, "scene") : "No maps"}</strong><span>Maptable</span></li>
        <li><strong>{e ? plural(e.pages, "page") : "No notes"}</strong><span>Encyclopedia</span></li>
        <li><strong>{e ? plural(e.characters, "character") : "—"}</strong><span>Characters</span></li>
      </ul>
      {e && <p className="hub-muted">Players get a read-only link from the Encyclopedia. <a href={notesHref(e.id)}>Manage player links</a></p>}
    </section>
  </div>;
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

/** datetime-local wants "2026-11-18T19:00" in local time. */
const toLocal = (iso: string) => { const d = new Date(iso); if (!iso || Number.isNaN(d.getTime())) return ""; const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

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
