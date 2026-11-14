/*
 * Page templates: a world's ready-made pages (Settlement, Tavern, Organization…) with info box fields, tabs and
 * starting text. A page made from one keeps its templateId, so later fields and tabs reach it too.
 */
import type { Entry, PageTemplate, TemplateField, Workspace } from "./world-model.ts";
import type { Org } from "./org-profile.ts";

export const FIELD_TYPES: [TemplateField["type"], string][] = [["text", "Text"], ["textarea", "Long text"], ["number", "Number"], ["choice", "Choice"], ["page", "Page link"]];
export const KIND_NAMES: Record<PageTemplate["kind"], string> = { note: "Note", character: "Character", place: "Place", faction: "Organization", lore: "Lore", session: "Session", quest: "Quest" };
export type FieldValue = string | number;

const field = (id: string, label: string, type: TemplateField["type"], visibility: TemplateField["visibility"] = "players", options?: string[]): TemplateField => ({ id, label, type, visibility, ...(options ? { options } : {}) });

/** A few templates to start from. Ids are made fresh, so adding them twice makes copies. */
export function starterTemplates(newId: () => string, now = new Date().toISOString()): PageTemplate[] {
  const t = (name: string, kind: PageTemplate["kind"], fields: TemplateField[], tabs: { title: string; visibility: "gm" | "players" }[], body: string, overviewVisibility: "gm" | "players" = "players"): PageTemplate =>
    ({ id: newId(), name, kind, fields: fields.map(f => ({ ...f, id: newId() })), tabs, body, overviewVisibility, updatedAt: now });
  return [
    t("Settlement", "place", [field("", "Kind", "choice", "players", ["Village", "Town", "City", "Fort"]), field("", "People", "number"), field("", "Ruled by", "page"), field("", "Region", "page"), field("", "Market day", "text"), field("", "Who really runs it", "text", "gm")],
      [{ title: "History", visibility: "players" }, { title: "Rumours", visibility: "players" }, { title: "GM notes", visibility: "gm" }],
      "## At a glance\nA one-line hook players will remember.\n\n## Notable places\n- \n\n::: secret\nWhat the players don't know yet.\n:::\n"),
    t("Tavern", "place", [field("", "Owner", "page"), field("", "Prices", "choice", "players", ["Cheap", "Fair", "Dear"]), field("", "Known for", "text"), field("", "Trouble brewing", "text", "gm")],
      [{ title: "Menu and rooms", visibility: "players" }, { title: "Regulars", visibility: "players" }],
      "## First impression\nWhat hits you when the door opens.\n\n## Who's here tonight\n- \n"),
    t("Organization", "faction", [field("", "Leader", "page"), field("", "Base", "page"), field("", "Wants", "text"), field("", "Size", "choice", "players", ["Handful", "Dozens", "Hundreds", "Thousands"]), field("", "Secret goal", "text", "gm")],
      [{ title: "Members", visibility: "players" }, { title: "GM notes", visibility: "gm" }],
      "## What they stand for\n\n## How they help or hinder the party\n"),
    t("Item", "lore", [field("", "Type", "choice", "players", ["Weapon", "Armour", "Wondrous", "Potion", "Scroll", "Trinket"]), field("", "Rarity", "choice", "players", ["Common", "Uncommon", "Rare", "Very rare", "Legendary"]), field("", "Held by", "page"), field("", "Value", "text"), field("", "Curse", "text", "gm")],
      [], "## What it does\n\n## Where it came from\n"),
    t("Session", "session", [field("", "Session", "number"), field("", "Date played", "text"), field("", "Where", "page")],
      [{ title: "Prep", visibility: "gm" }], "## What happened\n- \n\n## Loose threads\n- [ ] \n", "gm"),
  ];
}

/** The template a page was made from, if its world still has it. */
export const templateOf = (s: Workspace, e: Entry) => e.templateId ? s.worlds.find(w => w.id === e.worldId)?.templates?.find(t => t.id === e.templateId) ?? null : null;
export const templateUses = (s: Workspace, templateId: string) => s.entries.filter(e => e.templateId === templateId).length;

/** A value as typed into the info box: numbers stay numbers, empty text is no value. */
export function cleanValue(f: TemplateField, raw: unknown): FieldValue | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (f.type === "number") { const n = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, "").trim()); return String(raw).trim() === "" || !Number.isFinite(n) ? undefined : n; }
  const text = String(raw).trim().slice(0, 2000);
  if (!text) return undefined;
  if (f.type === "choice" && !f.options?.includes(text)) return undefined;
  return text;
}
export function cleanValues(t: PageTemplate, values: Record<string, unknown>) {
  const out: Record<string, FieldValue> = {};
  for (const f of t.fields) { const v = cleanValue(f, values[f.id]); if (v !== undefined) out[f.id] = v; }
  return out;
}

