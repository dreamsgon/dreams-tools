import { z } from "zod";
import { parseDice } from "../rolls.ts";
import { maxTrackerPips, maxTrackerValue, maxTrackers, trackerColours, type Tracker } from "./trackers.ts";
import { MAX_SHEET_ITEMS, newItemId, type Sheet, type SheetItem } from "./sheet-link.ts";
import { defaultProfile } from "./character-profile.ts";
import { emptyInventory, itemSettingsOf, parseMoney, validRoll, MAX_ITEMS, MAX_SPELLS, MAX_ROLLS, type Item, type Spell, type ItemRoll } from "./items.ts";
import { defaultCharacter, type ArticleTab, type CharacterData, type Entry, type StatField, type Workspace } from "./world-model.ts";

/*
 * Importing a character from any game through an AI app. The GM copies a prompt (importPrompt), pastes it into ChatGPT
 * or Claude with the character's PDF, photo or text, and pastes the reply back. readImport() finds the JSON in the reply
 * and checks it against the RPG Tools sheet format (rpgtools-sheet, version 1); planImport() lines its fields up with
 * the campaign's stat form; applyImport() makes or updates the character page.
 *
 * Where each part lands: fields on the campaign's stat form (matched by name, new ones added to their section), gauges as
 * trackers, HP, AC, initiative and rolls as an imported sheet (character.sheet with source "import", so everything that
 * reads a linked Google Sheet reads it too), lists as page tabs, and anything the AI couldn't place in a GM-only tab.
 * The reader is lenient with what AI apps send (numbers as text, long strings, code fences) and never fails the whole
 * import over one bad roll: that roll is left out and named in the warnings. Everything here is pure.
 */

export const SHEET_FORMAT = "rpgtools-sheet";
export const NOT_IMPORTED_TAB = "Not imported";
const maxFields = 100, maxRolls = 150, maxLists = 12, maxListItems = 200;

const str = (max: number) => z.string().transform(s => s.trim().slice(0, max));
const optStr = (max: number) => z.union([z.string(), z.null()]).optional().transform(s => (s ?? "").trim().slice(0, max) || undefined);
const num = z.union([z.number().finite(), z.string().trim().regex(/^[+-]?\d+(?:\.\d+)?$/).transform(Number)]);
const int = num.transform(n => Math.round(n));
const list = <T extends z.ZodTypeAny>(item: T, max: number) => z.array(item).optional().transform(a => (a ?? []).slice(0, max));
const visibility = z.enum(["players", "gm"]).optional().catch(undefined);

