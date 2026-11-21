"use client";
/*
 * Page templates: the Templates page (fields, tabs and starting text), the info box on a page made from one,
 * the template choice in New entry, and Save as template.
 */
import { Fragment, useState } from "react";
import { arrangeStats, moveStat, moveStatGroup, statGroups, statOff, tidy, toggleStat, type StatArrangement } from "@/lib/encyclopedia/stat-arrange";
import { ArrowDown, ArrowUp, Copy, EyeOff, LayoutTemplate, Pencil, Plus, Trash2, X } from "lucide-react";
import { compareEntries, folderPath, newId, templateKinds, type Entry, type HideableTab, type PageTemplate, type StatField, type TemplateField, type Workspace } from "@/lib/encyclopedia/world-model";
import { applyTemplate, characterStarters, cleanValue, readMulti, readScore, readTrack, deleteTemplate, FIELD_TYPES, HIDEABLE_TABS, infoRows, KIND_NAMES, saveTemplate, starterTemplates, templateFromPage, templateOf, templatesFor, templateUses, type FieldValue } from "@/lib/encyclopedia/templates";
import { defaultCharacterLayout, maxFacts, profileBlockInfo, type CharacterLayout } from "@/lib/encyclopedia/character-profile";
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
  if (f.type === "check") return <span className="field-check"><input type="checkbox" aria-label={label} checked={value === "yes"} onChange={e => onChange(e.target.checked ? "yes" : undefined)}/> {value === "yes" ? "Yes" : "No"}</span>;
  if (f.type === "multi") { const picked = readMulti(f, value); return <span className="field-multi" role="group" aria-label={label}>{f.options?.map(o => <button type="button" key={o} aria-pressed={picked.includes(o)} onClick={() => onChange(cleanValue(f, (picked.includes(o) ? picked.filter(x => x !== o) : [...picked, o]).join(",")))}>{o}</button>)}</span>; }
  if (f.type === "score") { const { score, mod } = readScore(f, value), typed = f.mod === "typed";
    const put = (sc: number | null, md: number | null) => onChange(cleanValue(f, typed && md !== null ? `${sc ?? ""}|${md}` : sc === null ? "" : String(sc)));
    return <span className="field-score"><NumBox label={`${label} score`} value={score} onChange={v => put(v, mod)}/>{typed ? <NumBox label={`${label} modifier`} value={mod} signed onChange={v => put(score, v)}/> : <output aria-label={`${label} modifier`}>{mod === null ? "—" : mod >= 0 ? `+${mod}` : `−${Math.abs(mod)}`}</output>}</span>; }
  if (f.type === "track") { const { cur, max } = readTrack(value), put = (c: number | null, m: number | null) => onChange(cleanValue(f, `${c ?? ""}/${m ?? ""}`));
    return <span className="field-track"><NumBox label={`${label} now`} value={cur} onChange={v => put(v, max)}/><span aria-hidden="true">/</span><NumBox label={`${label} max`} value={max} onChange={v => put(cur, v)}/></span>; }
  if (f.type === "url") return <UrlBox label={label} value={value} onChange={onChange} f={f}/>;
  return <input aria-label={label} inputMode={f.type === "number" ? "numeric" : undefined} maxLength={2000} value={value ?? ""} onChange={e => onChange(f.type === "number" ? (e.target.value.trim() === "" ? undefined : (cleanValue(f, e.target.value) ?? e.target.value)) : e.target.value || undefined)}/>;
}