/** A new page from a template: its kind, tabs, starting text and info box values. */
export function pageFromTemplate(t: PageTemplate, opts: { id: string; title: string; worldId: string; campaignId: string | null; parentId: string | null; values?: Record<string, unknown>; newId: () => string; now?: string; /** An organization starts with this profile (defaultOrg(world)). */ org?: Org }): Entry {
  const fields = cleanValues(t, opts.values ?? {});
  return {
    id: opts.id, worldId: opts.worldId, campaignId: opts.campaignId, parentId: opts.parentId, title: opts.title.trim().slice(0, 160), kind: t.kind,
    body: t.body, overviewVisibility: t.overviewVisibility ?? "gm", ...(t.tabs.length ? { tabs: t.tabs.map(x => ({ id: opts.newId(), title: x.title, body: "", visibility: x.visibility })) } : {}),
    templateId: t.id, ...(Object.keys(fields).length ? { fields } : {}), ...(t.kind === "faction" && opts.org ? { org: opts.org } : {}), ...(t.kind === "character" ? { character: { role: "npc", group: "", tags: [], location: "", faction: "", status: "active", statsVisibility: "gm", statsByCampaign: {} } } : {}),
    updatedAt: opts.now ?? new Date().toISOString(),
  };
}

/** Save any page as a template: its kind, tab names, text and (from its own template) fields. */
export function templateFromPage(s: Workspace, e: Entry, name: string, newId: () => string, now = new Date().toISOString()): PageTemplate {
  const from = templateOf(s, e), kind = (["note", "character", "place", "faction", "lore", "session", "quest"] as const).find(k => k === e.kind) ?? "note";
  return {
    id: newId(), name: name.trim().slice(0, 160) || e.title, kind, fields: from ? from.fields.map(f => ({ ...f })) : [],
    tabs: (e.tabs ?? []).slice(0, 20).map(t => ({ title: t.title, visibility: t.visibility })), body: e.body.slice(0, 20000),
    parentId: e.parentId, overviewVisibility: e.overviewVisibility ?? "gm", updatedAt: now,
  };
}

/**
 * Saves a template into its world and gives the pages made from it any tab they don't have yet (matched by
 * name). Nothing already written is removed; new fields show up empty in their info boxes.
 */
export function saveTemplate(s: Workspace, worldId: string, t: PageTemplate, newId: () => string, now = new Date().toISOString()): Workspace {
  const worlds = s.worlds.map(w => w.id !== worldId ? w : { ...w, templates: (w.templates ?? []).some(x => x.id === t.id) ? (w.templates ?? []).map(x => x.id === t.id ? t : x) : [...(w.templates ?? []), t] });
  const entries = s.entries.map(e => {
    if (e.templateId !== t.id || e.worldId !== worldId) return e;
    const have = new Set((e.tabs ?? []).map(x => x.title.trim().toLowerCase()));
    const missing = t.tabs.filter(x => !have.has(x.title.trim().toLowerCase()));
    if (!missing.length || (e.tabs?.length ?? 0) + missing.length > 30) return e;
    return { ...e, tabs: [...(e.tabs ?? []), ...missing.map(x => ({ id: newId(), title: x.title, body: "", visibility: x.visibility }))], updatedAt: now };
  });
  return { ...s, worlds, entries };
}

/** Deletes a template. Pages made from it keep their text and tabs; their info boxes go away. */
export function deleteTemplate(s: Workspace, worldId: string, templateId: string): Workspace {
  return { ...s, worlds: s.worlds.map(w => w.id !== worldId ? w : { ...w, templates: (w.templates ?? []).filter(t => t.id !== templateId) }), entries: s.entries.map(e => { if (e.templateId !== templateId) return e; const rest = { ...e }; delete rest.templateId; delete rest.fields; return rest; }) };
}

export type InfoRow = { id: string; label: string; value: string; pageId?: string; gm: boolean };
/** The info box rows with a value. `players` leaves out GM-only fields. Page links show the page's title. */
export function infoRows(s: Pick<Workspace, "entries">, t: PageTemplate, e: Entry, players = false): InfoRow[] {
  return t.fields.flatMap(f => {
    if (players && f.visibility !== "players") return [];
    const v = e.fields?.[f.id];
    if (v === undefined || v === "") return [];
    if (f.type === "page") { const page = s.entries.find(x => x.id === v); return page ? [{ id: f.id, label: f.label, value: page.title, pageId: page.id, gm: f.visibility === "gm" }] : []; }
    return [{ id: f.id, label: f.label, value: typeof v === "number" ? v.toLocaleString("en-US") : v, gm: f.visibility === "gm" }];
  });
}
