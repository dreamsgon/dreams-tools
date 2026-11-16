"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, ChevronRight, Folder, FolderOpen, Flag, ListOrdered, Pin, Plus, Trash2, X } from "lucide-react";
import { folderChoices, homeCampaigns } from "@/lib/campaign-links";
import { isLinkUrl, type HomeAction, type HomeLayout, type HomeTodo } from "@/lib/home-layout";
import type { HomeData } from "@/lib/home-server";
import { rollTable, type TableLibrary } from "@/lib/encyclopedia/tables";
import { openDiceTray } from "@/lib/dice-open";
import { sessionTime } from "./front-page-view";
import { kindName, openHref, pageHref, plural, when } from "./home-shared";

export type Act = (body: HomeAction) => void;
export type Part = { layout: HomeLayout; data: HomeData; act: Act };

export function Head({ title, id, children }: { title: string; id: string; children?: ReactNode }) {
  return <div className="home-section-head"><h2 id={id}>{title}</h2>{children}</div>;
}
const newId = () => Math.random().toString(36).slice(2, 10);

export function Attention({ data }: Part) {
  const items = data.attention ?? [], fresh = items.filter(n => n.unread).length;
  return <>
    <Head title="Needs your attention" id="home-attention-title">{fresh > 0 && <small className="home-muted">{fresh} new</small>}</Head>
    {items.length ? <ul className="home-rows">{items.map(n => <li key={n.id}>
      <span className={`home-dot${n.unread ? "" : " home-dot-read"}`} aria-hidden="true" />
      <span className="home-row-text">{n.text}<small>{when(n.at)}</small></span>
      <a className="home-button home-button-small" href={n.href}>{n.action}</a>
    </li>)}</ul> : <p className="home-muted">You are all caught up. Join requests and new players show up here.</p>}
  </>;
}

export function Sessions({ layout, data }: Part) {
  const days = layout.options?.sessions?.days ?? 14, now = Date.now();
  const list = (data.sessions ?? []).filter(s => Date.parse(s.when) <= now + days * 864e5);
  return <>
    <Head title="Upcoming sessions" id="home-sessions-title" />
    {list.length ? <ul className="home-sessions">{list.map(s => {
      const d = new Date(s.when), t = sessionTime(s.when, now), soon = t && /^(today|tomorrow|in [1-3] days)$/.test(t.relative) ? t.relative : "";
      return <li key={s.key}>
        <span className="home-date"><b>{d.toLocaleDateString(undefined, { month: "short" }).toUpperCase()}</b><span>{d.getDate()}</span></span>
        <span className="home-row-text"><Link href={openHref(s)}>{s.campaign}</Link><small>{[t?.label, s.where].filter(Boolean).join(" · ")}</small></span>
        {soon && <span className="home-soon">{soon[0].toUpperCase() + soon.slice(1)}</span>}
      </li>;
    })}</ul> : <p className="home-muted">Nothing scheduled in the next {days === 7 ? "week" : days === 30 ? "month" : "two weeks"}. Set a date on a campaign&apos;s dashboard.</p>}
  </>;
}

/** The folders on the Campaigns page, each opening in place to the campaigns inside it. */
export function Folders({ layout, data }: Part) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const summary = data.summary, which = layout.options?.folders?.which;
  const choices = summary ? folderChoices(summary.folders).filter(f => !which || which.includes(f.id)) : [];
  const rows = summary ? homeCampaigns(summary) : [];
  return <>
    <Head title="Campaign folders" id="home-folders-title"><Link href="/campaigns"><ChevronRight size={14} aria-hidden="true" />Campaigns page</Link></Head>
    {choices.length ? <div className="home-folders">{choices.map(f => {
      const inside = rows.filter(r => r.folderId === f.id), isOpen = open.has(f.id), last = inside.map(r => r.encyclopedia?.lastEdited ?? "").sort().pop();
      return <div key={f.id} className={`home-folder${isOpen ? " home-folder-open" : ""}`}>
        <button type="button" aria-expanded={isOpen} onClick={() => setOpen(s => { const n = new Set(s); if (!n.delete(f.id)) n.add(f.id); return n; })}>
          {isOpen ? <FolderOpen size={20} aria-hidden="true" /> : <Folder size={20} aria-hidden="true" />}
          <span><strong>{f.path}</strong><small>{plural(inside.length, "campaign")}{last ? ` · last ${when(last).toLowerCase()}` : ""}</small></span>
          <ChevronRight size={15} className="home-chev" aria-hidden="true" />
        </button>
        {isOpen && (inside.length ? <ul>{inside.map(r => <li key={r.key}><Link href={openHref(r)}>{r.name}<small>{[r.encyclopedia && plural(r.encyclopedia.pages, "page"), r.maptable && plural(r.maptable.scenes, "scene"), r.encyclopedia?.lastEdited && when(r.encyclopedia.lastEdited)].filter(Boolean).join(" · ")}</small></Link></li>)}</ul>
          : <p className="home-muted home-folder-empty">No campaigns in this folder.</p>)}
      </div>;
    })}</div> : <p className="home-muted">{summary?.folders.length ? "No folders chosen. Use the section's settings in Customize." : <>No folders yet. Make them on the <Link href="/campaigns">Campaigns page</Link>.</>}</p>}
  </>;
}

