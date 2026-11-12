import { z } from 'zod';
import { parseDice, rollDice } from '../rolls.ts';

/**
 * Random tables: one library per account, stored beside the Encyclopedia workspace.
 * A table is used in every campaign (campaignIds null) or only in the listed Encyclopedia campaigns.
 *
 * Kinds:
 *   table   rows rolled by a formula over number ranges, or picked by weight
 *   pair    rolls two other tables and joins the results ("Abandon · a promise")
 *   oracle  a yes or no question answered with odds and a tension level
 *
 * Results can roll dice with [[1d4]] and roll other tables with [[table:Name]].
 */
const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export const TABLE_CATEGORIES = [
  ['oracle', 'Solo oracles'], ['meaning', 'Meaning'], ['npc', 'NPCs'], ['encounter', 'Encounters'], ['loot', 'Loot'],
  ['names', 'Names'], ['weather', 'Weather'], ['place', 'Places'], ['complication', 'Complications'], ['other', 'Other'],
] as const;
export type TableCategory = typeof TABLE_CATEGORIES[number][0];
const categorySchema = z.enum(TABLE_CATEGORIES.map(c => c[0]) as [TableCategory, ...TableCategory[]]);
export const rowSchema = z.object({
  id,
  text: z.string().max(2000),
  min: z.number().int().min(-1000).max(100000).optional(),
  max: z.number().int().min(-1000).max(100000).optional(),
  weight: z.number().int().min(0).max(1000).optional(),
});
export const partSchema = z.object({ id, label: z.string().trim().min(1).max(60), tableId: id });
export const oddsSchema = z.object({ label: z.string().trim().min(1).max(60), yes: z.number().int().min(0).max(100) });
export const tableSchema = z.object({
  id,
  name: z.string().trim().min(1).max(160),
  category: categorySchema,
  kind: z.enum(['table', 'pair', 'oracle', 'generator']),
  description: z.string().max(2000).optional(),
  /** null: every campaign, now and future. Otherwise Encyclopedia campaign ids. */
  campaignIds: z.array(id).max(500).nullable(),
  mode: z.enum(['ranges', 'weighted']).optional(),
  formula: z.string().max(60).optional(),
  rows: z.array(rowSchema).max(1000).optional(),
  pair: z.tuple([id, id]).optional(),
  /** pair: what goes between the two words. Defaults to ' · '. */
  joiner: z.string().max(5).optional(),
  odds: z.array(oddsSchema).min(2).max(9).optional(),
  twistTableId: id.optional(),
  /** generator: labelled lines, each rolled on a table. A line labelled Name becomes the title. */
  parts: z.array(partSchema).max(20).optional(),
  /** generator: rolled on demand, such as a reaction during a conversation. */
  extras: z.array(partSchema).max(10).optional(),
  updatedAt: z.string().datetime(),
});
export const librarySchema = z.object({
  schemaVersion: z.literal(1),
  tables: z.array(tableSchema).max(2000),
  /** Oracle tension per Encyclopedia campaign ("" when no campaign is open), 1 to 9. */
  tension: z.record(z.string().max(100), z.number().int().min(1).max(9)).optional(),
}).superRefine((s, ctx) => {
  const ids = new Set(s.tables.map(t => t.id));
  if (ids.size !== s.tables.length) ctx.addIssue({ code: 'custom', message: 'Table IDs must be unique' });
  for (const t of s.tables) {
    if (t.kind === 'table') {
      if (!t.rows || !t.mode) ctx.addIssue({ code: 'custom', message: `“${t.name}” needs rows` });
      if (t.mode === 'ranges') {
        if (!t.formula) ctx.addIssue({ code: 'custom', message: `“${t.name}” needs a roll, such as d20` });
        else try { parseDice(diceFormula(t.formula)); } catch { ctx.addIssue({ code: 'custom', message: `“${t.name}” has a roll that isn’t dice, such as d20 or 2d6` }); }
      }
      if (new Set(t.rows?.map(r => r.id)).size !== (t.rows?.length ?? 0)) ctx.addIssue({ code: 'custom', message: 'Row IDs must be unique within a table' });
    }
    if (t.kind === 'pair' && (!t.pair || t.pair.some(p => !ids.has(p)))) ctx.addIssue({ code: 'custom', message: `“${t.name}” needs two tables to combine` });
    if (t.kind === 'generator' && (!t.parts?.length || [...t.parts, ...(t.extras ?? [])].some(p => !ids.has(p.tableId)))) ctx.addIssue({ code: 'custom', message: `“${t.name}” needs at least one line, each rolled on a table in your library` });
    if (t.kind === 'oracle' && !t.odds) ctx.addIssue({ code: 'custom', message: `“${t.name}” needs odds` });
  }
});
export type RandomTable = z.infer<typeof tableSchema>;
export type TableRow = z.infer<typeof rowSchema>;
export type TableLibrary = z.infer<typeof librarySchema>;
export const emptyLibrary = (): TableLibrary => ({ schemaVersion: 1, tables: [] });
export const LIBRARY_LIMIT = 1_000_000;

