/*
 * Reads a Google Sheet that was published to the web (File, Share, Publish to the web), on the server, so the
 * browser never has to talk to Google for it. Only docs.google.com is fetched, and redirects are followed only on that
 * host or to the googleusercontent.com host Google serves published CSV from; a private sheet is reported as such, replies are capped, and nothing is sent but the request for the page.
 * The tab names and the sheet's title come from the published page when it lists them; each tab is read as CSV.
 */
import { clipRows, parseCsv, publishedLink, type SheetTab } from "./sheet-link.ts";

export class SheetReadError extends Error {}
type Fetch = typeof fetch;
export const SHEET_BYTE_LIMIT = 2_000_000;
/** Each request gets 15 s; the whole read (page, tabs and redirects together) gets one shared deadline. */
const TIMEOUT = 15_000, DEADLINE = 25_000, MAX_TABS = 12, HOP_LIMIT = 4;
const HOST = "docs.google.com";
/** Google answers a published CSV with a redirect to a host such as doc-04-9s-sheets.googleusercontent.com. */
const CSV_HOST = /^doc-[a-z0-9-]{1,40}-sheets\.googleusercontent\.com$/;
const allowedHost = (host: string) => host === HOST || CSV_HOST.test(host);
const ask = "In Google Sheets choose File, Share, Publish to the web, pick the tab and Comma-separated values (.csv), and paste that link.";

async function get(url: string, fetchImpl: Fetch, deadline: AbortSignal): Promise<Response> {
  for (let hop = 0; hop < HOP_LIMIT; hop++) {
    let res: Response;
    try { res = await fetchImpl(url, { redirect: "manual", headers: { Accept: "text/csv, text/html;q=0.8, */*;q=0.5" }, signal: AbortSignal.any([AbortSignal.timeout(TIMEOUT), deadline]) }); }
    catch { throw new SheetReadError(deadline.aborted ? "Reading that sheet took too long. Publish fewer tabs, or try again." : "Couldn't reach Google Sheets. Try again in a moment."); }
    if (res.status < 300 || res.status >= 400) return res;
    const next = res.headers.get("location");
    if (!next) return res;
    let to: URL;
    try { to = new URL(next, url); } catch { throw new SheetReadError("Google Sheets sent an odd reply. Try again in a moment."); }
    if (to.hostname === "accounts.google.com") throw new SheetReadError(`That sheet isn't published. ${ask}`);
    if (to.protocol !== "https:" || to.port !== "" || !allowedHost(to.hostname.toLowerCase())) throw new SheetReadError("That link went somewhere RPG Tools doesn't read.");
    url = to.toString();
  }
  throw new SheetReadError("That link redirected too many times.");
}

/** The reply's text, refusing anything over the limit (counted as it arrives, not trusted from a header). */
async function capped(res: Response, room: { left: number }): Promise<string> {
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > room.left) throw new SheetReadError("That sheet is too big (over 2 MB). Publish only the tab with the character.");
  if (!res.body) return "";
  const reader = res.body.getReader(), decoder = new TextDecoder();
  let text = "";
  for (;;) {
    let step: ReadableStreamReadResult<Uint8Array>;
    try { step = await reader.read(); } catch { throw new SheetReadError("Reading that sheet took too long. Publish fewer tabs, or try again."); }
    const { done, value } = step;
    if (done) break;
    room.left -= value.byteLength;
    if (room.left < 0) { await reader.cancel().catch(() => {}); throw new SheetReadError("That sheet is too big (over 2 MB). Publish only the tab with the character."); }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

const code = (n: number) => Number.isInteger(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "";
const decode = (s: string) => s.replace(/&#x([0-9a-f]{1,6});/gi, (_, h) => code(parseInt(h, 16))).replace(/&#(\d{1,7});/g, (_, d) => code(Number(d)))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
/** The title and tabs a published page lists. Best effort: the page's markup is Google's, so an empty list is fine. */
export function pagedTabs(html: string): { title?: string; tabs: { name: string; gid: string }[] } {
  const title = decode(/<title[^>]*>([^<]{1,300})<\/title>/i.exec(html)?.[1] ?? "").replace(/\s+-\s+(Google (Drive|Sheets|Docs))$/i, "").trim() || undefined;
  const tabs: { name: string; gid: string }[] = [];
  const add = (name: string, gid: string) => { if (name && /^\d{1,12}$/.test(gid) && !tabs.some(t => t.gid === gid)) tabs.push({ name: decode(name).slice(0, 100), gid }); };
  for (const m of html.matchAll(/id="sheet-button-(\d{1,12})"[^>]*>\s*<a[^>]*>([^<]{1,200})<\/a>/gi)) add(m[2], m[1]);
  if (!tabs.length) for (const m of html.matchAll(/name:\s*"((?:[^"\\]|\\.){1,200})"[^{}]{0,300}?gid:\s*"(\d{1,12})"/g)) add(m[1].replace(/\\(.)/g, "$1"), m[2]);
  return { title, tabs: tabs.slice(0, MAX_TABS) };
}

/** What a published link holds: its title and its tabs as rows of text. */
export async function readPublishedSheet(link: string, fetchImpl: Fetch = fetch, deadlineMs = DEADLINE): Promise<{ title: string; url: string; tabs: SheetTab[] }> {
  const parsed = publishedLink(link);
  if (!parsed.ok) throw new SheetReadError(parsed.error);
  const base = `https://${HOST}/spreadsheets/d/e/${parsed.id}`, room = { left: SHEET_BYTE_LIMIT }, deadline = AbortSignal.timeout(deadlineMs);
  // The page lists the tabs. If it can't be read, the link's own tab (or the first) is still read.
  let page: ReturnType<typeof pagedTabs> = { tabs: [] };
  try { const res = await get(`${base}/pubhtml`, fetchImpl, deadline); if (res.ok) page = pagedTabs(await capped(res, room)); } catch (e) { if (e instanceof SheetReadError && /too big|redirected|too long/.test(e.message)) throw e; }
  const wanted = parsed.gid ? [page.tabs.find(t => t.gid === parsed.gid) ?? { name: "Sheet", gid: parsed.gid }] : page.tabs.length ? page.tabs : [{ name: "Sheet1", gid: "" }];
  // A link to one tab reads that tab; a link to the whole document reads every tab it lists.
  const tabs: SheetTab[] = [];
  for (const t of wanted) {
    const res = await get(`${base}/pub?output=csv${t.gid ? `&gid=${t.gid}` : ""}&single=true`, fetchImpl, deadline);
    if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) throw new SheetReadError(`That sheet isn't published, or the link is wrong. ${ask}`);
    if (!res.ok) throw new SheetReadError(`Google Sheets answered with an error (${res.status}). Try again in a moment.`);
    const type = res.headers.get("content-type") ?? "";
    if (/text\/html/i.test(type)) throw new SheetReadError(`Google sent a web page, not the sheet. ${ask}`);
    tabs.push({ name: t.name, ...(t.gid ? { gid: t.gid } : {}), rows: clipRows(parseCsv(await capped(res, room))) });
  }
  return { title: (page.title ?? "Published sheet").slice(0, 200), url: parsed.url, tabs };
}