const colors = ["#3d63c9", "#2f7d4f", "#8a5a1c", "#7a3d8f", "#a33a2e", "#2a7de1"];
const colorOf = (s: string) => colors[[...s].reduce((n, c) => n + c.charCodeAt(0), 0) % colors.length];
const external = (u: string) => !u.startsWith("/");

export function Links({ layout, act, size }: Part & { size: string }) {
  const links = layout.links ?? [], [adding, setAdding] = useState(false), [label, setLabel] = useState(""), [address, setAddress] = useState(""), [error, setError] = useState("");
  function add() {
    let url = address.trim();
    if (url && !url.startsWith("/") && !/^[a-z][a-z0-9+.-]*:/i.test(url)) url = `https://${url}`;
    if (!label.trim()) return setError("Give the link a name.");
    if (!isLinkUrl(url)) return setError("Use a web address (https://…) or a page here such as /maptable.");
    act({ action: "links", links: [...links, { label: label.trim().slice(0, 80), url }] });
    setLabel(""); setAddress(""); setError("");
  }
  return <>
    <Head title="Quick links" id="home-links-title">{links.length < 24 && <button type="button" className="home-text-button" onClick={() => setAdding(true)}><Plus size={14} aria-hidden="true" />Add</button>}</Head>
    <div className={`home-qlinks${size === "s" ? " home-qlinks-s" : ""}`}>
      {links.map((l, i) => <span key={`${i}-${l.url}`} className="home-qlink-wrap">
        <a className="home-qlink" href={l.url} title={l.url} {...(external(l.url) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
          <span className="home-qlink-icon" style={{ background: colorOf(l.label) }} aria-hidden="true">{[...l.label][0]?.toUpperCase()}</span>
          <span className="home-qlink-name">{l.label}</span>
        </a>
        {adding && <button type="button" className="home-qlink-x" aria-label={`Remove ${l.label}`} onClick={() => act({ action: "links", links: links.filter((_, j) => j !== i) })}><X size={11} aria-hidden="true" /></button>}
      </span>)}
      {!adding && <button type="button" className="home-qlink home-qlink-add" onClick={() => setAdding(true)}><Plus size={14} aria-hidden="true" />Add a link</button>}
    </div>
    {adding && <form className="home-form" onSubmit={e => { e.preventDefault(); add(); }}>
      <label>Name<input value={label} maxLength={80} placeholder="Monster Manual" onChange={e => setLabel(e.target.value)} autoFocus /></label>
      <label>Address<input value={address} maxLength={500} placeholder="https://… or a page here, like /maptable" onChange={e => setAddress(e.target.value)} /></label>
      {error && <p className="home-error" role="alert">{error}</p>}
      <div className="home-form-row"><button type="button" className="home-button home-button-small home-button-quiet" onClick={() => { setAdding(false); setError(""); }}>Done</button><button className="home-button home-button-small home-button-primary">Add link</button></div>
    </form>}
  </>;
}

export function Pinned({ layout, data, act }: Part) {
  const ids = layout.pinnedPages ?? [], pages = (data.pinnedPages ?? []).filter(p => ids.includes(p.id));
  return <>
    <Head title="Pinned pages" id="home-pinned-title" />
    {pages.length ? <ul className="home-rows">{pages.map(p => <li key={p.id}>
      <Pin size={15} aria-hidden="true" className="home-row-icon" />
      <span className="home-row-text"><a href={pageHref(p)}>{p.title}</a><small>{p.campaignName ?? (p.worldName ? `${p.worldName} lore` : kindName(p.kind))}</small></span>
      <button type="button" className="home-icon" aria-label={`Unpin ${p.title}`} onClick={() => act({ action: "pinPage", id: p.id, on: false })}><X size={14} aria-hidden="true" /></button>
    </li>)}</ul> : <p className="home-muted">No pinned pages yet.</p>}
    <p className="home-muted home-hint">Pin any page with the pin button above it in the Encyclopedia.</p>
  </>;
}

export function Quests({ data }: Part) {
  const quests = data.quests ?? [];
  return <>
    <Head title="Active quests" id="home-quests-title" />
    {quests.length ? <ul className="home-rows home-quests">{quests.slice(0, 8).map(q => <li key={`${q.key}-${q.id}`}>
      <Flag size={15} aria-hidden="true" className="home-row-icon" />
      <span className="home-row-text"><a href={pageHref(q)}>{q.title}</a><small>{q.campaign}{q.next ? ` · Next: ${q.next}` : ""}</small>
        {q.total > 0 && <span className="home-bar" role="progressbar" aria-label={`${q.done} of ${q.total} steps`} aria-valuemin={0} aria-valuemax={q.total} aria-valuenow={q.done}><span style={{ width: `${(q.done / q.total) * 100}%` }} /></span>}</span>
      {q.total > 0 && <small className="home-side">{q.done} of {q.total}</small>}
    </li>)}</ul> : <p className="home-muted">No active quests in any campaign.</p>}
  </>;
}

export function Todo({ layout, data, act }: Part) {
  const items = layout.todo ?? [], [text, setText] = useState("");
  const names = new Map((data.summary?.rows ?? []).map(r => [r.key, r.name]));
  const set = (todo: HomeTodo[]) => act({ action: "todo", todo });
  function add() { const t = text.trim(); if (t && items.length < 100) set([...items, { id: newId(), text: t.slice(0, 200), done: false }]); setText(""); }
  const left = items.filter(t => !t.done).length;
  return <>
    <Head title="GM to-do" id="home-todo-title">{items.length > 0 && <small className="home-muted">{left} left</small>}</Head>
    {items.length > 0 && <ul className="home-rows home-todo">{items.map(t => <li key={t.id} className={t.done ? "home-done" : ""}>
      <label><input type="checkbox" checked={t.done} onChange={e => set(items.map(x => x.id === t.id ? { ...x, done: e.target.checked } : x))} />
        <span className="home-row-text">{t.text}{t.campaignKey && names.get(t.campaignKey) && <small>{names.get(t.campaignKey)}</small>}</span></label>
      <button type="button" className="home-icon" aria-label={`Remove ${t.text}`} onClick={() => set(items.filter(x => x.id !== t.id))}><Trash2 size={14} aria-hidden="true" /></button>
    </li>)}</ul>}
    <form className="home-addline" onSubmit={e => { e.preventDefault(); add(); }}>
      <input value={text} maxLength={200} placeholder="Add a to-do" aria-label="Add a to-do" onChange={e => setText(e.target.value)} />
      <button className="home-button home-button-small">Add</button>
    </form>
  </>;
}

export function Notes({ layout, act }: Part) {
  const saved = layout.notes ?? "", [text, setText] = useState(saved), [state, setState] = useState<"saved" | "saving">("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), latest = useRef(text), last = useRef(saved);
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (latest.current !== last.current) { last.current = latest.current; act({ action: "notes", notes: latest.current }); }
    setState("saved");
  };
  // Saves while you type, a moment after you pause, and when you leave the box or the page.
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); if (latest.current !== last.current) act({ action: "notes", notes: latest.current }); } }, [act]);
  return <>
    <Head title="Scratchpad" id="home-notes-title"><small className="home-muted" aria-live="polite">{state === "saving" ? "Saving…" : "Saved"}</small></Head>
    <textarea className="home-pad" aria-label="Scratchpad" rows={6} maxLength={8000} placeholder="Anything to keep in mind. Only you see this." value={text}
      onChange={e => { latest.current = e.target.value; setText(e.target.value); setState("saving"); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(flush, 900); }}
      onBlur={flush} />
  </>;
}

