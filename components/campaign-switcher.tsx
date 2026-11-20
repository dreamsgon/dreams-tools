"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { Check, ChevronDown, ChevronRight, Folder, Globe, LayoutGrid, Plus, Search, Star } from "lucide-react";
import type { CampaignRow, CampaignSummary } from "@/lib/campaign-links";
import { folderChain, isSwitcherShortcut, moveIndex, navigable, openedFromHome, pinsFromHome, switcherItems, type SwitcherItem } from "@/lib/campaign-switcher";
import { hasTool, landingHref, landingNote, memberCampaign, ownCampaign, toolMarks, type BarCampaign, type CampaignTool, type JoinedCampaign, type ToolLink } from "@/lib/campaign-nav";
import "./campaign-switcher.css";

/** Ctrl/Cmd+Shift+O opens the switcher anywhere in a tool. The tool decides what "open" needs (a visible sidebar, no dialog on top). */
export function useCampaignSwitcherShortcut(onOpen: () => void) {
  const latest = useRef(onOpen);
  useEffect(() => { latest.current = onOpen; });
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (!isSwitcherShortcut(e)) return; e.preventDefault(); latest.current(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
}

type Props = {
  /** The place you are in. Picking a campaign opens the same place in it (lib/campaign-nav.ts landingHref). */
  tool: CampaignTool;
  /** The current campaign and the small line under it. */
  title: string;
  subtitle?: string;
  /** Which campaign is open. It gets the check. */
  isCurrent: (campaign: BarCampaign) => boolean;
  /** A campaign of yours that has this place was picked: a tool that can switch in place does so. Left out, the page loads. */
  onPick?: (row: CampaignRow) => void;
  /** The current campaign's places, shown at the top of the popover on a phone, where the bar has no room for them. */
  places?: ToolLink[];
  /** The Wiki's Worlds button. Left out elsewhere. */
  onWorlds?: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called before the page is left for a hub or the Campaigns page. Return false to stay (the tool says why, e.g. a save failed). */
  beforeLeave?: () => Promise<boolean>;
  /** "side" is the full-width button at the top of a sidebar; "bar" is a compact button for a page header. */
  variant?: "side" | "bar";
  className?: string;
};

const unmodified = (e: ReactMouseEvent) => e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;

export default function CampaignSwitcher({ tool, title, subtitle, isCurrent, onPick, places, onWorlds, open, onOpenChange, beforeLeave, variant = "side", className = "" }: Props) {
  const id = useId(), listId = `${id}-list`;
  const wrap = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), input = useRef<HTMLInputElement>(null), seeded = useRef(false);
  const current = useRef(isCurrent);
  useEffect(() => { current.current = isCurrent; });
  const [summary, setSummary] = useState<CampaignSummary | null>(null), [pins, setPins] = useState<string[] | null>(null), [opened, setOpened] = useState<Record<string, string> | undefined>(), [failed, setFailed] = useState(false);
  const [joined, setJoined] = useState<JoinedCampaign[] | null>(null);
  const [query, setQuery] = useState(""), [activeId, setActiveId] = useState<string | null>(null), [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [mac, setMac] = useState(false), [tries, setTries] = useState(0);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount so the server and first client render agree
  useEffect(() => { setMac(/Mac|iPhone|iPad/.test(navigator.platform)); }, []);

  const close = useCallback((refocus = false) => { onOpenChange(false); if (refocus) trigger.current?.focus(); }, [onOpenChange]);

  // Fresh data every time it opens (campaigns change in the other tool). The last list stays on screen while it loads.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the search starts empty each time it opens
    if (!open) { seeded.current = false; setQuery(""); setActiveId(null); setTries(0); return; }
    setFailed(false);
    const ctl = new AbortController();
    fetch("/api/campaigns", { cache: "no-store", signal: ctl.signal })
      .then(r => r.ok ? r.json() as Promise<CampaignSummary> : Promise.reject(new Error(String(r.status))))
      .then(setSummary, () => { if (!ctl.signal.aborted) setFailed(true); });
    // Pins belong to the home page's layout. Not there yet, or failing, just means no Pinned section.
    fetch("/api/home?layout=1", { cache: "no-store", signal: ctl.signal })
      .then(r => r.ok ? r.json() : null).catch(() => null)
      .then(body => { if (!ctl.signal.aborted) { setPins(pinsFromHome(body)); setOpened(openedFromHome(body)); } });
    // Campaigns other people run that you joined. Failing just leaves them out.
    fetch("/api/members?mine=1", { cache: "no-store", signal: ctl.signal })
      .then(r => r.ok ? r.json() : null).catch(() => null)
      .then(body => { if (!ctl.signal.aborted) setJoined(Array.isArray(body?.campaigns) ? body.campaigns : null); });
    return () => ctl.abort();
  }, [open, tries]);
  // The folder holding the open campaign starts expanded; the rest start closed.
  useEffect(() => {
    if (!open || !summary || seeded.current) return;
    seeded.current = true;
    const here = summary.rows.find(r => current.current(ownCampaign(r)));
    setExpanded(new Set(folderChain(summary.folders, here?.folderId ?? null)));
  }, [open, summary]);
  useEffect(() => { if (open) input.current?.focus({ preventScroll: true }); }, [open]);
  // Click outside closes. Focus is left where the click put it.
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) onOpenChange(false); };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, [open, onOpenChange]);

  const items = useMemo(() => summary ? switcherItems(summary, { query, pins, opened, expanded, joined }) : [], [summary, query, pins, opened, expanded, joined]);
  const nav = useMemo(() => navigable(items), [items]);
  const found = nav.findIndex(i => items[i].id === activeId);
  // With a search typed, Enter picks the first match until the arrows say otherwise.
  const at = found >= 0 ? found : query.trim() && nav.length ? 0 : -1;
  const activeItem = at >= 0 ? items[nav[at]] : null;
  useEffect(() => { if (activeItem) document.getElementById(`${id}-${activeItem.id}`)?.scrollIntoView?.({ block: "nearest" }); }, [activeItem?.id, id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function leave(href: string) {
    if (beforeLeave && !(await beforeLeave())) return;
    window.location.assign(href);
  }
  const toggleFolder = (folderId: string) => setExpanded(old => { const next = new Set(old); if (next.has(folderId)) next.delete(folderId); else next.add(folderId); return next; });
  /** The same place in the picked campaign: in place when this tool can switch there, else a page load (its Dashboard when it lacks this place). */
  function pick(campaign: BarCampaign) {
    const here = isCurrent(campaign);
    close(here);
    if (here) return;
    if (onPick && campaign.kind === "own" && hasTool(campaign, tool)) { onPick(campaign.row); return; }
    const href = landingHref(campaign, tool);
    if (href) void leave(href);
  }
  const itemCampaign = (item: SwitcherItem) => item.type === "row" ? ownCampaign(item.row) : item.type === "member" ? memberCampaign(item.joined) : null;
  function key(e: ReactKeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); return; }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) && nav.length) {
      e.preventDefault();
      // Home and End belong to the text caret unless the list has been entered.
      if ((e.key === "Home" || e.key === "End") && at < 0) return;
      setActiveId(items[nav[moveIndex(at, e.key, nav.length)]].id);
    } else if (e.key === "Enter" && activeItem && activeItem.type !== "heading") {
      e.preventDefault();
      if (activeItem.type === "folder") toggleFolder(activeItem.folder.id); else { const c = itemCampaign(activeItem); if (c) pick(c); }
    } else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && activeItem?.type === "folder" && !query.trim() && !input.current?.value) {
      if (activeItem.open === (e.key === "ArrowLeft")) { e.preventDefault(); toggleFolder(activeItem.folder.id); }
    }
  }
  const footLink = (href: string) => (e: ReactMouseEvent) => { if (beforeLeave && unmodified(e)) { e.preventDefault(); close(); void leave(href); } };
  const optionId = (itemId: string) => `${id}-${itemId}`;

  return <div ref={wrap} className={`csw csw--${variant} ${className}`}
    onKeyDown={e => { if (open && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); } }}
    onBlur={e => { const next = e.relatedTarget as Node | null; if (open && next && !e.currentTarget.contains(next)) onOpenChange(false); }}>
    <button ref={trigger} type="button" className="csw-btn" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-pop` : undefined}
      title={variant === "bar" ? "Switch campaign (Ctrl/Cmd+Shift+O)" : undefined} onClick={() => onOpenChange(!open)}>
      <span className="csw-art" aria-hidden="true" />
      <span className="csw-name"><b>{title}</b>{subtitle && <small>{subtitle}</small>}</span>
      <ChevronDown className="csw-chev" size={15} aria-hidden="true" />
    </button>
    {open && <div id={`${id}-pop`} className="csw-pop" role="dialog" aria-label="Switch campaign">
      {!!places?.length && <nav className="csw-places" aria-label={`Places in ${title}`}>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        {places.map(p => p.href ? <a key={p.tool} href={p.href} aria-current={p.tool === tool ? "page" : undefined} onClick={footLink(p.href)}>{p.name}</a>
          : p.add ? <a key={p.tool} href={p.add} className="csw-place-add" onClick={footLink(p.add)}>+ {p.name}</a> : null)}
      </nav>}
      <label className="csw-search">
        <Search size={15} aria-hidden="true" />
        <input ref={input} type="text" role="combobox" aria-label="Find a campaign" aria-autocomplete="list" aria-expanded="true" aria-controls={listId}
          aria-activedescendant={activeItem ? optionId(activeItem.id) : undefined} placeholder="Switch campaign…" autoComplete="off" spellCheck={false}
          value={query} onChange={e => { setQuery(e.target.value); setActiveId(null); }} onKeyDown={key} />
        <kbd aria-hidden="true">{mac ? "⌘" : "Ctrl"}</kbd><kbd aria-hidden="true">⇧</kbd><kbd aria-hidden="true">O</kbd>
      </label>
      <div className="csw-body" id={listId} role="listbox" aria-label="Campaigns">
        {!summary && !failed && <p className="csw-note" role="status">Loading campaigns…</p>}
        {failed && !summary && <p className="csw-note" role="alert">Could not load your campaigns. <button type="button" onClick={() => setTries(n => n + 1)}>Try again</button></p>}
        {summary && !items.some(i => i.type !== "heading") && <p className="csw-note">{query.trim() ? `No campaign matches “${query.trim()}”.` : "No campaigns yet."}</p>}
        {items.map(item => {
          if (item.type === "heading") return <div key={item.id} className="csw-head" role="presentation">{item.icon === "star" ? <Star aria-hidden="true" /> : item.icon === "folder" ? <Folder aria-hidden="true" /> : null}{item.label}</div>;
          const kb = activeItem?.id === item.id, indent = { paddingLeft: 8 + (item.type === "member" ? 0 : item.depth) * 14 };
          if (item.type === "folder") return <button key={item.id} id={optionId(item.id)} type="button" role="option" aria-selected={kb} tabIndex={-1} aria-label={`${item.folder.name} folder, ${item.count === 1 ? "1 campaign" : `${item.count} campaigns`}, ${item.open ? "open" : "closed"}`}
            className={`csw-fold${kb ? " kb" : ""}`} style={indent} onClick={() => toggleFolder(item.folder.id)}>
            <ChevronRight className="csw-fold-chev" size={14} aria-hidden="true" /><Folder size={14} aria-hidden="true" /><span className="csw-fold-name">{item.folder.name}</span><span className="csw-count">{item.count}</span>
          </button>;
          const campaign = itemCampaign(item)!, here = isCurrent(campaign), dim = tool !== "dashboard" && !hasTool(campaign, tool);
          const marks = toolMarks(campaign), note = landingNote(campaign, tool), pinned = item.type === "row" && item.pinned;
          return <button key={item.id} id={optionId(item.id)} type="button" role="option" aria-selected={kb} tabIndex={-1} aria-current={here ? "true" : undefined}
            className={`csw-row${here ? " cur" : ""}${kb ? " kb" : ""}${dim ? " nohalf" : ""}`} style={item.type === "row" ? indent : undefined} onClick={() => pick(campaign)}>
            <span className="csw-mini" aria-hidden="true" />
            <span className="csw-text"><strong>{campaign.name}</strong>{note && <small>{note}</small>}</span>
            <span className="csw-marks" aria-label={`Has ${marks.filter(m => m.on).map(m => m.name).join(", ") || "nothing open yet"}`}>
              {marks.map(m => <span key={m.tool} className={m.on ? "on" : ""} title={`${m.name}${m.on ? "" : ": not yet"}`} aria-hidden="true">{m.name[0]}</span>)}
            </span>
            {pinned && <span className="csw-star" title="Pinned"><Star aria-label="Pinned" /></span>}
            {here && <span className="csw-check"><Check size={15} aria-label="Current campaign" /></span>}
          </button>;
        })}
      </div>
      <div className="csw-foot">
        {/* Full-page links, as between the tools: Maptable and the Wiki have separate layouts. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/campaigns" onClick={footLink("/campaigns")}><LayoutGrid size={14} aria-hidden="true" />All campaigns</a>
        {onWorlds && <button type="button" onClick={() => { close(); onWorlds(); }}><Globe size={14} aria-hidden="true" />Worlds</button>}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/campaigns?new=1" onClick={footLink("/campaigns?new=1")}><Plus size={14} aria-hidden="true" />New campaign</a>
      </div>
    </div>}
  </div>;
}
