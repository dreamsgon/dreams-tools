"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { Check, Merge, MoreVertical, Pencil, Plus, Tag as TagIcon, Trash2, X } from "lucide-react";
import { usePopover } from "./popover-menu";
import { TAG_COLORS, TAG_COLOR_NAMES, applyTagAction, cleanTagName, findTag, kindsLabel, newTagId, nextColor, suggestTags, tagUses, tagsOn, type Tag, type TagAction, type TagColor, type TagLibrary, type TaggedItem, type TargetKind } from "@/lib/tags";
import "./tags.css";
import { confirmDialog } from "./confirm-dialog";

/*
 * Tags in the browser. Every component on a page shares one copy of the tags, so a
 * tag added on a page shows up straight away in search and in the Tags manager.
 * Each change is applied here first and then saved; if the save fails, the saved
 * tags are loaded again and the problem is shown.
 */

type State = { library: TagLibrary | null; items: TaggedItem[] | null; error: string };
let state: State = { library: null, items: null, error: "" };
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => { state = { ...state, ...next }; listeners.forEach(l => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const SERVER: State = { library: null, items: null, error: "" };

async function load(items = false) {
  try {
    const r = await fetch(`/api/tags${items ? "?items=1" : ""}`, { cache: "no-store" });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || "Tags could not be loaded.");
    set({ library: body.library, ...(items ? { items: body.items } : {}), error: "" });
  } catch (e) { set({ error: e instanceof Error ? e.message : "Tags could not be loaded." }); }
}

/** Loads the tags once per page. With items, also loads what is tagged across both tools. */
export function loadTags(items = false) {
  if (items) return load(true);
  return (loading ??= load());
}

/** Applies one change now, then saves it. Returns false if it could not be made. */
export async function changeTags(action: TagAction): Promise<boolean> {
  const before = state.library;
  if (!before) return false;
  try { set({ library: applyTagAction(before, action), error: "" }); }
  catch (e) { set({ error: e instanceof Error ? e.message : "That change could not be made." }); return false; }
  try {
    const r = await fetch("/api/tags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || "Your tags could not be saved.");
    set({ library: body.library });
    if (state.items) void load(true);
    return true;
  } catch (e) {
    set({ error: e instanceof Error ? e.message : "Your tags could not be saved." });
    void load(!!state.items);
    return false;
  }
}

export function useTags() {
  const s = useSyncExternalStore(subscribe, () => state, () => SERVER);
  useEffect(() => { void loadTags(); }, []);
  return s;
}

/** Creates a tag (or finds the one with that name) and puts it on a target. */
export async function addNewTag(target: string, name: string, color: TagColor) {
  const lib = state.library; if (!lib) return;
  const existing = findTag(lib, name);
  const id = existing?.id ?? newTagId();
  if (!existing && !(await changeTags({ action: "create", id, name, color }))) return;
  await changeTags({ action: "add", target, tagId: id });
}

export function TagChip({ tag, onRemove, onClick, small }: { tag: Tag; onRemove?: () => void; onClick?: () => void; small?: boolean }) {
  const cls = `tag-chip tag-${tag.color}${small ? " tag-chip-small" : ""}`;
  const inner = <><i aria-hidden="true" />{tag.name}</>;
  return <span className={cls}>
    {onClick ? <button type="button" className="tag-chip-name" title={`Show everything tagged ${tag.name}`} onClick={onClick}>{inner}</button> : <span className="tag-chip-name">{inner}</span>}
    {onRemove && <button type="button" className="tag-chip-remove" aria-label={`Remove tag ${tag.name}`} onClick={onRemove}><X size={11} /></button>}
  </span>;
}

/** Just the chips, for lists and search results. */
export function TagList({ tags, max = 3, onClick }: { tags: Tag[]; max?: number; onClick?: (tag: Tag) => void }) {
  if (!tags.length) return null;
  return <span className="tag-list-inline">
    {tags.slice(0, max).map(t => <TagChip key={t.id} tag={t} small onClick={onClick ? () => onClick(t) : undefined} />)}
    {tags.length > max && <span className="tag-more">+{tags.length - max}</span>}
  </span>;
}

/**
 * The tags on one thing, each with a remove button, and "+ Tag" to add more.
 * `targets` lists every key the thing has been saved under; new tags go on the first.
 */
export function TagRow({ targets, onTagClick, className = "" }: { targets: string[]; onTagClick?: (tag: Tag) => void; className?: string }) {
  const { library, error } = useTags();
  const { open, setOpen, wrapper } = usePopover();
  if (!library) return error ? <div className={`tag-row ${className}`}><span className="tag-error">{error}</span></div> : null;
  const tags = tagsOn(library, ...targets);
  return <div className={`tag-row ${className}`.trim()} ref={wrapper}>
    {tags.map(t => <TagChip key={t.id} tag={t} onClick={onTagClick ? () => onTagClick(t) : undefined} onRemove={() => void changeTags({ action: "remove", targets, tagId: t.id })} />)}
    <button type="button" className="tag-add" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(v => !v)}><Plus size={13} />Tag</button>
    {open && <TagPicker library={library} applied={tags.map(t => t.id)} onPick={t => { void changeTags({ action: "add", target: targets[0], tagId: t.id }); setOpen(false); }} onCreate={(name, color) => { void addNewTag(targets[0], name, color); setOpen(false); }} />}
    {error && <span className="tag-error" role="alert">{error}</span>}
  </div>;
}

/** Type to find a tag, or create a new one in a colour you pick. */
export function TagPicker({ library, applied, onPick, onCreate }: { library: TagLibrary; applied: string[]; onPick: (tag: Tag) => void; onCreate: (name: string, color: TagColor) => void }) {
  const [text, setText] = useState(""), [active, setActive] = useState(0), [color, setColor] = useState<TagColor>(() => nextColor(library));
  const uses = useMemo(() => tagUses(library), [library]);
  const name = cleanTagName(text), exact = name ? findTag(library, name) : undefined;
  const found = suggestTags(library, text, 8).filter(t => !applied.includes(t.id));
  const canCreate = !!name && !exact;
  const count = found.length + (canCreate ? 1 : 0), current = Math.min(active, Math.max(count - 1, 0));
  const key = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((current + 1) % Math.max(count, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((current - 1 + count) % Math.max(count, 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (current < found.length) onPick(found[current]); else if (canCreate) onCreate(name, color); else if (exact && !applied.includes(exact.id)) onPick(exact); }
  };
  return <div className="tag-picker" role="dialog" aria-label="Add a tag">
    <label className="tag-picker-input"><TagIcon size={14} aria-hidden="true" /><input autoFocus value={text} maxLength={60} placeholder="Find or create a tag" aria-label="Tag name" onChange={e => { setText(e.target.value); setActive(0); }} onKeyDown={key} /></label>
    <div className="tag-picker-list" role="listbox" aria-label="Tags">
      {found.map((t, i) => <button type="button" role="option" aria-selected={i === current} key={t.id} onMouseMove={() => setActive(i)} onClick={() => onPick(t)}>
        <i className={`tag-dot tag-${t.color}`} aria-hidden="true" /><span>{t.name}</span><small>{plural(uses.get(t.id)?.count ?? 0, "use")}</small>
      </button>)}
      {canCreate && <div className={`tag-picker-create${current === found.length ? " is-active" : ""}`} onMouseMove={() => setActive(found.length)}>
        <button type="button" role="option" aria-selected={current === found.length} onClick={() => onCreate(name, color)}><Plus size={14} aria-hidden="true" />Create “{name}”</button>
        <ColorDots value={color} onChange={setColor} />
      </div>}
      {!found.length && !canCreate && <p className="tag-picker-empty">{exact ? `“${exact.name}” is already on this.` : library.tags.length ? "No more tags to add. Type a name to create one." : "Type a name to create your first tag."}</p>}
    </div>
    <p className="tag-picker-foot">Tags are shared by Maptable and the Encyclopedia</p>
  </div>;
}

function ColorDots({ value, onChange }: { value: TagColor; onChange: (c: TagColor) => void }) {
  return <span className="tag-colors" role="radiogroup" aria-label="Colour">
    {TAG_COLORS.map(c => <button type="button" key={c} role="radio" aria-checked={c === value} aria-label={TAG_COLOR_NAMES[c]} title={TAG_COLOR_NAMES[c]} className={`tag-dot tag-${c}`} onClick={() => onChange(c)} />)}
  </span>;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Rename, recolour, merge and delete tags. */
export function TagsManager({ onClose, onShow }: { onClose: () => void; onShow?: (tag: Tag) => void }) {
  const { library, items, error } = useTags();
  const ref = useRef<HTMLDialogElement>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => { ref.current?.showModal(); void loadTags(true); }, []);
  const counts = useMemo(() => {
    if (!items) return library ? tagUses(library) : new Map<string, { count: number; kinds: Set<TargetKind> }>();
    const m = new Map<string, { count: number; kinds: Set<TargetKind> }>();
    for (const it of items) for (const id of it.tagIds) { const u = m.get(id) ?? { count: 0, kinds: new Set<TargetKind>() }; u.count++; u.kinds.add(it.kind); m.set(id, u); }
    return m;
  }, [items, library]);
  const tags = [...(library?.tags ?? [])].sort((a, b) => (counts.get(b.id)?.count ?? 0) - (counts.get(a.id)?.count ?? 0) || a.name.localeCompare(b.name));
  return <dialog ref={ref} className="tags-manager" aria-labelledby="tags-manager-title" onCancel={onClose} onClick={e => { if (e.target === ref.current) onClose(); }}>
    <div className="tags-manager-head">
      <h2 id="tags-manager-title">Tags</h2>
      <button type="button" className="tags-button tags-button-primary" onClick={() => setAdding(true)} disabled={!library}><Plus size={15} />New tag</button>
      <button type="button" className="tags-icon" aria-label="Close" onClick={onClose}><X size={18} /></button>
    </div>
    <p className="tags-manager-intro">Your own labels for pages, characters, scenes and campaigns. Click a colour to change it; the ⋮ menu renames, merges or deletes a tag.</p>
    {error && <p className="tag-error" role="alert">{error}</p>}
    <div className="tags-manager-list">
      {adding && library && <NewTagRow library={library} done={() => setAdding(false)} />}
      {tags.map(t => <ManagerRow key={t.id} tag={t} library={library!} uses={counts.get(t.id)} onShow={onShow ? () => { onClose(); onShow(t); } : undefined} />)}
      {library && !tags.length && !adding && <p className="tags-manager-empty">No tags yet. Add one here, or with “+ Tag” on any page, scene or campaign.</p>}
      {!library && !error && <p className="tags-manager-empty">Loading tags…</p>}
    </div>
    <p className="tags-manager-foot">Deleting a tag removes it everywhere but never deletes the pages or maps.</p>
  </dialog>;
}

function NewTagRow({ library, done }: { library: TagLibrary; done: () => void }) {
  const [name, setName] = useState(""), [color, setColor] = useState<TagColor>(() => nextColor(library));
  const save = async () => { const clean = cleanTagName(name); if (!clean) return done(); if (await changeTags({ action: "create", id: newTagId(), name: clean, color })) done(); };
  return <form className="tags-row tags-row-new" onSubmit={e => { e.preventDefault(); void save(); }}>
    <i className={`tag-dot tag-${color}`} aria-hidden="true" />
    <input autoFocus value={name} maxLength={60} placeholder="Tag name" aria-label="New tag name" onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); done(); } }} />
    <ColorDots value={color} onChange={setColor} />
    <button type="submit" className="tags-button tags-button-primary">Add</button>
    <button type="button" className="tags-button" onClick={done}>Cancel</button>
  </form>;
}