const fieldSchema = z.object({
  label: str(160).refine(s => s.length > 0, "A field needs a label"),
  section: optStr(100),
  type: z.enum(["number", "text", "longtext", "checkbox", "choice"]).catch("text"),
  value: z.union([z.number().finite(), z.string(), z.boolean(), z.null()]).optional(),
  options: list(str(100), 40),
  roll: optStr(200),
  visibility,
});
const gaugeSchema = z.object({
  label: str(40).refine(s => s.length > 0, "A gauge needs a label"),
  value: int, max: int,
  shape: z.enum(["bar", "pips"]).catch("bar").optional(),
  colour: z.enum(trackerColours).catch("purple").optional(),
  visibility,
});
const rollSchema = z.object({
  name: str(80).refine(s => s.length > 0, "A roll needs a name"),
  group: z.enum(["skills", "saves", "attacks", "spells", "other"]).catch("other").optional(),
  formula: optStr(200), attack: optStr(200), damage: optStr(200), damageType: optStr(40), notes: optStr(300),
});
const listItemSchema = z.object({
  name: str(120).refine(s => s.length > 0, "A list item needs a name"),
  text: optStr(2000),
  quantity: int.optional(),
  uses: z.object({ value: int, max: int, per: optStr(40) }).optional().catch(undefined),
  equipped: z.boolean().optional().catch(undefined),
  // Optional (added later): on an inventory list, the weight of one and what one is worth ("15 gp").
  weight: num.optional().catch(undefined), value: optStr(40),
});
export const importFileSchema = z.object({
  format: z.literal(SHEET_FORMAT),
  version: num.refine(v => v === 1, "This app reads version 1 of the sheet format"),
  system: optStr(100),
  name: str(160).refine(s => s.length > 0, "The sheet has no name"),
  role: z.enum(["pc", "companion", "npc", "creature"]).catch("pc").optional(),
  summary: optStr(300),
  tags: list(str(60), 30),
  traits: list(str(30), 12),
  location: optStr(160),
  faction: optStr(160),
  core: z.object({
    hp: z.object({ value: int, max: int, label: optStr(40) }).optional().catch(undefined),
    ac: z.object({ value: int, label: optStr(40) }).optional().catch(undefined),
    initiative: z.object({ formula: str(200), label: optStr(40) }).optional().catch(undefined),
    speed: optStr(60),
  }).optional().catch(undefined),
  fields: list(fieldSchema, maxFields),
  gauges: list(gaugeSchema, maxTrackers),
  rolls: list(rollSchema, maxRolls),
  lists: list(z.object({ title: str(60).refine(s => s.length > 0, "A list needs a title"), visibility, items: list(listItemSchema, maxListItems) }), maxLists),
  conditions: list(str(40), 30),
  // Optional (added later): the money carried, in the game's coins ("48 gp 5 sp", "1,240 cr").
  money: optStr(60),
  notes: optStr(20000),
  unmapped: list(str(300), 50),
  source: z.object({ from: optStr(120), filledBy: optStr(60), date: optStr(40) }).optional().catch(undefined),
});
export type ImportFile = z.infer<typeof importFileSchema>;
export type ImportField = ImportFile["fields"][number];

export type ReadResult = { ok: true; file: ImportFile } | { ok: false; error: string };
/** The sheet in an AI app's reply: code fences and chatty lines around the JSON are ignored. */
export function readImport(reply: string): ReadResult {
  const text = reply.trim();
  if (!text) return { ok: false, error: "Paste the reply from your AI app first." };
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { ok: false, error: "There’s no JSON in that reply. Ask the AI to reply with the JSON only, and copy all of it." };
  let raw: unknown;
  try { raw = JSON.parse(text.slice(start, end + 1)); }
  catch { return { ok: false, error: "That reply isn’t complete JSON. Copy the whole reply, including the last }, or ask the AI to reply with the JSON only." }; }
  if (!raw || typeof raw !== "object" || (raw as { format?: unknown }).format !== SHEET_FORMAT) return { ok: false, error: `This isn’t an RPG Tools sheet: it has no "format": "${SHEET_FORMAT}". Use Copy prompt and ask again.` };
  const parsed = importFileSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0], where = issue.path.length ? ` (at ${issue.path.join(" › ")})` : "";
    return { ok: false, error: `${issue.message}${where}.` };
  }
  return { ok: true, file: parsed.data };
}

// ---- Rolls -------------------------------------------------------------------------------------

/** Dice the roller understands (lib/rolls.ts), spaces removed; null otherwise. */
export function cleanFormula(formula: string | undefined): string | null {
  const f = (formula ?? "").replace(/\s+/g, "");
  if (!f || f.length > 200 || !/d/i.test(f)) return null;
  try { parseDice(f); return f; } catch { return null; }
}
/** What a field's roll becomes on the stat form, or null for no roll. */
export function fieldRollOf(f: Pick<ImportField, "type" | "roll">): Pick<StatField, "roll" | "rollFormula"> | null {
  const r = f.roll?.trim();
  if (!r || f.type === "checkbox" || f.type === "choice") return null;
  if (r.toLowerCase() === "d20") return f.type === "number" ? { roll: "d20" } : { roll: "custom", rollFormula: "1d20+{value}" };
  if (r.toLowerCase() === "self") return f.type === "number" ? null : { roll: "formula" };
  if (!r.includes("{value}") || !cleanFormula(r.replaceAll("{value}", "1"))) return null;
  return { roll: "custom", rollFormula: r.replace(/\s+/g, "") };
}

