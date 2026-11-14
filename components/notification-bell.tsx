"use client";
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import type { Notice } from "@/lib/members-server";
import { Avatar, ago } from "./campaign-members";
import "./campaign-hub.css";
import "./campaign-members.css";

type Item = Notice & { waiting: boolean; answer?: "letIn" | "decline" };
const hubHref = (campaignId: string) => `/campaigns/${encodeURIComponent(`e:${campaignId}`)}?tab=members`;

/** The bell in the site header: who asked to join or joined your campaigns, with Let in and Decline right there. */
export default function NotificationBell() {
  const [items, setItems] = useState<Item[] | null>(null), [unread, setUnread] = useState(0), [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(""), [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/notifications", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(body => {
      if (live && body) { setItems(body.items ?? []); setUnread(body.unread ?? 0); }
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  async function markRead() {
    setUnread(0); setItems(list => list?.map(n => ({ ...n, read: true })) ?? null);
    await fetch("/api/notifications", { method: "POST" }).catch(() => {});
  }
  async function answer(n: Item, action: "letIn" | "decline") {
    setBusy(n.id); setError("");
    try {
      const r = await fetch("/api/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, campaignId: n.campaignId, userId: n.userId }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "That didn't save.");
      setItems(list => list?.map(x => x.campaignId === n.campaignId && x.userId === n.userId && x.kind === "ask" ? { ...x, waiting: false, answer: action } : x) ?? null);
    } catch (e) { setError(e instanceof Error ? e.message : "That didn't save."); }
    finally { setBusy(""); }
  }
  if (!items) return null;
  return <div className="bell" ref={ref}>
    <button className="bell-button" aria-label={unread ? `Notifications, ${unread} new` : "Notifications"} aria-expanded={open} onClick={() => setOpen(!open)}>
      <Bell size={18} aria-hidden="true" />{unread > 0 && <span className="bell-count">{unread > 9 ? "9+" : unread}</span>}
    </button>
    {open && <div className="bell-panel" role="dialog" aria-label="Notifications">
      <div className="bell-head"><h2>Notifications</h2>{unread > 0 && <button className="mem-link" onClick={() => void markRead()}>Mark all read</button>}</div>
      {error && <p className="hub-error bell-error" role="alert">{error}</p>}
      {items.length ? <ul className="bell-list">{items.map(n => <li key={n.id} className={n.read ? undefined : "bell-unread"}>
        <Avatar name={n.name} seed={n.userId} />
        <div>
          <p><strong>{n.name}</strong> {n.kind === "ask" ? "asked to join" : "joined"} <strong>{n.campaign}</strong>{n.group ? ` as ${n.group}` : ""}.</p>
          <small>Used the {n.group || "invite"} link · {ago(n.at)}</small>
          {n.kind === "ask" && n.waiting && <div className="bell-actions">
            <button className="hub-button" disabled={!!busy} onClick={() => void answer(n, "decline")}>Decline</button>
            <button className="hub-button hub-button-primary" disabled={!!busy} onClick={() => void answer(n, "letIn")}>Let in</button>
          </div>}
          {n.kind === "ask" && !n.waiting && <small className="bell-done">{n.answer === "decline" ? "Declined" : n.answer === "letIn" ? "Let in" : "Answered"}</small>}
          {n.kind === "join" && <a className="bell-link" href={hubHref(n.campaignId)}>Change their groups</a>}
        </div>
        {!n.read && <span className="bell-dot" aria-label="New" />}
      </li>)}</ul> : <p className="hub-muted bell-empty">Nothing yet. When someone asks to join or joins one of your campaigns, it shows up here.</p>}
      <p className="bell-foot">Choose what you&apos;re told about under Members › Invite links.</p>
    </div>}
  </div>;
}
