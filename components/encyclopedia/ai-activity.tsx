"use client";
/*
 * What connected AI apps changed in this campaign: a chip in the top bar ("AI connected · Claude") and
 * a side panel listing each change with Undo, plus "Pause the AI". Shown once a campaign has a connection.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, Check, Dices, Map as MapIcon, Pause, Play, ScrollText, Undo2, User, X } from "lucide-react";
import "./ai-connection.css";

type Line = { id: string; at: string; connection: string; tool: string; summary: string; detail?: string; undone?: string; canUndo: boolean };
/** Where a suggested move would put a token, for the dashed token on the map. */
export type SuggestedMove = { id: string; sceneId: string; tokenId: string; x: number; y: number; label: string };
type Waiting = { id: string; at: string; connection: string; tool: string; summary: string; detail?: string; args: Record<string, unknown>; preview?: Omit<SuggestedMove, "id" | "label"> };
type State = { paused: boolean; waiting?: Waiting[]; entries: Line[]; connected: string[]; hasConnections: boolean };

/** The approve button says what it does. */
const verb = (tool: string) => ({ move_token: "Move", roll: "Roll it", set_condition: "Add", damage: "Apply", heal: "Heal", reveal_fog: "Reveal", show_token: "Show", start_combat: "Start", next_turn: "Next turn", end_combat: "End" } as Record<string, string>)[tool] ?? "Approve";
const icon = (tool: string) => tool === "roll" ? <Dices size={15}/> : ["move_token", "reveal_fog", "show_token"].includes(tool) ? <MapIcon size={15}/> : ["damage", "heal", "set_condition"].includes(tool) ? <User size={15}/> : <ScrollText size={15}/>;
/** The fields the GM can change before approving: plain text, numbers and on/off. */
const editable = (args: Record<string, unknown>) => Object.entries(args).filter(([, v]) => ["string", "number", "boolean"].includes(typeof v));