const dice = [4, 6, 8, 10, 12, 20, 100];
export function Roll({ layout, data }: Part) {
  const [result, setResult] = useState<{ big: string; small: string } | null>(null);
  const tables = layout.options?.roll?.tables === false ? [] : data.tables ?? [];
  function roll(n: number) {
    const r = 1 + Math.floor(Math.random() * n);
    setResult({ big: String(r), small: `on a d${n}${r === n ? " · max!" : r === 1 ? " · ouch" : ""}` });
  }
  function rollOn(id: string, name: string) {
    try { const r = rollTable((data.library ?? { schemaVersion: 1, tables: [] }) as TableLibrary, id); setResult({ big: r.text, small: name }); }
    catch (e) { setResult({ big: "That table could not be rolled here.", small: e instanceof Error ? e.message : name }); }
  }
  return <>
    <Head title="Quick roll" id="home-roll-title"><button type="button" className="home-text-button" onClick={() => openDiceTray("log")}>Roll log</button></Head>
    <div className="home-dice">{dice.map(n => <button key={n} type="button" onClick={() => roll(n)}>d{n}</button>)}</div>
    <div className="home-rolled" aria-live="polite">{result ? <><b>{result.big}</b> <span className="home-muted">{result.small}</span></> : <span className="home-muted">Click a die{tables.length ? ", or a table below" : ""}.</span>}</div>
    <button type="button" className="home-text-button" onClick={() => openDiceTray("dice")}>Open the dice tray</button>
    {layout.options?.roll?.tables !== false && <div className="home-tables"><h3>Your tables</h3>
      {tables.length ? <ul className="home-rows">{tables.map(t => <li key={t.id}>
        <ListOrdered size={15} aria-hidden="true" className="home-row-icon" />
        <span className="home-row-text">{t.name}</span>
        {t.rollable ? <button type="button" className="home-text-button" onClick={() => rollOn(t.id, t.name)}>Roll</button>
          : <a className="home-text-button" href="/encyclopedia?view=tables">Open<ArrowUpRight size={12} aria-hidden="true" /></a>}
      </li>)}</ul> : <p className="home-muted">Star a random table in the Encyclopedia to add it here.</p>}
    </div>}
  </>;
}
