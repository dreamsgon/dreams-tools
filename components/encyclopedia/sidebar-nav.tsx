"use client";
import { useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, Backpack, CalendarDays, Check, ChevronDown, ChevronRight, Dices, Eye, EyeOff, Globe, Goal, GripVertical, LayoutTemplate, Library, Link as LinkIcon, ListChecks, Map as MapIcon, Network, Palette, Pencil, Plus, ScrollText, Search, Settings, SlidersHorizontal, Sparkles, Tag, Trash2, Users, X } from "lucide-react";
import "./sidebar-nav.css";
import { ToolDialog } from "./tool-dialog";
import {
  addCategory, addCategoryLink, addQuick, builtInSections, campaignOnlyNav, categoryItems, categoryKinds, defaultSidebar, maxCategories, maxQuickLinks,
  moveCategoryLink, moveNav, moveQuick, moveSection, navLabels, removeCategory, removeCategoryLink, removeQuick, renameCategory, sectionLabels,
  setCategoryKinds, showNav, showSection, toolIds, toolLabels, viewIds, viewLabels,
  type BuiltInSection, type CategoryKind, type NavId, type Sidebar, type SidebarCategory, type SidebarLink, type ToolId, type ViewId,
} from "@/lib/encyclopedia/sidebar";

/*
 * The Encyclopedia sidebar's menu, quick links and sections, in the order the GM set with
 * Customize sidebar (lib/encyclopedia/sidebar.ts), and the Customize mode that arranges them.
 */

type Page = { id: string; title: string; kind: string; campaignId: string | null };
const viewIcons: Record<ViewId, typeof Goal> = { quests: Goal, codex: Library, relationships: Network, characters: Users, maps: MapIcon, calendar: CalendarDays, tables: Dices, templates: LayoutTemplate, look: Palette };
const toolIcons: Record<ToolId, typeof Goal> = { form: ListChecks, share: Eye, items: Backpack, dice: Dices, log: ScrollText, search: Search, tags: Tag, ai: Sparkles, backups: Settings };
const newLinkId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const isBuiltIn = (id: string): id is BuiltInSection => (builtInSections as readonly string[]).includes(id);

export type SidebarNavProps = {
  layout: Sidebar;
  /** The campaign is open (the layout is its own); without one, the starting layout shows world items only. */
  campaign: boolean;
  /** A co-GM in someone else's campaign: no random tables (they are the GM's own library), no quick links, no Customize. */
  member: boolean;
  view: string;
  selected: string | null;
  pages: Page[];
  kindLabels: Record<string, string>;
  pageIcon: (kind: string) => ReactNode;
  onView: (v: ViewId) => void;
  onTool: (t: ToolId) => void;
  onPage: (id: string) => void;
  /** The built-in sections' bodies, or null where they don't show (Campaign Notes without a campaign). */
  builtIn: Record<BuiltInSection, ReactNode | null>;
  /** Section headings' extra controls (the shared tag, the new-note button). */
  headingExtra?: Partial<Record<BuiltInSection, ReactNode>>;
  isOpen: (key: string) => boolean;
  toggle: (key: string) => void;
  onSave: (s: Sidebar) => void;
  draft: Sidebar | null;
  setDraft: (d: Sidebar | null | ((d: Sidebar | null) => Sidebar | null)) => void;
};

function linkLabel(l: SidebarLink, pages: Page[]): string {
  switch (l.type) {
    case "page": return pages.find(p => p.id === l.page)?.title ?? "Missing page";
    case "view": return viewLabels[l.view];
    case "tool": return toolLabels[l.tool];
    case "web": return l.label;
  }
}

