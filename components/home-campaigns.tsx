"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, FileText, Flag, Map as MapIcon, Plus, User, ChevronRight, LayoutGrid } from "lucide-react";
import { homeCampaigns, type CampaignRow, type CampaignSummary, type RecentPage } from "@/lib/campaign-links";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** "2h ago", "Yesterday", "Nov 4". */
export function when(iso: string, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const mins = Math.max(0, Math.round((now - t) / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24 && new Date(t).toDateString() === new Date(now).toDateString()) return `${Math.round(mins / 60)}h ago`;
  if (new Date(t).toDateString() === new Date(now - 864e5).toDateString()) return "Yesterday";
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", ...(new Date(t).getFullYear() === new Date(now).getFullYear() ? {} : { year: "numeric" }) });
}

/** A campaign opens in its hub on the Campaigns page. */
const openHref = (r: CampaignRow) => `/campaigns/${encodeURIComponent(r.key)}`;
const notesHref = (r: CampaignRow) => r.encyclopedia ? `/encyclopedia?campaign=${encodeURIComponent(r.encyclopedia.id)}` : null;
const mapsHref = (r: CampaignRow) => r.maptable ? `/maptable?campaign=${encodeURIComponent(r.maptable.id)}` : null;
const pageHref = (p: { id: string }) => `/encyclopedia?entry=${encodeURIComponent(p.id)}`;
const kindNames: Record<string, string> = { character: "Character", place: "Place", faction: "Organization", lore: "Lore", session: "Session notes", tasks: "Checklist", map: "Map", note: "Page" };
const kindName = (kind: string) => kindNames[kind] ?? "Page";
function KindIcon({ kind }: { kind: string }) {
  return kind === "character" ? <User size={15} aria-hidden="true" /> : kind === "map" ? <MapIcon size={15} aria-hidden="true" /> : <FileText size={15} aria-hidden="true" />;
}

/** The numbers shown for a campaign, leaving out a tool it does not use. */
function facts(r: CampaignRow): [string, string][] {
  const e = r.encyclopedia, m = r.maptable, out: [string, string][] = [];
  if (e) out.push([String(e.pages), e.pages === 1 ? "page" : "pages"]);
  if (e) out.push([String(e.maps), e.maps === 1 ? "map" : "maps"]);
  if (m) out.push([String(m.scenes), m.scenes === 1 ? "scene" : "scenes"]);
  return out;
}

/** Your campaigns and recently edited pages on the home page. Hidden until there is something to show. */
export default function HomeCampaigns() {
  const [summary, setSummary] = useState<CampaignSummary | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/campaigns", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(body => { if (live && body) setSummary(body); }).catch(() => {});
    return () => { live = false; };
  }, []);
  if (!summary) return null;
  const rows = homeCampaigns(summary), recent = summary.recent ?? [];
  const [first, ...others] = rows, shown = others.slice(0, 7);
  return <>
    {first && <ContinueCard row={first} />}
    <section className="home-section" aria-labelledby="home-campaigns-title">
      <div className="home-section-head">
        <h2 id="home-campaigns-title">Your campaigns</h2>
        <span><Link href="/campaigns"><ChevronRight size={14} aria-hidden="true" />All campaigns</Link></span>
      </div>
      <div className="home-campaign-grid">
        {shown.map(r => <CampaignCard key={r.key} row={r} />)}
        <Link className="home-new-campaign" href="/campaigns?new=1">
          <span aria-hidden="true"><Plus size={18} /></span>
          New campaign
          <small>{rows.length ? "Keep its maps and notes together" : "Start your first campaign"}</small>
        </Link>
      </div>
      {others.length > shown.length && <p className="home-more">{plural(others.length - shown.length, "more campaign")} · <Link href="/campaigns">See them all</Link></p>}
    </section>
    {recent.length > 0 && <section className="home-section home-recent" aria-labelledby="home-recent-title">
      <div className="home-section-head home-section-head-quiet"><h2 id="home-recent-title">Recently edited</h2></div>
      <ul>{recent.map(p => <RecentRow key={p.id} page={p} />)}</ul>
    </section>}
  </>;
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

function CampaignCard({ row }: { row: CampaignRow }) {
  const e = row.encyclopedia, notes = notesHref(row), maps = mapsHref(row);
  return <article className="home-campaign">
    <Link className="home-campaign-art" href={openHref(row)} tabIndex={-1} aria-hidden="true" />
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