const time = (iso: string) => {
  const d = new Date(iso), today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

/** Shown in the Encyclopedia (by campaign) and in Maptable (by its own campaign id, matched to the paired one). */
/** A tool argument as a form label: "to" reads "Move to", "playerSummary" reads "Player summary". */
const argNames: Record<string, string> = { to: "Move to", as: "Roll as", for: "What for", on: "On" };
const argName = (k: string) => argNames[k] ?? (k[0]!.toUpperCase() + k.slice(1).replace(/([A-Z])/g, " $1").toLowerCase());

export function AiActivity({ campaignId, maptableCampaignId, combat, onChanged, onSuggestedMoves, onSettings }: {
  campaignId?: string; maptableCampaignId?: string; combat?: { round: number; turn: string; next?: string } | null; onChanged: () => void;
  /** Maptable: the moves waiting for an OK, to draw as dashed tokens. */
  onSuggestedMoves?: (moves: SuggestedMove[]) => void;
  /** Opens "What it may do" for the connections. Without it, the link goes to the Encyclopedia. */
  onSettings?: () => void;
}) {
  const [state, setState] = useState<State | null>(null), [open, setOpen] = useState(false), [busy, setBusy] = useState(""), [note, setNote] = useState(""), [top, setTop] = useState(48);
  const [changing, setChanging] = useState<{ id: string; args: Record<string, unknown> } | null>(null);
  const newest = useRef<string | null>(null), changed = useRef(onChanged), chip = useRef<HTMLButtonElement>(null), moves = useRef(onSuggestedMoves), lastMoves = useRef("[]");
  useEffect(() => { moves.current = onSuggestedMoves; }, [onSuggestedMoves]);
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
      const shown = (next.waiting ?? []).flatMap(w => w.preview ? [{ ...w.preview, id: w.id, label: w.summary }] : []);
      if (JSON.stringify(shown) !== lastMoves.current) { lastMoves.current = JSON.stringify(shown); moves.current?.(shown); }
    } catch { /* Try again at the next poll. */ }
  }, [campaignId, maptableCampaignId]); // eslint-disable-line react-hooks/exhaustive-deps -- `which` is made from these two.
  useEffect(() => {
    newest.current = null;
    const first = setTimeout(load, 0);
    const tick = setInterval(() => { if (!document.hidden) void load(); }, open ? 4000 : 10000);
    return () => { clearTimeout(first); clearInterval(tick); };
  }, [load, open]);

  async function act(action: "undo" | "pause" | "resume" | "approve" | "skip" | "approveAll", id?: string, args?: Record<string, unknown>) {
    setBusy(id ?? action); setNote("");
    try {
      const res = await fetch("/api/encyclopedia/ai-activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...which, action, id, ...(args ? { args } : {}) }) });
      const body = await res.json() as { error?: string; kept?: string[]; problems?: string[] };
      if (!res.ok) throw Error(body.error ?? "Could not do that.");
      if (action === "undo") { changed.current(); if (body.kept?.length) setNote(`Undone, except ${body.kept.join(", ")}: changed again since, so it was left as it is.`); }
      if (action === "approve" || action === "approveAll") { changed.current(); setChanging(null); if (body.problems?.length) setNote(`Not done: ${body.problems.join(" · ")}`); }
      if (action === "skip") setChanging(null);
      await load();
    } catch (e) { setNote(e instanceof Error ? e.message : "Could not do that."); }
    finally { setBusy(""); }
  }

  if (!state?.hasConnections) return null;
  const who = state.connected[0], waiting = state.waiting ?? [];
  return <>
    <button ref={chip} className={`ai-chip${state.paused ? " paused" : waiting.length ? " asking" : who ? " live" : ""}`} onClick={() => { setTop(chip.current?.closest("header")?.getBoundingClientRect().bottom ?? 48); setOpen(!open); }} aria-expanded={open} aria-controls="ai-activity" title="AI activity">
      <Bot size={15}/><span>{state.paused ? "AI paused" : waiting.length ? <><span className="ai-chip-name">{waiting[0].connection} is helping · </span>{waiting.length} to approve</> : who && combat ? "AI is running combat" : who ? <>AI connected<span className="ai-chip-name"> · {who}</span></> : "AI activity"}</span>
    </button>
    {/* In document.body, so the panel sits above the map's own layers. */}
    {open && createPortal(<aside className="ai-panel" id="ai-activity" aria-label="AI activity" style={{ top }}>
      <div className="ai-panel-head"><Bot size={16}/><h2>AI activity</h2><span className="ai-panel-who">{state.paused ? "Paused" : who ?? "Not connected now"}</span><button className="icon-button" aria-label="Close AI activity" onClick={() => setOpen(false)}><X size={16}/></button></div>
      {combat && <p className="ai-panel-combat"><span>Round {combat.round}</span><strong>{combat.turn}’s turn</strong>{combat.next && <span>Next: {combat.next}</span>}</p>}
      {note && <p className="ai-panel-note" role="status">{note}</p>}
      {waiting.length > 0 && <section className="ai-waiting" aria-label="Waiting for you">
        <div className="ai-waiting-head"><h3>Waiting for you · {waiting.length}</h3>{waiting.length > 1 && <button className="button small" disabled={!!busy} onClick={() => void act("approveAll")}>{busy === "approveAll" ? "Approving…" : "Approve all"}</button>}</div>
        <ol>{[...waiting].reverse().map(w => <li key={w.id}>
          <span className="ai-waiting-icon" aria-hidden>{icon(w.tool)}</span>
          <div>
            <strong>{w.summary}</strong>
            {w.detail && <span>{w.detail}</span>}
            {w.preview && <span>Shown on the map as a dashed token.</span>}
            {changing?.id === w.id ? <form className="ai-change" onSubmit={e => { e.preventDefault(); void act("approve", w.id, changing.args); }}>
              {editable(changing.args).map(([k, v]) => <label key={k}><span>{argName(k)}</span>{typeof v === "boolean"
                ? <input type="checkbox" checked={v} onChange={e => setChanging({ id: w.id, args: { ...changing.args, [k]: e.target.checked } })}/>
                : <input value={String(v)} inputMode={typeof v === "number" ? "numeric" : undefined} onChange={e => setChanging({ id: w.id, args: { ...changing.args, [k]: typeof v === "number" ? (e.target.value.trim() === "" ? "" : Number(e.target.value)) : e.target.value } })}/>}</label>)}
              <div className="ai-waiting-actions"><button type="submit" className="button small primary" disabled={!!busy}><Check size={14}/> {busy === w.id ? "Working…" : verb(w.tool)}</button><button type="button" className="button small" onClick={() => setChanging(null)}>Cancel</button></div>
            </form> : <div className="ai-waiting-actions">
              <button className="button small primary" disabled={!!busy} onClick={() => void act("approve", w.id)}><Check size={14}/> {busy === w.id ? "Working…" : verb(w.tool)}</button>
              {editable(w.args).length > 0 && <button className="button small" disabled={!!busy} onClick={() => setChanging({ id: w.id, args: w.args })}>Change</button>}
              <button className="button small quiet" disabled={!!busy} onClick={() => void act("skip", w.id)}>Skip</button>
            </div>}
            <small>{w.connection} · {time(w.at)}</small>
          </div>
        </li>)}</ol>
      </section>}
      {waiting.length > 0 && state.entries.length > 0 && <h3 className="ai-done-head">Done</h3>}
      {state.entries.length ? <ol className="ai-feed">{state.entries.map(e => <li key={e.id} className={e.undone ? "undone" : ""}>
        <time dateTime={e.at}>{time(e.at)}</time>
        <div><strong>{e.summary}</strong>{e.detail && <span>{e.detail}</span>}<small>{e.connection}{e.undone ? " · undone" : ""}</small></div>
        {e.canUndo && <button className="button small" disabled={!!busy} onClick={() => void act("undo", e.id)}><Undo2 size={14}/> {busy === e.id ? "Undoing…" : "Undo"}</button>}
      </li>)}</ol> : <p className="ai-panel-empty">Nothing yet. When a connected AI rolls dice or changes a page, it shows up here with an Undo button.</p>}
      <div className="ai-panel-foot">
        <button className="button small" disabled={!!busy} onClick={() => void act(state.paused ? "resume" : "pause")}>{state.paused ? <><Play size={14}/> Resume the AI</> : <><Pause size={14}/> Pause the AI</>}</button>
        {onSettings ? <button type="button" className="ai-settings-link" onClick={onSettings}>What it may do</button> : <a className="ai-settings-link" href="/encyclopedia">What it may do <small>(in the Encyclopedia, under Connect an AI)</small></a>}
        <p>{state.paused ? "The AI can still read, but every change is refused until you resume." : "While paused, the AI can still read but every change is refused until you resume."}</p>
      </div>
    </aside>, document.body)}
  </>;
}