/** The menu, quick links and sections, or Customize mode in their place. */
export function SidebarNav(p: SidebarNavProps) {
  if (p.draft) return <Customize {...p} draft={p.draft} />;
  const { layout, campaign, member } = p;
  const nav = layout.nav.filter(x => x.on && (campaign || !campaignOnlyNav.includes(x.id)) && !(member && x.id === "tables"));
  const quick = campaign && !member ? layout.quick.filter(l => l.type !== "page" || p.pages.some(x => x.id === l.page)) : [];
  return <>
    <div className="character-nav">
      {nav.map(x => { const Icon = viewIcons[x.id]; return <button key={x.id} className={`campaign-link ${p.view === x.id ? "active" : ""}`} onClick={() => p.onView(x.id)}><Icon size={16} /> {navLabels[x.id]}</button>; })}
      {campaign && !member && <div className="button-row sb-quick">
        {quick.map(l => l.type === "web"
          ? <a key={l.id} className="text-button" href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a>
          : <button key={l.id} className="text-button" onClick={() => go(l, p)}>{linkLabel(l, p.pages)}</button>)}
        <button className="sb-customize-button icon-button" title="Customize sidebar" aria-label="Customize sidebar" onClick={() => p.setDraft(layout)}><SlidersHorizontal size={14} /></button>
      </div>}
    </div>
    <div className="navigation-trees">
      {layout.sections.filter(s => s.on).map(s => {
        if (isBuiltIn(s.id)) {
          const body = p.builtIn[s.id];
          return body === null ? null : <BuiltIn key={s.id} id={s.id} open={p.isOpen(s.id)} toggle={() => p.toggle(s.id)} extra={p.headingExtra?.[s.id]}>{body}</BuiltIn>;
        }
        const c = layout.categories.find(x => x.id === s.id);
        if (!c || !campaign) return null;
        const key = `cat:${c.id}`, open = p.isOpen(key);
        const items = categoryItems(c, p.pages).filter(({ link }) => !(member && link.type === "tool") && !(link.type === "view" && member && link.view === "tables"));
        return <section key={c.id} className="navigation-section sb-category">
          <div className="side-heading"><button className="section-toggle" aria-expanded={open} aria-controls={`sb-cat-${c.id}`} onClick={() => p.toggle(key)}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {c.name}</button></div>
          {open && <div id={`sb-cat-${c.id}`}>
            {items.map(({ link, page }) => <CategoryRow key={link.id} link={link} page={page} p={p} />)}
            {!items.length && <p className="side-empty">Nothing here yet. Add links with Customize sidebar.</p>}
          </div>}
        </section>;
      })}
    </div>
  </>;
}


function BuiltIn({ id, open, toggle, extra, children }: { id: BuiltInSection; open: boolean; toggle: () => void; extra?: ReactNode; children: ReactNode }) {
  const bodyId = id === "lore" ? "world-lore-tree" : id === "notes" ? "campaign-notes-tree" : "organizations-list";
  return <section className="navigation-section">
    <div className={`side-heading${id === "notes" ? " campaign-heading" : ""}`}><button className="section-toggle" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {sectionLabels[id]}</button>{extra}</div>
    {open && <div id={bodyId}>{children}</div>}
  </section>;
}

type Go = { onView: (v: ViewId) => void; onTool: (t: ToolId) => void; onPage: (id: string) => void; view: string; selected: string | null };
function go(l: SidebarLink, g: Go) {
  if (l.type === "page") g.onPage(l.page);
  else if (l.type === "view") g.onView(l.view);
  else if (l.type === "tool") g.onTool(l.tool);
}

function CategoryRow({ link, page, p }: { link: SidebarLink; page?: Page; p: SidebarNavProps }) {
  const current = link.type === "page" ? p.selected === link.page : link.type === "view" ? p.view === link.view && !p.selected : false;
  const icon = link.type === "page" ? p.pageIcon(page?.kind ?? "note") : link.type === "view" ? (() => { const I = viewIcons[link.view]; return <I size={15} />; })() : link.type === "tool" ? (() => { const I = toolIcons[link.tool]; return <I size={15} />; })() : <Globe size={15} />;
  const label = link.type === "page" ? page?.title ?? "" : linkLabel(link, p.pages);
  return <div className={`tree-row sb-row ${current ? "selected" : ""}`} style={{ paddingLeft: 12 }}>
    <span className="disclosure" />
    {link.type === "web"
      ? <a className="tree-item" href={link.url} target="_blank" rel="noopener noreferrer">{icon}<span>{label}</span><ArrowUpRight size={12} className="sb-out" /></a>
      : <button className="tree-item" onClick={() => go(link, p)}>{icon}<span>{label}</span></button>}
  </div>;
}

