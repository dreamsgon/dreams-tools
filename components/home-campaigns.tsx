"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, BookOpen, Bell, CalendarDays, Check, ChevronRight, Dices, FileText, Flag, Folder, GripVertical, LayoutGrid, Link2, ListChecks, Map as MapIcon, PenLine, Pin, Plus, Settings, SlidersHorizontal, Star, X, Goal } from "lucide-react";
import { folderChoices, homeCampaigns, type CampaignRow, type CampaignSummary, type RecentPage } from "@/lib/campaign-links";
import {
  applyHomeAction, campaignShowNames, campaignShows, hasWidget, homeHeights, homeInfo, homePresets, homeSizes, homeWidgets, isPinnedCampaign, moveWidget, presetLayout, presetNames, resizeWidget, setOption, setWidgetHeight, toggleWidget,
  type HomeAction, type HomeHeight, type HomeLayout, type HomePreset, type HomeSize, type HomeWidget,
} from "@/lib/home-layout";
import type { HomeData } from "@/lib/home-server";
import { Attention, Folders, Head, Links, Notes, Pinned, Quests, Roll, Sessions, Todo, type Act } from "./home-widgets";
import { facts, KindIcon, kindName, mapsHref, notesHref, openHref, pageHref, plural, when } from "./home-shared";

export { when };

const icons: Record<HomeWidget, typeof Flag> = {
  continue: Flag, attention: Bell, sessions: CalendarDays, campaigns: Flag, folders: Folder, links: Link2, recent: FileText, pinned: Pin, quests: Goal, todo: ListChecks, notes: PenLine, roll: Dices,
};

async function request(url: string, init?: RequestInit) {
  const r = await fetch(url, { cache: "no-store", ...init });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error || "That didn't save.");
  return body as { layout: HomeLayout; data?: HomeData };
}
const noop: Act = () => {};

/** The campaigns the Your campaigns section shows, by its settings. */
function campaignChoice(summary: CampaignSummary, layout: HomeLayout) {
  const o = layout.options?.campaigns, show = o?.show ?? "recent", count = o?.count ?? 8, pins = layout.pinnedCampaigns;
  const all = homeCampaigns(summary), lead = hasWidget(layout, "continue") ? all[0] : undefined, pinned = (r: CampaignRow) => isPinnedCampaign(pins, r);
  let list: CampaignRow[], title = "Your campaigns";
  if (show === "pinned") { list = all.filter(pinned); title = "Pinned campaigns"; }
  else if (show === "pinfirst") list = [...all.filter(pinned), ...all.filter(r => !pinned(r) && r !== lead)];
  else if (show === "folder") { list = all.filter(r => !!o?.folderId && r.folderId === o.folderId); title = summary.folders.find(f => f.id === o?.folderId)?.name ?? "Folder"; }
  else list = all.filter(r => r !== lead);
  return { title, list, shown: list.slice(0, count), show, compact: !!o?.compact };
}