// ---- Lining fields up with the stat form -------------------------------------------------------

export type FieldAction = "match" | "new" | "skip";
export type FieldPlan = { label: string; section: string; type: StatField["type"]; value: ImportField["value"]; matchId?: string; matchLabel?: string; action: FieldAction; roll: Pick<StatField, "roll" | "rollFormula"> | null };
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const formType: Record<ImportField["type"], StatField["type"]> = { number: "number", text: "text", longtext: "textarea", checkbox: "checkbox", choice: "select" };

/** Each field of the file, matched to a stat form field with the same name (ignoring case and punctuation) when there is one. */
export function planFields(file: ImportFile, form: StatField[]): FieldPlan[] {
  const byKey = new Map(form.filter(f => !f.archived).map(f => [key(f.label), f]));
  const seen = new Set<string>();
  return file.fields.flatMap(f => {
    const k = key(f.label);
    if (!k || seen.has(k)) return [];
    seen.add(k);
    const match = byKey.get(k);
    return [{ label: f.label, section: f.section ?? "", type: match?.type ?? formType[f.type], value: f.value ?? null, ...(match ? { matchId: match.id, matchLabel: match.label } : {}), action: match ? "match" : "new", roll: fieldRollOf(f) } satisfies FieldPlan];
  });
}

/** A value as the stat form field keeps it; undefined when it doesn't fit (a word in a number field, an option that isn't offered). */
export function fieldValue(type: StatField["type"], value: ImportField["value"], options: string[] = []): string | number | boolean | null | undefined {
  if (value === null || value === undefined) return null;
  if (type === "number") { const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim()); return Number.isFinite(n) && String(value).trim() !== "" ? n : undefined; }
  if (type === "checkbox") return typeof value === "boolean" ? value : /^(true|yes|x|1|✓)$/i.test(String(value).trim()) ? true : /^(false|no|0|)$/i.test(String(value).trim()) ? false : undefined;
  const text = String(value).slice(0, 10000);
  if (type === "select") return options.find(o => o.toLowerCase() === text.trim().toLowerCase());
  return text;
}

// ---- The prompt --------------------------------------------------------------------------------

const typeWords: Record<StatField["type"], string> = { number: "number", text: "text", textarea: "longtext", checkbox: "checkbox", select: "choice", none: "no value" };
function formLines(form: StatField[]) {
  const live = form.filter(f => !f.archived), sections = new Map<string, string[]>();
  for (const f of live) {
    const roll = f.rolls ? (f.rolls.length ? `, rolls ${f.rolls.map(r => `${r.name} ${r.formula}`).join(" / ")}` : "") : f.roll === "d20" ? ", rolls d20" : f.roll === "formula" ? ", rolls self" : f.roll === "custom" && f.rollFormula ? `, rolls ${f.rollFormula}` : "";
    const opts = f.type === "select" && f.options.length ? `: ${f.options.join(" / ")}` : "";
    const s = f.section || "Other";
    sections.set(s, [...(sections.get(s) ?? []), `${f.label} (${typeWords[f.type]}${opts}${roll})`]);
  }
  return [...sections].map(([s, l]) => `- ${s}: ${l.join(", ")}`).join("\n");
}

