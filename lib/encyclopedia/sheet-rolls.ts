/*
 * The rolls a linked character sheet offers, without the screen. Built only from what players may see of a sheet
 * (name, kind, cached value, formula), so it never touches the spreadsheet id, link, cells or tab. Used by the
 * character page and by Maptable's token menu.
 */
import { parseDice, isSingleD20 } from "../rolls.ts";
import type { PlayerSheet } from "./sheet-link.ts";

export type SheetRollButton = { label: string; formula: string; /** The name the roll goes by in the log and on Discord, such as "Longbow attack". */ rollName: string };
export type SheetRollRow = { id: string; name: string; buttons: SheetRollButton[] };
export type SheetRollGroup = { title: "Skills" | "Saves" | "Attacks" | "Other"; rows: SheetRollRow[] };

const BONUS = /^([+-])\s*(\d{1,3})$/;
const PAIR = /^(.*\S)\s+(attack|damage)$/i;
const valid = (formula: string) => { try { parseDice(formula); return true; } catch { return false; } };
/** What an item rolls: its formula, or 1d20 plus its value when it is a roll with only a bonus such as +5. Null when it rolls nothing. */
export function itemFormula(item: { kind: string; value?: string; formula?: string }): string | null {
  const f = item.formula?.trim().replace(/\s+/g, "");
  if (f) return valid(f) ? f : null;
  if (item.kind !== "roll") return null;
  const m = BONUS.exec(item.value?.trim() ?? "");
  return m ? `1d20${m[1]}${m[2]}` : null;
}

/**
 * Skills, saves, attacks and other, from the sheet's rolls (and its initiative formula). "Longbow attack" and
 * "Longbow damage" become one row with an Attack and a Damage button. Empty groups are left out.
 */
export function sheetRollGroups(sheet: Pick<PlayerSheet, "items">): SheetRollGroup[] {
  type Entry = { id: string; name: string; formula: string };
  const entries: Entry[] = [];
  for (const i of sheet.items) {
    if (i.kind !== "roll" && i.kind !== "init") continue;
    const formula = itemFormula(i);
    if (formula) entries.push({ id: i.id, name: i.kind === "init" ? i.label || i.name : i.name, formula });
  }
  const groups: Record<SheetRollGroup["title"], SheetRollRow[]> = { Skills: [], Saves: [], Attacks: [], Other: [] };
  const pairs = new Map<string, SheetRollRow>();
  for (const e of entries) {
    const pair = PAIR.exec(e.name);
    if (pair) {
      const key = pair[1].toLowerCase(), part = pair[2].toLowerCase() === "attack" ? "Attack" : "Damage";
      let row = pairs.get(key);
      if (!row) { row = { id: e.id, name: pair[1], buttons: [] }; pairs.set(key, row); groups.Attacks.push(row); }
      if (!row.buttons.some(b => b.label === part)) row.buttons.push({ label: part, formula: e.formula, rollName: e.name });
      continue;
    }
    const row: SheetRollRow = { id: e.id, name: e.name, buttons: [{ label: e.name, formula: e.formula, rollName: e.name }] };
    if (/\bsav(e|es|ing)\b/i.test(e.name)) groups.Saves.push(row);
    else if (/\b(strike|shot)\b/i.test(e.name)) groups.Attacks.push(row);
    else if (isSingleD20(e.formula)) groups.Skills.push(row);
    else groups.Other.push(row);
  }
  for (const row of pairs.values()) row.buttons.sort((a, b) => (a.label === "Attack" ? -1 : 1) - (b.label === "Attack" ? -1 : 1));
  return (["Skills", "Saves", "Attacks", "Other"] as const).map(title => ({ title, rows: groups[title] })).filter(g => g.rows.length);
}
export const sheetHasRolls = (sheet: Pick<PlayerSheet, "items">) => sheetRollGroups(sheet).length > 0;

/** The notations the dice help lists. */
export const DICE_HELP = [
  ["1d20+5", "add up"], ["4d6kh3 / 2d20kl1", "keep high or low"], ["2d6!", "exploding"], ["5d10>=8", "count successes"], ["4dF", "Fate dice"],
] as const;
export const diceHelpText = DICE_HELP.map(([f, what]) => `${f} ${what}`).join(" · ");
