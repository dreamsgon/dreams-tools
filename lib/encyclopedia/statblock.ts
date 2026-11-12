import { rollTarget } from './inline.ts';
import type { StatField } from './world-model.ts';

/** A piece of a statblock line: plain text, or a roll with the text it came from. */
export type Segment = { text: string; formula?: string; context?: string };

const DICE = String.raw`\d{0,3}d\d{1,4}(?:\s*[+\-−–]\s*\d{1,5})?`;
// [[...]] rolls, dice like 2d8 + 3, "+5 to hit", and signed modifiers like "Stealth +6" or "(+3)".
const FIND = new RegExp(String.raw`\[\[[^\]\n]+\]\]|\b${DICE}\b|[+\-−–]\d{1,2}(?:\s+to\s+hit)?(?![\d%]|\s*(?:ft|feet|mile|lb|gp|sp|cp)\b)`, 'gi');

const clean = (s: string) => s.replace(/[−–]/g, '-').replace(/\s+/g, '');
/** Where a roll on this line comes from, for the result title: "Morningstar" or "Stealth". */
function contextFor(line: string, at: number) {
  const named = line.match(/^\s*([A-Z][^.:\n]{1,40})[.:]\s/);
  if (named && named.index! + named[0].length <= at) return named[1].trim();
  const before = line.slice(0, at).replace(/[\d\s(),:;]+$/, '');
  const words = before.match(/([A-Za-z][A-Za-z' ]{0,30})$/)?.[1].trim().split(/\s+/).slice(-2).join(' ').replace(/^(Skills|Saves|Saving Throws?)\s+/i, '');
  return words || undefined;
}

/** Splits one statblock line into text and rolls. With detect off, only explicit [[...]] rolls count. */
export function statblockSegments(line: string, detect = true): Segment[] {
  const out: Segment[] = [];
  let end = 0;
  for (const m of line.matchAll(FIND)) {
    const raw = m[0], at = m.index!;
    let formula: string | undefined;
    if (raw.startsWith('[[')) formula = rollTarget(raw.slice(2, -2))?.formula;
    else if (!detect) continue;
    else if (/d/i.test(raw)) formula = rollTarget(clean(raw))?.formula;
    else {
      // A lone sign needs a space or "(" before it, so "1-2" or "AC16-2" are left alone.
      const prev = line[at - 1];
      if (prev !== undefined && !/[\s(,]/.test(prev)) continue;
      const n = clean(raw).replace(/to\s*hit/i, '');
      formula = rollTarget(`1d20${n}`)?.formula;
    }
    if (!formula) continue;
    if (at > end) out.push({ text: line.slice(end, at) });
    const shown = raw.startsWith('[[') ? (rollTarget(raw.slice(2, -2))?.label ?? formula) : raw;
    out.push({ text: shown, formula, context: contextFor(line, at) });
    end = at + raw.length;
  }
  if (end < line.length) out.push({ text: line.slice(end) });
  return out;
}

export function statblockRolls(text: string, detect = true) {
  return text.split('\n').flatMap(line => statblockSegments(line, detect)).filter(s => s.formula);
}

/** What a sheet field rolls when clicked, or null. */
export function fieldRoll(field: Pick<StatField, 'type' | 'roll' | 'rollFormula'>, value: unknown): string | null {
  const roll = field.roll ?? 'none';
  if (roll === 'none' || value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  if (roll === 'd20') { const n = Number(value); return Number.isFinite(n) && Number.isInteger(n) && Math.abs(n) <= 1000 ? `1d20${n < 0 ? '' : '+'}${n}` : null; }
  if (roll === 'formula') return rollTarget(String(value))?.formula ?? null;
  const template = field.rollFormula ?? '';
  if (!template.includes('{value}')) return null;
  return rollTarget(template.replaceAll('{value}', String(value)).replace(/\+\s*-/g, '-'))?.formula ?? null;
}
