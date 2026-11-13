"use client";
/*
 * Page templates: the Templates page (fields, tabs and starting text), the info box on a page made from one,
 * the template choice in New entry, and Save as template.
 */
import { useState } from "react";
import { Copy, EyeOff, LayoutTemplate, Pencil, Plus, Trash2, X } from "lucide-react";
import { compareEntries, folderPath, newId, templateKinds, type Entry, type PageTemplate, type TemplateField, type Workspace } from "@/lib/encyclopedia/world-model";
import { cleanValue, deleteTemplate, FIELD_TYPES, infoRows, KIND_NAMES, saveTemplate, starterTemplates, templateFromPage, templateOf, templateUses, type FieldValue } from "@/lib/encyclopedia/templates";
import { ToolDialog } from "./tool-dialog";
import { confirmDialog } from "../confirm-dialog";

type Change = (s: Workspace | ((latest: Workspace) => Workspace)) => boolean | void;
/** Pages a link field can point at: any page in this world, except folders. */
const linkable = (data: Workspace, worldId: string) => data.entries.filter(e => e.worldId === worldId && e.kind !== "folder").sort((a, b) => a.title.localeCompare(b.title));

/** One info box value as an input. */
function FieldInput({ f, value, data, worldId, onChange }: { f: TemplateField; value: FieldValue | undefined; data: Workspace; worldId: string; onChange: (v: FieldValue | undefined) => void }) {
  const label = `${f.label}${f.visibility === "gm" ? " (GM only)" : ""}`;
  if (f.type === "choice") return <select aria-label={label} value={value ?? ""} onChange={e => onChange(cleanValue(f, e.target.value))}><option value="">—</option>{f.options?.map(o => <option key={o}>{o}</option>)}</select>;
  if (f.type === "page") return <select aria-label={label} value={value ?? ""} onChange={e => onChange(e.target.value || undefined)}><option value="">—</option>{linkable(data, worldId).map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select>;
  if (f.type === "textarea") return <textarea aria-label={label} rows={2} maxLength={2000} value={value ?? ""} onChange={e => onChange(e.target.value || undefined)}/>;
  return <input aria-label={label} inputMode={f.type === "number" ? "numeric" : undefined} maxLength={2000} value={value ?? ""} onChange={e => onChange(f.type === "number" ? (e.target.value.trim() === "" ? undefined : (cleanValue(f, e.target.value) ?? e.target.value)) : e.target.value || undefined)}/>;
}

/** The info box on a page made from a template. Edit shows every field; reading shows the ones with a value. */
export function InfoBox({ entry, data, update, onOpen }: { entry: Entry; data: Workspace; update: (p: Partial<Entry>) => void; onOpen: (id: string) => void }) {
  const t = templateOf(data, entry), [editing, setEditing] = useState(false);
  if (!t || !t.fields.length) return null;
  const rows = infoRows(data, t, entry);
  const set = (id: string, v: FieldValue | undefined) => { const next = { ...entry.fields }; if (v === undefined) delete next[id]; else next[id] = v; update({ fields: Object.keys(next).length ? next : undefined }); };
  return <div className="aside-section info-box">
    <div className="aside-heading"><span className="eyebrow">{t.name.toUpperCase()}</span><button className="text-button" onClick={() => setEditing(!editing)}>{editing ? "Done" : <><Pencil size={12}/> Edit</>}</button></div>
    {editing ? <div className="info-box-edit">{t.fields.map(f => <label key={f.id}><span>{f.label}{f.visibility === "gm" && <EyeOff size={11} aria-label="GM only"/>}</span><FieldInput f={f} value={entry.fields?.[f.id]} data={data} worldId={entry.worldId} onChange={v => set(f.id, v)}/></label>)}</div>
      : rows.length ? <dl>{rows.map(r => <div key={r.id} className={r.gm ? "gm" : ""}><dt>{r.label}{r.gm && <EyeOff size={11} aria-label="GM only"/>}</dt><dd>{r.pageId ? <button className="wiki-link" onClick={() => onOpen(r.pageId!)}>{r.value}</button> : r.value}</dd></div>)}</dl>
      : <p className="aside-hint">Nothing filled in yet. Choose Edit to add {t.fields.slice(0, 3).map(f => f.label.toLowerCase()).join(", ")}.</p>}
  </div>;
}

/** New entry: Blank or a template, and the template's fields to fill in now. */
export function TemplateChoice({ templates, chosen, onChoose, values, setValues, data, worldId }: { templates: PageTemplate[]; chosen: string; onChoose: (t: PageTemplate | null) => void; values: Record<string, FieldValue>; setValues: (v: Record<string, FieldValue>) => void; data: Workspace; worldId: string }) {
  const t = templates.find(x => x.id === chosen);
  return <>
    <div className="template-choice" role="radiogroup" aria-label="Template">
      <button type="button" role="radio" aria-checked={!t} className={!t ? "on" : ""} onClick={() => onChoose(null)}>Blank</button>
      {templates.map(x => <button type="button" key={x.id} role="radio" aria-checked={t?.id === x.id} className={t?.id === x.id ? "on" : ""} onClick={() => onChoose(x)}>{x.name}</button>)}
    </div>
    {t && t.fields.length > 0 && <div className="template-fields">{t.fields.filter(f => f.type !== "textarea").slice(0, 6).map(f => <label key={f.id}>{f.label}<FieldInput f={f} value={values[f.id]} data={data} worldId={worldId} onChange={v => { const next = { ...values }; if (v === undefined) delete next[f.id]; else next[f.id] = v; setValues(next); }}/></label>)}</div>}
  </>;
}

/** Save as template, from a page. */
export function SaveAsTemplate({ entry, data, change, onDone, onClose }: { entry: Entry; data: Workspace; change: Change; onDone: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(entry.title);
  return <ToolDialog title="Save as a template" onClose={onClose}><form className="details-form" onSubmit={e => { e.preventDefault(); if (!name.trim()) return; const t = templateFromPage(data, entry, name, newId); if (change(s => saveTemplate(s, entry.worldId, t, newId)) !== false) onDone(t.name); }}>
    <p className="modal-intro">New pages made from it start with this page’s kind, tabs and text{templateOf(data, entry) ? " and its info box fields" : ""}. Edit it on the Templates page.</p>
    <label>Template name<input autoFocus required maxLength={160} value={name} onChange={e => setName(e.target.value)}/></label>
    <div className="button-row"><button type="button" className="button" onClick={onClose}>Cancel</button><button className="button primary">Save template</button></div>
  </form></ToolDialog>;
}

const blankField = (): TemplateField => ({ id: newId(), label: "New field", type: "text", visibility: "players" });

/** The Templates page: the world's templates on the left, the chosen one to edit on the right. */
export function TemplatesSection({ data, worldId, change }: { data: Workspace; worldId: string; change: Change }) {
  const world = data.worlds.find(w => w.id === worldId), templates = world?.templates ?? [];
  const [openId, setOpenId] = useState(templates[0]?.id ?? ""), [draft, setDraft] = useState<PageTemplate | null>(null), [note, setNote] = useState("");
  const saved = templates.find(t => t.id === openId) ?? templates[0], t = draft?.id === saved?.id ? draft : saved;
  const edit = (p: Partial<PageTemplate>) => t && setDraft({ ...t, ...p });
  const editField = (id: string, p: Partial<TemplateField>) => t && edit({ fields: t.fields.map(f => f.id === id ? { ...f, ...p } : f) });
  const dirty = !!draft && draft.id === saved?.id && JSON.stringify(draft) !== JSON.stringify(saved);
  const save = () => { if (!t) return; const next = { ...t, updatedAt: new Date().toISOString() }; if (change(s => saveTemplate(s, worldId, next, newId)) !== false) { setDraft(null); setNote(`Saved ${t.name}.`); } };
  const add = (list: PageTemplate[]) => { if (change(s => list.reduce((acc, x) => saveTemplate(acc, worldId, x, newId), s)) !== false) { setOpenId(list[0]!.id); setDraft(null); setNote(""); } };
  const parents = data.entries.filter(e => e.worldId === worldId && e.kind !== "map").sort((a, b) => folderPath(data, a).localeCompare(folderPath(data, b)) || compareEntries(a, b));
  const uses = t ? templateUses(data, t.id) : 0;
  if (!world) return null;
  return <section className="page-content templates-page">
    <div className="templates-list">
      <div className="templates-list-head"><h1>Templates</h1><button className="button small" onClick={() => add([{ id: newId(), name: "New template", kind: "note", fields: [], tabs: [], body: "", overviewVisibility: "gm", updatedAt: new Date().toISOString() }])}><Plus size={14}/> New</button></div>
      {templates.map(x => <button key={x.id} className={x.id === t?.id ? "active" : ""} onClick={() => { setOpenId(x.id); setDraft(null); setNote(""); }}><LayoutTemplate size={15}/><span>{x.name}</span><small>{templateUses(data, x.id)}</small></button>)}
      {!templates.length && <div className="templates-empty"><p>Templates give new pages ready-made info box fields, tabs and starting text.</p><button className="button primary" onClick={() => add(starterTemplates(newId))}><Plus size={14}/> Add starter templates</button><small>Settlement, Tavern, Faction, Item and Session. Change them to suit your game.</small></div>}
      {templates.length > 0 && <p className="aside-hint">Or open any page and choose Save as template.</p>}
    </div>
    {t && <div className="template-editor">
      <div className="template-editor-head"><div><input className="template-name" aria-label="Template name" maxLength={160} value={t.name} onChange={e => edit({ name: e.target.value })}/><small>Used by {uses} page{uses === 1 ? "" : "s"} · templates belong to {world.name}, so every campaign in it can use them</small></div>
        <div className="button-row"><button className="button small" onClick={() => add([{ ...t, id: newId(), name: `${t.name} copy`.slice(0, 160), fields: t.fields.map(f => ({ ...f, id: newId() })) }])}><Copy size={14}/> Duplicate</button>
          <button className="button small" onClick={async () => { if (!await confirmDialog({ title: `Delete ${t.name}?`, message: uses ? `The ${uses} page${uses === 1 ? "" : "s"} made from it keep their text and tabs, but lose their info box.` : "No pages use it.", confirm: "Delete template" })) return; if (change(s => deleteTemplate(s, worldId, t.id)) !== false) { setDraft(null); setOpenId(""); } }}><Trash2 size={14}/> Delete</button>
          <button className="button small primary" disabled={!dirty || !t.name.trim()} onClick={save}>Save changes</button></div></div>
      {note && !dirty && <p className="info-note" role="status">{note}</p>}
      <div className="template-settings">
        <label>Kind of page<select value={t.kind} onChange={e => edit({ kind: e.target.value as PageTemplate["kind"] })}>{templateKinds.map(k => <option key={k} value={k}>{KIND_NAMES[k]}</option>)}</select></label>
        <label>New pages go inside<select value={t.parentId ?? ""} onChange={e => edit({ parentId: e.target.value || null })}><option value="">Wherever you are</option>{parents.map(p => <option key={p.id} value={p.id}>{[folderPath(data, p), p.title].filter(Boolean).join(" › ")}</option>)}</select></label>
        <label className="template-check"><input type="checkbox" checked={t.overviewVisibility === "players"} onChange={e => edit({ overviewVisibility: e.target.checked ? "players" : "gm" })}/> Players can see new pages’ Overview</label>
      </div>
      <h2>Fields, shown in the info box</h2>
      <div className="template-fields-table" role="table" aria-label="Fields">
        <div role="row" className="head"><span role="columnheader">Name</span><span role="columnheader">Type</span><span role="columnheader">Choices</span><span role="columnheader">Who sees it</span><span/></div>
        {t.fields.map(f => <div role="row" key={f.id}>
          <input aria-label="Field name" maxLength={60} value={f.label} onChange={e => editField(f.id, { label: e.target.value })}/>
          <select aria-label={`${f.label} type`} value={f.type} onChange={e => editField(f.id, { type: e.target.value as TemplateField["type"], ...(e.target.value === "choice" && !f.options?.length ? { options: ["One", "Two"] } : {}) })}>{FIELD_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          {f.type === "choice" ? <input aria-label={`${f.label} choices`} placeholder="Village, Town, City" defaultValue={f.options?.join(", ")} onBlur={e => editField(f.id, { options: [...new Set(e.target.value.split(",").map(x => x.trim()).filter(Boolean))].slice(0, 30) })}/> : <span className="muted">{f.type === "page" ? "Any page in this world" : "—"}</span>}
          <select aria-label={`${f.label}: who sees it`} value={f.visibility} onChange={e => editField(f.id, { visibility: e.target.value as "gm" | "players" })}><option value="players">Players</option><option value="gm">GM only</option></select>
          <button className="icon-button" aria-label={`Remove ${f.label}`} onClick={() => edit({ fields: t.fields.filter(x => x.id !== f.id) })}><X size={14}/></button>
        </div>)}
      </div>
      <button className="text-button" disabled={t.fields.length >= 30} onClick={() => edit({ fields: [...t.fields, blankField()] })}><Plus size={13}/> Add field</button>
      <h2>Tabs</h2>
      <div className="template-tabs">{t.tabs.map((x, i) => <span key={i} className="template-tab"><input aria-label="Tab name" maxLength={160} value={x.title} onChange={e => edit({ tabs: t.tabs.map((y, j) => j === i ? { ...y, title: e.target.value } : y) })}/>
        <select aria-label={`${x.title}: who sees it`} value={x.visibility} onChange={e => edit({ tabs: t.tabs.map((y, j) => j === i ? { ...y, visibility: e.target.value as "gm" | "players" } : y) })}><option value="players">Players</option><option value="gm">GM only</option></select>
        <button className="icon-button" aria-label={`Remove ${x.title}`} onClick={() => edit({ tabs: t.tabs.filter((_, j) => j !== i) })}><X size={13}/></button></span>)}
        <button className="text-button" disabled={t.tabs.length >= 20} onClick={() => edit({ tabs: [...t.tabs, { title: "New tab", visibility: "gm" }] })}><Plus size={13}/> Tab</button></div>
      <h2>Starting text</h2>
      <textarea className="editor template-body" aria-label="Starting text" rows={10} maxLength={20000} value={t.body} onChange={e => edit({ body: e.target.value })}/>
      <p className="aside-hint">Changing a template adds new fields and tabs to the {uses} page{uses === 1 ? "" : "s"} made from it. Nothing already written is removed.</p>
    </div>}
  </section>;
}
