"use client";
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import type { Membership } from "@/lib/members-server";
import { Avatar } from "./campaign-members";
import "./campaign-members.css";

type Joined = Omit<Membership, "owner">;

/** Campaigns other people run that you joined with an invite link, or asked to join. */
export default function CampaignsJoined() {
  const [items, setItems] = useState<Joined[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/members?mine=1", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(body => { if (live) setItems(body?.campaigns ?? []); }).catch(() => {});
    return () => { live = false; };
  }, []);
  if (!items?.length) return null;
  return <section className="joined" aria-labelledby="joined-title">
    <h2 id="joined-title">Campaigns you&apos;re in</h2>
    <ul className="joined-list">{items.map(c => <li key={`${c.ownerName}:${c.campaignId}`} className="joined-card">
      <Avatar name={c.ownerName || c.campaign} seed={c.campaignId} />
      <div>
        <strong>{c.campaign}</strong>
        <small>{c.world ? `${c.world} · ` : ""}Run by {c.ownerName || "the GM"}</small>
      </div>
      {c.asking ? <span className="mem-chip mem-sand"><Clock size={12} aria-hidden="true" />&nbsp;Asking to join</span>
        : <span className={`mem-chip ${c.role === "Co-GM" ? "mem-violet" : c.role === "Player" ? "mem-blue" : "mem-gray"}`}>{c.role === "Co-GM" ? "Co-GM" : c.groups.join(", ") || c.role}</span>}
    </li>)}</ul>
    <p className="campaigns-muted">Opening these campaigns from here comes next. Until then, use the player link your GM shared.</p>
  </section>;
}