/** The prompt the GM pastes into ChatGPT or Claude, with the game system and the campaign's stat form filled in. */
export function importPrompt(opts: { system?: string; form?: StatField[]; role?: CharacterData["role"] }): string {
  const system = opts.system?.trim() || "work it out from the sheet";
  const form = opts.form?.filter(f => !f.archived) ?? [];
  const formText = form.length
    ? `My campaign already has these fields. Reuse these exact labels and sections whenever the character has that stat, and only add new fields for things that aren't in this list:\n${formLines(form)}`
    : "My campaign has no fields yet, so choose clear labels and sections (Abilities, Skills, Details, Resources).";
  return `You are converting a tabletop RPG character into the RPG Tools sheet format, version 1.

Game system: ${system}
Source: the character I attached or pasted below${opts.role && opts.role !== "pc" ? ` (an ${opts.role === "npc" ? "NPC" : opts.role})` : ""}.

${formText}

Reply with ONE JSON object and nothing else, in this shape:

{
  "format": "rpgtools-sheet", "version": 1,
  "system": "", "name": "", "role": "pc", "summary": "",
  "tags": [], "traits": [], "location": "", "faction": "",
  "core": {
    "hp": { "value": 0, "max": 0, "label": "Hit points" },
    "ac": { "value": 0, "label": "Armor Class" },
    "initiative": { "formula": "1d20+0" },
    "speed": ""
  },
  "fields": [ { "section": "", "label": "", "type": "number", "value": 0, "roll": "d20" } ],
  "gauges": [ { "label": "", "value": 0, "max": 0, "shape": "pips", "colour": "purple" } ],
  "rolls": [
    { "name": "", "group": "skills", "formula": "1d20+0" },
    { "name": "", "group": "attacks", "attack": "1d20+0", "damage": "1d8+0", "damageType": "", "notes": "" }
  ],
  "lists": [
    { "title": "Features", "items": [ { "name": "", "text": "", "uses": { "value": 1, "max": 1, "per": "long rest" } } ] },
    { "title": "Inventory", "items": [ { "name": "", "quantity": 1, "weight": 0, "value": "", "equipped": false, "text": "" } ] },
    { "title": "Spells", "items": [ { "name": "", "text": "" } ] }
  ],
  "money": "",
  "conditions": [], "notes": "", "unmapped": [],
  "source": { "from": "", "filledBy": "" }
}

Rules:
1. Field types: number, text, longtext, checkbox, choice (a choice needs "options").
2. A field's "roll": "d20" means clicking it rolls 1d20 + the number (modifiers and bonuses). "self" means the value is itself a formula, like 1d8. Any other text is a formula that can use {value}, like "{value}d6" or "1d100<={value}". Leave "roll" out when the field doesn't roll.
3. Dice: NdS with + and -, kh/kl to keep highest or lowest (4d6kh3, 2d20kh1), ! for exploding (1d6!), >=N to count successes (5d10>=8), <=N to count dice at or under, dF for Fate dice. Add the numbers in yourself: write 1d20+7, never 1d20+DEX+PB.
4. "core" holds only what a map token needs: current and maximum HP, AC (or the game's defense), initiative and speed. Rename the labels to the game's words (Stress, Wounds, Guard). Leave out what the game doesn't have.
5. "gauges" are pools that go up and down: spell slots per level, hit dice, ki, stress, luck, ammo. "pips" for 20 or fewer, "bar" for more. Colours: red, blue, amber, green, purple. At most 8.
6. "rolls": group is skills, saves, attacks, spells or other. An attack has "attack" and "damage"; a check has "formula"; a healing spell has "damage" and notes saying healing.
7. "lists" hold longer things (Features, Spells, Inventory, Contacts). Summarise each item in one or two sentences in your own words; never copy rulebook text. Inline rolls look like [[2d6+3|Fire damage]]. Carried things go in a list titled "Inventory" (with quantity, and weight and value when the sheet has them); spells, powers or prayers in a list titled "Spells". "money" is the money carried, written as on the sheet ("48 gp 5 sp").
8. Leave "visibility" out unless I say something is secret.
9. Put anything you couldn't place in "unmapped", so nothing is lost. Don't invent numbers: if a value is unreadable, leave it out and say so in "unmapped".`;
}

// ---- Making or updating the page ---------------------------------------------------------------

export type ImportChoice = Record<string, FieldAction>;
export type ImportTarget = { kind: "new"; worldId: string; campaignId: string; shared?: boolean; parentId?: string | null } | { kind: "update"; entryId: string; campaignId: string };
export type ImportResult = { workspace: Workspace; entryId: string; warnings: string[]; added: number; matched: number };