/** "d20" is short for "1d20"; "d%" and "d00" mean d100. */
export function diceFormula(text: string) {
  return text.trim().toLowerCase().replace(/\s+/g, '').replace(/d%|d00\b/g, 'd100').replace(/(^|[+-])d/g, '$11d');
}
export function inCampaign(table: RandomTable, campaignId: string | null) {
  return table.campaignIds === null || (campaignId !== null && table.campaignIds.includes(campaignId));
}
/** Lowest and highest totals a formula can roll. */
export function formulaRange(formula: string): [number, number] {
  let lo = 0, hi = 0;
  for (const t of parseDice(diceFormula(formula))) {
    const a = t.count ? t.count : t.constant, b = t.count ? t.count * t.sides : t.constant;
    if (t.sign > 0) { lo += a; hi += b; } else { lo -= b; hi -= a; }
  }
  return [lo, hi];
}
/** Totals the rows don't cover, and totals covered twice. */
export function rangeGaps(table: RandomTable) {
  if (table.mode !== 'ranges' || !table.formula) return { missing: [] as number[], overlap: [] as number[] };
  let range: [number, number];
  try { range = formulaRange(table.formula); } catch { return { missing: [], overlap: [] }; }
  const missing: number[] = [], overlap: number[] = [];
  for (let n = range[0]; n <= range[1] && n - range[0] < 10000; n++) {
    const hits = (table.rows ?? []).filter(r => r.min !== undefined && n >= r.min && n <= (r.max ?? r.min)).length;
    if (!hits) missing.push(n); else if (hits > 1) overlap.push(n);
  }
  return { missing, overlap };
}
/** "3–5", "7", or "" for weighted rows. */
export const rangeLabel = (r: TableRow) => r.min === undefined ? '' : r.max !== undefined && r.max !== r.min ? `${r.min}–${r.max}` : String(r.min);

export type RollStep = { table: string; roll: string; text: string };
export type TableRoll = { tableId: string; title: string; roll: string; text: string; steps: RollStep[]; oracle?: OracleAnswer };
type Random = () => number;
const TABLE_REF = /\[\[table:([^\]|\n]{1,160})(?:\|[^\]\n]*)?\]\]/gi;
const DICE_REF = /\[\[([^\]|\n]{1,200})(?:\|[^\]\n]*)?\]\]/g;
export const findTable = (library: TableLibrary, name: string) => {
  const key = name.trim().toLowerCase();
  return library.tables.find(t => t.id === name.trim()) ?? library.tables.find(t => t.name.trim().toLowerCase() === key);
};

function pickRow(table: RandomTable, random: Random): { row: TableRow | null; roll: string } {
  const rows = table.rows ?? [];
  if (table.mode === 'ranges') {
    const r = rollDice(diceFormula(table.formula ?? 'd6'), random);
    return { row: rows.find(x => x.min !== undefined && r.total >= x.min && r.total <= (x.max ?? x.min)) ?? null, roll: `${table.formula} = ${r.total}` };
  }
  const total = rows.reduce((n, r) => n + (r.weight ?? 1), 0);
  if (!total) return { row: null, roll: '' };
  let at = random() * total;
  for (const r of rows) { at -= r.weight ?? 1; if (at < 0) return { row: r, roll: `${rows.indexOf(r) + 1} of ${rows.length}` }; }
  return { row: rows[rows.length - 1], roll: `${rows.length} of ${rows.length}` };
}

