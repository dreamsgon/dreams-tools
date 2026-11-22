"use client";
import { campaignHref } from "@/lib/campaign-slug";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, Users, Handshake, Shield, ListChecks, Bot, BookMarked, CalendarDays, Check, Copy, Dices, Eye, FileText, Flag, GripVertical, LayoutDashboard, House, Link2, Map as MapIcon, MessageSquare, Palette, Pencil, Plus, ScrollText, Sparkles, Swords, Settings, Trash2, User, X } from "lucide-react";
import type { CampaignHub } from "@/lib/campaigns-server";
import { useCampaignOpened } from "@/lib/opened-campaign";
import { newWidget, widgetNames, type FrontPage, type FrontWidget, type FrontWidgetType } from "@/lib/encyclopedia/front-page";
import { dashHeights, dashInfo, dashSizes, dashSpan, dashWidgets, defaultDashboard, missingHalf, moveWidget, pickedFrom, pickWidgets, resizeWidget, setHeight, setPicked, startsIn, toggleWidget, type Dashboard, type DashWidget, type Halves, type PickWidget } from "@/lib/encyclopedia/dashboard";
import { stateNames, questStates } from "@/lib/encyclopedia/quests";
import { isNewFind } from "@/lib/encyclopedia/codex";
import { lookAttributes } from "@/lib/encyclopedia/look";
import { FrontPageView, sessionTime } from "./front-page-view";
import { useWriters } from "./encyclopedia/use-writers";
import { allStyles, isBuiltIn, styleFor, styleSummary } from "@/lib/encyclopedia/ai-styles";
import { when } from "./home-shared";
import { RollPanel } from "./roll-widget";
import { TagRow } from "./tags";
import { LookFont, useHeroPicture } from "./encyclopedia/look-section";
import { PictureToken, usePictureSrc } from "./encyclopedia/character-picture";
import { tokenPicture } from "@/lib/encyclopedia/picture";
import { campaignTargets } from "@/lib/tags";
import type { MembersView } from "./campaign-members";
import { BackupsButton } from "./rp-backups-button";
import { CampaignDetails } from "./campaigns-app";
import type { CampaignSummary } from "@/lib/campaign-links";
import "./campaign-hub.css";
import { usePageTitle } from "./use-page-title";
import { useDiceTarget } from "./use-dice-target";
import { openAi, type ChatMeta } from "@/lib/ai/chat-text";
import { hubDiceTarget, NO_CAMPAIGN } from "@/lib/dice-target";
import { campaignTitle } from "@/lib/page-title";
import { hubLinks } from "@/lib/campaign-hub-links";
import CampaignBar from "./campaign-bar";
import { addToolParam, toolNames, type CampaignTool } from "@/lib/campaign-nav";
import { useCampaignSkin } from "./campaign-skin";
import { openThemeEditor, useThemeDock } from "./campaign-theme-dock";
import { BANNER_CHANGED } from "./campaign-theme-entry";
import { ForumSetupDialog } from "./forum-setup-dialog";
import type { ForumSetup } from "@/lib/forum/setup";
import { keyFields } from "@/lib/ai/device-keys";

// The Members tab (owners only) loads when it is opened.
const CampaignMembers = dynamic(() => import("./campaign-members"));

type Tab = "dashboard" | "front" | "members" | "settings";
const tabParam = (): Tab => { const t = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("tab"); return t === "front" || t === "members" || t === "settings" ? t : "dashboard"; };
type AddTool = Exclude<CampaignTool, "dashboard">;
const addParam = (): AddTool | null => typeof window === "undefined" ? null : addToolParam(new URLSearchParams(window.location.search).get("add"));
const post = async (body: object, failed: string): Promise<CampaignHub> => {
  const r = await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = await r.json();
  if (!r.ok) throw new Error(out.error || failed);
  return out;
};