/** The signed-in home page: a greeting, then the sections you chose, in your order. Customize changes them. */
export default function HomeDashboard({ first, tools }: { first: string; tools: ReactNode }) {
  const [layout, setLayout] = useState<HomeLayout | null>(null), [data, setData] = useState<HomeData | null>(null);
  const [draft, setDraft] = useState<HomeLayout | null>(null), [openSettings, setOpenSettings] = useState<HomeWidget | null>(null);
  const [error, setError] = useState(""), [saving, setSaving] = useState(false), [dragging, setDragging] = useState<HomeWidget | null>(null);
  const layoutRef = useRef<HomeLayout | null>(null), queue = useRef<Promise<unknown>>(Promise.resolve());
  const apply = (l: HomeLayout) => { layoutRef.current = l; setLayout(l); };

  const load = useCallback(async (all = false) => {
    const body = await request(`/api/home${all ? "?all=1" : ""}`);
    layoutRef.current = body.layout; setLayout(body.layout); setData(body.data ?? {});
  }, []);
  useEffect(() => { void load().catch(() => {}); }, [load]);

  /** A quick change: shown at once, saved in the background, one at a time so they arrive in order. */
  const act = useCallback<Act>((body: HomeAction) => {
    const now = layoutRef.current;
    if (!now) return;
    try { apply(applyHomeAction(now, body)); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "That could not be saved."); return; }
    queue.current = queue.current.then(() => request("/api/home", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))
      .catch(e => { setError(e instanceof Error ? e.message : "That didn't save."); void load().catch(() => {}); });
  }, [load]);

  const start = () => { if (!layout) return; setDraft(structuredClone(layout)); setOpenSettings(null); setError(""); void load(true).catch(() => {}); };
  async function save() {
    if (!draft || !layoutRef.current) return;
    setSaving(true); setError("");
    try {
      const next: HomeLayout = { ...layoutRef.current, widgets: draft.widgets };
      if (draft.options) next.options = draft.options; else delete next.options;
      await queue.current;
      const saved = await request("/api/home", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "layout", layout: next }) });
      apply(saved.layout); setDraft(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "That didn't save."); }
    finally { setSaving(false); }
  }
  const cancel = () => { setDraft(null); setError(""); void load().catch(() => {}); };

  const view: HomeLayout | null = draft && layout ? { ...layout, widgets: draft.widgets, options: draft.options } : layout;
  return <>
    <section className="home-hello home-hello-signed-in">
      <div><h1>Welcome back{first ? `, ${first}` : ""}.</h1><p>{draft ? "Choose what your home page shows." : "Pick up where you left off, or open a tool."}</p></div>
      {!draft && <div className="home-hello-right">{tools}<button type="button" className="home-tool-button" title="Customize this page" disabled={!layout} onClick={start}><SlidersHorizontal size={17} strokeWidth={1.7} aria-hidden="true" />Customize</button></div>}
    </section>
    {draft && <div className="home-custom-bar"><p><b>Customizing your home page.</b> Changes show here as you make them.</p>
      <button type="button" className="home-button home-button-small home-button-quiet" onClick={cancel} disabled={saving}>Cancel</button>
      <button type="button" className="home-button home-button-small home-button-primary" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save layout"}</button></div>}
    {error && <p className="home-error" role="alert">{error}</p>}
    {view && data && (draft
      ? <Customize layout={view} data={data} draft={draft} setDraft={setDraft} open={openSettings} setOpen={setOpenSettings} dragging={dragging} setDragging={setDragging} />
      : <Grid layout={view} data={data} act={act} onCustomize={start} />)}
  </>;
}

function Grid({ layout, data, act, onCustomize }: { layout: HomeLayout; data: HomeData; act: Act; onCustomize: () => void }) {
  if (!layout.widgets.length) return <div className="home-empty">Your home page is empty. <button type="button" className="home-text-button" onClick={onCustomize}>Customize</button> to add sections.</div>;
  return <div className="home-grid">{layout.widgets.map(w => <Panel key={w.type} type={w.type} size={w.size} h={w.h}><Section type={w.type} size={w.size} h={w.h ?? 1} layout={layout} data={data} act={act} /></Panel>)}</div>;
}

/** The full-width Continue, Your campaigns and Recently edited sections have no box, as the page was before it could be customized. */
const bareOf = (type: HomeWidget, size: HomeSize) => type === "continue" || (size === "l" && (type === "campaigns" || type === "recent"));
function Panel({ type, size, h, children, className, ...rest }: { type: HomeWidget; size: HomeSize; h?: HomeHeight; children: ReactNode } & React.HTMLAttributes<HTMLElement>) {
  return <section className={`home-w home-w-${size}${h && h > 1 ? ` home-w-h${h}` : ""}${bareOf(type, size) ? " home-w-bare" : ""}${className ? ` ${className}` : ""}`} aria-label={homeInfo[type].name} {...rest}>{children}</section>;
}

