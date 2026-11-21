/*
 * Page templates: a world's ready-made pages (Settlement, Tavern, Organization…) with info box fields, tabs and
 * starting text. A page made from one keeps its templateId, so later fields and tabs reach it too.
 * A template can belong to one campaign (campaignId) or to the whole world. A character template can also leave out
 * ready-made tabs (hiddenTabs) and carry its own Profile layout (layout), so a campaign can have several kinds of
 * character (a player character, a shopkeeper, a monster) instead of one shared layout.
 */
import type { CharacterData, Entry, HideableTab, PageTemplate, TemplateField, Workspace, World } from "./world-model.ts";
import type { Org } from "./org-profile.ts";
import { layOutProfile, profileFromLayout, profileLayoutOf, type Profile } from "./character-profile.ts";

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

/**
 * Three kinds of character to start from. A player character keeps every tab; an NPC is a face with a story (no rules
 * tabs); a creature is a statblock. Each has its own fields at the top of the Profile.
 */
export function characterStarters(newId: () => string, now = new Date().toISOString()): PageTemplate[] {
  const layout = (facts: string[], gmFacts: string[] = []) => ({
    blocks: [{ id: newId(), kind: "beliefs" as const, title: "Beliefs", column: "left" as const }, { id: newId(), kind: "organizations" as const, title: "Organizations", column: "right" as const }, { id: newId(), kind: "ties" as const, title: "People", column: "right" as const }],
    bar: { title: "Right now", fields: [{ id: newId(), label: "Wants" }, { id: newId(), label: "How" }, { id: newId(), label: "Trouble", gm: true }] },
    facts: [...facts.map(label => ({ id: newId(), label })), ...gmFacts.map(label => ({ id: newId(), label, gm: true }))],
  });
  const t = (name: string, facts: string[], hiddenTabs: HideableTab[], tabs: { title: string; visibility: "gm" | "players" }[], body: string, gmFacts: string[] = []): PageTemplate =>
    ({ id: newId(), name, kind: "character", fields: [], tabs, body, overviewVisibility: "players", updatedAt: now, ...(hiddenTabs.length ? { hiddenTabs } : {}), layout: layout(facts, gmFacts) });
  return [
    t("Player character", ["Player", "Species", "Class", "Level"], ["statblock"], [], "## Background\n\n## Goals\n"),
    t("NPC", ["Species", "Occupation", "Where to find them"], ["statblock", "stats", "features", "inventory", "spells"], [{ title: "GM notes", visibility: "gm" }], "## First impression\nHow they look and sound.\n\n## What they want from the party\n", ["Secret"]),
    t("Creature", ["Type", "Size", "Challenge"], ["stats", "features", "inventory", "spells"], [], "## Tactics\n\n## Lair and loot\n"),
  ];
}

/** A copy of a stat arrangement (order and switched-off stats), with empty lists left out. */
const copyStats = (a: { order?: string[]; off?: string[] }) => ({ ...(a.order?.length ? { order: [...a.order] } : {}), ...(a.off?.length ? { off: [...a.off] } : {}) });

/** Ready-made character tabs that can be hidden, in tab order, with their usual names (Spells takes the campaign's own name in the UI). */
export const HIDEABLE_TABS: [HideableTab, string][] = [["statblock", "Statblock"], ["stats", "Stats & Skills"], ["features", "Features"], ["inventory", "Inventory"], ["spells", "Spells"]];
const hideOrder = (ids: Iterable<string>) => HIDEABLE_TABS.map(([id]) => id).filter(id => new Set(ids).has(id));

/** The templates a campaign can use: the world's own, then this campaign's. Without a campaign, only the world's. */
export const templatesFor = (world: Pick<World, "templates"> | undefined | null, campaignId: string | null | undefined): PageTemplate[] =>
  (world?.templates ?? []).filter(t => !t.campaignId || t.campaignId === campaignId);

/**
 * A page's change to hide these ready-made tabs (and show the rest). A hidden tab is made GM only as well, so it stays
 * hidden from players when it is shown again later. What is in it is kept.
 */
