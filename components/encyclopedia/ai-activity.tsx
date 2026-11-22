"use client";
/*
 * What connected AI apps changed in this campaign: a chip in the top bar ("AI connected · Claude") and
 * a side panel listing each change with Undo, plus "Pause the AI". Shown once a campaign has a connection.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { ArrowUp, BookOpen, Bot, Paperclip, Check, ChevronDown, Copy, Dices, Download, Folder, Map as MapIcon, KeyRound, Maximize2, MessageSquare, Minimize2, PanelLeft, Pause, Play, Plus, ScrollText, Send, Undo2, User, X } from "lucide-react";
import { chatFileName, chatMarkdown, chatRecap, CONTEXT_TURNS, OPEN_CHAT_EVENT, takeAiRequest, type ChatFolder, type ChatMeta, type RecapPick, type SavedChat } from "@/lib/ai/chat-text";
import "./ai-connection.css";
import { keepMoved, keyFields } from "@/lib/ai/device-keys";
import { isChatModel } from "@/lib/ai/model-list";
import { ChatList, ConnectionMenu, ModelMenu, type ChatConnection, type ModelList } from "./ai-chat-parts";
import { AttachChips, readAttachments } from "./ai-attach";
import { ACCEPT, attachedLine, SEND_BUDGET, sizeOf, type Attachment, type AttachmentName } from "@/lib/ai/attachments";

type Line = { id: string; at: string; connection: string; tool: string; summary: string; detail?: string; undone?: string; canUndo: boolean };
/** Where a suggested move would put a token, for the dashed token on the map. */
export type SuggestedMove = { id: string; sceneId: string; tokenId: string; x: number; y: number; label: string };
type Waiting = { id: string; at: string; connection: string; tool: string; summary: string; detail?: string; args: Record<string, unknown>; preview?: Omit<SuggestedMove, "id" | "label"> };
/** `campaign`: the Encyclopedia campaign, for the Connection tab. */
type State = { paused: boolean; waiting?: Waiting[]; entries: Line[]; campaign?: string; connected: string[]; hasConnections: boolean; chat?: ChatConnection[] };
const ConnectionTab = dynamic(() => import("./ai-connection-tab"), { ssr: false, loading: () => <p className="ai-panel-empty">Loading…</p> });

/**
 * The campaign's theme, for what this panel draws in document.body (to sit above the map's own layers). That is outside
 * the page part wearing the theme, so a wrapper that draws no box takes the same hooks: the theme's class, the look's
 * accent and surface, and their variables.
 */
type Themed = { className: string; attrs: Record<string, string>; style: Record<string, string> };
const unthemed: Themed = { className: "", attrs: {}, style: {} };
function pageTheme(): Themed {
  const skin = document.querySelector(".campaign-skin"), look = document.querySelector("[data-look-accent],[data-look-surface]");
  const attrs: Record<string, string> = {}, style: Record<string, string> = {};
  for (const el of [look, skin]) if (el instanceof HTMLElement) {
    for (const a of ["data-look-accent", "data-look-surface"]) { const v = el.getAttribute(a); if (v) attrs[a] = v; }
    for (const p of Array.from(el.style)) if (p.startsWith("--")) style[p] = el.style.getPropertyValue(p);
  }
  return { className: skin ? "campaign-skin" : "", attrs, style };
}
type Step = { tool: string; title: string; ok: boolean; waiting?: string; summary?: string };
/**
 * An answer says which AI (`by`) and model wrote it, since a chat can switch partway. A question can carry files: with
 * their data while this tab has them, or only their names once the chat is opened again.
 */
type Said = { role: "user" | "assistant"; text: string; steps?: Step[]; error?: true; by?: string; model?: string; files?: (Attachment | AttachmentName)[] };
const hasData = (f: Attachment | AttachmentName): f is Attachment => "data" in f || "text" in f;
/**
 * The conversation as the server takes it. Files go again with later questions while they fit in SEND_BUDGET, newest
 * first, so the AI can still look at them; older ones are named in the text instead.
 */
function toSend(turns: Said[]) {
  let budget = SEND_BUDGET;
  return turns.slice(-CONTEXT_TURNS).reverse().map(m => {
    const files = (m.files ?? []).filter(hasData), size = files.reduce((n, f) => n + sizeOf(f), 0);
    const send = files.length > 0 && size <= budget;
    if (send) budget -= size;
    const named = m.files?.length && !send ? attachedLine(m.files.map(f => ({ name: f.name, kind: f.kind }))) : "";
    return { role: m.role, text: [m.text, named].filter(Boolean).join("\n\n"), ...(send ? { files } : {}) };
  }).reverse();
}
/**
 * The chat open in the panel. Chats are saved with the campaign on the server; this tab remembers which one was open.
 * `folder` is the chat's folder, or for a new chat the folder it will be saved in.
 */
