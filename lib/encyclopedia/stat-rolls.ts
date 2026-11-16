import { rollTarget } from './inline.ts';
import type { StatField } from './world-model.ts';

/*
 * Rolls on the campaign's stat form (the character sheet). A stat has any number of named rolls, like a spell's Attack
 * and Damage; a formula can use {value} for the stat's own value on this character. Forms saved before named rolls kept
 * one roll per field (roll / rollFormula): it reads here as a single roll called "Roll", and saving the stat on the
 * sheet writes `rolls` in its place.
 */

export const MAX_STAT_ROLLS = 6;
export type StatRoll = { name: string; formula: string; success?: { op: 'atLeast' | 'atMost'; against: string } };
type RollFields = { roll?: string; rollFormula?: string; rolls?: StatRoll[] };

/** A field's rolls: its own list, or the one roll an older form kept, called "Roll". */
export function statRolls(f: RollFields): StatRoll[] {
  if (f.rolls) return f.rolls;
  const r = f.roll ?? 'none';
  if (r === 'd20') return [{ name: 'Roll', formula: '1d20+{value}' }];
  if (r === 'formula') return [{ name: 'Roll', formula: '{value}' }];
  if (r === 'custom' && f.rollFormula?.trim()) return [{ name: 'Roll', formula: f.rollFormula.trim() }];
  return [];
}

/*
 * Formulas can read the rest of the sheet. Inside { } go numbers, + - * / ( ), floor ceil round min max abs, `value`
 * (this stat), any stat's name (its value; a checkbox is 1 or 0) and "Name mod" (that stat's worked-out value, from its
 * `derived` formula). {value} on its own puts the value in as written, so a text stat holding 2d8+3 rolls that.
 * Numbers that come out with a fraction round down.
 */
export type SheetStat = { label: string; type: string; derived?: string; value: unknown };
export type Outcome = { ok: boolean; text: string };
export type StatSuccess = { op: 'atLeast' | 'atMost'; against: string };
type Found = { dice: string } | { missing: string } | { bad: true };

const blank = (v: unknown) => v === null || v === undefined || v === '';
/** A stat value as a number: numbers, numeric text, and a checkbox as 1 or 0. Null when it has none. */
export function statNumber(v: unknown): number | null {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && /^\s*[+-]?\d+(\.\d+)?\s*$/.test(v)) return Number(v);
  return null;
}
/** The sheet a formula reads: the form's stats with this character's values. */
export function sheetOf(fields: { id: string; label: string; type: string; derived?: string; archived?: boolean }[], values: Record<string, unknown>): SheetStat[] {
  return fields.filter(f => !f.archived).map(f => ({ label: f.label, type: f.type, derived: f.derived, value: values[f.id] }));
}

const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
class Missing { name: string; constructor(name: string) { this.name = name; } }

/** Plain arithmetic: numbers, + - * / and ( ), and a few functions. Throws on anything else. */
function arithmetic(src: string): number {
  const tokens = src.match(/\d+(?:\.\d+)?|[a-z]+|[-+*/(),]|\S/gi) ?? [];
  let i = 0;
  const peek = () => tokens[i], take = () => tokens[i++];
  const fns: Record<string, (...a: number[]) => number> = { floor: Math.floor, ceil: Math.ceil, round: Math.round, abs: Math.abs, min: Math.min, max: Math.max };
  function atom(): number {
    const t = take();
    if (t === undefined) throw new Error('end');
    if (t === '-') return -atom();
    if (t === '+') return atom();
    if (t === '(') { const v = sum(); if (take() !== ')') throw new Error(')'); return v; }
    if (/^\d/.test(t)) return Number(t);
    const fn = fns[t.toLowerCase()];
    if (fn && take() === '(') { const args = [sum()]; while (peek() === ',') { take(); args.push(sum()); } if (take() !== ')') throw new Error(')'); return fn(...args); }
    throw new Error(`unknown ${t}`);
  }
  function product(): number { let v = atom(); while (peek() === '*' || peek() === '/') { const op = take(), r = atom(); v = op === '*' ? v * r : v / r; } return v; }
  function sum(): number { let v = product(); while (peek() === '+' || peek() === '-') { const op = take(), r = product(); v = op === '+' ? v + r : v - r; } return v; }
  const v = sum();
  if (i !== tokens.length || !Number.isFinite(v)) throw new Error('bad');
  return v;
}