/** One campaign across both tools: a header, a Dashboard for the GM and the Front page players see. */
export default function CampaignHub({ campaignKey }: { campaignKey: string }) {
  const [hub, setHub] = useState<CampaignHub | null>(null), [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>(tabParam), [editing, setEditing] = useState(false);
  // ?add=maptable|encyclopedia|forum (the campaign bar's "+ Maptable"): a one-line notice with the Add button.
  const [notice, setNotice] = useState<AddTool | null>(null);
  usePageTitle(hub ? campaignTitle(hub.row.name) : "");
  // The campaign's live theme (lib/campaign-theme) themes the dashboard below the site header, in place of its look.
  // A theme belongs to the campaign's Encyclopedia campaign; Theme opens the Admin CP beside the dashboard.
  const skinKey = hub ? (hub.row.encyclopedia ? `c-${hub.row.encyclopedia.id}` : null) : error ? null : undefined, themeDock = useThemeDock(skinKey, "dashboard", true);
  const skin = useCampaignSkin(skinKey, "dashboard", undefined, themeDock.editing);
  // The campaign's banner picture fills the header, in place of a theme's drawn art.
  const hero = useHeroPicture(hub?.look ?? undefined);
  useDiceTarget(hub ? hubDiceTarget(hub.row) : NO_CAMPAIGN);
  useCampaignOpened(hub?.row.key ?? null);
  const [members, setMembers] = useState<MembersView | null>(null), [membersError, setMembersError] = useState("");
  const [draft, setDraft] = useState<Dashboard | null>(null), [saveError, setSaveError] = useState("");
  const saves = useRef(0), [reads, setReads] = useState(0);
  // The Admin CP changed the banner picture: read the campaign again.
  useEffect(() => { const again = () => setReads(n => n + 1); window.addEventListener(BANNER_CHANGED, again); return () => window.removeEventListener(BANNER_CHANGED, again); }, []);
  // After the first load the campaign is read by its id key, which never changes, so a new web address set in Settings still finds it.
  const idKey = useRef(campaignKey);
  useEffect(() => {
    let live = true;
    fetch(`/api/campaigns?hub=${encodeURIComponent(idKey.current)}`, { cache: "no-store" }).then(async r => {
      const body = await r.json();
      if (!r.ok) throw new Error(body.error === "Campaign not found" ? "This campaign no longer exists. It may have been renamed or removed." : body.error || "Could not load this campaign.");
      if (!live) return;
      setHub(body); idKey.current = body.row.key;
      // Maptable links here by its own campaign id (m:<id>), and old links use the id key: the address then shows the
      // campaign's own web address (its slug, lib/campaign-slug.ts) or its usual key.
      const canonical = campaignHref(body.row);
      if (window.location.pathname !== canonical) window.history.replaceState(window.history.state, "", canonical + window.location.search + window.location.hash);
    }).catch(e => live && setError(e instanceof Error ? e.message : "Could not load this campaign."));
    return () => { live = false; };
  }, [campaignKey, reads]);
  // Members belong to the campaign's notes, so a Maptable-only campaign has none.
  const notesId = hub?.row.encyclopedia?.id;
  useEffect(() => {
    if (!notesId) return;
    let live = true;
    fetch(`/api/members?campaignId=${encodeURIComponent(notesId)}`, { cache: "no-store" }).then(async r => {
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Could not load the members.");
      if (live) setMembers(body);
    }).catch(e => live && setMembersError(e instanceof Error ? e.message : "Could not load the members."));
    return () => { live = false; };
  }, [notesId]);
  // On a phone the tabs scroll sideways: keep the open one in view (Settings is last and starts off screen).
  useEffect(() => {
    const on = document.querySelector<HTMLElement>('.hub-tabs [role="tablist"] [aria-selected="true"]'), list = on?.parentElement;
    if (!on || !list || list.scrollWidth <= list.clientWidth) return;
    const a = on.getBoundingClientRect(), box = list.getBoundingClientRect();
    if (a.right > box.right) list.scrollLeft += a.right - box.right; else if (a.left < box.left) list.scrollLeft -= box.left - a.left;
  }, [tab, hub, members]);
  function choose(next: Tab) {
    setTab(next); setEditing(false); setDraft(null);
    const url = new URL(window.location.href);
    if (next !== "dashboard") url.searchParams.set("tab", next); else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url);
  }
  /** Shows the change at once, then saves it. Only the newest save's answer is kept. */
  async function save(dashboard: Dashboard) {
    const n = ++saves.current;
    setHub(h => h && { ...h, dashboard }); setSaveError("");
    try { const next = await post({ action: "dashboard", key: campaignKey, dashboard }, "Could not save the dashboard."); if (n === saves.current) setHub(next); }
    catch (e) { if (n === saves.current) setSaveError(e instanceof Error ? e.message : "Could not save the dashboard."); }
  }
  /** Add Maptable: makes this campaign's Maptable half right here, then shows the dashboard again with it. */
  const [adding, setAdding] = useState(false);
  async function addMaps(): Promise<boolean> {
    const id = hub?.row.encyclopedia?.id;
    if (!id) return false;
    setAdding(true); setSaveError("");
    try {
      await post({ action: "complete", encyclopediaId: id }, "Could not add Maptable.");
      const r = await fetch(`/api/campaigns?hub=${encodeURIComponent(campaignKey)}`, { cache: "no-store" }), body = await r.json();
      if (!r.ok) throw new Error(body.error || "Could not load this campaign.");
      setHub(body);
      return true;
    } catch (e) { setSaveError(e instanceof Error ? e.message : "Could not add Maptable."); return false; }
    finally { setAdding(false); }
  }
  /** Set up forum: forums start switched off, so the GM chooses how this campaign's starts, confirms, then it opens. */
  const [forumDialog, setForumDialog] = useState(false), [settingUp, setSettingUp] = useState(false), [forumError, setForumError] = useState("");
  async function setUpForum(setup: ForumSetup) {
    const id = hub?.row.encyclopedia?.id;
    if (!id) return;
    setSettingUp(true); setForumError("");
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- other tools open as full pages (AGENTS.md)
    try { await post({ action: "forum", encyclopediaId: id, setup }, "Could not set up the forum."); window.location.assign(`/forum#c-${encodeURIComponent(id)}`); }
    catch (e) { setForumError(e instanceof Error ? e.message : "Could not set up the forum."); setSettingUp(false); }
  }
  // ?forum=setup (the forum's "Set up the forum") opens the setup dialog; ?add=<tool> shows the notice. Both are read once, after the campaign loads.
  const askedParams = useRef(false);
  useEffect(() => {
    if (!hub || askedParams.current) return;
    askedParams.current = true;
    const params = new URLSearchParams(window.location.search), add = addToolParam(params.get("add")), setup = params.get("forum") === "setup";
    if (!add && !setup) return;
    const e = hub.row.encyclopedia, has = { maptable: !!hub.row.maptable, encyclopedia: !!e, forum: !!e?.forum };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opens once, after the campaign loads
    if (setup && e && !e.forum) { setForumDialog(true); params.delete("forum"); }
    else if (add && !has[add]) setNotice(add);
    else if (add) params.delete("add");
    const url = new URL(window.location.href);
    url.search = params.toString() ? `?${params}` : "";
    if (setup) url.searchParams.delete("forum");
    window.history.replaceState(window.history.state, "", url);
  }, [hub]);
  function dismissNotice() {
    setNotice(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("add");
    window.history.replaceState(window.history.state, "", url);
  }
  /** Solo play: just the GM, with an oracle or an AI (lib/solo.ts). */
  const [soloBusy, setSoloBusy] = useState(false);
  async function setSolo(on: boolean) {
    const id = hub?.row.encyclopedia?.id;
    if (!id) return;
    setSoloBusy(true); setSaveError("");
    try {
      await post({ action: "solo", encyclopediaId: id, on }, "Could not change solo play.");
      setHub(h => h && h.row.encyclopedia ? { ...h, row: { ...h.row, encyclopedia: { ...h.row.encyclopedia, solo: on } } } : h);
    } catch (err) { setSaveError(err instanceof Error ? err.message : "Could not change solo play."); }
    finally { setSoloBusy(false); }
  }
  async function saveFront(frontPage: FrontPage) {
    setSaveError("");
    try { setHub(await post({ action: "frontPage", key: campaignKey, frontPage }, "Could not save the next session.")); }
    catch (e) { setSaveError(e instanceof Error ? e.message : "Could not save the next session."); }
  }

  const L = hub ? hubLinks(hub.row) : null;
  // The campaign bar (the same on every page in a campaign) sits above the page and outside the campaign's skin.
  const bar = <CampaignBar tool="dashboard" campaign={{ key: campaignKey }} name={hub?.row.name} />;
  if (error) return <>{bar}<main className="rpg-hub"><div className="hub-message"><h1>Campaign unavailable</h1><p>{error}</p><Link href="/campaigns">Back to Campaigns</Link></div></main></>;
  if (!hub || !L) return <>{bar}<main className="rpg-hub"><div className="hub-message"><p>Loading campaign…</p></div></main></>;
  const { row } = hub, e = row.encyclopedia, m = row.maptable, look = hub.look ?? undefined;
  // The campaign's accent and heading font carry over from its look. Its page surface stays in the Encyclopedia.
  const attrs = lookAttributes(look);
  const halves: Halves = { maps: !!m, notes: !!e };
  const layout = hub.dashboard ?? defaultDashboard({}, halves);
  return <>{bar}<main className="rpg-hub"><div className={`hub-skin ${skin.className}`}>{skin.nodes}{themeDock.node}<div className={`hub${draft ? " hub-customizing" : ""}`} data-look-accent={skin.on ? undefined : attrs["data-look-accent"]} style={skin.on ? undefined : attrs.style as CSSProperties}>
    {!skin.on && <LookFont look={look} />}
    {notice && <AddNotice tool={notice} name={row.name} busy={adding} dismiss={dismissNotice} add={() => {
      if (notice === "maptable") void addMaps().then(ok => { if (ok) dismissNotice(); });
      else if (notice === "forum") { setForumError(""); setForumDialog(true); }
      else window.location.assign(L.startNotes);
    }} />}
    <div ref={hero.ref} className={`hub-head ${hero.className}`} style={hero.style}>
      <div className="hub-title">
        <p className="hub-kicker">Campaign{e?.worldName ? ` · ${e.worldName}` : ""}</p>
        <h1>{row.name}</h1>
        {e?.solo && <div className="hub-chips"><span className="hub-chip on" title="Solo play: just you, with an oracle or an AI. You keep every GM power and play the player characters.">✓ Solo</span></div>}
        <TagRow className="hub-tags" targets={campaignTargets(row)} />
      </div>
      <div className="hub-actions">
        {draft ? <button className="hub-button hub-button-primary" onClick={() => { void save(draft); setDraft(null); }}><Check size={15} aria-hidden="true" />Done</button> : <>
          {tab === "dashboard" && <button className="hub-button" onClick={() => setDraft(layout)}><Pencil size={14} aria-hidden="true" />Customize</button>}
          {tab === "front" && hub.frontConfig && !editing && <button className="hub-button" onClick={() => setEditing(true)}><Pencil size={14} aria-hidden="true" />Customize</button>}
          {e && <button className="hub-button" data-opens-admin-cp title="The campaign theme: colours, fonts and a stylesheet for every part of the campaign" onClick={openThemeEditor}><Palette size={15} aria-hidden="true" />Theme</button>}
          {e && <BackupsButton campaignId={e.id} campaignName={row.name} />}
        </>}
      </div>
    </div>
    <div className="hub-tabs">
      <div role="tablist" aria-label="Campaign">
        <button role="tab" aria-selected={tab === "dashboard"} onClick={() => choose("dashboard")}><LayoutDashboard size={16} aria-hidden="true" />Prep</button>
        <button role="tab" aria-selected={tab === "front"} onClick={() => choose("front")}><House size={16} aria-hidden="true" />Front page</button>
        {e && <button role="tab" aria-selected={tab === "members"} onClick={() => choose("members")}><Users size={16} aria-hidden="true" />Members{members && <span className={`mem-count${members.requests.length ? " mem-count-warn" : ""}`} title={members.requests.length ? `${members.requests.length} asking to join` : undefined}>{members.requests.length ? members.requests.length : members.members.length + 1}</span>}</button>}
        <button role="tab" aria-selected={tab === "settings"} onClick={() => choose("settings")}><Settings size={16} aria-hidden="true" />Settings</button>
      </div>
    </div>
    {saveError && <p className="hub-error" role="alert">{saveError}</p>}
    <div className="hub-body" role="tabpanel">
      {tab === "settings" ? <HubSettings row={row} reload={() => setReads(n => n + 1)} />
        : tab === "members" ? !e ? <NoNotes href={L.startNotes} /> : members ? <><SoloCard on={e.solo} busy={soloBusy} setOn={on => void setSolo(on)} /><CampaignMembers campaignId={e.id} view={members} setView={setMembers} /></>
        : <p className={membersError ? "hub-error" : "hub-muted"}>{membersError || "Loading members…"}</p>
        : tab === "dashboard" ? draft
        ? <Customize hub={hub} draft={draft} setDraft={setDraft} halves={halves} />
        : <DashboardView hub={hub} layout={layout} save={save} saveFront={saveFront} customize={() => setDraft(layout)} />
        : !hub.front || !hub.frontConfig ? <NoNotes href={L.startNotes} /> : editing
        ? <FrontEditor hub={hub} campaignKey={campaignKey} done={next => { if (next) setHub(next); setEditing(false); }} />
        : <><p className="hub-note"><Eye size={15} aria-hidden="true" />This is what players see first with their player link.</p><FrontPageView page={hub.front} href={L.entry} /></>}
    </div>
    {forumDialog && <ForumSetupDialog campaignName={row.name} busy={settingUp} error={forumError} close={() => setForumDialog(false)} onConfirm={setup => void setUpForum(setup)} />}
  </div></div></main></>;
}

/** The one quiet line at the top when the campaign bar sent you here for a place the campaign lacks. */
function AddNotice({ tool, name, busy, add, dismiss }: { tool: AddTool; name: string; busy: boolean; add: () => void; dismiss: () => void }) {
  const place = toolNames[tool];
  return <div className="hub-notice" role="status">
    <span>{name} has no {place} yet.</span>
    <button className="hub-button hub-button-primary" disabled={busy} onClick={add}><Plus size={14} aria-hidden="true" />{busy ? `Adding ${place}…` : `Add ${place}`}</button>
    <button className="hub-icon" aria-label="Dismiss" onClick={dismiss}><X size={15} aria-hidden="true" /></button>
  </div>;
}

/** Members tab: solo play on or off. */
/** The Settings tab: the same settings as the campaign's details on the Campaigns page. Each change reads the campaign again. */
function HubSettings({ row, reload }: { row: CampaignHub["row"]; reload: () => void }) {
  const [summary, setSummary] = useState<CampaignSummary | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/campaigns", { cache: "no-store" }).then(async r => {
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Could not load the settings.");
      if (live) setSummary(body);
    }).catch(e => live && setError(e instanceof Error ? e.message : "Could not load the settings."));
    return () => { live = false; };
  }, []);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(""), 4000); return () => clearTimeout(t); }, [notice]);
  async function send(body: object, done?: string, after?: (next: CampaignSummary) => void) {
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const next = await r.json();
      if (!r.ok) throw new Error(next.error || "Could not save.");
      setSummary(next); if (done) setNotice(done); after?.(next); reload();
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); return false; }
    finally { setBusy(false); }
  }
  // The newest copy of this campaign from the list, found by either of its id keys (pairing can change which one it has).
  const current = summary?.rows.find(r => r.key === row.key || (row.encyclopedia && r.encyclopedia?.id === row.encyclopedia.id) || (row.maptable && r.maptable?.id === row.maptable.id));
  return <div className="campaigns-page hub-settings">
    {error && <p className="hub-error" role="alert">{error}</p>}
    {notice && <p className="hub-note" role="status"><Check size={15} aria-hidden="true" />{notice}</p>}
    {!summary ? !error && <p className="hub-muted">Loading settings…</p>
      : current ? <CampaignDetails key={current.key} row={current} summary={summary} busy={busy} error={error} send={send} embedded
          onDeleted={() => window.location.assign("/campaigns")} />
      : <p className="hub-muted">This campaign is no longer on your list.</p>}
  </div>;
}