export function hideTabsPatch(e: Pick<Entry, "kind" | "character" | "hiddenTabs">, hide: Iterable<string>): Pick<Entry, "hiddenTabs" | "character"> {
  const ids = hideOrder(hide) as HideableTab[];
  if (e.kind !== "character") return { hiddenTabs: undefined };
  const c = e.character;
  const character: CharacterData | undefined = c && ids.length ? {
    ...c,
    ...(ids.includes("stats") ? { statsVisibility: "gm" as const } : {}),
    ...(ids.includes("features") && c.featuresVisibility ? { featuresVisibility: "gm" as const } : {}),
    ...(ids.includes("statblock") && c.statblockVisibility ? { statblockVisibility: "gm" as const } : {}),
    ...(ids.includes("spells") && c.spellsVisibility ? { spellsVisibility: "gm" as const } : {}),
    ...(ids.includes("inventory") && c.inventory ? { inventory: { ...c.inventory, visibility: "gm" as const } } : {}),
  } : c;
  return { hiddenTabs: ids.length ? ids : undefined, character };
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
export function pageFromTemplate(t: PageTemplate, opts: { id: string; title: string; worldId: string; campaignId: string | null; parentId: string | null; values?: Record<string, unknown>; newId: () => string; now?: string; /** An organization starts with this profile (defaultOrg(world)). */ org?: Org; /** A character starts with this profile (defaultProfile(world)). */ profile?: Profile }): Entry {
  const fields = cleanValues(t, opts.values ?? {});
  return {
    id: opts.id, worldId: opts.worldId, campaignId: opts.campaignId, parentId: opts.parentId, title: opts.title.trim().slice(0, 160), kind: t.kind,
    body: t.body, overviewVisibility: t.overviewVisibility ?? "gm", ...(t.tabs.length ? { tabs: t.tabs.map(x => ({ id: opts.newId(), title: x.title, body: "", visibility: x.visibility })) } : {}),
    templateId: t.id, ...(Object.keys(fields).length ? { fields } : {}), ...(t.kind === "faction" && opts.org ? { org: opts.org } : {}), ...(t.kind === "character" && (t.layout || opts.profile) ? { profile: t.layout ? profileFromLayout(t.layout) : opts.profile } : {}), ...(t.kind === "character" && t.hiddenTabs?.length ? { hiddenTabs: hideOrder(t.hiddenTabs) as HideableTab[] } : {}), ...(t.kind === "character" ? { character: { role: "npc", group: "", tags: [], location: "", faction: "", status: "active", statsVisibility: "gm", statsByCampaign: {}, ...(t.stats ? { statLayout: copyStats(t.stats) } : {}) } } : {}),
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
    ...(kind === "character" && e.hiddenTabs?.length ? { hiddenTabs: [...e.hiddenTabs] } : {}),
    ...(kind === "character" && e.profile ? { layout: profileLayoutOf(e.profile) } : {}),
    ...(kind === "character" && e.character?.statLayout ? { stats: copyStats(e.character.statLayout) } : {}),
  };
}

/**
 * Uses a template on a page that already exists: it remembers the template (so its info box shows), gets the tabs it
 * doesn't have yet, hides the tabs the template leaves out, and a character's Profile is laid out like the template's.
 * Nothing written is removed: values, text, traits and people stay.
 */
export function applyTemplate(s: Workspace, entryId: string, templateId: string, newId: () => string, now = new Date().toISOString()): Workspace {
  const e = s.entries.find(x => x.id === entryId), t = s.worlds.find(w => w.id === e?.worldId)?.templates?.find(x => x.id === templateId);
  if (!e || !t) throw new Error("That template is no longer in this world.");
  if (t.kind !== e.kind) throw new Error(`${t.name} is for ${KIND_NAMES[t.kind].toLowerCase()} pages.`);
  if (t.campaignId && e.campaignId && t.campaignId !== e.campaignId) throw new Error(`${t.name} belongs to another campaign.`);
  const have = new Set((e.tabs ?? []).map(x => x.title.trim().toLowerCase()));
  const missing = t.tabs.filter(x => !have.has(x.title.trim().toLowerCase())).slice(0, Math.max(0, 30 - (e.tabs?.length ?? 0)));
  const next: Entry = {
    ...e, templateId: t.id,
    ...(missing.length ? { tabs: [...(e.tabs ?? []), ...missing.map(x => ({ id: newId(), title: x.title, body: "", visibility: x.visibility }))] } : {}),
    ...(e.kind === "character" ? hideTabsPatch(e, t.hiddenTabs ?? []) : {}),
    // The template's stats: which are on and their order. Values stay; a template without stats leaves the character's own.
    ...(e.kind === "character" && t.stats && e.character ? { character: { ...(hideTabsPatch(e, t.hiddenTabs ?? []).character ?? e.character), statLayout: copyStats(t.stats) } } : {}),
    ...(e.kind === "character" && t.layout ? { profile: e.profile ? layOutProfile(e.profile, t.layout) : profileFromLayout(t.layout) } : {}),
    updatedAt: now,
  };
  if (!next.hiddenTabs) delete next.hiddenTabs;
  return { ...s, entries: s.entries.map(x => x.id === entryId ? next : x) };
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
