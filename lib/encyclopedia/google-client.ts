/*
 * Google sign-in and the file picker, in the browser only. Nothing here reaches our server: the access token lives
 * in this page's memory for its hour, with the single narrow scope drive.file (only files the person picks here).
 * The Google scripts load the first time someone uses the Google option, never with the page.
 * Configure with NEXT_PUBLIC_GOOGLE_CLIENT_ID, NEXT_PUBLIC_GOOGLE_API_KEY and NEXT_PUBLIC_GOOGLE_APP_ID (see docs/ENCYCLOPEDIA.md).
 */
import { GRID_ROWS, clipRows, labelFromRangeName, namedRangeCell, rowsFromValues, type Sheet, type SheetTab } from "./sheet-link.ts";
import { buildHpRead, buildHpWrite, cellFromAnswer } from "./sheet-write.ts";

export const googleConfig = {
  clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? "",
  appId: process.env.NEXT_PUBLIC_GOOGLE_APP_ID ?? "",
};
export const googleConfigured = () => !!(googleConfig.clientId && googleConfig.apiKey && googleConfig.appId);
export const GOOGLE_NOT_SET_UP = "The site owner hasn't set up Google sign-in yet. Use a published link for now.";
const SCOPE = "https://www.googleapis.com/auth/drive.file";
export class GoogleError extends Error { constructor(message: string, readonly status?: number) { super(message); } }

type TokenResponse = { access_token?: string; expires_in?: number | string; error?: string };
type TokenClient = { requestAccessToken: (o?: { prompt?: string }) => void };
type PickerDoc = { id: string; name: string };
type PickerData = { action: string; docs?: PickerDoc[] };
type G = {
  accounts?: { oauth2?: { initTokenClient: (c: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type?: string }) => void }) => TokenClient } };
  picker?: {
    PickerBuilder: new () => PickerBuilder; ViewId: { SPREADSHEETS: string }; Action: { PICKED: string; CANCEL: string };
    DocsView: new (id: string) => { setMode?: (m: unknown) => unknown };
  };
};
type PickerBuilder = {
  addView: (v: unknown) => PickerBuilder; setOAuthToken: (t: string) => PickerBuilder; setDeveloperKey: (k: string) => PickerBuilder;
  setAppId: (id: string) => PickerBuilder; setCallback: (f: (d: PickerData) => void) => PickerBuilder; build: () => { setVisible: (v: boolean) => void };
};
type Win = { google?: G; gapi?: { load: (name: string, o: { callback: () => void; onerror: () => void; timeout: number; ontimeout: () => void }) => void } };
const win = () => window as unknown as Win;

const loading = new Map<string, Promise<void>>();
/** Adds one script once. Only these two Google addresses are ever loaded. */
function script(src: "https://accounts.google.com/gsi/client" | "https://apis.google.com/js/api.js"): Promise<void> {
  let p = loading.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src; el.async = true;
      el.onload = () => resolve();
      el.onerror = () => { loading.delete(src); el.remove(); reject(new GoogleError("Couldn't load Google sign-in. Check your connection or an ad blocker, and try again.")); };
      document.head.appendChild(el);
    });
    loading.set(src, p);
  }
  return p;
}

let token: { value: string; until: number } | null = null;
/** The access token for this page, asking Google (a pop-up) when there is none or it is about to end. Call from a click. */
export async function googleToken(prompt: "" | "consent" = ""): Promise<string> {
  if (!googleConfigured()) throw new GoogleError(GOOGLE_NOT_SET_UP);
  if (token && token.until > Date.now() + 60_000 && !prompt) return token.value;
  // With the script already loaded (see preloadGoogle) nothing is awaited before requestAccessToken, so the pop-up
  // opens synchronously from the click, which Safari requires.
  if (!win().google?.accounts?.oauth2) await script("https://accounts.google.com/gsi/client");
  const oauth = win().google?.accounts?.oauth2;
  if (!oauth) throw new GoogleError("Google sign-in didn't start. Try again.");
  return new Promise<string>((resolve, reject) => {
    const client = oauth.initTokenClient({
      client_id: googleConfig.clientId, scope: SCOPE,
      callback: r => {
        if (!r.access_token) return reject(new GoogleError(r.error === "access_denied" ? "Google sign-in was cancelled." : "Google didn't sign you in. Try again."));
        token = { value: r.access_token, until: Date.now() + Number(r.expires_in ?? 3000) * 1000 };
        resolve(r.access_token);
      },
      error_callback: e => reject(new GoogleError(e.type === "popup_closed" ? "Google sign-in was cancelled." : "Google sign-in was blocked. Allow pop-ups for this site and try again.")),
    });
    client.requestAccessToken({ prompt });
  });
}
/** Loads both Google scripts ahead of the first click. Harmless when Google isn't set up (it then loads nothing). */
export async function preloadGoogle(): Promise<void> {
  if (!googleConfigured()) return;
  await Promise.all([script("https://accounts.google.com/gsi/client"), script("https://apis.google.com/js/api.js")]);
}
export const forgetGoogleToken = () => { token = null; };
/** Whether this page already holds a live token. Never opens a pop-up, so it is safe to ask while playing. */
export const hasGoogleToken = () => !!token && token.until > Date.now() + 60_000;
/** The live token, or null. Never opens a pop-up. */
export const currentGoogleToken = () => hasGoogleToken() ? token!.value : null;