const listTabBody = (l: ImportFile["lists"][number]) => l.items.map(it => {
  const bits = [`**${it.name.replace(/\*/g, "")}**`];
  if (it.quantity !== undefined) bits.push(`× ${it.quantity}`);
  if (it.uses) bits.push(`(${it.uses.value}/${it.uses.max}${it.uses.per ? ` per ${it.uses.per}` : ""})`);
  if (it.equipped) bits.push("· equipped");
  return `- ${bits.join(" ")}${it.text ? `: ${it.text.replace(/\n+/g, " ")}` : ""}`;
}).join("\n");

const INVENTORY_LIST = /^(inventory|equipment|gear|items|possessions|belongings|loadout|carried|cargo)$/i;
const SPELL_LIST = /^(spells?|spellbook|spell list|powers?|psionics?|prayers?|miracles?|cantrips|rituals|magic|techniques)$/i;
type ListItem = ImportFile["lists"][number]["items"][number];
/** Inventory lines from a list: a line with the same name is updated (its GM bits kept), new ones are added. */
function mergeInventory(inv: ReturnType<typeof emptyInventory>, list: ListItem[], coins: Parameters<typeof parseMoney>[1], newId: () => string, warnings: string[]) {
  const out: Item[] = [...inv.items];
  for (const it of list) {
    const price = it.value ? parseMoney(it.value, coins) : null;
    const max = it.uses ? Math.max(1, Math.min(1000, it.uses.max)) : 0;
    const fields: Partial<Item> = {
      qty: Math.max(0, Math.min(1_000_000, it.quantity ?? 1)),
      ...(it.text ? { note: it.text.slice(0, 2000) } : {}),
      ...(it.weight !== undefined && it.weight >= 0 ? { weight: Math.min(100_000, it.weight) } : {}),
      ...(price !== null ? { price } : {}),
      ...(it.uses ? { uses: { max, value: Math.max(0, Math.min(max, it.uses.value)) } } : {}),
      ...(it.equipped ? { equipped: true } : {}),
    };
    const at = out.findIndex(x => key(x.name) === key(it.name));
    if (at >= 0) out[at] = { ...out[at], ...fields };
    else if (out.length < MAX_ITEMS) out.push({ id: newId(), name: it.name.slice(0, 80), ...fields } as Item);
    else { warnings.push(`A character carries up to ${MAX_ITEMS} different items, so the rest were left out.`); break; }
  }
  return { ...inv, items: out };
}
/** Spells from a list, with the file's spell rolls of the same name. */
function mergeSpells(spells: Spell[], list: ListItem[], rolls: ImportFile["rolls"], newId: () => string, warnings: string[]) {
  const out = [...spells];
  for (const it of list) {
    const r = rolls.find(x => key(x.name) === key(it.name)), more: ItemRoll[] = [];
    const push = (name: string, f?: string) => { const c = f ? cleanFormula(f) : null; if (c && validRoll(c) && more.length < MAX_ROLLS) more.push({ name, formula: c }); };
    if (r) { push("Attack", r.attack); push(r.damageType ? r.damageType.slice(0, 40) : "Damage", r.damage); push("Roll", r.formula); }
    const fields: Partial<Spell> = { ...(it.text ? { text: it.text.slice(0, 4000) } : {}), ...(more.length ? { rolls: more } : {}) };
    const at = out.findIndex(x => key(x.name) === key(it.name));
    if (at >= 0) out[at] = { ...out[at], ...fields };
    else if (out.length < MAX_SPELLS) out.push({ id: newId(), name: it.name.slice(0, 80), ...fields });
    else { warnings.push(`A character can have up to ${MAX_SPELLS} spells, so the rest were left out.`); break; }
  }
  return out;
}

