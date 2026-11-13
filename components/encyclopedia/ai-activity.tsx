"use client";
/*
 * What connected AI apps changed in this campaign: a chip in the top bar ("AI connected · Claude") and
 * a side panel listing each change with Undo, plus "Pause the AI". Shown once a campaign has a connection.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Pause, Play, Undo2, X } from "lucide-react";
import "./ai-connection.css";

type Line = { id: string; at: string; connection: string; tool: string; summary: string; detail?: string; undone?: string; canUndo: boolean };
type State = { paused: boolean; entries: Line[]; connected: string[]; hasConnections: boolean };

const time = (iso: string) => {
  const d = new Date(iso), today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

export function AiActivity({ campaignId, onChanged }: { campaignId: string; onChanged: () => void }) {
  const [state, setState] = useState<State | null>(null), [open, setOpen] = useState(false), [busy, setBusy] = useState(""), [note, setNote] = useState("");
  const newest = useRef<string | null>(null), changed = useRef(onChanged);
  useEffect(() => { changed.current = onChanged; }, [onChanged]);
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/encyclopedia/ai-activity?campaignId=${encodeURIComponent(campaignId)}`, { cache: "no-store" });
      if (!res.ok) return;
      const next = await res.json() as State;
      const top = next.entries[0]?.id ?? null;
      // A new line means the AI just saved something: fetch the workspace now instead of at the next poll.
      if (newest.current !== null && top !== newest.current) changed.current();
      newest.current = top ?? "";
      setState(next);
    } catch { /* Try again at the next poll. */ }
  }, [campaignId]);
  useEffect(() => {
    newest.current = null;
    const first = setTimeout(load, 0);
    const tick = setInterval(() => { if (!document.hidden) void load(); }, open ? 4000 : 10000);
    return () => { clearTimeout(first); clearInterval(tick); };
  }, [load, open]);

  async function act(action: "undo" | "pause" | "resume", id?: string) {
    setBusy(id ?? action); setNote("");
    try {
      const res = await fetch("/api/encyclopedia/ai-activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId, action, id }) });
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
    <button className={`ai-chip${state.paused ? " paused" : who ? " live" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="ai-activity" title="AI activity">
      <Bot size={15}/><span>{state.paused ? "AI paused" : who ? <>AI connected<span className="ai-chip-name"> · {who}</span></> : "AI activity"}</span>
    </button>
    {open && <aside className="ai-panel" id="ai-activity" aria-label="AI activity">
      <div className="ai-panel-head"><Bot size={16}/><h2>AI activity</h2><span className="ai-panel-who">{state.paused ? "Paused" : who ?? "Not connected now"}</span><button className="icon-button" aria-label="Close AI activity" onClick={() => setOpen(false)}><X size={16}/></button></div>
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
    </aside>}
  </>;
}
