"use client";
/*
 * What connected AI apps changed in this campaign: a chip in the top bar ("AI connected · Claude") and
 * a side panel listing each change with Undo, plus "Pause the AI". Shown once a campaign has a connection.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, BookOpen, Bot, Check, ChevronDown, Copy, Dices, Download, Map as MapIcon, Pause, Pencil, Play, Plus, ScrollText, Search, Send, Trash2, Undo2, User, X } from "lucide-react";
import { chatFileName, chatMarkdown, chatRecap, CONTEXT_TURNS, OPEN_CHAT_EVENT, type ChatMeta, type RecapPick, type SavedChat } from "@/lib/ai/chat-text";
import "./ai-connection.css";

type Line = { id: string; at: string; connection: string; tool: string; summary: string; detail?: string; undone?: string; canUndo: boolean };
/** Where a suggested move would put a token, for the dashed token on the map. */
export type SuggestedMove = { id: string; sceneId: string; tokenId: string; x: number; y: number; label: string };
type Waiting = { id: string; at: string; connection: string; tool: string; summary: string; detail?: string; args: Record<string, unknown>; preview?: Omit<SuggestedMove, "id" | "label"> };
/** A connection made with an API key: the GM can ask it from this panel. */
type Chat = { id: string; name: string; provider: string; model: string };
type State = { paused: boolean; waiting?: Waiting[]; entries: Line[]; connected: string[]; hasConnections: boolean; chat?: Chat[] };
type Step = { tool: string; title: string; ok: boolean; waiting?: string; summary?: string };
type Said = { role: "user" | "assistant"; text: string; steps?: Step[]; error?: true };
/** The chat open in the panel. Chats are saved with the campaign on the server; this tab remembers which one was open. */
type Open = { key: string; id: string | null; title?: string; savedAt?: string; turns: Said[] };
const remembered = (key: string) => { try { return sessionStorage.getItem(key); } catch { return null; } };
const remember = (key: string, id: string | null) => { try { if (id) sessionStorage.setItem(key, id); else sessionStorage.removeItem(key); } catch { /* Private windows may block storage. */ } };
/** Saved chats under Today, This week and Older. */
const groups = (list: ChatMeta[]) => {
  const today = new Date().toDateString(), week = Date.now() - 7 * 86_400_000, out: [string, ChatMeta[]][] = [["Today", []], ["This week", []], ["Older", []]];
  for (const c of list) out[new Date(c.updatedAt).toDateString() === today ? 0 : Date.parse(c.updatedAt) > week ? 1 : 2][1].push(c);
  return out.filter(([, l]) => l.length);
};

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