function SoloCard({ on, busy, setOn }: { on: boolean; busy: boolean; setOn: (on: boolean) => void }) {
  return <div className={`hub-card hub-solo${on ? " on" : ""}`}>
    <label><input type="checkbox" checked={on} disabled={busy} onChange={ev => setOn(ev.target.checked)} /><b>Solo play</b></label>
    <p>{on
      ? "Just you, with an oracle or an AI. You keep every GM power, the player characters and companions are yours to play, and the forum has a Player view for writing your character posts."
      : "Playing alone, with an oracle or an AI? Turn this on to play the player characters yourself while keeping every GM power. The forum then gets a Player view for your character posts."}</p>
  </div>;
}

function NoNotes({ href }: { href: string }) {
  return <div className="hub-card hub-empty"><h2>No front page yet</h2><p>The front page lives in the Wiki. <a href={href}>Add Wiki for this campaign</a> to give it one.</p></div>;
}

type Saver = (d: Dashboard) => Promise<void>;

function DashboardView({ hub, layout, save, saveFront, customize }: { hub: CampaignHub; layout: Dashboard; save: Saver; saveFront: (p: FrontPage) => Promise<void>; customize?: () => void }) {
  if (!layout.widgets.length) return <div className="hub-card hub-empty"><h2>Nothing on the dashboard</h2><p>{customize ? <>Choose what to show with <button className="hub-text-button" onClick={customize}>Customize</button>.</> : "Choose what to show with Customize."}</p></div>;
  return <div className="hub-grid">
    {layout.widgets.map(w => <section key={w.type} className={`hub-card hub-w-${w.type}${w.h ? ` hub-h${w.h}` : ""}`} style={{ gridColumn: `span ${dashSpan[w.size]}`, ...(w.h ? { gridRow: `span ${w.h}` } : {}) }} aria-label={dashInfo[w.type].name}>
      <WidgetBody type={w.type} size={w.size} h={w.h ?? 1} hub={hub} layout={layout} save={save} saveFront={saveFront} />
    </section>)}
  </div>;
}