/* ---------- Customize mode ---------- */

type Dragging = { list: "nav" | "quick" | "sections"; id: string } | null;

function Customize(p: SidebarNavProps & { draft: Sidebar }) {
  const { draft, setDraft } = p;
  const edit = (f: (s: Sidebar) => Sidebar) => setDraft(d => d && f(d));
  const [dragging, setDragging] = useState<Dragging>(null), [picking, setPicking] = useState(false), [editing, setEditing] = useState<string | null>(null), [naming, setNaming] = useState<string | null>(null);
  const editingCat = draft.categories.find(c => c.id === editing);

  function rowDrag(list: "nav" | "quick" | "sections", id: string, index: (s: Sidebar) => number, move: (s: Sidebar, from: number, to: number) => Sidebar) {
    return {
      draggable: true,
      onDragStart: (e: DragEvent) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); setDragging({ list, id }); },
      onDragEnd: () => setDragging(null),
      onDragOver: (e: DragEvent) => { if (dragging?.list === list) e.preventDefault(); },
      onDragEnter: () => { if (dragging?.list === list && dragging.id !== id) { const did = dragging.id; edit(s => move(s, indexOf(s, list, did), index(s))); } },
    };
  }
  const keys = (move: (by: number) => void) => (e: KeyboardEvent) => { const by = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0; if (by) { e.preventDefault(); move(by); } };
  const navItems = draft.nav.filter(x => !(p.member && x.id === "tables"));

  return <div className="sb-custom" aria-label="Customize sidebar" role="region">
    <div className="sb-custom-head"><strong>Customize sidebar</strong><button className="button primary small" onClick={() => { p.onSave(draft); p.setDraft(null); }}><Check size={14} /> Done</button></div>
    <p className="sb-hint">Drag to arrange, or use the arrows. The eye shows or hides an item. This campaign only.</p>

    <h3>Menu</h3>
    <ol className="sb-list">
      {navItems.map((x, i) => { const Icon = viewIcons[x.id], label = navLabels[x.id], move = (by: number) => edit(s => moveNav(s, s.nav.findIndex(y => y.id === x.id), s.nav.findIndex(y => y.id === x.id) + by)); return <li key={x.id} className={`${x.on ? "" : "off"} ${dragging?.id === x.id ? "dragging" : ""}`} {...rowDrag("nav", x.id, s => s.nav.findIndex(y => y.id === x.id), moveNav)}>
        <button className="sb-grip" aria-label={`Move ${label}. Use the arrow keys.`} onKeyDown={keys(move)}><GripVertical size={14} /></button>
        <Icon size={15} className="sb-icon" /><span className="sb-label">{label}</span>
        <Arrows label={label} first={i === 0} last={i === navItems.length - 1} move={move} />
        <button className="sb-eye" aria-pressed={x.on} aria-label={x.on ? `Hide ${label}` : `Show ${label}`} title={x.on ? "Shown. Click to hide" : "Hidden. Click to show"} onClick={() => edit(s => showNav(s, x.id as NavId, !x.on))}>{x.on ? <Eye size={15} /> : <EyeOff size={15} />}</button>
      </li>; })}
    </ol>

    <h3>Quick links</h3>
    <ol className="sb-list">
      {draft.quick.map((l, i) => { const label = linkLabel(l, p.pages), move = (by: number) => edit(s => moveQuick(s, s.quick.findIndex(y => y.id === l.id), s.quick.findIndex(y => y.id === l.id) + by)); return <li key={l.id} className={dragging?.id === l.id ? "dragging" : ""} {...rowDrag("quick", l.id, s => s.quick.findIndex(y => y.id === l.id), moveQuick)}>
        <button className="sb-grip" aria-label={`Move ${label}. Use the arrow keys.`} onKeyDown={keys(move)}><GripVertical size={14} /></button>
        <LinkGlyph link={l} p={p} /><span className="sb-label">{label}</span>
        <Arrows label={label} first={i === 0} last={i === draft.quick.length - 1} move={move} />
        <button className="sb-eye" aria-label={`Remove ${label} from quick links`} title="Remove" onClick={() => edit(s => removeQuick(s, l.id))}><X size={15} /></button>
      </li>; })}
      {!draft.quick.length && <li className="sb-empty">No quick links.</li>}
    </ol>
    {draft.quick.length < maxQuickLinks && <button className="text-button sb-add" onClick={() => setPicking(true)}><Plus size={14} /> Add a quick link</button>}

    <h3>Sections</h3>
    <ol className="sb-list">
      {draft.sections.map((s, i) => {
        const cat = isBuiltIn(s.id) ? null : draft.categories.find(c => c.id === s.id);
        const label = isBuiltIn(s.id) ? sectionLabels[s.id] : cat?.name ?? "";
        const move = (by: number) => edit(d => moveSection(d, d.sections.findIndex(y => y.id === s.id), d.sections.findIndex(y => y.id === s.id) + by));
        return <li key={s.id} className={`${s.on ? "" : "off"} ${dragging?.id === s.id ? "dragging" : ""}`} {...rowDrag("sections", s.id, d => d.sections.findIndex(y => y.id === s.id), moveSection)}>
          <button className="sb-grip" aria-label={`Move ${label}. Use the arrow keys.`} onKeyDown={keys(move)}><GripVertical size={14} /></button>
          <span className="sb-label">{label}{cat && <small> · your category</small>}</span>
          {cat && <button className="sb-eye" aria-label={`Edit ${label}`} title="Edit name and links" onClick={() => setEditing(cat.id)}><Pencil size={14} /></button>}
          <Arrows label={label} first={i === 0} last={i === draft.sections.length - 1} move={move} />
          <button className="sb-eye" aria-pressed={s.on} aria-label={s.on ? `Hide ${label}` : `Show ${label}`} title={s.on ? "Shown. Click to hide" : "Hidden. Click to show"} onClick={() => edit(d => showSection(d, s.id, !s.on))}>{s.on ? <Eye size={15} /> : <EyeOff size={15} />}</button>
        </li>;
      })}
    </ol>
    {draft.categories.length < maxCategories && (naming === null
      ? <button className="text-button sb-add" onClick={() => setNaming("")}><Plus size={14} /> Add a category</button>
      : <form className="sb-name" onSubmit={e => { e.preventDefault(); const made = addCategory(draft, naming, newLinkId); if (made) { setDraft(made.sidebar); setEditing(made.id); } setNaming(null); }}>
        <input autoFocus value={naming} maxLength={40} placeholder="Category name, such as Villains" aria-label="New category name" onChange={e => setNaming(e.target.value)} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setNaming(null); } }} />
        <button className="button small" type="submit" disabled={!naming.trim()}>Add</button>
      </form>)}

    <div className="sb-custom-foot">
      <button className="text-button" onClick={() => setDraft(defaultSidebar(draft.categories))}>Reset to the starting layout</button>
      <button className="text-button" onClick={() => p.setDraft(null)}>Cancel</button>
    </div>
    <p className="sb-hint">Reset keeps your categories.</p>

    {/* Escape closes the dialog only, not the phone's page sheet around it. */}
    <div className="sb-dialogs" onKeyDown={e => { if (e.key === "Escape") e.stopPropagation(); }}>
    {picking && <ToolDialog title="Add a quick link" onClose={() => setPicking(false)}>
      <LinkPicker pages={p.pages} kindLabels={p.kindLabels} pageIcon={p.pageIcon} has={l => draft.quick.some(q => sameTarget(q, l))} onAdd={l => { edit(s => addQuick(s, l, newLinkId)); setPicking(false); }} />
    </ToolDialog>}
    {editingCat && <CategoryDialog cat={editingCat} p={p} edit={edit} onClose={() => setEditing(null)} onDelete={() => { edit(s => removeCategory(s, editingCat.id)); setEditing(null); }} />}
    </div>
  </div>;
}

