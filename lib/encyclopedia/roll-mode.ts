/*
 * Rolls one formula with the Advantage / Normal / Disadvantage choice and says what happened. No screen and no
 * storage, so the roll card in the browser and the server (a player's roll from their sheet) roll the same way.
 */
import { describeParts, isSingleD20, partText, rollDice, rollTwice, withKeepMode, type RollMode } from "../rolls.ts";

export const MODE_NAMES = { d20: { high: "Advantage", low: "Disadvantage" }, other: { high: "Keep higher", low: "Keep lower" } };

/** What a roll with a mode says, in the order rolled: "Disadvantage: rolled 13 and 5, kept 5, +5" or "Keep higher: rolled 9 and 14". */
function modeDetail(formula: string, mode: "high" | "low", kept: ReturnType<typeof rollDice>, first?: ReturnType<typeof rollDice>, second?: ReturnType<typeof rollDice>) {
  const d20 = isSingleD20(formula), name = MODE_NAMES[d20 ? "d20" : "other"][mode];
  if (d20) { const p = kept.parts[0], rest = kept.parts.slice(1).map(x => `${x.sign < 0 ? "−" : "+"}${x.count ? partText(x) : x.constant}`); return [`${name}: rolled ${(p.rolled ?? p.dice).join(" and ")}`, `kept ${p.dice[0]}`, ...rest].join(", "); }
  return `${name}: rolled ${first?.total} and ${second?.total}`;
}

export type ModeRoll = { formula: string; total: number; detail: string; /** The line the roll log keeps. */ breakdown: string; mode: "high" | "low" | null };
/** Throws what parseDice throws for a formula that isn't dice. */
export function rollWithMode(formula: string, requested: RollMode | undefined, random: () => number = Math.random): ModeRoll {
  const mode = requested && requested !== "normal" ? requested : null;
  let shown = formula, detail: string, total: number;
  if (mode && isSingleD20(formula)) { const r = rollDice(withKeepMode(formula, mode), random); shown = r.formula; total = r.total; detail = modeDetail(formula, mode, r); }
  else if (mode) { const t = rollTwice(formula, mode, random); total = t.kept.total; detail = `${modeDetail(formula, mode, t.kept, t.first, t.second)} · kept ${describeParts(t.kept.parts)}`; }
  else { const r = rollDice(formula, random); total = r.total; detail = describeParts(r.parts); }
  return { formula: shown, total, detail, mode, breakdown: `${shown}${mode && !isSingleD20(formula) ? ` (${MODE_NAMES.other[mode].toLowerCase()})` : ""} · ${detail}` };
}