export function AiActivity({ campaignId, maptableCampaignId, combat, scene, onChanged, onSuggestedMoves, onSettings }: {
  campaignId?: string; maptableCampaignId?: string; combat?: { round: number; turn: string; next?: string } | null; onChanged: () => void;
  /** Maptable: the open scene, so the AI knows what the GM is looking at. */
  scene?: string;
  /** Maptable: the moves waiting for an OK, to draw as dashed tokens. */
  onSuggestedMoves?: (moves: SuggestedMove[]) => void;
  /** Opens "What it may do" for the connections. Without it, the link goes to the Encyclopedia. */
  onSettings?: () => void;
}) {
  const [state, setState] = useState<State | null>(null), [open, setOpen] = useState(false), [busy, setBusy] = useState(""), [note, setNote] = useState(""), [top, setTop] = useState(48);
  const [changing, setChanging] = useState<{ id: string; args: Record<string, unknown> } | null>(null);
  const [tab, setTab] = useState<"ask" | "activity">("ask"), [talkTo, setTalkTo] = useState(""), [chatLog, setChatLog] = useState<Open>({ key: "", id: null, turns: [] }), [draft, setDraft] = useState(""), [thinking, setThinking] = useState(false);
  const [history, setHistory] = useState<{ key: string; list: ChatMeta[] | null }>({ key: "", list: null }), [menu, setMenu] = useState<"" | "list" | "export">(""), [find, setFind] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null), [deleting, setDeleting] = useState(""), [chatNote, setChatNote] = useState<{ text: string; href?: string; link?: string; error?: boolean } | null>(null);
  const [posting, setPosting] = useState<{ chat: SavedChat; campaign?: string; pick: RecapPick; title: string; text: string } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
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

  const chats = state?.chat ?? [], chat = chats.find(c => c.id === talkTo) ?? chats[0];
  const campaignKey = campaignId ?? maptableCampaignId ?? "", openKey = `rpg-ai-chat-open:${campaignKey}`;
  const current: Open = chatLog.key === campaignKey ? chatLog : { key: campaignKey, id: null, turns: [] };
  const said = current.turns, list = history.key === campaignKey ? history.list : null;
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [said.length, current.id, thinking, open, tab]);

  const chatsUrl = (extra: Record<string, string> = {}) => `/api/encyclopedia/ai-chats?${new URLSearchParams({ ...which, ...extra })}`;
  async function loadList() {
    try {
      const res = await fetch(chatsUrl(), { cache: "no-store" }), body = await res.json() as { chats?: ChatMeta[]; error?: string };
      if (res.ok) setHistory({ key: campaignKey, list: body.chats ?? [] });
    } catch { /* The list loads again when the panel opens. */ }
  }
  async function fetchChat(id: string, full = false) {
    const res = await fetch(chatsUrl({ chatId: id, ...(full ? { full: "1" } : {}) }), { cache: "no-store" }), body = await res.json() as { chat?: SavedChat; campaign?: string; error?: string };
    if (!res.ok || !body.chat) throw Error(body.error ?? "Could not open that chat.");
    return { chat: body.chat, campaign: body.campaign };
  }
  async function openChat(id: string) {
    setMenu(""); setChatNote(null);
    try {
      const { chat: saved } = await fetchChat(id);
      setChatLog({ key: campaignKey, id: saved.id, title: saved.title, savedAt: saved.updatedAt, turns: saved.turns.map(t => ({ role: t.role, text: t.text, ...(t.steps ? { steps: t.steps } : {}) })) });
      remember(openKey, saved.id);
      if (chats.some(c => c.id === saved.connectionId)) setTalkTo(saved.connectionId);
    } catch (e) { remember(openKey, null); setChatNote({ text: e instanceof Error ? e.message : "Could not open that chat.", error: true }); }
  }
  function newChat() { setChatLog({ key: campaignKey, id: null, turns: [] }); remember(openKey, null); setMenu(""); setChatNote(null); }
  /** Opening the panel loads the saved chats, and reopens the chat this tab had open. */
  function showPanel(chatId?: string) {
    setTop(chip.current?.closest("header")?.getBoundingClientRect().bottom ?? 48); setOpen(true);
    void loadList();
    const id = chatId ?? (current.id ? null : remembered(openKey));
    if (chatId) setTab("ask");
    if (id) void openChat(id);
  }
  // "Open the chat" on a session page made from a chat.
  const opener = useRef(showPanel);
  useEffect(() => { opener.current = showPanel; });
  useEffect(() => {
    const on = (e: Event) => { const id = (e as CustomEvent<string>).detail; if (typeof id === "string") opener.current(id); };
    window.addEventListener(OPEN_CHAT_EVENT, on);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, on);
  }, []);

  async function ask() {
    const text = draft.trim();
    if (!text || !chat || thinking) return;
    const next: Said[] = [...said.filter(m => !m.error), { role: "user", text }];
    setChatLog({ ...current, turns: next }); setDraft(""); setThinking(true); setMenu(""); setChatNote(null);
    try {
      const res = await fetch("/api/encyclopedia/ai-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...which, connectionId: chat.id, scene, ...(current.id ? { chatId: current.id } : {}), messages: next.slice(-CONTEXT_TURNS).map(m => ({ role: m.role, text: m.text })) }) });
      const body = await res.json() as { reply?: string; steps?: Step[]; toolsOff?: boolean; error?: string; chat?: ChatMeta };
      if (!res.ok) throw Error(body.error ?? "Could not ask the AI.");
      const reply = (body.reply || "(No answer.)") + (body.toolsOff ? "\n\n(This model can't use RPG Tools' tools, so it can only answer from what you tell it.)" : "");
      const done: Said[] = [...next, { role: "assistant", text: reply, steps: body.steps ?? [] }], meta = body.chat;
      setChatLog({ key: campaignKey, id: meta?.id ?? current.id, title: meta?.title ?? current.title, savedAt: meta?.updatedAt, turns: done });
      if (meta) { remember(openKey, meta.id); setHistory({ key: campaignKey, list: [meta, ...(list ?? []).filter(c => c.id !== meta.id)] }); }
      if (body.steps?.some(st => st.ok)) changed.current();
      await load();
    } catch (e) { setChatLog({ ...current, turns: [...next, { role: "assistant", text: e instanceof Error ? e.message : "Could not ask the AI.", error: true }] }); }
    finally { setThinking(false); }
  }

  async function change(action: "rename" | "delete", id: string, title?: string) {
    setBusy(`${action}:${id}`);
    try {
      const res = await fetch("/api/encyclopedia/ai-chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...which, chatId: id, action, ...(title !== undefined ? { title } : {}) }) });
      const body = await res.json() as { chats?: ChatMeta[]; error?: string };
      if (!res.ok) throw Error(body.error ?? "Could not change that chat.");
      setHistory({ key: campaignKey, list: body.chats ?? [] }); setRenaming(null); setDeleting("");
      if (action === "delete" && id === current.id) newChat();
      if (action === "rename" && id === current.id) setChatLog({ ...current, title: body.chats?.find(c => c.id === id)?.title ?? title });
    } catch (e) { setChatNote({ text: e instanceof Error ? e.message : "Could not change that chat.", error: true }); }
    finally { setBusy(""); }
  }
  /** Export: a Markdown file, the clipboard, a session page or a Discord recap. */
  async function exportChat(how: "markdown" | "copy" | "session" | "discord") {
    if (!current.id) return;
    setMenu(""); setChatNote(null); setBusy(how);
    try {
      const { chat: full, campaign } = await fetchChat(current.id, true);
      if (how === "markdown" || how === "copy") {
        const text = chatMarkdown(full, { campaign });
        if (how === "copy") { await navigator.clipboard.writeText(text); setChatNote({ text: "Copied the whole chat." }); }
        else {
          const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/markdown" })); a.download = chatFileName(full.title);
          a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        }
      } else if (how === "discord") {
        const pick = { answers: true, questions: false, steps: true };
        setPosting({ chat: full, campaign, pick, title: full.title, text: chatRecap(full, pick) });
      } else {
        const res = await fetch("/api/encyclopedia/ai-chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...which, chatId: full.id, action: "session" }) });
        const body = await res.json() as { page?: { id: string; title: string; folder: string | null }; error?: string };
        if (!res.ok || !body.page) throw Error(body.error ?? "Could not save the session page.");
        changed.current();
        setChatNote({ text: `Saved as a session page${body.page.folder ? ` in ${body.page.folder}` : ""}, as a GM secret.`, href: `/encyclopedia?entry=${encodeURIComponent(body.page.id)}`, link: `Open “${body.page.title}”` });
      }
    } catch (e) { setChatNote({ text: e instanceof Error ? e.message : "Could not export the chat.", error: true }); }
    finally { setBusy(""); }
  }
  async function postRecap() {
    if (!posting) return;
    setBusy("post");
    try {
      const res = await fetch("/api/encyclopedia/ai-chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...which, chatId: posting.chat.id, action: "discord", title: posting.title, text: posting.text }) });
      const body = await res.json() as { skipped?: boolean; error?: string };
      if (!res.ok) throw Error(body.error ?? "Could not post to Discord.");
      setPosting(null);
      setChatNote(body.skipped ? { text: "Not posted: this campaign has no Discord channel for recaps. Choose one in Maptable › Connections.", error: true } : { text: "Posted the recap to Discord." });
    } catch (e) { setChatNote({ text: e instanceof Error ? e.message : "Could not post to Discord.", error: true }); setPosting(null); }
    finally { setBusy(""); }
  }

  if (!state?.hasConnections) return null;
  const who = state.connected[0], waiting = state.waiting ?? [], showing = chat ? tab : "activity";
  const card = (w: Waiting) => <>
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
  </>;
  /** Under an answer: what it looked up, and anything it asked for, with the same buttons as the Activity tab. */
  const steps = (list: Step[]) => {
    const looked = [...new Set(list.filter(st => !st.waiting).map(st => st.title))];
    return <>
      {list.filter(st => st.waiting).map(st => {
        const w = waiting.find(x => x.id === st.waiting), line = state.entries.find(x => x.id === st.waiting) as (Line & { decided?: string }) | undefined;
        return w ? <div key={st.waiting} className="ai-chat-card">{card(w)}</div> : <p key={st.waiting} className="ai-chat-decided"><Check size={13}/> {st.summary}{line?.undone ? " · undone" : ""}</p>;
      })}
      {looked.length > 0 && <p className="ai-chat-used">Used: {looked.join(", ")}</p>}
    </>;
  };
  return <>
    <button ref={chip} className={`ai-chip${state.paused ? " paused" : waiting.length ? " asking" : who ? " live" : ""}`} onClick={() => { if (open) setOpen(false); else showPanel(); }} aria-expanded={open} aria-controls="ai-activity" title="AI activity">
      <Bot size={15}/><span>{state.paused ? "AI paused" : !waiting.length && chat && !who ? <>Ask<span className="ai-chip-name"> {chat.name}</span></> : waiting.length ? <><span className="ai-chip-name">{waiting[0].connection} is helping · </span>{waiting.length} to approve</> : who && combat ? "AI is running combat" : who ? <>AI connected<span className="ai-chip-name"> · {who}</span></> : "AI activity"}</span>
    </button>
    {/* In document.body, so the panel sits above the map's own layers. */}
    {open && createPortal(<aside className="ai-panel" id="ai-activity" aria-label="AI activity" style={{ top }}>
      <div className="ai-panel-head"><Bot size={16}/>{chat ? <div className="ai-panel-tabs" role="tablist">
        <button role="tab" aria-selected={showing === "ask"} onClick={() => setTab("ask")}>Ask {chat.name}</button>
        <button role="tab" aria-selected={showing === "activity"} onClick={() => setTab("activity")}>Activity{waiting.length ? ` · ${waiting.length} waiting` : ""}</button>
      </div> : <><h2>AI activity</h2><span className="ai-panel-who">{state.paused ? "Paused" : who ?? "Not connected now"}</span></>}<button className="icon-button" aria-label="Close AI activity" onClick={() => setOpen(false)}><X size={16}/></button></div>
      {showing === "ask" && chat && <>
        {chats.length > 1 && <label className="ai-chat-pick">Ask <select value={chat.id} onChange={e => setTalkTo(e.target.value)}>{chats.map(c => <option key={c.id} value={c.id}>{c.name} ({c.provider})</option>)}</select></label>}
        <div className="ai-chat-bar">
          <button type="button" className="ai-chat-title" aria-expanded={menu === "list"} aria-haspopup="true" disabled={thinking} onClick={() => { setMenu(menu === "list" ? "" : "list"); setFind(""); setRenaming(null); setDeleting(""); if (menu !== "list") void loadList(); }}><span>{current.title ?? "New chat"}</span><ChevronDown size={14}/></button>
          {current.id && <button type="button" className="button small" aria-expanded={menu === "export"} aria-haspopup="true" disabled={thinking || !!busy} onClick={() => setMenu(menu === "export" ? "" : "export")}><Download size={13}/> Export</button>}
          <button type="button" className="button small" disabled={thinking || (!current.id && !said.length)} onClick={newChat}><Plus size={13}/> New</button>
          {menu === "list" && <div className="ai-chat-menu ai-chat-list" role="dialog" aria-label="Saved chats">
            <label className="ai-chat-find"><Search size={13}/><input autoFocus value={find} placeholder="Search chats" aria-label="Search chats" onChange={e => setFind(e.target.value)}/></label>
            {list === null ? <p className="ai-chat-menu-empty">Loading…</p> : !list.length ? <p className="ai-chat-menu-empty">No saved chats yet. Ask something and the chat is saved here.</p> : (() => {
              const q = find.trim().toLowerCase(), shown = list.filter(c => !q || `${c.title} ${c.scene ?? ""} ${c.connectionName}`.toLowerCase().includes(q));
              return shown.length ? groups(shown).map(([label, items]) => <section key={label}><h4>{label}</h4><ul>{items.map(c => <li key={c.id} className={c.id === current.id ? "on" : ""}>
                {renaming?.id === c.id ? <form className="ai-chat-rename" onSubmit={e => { e.preventDefault(); void change("rename", c.id, renaming.title); }}><input autoFocus value={renaming.title} maxLength={80} aria-label="Chat name" onChange={e => setRenaming({ id: c.id, title: e.target.value })}/><button className="button small primary" disabled={!renaming.title.trim() || !!busy}>Save</button><button type="button" className="button small quiet" onClick={() => setRenaming(null)}>Cancel</button></form>
                : deleting === c.id ? <div className="ai-chat-confirm"><span>Delete “{c.title}”?</span><button className="button small danger" disabled={!!busy} onClick={() => void change("delete", c.id)}>{busy === `delete:${c.id}` ? "Deleting…" : "Delete"}</button><button className="button small quiet" onClick={() => setDeleting("")}>Keep</button></div>
                : <><button type="button" className="ai-chat-open" onClick={() => void openChat(c.id)}><strong>{c.title}</strong><small>{[c.connectionName, c.scene, `${c.count} messages`, time(c.updatedAt)].filter(Boolean).join(" · ")}</small></button>
                  <button type="button" className="icon-button" aria-label={`Rename ${c.title}`} title="Rename" onClick={() => setRenaming({ id: c.id, title: c.title })}><Pencil size={13}/></button>
                  <button type="button" className="icon-button" aria-label={`Delete ${c.title}`} title="Delete" onClick={() => setDeleting(c.id)}><Trash2 size={13}/></button></>}
              </li>)}</ul></section>) : <p className="ai-chat-menu-empty">No chats match “{find.trim()}”.</p>;
            })()}
            <p className="ai-chat-menu-foot">Kept with this campaign on your account, so they’re here on any device. Only you see them, never your players.</p>
          </div>}
          {menu === "export" && <div className="ai-chat-menu ai-chat-export" role="menu" aria-label="Export this chat">
            <button role="menuitem" onClick={() => void exportChat("markdown")}><Download size={15}/><span><strong>Download as Markdown</strong><small>A .md file you can keep, print or paste anywhere.</small></span></button>
            <button role="menuitem" onClick={() => void exportChat("copy")}><Copy size={15}/><span><strong>Copy as text</strong><small>The whole chat, ready to paste.</small></span></button>
            <button role="menuitem" onClick={() => void exportChat("session")}><BookOpen size={15}/><span><strong>Save as a session page</strong><small>A new Session page in the Encyclopedia, kept as a GM secret until you share it.</small></span></button>
            <button role="menuitem" onClick={() => void exportChat("discord")}><Send size={15}/><span><strong>Post to Discord as a recap</strong><small>Pick what to post and check it first. Goes to your recaps channel.</small></span></button>
          </div>}
        </div>
        {chatNote && <p className={`ai-chat-note${chatNote.error ? " error" : ""}`} role="status">{chatNote.text}{chatNote.href && <> <a href={chatNote.href}>{chatNote.link}</a></>}<button type="button" aria-label="Dismiss" onClick={() => setChatNote(null)}><X size={12}/></button></p>}
        <div className="ai-chat" aria-live="polite">
          {!said.length && <p className="ai-panel-empty">Ask {chat.name} about this campaign{scene ? " or the open scene" : ""}: what a monster does on its turn, a line of read-aloud, a name for the innkeeper. What it may change follows What it may do, so moves and rolls can wait for your OK here. Every chat is saved with the campaign, so you can come back to it.</p>}
          {said.map((m, i) => m.role === "user" ? <p key={i} className="ai-chat-me">{m.text}</p> : <div key={i} className={`ai-chat-ai${m.error ? " error" : ""}`}>{m.text.split(/\n{2,}/).map((para, j) => <p key={j}>{para}</p>)}{m.steps && steps(m.steps)}</div>)}
          {thinking && <p className="ai-chat-thinking">{chat.name} is thinking…</p>}
          {!thinking && current.savedAt && <p className="ai-chat-saved"><Check size={12}/> Saved to this campaign · {time(current.savedAt)}</p>}
          <div ref={bottom}/>
        </div>
        <form className="ai-chat-box" onSubmit={e => { e.preventDefault(); void ask(); }}>
          <div className="ai-chat-meta">{scene && <span>Sees: {scene}</span>}<span>{chat.model}</span></div>
          <div className="ai-chat-row"><textarea value={draft} rows={2} placeholder={`Ask ${chat.name}…`} aria-label={`Ask ${chat.name}`} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(); } }}/><button type="submit" className="button primary" aria-label="Send" disabled={!draft.trim() || thinking}><ArrowUp size={16}/></button></div>
        </form>
      </>}
      {showing === "activity" && <>
      {combat && <p className="ai-panel-combat"><span>Round {combat.round}</span><strong>{combat.turn}’s turn</strong>{combat.next && <span>Next: {combat.next}</span>}</p>}
      {note && <p className="ai-panel-note" role="status">{note}</p>}
      {waiting.length > 0 && <section className="ai-waiting" aria-label="Waiting for you">
        <div className="ai-waiting-head"><h3>Waiting for you · {waiting.length}</h3>{waiting.length > 1 && <button className="button small" disabled={!!busy} onClick={() => void act("approveAll")}>{busy === "approveAll" ? "Approving…" : "Approve all"}</button>}</div>
        <ol>{[...waiting].reverse().map(w => <li key={w.id}>{card(w)}</li>)}</ol>
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
      </>}
    </aside>, document.body)}
    {posting && createPortal(<div className="ai-post-backdrop" onClick={e => { if (e.target === e.currentTarget && busy !== "post") setPosting(null); }}>
      <form className="ai-post" role="dialog" aria-modal="true" aria-label={`Post “${posting.chat.title}” to Discord`} onSubmit={e => { e.preventDefault(); void postRecap(); }}>
        <div className="ai-post-head"><h2>Post “{posting.chat.title}” to Discord</h2><button type="button" className="icon-button" aria-label="Close" onClick={() => setPosting(null)}><X size={16}/></button></div>
        <div className="ai-post-body">
          <fieldset><legend>What to post</legend>
            {([["answers", `${posting.chat.connectionName}’s answers`], ["questions", "Your questions"], ["steps", "Rolls and approved moves"]] as const).map(([k, label]) => <label key={k}><input type="checkbox" checked={posting.pick[k]} onChange={e => { const pick = { ...posting.pick, [k]: e.target.checked }; setPosting({ ...posting, pick, text: chatRecap(posting.chat, pick) }); }}/> {label}</label>)}
            <p>Goes to the recaps channel chosen in Maptable › Connections › Discord. Ticking a box rewrites the preview; edit the text after that.</p>
          </fieldset>
          <div className="ai-post-preview">
            <span className="ai-post-label">Preview, you can edit it</span>
            <input value={posting.title} maxLength={120} aria-label="Recap title" onChange={e => setPosting({ ...posting, title: e.target.value })}/>
            <textarea value={posting.text} maxLength={4000} aria-label="Recap text" onChange={e => setPosting({ ...posting, text: e.target.value })}/>
            <small>{[posting.campaign, posting.chat.scene].filter(Boolean).join(" · ")}{posting.campaign || posting.chat.scene ? " · " : ""}{posting.text.length}/4000</small>
          </div>
        </div>
        <div className="ai-post-foot"><button type="button" className="button" onClick={() => setPosting(null)}>Cancel</button><button className="button primary" disabled={!posting.text.trim() || busy === "post"}><Send size={14}/> {busy === "post" ? "Posting…" : "Post to Discord"}</button></div>
      </form>
    </div>, document.body)}
  </>;
}
