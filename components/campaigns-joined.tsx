"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Clock, Map } from "lucide-react";
import type { Joined } from "@/lib/members-server";
import { Avatar } from "./campaign-members";
import "./campaign-hub.css";
import "./campaign-members.css";

/** Campaigns other people run that you joined with an invite link, or asked to join. */
export default function CampaignsJoined() {
  const [items, setItems] = useState<Joined[] | null>(null);
  const [leaving, setLeaving] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/members?mine=1", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(body => { if (live) setItems(body?.campaigns ?? []); }).catch(() => {});
    return () => { live = false; };
  }, []);
  async function leave(ref: string) {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "leave", ref }) });
      const body = await r.json() as { campaigns?: Joined[]; error?: string };
      if (!r.ok) throw Error(body.error ?? "Couldn't leave the campaign.");
      setItems(body.campaigns ?? []); setLeaving("");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't leave the campaign."); }
    finally { setBusy(false); }
  }
  if (!items?.length) return null;
  return <section className="joined" aria-labelledby="joined-title">
    <h2 id="joined-title">Campaigns you&apos;re in</h2>
    {error && <p className="hub-error" role="alert">{error}</p>}
    <ul className="joined-list">{items.map(c => <li key={c.ref} className="joined-card">
      <div className="joined-top">
        <Avatar name={c.ownerName || c.campaign} seed={c.campaignId} />
        <div>
          {c.gm ? <a className="joined-name" href={`/encyclopedia#m-${c.ref}`}>{c.campaign}</a> : c.open ? <Link className="joined-name" href={`/encyclopedia/player#m-${c.ref}`}>{c.campaign}</Link> : <strong>{c.campaign}</strong>}
          <small>{c.world ? `${c.world} · ` : ""}Run by {c.ownerName || "the GM"}</small>
        </div>
        {c.asking ? <span className="mem-chip mem-sand"><Clock size={12} aria-hidden="true" />&nbsp;Asking to join</span>
          : <span className={`mem-chip ${c.role === "Co-GM" ? "mem-violet" : c.role === "Player" ? "mem-blue" : "mem-gray"}`}>{c.role === "Co-GM" ? "Co-GM" : c.groups.join(", ") || c.role}</span>}
      </div>
      {leaving === c.ref ? <div className="joined-confirm" role="group" aria-label={`Leave ${c.campaign}`}>
        <p>{c.asking ? `Stop asking to join ${c.campaign}?` : `Leave ${c.campaign}? To come back, you'll need a new invite link from the GM.`}</p>
        <div className="joined-actions">
          <button type="button" className="hub-button" disabled={busy} onClick={() => setLeaving("")}>Cancel</button>
          <button type="button" className="hub-button mem-ban-button" disabled={busy} onClick={() => void leave(c.ref)}>{busy ? "Leaving…" : c.asking ? "Stop asking" : "Leave campaign"}</button>
        </div>
      </div> : <div className="joined-actions">
        {c.asking ? <span className="joined-note">The GM will let you in soon.</span>
          : c.gm ? <><a className="hub-button hub-button-primary" href={`/encyclopedia#m-${c.ref}`}><BookOpen size={15} aria-hidden="true" />Open in Encyclopedia</a>{c.maps && <a className="hub-button" href={`/maptable#m-${c.ref}`}><Map size={15} aria-hidden="true" />Open maps</a>}</>
          : c.open ? <Link className="hub-button hub-button-primary" href={`/encyclopedia/player#m-${c.ref}`}><BookOpen size={15} aria-hidden="true" />Open player pages</Link>
          : <span className="joined-note">Your groups can&apos;t see the player pages yet.</span>}
        <button type="button" className="hub-button" onClick={() => { setLeaving(c.ref); setError(""); }}>{c.asking ? "Stop asking" : "Leave"}</button>
      </div>}
    </li>)}</ul>
  </section>;
}