function Section({ type, size, h, layout, data, act }: { type: HomeWidget; size: HomeSize; h: number; layout: HomeLayout; data: HomeData; act: Act }) {
  const part = { layout, data, act, h };
  switch (type) {
    case "continue": return <Continue summary={data.summary} />;
    case "campaigns": return <Campaigns {...part} />;
    case "recent": return <Recent {...part} />;
    case "attention": return <Attention {...part} />;
    case "sessions": return <Sessions {...part} />;
    case "folders": return <Folders {...part} />;
    case "links": return <Links {...part} size={size} />;
    case "pinned": return <Pinned {...part} />;
    case "quests": return <Quests {...part} />;
    case "todo": return <Todo {...part} />;
    case "notes": return <Notes {...part} />;
    case "roll": return <Roll {...part} />;
  }
}

function Continue({ summary }: { summary?: CampaignSummary }) {
  const row = summary ? homeCampaigns(summary)[0] : undefined;
  if (!row) return <section className="home-continue"><div className="home-continue-main"><h2>Continue where you left off</h2><p className="home-continue-text">You have no campaigns yet.</p>
    <div className="home-continue-actions"><Link className="home-button home-button-primary" href="/campaigns?new=1"><Plus size={15} aria-hidden="true" />New campaign</Link></div></div></section>;
  return <ContinueCard row={row} />;
}

function Campaigns({ layout, data, act }: { layout: HomeLayout; data: HomeData; act: Act }) {
  if (!data.summary) return null;
  const { title, list, shown, show, compact } = campaignChoice(data.summary, layout), pins = layout.pinnedCampaigns;
  const toggle = (r: CampaignRow) => {
    if (!isPinnedCampaign(pins, r)) return act({ action: "pinCampaign", key: r.key, on: true });
    // A campaign paired after it was pinned can be pinned under either of its keys: unpin all of them.
    for (const key of [r.key, r.maptable && `m:${r.maptable.id}`, r.encyclopedia && `e:${r.encyclopedia.id}`]) if (key && pins?.includes(key)) act({ action: "pinCampaign", key, on: false });
  };
  return <>
    <Head title={title} id="home-campaigns-title"><span><Link href="/campaigns"><ChevronRight size={14} aria-hidden="true" />All campaigns</Link></span></Head>
    <div className={`home-campaign-grid${compact ? " home-campaign-grid-compact" : ""}`}>
      {shown.map(r => <CampaignCard key={r.key} row={r} pinned={isPinnedCampaign(pins, r)} onPin={() => toggle(r)} />)}
      {(show !== "pinned" || !shown.length) && <Link className="home-new-campaign" href="/campaigns?new=1">
        <span aria-hidden="true"><Plus size={18} /></span>
        New campaign
        <small>{data.summary.rows.length ? "Keep its maps and notes together" : "Start your first campaign"}</small>
      </Link>}
    </div>
    {list.length > shown.length && <p className="home-more">{plural(list.length - shown.length, "more campaign")} · <Link href="/campaigns">See them all</Link></p>}
    {show === "pinned" && !shown.length && <p className="home-muted">Pin campaigns with the star on their card.</p>}
    {show === "folder" && !shown.length && <p className="home-muted">No campaigns in this folder.</p>}
  </>;
}

function Recent({ layout, data }: { layout: HomeLayout; data: HomeData }) {
  const recent: RecentPage[] = (data.summary?.recent ?? []).slice(0, layout.options?.recent?.count ?? 6);
  if (!recent.length) return data.summary ? <><Head title="Recently edited" id="home-recent-title" /><p className="home-muted">Pages you edit in the Encyclopedia show up here.</p></> : null;
  return <div className="home-recent home-grow">
    <Head title="Recently edited" id="home-recent-title" />
    <ul>{recent.map(p => <RecentRow key={p.id} page={p} />)}</ul>
  </div>;
}

