/*
 * Writing a character's HP back to the Google Sheet it was read from, as pure logic: which cell, whether the sheet
 * may be written at all, the exact Sheets API requests, spotting that someone changed the cell in the sheet, and
 * coalescing rapid HP changes into one write. Nothing here touches the network, the page or a token; the browser
 * sends the requests (google-client.ts) with the signed-in person's own in-memory token.
 *
 * Only the current HP cell is ever written. Never Max HP or any other cell, never a published link.
 */
import { cellText, parseCell, type Sheet, type SheetItem, type SheetTab } from "./sheet-link.ts";

export const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
export const HP_MIN = -9999;
export const HP_MAX = 99999;
/** Rapid changes (a run of -1 clicks) become one write this long after the last one. */
export const HP_DEBOUNCE_MS = 1500;
export const PUBLISHED_CANT_WRITE = "Published links can't be written to. Link with Google sign-in to write HP back.";

/** A whole number in range, or null. Strings are accepted when they are plain integers (a typed box). */
export function hpValue(input: unknown): number | null {
  const n = typeof input === "string" ? (/^\s*[+-]?\d{1,6}\s*$/.test(input) ? Number(input) : NaN) : input;
  return typeof n === "number" && Number.isInteger(n) && n >= HP_MIN && n <= HP_MAX ? n : null;
}

export type HpTarget = { ok: true; item: SheetItem; tab: string; a1: string; range: string } | { ok: false; reason: string };
/**
 * The one cell that may be written, or why none: the sheet must be linked with Google sign-in, have an HP item whose
 * cell is a single A1 cell, and its tab must be the one stored with the item or the sheet. Write-back being switched
 * on is checked separately (`requireOptIn`), so the settings screen can ask the same question while it is still off.
 */
export function hpTarget(sheet: Pick<Sheet, "source" | "spreadsheetId" | "tab" | "items" | "writeBack">, requireOptIn = true): HpTarget {
  if (sheet.source !== "google" || !sheet.spreadsheetId) return { ok: false, reason: PUBLISHED_CANT_WRITE };
  if (requireOptIn && sheet.writeBack !== true) return { ok: false, reason: "Write HP back to the sheet is off for this sheet." };
  const item = sheet.items.find(i => i.kind === "hp");
  if (!item) return { ok: false, reason: "This sheet has no HP cell. Use Change cells to pick one." };
  const cell = parseCell(item.cell);
  if (!cell) return { ok: false, reason: "The HP cell isn't a single cell." };
  const tab = cell.tab ?? sheet.tab;
  if (!tab) return { ok: false, reason: "This sheet doesn't say which tab its HP cell is on. Use Change cells to pick it again." };
  const a1 = `${colName(cell.col)}${cell.row}`;
  return { ok: true, item, tab, a1, range: `'${tab.replace(/'/g, "''")}'!${a1}` };
}
const colName = (n: number) => { let out = ""; for (; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + (n - 1) % 26) + out; return out; };

export type SheetRequest = { url: string; method: "GET" | "PUT"; body?: string };
const valuesUrl = (id: string, range: string) => `${SHEETS_API}/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}`;

/**
 * Read the HP cell as it is now (FORMULA rendering, so a formula shows as "=..." and is never overwritten). Throws with
 * a reason when this sheet can't be written.
 */
export function buildHpRead(sheet: Parameters<typeof hpTarget>[0] & { spreadsheetId?: string }): SheetRequest {
  const t = hpTarget(sheet);
  if (!t.ok) throw new Error(t.reason);
  return { url: `${valuesUrl(sheet.spreadsheetId!, t.range)}?valueRenderOption=FORMULA&majorDimension=ROWS`, method: "GET" };
}
/**
 * spreadsheets.values.update for the HP cell only. valueInputOption is RAW: the number is stored exactly as the number
 * it is, never parsed or evaluated by Sheets (USER_ENTERED could turn text into dates or formulas). A cell's number
 * format stays as it is. Throws with a reason when the sheet can't be written or the value isn't a whole number in range.
 */
