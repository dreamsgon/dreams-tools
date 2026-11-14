/*
 * A character page can link one Google Sheet and keep a few of its cells: stats, rolls (with their formulas),
 * hit points, armour and initiative. This file is the logic without the screen: the saved shape, A1 cell
 * references, CSV, the "RPG Tools" template tab, guessing a kind and a formula for a cell, copying a read grid
 * onto the saved items, and the copy players get. Nothing here touches the network or the page.
 *
 * What stays with the GM: spreadsheetId, publishedUrl, linkedBy and linkedById (only the member who linked a sheet is also given its open link). Players only ever get playerSheet().
 */
import { z } from "zod";

export const sheetKinds = ["stat", "roll", "hp", "maxHp", "ac", "init"] as const;
export type SheetKind = (typeof sheetKinds)[number];
export const specialKinds = ["hp", "maxHp", "ac", "init"] as const satisfies readonly SheetKind[];
export const kindNames: Record<SheetKind, string> = { stat: "Stat", roll: "Roll", hp: "HP", maxHp: "Max HP", ac: "AC", init: "Initiative" };
export const MAX_SHEET_ITEMS = 200;
export const TEMPLATE_TAB = "RPG Tools";
/** Rows read from a tab, by every route (published, signed in, template or cells), so they all see the same cells. */
export const GRID_ROWS = 201;

// ---- A1 cell references ------------------------------------------------------------------------

export type Cell = { tab?: string; col: number; row: number };
/** 1 for A, 26 for Z, 27 for AA. */
export const colNumber = (letters: string) => [...letters.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
export function colLetters(n: number) { let out = ""; for (; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + (n - 1) % 26) + out; return out; }

/** "B4", "Sheet1!B4" or "'RPG Tools'!B4"; null for anything else (ranges included). */
export function parseCell(ref: string): Cell | null {
  const m = /^(?:(?:'((?:[^']|'')+)'|([^'!]+))!)?\$?([A-Za-z]{1,3})\$?([1-9][0-9]{0,6})$/.exec(ref.trim());
  if (!m) return null;
  const tab = (m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2])?.trim();
  if (tab !== undefined && (!tab || tab.length > 100)) return null;
  const col = colNumber(m[3]);
  if (col > 18278) return null;
  return { ...(tab ? { tab } : {}), col, row: Number(m[4]) };
}
export function cellRef(col: number, row: number, tab?: string) {
  const bare = `${colLetters(col)}${row}`;
  if (!tab) return bare;
  return /^[A-Za-z0-9_]+$/.test(tab) ? `${tab}!${bare}` : `'${tab.replace(/'/g, "''")}'!${bare}`;
}

// ---- Grids (what was read from a sheet) --------------------------------------------------------

export type SheetTab = { name: string; rows: string[][]; gid?: string };
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
export const findTab = (tabs: SheetTab[], name?: string) => name ? tabs.find(t => same(t.name, name)) : tabs[0];

/** The text of one cell, "" when it is empty, or undefined when its tab isn't there. */
export function cellText(tabs: SheetTab[], ref: string, defaultTab?: string): string | undefined {
  const c = parseCell(ref);
  if (!c) return undefined;
  const tab = findTab(tabs, c.tab ?? defaultTab);
  if (!tab) return undefined;
  return (tab.rows[c.row - 1]?.[c.col - 1] ?? "").trim();
}

/** Rows of text from the Sheets API's `values` (numbers and booleans become text; a missing cell is ""). */
export const rowsFromValues = (values: unknown): string[][] =>
  Array.isArray(values) ? values.map(r => Array.isArray(r) ? r.map(v => v === null || v === undefined ? "" : String(v)) : []) : [];

/** RFC 4180 CSV into rows. Handles quoted fields, "" quotes, line breaks inside quotes, CRLF and a leading BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false, started = false;
  const t = text.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += ch;
    } else if (ch === '"' && !field) { quoted = true; started = true; }
    else if (ch === ",") { row.push(field); field = ""; started = true; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = ""; started = false;
    } else { field += ch; started = true; }
  }
  if (started || field || row.length) { row.push(field); rows.push(row); }
  while (rows.length && rows[rows.length - 1].every(c => !c.trim())) rows.pop();
  return rows;
}
export const toCsv = (rows: string[][]) => rows.map(r => r.map(c => /[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(",")).join("\r\n") + "\r\n";

/** Keeps a grid to what the picker can show. */
export const clipRows = (rows: string[][], maxRows = GRID_ROWS, maxCols = 40) => rows.slice(0, maxRows).map(r => r.slice(0, maxCols));

