"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Clock } from "lucide-react";
import { Chip } from "./campaign-members";
import type { GroupColor } from "@/lib/members";
import "./campaign-hub.css";
import "./campaign-members.css";

type Invite = { campaign: string; world: string; ownerName: string; group: { name: string; color: GroupColor }; can: string[]; approve: boolean; status: "signedOut" | "owner" | "banned" | "member" | "waiting" | "invited"; name: string };
type Shown = Invite["status"] | "joined" | "asked";

/** The page an invite link opens: where it leads, then Join campaign or Sign in. */
export default function JoinCampaign({ token }: { token: string }) {
  const [invite, setInvite] = useState<Invite | null>(null), [error, setError] = useState(""), [status, setStatus] = useState<Shown>("invited");
  const [name, setName] = useState(""), [busy, setBusy] = useState(false), [joinError, setJoinError] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invite", token }) }).then(async r => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(r.status === 400 || r.status === 404 ? "This invite link has been turned off or has expired. Ask the GM for a new one." : body.error || "Could not open this invite.");
      if (live) { setInvite(body); setStatus(body.status); setName(body.name); }
    }).catch(e => live && setError(e instanceof Error ? e.message : "Could not open this invite."));
    return () => { live = false; };
  }, [token]);
  async function join() {
    setBusy(true); setJoinError("");
    try {
      const r = await fetch("/api/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "join", token, name }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Could not join. Try again.");
      setStatus(body.outcome === "asked" || body.outcome === "waiting" ? "asked" : body.outcome === "already" ? "member" : "joined");
    } catch (e) { setJoinError(e instanceof Error ? e.message : "Could not join."); }
    finally { setBusy(false); }
  }
  if (error) return <section className="join"><div className="join-card"><div className="join-banner" /><div className="join-body"><p className="join-eyebrow">Invite link</p><h1>This link doesn&apos;t work</h1><p className="join-text">{error}</p><div className="join-foot"><Link className="hub-button" href="/campaigns">Back to Campaigns</Link></div></div></div></section>;
  if (!invite) return <section className="join"><p className="hub-muted">Opening the invite…</p></section>;
  const signIn = `/account?mode=login&next=${encodeURIComponent(`/join/${token}`)}`;
  const by = `A${/^[aeiou]/i.test(invite.world) ? "n" : ""} ${invite.world ? `${invite.world} campaign` : "campaign"} run by ${invite.ownerName}`;
  return <section className="join"><div className="join-card">
    <div className="join-banner" />
    <div className="join-body">
      <p className="join-eyebrow">{status === "joined" || status === "member" ? "You're in" : "You're invited"}</p>
      <h1>{invite.campaign}</h1>
      <p className="join-by">{by}</p>
      {status === "invited" && <>
        <p className="join-as">You&apos;ll join as <Chip group={invite.group} /></p>
        {invite.can.length > 0 && <ul className="join-can">{invite.can.map(c => <li key={c}>{c}</li>)}</ul>}
        {invite.approve && <p className="join-text join-small">{invite.ownerName} lets people in from this link by hand, so you&apos;ll wait for their OK.</p>}
        <label className="join-name"><span>Your name in this campaign</span><input maxLength={40} value={name} onChange={e => setName(e.target.value)} /></label>
        {joinError && <p className="hub-error" role="alert">{joinError}</p>}
        <div className="join-foot">
          <button className="hub-button hub-button-primary" disabled={busy || !name.trim()} onClick={() => void join()}><Check size={15} aria-hidden="true" />{invite.approve ? "Ask to join" : "Join campaign"}</button>
          <span className="hub-muted join-small">Signed in as {invite.name} · <a href={signIn}>Not you?</a></span>
        </div>
      </>}
      {status === "signedOut" && <>
        <p className="join-text">Sign in to join. Joining lets you open this campaign from any device without the secret link. You come back here after you sign in.</p>
        <div className="join-foot"><a className="hub-button hub-button-primary" href={signIn}>Sign in</a><a className="hub-button" href={`/account?mode=signup&next=${encodeURIComponent(`/join/${token}`)}`}>Create an account</a></div>
      </>}
      {(status === "asked" || status === "waiting") && <>
        <div className="join-wait"><Clock size={16} aria-hidden="true" /><div><strong>Asked to join</strong><p>{invite.ownerName} has been told and lets people in from this link by hand. The campaign shows up on your Campaigns page as soon as they do.</p></div></div>
        <div className="join-foot"><Link className="hub-button" href="/campaigns">Back to Campaigns</Link></div>
      </>}
      {(status === "joined" || status === "member") && <>
        <p className="join-text">{status === "joined" ? `You joined as ${invite.group.name}. ` : `You're already in this campaign as ${invite.group.name}. `}It&apos;s listed under Campaigns you&apos;re in.</p>
        <div className="join-foot"><Link className="hub-button hub-button-primary" href="/campaigns">Open Campaigns</Link></div>
      </>}
      {status === "owner" && <>
        <p className="join-text">This is your own campaign. This is the page people see when they open your {invite.group.name} link.</p>
        <div className="join-foot"><Link className="hub-button" href="/campaigns">Back to Campaigns</Link></div>
      </>}
      {status === "banned" && <>
        <p className="join-text">You can&apos;t join this campaign.</p>
        <div className="join-foot"><Link className="hub-button" href="/campaigns">Back to Campaigns</Link></div>
      </>}
    </div>
  </div></section>;
}