/** The trackers from the file's gauges. Pips stop at 20 (a larger one becomes a bar) and every value fits its maximum. */
export function gaugeTrackers(file: ImportFile, newId: () => string, defaultGm: boolean): Tracker[] {
  return file.gauges.slice(0, maxTrackers).map(g => {
    let shape = g.shape ?? "bar";
    const big = Math.max(1, Math.min(maxTrackerValue, g.max));
    if (shape === "pips" && big > maxTrackerPips) shape = "bar";
    const gm = g.visibility ? g.visibility === "gm" : defaultGm;
    return { id: newId(), label: g.label, shape, colour: g.colour ?? "purple", max: big, value: Math.max(0, Math.min(big, g.value)), ...(gm ? { gm: true } : {}) };
  });
}

/** The imported sheet: HP, AC and initiative slots, then every roll ("Longbow attack" and "Longbow damage" pair up on the page). */
export function importedSheet(file: ImportFile, now: string, warnings: string[], newId: () => string = newItemId): Sheet {
  const items: SheetItem[] = [], c = file.core;
  const push = (i: Omit<SheetItem, "id">) => { if (items.length < MAX_SHEET_ITEMS) items.push({ id: newId(), ...i }); };
  if (c?.hp) {
    const max = Math.max(1, c.hp.max), cur = Math.max(0, Math.min(max, c.hp.value));
    push({ name: c.hp.label || "Hit points", kind: "hp", value: String(cur) });
    push({ name: `Max ${c.hp.label || "hit points"}`.slice(0, 80), kind: "maxHp", value: String(max) });
  }
  if (c?.ac) push({ name: c.ac.label || "Armor Class", kind: "ac", value: String(c.ac.value) });
  if (c?.initiative) {
    const f = cleanFormula(c.initiative.formula);
    if (f) push({ name: c.initiative.label || "Initiative", kind: "init", formula: f, value: f.replace(/^1d20/i, "") || "0" });
    else warnings.push(`Initiative “${c.initiative.formula}” isn’t dice the roller understands, so it was left out.`);
  }
  if (c?.speed) push({ name: "Speed", kind: "stat", value: c.speed });
  for (const r of file.rolls) {
    const note = [r.damageType, r.notes].filter(Boolean).join(", ");
    const add = (name: string, raw: string | undefined) => {
      if (!raw) return;
      const f = cleanFormula(raw);
      if (f) push({ name: name.slice(0, 80), kind: "roll", formula: f, ...(note ? { value: note.slice(0, 200) } : {}) });
      else warnings.push(`${name}: “${raw}” isn’t dice the roller understands, so it was left out.`);
    };
    if (r.attack || (r.damage && r.group === "attacks")) { add(`${r.name} attack`, r.attack); add(`${r.name} damage`, r.damage); }
    else { add(r.name, r.formula); if (r.damage) add(r.formula ? `${r.name} damage` : r.name, r.damage); }
  }
  return { source: "import", title: `${file.system ? `${file.system} sheet` : "Imported sheet"}`.slice(0, 200), linkedBy: (file.source?.filledBy ? `Import (${file.source.filledBy})` : "Import").slice(0, 100), readAt: now, mode: "cells", items };
}

const uniq = (l: string[], max: number, len: number) => [...new Map(l.map(s => s.trim().slice(0, len)).filter(Boolean).map(s => [s.toLowerCase(), s])).values()].slice(0, max);

/**
 * Makes the character page (target "new") or updates one (target "update"). An update changes only what the file
 * has: stat values it names, trackers by name, the sheet, and tabs by title. Fields set to "skip" are left out.
 */