/** Rolls dice and nested tables inside a result. Depth stops runaway loops (a table that rolls itself). */
export function resolveText(library: TableLibrary, text: string, random: Random = Math.random, steps: RollStep[] = [], depth = 0): string {
  const withTables = text.replace(TABLE_REF, (whole, name: string) => {
    const t = findTable(library, name);
    if (!t || depth >= 6) return t ? '…' : whole;
    const r = rollInner(library, t, random, steps, depth + 1);
    return r.text;
  });
  return withTables.replace(DICE_REF, (whole, inner: string) => {
    if (!/d\s*\d/i.test(inner)) return whole;
    try { return String(rollDice(diceFormula(inner), random).total); } catch { return whole; }
  });
}
function rollInner(library: TableLibrary, table: RandomTable, random: Random, steps: RollStep[], depth: number): { text: string; roll: string } {
  if (table.kind === 'pair') {
    const parts = depth < 6 ? (table.pair ?? []).map(pid => library.tables.find(t => t.id === pid)).filter((t): t is RandomTable => !!t) : [];
    const rolled = parts.map(t => rollInner(library, t, random, steps, depth + 1));
    const text = rolled.map(r => r.text).join(table.joiner ?? ' · ');
    if (depth) steps.push({ table: table.name, roll: '', text });
    return { text, roll: rolled.map(r => r.roll).join(', ') };
  }
  if (table.kind === 'generator') {
    const lines = depth < 6 ? (table.parts ?? []).map(p => { const t = library.tables.find(x => x.id === p.tableId); return t ? `${p.label}: ${rollInner(library, t, random, steps, depth + 1).text}` : ''; }).filter(Boolean) : [];
    const text = lines.join('; ');
    if (depth) steps.push({ table: table.name, roll: '', text });
    return { text, roll: '' };
  }
  if (table.kind === 'oracle') {
    const a = askOracle(table, table.odds?.[Math.floor((table.odds.length - 1) / 2)]?.label ?? '', 5, random);
    if (depth) steps.push({ table: table.name, roll: a.roll, text: a.answer });
    return { text: a.answer, roll: a.roll };
  }
  const { row, roll } = pickRow(table, random);
  const inner: RollStep[] = [];
  const text = row ? resolveText(library, row.text, random, inner, depth) : 'No row for this roll';
  if (depth) steps.push({ table: table.name, roll, text });
  steps.push(...inner);
  return { text, roll };
}
export function rollTable(library: TableLibrary, tableId: string, random: Random = Math.random): TableRoll {
  const table = library.tables.find(t => t.id === tableId);
  if (!table) throw Error('That table is no longer in your library.');
  const steps: RollStep[] = [];
  const r = rollInner(library, table, random, steps, 0);
  return { tableId, title: table.name, roll: r.roll, text: r.text, steps };
}

/* ---------- Oracle ----------
 * d100 against the chance of yes. Under a fifth of the chance is an emphatic yes ("Yes, and…"),
 * the top fifth of the no band is an emphatic no. Results near the line come with a catch ("but").
 * Doubles (11, 22 … 99) whose digit is at or under the tension bring a twist.
 */
export const DEFAULT_ODDS = [
  { label: 'Nearly impossible', yes: 10 }, { label: 'Unlikely', yes: 30 }, { label: '50 / 50', yes: 50 },
  { label: 'Likely', yes: 70 }, { label: 'Nearly certain', yes: 90 },
];
export type OracleAnswer = { question: string; odds: string; chance: number; d100: number; answer: string; twist: boolean; tension: number };
export function oracleAnswer(chance: number, d100: number) {
  const yes = d100 <= chance;
  const strong = yes ? d100 <= Math.max(1, Math.round(chance / 5)) : d100 > 100 - Math.max(1, Math.round((100 - chance) / 5));
  const near = !strong && Math.abs(d100 - (chance + 0.5)) <= Math.max(3, Math.round(Math.min(chance, 100 - chance) / 6));
  return yes ? (strong ? 'Yes, and…' : near ? 'Yes, but…' : 'Yes') : (strong ? 'No, and…' : near ? 'No, but…' : 'No');
}
export function askOracle(table: RandomTable, oddsLabel: string, tension: number, random: Random = Math.random, question = ''): OracleAnswer & { roll: string } {
  const odds = table.odds?.find(o => o.label === oddsLabel) ?? table.odds?.[0] ?? DEFAULT_ODDS[2];
  const d100 = Math.floor(random() * 100) + 1;
  const twist = d100 % 11 === 0 && d100 < 100 && d100 / 11 <= tension;
  return { question, odds: odds.label, chance: odds.yes, d100, answer: oracleAnswer(odds.yes, d100), twist, tension, roll: `d100 = ${d100}` };
}

