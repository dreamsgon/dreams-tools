"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronRight, Folder, FolderOpen, Flag, Pin, Plus, Trash2, X } from "lucide-react";
import { folderChoices, homeCampaigns } from "@/lib/campaign-links";
import { isLinkUrl, type HomeAction, type HomeLayout, type HomeTodo } from "@/lib/home-layout";
import type { HomeData } from "@/lib/home-server";
import { openDiceTray } from "@/lib/dice-open";
import { sessionTime } from "./front-page-view";
import { kindName, forumHref, mapsHref, notesHref, openHref, pageHref, plural, when } from "./home-shared";
import { folderColor } from "@/lib/folder-color";
import { RollPanel } from "./roll-widget";

export type Act = (body: HomeAction) => void;
/** h is the section's height in rows: a tall section shows more of its items. */
export type Part = { layout: HomeLayout; data: HomeData; act: Act; h?: number };

export function Head({ title, id, children }: { title: string; id: string; children?: ReactNode }) {
  return <div className="home-section-head"><h2 id={id}>{title}</h2>{children}</div>;
}
const newId = () => Math.random().toString(36).slice(2, 10);

export function Attention({ data }: Part) {
  const items = data.attention ?? [], fresh = items.filter(n => n.unread).length;
  return <>
    <Head title="Needs your attention" id="home-attention-title">{fresh > 0 && <small className="home-muted">{fresh} new</small>}</Head>
    {items.length ? <ul className="home-rows home-grow">{items.map(n => <li key={n.id}>
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
    {list.length ? <ul className="home-sessions home-grow">{list.map(s => {
      const d = new Date(s.when), t = sessionTime(s.when, now), soon = t && /^(today|tomorrow|in [1-3] days)$/.test(t.relative) ? t.relative : "";
      return <li key={s.key}>
        <span className="home-date"><b>{d.toLocaleDateString(undefined, { month: "short" }).toUpperCase()}</b><span>{d.getDate()}</span></span>
        <span className="home-row-text"><Link href={openHref(s)}>{s.campaign}</Link><small>{[t?.label, s.where].filter(Boolean).join(" · ")}</small></span>
        {soon && <span className="home-soon">{soon[0].toUpperCase() + soon.slice(1)}</span>}
      </li>;
    })}</ul> : <p className="home-muted">Nothing scheduled in the next {days === 7 ? "week" : days === 30 ? "month" : "two weeks"}. Set a date on a campaign&apos;s dashboard.</p>}
  </>;
}

const tint = (c: string) => ({ "--c": c }) as CSSProperties;
const shortName = (n: string) => n.replace(/ \(.*/, "");

/** The folders on the Campaigns page as folder cards: a tab and coloured top edge, a stack of campaign tiles, opening in place to the campaigns inside. */
export function Folders({ layout, data }: Part) {
  // One folder open at a time. The open folder's card stays where it is; its campaigns
  // show in a full-width panel on the next row (the grid is dense, so the other cards keep their places).
  const [openId, setOpenId] = useState<string | null>(null);
  const summary = data.summary, which = layout.options?.folders?.which;
  const choices = summary ? folderChoices(summary.folders).filter(f => !which || which.includes(f.id)) : [];
  const rows = summary ? homeCampaigns(summary, layout.opened) : [];
  return <>
    <Head title="Campaign folders" id="home-folders-title"><Link href="/campaigns"><ChevronRight size={14} aria-hidden="true" />Campaigns page</Link></Head>
    {choices.length ? <div className="home-folders home-grow">{choices.flatMap(f => {
      const inside = rows.filter(r => r.folderId === f.id), isOpen = openId === f.id, last = inside.map(r => r.encyclopedia?.lastEdited ?? "").sort().pop();
      const names = inside.slice(0, 2).map(r => shortName(r.name)).join(", "), color = { "--fc": folderColor(f.id) } as CSSProperties, panelId = `home-fpanel-${f.id}`;
      const card = <div key={f.id} className={`home-fcard${isOpen ? " home-fcard-open" : ""}`} style={color}>
        <button type="button" aria-expanded={isOpen} aria-controls={isOpen ? panelId : undefined} onClick={() => setOpenId(isOpen ? null : f.id)}>
          <span className="home-fhead">
            <span className="home-fi" aria-hidden="true">{isOpen ? <FolderOpen size={18} /> : <Folder size={18} />}</span>
            <span className="home-ftext"><strong>{f.path}</strong><small>{plural(inside.length, "campaign")}{last ? ` · active ${when(last).toLowerCase()}` : ""}</small></span>
            <ChevronRight size={15} className="home-chev" aria-hidden="true" />
          </span>
          {inside.length > 0 && <span className="home-fstack">
            {inside.slice(0, 4).map(r => <span key={r.key} className="home-ftile" style={tint(folderColor(r.key))} title={r.name} aria-hidden="true">{[...r.name][0]?.toUpperCase()}</span>)}
            <em>{names}{inside.length > 2 ? ` +${inside.length - 2}` : ""}</em>
          </span>}
        </button>
      </div>;
      if (!isOpen) return [card];
      return [card, <div key={`${f.id}-panel`} id={panelId} className="home-fpanel" style={color} role="region" aria-label={f.path}>
        {inside.length ? <ul>{inside.map(r => {
          const notes = notesHref(r), maps = mapsHref(r), forum = forumHref(r);
          return <li key={r.key}>
            <Link href={openHref(r)} className="home-frow"><span className="home-fmini" style={tint(folderColor(r.key))} aria-hidden="true" />
              <span><strong>{r.name}</strong><small>{[r.encyclopedia && plural(r.encyclopedia.pages, "page"), r.maptable && plural(r.maptable.scenes, "scene"), r.encyclopedia?.lastEdited && when(r.encyclopedia.lastEdited)].filter(Boolean).join(" · ")}</small></span></Link>
            <span className="home-fgo">{notes && <a href={notes}>Wiki</a>}{maps && <a href={maps}>Maptable</a>}{forum && <a href={forum}>Forum</a>}</span>
          </li>;
        })}</ul> : <p className="home-muted home-folder-empty">No campaigns in this folder.</p>}
      </div>];
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
    <div className={`home-qlinks home-grow${size === "s" ? " home-qlinks-s" : ""}`}>
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
    {pages.length ? <ul className="home-rows home-grow">{pages.map(p => <li key={p.id}>
      <Pin size={15} aria-hidden="true" className="home-row-icon" />
      <span className="home-row-text"><a href={pageHref(p)}>{p.title}</a><small>{p.campaignName ?? (p.worldName ? `${p.worldName} lore` : kindName(p.kind))}</small></span>
      <button type="button" className="home-icon" aria-label={`Unpin ${p.title}`} onClick={() => act({ action: "pinPage", id: p.id, on: false })}><X size={14} aria-hidden="true" /></button>
    </li>)}</ul> : <p className="home-muted">No pinned pages yet.</p>}
    <p className="home-muted home-hint">Pin any page with the pin button above it in the Wiki.</p>
  </>;
}

export function Quests({ data, h = 1 }: Part) {
  const quests = data.quests ?? [];
  return <>
    <Head title="Active quests" id="home-quests-title" />
    {quests.length ? <ul className="home-rows home-quests home-grow">{quests.slice(0, [8, 12, 20][h - 1] ?? 8).map(q => <li key={`${q.key}-${q.id}`}>
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
    {items.length > 0 && <ul className="home-rows home-todo home-grow">{items.map(t => <li key={t.id} className={t.done ? "home-done" : ""}>
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
    <textarea className="home-pad home-grow" aria-label="Scratchpad" rows={6} maxLength={8000} placeholder="Anything to keep in mind. Only you see this." value={text}
      onChange={e => { latest.current = e.target.value; setText(e.target.value); setState("saving"); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(flush, 900); }}
      onBlur={flush} />
  </>;
}

export function Roll({ layout, data }: Part) {
  const showTables = layout.options?.roll?.tables !== false;
  return <>
    <Head title="Quick roll" id="home-roll-title"><button type="button" className="home-text-button" onClick={() => openDiceTray("log")}>Roll log</button></Head>
    <RollPanel tables={data.tables ?? []} library={data.library} showTables={showTables} />
  </>;
}