/** Google's own file picker, limited to spreadsheets. Resolves to the chosen sheet, or null when closed. */
export async function pickSpreadsheet(accessToken: string): Promise<{ id: string; name: string } | null> {
  await script("https://apis.google.com/js/api.js");
  await new Promise<void>((resolve, reject) => {
    const g = win().gapi, failed = () => reject(new GoogleError("Google's file picker didn't load. Check your connection or an ad blocker, and try again."));
    if (!g) return failed();
    g.load("picker", { callback: () => resolve(), onerror: failed, timeout: 10_000, ontimeout: failed });
  });
  const picker = win().google?.picker;
  if (!picker) throw new GoogleError("Google's file picker didn't load.");
  return new Promise(resolve => {
    new picker.PickerBuilder().addView(new picker.DocsView(picker.ViewId.SPREADSHEETS)).setOAuthToken(accessToken).setDeveloperKey(googleConfig.apiKey).setAppId(googleConfig.appId)
      .setCallback(d => {
        if (d.action === picker.Action.PICKED && d.docs?.[0]) resolve({ id: d.docs[0].id, name: d.docs[0].name });
        else if (d.action === picker.Action.CANCEL) resolve(null);
      }).build().setVisible(true);
  });
}

const API = "https://sheets.googleapis.com/v4/spreadsheets";
async function call(url: string, accessToken: string): Promise<unknown> {
  let res: Response;
  try { res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }); }
  catch { throw new GoogleError("Couldn't reach Google Sheets. Try again in a moment."); }
  if (res.status === 401) { forgetGoogleToken(); throw new GoogleError("Your Google sign-in ended. Sign in again.", 401); }
  if (res.status === 403 || res.status === 404) throw new GoogleError("RPG Tools can't open that sheet with this sign-in. Choose it again with Sign in with Google.", res.status);
  if (!res.ok) throw new GoogleError(`Google Sheets answered with an error (${res.status}).`, res.status);
  return res.json();
}
const quote = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

export type GoogleSheetInfo = { title: string; tabs: { name: string; sheetId: number }[]; named: { name: string; label: string; cell: string }[] };
/** The sheet's title, its tab names, and its single-cell named ranges. */
export async function readSheetInfo(id: string, accessToken: string): Promise<GoogleSheetInfo> {
  const fields = "properties.title,sheets.properties(title,sheetId),namedRanges(name,range)";
  const body = await call(`${API}/${encodeURIComponent(id)}?fields=${encodeURIComponent(fields)}`, accessToken) as {
    properties?: { title?: string }; sheets?: { properties?: { title?: string; sheetId?: number } }[];
    namedRanges?: { name?: string; range?: Parameters<typeof namedRangeCell>[0] }[];
  };
  const tabs = (body.sheets ?? []).flatMap(s => s.properties?.title ? [{ name: s.properties.title, sheetId: s.properties.sheetId ?? 0 }] : []);
  const titleOf = (sid: number) => tabs.find(t => t.sheetId === sid)?.name;
  const named = (body.namedRanges ?? []).flatMap(n => { const cell = n.name && n.range ? namedRangeCell(n.range, titleOf) : null; return cell ? [{ name: n.name!, label: labelFromRangeName(n.name!), cell }] : []; });
  return { title: (body.properties?.title || "Google Sheet").slice(0, 200), tabs, named };
}

/** Whole-tab grids (for picking cells), or just the ranges asked for. Values come back as the sheet shows them. */
export async function readTabs(id: string, accessToken: string, ranges: { name: string; range: string }[]): Promise<SheetTab[]> {
  if (!ranges.length) return [];
  const q = ranges.map(r => `ranges=${encodeURIComponent(`${quote(r.name)}!${r.range}`)}`).join("&");
  const body = await call(`${API}/${encodeURIComponent(id)}/values:batchGet?${q}&valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`, accessToken) as { valueRanges?: { values?: unknown }[] };
  return ranges.map((r, i) => ({ name: r.name, rows: clipRows(rowsFromValues(body.valueRanges?.[i]?.values)) }));
}
export const GRID_RANGE = `A1:Z${GRID_ROWS}`;

type Writable = Pick<Sheet, "source" | "spreadsheetId" | "tab" | "items" | "writeBack">;
async function writeCall(req: { url: string; method: "GET" | "PUT"; body?: string }, accessToken: string): Promise<unknown> {
  let res: Response;
  try { res = await fetch(req.url, { method: req.method, headers: { Authorization: `Bearer ${accessToken}`, ...(req.body ? { "Content-Type": "application/json" } : {}) }, ...(req.body ? { body: req.body } : {}) }); }
  catch { throw new GoogleError("Couldn't reach Google Sheets. Try again in a moment."); }
  if (res.status === 401) { forgetGoogleToken(); throw new GoogleError("Your Google sign-in ended. Sign in again.", 401); }
  if (res.status === 403 || res.status === 404) throw new GoogleError("Google won't let RPG Tools write to that sheet with this sign-in. Sign in with the Google account you picked the sheet with, and make sure the Google Sheets API is on for this site.", res.status);
  if (res.status === 400) throw new GoogleError("Google didn't accept that cell. Use Change cells to pick the HP cell again.", 400);
  if (res.status === 429) throw new GoogleError("Google asked RPG Tools to slow down. Try again in a minute.", 429);
  if (!res.ok) throw new GoogleError(`Google Sheets answered with an error (${res.status}).`, res.status);
  return res.json();
}
/** The HP cell as it is in the sheet now (a formula shows as "=..."). Browser only, with the person's own token. */
export async function readHpCell(sheet: Writable, accessToken: string): Promise<string> {
  return cellFromAnswer(await writeCall(buildHpRead(sheet), accessToken));
}
/** Writes the HP number into the sheet's HP cell, and nothing else. */
export async function writeHpCell(sheet: Writable, value: number, accessToken: string): Promise<void> {
  await writeCall(buildHpWrite(sheet, value), accessToken);
}