/** The campaign you worked on last, with the pages you changed in it. */
function ContinueCard({ row }: { row: CampaignRow }) {
  const e = row.encyclopedia, notes = notesHref(row), maps = mapsHref(row);
  const latest = e?.latest ?? [];
  return <section className="home-continue" aria-labelledby="home-continue-title">
    <div className="home-continue-main">
      <p className="home-continue-label">{e?.lastEdited ? `Continue where you left off · edited ${when(e.lastEdited).toLowerCase()}` : "Continue where you left off"}</p>
      <h2 id="home-continue-title"><Link href={openHref(row)}>{row.name}</Link></h2>
      {e?.description && <p className="home-continue-text">{e.description}</p>}
      <p className="home-continue-facts">{[e?.worldName, ...facts(row).map(([n, l]) => `${n} ${l}`)].filter(Boolean).join(" · ")}</p>
      <div className="home-continue-actions">
        {notes && <a className="home-button home-button-primary" href={notes}><BookOpen size={15} aria-hidden="true" />Open notes</a>}
        {maps && <a className={notes ? "home-button" : "home-button home-button-primary"} href={maps}><MapIcon size={15} aria-hidden="true" />Open maps</a>}
        <Link className="home-button home-button-quiet" href={openHref(row)}><LayoutGrid size={15} aria-hidden="true" />Campaign hub</Link>
      </div>
    </div>
    <div className="home-continue-side">
      <h3>Last changed here</h3>
      {latest.length ? <ul>{latest.map(p => <li key={p.id}><a href={pageHref(p)}>
        <KindIcon kind={p.kind} />
        <span>{p.title}<small>{p.path || kindName(p.kind)}</small></span>
        <time dateTime={p.updatedAt}>{when(p.updatedAt)}</time>
      </a></li>)}</ul>
        : <p>{notes ? <>No pages yet. <a href={notes}>Write the first one</a>.</> : "This campaign has no Encyclopedia notes yet."}</p>}
    </div>
  </section>;
}

function CampaignCard({ row, pinned, onPin }: { row: CampaignRow; pinned: boolean; onPin: () => void }) {
  const e = row.encyclopedia, notes = notesHref(row), maps = mapsHref(row);
  return <article className="home-campaign">
    <Link className="home-campaign-art" href={openHref(row)} tabIndex={-1} aria-hidden="true" />
    <button type="button" className="home-pin" aria-pressed={pinned} aria-label={`${pinned ? "Unpin" : "Pin"} ${row.name}`} title={pinned ? "Unpin" : "Pin to the top"} onClick={onPin}><Star size={14} aria-hidden="true" /></button>
    <div className="home-campaign-body">
      <h3><Link href={openHref(row)}>{row.name}</Link></h3>
      <p>{e?.worldName || (row.maptable ? "Maptable campaign" : "")}</p>
      <dl className="home-campaign-facts">{facts(row).map(([n, l]) => <div key={l}><dt>{l}</dt><dd>{n}</dd></div>)}</dl>
      <div className="home-campaign-foot">
        <span className="home-campaign-links">
          {notes && <a href={notes}><BookOpen size={14} aria-hidden="true" />Notes</a>}
          {maps && <a href={maps}><MapIcon size={14} aria-hidden="true" />Maps</a>}
        </span>
        {e?.lastEdited && <span>{when(e.lastEdited)}</span>}
      </div>
    </div>
  </article>;
}

function RecentRow({ page }: { page: RecentPage }) {
  const where = page.campaignName ?? `${page.worldName} lore`;
  return <li><a href={pageHref(page)}>
    <KindIcon kind={page.kind} />
    <span className="home-recent-title">{page.title}<small>{page.path || kindName(page.kind)}</small></span>
    <span className="home-recent-campaign"><Flag size={12} aria-hidden="true" />{where}</span>
    <time dateTime={page.updatedAt}>{when(page.updatedAt)}</time>
  </a></li>;
}