// ---- Published links ---------------------------------------------------------------------------

export type PublishedLink = { ok: true; id: string; gid?: string; url: string } | { ok: false; error: string };
/**
 * A Google Sheets "Publish to the web" link, or why it isn't one. `url` is the cleaned link we keep and open
 * (the page for that tab); the server derives the CSV address from the id and gid.
 */
export function publishedLink(link: string): PublishedLink {
  let u: URL;
  try { u = new URL(link.trim()); } catch { return { ok: false, error: "Paste the whole link, starting with https://." }; }
  if (u.protocol !== "https:" || u.hostname.toLowerCase() !== "docs.google.com") return { ok: false, error: "Paste a link from Google Sheets (docs.google.com)." };
  const pub = /^\/spreadsheets\/(?:u\/\d+\/)?d\/e\/([\w-]{10,200})\/pub[a-z]*\/?$/.exec(u.pathname);
  if (!pub) {
    if (/^\/spreadsheets\/(?:u\/\d+\/)?d\/[\w-]{10,200}/.test(u.pathname)) return { ok: false, error: "That is the editing link. In Google Sheets choose File, Share, Publish to the web, pick Comma-separated values (.csv), and paste that link." };
    return { ok: false, error: "That doesn't look like a published sheet. In Google Sheets choose File, Share, Publish to the web." };
  }
  const gid = (u.searchParams.get("gid") ?? /gid=(\d+)/.exec(u.hash)?.[1] ?? "").trim();
  const clean = /^\d{1,12}$/.test(gid) ? gid : undefined;
  return { ok: true, id: pub[1], ...(clean ? { gid: clean } : {}), url: `https://docs.google.com/spreadsheets/d/e/${pub[1]}/pubhtml${clean ? `?gid=${clean}&single=true` : ""}` };
}
export const isPublishedUrl = (url: string) => publishedLink(url).ok;

// ---- The saved shape ---------------------------------------------------------------------------

const itemId = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export const sheetItemSchema = z.object({
  id: itemId,
  name: z.string().trim().min(1).max(80),
  /** A1 reference, with the tab when it isn't the sheet's main one: B4 or 'RPG Tools'!B4. */
  cell: z.string().max(130).refine(c => parseCell(c) !== null, "Use a cell such as B4 or Sheet1!B4"),
  kind: z.enum(sheetKinds),
  /** What the GM calls a special slot, such as Stress for hit points or Armour for AC. */
  label: z.string().trim().min(1).max(40).optional(),
  /** The cell's text the last time the sheet was read. */
  value: z.string().max(200).optional(),
  formula: z.string().trim().max(200).optional(),
});
export type SheetItem = z.infer<typeof sheetItemSchema>;

export const sheetSchema = z.object({
  source: z.enum(["google", "published"]),
  spreadsheetId: z.string().regex(/^[\w-]{10,120}$/).optional(),
  publishedUrl: z.string().max(600).refine(isPublishedUrl, "Use a Publish to the web link").optional(),
  title: z.string().trim().min(1).max(200),
  /** The tab cells are read from when a cell names none. */
  tab: z.string().trim().min(1).max(100).optional(),
  linkedBy: z.string().trim().min(1).max(100).optional(),
  /** Set when a signed-in member linked it from the player pages: a keyed hash of who they are (player-sheet.ts), never shown to anyone. */
  linkedById: z.string().regex(/^[a-f0-9]{32}$/).optional(),
  readAt: z.string().max(40).refine(v => !Number.isNaN(Date.parse(v)), "Use an ISO date").optional(),
  mode: z.enum(["template", "cells"]),
  items: z.array(sheetItemSchema).max(MAX_SHEET_ITEMS),
  /** Reserved: nothing is written back to the sheet yet. */
  writeBack: z.literal(false).optional(),
}).superRefine((s, ctx) => {
  if (s.source === "google" && !s.spreadsheetId) ctx.addIssue({ code: "custom", message: "A Google sheet needs its spreadsheetId" });
  if (s.source === "published" && !s.publishedUrl) ctx.addIssue({ code: "custom", message: "A published sheet needs its link" });
  if (new Set(s.items.map(i => i.id)).size !== s.items.length) ctx.addIssue({ code: "custom", message: "Sheet items need unique ids" });
}).transform(s => {
  // Keep the cleaned link, never the pasted string.
  const clean = s.source === "published" && s.publishedUrl ? publishedLink(s.publishedUrl) : null;
  return clean?.ok ? { ...s, publishedUrl: clean.url } : s;
});
export type Sheet = z.infer<typeof sheetSchema>;