function indexOf(s: Sidebar, list: "nav" | "quick" | "sections", id: string) {
  return list === "nav" ? s.nav.findIndex(x => x.id === id) : list === "quick" ? s.quick.findIndex(x => x.id === id) : s.sections.findIndex(x => x.id === id);
}

function Arrows({ label, first, last, move }: { label: string; first: boolean; last: boolean; move: (by: number) => void }) {
  return <>
    <button className="sb-arrow" aria-label={`Move ${label} up`} disabled={first} onClick={() => move(-1)}><ArrowUp size={13} /></button>
    <button className="sb-arrow" aria-label={`Move ${label} down`} disabled={last} onClick={() => move(1)}><ArrowDown size={13} /></button>
  </>;
}

function LinkGlyph({ link, p }: { link: SidebarLink; p: { pages: Page[]; pageIcon: (k: string) => ReactNode } }) {
  if (link.type === "page") return <span className="sb-icon">{p.pageIcon(p.pages.find(x => x.id === link.page)?.kind ?? "note")}</span>;
  const Icon = link.type === "view" ? viewIcons[link.view] : link.type === "tool" ? toolIcons[link.tool] : Globe;
  return <Icon size={15} className="sb-icon" />;
}

type NewLink = { type: "page"; page: string } | { type: "view"; view: ViewId } | { type: "tool"; tool: ToolId } | { type: "web"; label: string; url: string };
const sameTarget = (a: SidebarLink, b: NewLink) => a.type === b.type && (a.type === "page" ? a.page === (b as { page: string }).page : a.type === "view" ? a.view === (b as { view: string }).view : a.type === "tool" ? a.tool === (b as { tool: string }).tool : a.url === (b as { url: string }).url);