/** Customize: drag sections (or use the arrows, or the arrow keys on the grip), pick a width, open a section's settings, and switch sections on and off in the panel. */
function Customize({ layout, data, draft, setDraft, open, setOpen, dragging, setDragging }: {
  layout: HomeLayout; data: HomeData; draft: HomeLayout; setDraft: (f: (d: HomeLayout | null) => HomeLayout | null) => void;
  open: HomeWidget | null; setOpen: (w: HomeWidget | null) => void; dragging: HomeWidget | null; setDragging: (w: HomeWidget | null) => void;
}) {
  // Always change the newest draft: drag events can come faster than React renders.
  const change = (f: (d: HomeLayout) => HomeLayout) => setDraft(d => d && f(d));
  const at = (d: HomeLayout, t: HomeWidget) => d.widgets.findIndex(w => w.type === t);
  const step = (t: HomeWidget, by: number) => change(d => moveWidget(d, at(d, t), at(d, t) + by));
  const last = draft.widgets.length - 1;
  return <div className="home-custom">
    <div className="home-grid home-grid-edit" onDragOver={e => e.preventDefault()}>
      {draft.widgets.map((w, i) => {
        const info = homeInfo[w.type];
        return <Panel key={w.type} type={w.type} size={w.size} h={w.h} className={`home-w-editing${dragging === w.type ? " home-dragging" : ""}`}
          draggable onDragStart={e => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", w.type); setDragging(w.type); }} onDragEnd={() => setDragging(null)}
          onDragEnter={() => { if (dragging && dragging !== w.type) change(d => moveWidget(d, at(d, dragging), at(d, w.type))); }}>
          <div className="home-edit-bar">
            <button type="button" className="home-grip" aria-label={`Move ${info.name}. Use the arrow keys.`} onKeyDown={e => {
              const by = e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : 0;
              if (by) { e.preventDefault(); step(w.type, by); }
            }}><GripVertical size={15} aria-hidden="true" /></button>
            <h2>{info.name}</h2>
            <button type="button" className="home-icon" aria-label={`Move ${info.name} up`} disabled={i === 0} onClick={() => step(w.type, -1)}><ArrowUp size={15} aria-hidden="true" /></button>
            <button type="button" className="home-icon" aria-label={`Move ${info.name} down`} disabled={i === last} onClick={() => step(w.type, 1)}><ArrowDown size={15} aria-hidden="true" /></button>
            <div className="home-sizes" role="radiogroup" aria-label={`Width of ${info.name}`}>{homeSizes.map(sz => <button key={sz} type="button" role="radio" aria-checked={w.size === sz} onClick={() => change(d => resizeWidget(d, w.type, sz))}>{sz.toUpperCase()}</button>)}</div>
            <div className="home-sizes home-heights" role="radiogroup" aria-label="Height">{homeHeights.map(n => <button key={n} type="button" role="radio" aria-checked={(w.h ?? 1) === n} aria-label={`${n} ${n === 1 ? "row" : "rows"}`} title={`${n} ${n === 1 ? "row" : "rows"} tall`} onClick={() => change(d => setWidgetHeight(d, w.type, n))}>{"▮".repeat(n)}</button>)}</div>
            {hasSettings(w.type) && <button type="button" className="home-icon" aria-expanded={open === w.type} aria-label={`Settings for ${info.name}`} onClick={() => setOpen(open === w.type ? null : w.type)}><Settings size={15} aria-hidden="true" /></button>}
            <button type="button" className="home-icon" aria-label={`Remove ${info.name}`} onClick={() => change(d => toggleWidget(d, w.type, false))}><X size={15} aria-hidden="true" /></button>
          </div>
          {open === w.type && <Settings_ type={w.type} draft={draft} data={data} change={change} />}
          <div className="home-edit-preview" inert><Section type={w.type} size={w.size} h={w.h ?? 1} layout={layout} data={data} act={noop} /></div>
        </Panel>;
      })}
      {!draft.widgets.length && <p className="home-empty">Turn sections on in the panel to add them.</p>}
    </div>
    <aside className="home-drawer" aria-label="Home sections">
      <h2>Home sections</h2>
      <p className="home-muted">Only you see this page. Drag sections to arrange them, or use the arrows. S, M and L set the width; ▮ ▮▮ ▮▮▮ make a section 1, 2 or 3 rows tall, so it runs down the side.</p>
      <ul>{homeWidgets.map(t => { const on = hasWidget(draft, t), Icon = icons[t]; return <li key={t}>
        <label><Icon size={16} aria-hidden="true" /><span><strong>{homeInfo[t].name}</strong><small>{homeInfo[t].hint}</small></span>
          <input type="checkbox" role="switch" checked={on} onChange={e => { const v = e.target.checked; change(d => toggleWidget(d, t, v)); }} /></label>
      </li>; })}</ul>
      <div className="home-drawer-group"><h3>Start from a layout</h3>
        <div className="home-presets">{homePresets.map((p: HomePreset) => <button key={p} type="button" className="home-text-button" onClick={() => change(d => presetLayout(p, d))}>{presetNames[p]}</button>)}</div>
        <p className="home-muted">Your links, to-dos, notes and pins are kept.</p>
        <button type="button" className="home-text-button" onClick={() => change(d => presetLayout("standard", d))}><Check size={13} aria-hidden="true" />Reset to today&apos;s page</button>
      </div>
    </aside>
  </div>;
}

const hasSettings = (t: HomeWidget) => ["campaigns", "folders", "recent", "sessions", "roll", "links"].includes(t);

/** A section's own settings, under its bar. */
function Settings_({ type, draft, data, change }: { type: HomeWidget; draft: HomeLayout; data: HomeData; change: (f: (d: HomeLayout) => HomeLayout) => void }) {
  const o = draft.options, folders = folderChoices(data.summary?.folders ?? []);
  const num = (v: string) => Number(v);
  if (type === "campaigns") {
    const c = o?.campaigns, show = c?.show ?? "recent";
    return <div className="home-settings">
      <label>Show<select value={show} onChange={e => change(d => setOption(d, "campaigns", { show: e.target.value as typeof campaignShows[number] }))}>{campaignShows.map(s => <option key={s} value={s}>{campaignShowNames[s]}</option>)}</select></label>
      {show === "folder" && <label>Folder<select value={c?.folderId ?? ""} onChange={e => change(d => setOption(d, "campaigns", { folderId: e.target.value || undefined }))}>
        <option value="">Choose a folder</option>{folders.map(f => <option key={f.id} value={f.id}>{f.path}</option>)}</select></label>}
      <label>How many<select value={c?.count ?? 8} onChange={e => change(d => setOption(d, "campaigns", { count: num(e.target.value) as 4 | 8 | 12 }))}>{[4, 8, 12].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <label>Compact cards (no banner strip)<input type="checkbox" role="switch" className="home-switch" checked={!!c?.compact} onChange={e => change(d => setOption(d, "campaigns", { compact: e.target.checked }))} /></label>
    </div>;
  }
  if (type === "folders") {
    const which = o?.folders?.which, ids = folders.map(f => f.id);
    return <div className="home-settings"><div>Folders to show</div>
      {folders.length ? <div className="home-checks">{folders.map(f => <label key={f.id}><input type="checkbox" checked={!which || which.includes(f.id)}
        onChange={e => change(d => { const cur = d.options?.folders?.which ?? ids; return setOption(d, "folders", { which: ids.filter(id => id === f.id ? e.target.checked : cur.includes(id)) }); })} />{f.path}</label>)}</div>
        : <p className="home-muted">You have no campaign folders yet. Make them on the Campaigns page.</p>}</div>;
  }
  if (type === "recent") return <div className="home-settings"><label>How many<select value={o?.recent?.count ?? 6} onChange={e => change(d => setOption(d, "recent", { count: num(e.target.value) as 3 | 6 | 10 }))}>{[3, 6, 10].map(n => <option key={n} value={n}>{n}</option>)}</select></label></div>;
  if (type === "sessions") return <div className="home-settings"><label>Look ahead<select value={o?.sessions?.days ?? 14} onChange={e => change(d => setOption(d, "sessions", { days: num(e.target.value) as 7 | 14 | 30 }))}>
    <option value={7}>1 week</option><option value={14}>2 weeks</option><option value={30}>1 month</option></select></label></div>;
  if (type === "roll") return <div className="home-settings"><label>Show your tables<input type="checkbox" role="switch" className="home-switch" checked={o?.roll?.tables !== false} onChange={e => change(d => setOption(d, "roll", { tables: e.target.checked }))} /></label>
    <p className="home-muted">Star a random table in the Encyclopedia to add it here.</p></div>;
  return <div className="home-settings"><p className="home-muted">Add and remove links right in the section once you are done customizing.</p></div>;
}