export function buildHpWrite(sheet: Parameters<typeof hpTarget>[0] & { spreadsheetId?: string }, value: unknown): SheetRequest {
  const t = hpTarget(sheet);
  if (!t.ok) throw new Error(t.reason);
  const n = hpValue(value);
  if (n === null) throw new Error(`HP must be a whole number from ${HP_MIN} to ${HP_MAX}.`);
  return { url: `${valuesUrl(sheet.spreadsheetId!, t.range)}?valueInputOption=RAW`, method: "PUT", body: JSON.stringify({ range: t.range, majorDimension: "ROWS", values: [[n]] }) };
}

/** The text of the cell from a values.get answer ("" when empty). */
export const cellFromAnswer = (body: unknown): string => {
  const v = (body as { values?: unknown[][] } | null)?.values?.[0]?.[0];
  return v === undefined || v === null ? "" : String(v).trim();
};
const asNumber = (s: string) => { const t = s.replace(/,/g, "").trim(); const n = Number(t); return t && Number.isFinite(n) ? n : null; };

export type HpCheck = { kind: "ok" } | { kind: "formula"; theirs: string } | { kind: "changed"; theirs: string };
/**
 * Compares the sheet's HP cell now with what RPG Tools last knew it to be. "formula": the cell holds a formula, which
 * is never overwritten. "changed": someone edited it in the sheet since the last read, so don't overwrite blindly.
 * A cell that already shows the value we are about to write is fine either way.
 */
export function checkHpCell(now: string, known: string | undefined, writing: number): HpCheck {
  const theirs = now.trim();
  if (theirs.startsWith("=")) return { kind: "formula", theirs };
  const was = (known ?? "").trim();
  if (theirs === was || asNumber(theirs) === writing) return { kind: "ok" };
  const a = asNumber(theirs), b = asNumber(was);
  return a !== null && a === b ? { kind: "ok" } : { kind: "changed", theirs };
}

/** The sheet with HP set to a number and the read time moved (the stored copy page and Maptable both show). Nothing else changes. */
export function withHp(sheet: Sheet, value: number, readAt: string): Sheet {
  const n = hpValue(value);
  if (n === null) return sheet;
  let done = false;
  const items = sheet.items.map(i => { if (done || i.kind !== "hp") return i; done = true; return { ...i, value: String(n) }; });
  return { ...sheet, items, readAt };
}
/** The sheet with write-back switched, only ever on for a Google sheet that has an HP cell. */
export function withWriteBack(sheet: Sheet, on: boolean): Sheet {
  if (!on) { const { writeBack: _w, ...rest } = sheet; void _w; return { ...rest, writeBack: false }; }
  return hpTarget(sheet, false).ok ? { ...sheet, writeBack: true } : sheet;
}
/** The HP the stored copy holds, as a number (or null when blank or not a number). */
export const storedHp = (sheet: Pick<Sheet, "items">) => { const v = sheet.items.find(i => i.kind === "hp")?.value; return v === undefined ? null : asNumber(v); };

/** Whether a sheet read (tabs) shows the HP cell's text, for tests and for a refresh that wants to compare. */
export const hpTextIn = (sheet: Sheet, tabs: SheetTab[]) => { const t = hpTarget(sheet, false); return t.ok ? cellText(tabs, t.item.cell, sheet.tab) : undefined; };

type Timers = { set: (f: () => void, ms: number) => unknown; clear: (h: unknown) => void };
/** Many pushes, one run: `run` gets the latest value `wait` ms after the last push. flush() runs it now; cancel() drops it. */
export function coalesce<T>(run: (latest: T) => void, wait = HP_DEBOUNCE_MS, timers: Timers = { set: (f, ms) => setTimeout(f, ms), clear: h => clearTimeout(h as ReturnType<typeof setTimeout>) }) {
  let handle: unknown = null, latest: T | undefined, has = false;
  const fire = () => { handle = null; if (!has) return; const v = latest as T; has = false; latest = undefined; run(v); };
  return {
    push(v: T) { latest = v; has = true; if (handle !== null) timers.clear(handle); handle = timers.set(fire, wait); },
    flush() { if (handle !== null) timers.clear(handle); fire(); },
    cancel() { if (handle !== null) timers.clear(handle); handle = null; has = false; latest = undefined; },
    pending: () => has,
  };
}