/** Pick what a link opens: a page, a part of the Encyclopedia, a tool, or a web page. */
function LinkPicker({ pages, kindLabels, pageIcon, has, onAdd }: { pages: Page[]; kindLabels: Record<string, string>; pageIcon: (k: string) => ReactNode; has: (l: NewLink) => boolean; onAdd: (l: NewLink) => void }) {
  const [kind, setKind] = useState<"page" | "view" | "tool" | "web">("page"), [q, setQ] = useState(""), [label, setLabel] = useState(""), [url, setUrl] = useState("");
  const found = pages.filter(x => x.kind !== "folder" && x.title.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => a.title.localeCompare(b.title)).slice(0, 8);
  const okUrl = /^https?:\/\/[^\s]+$/i.test(url.trim());
  return <div className="sb-picker">
    <div className="segmented" role="tablist" aria-label="Link to">
      {([["page", "A page"], ["view", "A section"], ["tool", "A tool"], ["web", "A web link"]] as const).map(([k, name]) => <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{name}</button>)}
    </div>
    {kind === "page" && <>
      <input className="sb-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Find a page…" aria-label="Find a page" autoFocus />
      <ul className="sb-choices">{found.map(x => { const l = { type: "page", page: x.id } as const, there = has(l); return <li key={x.id}><button disabled={there} onClick={() => onAdd(l)}><span className="sb-icon">{pageIcon(x.kind)}</span><span>{x.title}<small>{x.campaignId ? kindLabels[x.kind] : `Shared lore · ${kindLabels[x.kind]}`}</small></span>{there ? <Check size={14} /> : <Plus size={14} />}</button></li>; })}
        {!found.length && <li className="sb-empty">No pages match.</li>}</ul>
    </>}
    {kind === "view" && <ul className="sb-choices">{viewIds.map(v => { const l = { type: "view", view: v } as const, there = has(l), I = viewIcons[v]; return <li key={v}><button disabled={there} onClick={() => onAdd(l)}><I size={15} className="sb-icon" /><span>{viewLabels[v]}</span>{there ? <Check size={14} /> : <Plus size={14} />}</button></li>; })}</ul>}
    {kind === "tool" && <ul className="sb-choices">{toolIds.map(t => { const l = { type: "tool", tool: t } as const, there = has(l), I = toolIcons[t]; return <li key={t}><button disabled={there} onClick={() => onAdd(l)}><I size={15} className="sb-icon" /><span>{toolLabels[t]}</span>{there ? <Check size={14} /> : <Plus size={14} />}</button></li>; })}</ul>}
    {kind === "web" && <form className="sb-web" onSubmit={e => { e.preventDefault(); if (label.trim() && okUrl) { onAdd({ type: "web", label: label.trim(), url: url.trim() }); setLabel(""); setUrl(""); } }}>
      <label>Name<input className="sb-input" value={label} maxLength={60} onChange={e => setLabel(e.target.value)} placeholder="Session music" /></label>
      <label>Web address<input className="sb-input" value={url} maxLength={500} onChange={e => setUrl(e.target.value)} placeholder="https://" inputMode="url" /></label>
      {url.trim() && !okUrl && <p className="sb-hint">Links must start with http:// or https://</p>}
      <button className="button primary small" type="submit" disabled={!label.trim() || !okUrl}><LinkIcon size={14} /> Add link</button>
    </form>}
  </div>;
}

/** A category's name, its links in order, and the kinds of page it lists by itself. */
function CategoryDialog({ cat, p, edit, onClose, onDelete }: { cat: SidebarCategory; p: SidebarNavProps; edit: (f: (s: Sidebar) => Sidebar) => void; onClose: () => void; onDelete: () => void }) {
  const [name, setName] = useState(cat.name);
  const kinds = new Set(cat.kinds ?? []);
  return <ToolDialog title="Edit category" onClose={onClose}>
    <div className="sb-cat-dialog">
      <label className="sb-field">Name<input className="sb-input" value={name} maxLength={40} onChange={e => setName(e.target.value)} onBlur={() => edit(s => renameCategory(s, cat.id, name))} /></label>
      <h3>Links</h3>
      <ol className="sb-list">
        {cat.links.map((l, i) => { const label = linkLabel(l, p.pages); return <li key={l.id}>
          <LinkGlyph link={l} p={p} /><span className="sb-label">{label}</span>
          <Arrows label={label} first={i === 0} last={i === cat.links.length - 1} move={by => edit(s => moveCategoryLink(s, cat.id, i, i + by))} />
          <button className="sb-eye" aria-label={`Remove ${label}`} title="Remove" onClick={() => edit(s => removeCategoryLink(s, cat.id, l.id))}><X size={15} /></button>
        </li>; })}
        {!cat.links.length && <li className="sb-empty">No links yet. Add some below.</li>}
      </ol>
      <h3>Add a link</h3>
      <LinkPicker pages={p.pages} kindLabels={p.kindLabels} pageIcon={p.pageIcon} has={l => cat.links.some(x => sameTarget(x, l))} onAdd={l => edit(s => addCategoryLink(s, cat.id, l, newLinkId))} />
      <h3>Also list every page that is a…</h3>
      <div className="sb-kinds">{categoryKinds.map(k => <label key={k}><input type="checkbox" checked={kinds.has(k)} onChange={e => { const next = new Set(kinds); if (e.target.checked) next.add(k); else next.delete(k); edit(s => setCategoryKinds(s, cat.id, [...next] as CategoryKind[])); }} />{p.kindLabels[k] ?? k}</label>)}</div>
      <p className="sb-hint">Those pages show after your links, by name, and new ones join by themselves.</p>
      <div className="sb-dialog-foot">
        <button className="text-button sb-danger" onClick={onDelete}><Trash2 size={14} /> Delete category</button>
        <button className="button primary small" onClick={() => { edit(s => renameCategory(s, cat.id, name)); onClose(); }}>Done</button>
      </div>
    </div>
  </ToolDialog>;
}
