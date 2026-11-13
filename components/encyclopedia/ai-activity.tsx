"use client";
/*
 * What connected AI apps changed in this campaign: a chip in the top bar ("AI connected · Claude") and
 * a side panel listing each change with Undo, plus "Pause the AI". Shown once a campaign has a connection.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, Pause, Play, Undo2, X } from "lucide-react";
import "./ai-connection.css";

type Line = { id: string; at: string; connection: string; tool: string; summary: string; detail?: string; undone?: string; canUndo: boolean };
type State = { paused: boolean; entries: Line[]; connected: string[]; hasConnections: boolean };

const time = (iso: string) => {
  const d = new Date(iso), today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

/** Shown in the Encyclopedia (by campaign) and in Maptable (by its own campaign id, matched to the paired one). */
export function AiActivity({ campaignId, maptableCampaignId, combat, onChanged }: { campaignId?: string; maptableCampaignId?: string; combat?: { round: number; turn: string; next?: string } | null; onChanged: () => void }) {
  const [state, setState] = useState<State | null>(null), [open, setOpen] = useState(false), [busy, setBusy] = useState(""), [note, setNote] = useState(""), [top, setTop] = useState(48);
  const newest = useRef<string | null>(null), changed = useRef(onChanged), chip = useRef<HTMLButtonElement>(null);
  const which: Record<string, string> = campaignId ? { campaignId } : { maptableCampaignId: maptableCampaignId ?? "" };
  useEffect(() => { changed.current = onChanged; }, [onChanged]);
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/encyclopedia/ai-activity?${new URLSearchParams(which)}`, { cache: "no-store" });
      if (!res.ok) return;
      const next = await res.json() as State;
      const latest = next.entries[0]?.id ?? "";
      // A new line means the AI just saved something: fetch the workspace now instead of at the next poll.
      if (newest.current !== null && latest !== newest.current) changed.current();
      newest.current = latest;
      setState(next);
    } catch { /* Try again at the next poll. */ }
  }, [campaignId, maptableCampaignId]); // eslint-disable-line react-hooks/exhaustive-deps -- `which` is made from these two.
  useEffect(() => {
    newest.current = null;
    const first = setTimeout(load, 0);
    const tick = setInterval(() => { if (!document.hidden) void load(); }, open ? 4000 : 10000);
    return () => { clearTimeout(first); clearInterval(tick); };
  }, [load, open]);

  async function act(action: "undo" | "pause" | "resume", id?: string) {
    setBusy(id ?? action); setNote("");
    try {
      const res = await fetch("/api/encyclopedia/ai-activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...which, action, id }) });
      const body = await res.json() as { error?: string; kept?: string[] };
      if (!res.ok) throw Error(body.error ?? "Could not do that.");
      if (action === "undo") { changed.current(); if (body.kept?.length) setNote(`Undone, except ${body.kept.join(", ")}: changed again since, so it was left as it is.`); }
      await load();
    } catch (e) { setNote(e instanceof Error ? e.message : "Could not do that."); }
    finally { setBusy(""); }
  }

  if (!state?.hasConnections) return null;
  const who = state.connected[0];
  return <>
    <button ref={chip} className={`ai-chip${state.paused ? " paused" : who ? " live" : ""}`} onClick={() => { setTop(chip.current?.closest("header")?.getBoundingClientRect().bottom ?? 48); setOpen(!open); }} aria-expanded={open} aria-controls="ai-activity" title="AI activity">
      <Bot size={15}/><span>{state.paused ? "AI paused" : who && combat ? "AI is running combat" : who ? <>AI connected<span className="ai-chip-name"> · {who}</span></> : "AI activity"}</span>
    </button>
    {/* In document.body, so the panel sits above the map's own layers. */}
    {open && createPortal(<aside className="ai-panel" id="ai-activity" aria-label="AI activity" style={{ top }}>
      <div className="ai-panel-head"><Bot size={16}/><h2>AI activity</h2><span className="ai-panel-who">{state.paused ? "Paused" : who ?? "Not connected now"}</span><button className="icon-button" aria-label="Close AI activity" onClick={() => setOpen(false)}><X size={16}/></button></div>
      {combat && <p className="ai-panel-combat"><span>Round {combat.round}</span><strong>{combat.turn}’s turn</strong>{combat.next && <span>Next: {combat.next}</span>}</p>}
      {note && <p className="ai-panel-note" role="status">{note}</p>}
      {state.entries.length ? <ol className="ai-feed">{state.entries.map(e => <li key={e.id} className={e.undone ? "undone" : ""}>
        <time dateTime={e.at}>{time(e.at)}</time>
        <div><strong>{e.summary}</strong>{e.detail && <span>{e.detail}</span>}<small>{e.connection}{e.undone ? " · undone" : ""}</small></div>
        {e.canUndo && <button className="button small" disabled={!!busy} onClick={() => void act("undo", e.id)}><Undo2 size={14}/> {busy === e.id ? "Undoing…" : "Undo"}</button>}
      </li>)}</ol> : <p className="ai-panel-empty">Nothing yet. When a connected AI rolls dice or changes a page, it shows up here with an Undo button.</p>}
      <div className="ai-panel-foot">
        <button className="button small" disabled={!!busy} onClick={() => void act(state.paused ? "resume" : "pause")}>{state.paused ? <><Play size={14}/> Resume the AI</> : <><Pause size={14}/> Pause the AI</>}</button>
        <p>{state.paused ? "The AI can still read, but every change is refused until you resume." : "While paused, the AI can still read but every change is refused until you resume."}</p>
      </div>
    </aside>, document.body)}
  </>;
}
