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