/** A number box that keeps what's being typed ("-", "+") and passes on numbers only. */
function NumBox({ label, value, onChange, signed = false }: { label: string; value: number | null; onChange: (v: number | null) => void; signed?: boolean }) {
  const show = (v: number | null) => v === null ? "" : signed && v > 0 ? `+${v}` : String(v);
  const [text, setText] = useState(show(value));
  const shown = Number(text.replace("−", "-")) === value || (text === "" && value === null) || /^[-+−]$/.test(text) ? text : show(value);
  return <input aria-label={label} inputMode="numeric" maxLength={8} value={shown} placeholder="—" onChange={e => { const t = e.target.value; setText(t); const n = Number(t.replace("−", "-")); onChange(t.trim() === "" || /^[-+−]$/.test(t.trim()) ? null : Number.isFinite(n) ? n : value); }}/>;
}
/** A web link: kept as typed, saved when it is a real http(s) address. */
function UrlBox({ label, value, onChange, f }: { label: string; value: FieldValue | undefined; onChange: (v: FieldValue | undefined) => void; f: TemplateField }) {
  const [text, setText] = useState(String(value ?? "")), ok = !text.trim() || cleanValue(f, text) !== undefined;
  return <input aria-label={label} type="url" inputMode="url" placeholder="https://…" maxLength={2000} value={text} aria-invalid={!ok} onChange={e => { setText(e.target.value); const v = cleanValue(f, e.target.value); if (v !== undefined || !e.target.value.trim()) onChange(v); }}/>;
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
      : rows.length ? <dl>{rows.map(r => <div key={r.id} className={r.gm ? "gm" : ""}><dt>{r.label}{r.gm && <EyeOff size={11} aria-label="GM only"/>}</dt><dd>{r.pageId ? <button className="wiki-link" onClick={() => onOpen(r.pageId!)}>{r.value}</button> : r.href ? <a href={r.href} target="_blank" rel="noopener noreferrer">{r.value}</a> : r.score !== undefined && r.mod ? <span className="info-score"><b>{r.mod}</b><small>{r.score}</small></span> : r.value}</dd></div>)}</dl>
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

/** Who a template is for: one campaign, or every campaign in the world. */
function ScopePick({ value, onChange, campaignName, worldName }: { value: "campaign" | "world"; onChange: (v: "campaign" | "world") => void; campaignName?: string; worldName: string }) {
  return <div className="template-scope" role="radiogroup" aria-label="Who can use it">
    <button type="button" role="radio" aria-checked={value === "campaign"} disabled={!campaignName} onClick={() => onChange("campaign")}><strong>This campaign</strong><small>{campaignName ?? "Open a campaign first"}</small></button>
    <button type="button" role="radio" aria-checked={value === "world"} onClick={() => onChange("world")}><strong>Whole world</strong><small>Every campaign in {worldName}</small></button>
  </div>;
}

/** Save as template, from a page: a new template, or this page's layout written over one that exists. */
export function SaveAsTemplate({ entry, data, campaignId, change, onDone, onClose }: { entry: Entry; data: Workspace; campaignId: string | null; change: Change; onDone: (name: string) => void; onClose: () => void }) {
  const world = data.worlds.find(w => w.id === entry.worldId), campaign = data.campaigns.find(c => c.id === campaignId);
  const same = templatesFor(world, campaignId).filter(t => t.kind === entry.kind);
  const [name, setName] = useState(entry.title), [scope, setScope] = useState<"campaign" | "world">(campaign ? "campaign" : "world"), [over, setOver] = useState("");
  const character = entry.kind === "character";
  return <ToolDialog title="Save as a template" onClose={onClose}><form className="details-form" onSubmit={e => { e.preventDefault();
    const old = same.find(t => t.id === over), made = templateFromPage(data, entry, old ? old.name : name, newId);
    if (!old && !name.trim()) return;
    // Writing over a template keeps its id (pages made from it stay linked), name, fields and where new pages go.
    const t: PageTemplate = old ? { ...made, id: old.id, name: old.name, fields: old.fields, parentId: old.parentId, ...(old.campaignId ? { campaignId: old.campaignId } : {}) } : { ...made, ...(scope === "campaign" && campaign ? { campaignId: campaign.id } : {}) };
    if (change(s => saveTemplate(s, entry.worldId, t, newId)) !== false) onDone(t.name); }}>
    <p className="modal-intro">New pages made from it start with this page’s tabs and text{templateOf(data, entry) ? ", its info box fields" : ""}{character ? ", the tabs you hid and its Profile layout (fields, blocks and bar, without what’s written in them)" : ""}.</p>
    {same.length > 0 && <label>Save to<select value={over} onChange={e => setOver(e.target.value)}><option value="">A new template</option>{same.map(t => <option key={t.id} value={t.id}>Update “{t.name}”</option>)}</select></label>}
    {!over && <>
      <label>Template name<input autoFocus required maxLength={160} value={name} onChange={e => setName(e.target.value)}/></label>
      <ScopePick value={scope} onChange={setScope} campaignName={campaign?.name} worldName={world?.name ?? "this world"}/>
    </>}
    <div className="button-row"><button type="button" className="button" onClick={onClose}>Cancel</button><button className="button primary">{over ? "Update template" : "Save template"}</button></div>
  </form></ToolDialog>;
}

/** Use a template on this page: its info box, tabs, hidden tabs and (for a character) Profile layout. */
export function UseTemplate({ entry, data, campaignId, change, onDone, onClose }: { entry: Entry; data: Workspace; campaignId: string | null; change: Change; onDone: (name: string) => void; onClose: () => void }) {
  const world = data.worlds.find(w => w.id === entry.worldId), list = templatesFor(world, campaignId).filter(t => t.kind === entry.kind);
  const [pick, setPick] = useState(entry.templateId && list.some(t => t.id === entry.templateId) ? entry.templateId : list[0]?.id ?? ""), [error, setError] = useState("");
  const t = list.find(x => x.id === pick), kind = KIND_NAMES[(templateKinds as readonly string[]).includes(entry.kind) ? entry.kind as PageTemplate["kind"] : "note"].toLowerCase();
  return <ToolDialog title="Use a template" onClose={onClose}><div className="details-form">
    {!list.length ? <p className="modal-intro">There are no {kind} templates {campaignId ? "for this campaign" : "in this world"} yet. Arrange a page the way you like it, then choose Save as template.</p> : <>
      <p className="modal-intro">The page gets the template’s info box and the tabs it doesn’t have yet{entry.kind === "character" ? ", shows only the tabs the template uses, and lays its Profile out like the template’s" : ""}. Nothing written here is removed.</p>
      <div className="template-pick" role="radiogroup" aria-label="Template">{list.map(x => <button type="button" key={x.id} role="radio" aria-checked={pick === x.id} onClick={() => setPick(x.id)}>
        <LayoutTemplate size={16}/><span><strong>{x.name}{entry.templateId === x.id && <em> · in use</em>}</strong><small>{templateSummary(x)}</small></span>
        <span className="template-pick-scope">{x.campaignId ? "Campaign" : "World"}</span></button>)}</div>
    </>}
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="button-row"><button type="button" className="button" onClick={onClose}>Cancel</button>{t && <button className="button primary" onClick={() => { try { if (change(s => applyTemplate(s, entry.id, t.id, newId)) !== false) onDone(t.name); } catch (e) { setError(e instanceof Error ? e.message : "Could not use that template."); } }}>Use {t.name}</button>}</div>
  </div></ToolDialog>;
}

/** One line on what a template gives a page. */
function templateSummary(t: PageTemplate) {
  const shown = t.kind === "character" ? HIDEABLE_TABS.filter(([id]) => !t.hiddenTabs?.includes(id)).map(([, n]) => n) : [];
  const parts = [
    t.fields.length ? `${t.fields.length} field${t.fields.length === 1 ? "" : "s"}` : "",
    t.stats?.off?.length ? `${t.stats.off.length} stat${t.stats.off.length === 1 ? "" : "s"} off` : t.stats?.order?.length ? "Own stat order" : "",
    t.layout?.facts?.length ? t.layout.facts.map(f => f.label).slice(0, 4).join(", ") : "",
    [...shown, ...t.tabs.map(x => x.title)].length ? `Tabs: ${[...shown, ...t.tabs.map(x => x.title)].slice(0, 5).join(", ")}${[...shown, ...t.tabs].length > 5 ? "…" : ""}` : "",
  ].filter(Boolean);
  return parts.join(" · ") || "Starting text only";
}

const blankField = (): TemplateField => ({ id: newId(), label: "New field", type: "text", visibility: "players" });

/** The Templates page: the world's templates on the left, the chosen one to edit on the right. */
export function TemplatesSection({ data, worldId, campaignId = null, change }: { data: Workspace; worldId: string; campaignId?: string | null; change: Change }) {
  // This campaign's templates first, then the world's. Other campaigns' templates aren't shown.
  const world = data.worlds.find(w => w.id === worldId), campaign = data.campaigns.find(c => c.id === campaignId && c.worldId === worldId);
  const all = templatesFor(world, campaign?.id), templates = [...all.filter(x => x.campaignId), ...all.filter(x => !x.campaignId)];
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
      <div className="templates-list-head"><h1>Templates</h1><button className="button small" onClick={() => add([{ id: newId(), name: "New template", kind: "note", fields: [], tabs: [], body: "", overviewVisibility: "gm", updatedAt: new Date().toISOString(), ...(campaign ? { campaignId: campaign.id } : {}) }])}><Plus size={14}/> New</button></div>
      {templates.map((x, i) => <Fragment key={x.id}>{(i === 0 || !!templates[i - 1].campaignId !== !!x.campaignId) && <p className="templates-group">{x.campaignId ? campaign?.name ?? "This campaign" : `Whole world · ${world?.name ?? ""}`}</p>}
        <button className={x.id === t?.id ? "active" : ""} onClick={() => { setOpenId(x.id); setDraft(null); setNote(""); }}><LayoutTemplate size={15}/><span>{x.name}<em>{KIND_NAMES[x.kind]}</em></span><small>{templateUses(data, x.id)}</small></button></Fragment>)}
      {templates.length > 0 && !templates.some(x => x.kind === "character") && <button className="text-button templates-add-chars" onClick={() => add(characterStarters(newId).map(x => campaign ? { ...x, campaignId: campaign.id } : x))}><Plus size={13}/> Add character templates</button>}
      {!templates.length && <div className="templates-empty"><p>Templates give new pages ready-made info box fields, tabs and starting text.</p><button className="button primary" onClick={() => add([...characterStarters(newId).map(x => campaign ? { ...x, campaignId: campaign.id } : x), ...starterTemplates(newId)])}><Plus size={14}/> Add starter templates</button><small>Settlement, Tavern, Faction, Item and Session. Change them to suit your game.</small></div>}
      {templates.length > 0 && <p className="aside-hint">Or open any page and choose Save as template.</p>}
    </div>
    {t && <div className="template-editor">
      <div className="template-editor-head"><div><input className="template-name" aria-label="Template name" maxLength={160} value={t.name} onChange={e => edit({ name: e.target.value })}/><small>Used by {uses} page{uses === 1 ? "" : "s"} · {t.campaignId ? `only ${campaign?.name ?? "one campaign"}` : `every campaign in ${world.name}`}</small></div>
        <div className="button-row"><button className="button small" onClick={() => add([{ ...t, id: newId(), name: `${t.name} copy`.slice(0, 160), fields: t.fields.map(f => ({ ...f, id: newId() })) }])}><Copy size={14}/> Duplicate</button>
          <button className="button small" onClick={async () => { if (!await confirmDialog({ title: `Delete ${t.name}?`, message: uses ? `The ${uses} page${uses === 1 ? "" : "s"} made from it keep their text and tabs, but lose their info box.` : "No pages use it.", confirm: "Delete template" })) return; if (change(s => deleteTemplate(s, worldId, t.id)) !== false) { setDraft(null); setOpenId(""); } }}><Trash2 size={14}/> Delete</button>
          <button className="button small primary" disabled={!dirty || !t.name.trim()} onClick={save}>Save changes</button></div></div>
      {note && !dirty && <p className="info-note" role="status">{note}</p>}
      <div className="template-settings">
        <label>Who can use it<select value={t.campaignId ? "campaign" : "world"} onChange={e => { const { campaignId: _c, ...rest } = t; void _c; setDraft(e.target.value === "campaign" && campaign ? { ...rest, campaignId: campaign.id } : rest); }}>
          <option value="campaign" disabled={!campaign && !t.campaignId}>{campaign ? `This campaign (${campaign.name})` : "One campaign"}</option><option value="world">Every campaign in {world.name}</option></select></label>
        <label>Kind of page<select value={t.kind} onChange={e => edit({ kind: e.target.value as PageTemplate["kind"] })}>{templateKinds.map(k => <option key={k} value={k}>{KIND_NAMES[k]}</option>)}</select></label>
        <label>New pages go inside<select value={t.parentId ?? ""} onChange={e => edit({ parentId: e.target.value || null })}><option value="">Wherever you are</option>{parents.map(p => <option key={p.id} value={p.id}>{[folderPath(data, p), p.title].filter(Boolean).join(" › ")}</option>)}</select></label>
        <label className="template-check"><input type="checkbox" checked={t.overviewVisibility === "players"} onChange={e => edit({ overviewVisibility: e.target.checked ? "players" : "gm" })}/> Players can see new pages’ Overview</label>
      </div>
      {t.kind === "character" && <CharacterTemplateParts t={t} edit={edit} worldLayout={world.characterLayout} form={campaign?.statFields?.filter(f => !f.archived)} campaignName={campaign?.name}/>}
      <h2>Fields, shown in the info box</h2>
      <div className="template-fields-table" role="table" aria-label="Fields">
        <div role="row" className="head"><span role="columnheader">Name</span><span role="columnheader">Type</span><span role="columnheader">Choices</span><span role="columnheader">Who sees it</span><span/></div>
        {t.fields.map(f => <div role="row" key={f.id}>
          <input aria-label="Field name" maxLength={60} value={f.label} onChange={e => editField(f.id, { label: e.target.value })}/>
          <select aria-label={`${f.label} type`} value={f.type} onChange={e => editField(f.id, { type: e.target.value as TemplateField["type"], ...((e.target.value === "choice" || e.target.value === "multi") && !f.options?.length ? { options: ["One", "Two"] } : {}), ...(e.target.value === "score" && !f.mod ? { mod: "d20" as const } : {}) })}>{FIELD_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          {f.type === "choice" || f.type === "multi" ? <input key={f.type} aria-label={`${f.label} choices`} placeholder={f.type === "multi" ? "Brave, Cunning, Loyal" : "Village, Town, City"} defaultValue={f.options?.join(", ")} onBlur={e => editField(f.id, { options: [...new Set(e.target.value.split(",").map(x => x.trim()).filter(Boolean))].slice(0, 30) })}/>
            : f.type === "score" ? <select aria-label={`${f.label}: modifier`} value={f.mod ?? "d20"} onChange={e => editField(f.id, { mod: e.target.value as "d20" | "typed" })}><option value="d20">Modifier = (score − 10) ÷ 2</option><option value="typed">Modifier typed in</option></select>
            : <span className="muted">{({ page: "Any page in this world", track: "Like HP 12 / 20", check: "A tick box", url: "An https:// link" } as Record<string, string>)[f.type] ?? "—"}</span>}
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

/** A character template's own parts: which ready-made tabs pages show, and the Profile layout they start with. */
function CharacterTemplateParts({ t, edit, worldLayout, form = [], campaignName }: { t: PageTemplate; edit: (p: Partial<PageTemplate>) => void; worldLayout?: CharacterLayout; form?: StatField[]; campaignName?: string }) {
  const hidden = new Set(t.hiddenTabs ?? []), layout = t.layout, [label, setLabel] = useState("");
  const setHidden = (id: HideableTab, hide: boolean) => { const next = HIDEABLE_TABS.map(([x]) => x).filter(x => x === id ? hide : hidden.has(x)); edit({ hiddenTabs: next.length ? next : undefined }); };
  const facts = layout?.facts ?? [], setFacts = (f: NonNullable<CharacterLayout["facts"]>) => layout && edit({ layout: { ...layout, facts: f.length ? f : undefined } });
  const addFact = () => { const l = label.trim().slice(0, 40); if (!l || !layout || facts.length >= maxFacts || facts.some(f => f.label.toLowerCase() === l.toLowerCase())) return; setFacts([...facts, { id: newId(), label: l }]); setLabel(""); };
  return <>
    <h2>Tabs a character gets</h2>
    <div className="template-tab-switches">{HIDEABLE_TABS.map(([id, name]) => <label key={id} className="template-check"><input type="checkbox" checked={!hidden.has(id)} onChange={e => setHidden(id, !e.target.checked)}/> {name}</label>)}</div>
    <p className="aside-hint">Profile, Overview and Connections are always there. A tab left out can be shown again from the page’s Tabs menu.</p>
    {!hidden.has("stats") && <TemplateStats t={t} edit={edit} form={form} campaignName={campaignName}/>}
    <h2>Profile layout</h2>
    {layout ? <div className="template-layout">
      <div className="template-layout-row"><span className="template-layout-label">Fields at the top</span><span className="template-chips">{facts.map(f => <span key={f.id} className="template-chip">{f.label}{f.gm && <EyeOff size={11} aria-label="GM only"/>}<button type="button" aria-label={`Remove ${f.label}`} onClick={() => setFacts(facts.filter(x => x.id !== f.id))}><X size={11}/></button></span>)}
        {facts.length < maxFacts && <form className="template-chip-add" onSubmit={e => { e.preventDefault(); addFact(); }}><input aria-label="New field name" placeholder="Add a field" maxLength={40} value={label} onChange={e => setLabel(e.target.value)}/></form>}</span></div>
      <div className="template-layout-row"><span className="template-layout-label">Blocks</span><span className="template-chips">{layout.blocks.map(b => <span key={b.id} className="template-chip plain">{b.title || profileBlockInfo[b.kind].name}{b.gm && <EyeOff size={11} aria-label="GM only"/>}</span>)}{!layout.blocks.length && <span className="muted">None</span>}</span></div>
      {!layout.bar.hidden && <div className="template-layout-row"><span className="template-layout-label">{layout.bar.title || "Bottom bar"}</span><span className="template-chips">{layout.bar.fields.map(f => <span key={f.id} className="template-chip plain">{f.label}</span>)}</span></div>}
      <p className="aside-hint">To move blocks around, arrange a character’s Profile, then Save as template and pick Update “{t.name}”. <button type="button" className="text-button" onClick={() => edit({ layout: undefined })}>Use the world’s layout instead</button></p>
    </div> : <div className="template-layout is-empty"><p>New characters get the world’s character layout.</p><button type="button" className="button small" onClick={() => edit({ layout: worldLayout ?? defaultCharacterLayout() })}><Plus size={13}/> Give this template its own</button></div>}
  </>;
}

/** Which of the campaign's stats a character made from this template has on, and in what order (per group). */
function TemplateStats({ t, edit, form, campaignName }: { t: PageTemplate; edit: (p: Partial<PageTemplate>) => void; form: StatField[]; campaignName?: string }) {
  const known = new Set(form.map(f => f.id)), ordered = arrangeStats(form, t.stats), groups = statGroups(ordered);
  const set = (next: StatArrangement | undefined) => { const tidied = tidy(next, known); edit({ stats: tidied }); };
  if (!form.length) return <><h2>Stats and skills</h2><p className="aside-hint">{campaignName ? `${campaignName} has no stat form yet. Make one with Stat form, then choose which stats this template uses.` : "Open a campaign to choose which of its stats this template uses."}</p></>;
  const on = ordered.filter(f => !statOff(t.stats, f.id)).length;
  return <>
    <h2>Stats and skills</h2>
    <p className="aside-hint">From {campaignName}’s stat form. {on} of {form.length} on. Characters made from this template, or given it with Use a template, get this order and only these stats. {t.stats && <button type="button" className="text-button" onClick={() => edit({ stats: undefined })}>Use the form’s order, all on</button>}</p>
    <div className="template-stats">{groups.map((g, gi) => <div key={g.name} className="template-stat-group">
      <div className="template-stat-head"><strong>{g.name || "Stats"}</strong><span>
        <button type="button" className="icon-button" aria-label={`Move ${g.name} up`} disabled={gi === 0} onClick={() => set({ ...t.stats, order: moveStatGroup(ordered, g.name, -1) })}><ArrowUp size={13}/></button>
        <button type="button" className="icon-button" aria-label={`Move ${g.name} down`} disabled={gi === groups.length - 1} onClick={() => set({ ...t.stats, order: moveStatGroup(ordered, g.name, 1) })}><ArrowDown size={13}/></button></span></div>
      {g.fields.map((f, i) => <div key={f.id} className={`template-stat${statOff(t.stats, f.id) ? " is-off" : ""}`}>
        <label className="template-check"><input type="checkbox" checked={!statOff(t.stats, f.id)} onChange={() => set(toggleStat(t.stats, f.id))}/> {f.label}</label>
        <span><button type="button" className="icon-button" aria-label={`Move ${f.label} up`} disabled={i === 0} onClick={() => set({ ...t.stats, order: moveStat(ordered, f.id, -1) })}><ArrowUp size={13}/></button>
          <button type="button" className="icon-button" aria-label={`Move ${f.label} down`} disabled={i === g.fields.length - 1} onClick={() => set({ ...t.stats, order: moveStat(ordered, f.id, 1) })}><ArrowDown size={13}/></button></span>
      </div>)}
    </div>)}</div>
  </>;
}
