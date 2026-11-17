import { recordLocalRoll } from "./local-roll-log.ts";

/*
 * Rolls from another table, passed in by the RPG Tools dice link browser extension (integrations/roll20/dice-link).
 * The extension fires `rpgtools:external-roll` on window with the roll as JSON; it goes into this browser's roll log,
 * marked as from Roll20 so the extension doesn't send it back.
 */
export const externalRollEvent = "rpgtools:external-roll";
export type ExternalRoll = { title: string; total: number; formula?: string; detail?: string; who?: string };

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
/** The roll in an event's detail, checked, or null. */
export function readExternalRoll(detail: unknown): ExternalRoll | null {
  let v: unknown = detail;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { return null; } }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>, total = typeof o.total === "number" ? o.total : Number(o.total);
  if (!Number.isFinite(total) || Math.abs(total) > 1e9) return null;
  const roll: ExternalRoll = { title: text(o.title, 120) || "Roll", total };
  const formula = text(o.formula, 200), extra = text(o.detail, 600), who = text(o.who, 80);
  if (formula) roll.formula = formula;
  if (extra) roll.detail = extra;
  if (who) roll.who = who;
  return roll;
}

/** The roll log entry for a Roll20 roll. */
export const externalLogEntry = (r: ExternalRoll) => ({
  label: r.who ? `${r.who} · ${r.title}` : r.title, total: r.total,
  breakdown: [r.formula, r.detail].filter(Boolean).join(" · ") || "Rolled in Roll20",
  outcome: "From Roll20", source: "roll20" as const, ...(r.formula ? { formula: r.formula } : {}),
});

/** Listens for rolls from the extension and records them. Returns the way to stop. */
export function listenForLinkedRolls() {
  const on = (event: Event) => { const roll = readExternalRoll((event as CustomEvent).detail); if (roll) recordLocalRoll(externalLogEntry(roll)); };
  window.addEventListener(externalRollEvent, on);
  return () => window.removeEventListener(externalRollEvent, on);
}

const physicalSides = [4, 6, 8, 10, 12, 20, 100];
/**
 * The dice a Roll20 roll showed, to throw as 3D dice, or null when they can't be read. Roll20's tooltip lists each
 * group's dice in brackets, "(3+5)+2" for 2d6+2; a group counts only when it has as many dice as the formula says
 * and each fits the die. Rolls with unknown dice show the popup alone, so the 3D dice never show a wrong number.
 */
export function linkedRollDice(roll: ExternalRoll): { sides: number; value: number }[] | null {
  if (!roll.formula || !roll.detail) return null;
  const groups = [...roll.formula.toLowerCase().matchAll(/(\d*)d(\d+)/g)].map(m => ({ count: Number(m[1] || 1), sides: Number(m[2]) }));
  const shown = [...roll.detail.matchAll(/\(([^()]*)\)/g)].map(m => (m[1].match(/\d+/g) ?? []).map(Number));
  if (!groups.length || groups.length !== shown.length) return null;
  const dice: { sides: number; value: number }[] = [];
  for (const [i, g] of groups.entries()) {
    const values = shown[i];
    if (!physicalSides.includes(g.sides) || values.length !== g.count) return null;
    for (const value of values) { if (value < 1 || value > g.sides) return null; dice.push({ sides: g.sides, value }); }
  }
  return dice.length && dice.length <= 24 ? dice : null;
}