/** Customize: drag widgets (or use the arrow keys on the handle), pick a width, and choose widgets in the side panel. */
function Customize({ hub, draft, setDraft: replace, halves }: { hub: CampaignHub; draft: Dashboard; setDraft: (d: (current: Dashboard | null) => Dashboard | null) => void; halves: Halves }) {
  const [dragging, setDragging] = useState<DashWidget | null>(null), [choosing, setChoosing] = useState<PickWidget | null>(null);
  // Always change the newest layout: drag events can come faster than React renders.
  const setDraft = (next: Dashboard | ((d: Dashboard) => Dashboard)) => replace(d => d && (typeof next === "function" ? next(d) : next));
  const dragOver = (over: DashWidget) => { if (dragging && dragging !== over) setDraft(d => moveWidget(d, d.widgets.findIndex(w => w.type === dragging), d.widgets.findIndex(w => w.type === over))); };
  const noop: Saver = async () => {};
  return <div className="hub-custom">
    <div className="hub-grid hub-grid-edit" onDragOver={ev => ev.preventDefault()}>
      {draft.widgets.map((w, i) => <section key={w.type} className={`hub-card hub-w-${w.type}${w.h ? ` hub-h${w.h}` : ""}${dragging === w.type ? " dragging" : ""}`} style={{ gridColumn: `span ${dashSpan[w.size]}`, ...(w.h ? { gridRow: `span ${w.h}` } : {}) }} aria-label={dashInfo[w.type].name}
        draggable onDragStart={ev => { ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", w.type); setDragging(w.type); }} onDragEnd={() => setDragging(null)}
        onDragEnter={() => dragOver(w.type)}>
        <div className="hub-edit-bar">
          <button className="hub-grip" aria-label={`Move ${dashInfo[w.type].name}. Use the arrow keys.`} onKeyDown={ev => {
            const by = ev.key === "ArrowUp" || ev.key === "ArrowLeft" ? -1 : ev.key === "ArrowDown" || ev.key === "ArrowRight" ? 1 : 0;
            if (by) { ev.preventDefault(); setDraft(d => moveWidget(d, d.widgets.findIndex(x => x.type === w.type), d.widgets.findIndex(x => x.type === w.type) + by)); }
          }}><GripVertical size={15} aria-hidden="true" /></button>
          <h2>{dashInfo[w.type].name}</h2>
          <button className="hub-icon" aria-label={`Move ${dashInfo[w.type].name} up`} disabled={i === 0} onClick={() => setDraft(d => moveWidget(d, i, i - 1))}><ArrowUp size={15} aria-hidden="true" /></button>
          <button className="hub-icon" aria-label={`Move ${dashInfo[w.type].name} down`} disabled={i === draft.widgets.length - 1} onClick={() => setDraft(d => moveWidget(d, i, i + 1))}><ArrowDown size={15} aria-hidden="true" /></button>
          <div className="hub-sizes" role="radiogroup" aria-label={`Width of ${dashInfo[w.type].name}`}>{dashSizes.map(sz => <button key={sz} role="radio" aria-checked={w.size === sz} onClick={() => setDraft(d => resizeWidget(d, w.type, sz))}>{sz.toUpperCase()}</button>)}</div>
          <div className="hub-sizes hub-heights" role="radiogroup" aria-label="Height">{dashHeights.map(n => <button key={n} role="radio" aria-checked={(w.h ?? 1) === n} aria-label={`${n} ${n === 1 ? "row" : "rows"}`} title={`${n} ${n === 1 ? "row" : "rows"} tall`} onClick={() => setDraft(d => setHeight(d, w.type, n))}>{"▮".repeat(n)}</button>)}</div>
          {isPick(w.type) && <button className="hub-icon" aria-label={`Choose who ${dashInfo[w.type].name} shows`} title="Choose who it shows" aria-expanded={choosing === w.type} onClick={() => setChoosing(choosing === w.type ? null : w.type as PickWidget)}><ListChecks size={15} aria-hidden="true" /></button>}
          <button className="hub-icon" aria-label={`Remove ${dashInfo[w.type].name}`} onClick={() => setDraft(d => toggleWidget(d, w.type, false))}><X size={15} /></button>
        </div>
        {choosing === w.type && isPick(w.type) && <ChooseList kind={w.type} hub={hub} draft={draft} setDraft={setDraft} />}
        <div className="hub-edit-preview" inert><WidgetBody type={w.type} size={w.size} h={w.h ?? 1} hub={hub} layout={draft} save={noop} saveFront={async () => {}} bare /></div>
      </section>)}
      {!draft.widgets.length && <p className="hub-muted hub-grid-empty">Turn widgets on in the panel to add them.</p>}
    </div>
    <aside className="hub-drawer" aria-label="Dashboard widgets">
      <h2>Dashboard widgets</h2>
      <p className="hub-muted">Only you see the dashboard. Drag widgets to arrange them, or use the arrows. S, M and L set the width; ▮ ▮▮ ▮▮▮ make a widget 1, 2 or 3 rows tall, so it runs down the side.</p>
      <ul>{dashWidgets.map(t => { const on = draft.widgets.some(w => w.type === t); const Icon = icons[t], lacks = missingHalf(t, halves); return <li key={t}>
        <label><Icon size={16} aria-hidden="true" /><span><strong>{dashInfo[t].name}</strong><small>{lacks ? `Needs ${lacks === "maps" ? "Maptable" : "Wiki"} (none yet)` : dashInfo[t].hint}</small></span>
          <input type="checkbox" role="switch" checked={on} onChange={ev => { const on = ev.target.checked; setDraft(d => toggleWidget(d, t, on)); }} /></label>
      </li>; })}</ul>
      <button className="hub-text-button" onClick={() => setDraft(defaultDashboard({ threads: draft.threads, notes: draft.notes, links: draft.links }, halves))}>Reset to the starting layout</button>
      <p className="hub-muted hub-drawer-note">Your links, threads and notes are kept.</p>
    </aside>
  </div>;
}

const isPick = (t: DashWidget): t is PickWidget => (pickWidgets as readonly string[]).includes(t);
/** Customize: tick who a list shows. Ticks that match how the list starts aren't saved, so new player characters still show up by themselves. */
function ChooseList({ kind, hub, draft, setDraft }: { kind: PickWidget; hub: CampaignHub; draft: Dashboard; setDraft: (f: (d: Dashboard) => Dashboard) => void }) {
  const [find, setFind] = useState("");
  const all: { id: string; title: string; role?: string; type?: string }[] = kind === "factions" ? hub.factions : hub.people;
  const shown = new Set(pickedFrom(kind, all, draft).map(x => x.id)), q = find.trim().toLowerCase();
  const list = all.filter(x => !q || x.title.toLowerCase().includes(q))
    .sort((a, b) => Number(!shown.has(a.id)) - Number(!shown.has(b.id)) || Number(!startsIn(kind, a as { id: string; role: string }, draft)) - Number(!startsIn(kind, b as { id: string; role: string }, draft)) || a.title.localeCompare(b.title));
  return <div className="hub-choose">
    <p className="hub-muted">{kind === "factions" ? "Every faction shows at first. Untick the ones to leave out." : kind === "party" ? `Player characters${draft.widgets.some(w => w.type === "companions") ? "" : " and companions"} show at first. Tick anyone else to add them.` : "Companions show at first. Tick anyone else to add them."}</p>
    {all.length > 8 && <input className="hub-choose-find" value={find} placeholder={kind === "factions" ? "Find a faction" : "Find a character"} aria-label="Find" onChange={ev => setFind(ev.target.value)} />}
    {all.length ? <ul>{list.slice(0, 60).map(x => <li key={x.id}><label><input type="checkbox" checked={shown.has(x.id)} onChange={ev => { const on = ev.target.checked; setDraft(d => setPicked(d, kind, { id: x.id, role: x.role ?? "" }, on)); }} /><span>{x.title}</span><small>{kind === "factions" ? x.type : roleNames[x.role ?? ""] ?? ""}</small></label></li>)}</ul>
      : <p className="hub-muted">{kind === "factions" ? "No organizations in this campaign yet." : "No characters in this campaign yet."}</p>}
    {list.length > 60 && <p className="hub-muted">{list.length - 60} more. Find one by name.</p>}
  </div>;
}

const icons: Record<DashWidget, typeof Flag> = {
  next: CalendarDays, quests: Flag, board: LayoutDashboard, scenes: MapIcon, initiative: Swords, party: User, companions: Handshake, factions: Shield, recent: FileText,
  codex: BookMarked, threads: Check, date: CalendarDays, recap: ScrollText, roll: Dices, ai: Bot, notes: Pencil, links: Link2,
};

function Head({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="hub-card-head"><h2>{title}</h2>{children}</div>;
}
const typeClass = (t: string) => `hub-flag type-${t}`;

function WidgetBody({ type, size, h = 1, hub, layout, save, saveFront, bare }: { type: DashWidget; size: "s" | "m" | "l"; h?: number; hub: CampaignHub; layout: Dashboard; save: Saver; saveFront: (p: FrontPage) => Promise<void>; bare?: boolean }) {
  const { row } = hub, e = row.encyclopedia, m = row.maptable, name = dashInfo[type].name, L = hubLinks(row);
  const head = (link?: ReactNode) => bare ? null : <Head title={name}>{link}</Head>;
  const noNotes = <p className="hub-muted">No Wiki yet. <a href={L.startNotes}>Add Wiki for this campaign</a>.</p>;
  // A widget that needs the half this campaign lacks says so, with the way to add it.
  const lacks = missingHalf(type, { maps: !!m, notes: !!e });
  if (lacks) return <>{head()}<p className="hub-muted">{lacks === "maps" ? <>No Maptable yet. <a href="?add=maptable">Add Maptable</a></> : <>No Wiki yet. <a href={L.startNotes}>Add Wiki</a></>}</p></>;
  switch (type) {
    case "next": return <>{head()}<NextSession hub={hub} saveFront={saveFront} showDate={!layout.widgets.some(w => w.type === "date")} bare={bare} /></>;
    case "date": return <>{head()}{hub.gameDate ? <><strong className="hub-big">{hub.gameDate.date}</strong><p className="hub-muted">{hub.gameDate.name}</p></>
      : <p className="hub-muted">{e ? <>No calendar yet. <a href={L.notes("calendar")!}>Add one</a></> : "No calendar yet."}</p>}</>;
    case "quests": {
      const active = hub.quests.filter(q => q.state === "active");
      return <>{head(e && <a href={L.notes("quests")!}>Quest board</a>)}
        {!e ? noNotes : active.length ? <ul className="hub-quests">{active.slice(0, (size === "s" ? 3 : 5) + (h - 1) * 4).map(q => <li key={q.id}><a href={L.entry(q.id)}>
          <Flag size={14} className={typeClass(q.type)} aria-hidden="true" />
          <span className="hub-quest-text"><strong>{q.title}</strong>{q.next && <small>Next: {q.next}</small>}
            {q.total > 0 && <span className="hub-progress" role="progressbar" aria-label={`${q.done} of ${q.total} steps`} aria-valuemin={0} aria-valuemax={q.total} aria-valuenow={q.done}><span className={`type-${q.type}`} style={{ width: `${(q.done / q.total) * 100}%` }} /></span>}</span>
          {q.total > 0 && <small className="hub-quest-count">{q.done} of {q.total} steps</small>}
        </a></li>)}</ul>
        : <p className="hub-muted">No active quests. <a href={L.notes("quests")!}>Open the quest board</a></p>}</>;
    }
    case "board": return <>{head(e && <a href={L.notes("quests")!}>Open the board</a>)}
      {!e ? noNotes : <div className="hub-board">{questStates.map(st => { const col = hub.quests.filter(q => q.state === st); return <div key={st}>
        <h3>{stateNames[st]} <span>{col.length}</span></h3>
        {col.slice(0, 4).map(q => <a key={q.id} href={L.entry(q.id)}><Flag size={12} className={typeClass(q.type)} aria-hidden="true" />{q.title}</a>)}
        {col.length > 4 && <small>{col.length - 4} more</small>}
      </div>; })}</div>}</>;
    case "scenes": return <>{head(m && (hub.scenes.length > 8 ? <a href={L.scenes!}>All {hub.scenes.length} scenes</a> : <a href={L.maptable!}>Open Maptable</a>))}
      {!m ? <p className="hub-muted">No Maptable yet. <a href="?add=maptable">Add Maptable</a></p>
        : hub.scenes.length ? <ul className="hub-scene-grid">{hub.scenes.slice(0, { s: 2, m: 4, l: 8 }[size] * h).map(s => <li key={s.id}><a href={L.scene(s.id)}>
          <span className="hub-scene-art" style={s.src ? { backgroundImage: `url("${s.src}")` } : undefined} aria-hidden="true">{!s.src && <MapIcon size={18} />}</span>
          <strong>{s.name}</strong><small>{s.mapType === "encounter" ? `Encounter · ${s.tokens} token${s.tokens === 1 ? "" : "s"}` : s.mapType === "world" ? "World map" : "Area map"}</small></a></li>)}</ul>
        : <p className="hub-muted">No scenes yet. <a href={L.maptable!}>Add the first map in Maptable</a>.</p>}</>;
    case "initiative": {
      const ini = hub.initiative, cap = [6, 12, 20][h - 1] ?? 6;
      return <>{head(m && ini && <a href={L.scene(ini.sceneId)}>Resume</a>)}
        {ini ? <>
          <ul className="hub-init">{ini.rows.slice(0, cap).map(r => <li key={r.id} className={`${r.active ? "on" : ""}${r.skipped ? " skipped" : ""}`}>
            <span className="hub-init-n">{r.initiative}</span><span className="hub-init-name">{r.name}{r.active ? " ◀" : ""}</span>{r.stats && <small>{r.stats}</small>}</li>)}</ul>
          {ini.rows.length > cap && <small className="hub-muted">{ini.rows.length - cap} more</small>}
          <p className="hub-muted hub-init-foot">{ini.sceneName}{ini.round ? ` · round ${ini.round}` : ""}</p>
        </> : <p className="hub-muted">No encounter with initiative yet. {m && <a href={L.maptable!}>Open Maptable</a>}</p>}</>;
    }
    case "roll": return <>{head()}<RollPanel tables={hub.tables} library={hub.library} emptyText={e ? "Star a random table in the Wiki and use it in this campaign to add it here." : "Star a random table in the Wiki to add it here."} /></>;
    case "party": case "companions": {
      const order = (r: string) => r === "pc" ? 0 : r === "companion" ? 1 : 2;
      const list = pickedFrom(type, hub.people, layout).sort((a, b) => order(a.role) - order(b.role) || a.title.localeCompare(b.title));
      return <>{head(e && <a href={L.notes("characters")!}>Characters</a>)}
        {list.length ? <ul className="hub-party">{list.map(p => <PartyMember key={p.id} member={p} href={L.entry(p.id)} />)}</ul>
          : <p className="hub-muted">{type === "party" ? "Mark characters as player characters in the Wiki, or choose who is here with Customize." : "Mark characters as companions in the Wiki, or choose who is here with Customize."}</p>}</>;
    }
    case "factions": {
      const list = pickedFrom("factions", hub.factions, layout), cap = (size === "s" ? 5 : 10) * h;
      return <>{head(e && <a href={L.notes()!}>Wiki</a>)}
        {list.length ? <ul className="hub-list">{list.slice(0, cap).map(f => <li key={f.id}><a href={L.entry(f.id)}><Shield size={15} aria-hidden="true" /><span><strong>{f.title}</strong>{f.type && <small>{f.type}</small>}</span></a></li>)}</ul>
          : <p className="hub-muted">{hub.factions.length ? "Every faction is hidden. Choose which to show with Customize." : "No organizations yet. Make one in the Wiki and it shows up here."}</p>}
        {list.length > cap && <small className="hub-muted">{list.length - cap} more</small>}</>;
    }
    case "recent": return <>{head(e && <a href={L.notes()!}>Wiki</a>)}
      {hub.recent.length ? <ul className="hub-list">{hub.recent.slice(0, [5, 8, 12][h - 1] ?? 5).map(p => <li key={p.id}><a href={L.entry(p.id)}>{p.kind === "character" ? <User size={15} aria-hidden="true" /> : <FileText size={15} aria-hidden="true" />}<span><strong>{p.title}</strong>{p.parent && <small>{p.parent}</small>}</span><time dateTime={p.updatedAt}>{when(p.updatedAt)}</time></a></li>)}</ul>
        : <p className="hub-muted">{e ? "No pages yet." : "No Wiki yet."}</p>}</>;
    case "codex": return <>{head(e && <a href={L.notes("codex")!}>Open codex</a>)}
      {!e ? noNotes : hub.codex.length ? <ul className="hub-list">{hub.codex.slice(0, (size === "s" ? 4 : 8) * h).map(c => <li key={c.id}><a href={L.entry(c.id)}><BookMarked size={15} aria-hidden="true" /><span><strong>{c.title}</strong><small>{c.category}{c.foundAt ? isNewFind({ at: c.foundAt }) ? " · new" : "" : " · not found yet"}</small></span><time dateTime={c.at}>{when(c.at)}</time></a></li>)}</ul>
        : <p className="hub-muted">No codex entries yet. <a href={L.notes("codex")!}>Start the codex</a></p>}</>;
    case "threads": return <Threads layout={layout} save={save} head={head} />;
    case "recap": return <>{head(hub.lastSession && <a href={L.entry(hub.lastSession.id)}>Open</a>)}
      {hub.lastSession ? <><strong className="hub-recap-title">{hub.lastSession.title}</strong><p className="hub-muted hub-recap-text">{hub.lastSession.excerpt || "This session page is empty."}</p></>
        : <p className="hub-muted">No session pages yet. Session pages you write in the Wiki show up here.</p>}</>;
    case "ai": return <>{head()}<AiWidget campaignId={e?.id} maptableCampaignId={e ? undefined : m?.id} bare={bare} rows={h} /></>;
    case "notes": return <Notes layout={layout} save={save} head={head} />;
    case "links": return <Links layout={layout} save={save} head={head} />;
  }
}

type AiState = { paused: boolean; waiting?: unknown[]; entries: { id: string; at: string; summary: string; connection: string; undone?: string }[]; connected: string[]; hasConnections: boolean; chat?: { id: string; name: string }[] };
/**
 * The AI widget: the same chat as the AI panel on every page. Ask starts a new chat in the panel; Chats lists the saved
 * ones and Log what the AI did, each opening the panel there. Connection opens the panel's Connection tab to check or fix it.
 */
function AiWidget({ campaignId, maptableCampaignId, bare, rows }: { campaignId?: string; maptableCampaignId?: string; bare?: boolean; rows: number }) {
  const [state, setState] = useState<AiState | null | "error">(null), [chats, setChats] = useState<ChatMeta[] | null>(null);
  const [view, setView] = useState<"chats" | "log">("chats"), [question, setQuestion] = useState("");
  useEffect(() => {
    if (bare || (!campaignId && !maptableCampaignId)) return;
    let live = true;
    const q = new URLSearchParams(campaignId ? { campaignId } : { maptableCampaignId: maptableCampaignId! });
    const read = () => {
      fetch(`/api/encyclopedia/ai-activity?${q}`, { cache: "no-store" }).then(r => r.ok ? r.json() : Promise.reject()).then(s => { if (live) setState(s as AiState); }).catch(() => { if (live) setState(x => x && x !== "error" ? x : "error"); });
      fetch(`/api/encyclopedia/ai-chats?${q}`, { cache: "no-store" }).then(r => r.ok ? r.json() : Promise.reject()).then((b: { chats?: ChatMeta[] }) => { if (live) setChats(b.chats ?? []); }).catch(() => { if (live) setChats(c => c ?? []); });
    };
    read();
    // Chats asked from here, and what the AI did, show up without a reload.
    const tick = setInterval(() => { if (!document.hidden) read(); }, 20_000);
    return () => { live = false; clearInterval(tick); };
  }, [campaignId, maptableCampaignId, bare]);
  const connect = campaignId ? `/encyclopedia?campaign=${encodeURIComponent(campaignId)}&ai=connect` : null;
  if (bare) return <p className="hub-muted">Chat with your AI, your saved chats, and a log of what it did. The same chat as the AI button on every page.</p>;
  if (state === null) return <p className="hub-muted">Loading…</p>;
  if (state === "error") return <p className="hub-muted">Couldn’t load the AI connection.</p>;
  if (!state.hasConnections) return <div className="hub-ai"><p className="hub-muted">No AI is connected yet. Connect Claude, ChatGPT, Codex or another AI app, or add an API key to chat with it here and on every page.</p>{connect ? <a className="hub-button" href={connect}><Sparkles size={14} aria-hidden="true" />Connect an AI</a> : <button className="hub-button" onClick={() => openAi()}><Sparkles size={14} aria-hidden="true" />Connect an AI</button>}</div>;
  const waiting = state.waiting?.length ?? 0, chat = state.chat?.[0], shown = Math.max(3, rows * 3);
  function ask(e: React.FormEvent) { e.preventDefault(); const q = question.trim(); if (!q) return; openAi({ ask: q }); setQuestion(""); }
  return <div className="hub-ai">
    <p className="hub-ai-status"><span className={`hub-ai-dot${state.paused ? " paused" : state.connected.length ? " live" : ""}`} aria-hidden="true" /><span>{state.paused ? "Paused: it can read, but changes wait until you resume." : state.connected.length ? `Connected now: ${state.connected.join(", ")}` : chat ? `${state.chat!.map(c => c.name).join(", ")} ready to chat` : "No app has connected lately"}</span><button className="hub-ai-settings" onClick={() => openAi({ tab: "connection" })}>Connection</button></p>
    {chat ? <form className="hub-ai-ask" onSubmit={ask}><input value={question} maxLength={2000} placeholder={`Ask ${chat.name} about this campaign…`} aria-label={`Ask ${chat.name}`} onChange={e => setQuestion(e.target.value)} /><button className="hub-button hub-button-primary" disabled={!question.trim()}><ArrowUp size={14} aria-hidden="true" />Ask</button></form>
      : <p className="hub-muted">Chat here needs an AI with an API key: apps like Claude and Codex chat in their own window. <button className="hub-ai-settings" onClick={() => openAi({ tab: "ask" })}>Add a key</button></p>}
    <div className="hub-ai-tabs" role="tablist">
      <button role="tab" aria-selected={view === "chats"} onClick={() => setView("chats")}>Chats{chats?.length ? ` · ${chats.length}` : ""}</button>
      <button role="tab" aria-selected={view === "log"} onClick={() => setView("log")}>Log{waiting ? ` · ${waiting} waiting` : ""}</button>
    </div>
    {view === "chats" ? chats === null ? <p className="hub-muted">Loading…</p> : chats.length ? <ul className="hub-list">{chats.slice(0, shown).map(c => <li key={c.id}><button className="hub-ai-row" onClick={() => openAi({ chat: c.id })}><MessageSquare size={15} aria-hidden="true" /><span><strong>{c.title}</strong><small>{[c.connectionName, `${c.count} messages`].join(" · ")}</small></span><time dateTime={c.updatedAt}>{when(c.updatedAt)}</time></button></li>)}</ul>
      : <p className="hub-muted">No saved chats yet.{chat ? " Ask something above and it’s saved here." : ""}</p>
    : <>{waiting > 0 && <button className="hub-button" onClick={() => openAi({ tab: "activity" })}>{waiting} waiting for your OK</button>}
      {state.entries.length ? <ul className="hub-list">{state.entries.slice(0, shown).map(x => <li key={x.id}><button className="hub-ai-row" onClick={() => openAi({ tab: "activity" })}><ScrollText size={15} aria-hidden="true" /><span><strong>{x.summary}</strong><small>{x.connection}{x.undone ? " · undone" : ""}</small></span><time dateTime={x.at}>{when(x.at)}</time></button></li>)}</ul>
        : <p className="hub-muted">Nothing yet. When a connected AI rolls dice or changes a page, it shows up here.</p>}</>}
  </div>;
}

const roleNames: Record<string, string> = { pc: "Player character", companion: "Companion", npc: "NPC", creature: "Creature" };
function PartyMember({ member: p, href }: { member: CampaignHub["people"][number]; href: string }) {
  const { src } = usePictureSrc(p.picture ? tokenPicture(p.picture).imageId : undefined);
  return <li><a href={href}>
    {p.picture ? <PictureToken picture={tokenPicture(p.picture)} src={src} size={36} /> : <span className="hub-token-empty" aria-hidden="true"><User size={16} /></span>}
    <span><strong>{p.title}</strong><small>{[roleNames[p.role] ?? "Character", p.group].filter(Boolean).join(" · ")}</small></span>
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
      <label>Where<input maxLength={120} value={where} placeholder="e.g. On Discord" onChange={ev => setWhere(ev.target.value)} /></label>
      <div className="hub-row"><button className="hub-button hub-button-primary" onClick={() => void done()}>Save</button><button className="hub-button" onClick={() => setEditing(false)}>Cancel</button></div>
    </div> : <>
      {time ? <><strong className="hub-big">{time.label}</strong><p className="hub-muted">{[time.relative[0].toUpperCase() + time.relative.slice(1), next?.where].filter(Boolean).join(" · ")}</p></>
        : <p className="hub-muted">Not scheduled yet.</p>}
      {!bare && config && <div className="hub-row"><button className="hub-button" onClick={start}><CalendarDays size={14} aria-hidden="true" />{time ? "Change" : "Schedule it"}</button></div>}
      {!config && <p className="hub-muted">Add Wiki to schedule sessions.</p>}
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

const addable: FrontWidgetType[] = ["next", "date", "party", "recap", "story", "text", "links"];

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
      <label>Where<input maxLength={120} value={w.where} placeholder="e.g. On Discord" onChange={ev => update({ where: ev.target.value })} /></label>
    </div>;
    case "date": {
      const shared = hub.calendars.filter(c => c.shared);
      return shared.length ? <label>Calendar<select value={w.calendarId} onChange={ev => update({ calendarId: ev.target.value })}>{shared.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        : <p className="hub-muted">Share a calendar with players in the Wiki to show today&apos;s date in the game.</p>;
    }
    case "party": return <p className="hub-muted">Shows player characters that players can see.</p>;
    case "recap": return <p className="hub-muted">Shows the newest session page that players can see.</p>;
    case "story": return <StoryField widget={w} hub={hub} update={update} />;
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

/**
 * The story so far: a short summary of the campaign for players, written by the GM or by their AI from the
 * recaps they've published (never drafts or GM notes). The AI's draft waits beside the GM's own text until
 * they pick: use it instead, add it below, or discard it.
 */
function StoryField({ widget: w, hub, update }: { widget: Extract<FrontWidget, { type: "story" }>; hub: CampaignHub; update: (w: Partial<FrontWidget>) => void }) {
  const campaignId = hub.row.encyclopedia?.id, writers = useWriters(campaignId);
  const [key, setKey] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [copied, setCopied] = useState(false);
  const [note, setNote] = useState(""), [keep, setKeep] = useState(true), [draft, setDraft] = useState<{ text: string; from: number; by: string } | null>(null), [styleId, setStyleId] = useState("");
  const writing = hub.writing ?? undefined, style = styleFor(writing, "story", styleId || undefined), usual = styleFor(writing, "story");
  const keys = writers?.keys ?? [], chosen = keys.find(k => k.id === key) ?? keys[0], mine = w.body.trim();
  // Draft it with AI starts open only when there's nothing written yet, so the card leads with the GM's own text.
  const [aiOpen] = useState(!mine), words = mine ? mine.split(/\s+/).length : 0;
  const ask = `In RPG Tools for "${hub.row.name}", use the story_so_far prompt: read the published recaps with read_recaps and write The story so far for the players' front page.${style.id !== usual.id ? ` Use the "${style.name}" style instead: ${styleSummary(style, "story")}.` : ""}${keep ? "" : " Start fresh instead of keeping the current story."}${note.trim() ? ` ${note.trim()}` : ""}`;
  async function write() {
    if (!chosen || !campaignId) return;
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/encyclopedia/recaps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "story", campaignId, ...keyFields(chosen.id), keep, before: w.body, styleId: style.id, ...(note.trim() ? { note: note.trim() } : {}) }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Could not write the story.");
      // Nothing there yet: the draft goes straight in. Otherwise it waits beside the GM's own text.
      if (!mine) update({ body: body.text, from: body.from, at: new Date().toISOString() });
      else setDraft({ text: body.text, from: body.from, by: body.by ?? chosen.name });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not write the story."); } finally { setBusy(false); }
  }
  const use = (how: "replace" | "add") => {
    if (!draft) return;
    const body = how === "replace" ? draft.text : `${w.body.trimEnd()}\n\n${draft.text}`.slice(0, 6000);
    update(how === "replace" ? { body, from: draft.from, at: new Date().toISOString() } : { body, from: undefined, at: undefined });
    setDraft(null);
  };
  const copy = () => void navigator.clipboard.writeText(ask).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => setError("Your browser didn’t allow copying."));
  return <div className="hub-story-edit">
    <label>Text<textarea rows={8} maxLength={6000} value={w.body} placeholder="What the party has done so far, in a few paragraphs. Write it yourself, or have the AI draft it below." onChange={ev => update({ body: ev.target.value, at: undefined, from: undefined })} /></label>
    {w.at && w.from ? <p className="hub-muted">Written from {w.from} published recap{w.from === 1 ? "" : "s"} on {new Date(w.at).toLocaleDateString("en", { month: "short", day: "numeric" })}. Read it, then save the front page.</p> : mine ? <p className="hub-muted">Written by you · {words.toLocaleString("en")} word{words === 1 ? "" : "s"}</p> : null}
    {draft && <div className="hub-story-draft">
      <p className="hub-muted"><Sparkles size={13} aria-hidden="true" /> {draft.by}’s draft, from {draft.from} published recap{draft.from === 1 ? "" : "s"}. Your text stays as it is until you pick.</p>
      <div className="hub-story-draft-text">{draft.text}</div>
      <div className="hub-story-write"><button className="hub-button hub-button-primary" onClick={() => use("replace")}>Use this instead</button><button className="hub-button" onClick={() => use("add")}>Add below mine</button><button className="hub-button" onClick={() => setDraft(null)}>Discard</button></div>
    </div>}
    <details className="hub-story-ai" open={aiOpen}>
      <summary>Draft it with AI <small className="hub-muted">from your published recaps</small></summary>
      <div className="hub-story-style">
        <label>Style<select value={style.id} onChange={ev => setStyleId(ev.target.value === usual.id ? "" : ev.target.value)}>{allStyles(writing).map(s => <option key={s.id} value={s.id}>{s.name}{isBuiltIn(s.id) ? "" : " (yours)"}{s.id === usual.id ? " · this campaign’s style" : ""}</option>)}</select></label>
        <a href={`/encyclopedia?campaign=${encodeURIComponent(campaignId ?? "")}&styles=story`}>Edit styles</a>
      </div>
      <small className="hub-muted">{styleSummary(style, "story")}</small>
      <label><span>What to change <span className="hub-muted">(optional)</span></span><input maxLength={500} value={note} placeholder="Keep my first paragraph. End on the second bell." onChange={ev => setNote(ev.target.value)} /></label>
      {mine && <label className="hub-story-keep"><input type="checkbox" checked={keep} onChange={ev => setKeep(ev.target.checked)} /> Start from my text, keeping what still holds</label>}
      <div className="hub-story-write">
        {keys.length > 1 && <select aria-label="Written by" value={chosen?.id} onChange={ev => setKey(ev.target.value)}>{keys.map(k => <option key={k.id} value={k.id}>{k.name} · {k.model}</option>)}</select>}
        {chosen && <button className="hub-button hub-button-primary" disabled={busy} onClick={write}><Sparkles size={14} aria-hidden="true" />{busy ? "Writing…" : `Write a draft with ${chosen.name}`}</button>}
        <button className={`hub-button${chosen ? "" : " hub-button-primary"}`} onClick={copy}>{copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{copied ? "Copied" : "Copy for my AI app"}</button>
      </div>
      <small className="hub-muted">Drafts and GM notes are left out. The draft waits beside your text until you pick.</small>
    </details>
    {error && <p className="hub-error" role="alert">{error}</p>}
  </div>;
}