export const newItemId = () => `i${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-3)}`;
const cut = (s: string, n: number) => s.length > n ? s.slice(0, n) : s;

// ---- Kinds and formulas ------------------------------------------------------------------------

const slotNames: Record<string, SheetKind> = {
  hp: "hp", hitpoints: "hp", hitpoint: "hp", currenthp: "hp", currenthitpoints: "hp", curhp: "hp",
  maxhp: "maxHp", maxhitpoints: "maxHp", maxhitpoint: "maxHp", maximumhp: "maxHp", maximumhitpoints: "maxHp", hpmax: "maxHp", hpmaximum: "maxHp", hitpointmaximum: "maxHp", hitpointsmax: "maxHp", hitpointsmaximum: "maxHp",
  ac: "ac", armorclass: "ac", armourclass: "ac", armor: "ac", armour: "ac",
  init: "init", initiative: "init", initiativebonus: "init", initiativemod: "init", initiativemodifier: "init",
};
/** The special kind a row name stands for (HP, Hit points, Max HP, AC, Armor class, Initiative…), or null. */
export const kindForName = (name: string): SheetKind | null => slotNames[name.toLowerCase().replace(/[^a-z0-9]/g, "")] ?? null;

// Every piece starts with its own letter or sign, so a string can be split only one way and matching stays linear.
const DICE = /^\d{0,3}d(?:\d{1,4}|f)(?:(?:[khl]|!|[<>]=?|=)\d{0,3})*(?:\s*[+-]\s*(?:\d+|\d{0,3}d\d{1,4}))*$/i;
/** Dice notation, such as 1d20+5, 4d6kh3, 5d10>=8 or 4dF. */
export const isDice = (text: string) => text.length <= 200 && DICE.test(text.trim());
const BONUS = /^[+-]\s*\d{1,3}$/;
const D20_WORDS = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma", "armorclass", "proficiencybonus", "savingthrows", "initiative", "perception", "stealth", "athletics", "acrobatics"];
/** True when the sheet reads like a d20 game: at least four of the usual ability and skill words appear as cells. */
export function looksD20(tabs: SheetTab[]) {
  const seen = new Set<string>();
  for (const t of tabs) for (const r of t.rows.slice(0, 200)) for (const c of r) { const k = c.toLowerCase().replace(/[^a-z]/g, ""); if (D20_WORDS.includes(k)) seen.add(k); }
  return seen.size >= 4;
}
/** A formula guess for a value cell: dice stay as they are, a +5 bonus becomes 1d20+5 only on a d20-looking sheet, anything else is left empty. */
export function guessFormula(value: string, d20: boolean): string {
  const v = value.slice(0, 200).trim();
  if (isDice(v)) return v.replace(/\s+/g, "");
  if (d20 && BONUS.test(v)) return `1d20${v.replace(/\s+/g, "")}`;
  return "";
}
/** What a picked label and value probably are: name from the label, a kind and, for rolls, a formula. */
export function guessPick(label: string, value: string, d20: boolean): { name: string; kind: SheetKind; formula: string } {
  const name = cut(label.trim(), 80), special = kindForName(name), formula = guessFormula(cut(value, 200), d20);
  return { name, kind: special ?? (formula ? "roll" : "stat"), formula: special === "init" || !special ? formula : "" };
}

// ---- The RPG Tools tab -------------------------------------------------------------------------

/** The tab named "RPG Tools" whose first row is Name | Value | Roll (any case), if the sheet has one. */
export function findTemplateTab(tabs: SheetTab[]): SheetTab | undefined {
  return tabs.find(t => same(t.name, TEMPLATE_TAB) && isTemplateHeader(t.rows[0] ?? []));
}
export const isTemplateHeader = (row: string[]) => same(row[0] ?? "", "name") && same(row[1] ?? "", "value") && same(row[2] ?? "", "roll");

