/*
 * Dice in posts, for any game system: [roll]1d20+5[/roll], [roll=Attack]1d20+5[/roll], or [roll=Attack vs 15]…[/roll]
 * for a Hit or Miss against a number. Dice are NdS (up to 50 dice of 2 to 1000 sides) with kh/kl to keep the highest
 * or lowest few (2d20kh1 for advantage), joined by + and - with whole numbers. The server rolls them when the post
 * is written, so nobody can choose their result; the post keeps the dice. Pure apart from the random source.
 */
import { z } from "zod";

export const ROLL_LIMIT = 12;
export const ROLL_TAG = /\[roll(?:=([^\]\n]{0,60}))?\]([^[\]\n]{1,80})\[\/roll\]/gi;

const dieSchema = z.object({ sides: z.number().int().min(2).max(1000), values: z.array(z.number().int().min(1).max(1000)).max(50), keep: z.array(z.boolean()).max(50), sign: z.union([z.literal(1), z.literal(-1)]) });
export const rollSchema = z.object({
  label: z.string().max(60), expr: z.string().max(80), vs: z.number().int().min(-1000000).max(1000000).nullable(),
  dice: z.array(dieSchema).max(10), mod: z.number().int().min(-1000000).max(1000000), total: z.number().int(),
  /** Set when the roll was made by editing the post after it was written. */
  at: z.string().datetime().optional(),
});
export type Roll = z.infer<typeof rollSchema>;
type Term = { kind: "dice"; n: number; sides: number; keep: { high: boolean; count: number } | null; sign: 1 | -1 } | { kind: "num"; value: number; sign: 1 | -1 };

/** Reads a dice expression, or null when it isn't one. */
export function parseDice(expr: string): Term[] | null {
  // Spaces may sit around + and -, never inside a number ("1d20 5" is not 1d205).
  if (/\w\s+\w/.test(expr)) return null;
  const text = expr.replace(/\s+/g, "").toLowerCase();
  if (!text || text.length > 80) return null;
  const terms: Term[] = [];
  const re = /([+-]?)(?:(\d{0,2})d(\d{1,4})(?:k([hl])(\d{1,2}))?|(\d{1,6}))/gy;
  let at = 0, dice = 0;
  while (at < text.length) {
    re.lastIndex = at;
    const m = re.exec(text);
    if (!m || (at > 0 && !m[1])) return null;
    const sign = m[1] === "-" ? -1 : 1;
    if (m[6] !== undefined) terms.push({ kind: "num", value: Number(m[6]), sign });
    else {
      const n = m[2] ? Number(m[2]) : 1, sides = Number(m[3]);
      if (n < 1 || n > 50 || sides < 2 || sides > 1000 || ++dice > 10) return null;
      const keep = m[4] ? { high: m[4] === "h", count: Number(m[5]) } : null;
      if (keep && (keep.count < 1 || keep.count > n)) return null;
      terms.push({ kind: "dice", n, sides, keep, sign });
    }
    at = re.lastIndex;
  }
  return terms.some(t => t.kind === "dice") ? terms : null;
}

/** Rolls one expression. `random` gives a whole number from 1 to `sides`. */
export function roll(label: string, expr: string, random: (sides: number) => number): Roll | null {
  const terms = parseDice(expr);
  if (!terms) return null;
  const vsMatch = /^(.*?)\s+vs\.?\s+(-?\d{1,7})$/i.exec(label.trim());
  const name = (vsMatch ? vsMatch[1]! : label).trim().slice(0, 60), vs = vsMatch ? Number(vsMatch[2]) : null;
  let total = 0, mod = 0;
  const dice: Roll["dice"] = [];
  for (const t of terms) {
    if (t.kind === "num") { mod += t.sign * t.value; total += t.sign * t.value; continue; }
    const values = Array.from({ length: t.n }, () => random(t.sides));
    let keep = values.map(() => true);
    if (t.keep) {
      const order = values.map((v, i) => [v, i] as const).sort((a, b) => t.keep!.high ? b[0] - a[0] : a[0] - b[0]).slice(0, t.keep.count).map(([, i]) => i);
      keep = values.map((_, i) => order.includes(i));
    }
    total += t.sign * values.reduce((s, v, i) => s + (keep[i] ? v : 0), 0);
    dice.push({ sides: t.sides, values, keep, sign: t.sign });
  }
  return { label: name, expr: expr.replace(/\s+/g, ""), vs, dice, mod, total };
}

/** Every roll tag in a post, in order: [label, expression]. Tags inside [dohtml] or [html] aren't rolled: HTML is shown as written. */
export const rollTags = (body: string) => [...body.replace(/\[(dohtml|html)\][\s\S]*?(?:\[\/\1\]|$)/gi, " ").matchAll(ROLL_TAG)].slice(0, ROLL_LIMIT).map(m => ({ label: (m[1] ?? "").trim(), expr: m[2]!.trim() }));

/**
 * The rolls for a post's text, one per tag. When editing, a tag whose label and dice are unchanged keeps its old result (by
 * position); a new or changed tag is rolled now and marked with when.
 */
export function rollPost(body: string, random: (sides: number) => number, old?: readonly (Roll | null)[], now?: Date): (Roll | null)[] {
  // One entry per tag, in order (null for a tag that isn't dice), so the post shows each result in its place.
  return rollTags(body).map(({ label, expr }, i) => {
    const prev = old?.[i];
    if (prev && prev.expr === expr.replace(/\s+/g, "") && sameLabel(prev, label)) return prev;
    const r = roll(label, expr, random);
    return r && old && now ? { ...r, at: now.toISOString() } : r;
  });
}
const sameLabel = (r: Roll, label: string) => (r.vs === null ? r.label : `${r.label} vs ${r.vs}`).toLowerCase() === label.replace(/\s+vs\.?\s+/i, " vs ").trim().toLowerCase();

/** A fair whole number from 1 to `sides`, from the platform's secure random source. */
export function secureDie(sides: number) {
  const limit = Math.floor(0x100000000 / sides) * sides, buf = new Uint32Array(1);
  for (;;) { crypto.getRandomValues(buf); if (buf[0]! < limit) return (buf[0]! % sides) + 1; }
}

/** A roll as one line of plain text: "Attack (1d20+5): 17 — 12 + 5, Hit vs 15". */
export function rollLine(r: Roll) {
  const dice = r.dice.map(d => `${d.sign < 0 ? "− " : ""}${d.values.map((v, i) => d.keep[i] ? String(v) : `(${v})`).join(" ")}`).join(" ");
  const mod = r.mod ? ` ${r.mod > 0 ? "+" : "−"} ${Math.abs(r.mod)}` : "";
  const vs = r.vs === null ? "" : `, ${r.total >= r.vs ? "Hit" : "Miss"} vs ${r.vs}`;
  return `🎲 ${r.label || "Roll"} (${r.expr}): ${r.total} — ${dice}${mod}${vs}${r.at ? ", rerolled on edit" : ""}`;
}
/** A post's text with each roll tag swapped for its result, for print, download and anything else outside the forum. */
export function withRollResults(body: string, rolls: readonly (Roll | null)[] | undefined) {
  let n = 0;
  return body.replace(ROLL_TAG, tag => { const r = rolls?.[n++]; return r ? rollLine(r) : tag; });
}
