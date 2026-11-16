import { rollTarget } from './inline.ts';
import type { StatField } from './world-model.ts';

/*
 * Rolls on the campaign's stat form (the character sheet). A stat has any number of named rolls, like a spell's Attack
 * and Damage; a formula can use {value} for the stat's own value on this character. Forms saved before named rolls kept
 * one roll per field (roll / rollFormula): it reads here as a single roll called "Roll", and saving the stat on the
 * sheet writes `rolls` in its place.
 */

export const MAX_STAT_ROLLS = 6;
export type StatRoll = { name: string; formula: string };
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

const empty = (v: unknown) => v === null || v === undefined || v === '' || typeof v === 'boolean';

/** The dice a roll throws for this value, or null when it can't roll (no value for {value}, or not dice). */
export function statRollDice(formula: string, value: unknown): string | null {
  if (!formula.includes('{value}')) return rollTarget(formula)?.formula ?? null;
  if (empty(value)) return null;
  const v = String(value).trim();
  if (!v || v.includes('|') || v.length > 100) return null;
  const f = formula.replaceAll('{value}', v).replace(/\+\s*([+-])/g, '$1').replace(/-\s*-/g, '+');
  const d = rollTarget(f)?.formula ?? null;
  return d && tidy(d);
}

/** 1d20+2+2 reads as 1d20+4: plain numbers after the dice add up. Anything else stays as written. */
function tidy(dice: string) {
  const m = dice.match(/^(\d*d\d+)((?:[+-]\d+){2,})$/i);
  if (!m) return dice;
  const n = (m[2].match(/[+-]\d+/g) ?? []).reduce((a, b) => a + Number(b), 0);
  return n === 0 ? m[1] : `${m[1]}${n < 0 ? '' : '+'}${n}`;
}

/** Why a roll can't roll yet, for a hint under the stat; null when it rolls. */
export function statRollHint(formula: string, value: unknown, type: StatField['type']): string | null {
  if (statRollDice(formula, value) !== null) return null;
  const sample = type === 'number' ? 3 : formula.trim() === '{value}' ? '1d6' : '3';
  if (statRollDice(formula, sample) === null) return 'Its roll needs dice, like 1d20+3 or 1d20+{value}.';
  if (formula.trim() === '{value}') return empty(value) ? 'Type dice like 2d8+3 to roll them.' : 'Type dice like 2d8+3 to roll this.';
  return empty(value) ? (type === 'number' ? 'Type a number to roll.' : 'Fill this in to roll.') : 'Type a number to roll.';
}

/** "Always rolls 1d20+3." or "With 3 here: 1d20+3.", for the Add a stat dialog; bad says the formula isn't dice. */
export function statRollPreview(formula: string, type: StatField['type']): { text: string; bad: boolean } {
  if (!formula.trim()) return { text: 'Write dice, like 1d20+3 or 1d20+{value}.', bad: false };
  if (!formula.includes('{value}')) { const d = statRollDice(formula, null); return d ? { text: `Always rolls ${d}.`, bad: false } : { text: 'Needs dice, like 1d20+3 or 1d20+{value}.', bad: true }; }
  if (type === 'none' || type === 'checkbox') return { text: 'This stat has no value for {value}. Write the dice out, like 1d20+3.', bad: true };
  const sample = formula.trim() === '{value}' ? '2d8+3' : type === 'number' ? 3 : '3', d = statRollDice(formula, sample);
  return d ? { text: `With ${sample} here: ${d}.`, bad: false } : { text: 'Needs dice, like 1d20+{value}.', bad: true };
}

/** The first roll a field throws for this value (the old single roll), or null. */
export function firstStatRoll(f: RollFields, value: unknown): string | null {
  for (const r of statRolls(f)) { const d = statRollDice(r.formula, value); if (d) return d; }
  return null;
}

/** Puts a new stat after the last one in its group, so groups stay together; at the end for a new group. */
export function placeStat<F extends { section: string }>(fields: F[], field: F): F[] {
  let at = -1; fields.forEach((f, i) => { if (f.section === field.section) at = i; });
  return at < 0 ? [...fields, field] : [...fields.slice(0, at + 1), field, ...fields.slice(at + 1)];
}