/* ---------- Paste and file import ---------- */
const NUM = String.raw`(\d{1,3})(?:\s*(?:-|–|—|to)\s*(\d{1,3}))?`;
const LEAD = new RegExp(String.raw`^\s*${NUM}\s*[.):]?\s+(\S.*)$`);
type Parsed = { min: number; max: number; text: string };
function rangeCells(line: string): Parsed[] | null {
  // Tab or wide-space columns ("1  Abandon    51  Kindle") become one row per cell.
  const cells = line.split(/\t+| {3,}/).map(c => c.trim()).filter(Boolean);
  const out: Parsed[] = [];
  for (let i = 0; i < cells.length; i++) {
    const m = cells[i].match(LEAD);
    if (m) { out.push({ min: +m[1], max: +(m[2] ?? m[1]), text: m[3].trim() }); continue; }
    const only = cells[i].match(new RegExp(String.raw`^${NUM}[.):]?$`));
    if (only && cells[i + 1] && !LEAD.test(cells[i + 1])) { out.push({ min: +only[1], max: +(only[2] ?? only[1]), text: cells[++i] }); continue; }
    if (out.length) out[out.length - 1].text += ' ' + cells[i]; else return null;
  }
  return out.length ? out : null;
}
/**
 * Reads a pasted table: "01–05 Result", "1. Result", "3: Result", columns of numbered words, or a plain list.
 * Numbered rows keep their ranges; "00" counts as 100. A plain list becomes rows of equal weight.
 */
export function parseTableText(text: string, makeId: () => string): { mode: 'ranges' | 'weighted'; formula?: string; rows: TableRow[] } {
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(l => l && !/^#/.test(l));
  const numbered = lines.map(rangeCells);
  const share = numbered.filter(Boolean).length / Math.max(1, lines.length);
  if (lines.length && share >= 0.6) {
    const rows: Parsed[] = [];
    for (let i = 0; i < lines.length; i++) {
      const cells = numbered[i];
      if (cells) rows.push(...cells); else if (rows.length) rows[rows.length - 1].text += ' ' + lines[i];
    }
    const hundred = rows.some(r => r.min === 0 && r.max === 0 || r.max === 0 && r.min > 0);
    for (const r of rows) { if (hundred && r.max === 0) r.max = 100; if (hundred && r.min === 0) r.min = 100; if (r.max < r.min) [r.min, r.max] = [r.max, r.min]; }
    rows.sort((a, b) => a.min - b.min);
    const lo = rows[0].min, hi = Math.max(...rows.map(r => r.max));
    const formula = lo === 2 && hi === 12 ? '2d6' : lo === 3 && hi === 18 ? '3d6' : lo <= 1 ? `d${hi}` : `d${hi}`;
    return { mode: 'ranges', formula, rows: rows.slice(0, 1000).map(r => ({ id: makeId(), text: r.text.slice(0, 2000), min: r.min, ...(r.max !== r.min ? { max: r.max } : {}) })) };
  }
  return { mode: 'weighted', rows: lines.slice(0, 1000).map(l => ({ id: makeId(), text: l.replace(/^[-*•]\s+/, '').slice(0, 2000) })) };
}
function csvRows(text: string): string[][] {
  const out: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; continue; }
    if (c === '"') quoted = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out.filter(r => r.some(c => c.trim()));
}
/** A spreadsheet with a Result column, and optionally Roll (such as 3-5) and Weight columns. */
export function parseCsvTable(text: string, makeId: () => string): { mode: 'ranges' | 'weighted'; formula?: string; rows: TableRow[] } {
  const rows = csvRows(text);
  const head = rows[0]?.map(h => h.trim().toLowerCase()) ?? [];
  const has = head.some(h => ['result', 'roll', 'weight', 'text', 'entry'].includes(h));
  const col = (name: string[]) => head.findIndex(h => name.includes(h));
  const body = has ? rows.slice(1) : rows;
  const rc = has ? col(['roll', 'range', 'd']) : body.every(r => r.length > 1 && /^\s*\d/.test(r[0])) ? 0 : -1;
  const tc = has ? Math.max(0, col(['result', 'text', 'entry'])) : rc === 0 ? 1 : 0;
  const wc = has ? col(['weight']) : -1;
  if (rc >= 0) return parseTableText(body.map(r => `${r[rc]} ${r[tc] ?? ''}`).join('\n'), makeId);
  return { mode: 'weighted', rows: body.slice(0, 1000).map(r => ({ id: makeId(), text: (r[tc] ?? '').trim().slice(0, 2000), ...(wc >= 0 && Number(r[wc]) >= 0 ? { weight: Math.min(1000, Math.round(Number(r[wc]))) } : {}) })).filter(r => r.text) };
}
export function tableToCsv(table: RandomTable) {
  const q = (s: string) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const rows = table.rows ?? [];
  return table.mode === 'ranges' ? ['Roll,Result', ...rows.map(r => `${rangeLabel(r).replace('–', '-')},${q(r.text)}`)].join('\n') + '\n'
    : ['Result,Weight', ...rows.map(r => `${q(r.text)},${r.weight ?? 1}`)].join('\n') + '\n';
}
export const EXPORT_FORMAT = 'rpg-tools-tables';
export function exportTables(library: TableLibrary, ids: string[]) {
  const wanted = new Set(ids);
  // Pairs need the tables they combine.
  const refs = (t: RandomTable) => [...(t.pair ?? []), ...(t.parts ?? []).map(p => p.tableId), ...(t.extras ?? []).map(p => p.tableId), ...(t.twistTableId ? [t.twistTableId] : [])];
  for (let grew = true; grew;) { grew = false; for (const t of library.tables) if (wanted.has(t.id)) for (const r of refs(t)) if (!wanted.has(r) && library.tables.some(x => x.id === r)) { wanted.add(r); grew = true; } }
  return { format: EXPORT_FORMAT, version: 1, tables: library.tables.filter(t => wanted.has(t.id)).map(t => ({ ...t, campaignIds: null })) };
}
/** Adds tables from an export as new tables with new IDs, used in the given campaigns (null: all). Pairs are re-pointed. */
export function importTables(library: TableLibrary, input: unknown, campaignIds: string[] | null, makeId: () => string, now = new Date().toISOString()): { library: TableLibrary; added: number } {
  const parsed = z.object({ format: z.literal(EXPORT_FORMAT), version: z.literal(1), tables: z.array(tableSchema).max(2000) }).parse(input);
  const map = new Map(parsed.tables.map(t => [t.id, makeId()]));
  const names = new Set(library.tables.map(t => t.name.toLowerCase()));
  const tables = parsed.tables.map(t => {
    let name = t.name; for (let n = 2; names.has(name.toLowerCase()); n++) name = `${t.name} (${n})`;
    names.add(name.toLowerCase());
    return { ...t, id: map.get(t.id)!, name, campaignIds, updatedAt: now, pair: t.pair ? t.pair.map(p => map.get(p) ?? p) as [string, string] : undefined, twistTableId: t.twistTableId ? map.get(t.twistTableId) : undefined, parts: t.parts?.map(p => ({ ...p, tableId: map.get(p.tableId) ?? p.tableId })), extras: t.extras?.map(p => ({ ...p, tableId: map.get(p.tableId) ?? p.tableId })) };
  });
  return { library: librarySchema.parse({ ...library, tables: [...library.tables, ...tables] }), added: tables.length };
}
/** Makes a table available in one more campaign, or copies it into that campaign only. */
export function bringToCampaign(library: TableLibrary, ids: string[], campaignId: string, copy: boolean, makeId: () => string, now = new Date().toISOString()): TableLibrary {
  if (!copy) return { ...library, tables: library.tables.map(t => ids.includes(t.id) && t.campaignIds && !t.campaignIds.includes(campaignId) ? { ...t, campaignIds: [...t.campaignIds, campaignId], updatedAt: now } : t) };
  const out = importTables(library, exportTables(library, ids), [campaignId], makeId, now).library;
  return out;
}