type Open = { key: string; id: string | null; title?: string; savedAt?: string; folder?: string; turns: Said[] };
const remembered = (key: string) => { try { return sessionStorage.getItem(key); } catch { return null; } };
const remember = (key: string, id: string | null) => { try { if (id) sessionStorage.setItem(key, id); else sessionStorage.removeItem(key); } catch { /* Private windows may block storage. */ } };
/** The panel opens as a side panel or as a full page; this tab remembers which. */
const FULL_KEY = "rpg-ai-chat-full";

/** The approve button says what it does. */
const verb = (tool: string) => ({ move_token: "Move", roll: "Roll it", set_condition: "Add", damage: "Apply", heal: "Heal", reveal_fog: "Reveal", show_token: "Show", start_combat: "Start", next_turn: "Next turn", end_combat: "End", start_topic: "Post it" } as Record<string, string>)[tool] ?? "Approve";
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

export function AiActivity({ campaignId, maptableCampaignId, combat, scene, onChanged, onSuggestedMoves, onSettings, floating, openSignal }: {
  campaignId?: string; maptableCampaignId?: string; combat?: { round: number; turn: string; next?: string } | null; onChanged: () => void;
  /** Maptable: the open scene, so the AI knows what the GM is looking at. */
  scene?: string;
  /** Maptable: the moves waiting for an OK, to draw as dashed tokens. */
  onSuggestedMoves?: (moves: SuggestedMove[]) => void;
  /** Opens "What it may do" for the connections. Without it, the link goes to the Encyclopedia. */
  onSettings?: () => void;
  /** Opened from the AI button beside the dice on a page without its own panel: no chip in a top bar. */
  floating?: boolean;
  /** Opens the panel each time it goes up. */
  openSignal?: number;
}) {
  const [state, setState] = useState<State | null>(null), [open, setOpen] = useState(false), [busy, setBusy] = useState(""), [note, setNote] = useState(""), [top, setTop] = useState(48);
  const [changing, setChanging] = useState<{ id: string; args: Record<string, unknown> } | null>(null);
  const [themed, setThemed] = useState<Themed>(unthemed), [asking, setAsking] = useState(""), [connectKey, setConnectKey] = useState(0), [addKey, setAddKey] = useState(false);
  const [tab, setTab] = useState<"ask" | "activity" | "connection">("ask"), [talkTo, setTalkTo] = useState(""), [chatLog, setChatLog] = useState<Open>({ key: "", id: null, turns: [] }), [draft, setDraft] = useState(""), [thinking, setThinking] = useState(false);
  const [history, setHistory] = useState<{ key: string; list: ChatMeta[] | null; folders: ChatFolder[] }>({ key: "", list: null, folders: [] }), [menu, setMenu] = useState<"" | "list" | "export" | "model" | "ai">("");
  const [chatNote, setChatNote] = useState<{ text: string; href?: string; link?: string; error?: boolean } | null>(null);
  /** Full page: the chat fills the window, with the saved chats and folders in a sidebar. `side` opens that sidebar on a phone. */
  const [full, setFull] = useState(() => remembered(FULL_KEY) === "1"), [side, setSide] = useState(false);
  /** The model picked for each connection in this tab (else the connection's own), and the models each one's key can use. */
  const [modelFor, setModelFor] = useState<Record<string, string>>({}), [modelLists, setModelLists] = useState<Record<string, ModelList>>({});
  /** Files attached to the message being written. */
  const [files, setFiles] = useState<Attachment[]>([]), [reading, setReading] = useState(false), [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
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
      const next = await res.json() as State & { moved?: { id: string; key: string }[] };
      // A key an older version saved on the server comes back once: keep it on this device.
      keepMoved(next.moved);
      const latest = next.entries[0]?.id ?? "";
      // A new line means the AI just saved something: fetch the workspace now instead of at the next poll.
      if (newest.current !== null && latest !== newest.current) changed.current();
      newest.current = latest;
      setState(next);
      // A theme can arrive after the page: follow it.
      const t = pageTheme();
      setThemed(p => JSON.stringify(p) === JSON.stringify(t) ? p : t);
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
  const said = current.turns, list = history.key === campaignKey ? history.list : null, folders = history.key === campaignKey ? history.folders : [];
  const model = chat ? modelFor[chat.id] ?? chat.model : "";
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [said.length, current.id, thinking, open, tab, full]);
  // A click outside a drop-down closes it; so does Escape, which otherwise takes the full page back to the side panel.
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!(e.target as Element | null)?.closest?.("[data-ai-menu]")) setMenu(""); };
    const key = (e: KeyboardEvent) => { if (e.key !== "Escape") return; if (menu) setMenu(""); else if (side) setSide(false); };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open, menu, side]);
  function goFull(on: boolean) { setFull(on); setSide(false); setMenu(""); try { if (on) sessionStorage.setItem(FULL_KEY, "1"); else sessionStorage.removeItem(FULL_KEY); } catch { /* Private windows may block storage. */ } }

  const chatsUrl = (extra: Record<string, string> = {}) => `/api/encyclopedia/ai-chats?${new URLSearchParams({ ...which, ...extra })}`;
  async function loadList() {
    try {
      const res = await fetch(chatsUrl(), { cache: "no-store" }), body = await res.json() as { chats?: ChatMeta[]; folders?: ChatFolder[]; error?: string };
      if (res.ok) setHistory({ key: campaignKey, list: body.chats ?? [], folders: body.folders ?? [] });
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
      setChatLog({ key: campaignKey, id: saved.id, title: saved.title, savedAt: saved.updatedAt, folder: saved.folder, turns: saved.turns.map(t => ({ role: t.role, text: t.text, ...(t.steps ? { steps: t.steps } : {}), ...(t.by ? { by: t.by } : {}), ...(t.model ? { model: t.model } : {}), ...(t.files?.length ? { files: t.files } : {}) })) });
      remember(openKey, saved.id); setSide(false);
      // Carry on with the AI and model the chat last used.
      if (chats.some(c => c.id === saved.connectionId)) { setTalkTo(saved.connectionId); if (saved.model) setModelFor(m => ({ ...m, [saved.connectionId]: saved.model! })); }
    } catch (e) { remember(openKey, null); setChatNote({ text: e instanceof Error ? e.message : "Could not open that chat.", error: true }); }
  }
  function newChat(folder?: string) { setChatLog({ key: campaignKey, id: null, turns: [], ...(folder ? { folder } : {}) }); remember(openKey, null); setMenu(""); setChatNote(null); setSide(false); }
  /** Opening the panel loads the saved chats, and reopens the chat this tab had open. */
  function showPanel(chatId?: string) {
    setTop(chip.current?.closest("header")?.getBoundingClientRect().bottom ?? 48); setThemed(pageTheme()); setOpen(true);
    void loadList();
    // What another part of the page asked for (the dashboard's AI widget): a chat, a tab, or a question for a new chat.
    const req = takeAiRequest(), wanted = chatId ?? req.chat;
    if (req.ask) { setTab("ask"); setAsking(req.ask); return; }
    if (req.tab) setTab(req.tab);
    const id = wanted ?? (current.id ? null : remembered(openKey));
    if (wanted) setTab("ask");
    if (id) void openChat(id);
  }
  // "Open the chat" on a session page made from a chat.
  const opener = useRef(showPanel);
  useEffect(() => { opener.current = showPanel; });
  useEffect(() => {
    // With a chat's id, that chat; without one (the AI button beside the dice), the panel as it was.
    const on = (e: Event) => { const id = (e as CustomEvent<string | undefined>).detail; opener.current(typeof id === "string" ? id : undefined); };
    window.addEventListener(OPEN_CHAT_EVENT, on);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, on);
  }, []);

  useEffect(() => { if (openSignal) opener.current(); }, [openSignal]);
  // A question from the dashboard's AI widget, asked in a new chat once the panel knows which AI can chat.
  const asker = useRef(ask);
  useEffect(() => { asker.current = ask; });
  useEffect(() => {
    if (!asking || !state) return;
    const q = asking, t = setTimeout(() => { setAsking(""); if (state.chat?.length) void asker.current(q); }, 0);
    return () => clearTimeout(t);
  }, [asking, state]);

  /** `given`: a question from elsewhere (the dashboard), asked in a new chat. */
  async function ask(given?: string) {
    const fresh = given !== undefined, base: Open = fresh ? { key: campaignKey, id: null, turns: [] } : current;
    const text = (given ?? draft).trim(), attached = fresh ? [] : files;
    if ((!text && !attached.length) || !chat || thinking || reading) return;
    const next: Said[] = [...(fresh ? [] : said).filter(m => !m.error), { role: "user", text, ...(attached.length ? { files: attached } : {}) }];
    setChatLog({ ...base, turns: next }); if (!fresh) { setDraft(""); setFiles([]); } if (fresh) remember(openKey, null); setThinking(true); setMenu(""); setChatNote(null);
    try {
      const res = await fetch("/api/encyclopedia/ai-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...which, ...keyFields(chat.id), scene, model, ...(base.id ? { chatId: base.id } : base.folder ? { folder: base.folder } : {}), messages: toSend(next) }) });
      const body = await res.json() as { reply?: string; steps?: Step[]; toolsOff?: boolean; error?: string; chat?: ChatMeta };
      if (!res.ok) throw Error(body.error ?? "Could not ask the AI.");
      const reply = (body.reply || "(No answer.)") + (body.toolsOff ? "\n\n(This model can't use RPG Tools' tools, so it can only answer from what you tell it.)" : "");
      const done: Said[] = [...next, { role: "assistant", text: reply, steps: body.steps ?? [], by: chat.name, model }], meta = body.chat;
      setChatLog({ key: campaignKey, id: meta?.id ?? base.id, title: meta?.title ?? base.title, savedAt: meta?.updatedAt, folder: meta ? meta.folder : base.folder, turns: done });
      if (meta) { remember(openKey, meta.id); setHistory({ key: campaignKey, list: [meta, ...(list ?? []).filter(c => c.id !== meta.id)], folders }); }
      if (body.steps?.some(st => st.ok)) changed.current();
      await load();
    } catch (e) { setChatLog({ ...base, turns: [...next, { role: "assistant", text: e instanceof Error ? e.message : "Could not ask the AI.", error: true }] }); }
    finally { setThinking(false); }
  }

  /** Renames, deletes or moves a saved chat, or adds, renames or deletes a folder. Says whether it worked. */
  async function listAction(body: Record<string, unknown> & { action: string }, busyKey: string): Promise<boolean> {
    setBusy(busyKey); setChatNote(null);
    try {
      const res = await fetch("/api/encyclopedia/ai-chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...which, ...body }) });
      const out = await res.json() as { chats?: ChatMeta[]; folders?: ChatFolder[]; error?: string };
      if (!res.ok) throw Error(out.error ?? "Could not change that.");
      const chatsNow = out.chats ?? [], foldersNow = out.folders ?? [];
      setHistory({ key: campaignKey, list: chatsNow, folders: foldersNow });
      if (current.id) {
        const mine = chatsNow.find(c => c.id === current.id);
        if (!mine) newChat(); else setChatLog({ ...current, title: mine.title, folder: mine.folder });
      } else if (current.folder && !foldersNow.some(f => f.id === current.folder)) setChatLog({ ...current, folder: undefined });
      return true;
    } catch (e) { setChatNote({ text: e instanceof Error ? e.message : "Could not change that.", error: true }); return false; }
    finally { setBusy(""); }
  }
  /** The models the connection's key can chat with, from the provider (once per tab, unless asked again). */
  async function loadModels(id: string, again = false) {
    if (!again && modelLists[id] && modelLists[id].status !== "error") return;
    setModelLists(m => ({ ...m, [id]: { status: "loading" } }));
    try {
      const res = await fetch("/api/encyclopedia/ai-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...which, ...keyFields(id), action: "models" }) });
      const body = await res.json() as { models?: string[]; other?: string[]; error?: string };
      if (!res.ok) throw Error(body.error ?? "Could not list the models.");
      setModelLists(m => ({ ...m, [id]: { status: "ok", models: body.models ?? [], other: body.other ?? [] } }));
    } catch (e) { setModelLists(m => ({ ...m, [id]: { status: "error", error: e instanceof Error ? e.message : "Could not list the models." } })); }
  }
  /** Makes a model the connection's model for new chats, here and in What it may do. */
  async function makeDefault(id: string, pick: string) {
    setBusy("default");
    try {
      const res = await fetch("/api/encyclopedia/ai-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...which, connectionId: id, action: "defaultModel", model: pick }) });
      const body = await res.json() as { model?: string; error?: string };
      if (!res.ok) throw Error(body.error ?? "Could not change the model.");
      setState(s => s && { ...s, chat: (s.chat ?? []).map(c => c.id === id ? { ...c, model: body.model ?? pick } : c) });
      setMenu(""); setChatNote({ text: `${pick} is now the default for new chats with ${chats.find(c => c.id === id)?.name ?? "this AI"}.` });
    } catch (e) { setChatNote({ text: e instanceof Error ? e.message : "Could not change the model.", error: true }); }
    finally { setBusy(""); }
  }
  /** Makes a connection the AI new chats ask first, for the campaign on every device. */
  async function makeDefaultAi(id: string) {
    setBusy("defaultAi");
    try {
      const res = await fetch("/api/encyclopedia/ai-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...which, connectionId: id, action: "defaultAi" }) });
      const body = await res.json() as { name?: string; error?: string };
      if (!res.ok) throw Error(body.error ?? "Could not change the default AI.");
      setState(s => s && { ...s, chat: (s.chat ?? []).map(c => ({ ...c, isDefault: c.id === id })) });
      setChatNote({ text: `New chats ask ${body.name ?? "this AI"} first.` });
    } catch (e) { setChatNote({ text: e instanceof Error ? e.message : "Could not change the default AI.", error: true }); }
    finally { setBusy(""); }
  }
  /** Reads files the GM picked, pasted or dropped onto the message. */
  async function attach(list: File[]) {
    if (!list.length) return;
    setReading(true); setChatNote(null);
    try { const read = await readAttachments(list, files.length); setFiles(f => [...f, ...read]); }
    catch (e) { setChatNote({ text: e instanceof Error ? e.message : "Couldn't attach that.", error: true }); }
    finally { setReading(false); if (fileInput.current) fileInput.current.value = ""; }
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

  const settingsLink = onSettings ? <button type="button" className="ai-connect-link" onClick={() => { setOpen(false); onSettings(); }}>Connect an AI</button>
    : <a className="ai-connect-link" href={campaignId ? `/encyclopedia?campaign=${encodeURIComponent(campaignId)}&ai=connect` : "/encyclopedia?ai=connect"}>Connect an AI</a>;
  // Opened from the AI button with nothing connected yet: say how to connect one.
  /** In document.body, so the panel sits above the map's own layers, in the campaign's theme. */
  const portal = (node: ReactNode) => createPortal(<div className={`ai-theme ${themed.className}`.trim()} {...themed.attrs} style={themed.style}>{node}</div>, document.body);
  if (state && !state.hasConnections) return open ? portal(<aside className="ai-panel ai-panel-none" id="ai-activity" aria-label="AI" style={{ top }}>
    <div className="ai-panel-head"><Bot size={16}/><h2>AI</h2><button className="icon-button" aria-label="Close" onClick={() => setOpen(false)}><X size={16}/></button></div>
    <p className="ai-panel-empty">No AI is connected to this campaign yet. Connect Claude, ChatGPT, Codex or another AI app, or add an API key to chat with it right here, on any page.</p>
    {state.campaign ? <ConnectionTab key={connectKey} campaignId={state.campaign} onChanged={() => void load()}/> : <div className="ai-panel-foot">{settingsLink}</div>}
  </aside>) : null;
  if (!state?.hasConnections) return null;
  const who = state.connected[0], waiting = state.waiting ?? [], showing = tab === "connection" && !state.campaign ? "activity" : tab;
  /** The Chat tab with no AI that can chat here: apps like Claude and Codex chat in their own window. */
  const noChat = <div className="ai-nochat">
    <MessageSquare size={20} aria-hidden/>
    <p><b>Chat here needs an AI with an API key.</b> Apps like Claude, ChatGPT and Codex chat in their own window{who ? `, as ${who} does` : ""}, and what they do here shows under Activity.</p>
    <p>Add a key from Anthropic, OpenAI, Google, OpenRouter or another provider, and you can ask it from this panel on any page. Your chats are saved with the campaign.</p>
    {state.campaign ? <button type="button" className="button small primary" onClick={() => { setConnectKey(k => k + 1); setTab("connection"); setAddKey(true); }}><KeyRound size={14}/> Add an API key</button> : settingsLink}
  </div>;
  const connection = state.campaign && <ConnectionTab key={connectKey} campaignId={state.campaign} addKey={addKey} onChanged={() => { setAddKey(false); void load(); }}/>;
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

  // A chat that switched AI or model names the writer of each answer.
  const writers = new Set(said.filter(m => m.role === "assistant" && !m.error).map(m => `${m.by ?? ""}|${m.model ?? ""}`)), mixed = writers.size > 1;
  const folderName = folders.find(f => f.id === current.folder)?.name;
  const chatList = (sidebar: boolean) => <ChatList list={list} folders={folders} current={current.id} busy={busy} sidebar={sidebar} onOpen={id => void openChat(id)}
    onRename={(id, title) => listAction({ action: "rename", chatId: id, title }, `rename:${id}`)}
    onDelete={id => listAction({ action: "delete", chatId: id }, `delete:${id}`)}
    onMove={(id, folder) => listAction({ action: "move", chatId: id, folder }, `move:${id}`)}
    onAddFolder={name => listAction({ action: "addFolder", name }, "addFolder")}
    onRenameFolder={(id, name) => listAction({ action: "renameFolder", folderId: id, name }, `renameFolder:${id}`)}
    onDeleteFolder={id => listAction({ action: "deleteFolder", folderId: id }, `deleteFolder:${id}`)}
    onNewIn={id => newChat(id)}/>;
  const exportButton = current.id && <button type="button" className="button small" aria-expanded={menu === "export"} aria-haspopup="true" data-ai-menu disabled={thinking || !!busy} onClick={() => setMenu(menu === "export" ? "" : "export")}><Download size={13}/> Export</button>;
  const exportMenu = menu === "export" && <div className="ai-chat-menu ai-chat-export" role="menu" aria-label="Export this chat" data-ai-menu>
    <button role="menuitem" onClick={() => void exportChat("markdown")}><Download size={15}/><span><strong>Download as Markdown</strong><small>A .md file you can keep, print or paste anywhere.</small></span></button>
    <button role="menuitem" onClick={() => void exportChat("copy")}><Copy size={15}/><span><strong>Copy as text</strong><small>The whole chat, ready to paste.</small></span></button>
    <button role="menuitem" onClick={() => void exportChat("session")}><BookOpen size={15}/><span><strong>Save as a session page</strong><small>A new Session page in the Wiki, kept as a GM secret until you share it.</small></span></button>
    <button role="menuitem" onClick={() => void exportChat("discord")}><Send size={15}/><span><strong>Post to Discord as a recap</strong><small>Pick what to post and check it first. Goes to your recaps channel.</small></span></button>
  </div>;
  const noteLine = chatNote && <p className={`ai-chat-note${chatNote.error ? " error" : ""}`} role="status">{chatNote.text}{chatNote.href && <> <a href={chatNote.href}>{chatNote.link}</a></>}<button type="button" aria-label="Dismiss" onClick={() => setChatNote(null)}><X size={12}/></button></p>;
  const conversation = chat && <div className="ai-chat" aria-live="polite"><div className="ai-chat-col">
    {!said.length && <p className="ai-panel-empty">Ask {chat.name} about this campaign{scene ? " or the open scene" : ""}: what a monster does on its turn, a line of read-aloud, a name for the innkeeper. What it may change follows What it may do, so moves and rolls can wait for your OK here. Every chat is saved with the campaign{folderName ? `, this one in ${folderName}` : ""}, so you can come back to it.</p>}
    {said.map((m, i) => m.role === "user" ? <div key={i} className="ai-chat-me">{m.text && <p>{m.text}</p>}{m.files && <AttachChips files={m.files}/>}</div> : <div key={i} className={`ai-chat-ai${m.error ? " error" : ""}`}>
      {mixed && !m.error && (m.by || m.model) && <span className="ai-chat-by">{[m.by, m.model].filter(Boolean).join(" · ")}</span>}
      {m.text.split(/\n{2,}/).map((para, j) => <p key={j}>{para}</p>)}{m.steps && steps(m.steps)}
    </div>)}
    {thinking && <p className="ai-chat-thinking">{chat.name} is thinking…</p>}
    {!thinking && current.savedAt && <p className="ai-chat-saved"><Check size={12}/> Saved to this campaign{folderName ? ` · ${folderName}` : ""} · {time(current.savedAt)}</p>}
    <div ref={bottom}/>
  </div></div>;
  const odd = !!model && !isChatModel(model);
  const composer = chat && <form className={`ai-chat-box${dragging ? " dropping" : ""}`} onSubmit={e => { e.preventDefault(); void ask(); }}
    onDragOver={e => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
    onDrop={e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setDragging(false); void attach(Array.from(e.dataTransfer.files)); }}><div className="ai-chat-col">
    <div className="ai-chat-meta">
      <div className="ai-pick-wrap">
        <button type="button" className="ai-pick" aria-haspopup="true" aria-expanded={menu === "ai"} data-ai-menu title="Which AI to ask" onClick={() => setMenu(menu === "ai" ? "" : "ai")}><Bot size={12}/><span>{chat.name}</span><ChevronDown size={12}/></button>
        {menu === "ai" && <ConnectionMenu chats={chats} current={chat.id} connectLink={settingsLink} busy={busy === "defaultAi"} onDefault={id => void makeDefaultAi(id)} onPick={id => { setTalkTo(id); setMenu(""); }}/>}
      </div>
      <div className="ai-pick-wrap">
        <button type="button" className={`ai-pick${odd ? " odd" : ""}`} aria-haspopup="true" aria-expanded={menu === "model"} data-ai-menu title={odd ? `${model} can’t chat. Pick another model.` : "Which model to use"} onClick={() => { if (menu === "model") setMenu(""); else { setMenu("model"); void loadModels(chat.id); } }}><span>{model}</span><ChevronDown size={12}/></button>
        {menu === "model" && <ModelMenu list={modelLists[chat.id]} current={model} fallback={chat.model} connection={chat.name} busy={busy === "default"}
          onPick={m => { setModelFor(x => ({ ...x, [chat.id]: m })); setMenu(""); }} onDefault={m => void makeDefault(chat.id, m)} onRetry={() => void loadModels(chat.id, true)}/>}
      </div>
      {scene && <span className="ai-chat-sees">Sees: {scene}</span>}
      {!current.id && folderName && <span className="ai-chat-sees"><Folder size={11}/> {folderName}</span>}
    </div>
    {odd && <p className="ai-chat-odd">{model} looks like a speech, image or embedding model, so it can’t answer here. Pick a chat model above.</p>}
    <AttachChips files={files} onRemove={i => setFiles(f => f.filter((_, j) => j !== i))}/>
    <div className="ai-chat-row">
      <input ref={fileInput} type="file" multiple accept={ACCEPT} hidden onChange={e => void attach(Array.from(e.target.files ?? []))}/>
      <button type="button" className="icon-button ai-attach-button" aria-label="Attach pictures or files" title="Attach pictures, PDFs or text files (or paste or drop them here), for models that can read them" disabled={reading || thinking} onClick={() => fileInput.current?.click()}><Paperclip size={16}/></button>
      <textarea value={draft} rows={full ? 3 : 2} placeholder={reading ? "Reading the file…" : `Ask ${chat.name}…`} aria-label={`Ask ${chat.name}`} onChange={e => setDraft(e.target.value)}
        onPaste={e => { const pasted = Array.from(e.clipboardData.files); if (pasted.length) { e.preventDefault(); void attach(pasted); } }}
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(); } }}/>
      <button type="submit" className="button primary" aria-label="Send" disabled={(!draft.trim() && !files.length) || thinking || reading}><ArrowUp size={16}/></button>
    </div>
  </div></form>;
  const activity = <>
    {combat && <p className="ai-panel-combat"><span>Round {combat.round}</span><strong>{combat.turn}’s turn</strong>{combat.next && <span>Next: {combat.next}</span>}</p>}
    {note && <p className="ai-panel-note" role="status">{note}</p>}
    <div className="ai-activity-body">
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
    </div>
    <div className="ai-panel-foot">
      <button className="button small" disabled={!!busy} onClick={() => void act(state.paused ? "resume" : "pause")}>{state.paused ? <><Play size={14}/> Resume the AI</> : <><Pause size={14}/> Pause the AI</>}</button>
      {state.campaign ? <button type="button" className="ai-settings-link" onClick={() => setTab("connection")}>{who ? `Connected: ${who}` : "Check or fix the connection"}</button> : onSettings ? <button type="button" className="ai-settings-link" onClick={onSettings}>What it may do</button> : <a className="ai-settings-link" href="/encyclopedia">What it may do <small>(in the Wiki, under Connect an AI)</small></a>}
      <p>{state.paused ? "The AI can still read, but every change is refused until you resume." : "While paused, the AI can still read but every change is refused until you resume."}</p>
    </div>
  </>;
  // Chat, Activity and Connection on every page, whichever AI is connected.
  const tabs = <div className="ai-panel-tabs" role="tablist">
    <button role="tab" aria-selected={showing === "ask"} onClick={() => setTab("ask")}>Chat</button>
    <button role="tab" aria-selected={showing === "activity"} onClick={() => setTab("activity")}>Activity{waiting.length ? ` · ${waiting.length}` : state.paused ? " · paused" : ""}</button>
    {state.campaign && <button role="tab" aria-selected={showing === "connection"} title={who ? `Connected now: ${who}` : "Check, edit or fix the connection"} onClick={() => setTab("connection")}><span className={`ai-dot${who ? " live" : ""}`} aria-hidden/>Connection</button>}
  </div>;
  const sizeButton = chat && <button type="button" className="icon-button" aria-label={full ? "Back to the side panel" : "Open as a full page"} title={full ? "Back to the side panel" : "Open as a full page"} onClick={() => goFull(!full)}>{full ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}</button>;
  const closeButton = <button className="icon-button" aria-label="Close AI activity" onClick={() => setOpen(false)}><X size={16}/></button>;

  const panel = full && chat ? <aside className={`ai-panel ai-full${side ? " side-open" : ""}`} id="ai-activity" aria-label="AI chat">
    <nav className="ai-full-side" aria-label="Saved chats">
      <div className="ai-full-side-head"><Bot size={16}/><strong>Chats</strong><button type="button" className="button small primary" disabled={thinking || (!current.id && !said.length && !current.folder)} onClick={() => newChat()}><Plus size={13}/> New chat</button></div>
      <div className="ai-chat-list ai-full-list">{chatList(true)}</div>
      <p className="ai-chat-menu-foot">Kept with this campaign on your account, so they’re here on any device. Only you see them, never your players.</p>
    </nav>
    {side && <button type="button" className="ai-full-scrim" aria-label="Close the chat list" onClick={() => setSide(false)}/>}
    <div className="ai-full-main">
      <div className="ai-panel-head">
        <button type="button" className="icon-button ai-full-sidebtn" aria-label="Saved chats" aria-expanded={side} onClick={() => { setSide(!side); if (!side) void loadList(); }}><PanelLeft size={16}/></button>
        <div className="ai-full-title"><strong>{current.title ?? "New chat"}</strong>{folderName && <small><Folder size={11}/> {folderName}</small>}</div>
        {tabs}
        <div className="ai-full-actions">{showing === "ask" && exportButton}{exportMenu}</div>
        {sizeButton}{closeButton}
      </div>
      {showing === "ask" ? <>{noteLine}{conversation}{composer}</> : <div className="ai-full-activity">{showing === "connection" ? connection : activity}</div>}
    </div>
  </aside> : <aside className="ai-panel" id="ai-activity" aria-label="AI activity" style={{ top }}>
    <div className="ai-panel-head"><Bot size={16}/>{tabs}{sizeButton}{closeButton}</div>
    {showing === "ask" && chat && <>
      <div className="ai-chat-bar">
        <button type="button" className="ai-chat-title" aria-expanded={menu === "list"} aria-haspopup="true" data-ai-menu disabled={thinking} onClick={() => { setMenu(menu === "list" ? "" : "list"); if (menu !== "list") void loadList(); }}><span>{current.title ?? "New chat"}</span><ChevronDown size={14}/></button>
        {exportButton}
        <button type="button" className="button small" disabled={thinking || (!current.id && !said.length && !current.folder)} onClick={() => newChat()}><Plus size={13}/> New</button>
        {menu === "list" && <div className="ai-chat-menu ai-chat-list" role="dialog" aria-label="Saved chats" data-ai-menu>
          {chatList(false)}
          <p className="ai-chat-menu-foot">Kept with this campaign on your account, so they’re here on any device. Only you see them, never your players. <button type="button" className="inline-link" onClick={() => goFull(true)}>Open the full page</button> to see them beside the chat.</p>
        </div>}
        {exportMenu}
      </div>
      {noteLine}{conversation}{composer}
    </>}
    {showing === "ask" && !chat && noChat}
    {showing === "activity" && activity}
    {showing === "connection" && connection}
  </aside>;
  return <>
    {!floating && <button ref={chip} className={`ai-chip${state.paused ? " paused" : waiting.length ? " asking" : who ? " live" : ""}`} onClick={() => { if (open) setOpen(false); else showPanel(); }} aria-expanded={open} aria-controls="ai-activity" title="AI activity">
      <Bot size={15}/><span>{state.paused ? "AI paused" : !waiting.length && chat && !who ? <>Ask<span className="ai-chip-name"> {chat.name}</span></> : waiting.length ? <><span className="ai-chip-name">{waiting[0].connection} is helping · </span>{waiting.length} to approve</> : who && combat ? "AI is running combat" : who ? <>AI connected<span className="ai-chip-name"> · {who}</span></> : "AI activity"}</span>
    </button>}
    {open && portal(panel)}
    {posting && portal(<div className="ai-post-backdrop" onClick={e => { if (e.target === e.currentTarget && busy !== "post") setPosting(null); }}>
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
    </div>)}
  </>;
}
