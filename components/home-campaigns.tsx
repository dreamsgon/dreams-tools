"use client";
import { useEffect, useState } from "react";
import type { CampaignSummary } from "@/lib/campaign-links";
import "./campaigns.css";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** A short list of campaigns on the home page. It stays hidden until there is something to show. */
export default function HomeCampaigns() {
  const [summary, setSummary] = useState<CampaignSummary | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/campaigns", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(body => { if (live && body) setSummary(body); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const rows = (summary?.rows ?? []).filter(r => !r.encyclopedia?.archived);
  if (!rows.length) return null;
  return <section className="home-campaigns" aria-labelledby="home-campaigns-title">
    <div className="home-campaigns-head"><h2 id="home-campaigns-title">Your campaigns</h2><a href="/campaigns">Manage campaigns</a></div>
    {rows.slice(0, 4).map(r => <div className="home-campaigns-row" key={r.key}>
      <strong>{r.name}</strong>
      <span>{r.maptable ? (r.maptable.scenes ? plural(r.maptable.scenes, "scene") : "No scenes yet") : "No maps yet"}</span>
      <span>{r.encyclopedia ? (r.encyclopedia.pages ? plural(r.encyclopedia.pages, "page") : "No pages yet") : "No notes yet"}</span>
      <span className="home-campaigns-links">
        {r.maptable && <a href={`/maptable?campaign=${encodeURIComponent(r.maptable.id)}`}>Maps</a>}
        {r.encyclopedia && <a href={`/encyclopedia?campaign=${encodeURIComponent(r.encyclopedia.id)}`}>Notes</a>}
      </span>
    </div>)}
    {rows.length > 4 && <p className="home-campaigns-more">{plural(rows.length - 4, "more campaign")} · <a href="/campaigns">See all on the Campaigns page</a></p>}
  </section>;
}