/* ---------- Generators ---------- */
export type GeneratorLine = { partId: string; label: string; tableId: string; text: string; roll: string; steps: RollStep[] };
/** Rolls a generator's lines. Lines in keep stay as they are. */
export function rollGenerator(library: TableLibrary, generatorId: string, keep: GeneratorLine[] = [], random: Random = Math.random): GeneratorLine[] {
  const g = library.tables.find(t => t.id === generatorId);
  if (!g || g.kind !== 'generator') throw Error('That generator is no longer in your library.');
  return (g.parts ?? []).map(p => keep.find(k => k.partId === p.id) ?? rollLine(library, p, random));
}
export function rollLine(library: TableLibrary, part: { id: string; label: string; tableId: string }, random: Random = Math.random): GeneratorLine {
  try { const r = rollTable(library, part.tableId, random); return { partId: part.id, label: part.label, tableId: part.tableId, text: r.text, roll: r.roll, steps: r.steps }; }
  catch { return { partId: part.id, label: part.label, tableId: part.tableId, text: 'Missing table', roll: '', steps: [] }; }
}
const isName = (label: string) => /^name$/i.test(label.trim());
/** The name line (labelled Name) becomes the title; the rest become page text. */
export function generatorPage(lines: GeneratorLine[], who = '') {
  const name = lines.find(l => isName(l.label))?.text.trim();
  const title = (name || who.trim() || 'New character').slice(0, 160);
  const intro = name && who.trim() ? [`**Who:** ${who.trim()}`] : [];
  const body = [...intro, ...lines.filter(l => !isName(l.label)).map(l => `**${l.label}:** ${l.text}`)].join('\n\n');
  return { title, body };
}