function ManagerRow({ tag, library, uses, onShow }: { tag: Tag; library: TagLibrary; uses?: { count: number; kinds: Set<TargetKind> }; onShow?: () => void }) {
  const { open: colourOpen, setOpen: setColourOpen, wrapper: colourRef } = usePopover(), { open: menuOpen, setOpen: setMenuOpen, wrapper: menuRef } = usePopover();
  const [mode, setMode] = useState<"view" | "rename" | "merge">("view"), [name, setName] = useState(tag.name), [into, setInto] = useState("");
  const others = library.tags.filter(t => t.id !== tag.id).sort((a, b) => a.name.localeCompare(b.name));
  const rename = async () => { if (cleanTagName(name) === tag.name || await changeTags({ action: "rename", tagId: tag.id, name })) setMode("view"); };
  const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setMode("view"); setName(tag.name); } };
  return <div className="tags-row">
    <div className="tags-colour" ref={colourRef}>
      <button type="button" className={`tag-dot tag-dot-big tag-${tag.color}`} aria-label={`Colour of ${tag.name}: ${TAG_COLOR_NAMES[tag.color]}. Change`} aria-haspopup="dialog" aria-expanded={colourOpen} onClick={() => setColourOpen(v => !v)} />
      {colourOpen && <div className="tags-pop"><ColorDots value={tag.color} onChange={c => { setColourOpen(false); void changeTags({ action: "recolor", tagId: tag.id, color: c }); }} /></div>}
    </div>
    {mode === "rename" ? <form className="tags-inline" onSubmit={e => { e.preventDefault(); void rename(); }}>
      <input autoFocus value={name} maxLength={60} aria-label={`New name for ${tag.name}`} onChange={e => setName(e.target.value)} onKeyDown={escape} />
      <button type="submit" className="tags-icon" aria-label="Save name"><Check size={16} /></button>
    </form> : mode === "merge" ? <form className="tags-inline" onSubmit={e => { e.preventDefault(); if (into) void changeTags({ action: "merge", from: tag.id, into }); }}>
      <span className="tags-merge-label">Merge <strong>{tag.name}</strong> into</span>
      <select autoFocus value={into} aria-label={`Merge ${tag.name} into`} onChange={e => setInto(e.target.value)} onKeyDown={escape}><option value="">Choose a tag…</option>{others.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
      <button type="submit" className="tags-button tags-button-primary" disabled={!into}>Merge</button>
      <button type="button" className="tags-button" onClick={() => setMode("view")}>Cancel</button>
    </form> : <>
      {onShow ? <button type="button" className="tags-name" title={`Show everything tagged ${tag.name}`} onClick={onShow}>{tag.name}</button> : <span className="tags-name">{tag.name}</span>}
      <span className="tags-uses">{plural(uses?.count ?? 0, "use")}</span>
      <span className="tags-kinds">{uses && uses.kinds.size ? kindsLabel(uses.kinds) : "Not used yet"}</span>
      <button type="button" className="tags-icon" aria-label={`Rename ${tag.name}`} onClick={() => { setName(tag.name); setMode("rename"); }}><Pencil size={14} /></button>
      <div className="tags-menu" ref={menuRef}>
        <button type="button" className="tags-icon" aria-label={`More for ${tag.name}`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)}><MoreVertical size={15} /></button>
        {menuOpen && <div className="tags-pop tags-pop-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setName(tag.name); setMode("rename"); }}><Pencil size={14} />Rename</button>
          <button type="button" role="menuitem" disabled={!others.length} onClick={() => { setMenuOpen(false); setInto(""); setMode("merge"); }}><Merge size={14} />Merge into…</button>
          <button type="button" role="menuitem" className="tags-danger" onClick={async () => { setMenuOpen(false); if (await confirmDialog({ title: `Delete the tag “${tag.name}”?`, message: `It is removed from ${plural(uses?.count ?? 0, "thing")}. The pages and maps stay.`, confirm: "Delete tag", danger: true })) void changeTags({ action: "delete", tagId: tag.id }); }}><Trash2 size={14} />Delete</button>
        </div>}
      </div>
    </>}
  </div>;
}
