/*
 * The roll dialog: before a roll goes ahead, a small dialog (like Foundry's) asks for a situational bonus such as +1d4,
 * Advantage / Normal / Disadvantage, and a note saying what the roll is for. The note goes on the roll's label, so it
 * shows in the roll log, on Discord and in Roll20 (through the dice link). Shift-click skips the dialog; with "Ask before
 * each roll" off, rolls go straight ahead and Shift-click opens it instead. Pages ask with askRoll; the dialog itself is
 * components/roll-dialog.tsx, mounted once on every page. No screen here, so tests can read it.
 */
import { DICE_ERROR, isSingleD20, parseDice, type RollMode } from "./rolls.ts";

export type RollAsk = {
  /** What is rolled, like "Ayla · Stealth". */ title: string;
  /** The dice as the sheet has them, like 1d20+5. */ formula: string;
  /** The mode chosen on the page (the sheet's Advantage buttons), shown selected. */ mode?: RollMode;
  /** True when a formula that isn't a single d20 can roll twice and keep the higher or lower (the Encyclopedia). */ twice?: boolean;
  /** A note to start with, such as the dice tray's roll name. */ note?: string;
};
export type RollChoice = { bonus: string; mode: RollMode; note: string };

export const NOTE_MAX = 80, BONUS_MAX = 40;
const settingKey = "rpg-roll-dialog";

/** "d4", "+1d4", "-2" or "1d4 + 1" as text to add to a formula ("+d4", "-2", "+1d4+1"), or "" for none. */
export function cleanBonus(text: string) {
  const t = text.replace(/[−–]/g, "-").replace(/\s+/g, "");
  if (!t || t === "+" || t === "-") return "";
  return /^[+-]/.test(t) ? t : `+${t}`;
}

/** The formula with the bonus added. Throws, with a message to show, when the bonus isn't dice or a number. */
export function addBonus(formula: string, bonus: string) {
  const b = cleanBonus(bonus);
  if (!b) return formula;
  if (b.length > BONUS_MAX + 1) throw new Error("Keep the bonus short, like +1d4 or -2.");
  try { parseDice(b.replace(/^\+/, "")); } catch { throw new Error("Write the bonus as dice or a number, like +1d4, +2 or -1d6."); }
  const out = formula.replace(/\s+/g, "") + b;
  try { parseDice(out); } catch (e) { throw new Error(e instanceof Error && e.message !== DICE_ERROR ? e.message : "That bonus can’t be added to this roll."); }
  return out;
}

/** A roll's label with its note: "Ayla · Stealth · Sneaking past the guard". */
export const noteLabel = (title: string, note: string) => {
  const n = note.replace(/\s+/g, " ").trim().slice(0, NOTE_MAX);
  return (n ? `${title} · ${n}` : title).slice(0, 120);
};

/** Which choice the dialog offers: Advantage on a single d20, Keep higher / lower when the whole roll can roll twice, else none. */
export function modeNames(formula: string, twice?: boolean): Record<RollMode, string> | null {
  if (isSingleD20(formula)) return { high: "Advantage", normal: "Normal", low: "Disadvantage" };
  return twice ? { high: "Keep higher", normal: "Normal", low: "Keep lower" } : null;
}

/** The choice when the dialog isn't shown: the page's mode, no bonus. */
export const plainChoice = (ask: RollAsk): RollChoice => ({ bonus: "", mode: ask.mode ?? "normal", note: ask.note ?? "" });

/** Whether rolls open the dialog (the default) or go straight ahead. Kept per browser. */
export function asksBeforeRolls() { try { return localStorage.getItem(settingKey) !== "off"; } catch { return true; } }
export function setAsksBeforeRolls(on: boolean) { try { localStorage.setItem(settingKey, on ? "on" : "off"); } catch { /* optional */ } }

/*
 * Shift-click: the click that started a roll is gone by the time the page asks, so the last pointer or key press is kept
 * here. A press more than a second old doesn't count.
 */
let shiftAt = 0;
let listening = false;
export function watchShift() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  const on = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent && e.key === "Shift") return; shiftAt = e.shiftKey ? Date.now() : 0; };
  window.addEventListener("pointerdown", on, true);
  window.addEventListener("click", on, true);
  window.addEventListener("keydown", on, true);
}
/** True when the dialog should show for this roll: asking is on and Shift wasn't held, or asking is off and it was. */
export function wantsDialog(now = Date.now(), asks = asksBeforeRolls(), shift = now - shiftAt < 1000) { return asks !== shift; }

type Pending = { ask: RollAsk; resolve: (choice: RollChoice | null) => void };
let host: ((p: Pending) => void) | null = null;
/** The dialog on the page registers here. Returns the way to stop. */
export function setRollDialogHost(h: (p: Pending) => void) { host = h; return () => { if (host === h) host = null; }; }

/** Asks about a roll before it goes ahead. Null when the person cancelled; their choice otherwise (straight away when skipped). */
export function askRoll(ask: RollAsk): Promise<RollChoice | null> {
  if (!host || !wantsDialog()) return Promise.resolve(plainChoice(ask));
  const h = host;
  return new Promise(resolve => h({ ask, resolve }));
}