export function applyImport(s: Workspace, file: ImportFile, target: ImportTarget, choice: ImportChoice = {}, opts: { now?: string; newId?: () => string } = {}): ImportResult {
  const now = opts.now ?? new Date().toISOString(), newId = opts.newId ?? (() => crypto.randomUUID()), warnings: string[] = [];
  const campaign = s.campaigns.find(c => c.id === target.campaignId);
  if (!campaign) throw new Error("Choose a campaign to import into.");
  const existing = target.kind === "update" ? s.entries.find(e => e.id === target.entryId && e.kind === "character") : undefined;
  if (target.kind === "update" && !existing) throw new Error("That character is gone.");
  const role = existing?.character?.role ?? file.role ?? "pc", playerDefault = role === "pc";

  // Fields: matched ones keep their form field; new ones join the campaign's form in their section.
  let form = [...(campaign.statFields ?? [])];
  const values: Record<string, string | number | boolean | null> = { ...(existing?.character?.statsByCampaign[campaign.id] ?? {}) };
  let added = 0, matched = 0;
  for (const p of planFields(file, form)) {
    const action = choice[p.label] ?? p.action;
    if (action === "skip") continue;
    let field = action === "match" && p.matchId ? form.find(f => f.id === p.matchId) : undefined;
    if (!field) {
      if (form.length >= maxFields) { warnings.push(`${p.label}: the stat form is full (${maxFields} fields), so it was left out.`); continue; }
      const src = file.fields.find(f => key(f.label) === key(p.label));
      const type = formType[src?.type ?? "text"], options = type === "select" ? uniq(src?.options ?? [], 40, 100) : [];
      field = { id: newId(), label: p.label, section: p.section, type: type === "select" && !options.length ? "text" : type, options, visibility: src?.visibility ?? (playerDefault ? "players" : "gm"), archived: false, ...(p.roll ?? {}) };
      form = [...form, field];
      added++;
    } else matched++;
    const v = fieldValue(field.type, p.value, field.options);
    if (v === undefined) { warnings.push(`${p.label}: “${String(p.value)}” doesn’t fit a ${typeWords[field.type]} field, so it was left out.`); continue; }
    values[field.id] = v;
  }

  // Trackers: same name replaces the value and shape; the rest are kept.
  const incoming = gaugeTrackers(file, newId, !playerDefault), old = existing?.character?.trackers ?? [];
  const trackers = [...old.map(t => { const n = incoming.find(x => key(x.label) === key(t.label)); if (!n) return t; const { gm: _gm, ...rest } = n; void _gm; return { ...rest, id: t.id, ...(t.gm ? { gm: true } : {}) }; }),
    ...incoming.filter(n => !old.some(t => key(t.label) === key(n.label)))];
  if (trackers.length > maxTrackers) warnings.push(`A character holds ${maxTrackers} trackers, so ${trackers.slice(maxTrackers).map(t => t.label).join(", ")} ${trackers.length - maxTrackers === 1 ? "was" : "were"} left out.`);

  const sheet = importedSheet(file, now, warnings);
  const hasSheet = sheet.items.length > 0;
  const keepSheet = existing?.character?.sheet && existing.character.sheet.source !== "import";
  if (keepSheet && hasSheet) warnings.push("This character has a linked Google Sheet, so its HP, AC and rolls were kept and the imported ones left out.");

  // Tabs: one per list, the not-imported notes, all by title so a second import replaces them.
  const tabs: ArticleTab[] = [...(existing?.tabs ?? [])];
  const setTab = (title: string, body: string, vis: "gm" | "players") => {
    const i = tabs.findIndex(t => t.title.toLowerCase() === title.toLowerCase());
    if (i >= 0) tabs[i] = { ...tabs[i], body };
    else if (tabs.length < 30) tabs.push({ id: newId(), title, body, visibility: vis });
    else warnings.push(`The page has 30 tabs already, so “${title}” was left out.`);
  };
  // An Inventory list fills the Inventory tab and a Spells list the Spells tab (matched by name, so a second import updates them); other lists are tabs.
  const items = itemSettingsOf(campaign), isInventory = (t: string) => INVENTORY_LIST.test(t.trim()), isSpells = (t: string) => items.spells.on && (SPELL_LIST.test(t.trim()) || key(t) === key(items.spells.tab));
  let inventory = existing?.character?.inventory, spells = existing?.character?.spells, spellsVisibility = existing?.character?.spellsVisibility;
  const shownAs = (l: ImportFile["lists"][number]) => l.visibility ?? (playerDefault ? "players" as const : "gm" as const);
  for (const l of file.lists) {
    if (!l.items.length) continue;
    if (isInventory(l.title)) { const was = inventory ?? emptyInventory(); inventory = { ...mergeInventory(was, l.items, items.coins, newId, warnings), visibility: was.visibility ?? shownAs(l) }; }
    else if (isSpells(l.title)) { spells = mergeSpells(spells ?? [], l.items, file.rolls.filter(r => r.group === "spells"), newId, warnings); spellsVisibility ??= shownAs(l); }
    else setTab(l.title, listTabBody(l), l.visibility ?? (playerDefault ? "players" : "gm"));
  }
  if (file.money) { const m = parseMoney(file.money, items.coins); if (m === null) warnings.push(`Money: “${file.money}” isn’t in this campaign’s coins (${items.coins.map(c => c.abbr).join(", ")}), so it was left out.`); else inventory = { ...(inventory ?? emptyInventory()), coins: m }; }
  const notImported = [...file.unmapped, ...(file.conditions.length ? [`Conditions: ${file.conditions.join(", ")}`] : [])];
  if (notImported.length) setTab(NOT_IMPORTED_TAB, `Things the AI couldn't place when this sheet was imported${file.source?.from ? ` from ${file.source.from}` : ""}:\n\n${notImported.map(u => `- ${u}`).join("\n")}`, "gm");

  const base = existing?.character ?? { ...defaultCharacter(), role, statsVisibility: playerDefault ? "players" as const : "gm" as const };
  const character: CharacterData = {
    ...base,
    ...(target.kind === "new" ? { role } : {}),
    tags: uniq([...base.tags, ...file.tags], 30, 60),
    ...(file.location ? { location: file.location } : {}),
    ...(file.faction ? { faction: file.faction } : {}),
    statsByCampaign: { ...base.statsByCampaign, [campaign.id]: values },
    ...(trackers.length ? { trackers: trackers.slice(0, maxTrackers) } : {}),
    ...(hasSheet && !keepSheet ? { sheet } : {}),
    ...(inventory ? { inventory } : {}),
    ...(spells?.length ? { spells, ...(spellsVisibility ? { spellsVisibility } : {}) } : {}),
  };
  // Traits: added to the Profile tab's chips, after any it has.
  let profile = existing?.profile;
  if (file.traits.length) {
    const start = profile ?? defaultProfile(s.worlds.find(w => w.id === (existing?.worldId ?? (target.kind === "new" ? target.worldId : ""))));
    const have = new Set(start.traits.map(t => key(t.label)));
    const more = file.traits.filter(t => t && !have.has(key(t))).slice(0, Math.max(0, 12 - start.traits.length)).map(label => ({ id: newId(), label }));
    if (more.length) profile = { ...start, traits: [...start.traits, ...more] };
  }
  const intro = [file.summary, file.notes].filter(Boolean).join("\n\n");
  let entry: Entry;
  if (existing) entry = { ...existing, tabs, character, ...(profile ? { profile } : {}), ...(intro && !existing.body.trim() ? { body: intro } : {}), editedBy: undefined, updatedAt: now };
  else {
    if (target.kind !== "new") throw new Error("That character is gone.");
    entry = { id: newId(), worldId: target.worldId, campaignId: target.shared ? null : target.campaignId, parentId: target.parentId ?? null, title: file.name, kind: "character", body: intro, overviewVisibility: "gm", tabs, character, ...(profile ? { profile } : {}), updatedAt: now };
  }
  const workspace: Workspace = {
    ...s,
    campaigns: s.campaigns.map(c => c.id === campaign.id ? { ...c, statFields: form } : c),
    entries: existing ? s.entries.map(e => e.id === entry.id ? entry : e) : [...s.entries, entry],
  };
  return { workspace, entryId: entry.id, warnings, added, matched };
}
