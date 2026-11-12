"use client";
import { useEffect, useState } from "react";
import { FileText, Map as MapIcon, Plus, User, ChevronRight } from "lucide-react";
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

/** Where a campaign opens from the home page. The campaign hub replaces this once it exists. */
const openHref = (r: CampaignRow) => r.encyclopedia ? `/encyclopedia?campaign=${encodeURIComponent(r.encyclopedia.id)}` : `/maptable?campaign=${encodeURIComponent(r.maptable!.id)}`;

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
  return <>
    <section className="home-section" aria-labelledby="home-campaigns-title">
      <div className="home-section-head">
        <h2 id="home-campaigns-title">Your campaigns</h2>
        <span><a href="/campaigns?new=1"><Plus size={14} aria-hidden="true" />New campaign</a><a href="/campaigns"><ChevronRight size={14} aria-hidden="true" />All campaigns</a></span>
      </div>
      {rows.length ? <div className="home-campaign-grid">
        {rows.slice(0, 3).map((r, i) => <CampaignCard key={r.key} row={r} latest={i === 0 && !!r.encyclopedia?.lastEdited} />)}
      </div> : <p className="home-empty">No campaigns yet. <a href="/campaigns?new=1">Start your first campaign</a>.</p>}
      {rows.length > 3 && <p className="home-more">{plural(rows.length - 3, "more campaign")} · <a href="/campaigns">See them all</a></p>}
    </section>
    {recent.length > 0 && <section className="home-section home-recent" aria-labelledby="home-recent-title">
      <div className="home-section-head home-section-head-quiet"><h2 id="home-recent-title">Recently edited</h2></div>
      <ul>{recent.map(p => <RecentRow key={p.id} page={p} />)}</ul>
    </section>}
  </>;
}

function CampaignCard({ row, latest }: { row: CampaignRow; latest: boolean }) {
  const e = row.encyclopedia, m = row.maptable;
  const facts = [e?.worldName, m ? plural(m.scenes, "scene") : null, e ? plural(e.pages, "page") : null].filter(Boolean).join(" · ");
  return <article className="home-campaign">
    <a className="home-campaign-art" href={openHref(row)} tabIndex={-1} aria-hidden="true">{latest && <span>Last edited</span>}</a>
    <div className="home-campaign-body">
      <h3><a href={openHref(row)}>{row.name}</a></h3>
      <p>{facts}</p>
      <div className="home-campaign-foot">
        <span className="home-campaign-links">
          {e && <a href={`/encyclopedia?campaign=${encodeURIComponent(e.id)}`}>Notes</a>}
          {m && <a href={`/maptable?campaign=${encodeURIComponent(m.id)}`}>Maps</a>}
        </span>
        {e?.lastEdited && <span>{when(e.lastEdited)}</span>}
      </div>
    </div>
  </article>;
}

function RecentRow({ page }: { page: RecentPage }) {
  const Icon = page.kind === "character" ? User : page.kind === "map" ? MapIcon : FileText;
  return <li><a href={`/encyclopedia?entry=${encodeURIComponent(page.id)}`}>
    <Icon size={15} aria-hidden="true" />
    <span>{page.title}<small>{page.campaignName ?? `${page.worldName} lore`}</small></span>
    <time dateTime={page.updatedAt}>{when(page.updatedAt)}</time>
  </a></li>;
}