/** The number one { } stands for, reading names off the sheet. Throws Missing when a stat it needs has no value. */
function braceNumber(inner: string, self: unknown, sheet: SheetStat[], depth: number): number {
  const names: [string, () => number][] = [['value', () => { const n = statNumber(self); if (n === null) throw new Missing('value'); return n; }]];
  for (const st of sheet) {
    if (st.derived) names.push([`${st.label} mod`, () => derivedValue(st, sheet, depth + 1) ?? (() => { throw new Missing(st.label); })()]);
    names.push([st.label, () => { const n = statNumber(st.value); if (n === null) throw new Missing(st.label); return n; }]);
  }
  names.sort((a, b) => b[0].length - a[0].length);
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])(${names.map(n => escape(n[0])).join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
  const swapped = inner.replace(re, m => { const hit = names.find(n => n[0].toLowerCase() === m.toLowerCase())!; return `(${hit[1]()})`; });
  return Math.floor(arithmetic(swapped));
}

/** A stat's worked-out value (its `derived` formula, like floor(({value}-10)/2)), or null when it can't be worked out. */
export function derivedValue(st: Pick<SheetStat, 'derived' | 'value'>, sheet: SheetStat[], depth = 0): number | null {
  if (!st.derived?.trim() || depth > 3) return null;
  try { return Math.floor(arithmetic(st.derived.replace(/\{([^{}]*)\}/g, (_, inner: string) => `(${braceNumber(inner, st.value, sheet, depth)})`))); }
  catch { return null; }
}

function find(formula: string, value: unknown, sheet: SheetStat[]): Found {
  let missing: string | null = null, bad = false;
  const filled = formula.replace(/\{([^{}]*)\}/g, (_, inner: string) => {
    if (inner.trim().toLowerCase() === 'value' && typeof value === 'string' && statNumber(value) === null) {
      const v = value.trim();
      if (!v) { missing ??= 'value'; return '0'; }
      if (v.includes('|') || v.length > 100) { bad = true; return '0'; }
      return v;
    }
    try { const n = braceNumber(inner, value, sheet, 0); return n < 0 ? `-${-n}` : String(n); }
    catch (e) { if (e instanceof Missing) missing ??= e.name; else bad = true; return '0'; }
  });
  if (missing) return { missing };
  if (bad) return { bad: true };
  const d = rollTarget(filled.replace(/\+\s*([+-])/g, '$1').replace(/-\s*-/g, '+'))?.formula;
  return d ? { dice: tidy(d) } : { bad: true };
}

/** The dice a roll throws for this value, or null when it can't roll (a value it needs is empty, or it isn't dice). */
export function statRollDice(formula: string, value: unknown, sheet: SheetStat[] = []): string | null {
  const r = find(formula, value, sheet);
  return 'dice' in r ? r.dice : null;
}

/** 1d20+2+2 reads as 1d20+4: plain numbers after the dice add up. Anything else stays as written. */
function tidy(dice: string) {
  const m = dice.match(/^(\d*d\d+)((?:[+-]\d+)+)$/i);
  if (!m) return dice;
  const n = (m[2].match(/[+-]\d+/g) ?? []).reduce((a, b) => a + Number(b), 0);
  return n === 0 ? m[1] : `${m[1]}${n < 0 ? '' : '+'}${n}`;
}

/** Why a roll can't roll yet, for a hint under the stat; null when it rolls. */
export function statRollHint(formula: string, value: unknown, type: StatField['type'], sheet: SheetStat[] = []): string | null {
  const r = find(formula, value, sheet);
  if ('dice' in r) return null;
  if ('missing' in r && r.missing !== 'value') return `Fill in ${r.missing} to roll this.`;
  const sample = type === 'number' ? 3 : formula.trim() === '{value}' ? '1d6' : '3', again = find(formula, sample, sheet);
  if ('bad' in again) return 'Its roll needs dice, like 1d20+3 or 1d20+{value}.';
  if ('missing' in again) return `Fill in ${again.missing} to roll this.`;
  if (formula.trim() === '{value}') return blank(value) ? 'Type dice like 2d8+3 to roll them.' : 'Type dice like 2d8+3 to roll this.';
  return blank(value) ? (type === 'number' ? 'Type a number to roll.' : 'Fill this in to roll.') : 'Type a number to roll.';
}

/**
 * What a formula rolls, for the Add a stat dialog: with this character's values when they're filled in ("Rolls 1d20+5
 * for Chiree."), otherwise with 3 in this stat. `bad` says it isn't dice or names something that isn't on the sheet.
 */
export function statRollPreview(formula: string, type: StatField['type'], sheet: SheetStat[] = [], value?: unknown, who?: string): { text: string; bad: boolean } {
  if (!formula.trim()) return { text: 'Write dice, like 1d20+3 or 1d20+{value}.', bad: false };
  const usesValue = /\{[^{}]*\bvalue\b[^{}]*\}/i.test(formula);
  if (usesValue && type === 'none') return { text: 'This stat has no value for {value}. Write the dice out, or use another stat’s name.', bad: true };
  const now = find(formula, value, sheet);
  if ('dice' in now) return { text: !/\{/.test(formula) ? `Always rolls ${now.dice}.` : who ? `For ${who} this rolls ${now.dice}.` : `Rolls ${now.dice}.`, bad: false };
  if ('bad' in now) return { text: 'Needs dice, and names of stats on this sheet, like 1d20+{value} or 1d20+{Agility}.', bad: true };
  const sample = formula.trim() === '{value}' ? '2d8+3' : type === 'checkbox' ? true : 3, filled = sheet.map(s => ({ ...s, value: blank(s.value) ? 3 : s.value })), d = find(formula, sample, filled);
  if (!('dice' in d)) return { text: 'Needs dice, and names of stats on this sheet, like 1d20+{value} or 1d20+{Agility}.', bad: true };
  return { text: now.missing === 'value' ? `With ${sample === true ? 'it ticked' : sample} here: ${d.dice}.` : `Once ${now.missing} is filled in. With 3 there: ${d.dice}.`, bad: false };
}

/** Success or fail for a roll with a target, like at least 15 or at most {value}. Null with no target or one that can't be worked out. */
export function rollOutcome(total: number, success: StatSuccess | undefined, value: unknown, sheet: SheetStat[] = []): Outcome | null {
  if (!success?.against.trim()) return null;
  let n: number;
  try { n = Math.floor(arithmetic(success.against.replace(/\{([^{}]*)\}/g, (_, inner: string) => `(${braceNumber(inner, value, sheet, 0)})`))); } catch { return null; }
  const ok = success.op === 'atLeast' ? total >= n : total <= n;
  return { ok, text: `${ok ? 'Success' : 'Fail'} · needed ${n} ${success.op === 'atLeast' ? 'or more' : 'or under'}` };
}

/** A target's number for this character, for the button's title; null when it can't be worked out. */
export function targetNumber(success: StatSuccess | undefined, value: unknown, sheet: SheetStat[] = []) {
  return success ? rollOutcome(0, success, value, sheet)?.text.match(/needed (-?\d+)/)?.[1] ?? null : null;
}

/** The first roll a field throws for this value (the old single roll), or null. */
export function firstStatRoll(f: RollFields, value: unknown, sheet: SheetStat[] = []): string | null {
  for (const r of statRolls(f)) { const d = statRollDice(r.formula, value, sheet); if (d) return d; }
  return null;
}

/** Puts a new stat after the last one in its group, so groups stay together; at the end for a new group. */
export function placeStat<F extends { section: string }>(fields: F[], field: F): F[] {
  let at = -1; fields.forEach((f, i) => { if (f.section === field.section) at = i; });
  return at < 0 ? [...fields, field] : [...fields.slice(0, at + 1), field, ...fields.slice(at + 1)];
}

export type StatRowRoll = { name: string; dice: string | null; hint?: string; need?: { op: StatSuccess['op']; n: number } };
export type StatRow = { id: string; label: string; section: string; type: string; value: unknown; note?: string; worked?: number; rolls: StatRowRoll[]; spend?: { tracker: string; n: number } };
export type RowField = { id: string; label: string; section: string; type: StatField['type']; note?: string; derived?: string; spend?: { tracker: string; n: number }; archived?: boolean; roll?: string; rollFormula?: string; rolls?: StatRoll[] };

/**
 * The sheet as rows, with every roll worked out for this character: what a player page and a Maptable token show.
 * Only `fields` are on the sheet, so a player's rows never read a GM-only stat (a roll naming one simply can't roll).
 */
/** Rows are read by players, who can't fix a formula, so a broken one says who can. */
const rowHint = (h: string | null) => h === null ? undefined : h.startsWith('Its roll needs dice') ? 'Your GM hasn’t finished this roll yet.' : h;

export function statRows(fields: RowField[], values: Record<string, unknown>): StatRow[] {
  const live = fields.filter(f => !f.archived), sheet = sheetOf(live, values);
  return live.map(f => {
    const v = values[f.id] ?? null, worked = f.derived ? derivedValue({ derived: f.derived, value: v }, sheet) : null;
    const rolls = statRolls(f).map(r => {
      const dice = statRollDice(r.formula, v, sheet), n = r.success ? targetNumber(r.success, v, sheet) : null;
      return { name: r.name, dice, ...(dice ? {} : { hint: rowHint(statRollHint(r.formula, v, f.type, sheet)) }), ...(r.success && n !== null ? { need: { op: r.success.op, n: Number(n) } } : {}) };
    });
    return { id: f.id, label: f.label, section: f.section, type: f.type, value: v, ...(f.note ? { note: f.note } : {}), ...(worked !== null ? { worked } : {}), rolls, ...(f.spend ? { spend: f.spend } : {}) };
  });
}

/** Success or fail from a worked-out target (a row's `need`), for rolls made where the sheet isn't at hand. */
export const outcomeOf = (total: number, need: StatRowRoll['need']): Outcome | null => need ? { ok: need.op === 'atLeast' ? total >= need.n : total <= need.n, text: `${(need.op === 'atLeast' ? total >= need.n : total <= need.n) ? 'Success' : 'Fail'} · needed ${need.n} ${need.op === 'atLeast' ? 'or more' : 'or under'}` } : null;