/** Every row under the header: a Roll makes a roll (the formula is that Roll), otherwise a stat. HP, Max HP, AC and Initiative rows keep their special kind. */
export function templateItems(tab: SheetTab, previous: SheetItem[] = []): SheetItem[] {
  const items: SheetItem[] = [], labels = new Map(previous.filter(p => p.label).map(p => [p.name.toLowerCase(), p.label!]));
  for (let r = 1; r < tab.rows.length && items.length < MAX_SHEET_ITEMS; r++) {
    const [rawName = "", rawValue = "", rawRoll = ""] = tab.rows[r];
    const name = cut(rawName.trim(), 80), roll = rawRoll.trim();
    if (!name) continue;
    const kind = kindForName(name) ?? (roll ? "roll" : "stat"), value = cut(rawValue.trim(), 200);
    items.push({ id: `r${r + 1}`, name, cell: cellRef(2, r + 1, tab.name), kind, ...(labels.has(name.toLowerCase()) ? { label: labels.get(name.toLowerCase()) } : {}), ...(value ? { value } : {}), ...(roll ? { formula: cut(roll, 200) } : {}) });
  }
  return items;
}

/** The example rows of our own template, in the Name | Value | Roll layout. */
export const templateRows = (): string[][] => [
  ["Name", "Value", "Roll"],
  ["HP", "24", ""], ["Max HP", "31", ""], ["AC", "15", ""], ["Initiative", "+3", "1d20+3"],
  ["Strength", "10", ""], ["Dexterity", "17", ""], ["Constitution", "14", ""],
  ["Stealth", "+5", "1d20+5"], ["Perception", "+4", "1d20+4"],
  ["Longbow attack", "+7", "1d20+7"], ["Longbow damage", "", "1d8+4"],
];
export const TEMPLATE_FILE = "rpg-tools-sheet-template.csv";
export const templateCsv = () => toCsv(templateRows());

// ---- Reading a sheet into the saved items ------------------------------------------------------

/** Names the Sheets API gives a single-cell named range → "Armor Class", "Longbow Attack". */
export const labelFromRangeName = (name: string) => cut(name.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/\s+/g, " ").trim(), 80);

type ApiRange = { sheetId?: number; startRowIndex?: number; endRowIndex?: number; startColumnIndex?: number; endColumnIndex?: number };
/** A Sheets API named range as one A1 cell, or null when it covers more than one cell. */
export function namedRangeCell(range: ApiRange, titleOf: (sheetId: number) => string | undefined): string | null {
  const row = range.startRowIndex ?? 0, col = range.startColumnIndex ?? 0, title = titleOf(range.sheetId ?? 0);
  if ((range.endRowIndex ?? row + 1) - row !== 1 || (range.endColumnIndex ?? col + 1) - col !== 1 || !title) return null;
  return cellRef(col + 1, row + 1, title);
}

export type Refresh = { sheet: Sheet; missing: string[] };
/**
 * The sheet with fresh values from a grid that was just read. Template mode reads the RPG Tools tab again, so new
 * and removed rows follow the tab. Cell mode keeps the picked items and updates each value; an item whose tab or
 * cell can't be found keeps its old value and is listed in `missing`.
 */
export function refreshSheet(sheet: Sheet, tabs: SheetTab[], readAt: string): Refresh {
  if (sheet.mode === "template") {
    const tab = findTemplateTab(tabs);
    if (!tab) throw new Error(`The sheet no longer has a tab named ${TEMPLATE_TAB} with Name, Value and Roll in its first row.`);
    return { sheet: { ...sheet, readAt, items: templateItems(tab, sheet.items) }, missing: [] };
  }
  const missing: string[] = [];
  const items = sheet.items.map(item => {
    const text = cellText(tabs, item.cell, sheet.tab);
    if (text === undefined) { missing.push(item.name); return item; }
    const { value: _old, ...rest } = item;
    void _old;
    return text ? { ...rest, value: cut(text, 200) } : rest;
  });
  return { sheet: { ...sheet, readAt, items }, missing };
}

// ---- What a page shows -------------------------------------------------------------------------

export type SheetTile = { kind: SheetKind; label: string; value: string; max?: string; ratio?: number };
const num = (s?: string) => { const n = Number((s ?? "").replace(/,/g, "").trim()); return s?.trim() && Number.isFinite(n) ? n : null; };
type Shown = Pick<SheetItem, "id" | "name" | "kind" | "label" | "value" | "formula">;

/** Special slots first (hit points with their maximum, then AC and Initiative), then other stats, then rolls. */
export function sheetLayout(items: readonly Shown[]) {
  const first = (k: SheetKind) => items.find(i => i.kind === k);
  const hp = first("hp"), max = first("maxHp"), ac = first("ac"), init = first("init"), tiles: SheetTile[] = [];
  const text = (i?: Shown) => i?.value?.trim() || "—";
  if (hp) {
    const cur = num(hp.value), top = num(max?.value);
    tiles.push({ kind: "hp", label: hp.label || hp.name, value: text(hp), ...(max?.value?.trim() ? { max: max.value.trim() } : {}), ...(cur !== null && top ? { ratio: Math.max(0, Math.min(1, cur / top)) } : {}) });
  } else if (max) tiles.push({ kind: "maxHp", label: max.label || max.name, value: text(max) });
  if (ac) tiles.push({ kind: "ac", label: ac.label || ac.name, value: text(ac) });
  if (init) tiles.push({ kind: "init", label: init.label || init.name, value: text(init) });
  return { tiles, stats: items.filter(i => i.kind === "stat"), rolls: items.filter(i => i.kind === "roll"), initFormula: init?.formula?.trim() || undefined };
}

/** Rolls in a few plain groups: saves, attacks and damage, and everything else. Empty groups are left out. */
export function rollGroups<T extends { name: string }>(rolls: readonly T[]): { title: string; rolls: T[] }[] {
  const saves = rolls.filter(r => /\bsav(e|es|ing)\b/i.test(r.name)), attacks = rolls.filter(r => !saves.includes(r) && /\b(attack|damage|strike|shot)\b/i.test(r.name));
  const rest = rolls.filter(r => !saves.includes(r) && !attacks.includes(r));
  return [{ title: rest.length && (saves.length || attacks.length) ? "Skills and other" : "Rolls", rolls: rest }, { title: "Saves", rolls: saves }, { title: "Attacks and damage", rolls: attacks }].filter(g => g.rolls.length);
}

/** "just now", "2 minutes ago", "an hour ago", "3 days ago". */
export function timeAgo(iso: string | undefined, now = Date.now()): string {
  const then = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.round((now - then) / 1000)), plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"} ago`;
  if (s < 45) return "just now";
  if (s < 90) return "a minute ago";
  if (s < 3600) return plural(Math.round(s / 60), "minute");
  if (s < 5400) return "an hour ago";
  if (s < 86400) return plural(Math.round(s / 3600), "hour");
  return plural(Math.round(s / 86400), "day");
}

export const sheetOpenUrl = (s: Pick<Sheet, "source" | "spreadsheetId" | "publishedUrl">) =>
  s.source === "google" && s.spreadsheetId ? `https://docs.google.com/spreadsheets/d/${s.spreadsheetId}/edit` : s.publishedUrl && isPublishedUrl(s.publishedUrl) ? s.publishedUrl : null;

// ---- The copy players get ----------------------------------------------------------------------

export type PlayerSheet = { title: string; readAt?: string; items: { id: string; name: string; kind: SheetKind; label?: string; value?: string; formula?: string }[] };
/**
 * An allowlist: the title, when it was read, and each item's name, kind, label, cached value and formula. Never the
 * spreadsheet id, the published link, who linked it, the cell references or the tab, because any of those could
 * open the sheet itself. Callers give this to players only when the character's stats are player visible.
 */
export function playerSheet(sheet: Sheet): PlayerSheet {
  return {
    title: sheet.title, ...(sheet.readAt ? { readAt: sheet.readAt } : {}),
    items: sheet.items.map(i => ({ id: i.id, name: i.name, kind: i.kind, ...(i.label ? { label: i.label } : {}), ...(i.value ? { value: i.value } : {}), ...(i.formula ? { formula: i.formula } : {}) })),
  };
}

/**
 * For the players-only view an AI reads: the book's sheet replaced by the player allow-list (title, readAt, items with
 * name, kind, label, value and formula), so no id, link, linker, tab, cell, source or mode survives. The result has the
 * shape of playerSheet(), typed as Sheet only so it can sit in a Workspace; callers read it through playerSheet() again.
 */
export const withoutLinkDetails = (sheet: Sheet): Sheet => playerSheet(sheet) as unknown as Sheet;

/** The ranges to ask the Sheets API for when a linked sheet is read again: the RPG Tools tab, or each tab that has a picked cell. */
export function refreshRanges(sheet: Pick<Sheet, "mode" | "tab" | "items">, firstTab = "Sheet1"): { name: string; range: string }[] {
  if (sheet.mode === "template") return [{ name: TEMPLATE_TAB, range: `A1:C${GRID_ROWS}` }];
  const names = new Map<string, string>();
  for (const i of sheet.items) { const name = parseCell(i.cell)?.tab ?? sheet.tab ?? firstTab; names.set(name.toLowerCase(), name); }
  if (!names.size) names.set((sheet.tab ?? firstTab).toLowerCase(), sheet.tab ?? firstTab);
  return [...names.values()].map(name => ({ name, range: `A1:Z${GRID_ROWS}` }));
}
