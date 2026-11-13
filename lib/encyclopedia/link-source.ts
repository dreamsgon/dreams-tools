/*
 * Reads a session's notes or transcript from a public link, on the server, so the New session recap dialog can
 * treat it like pasted text: a Google Doc or a text file on Google Drive shared with "Anyone with the link", a
 * file or gist on GitHub, or a Notion page shared to the web. Only these hosts are fetched, redirects are
 * followed only between them, and nothing is sent but the request for the page. A private link fails with a
 * message that says how to share it, or to hand it to the GM's AI app, which reads it with its own access.
 */
import { discordJsonToText } from "./recap-request.ts";
import { TRANSCRIPT_LIMIT } from "./recaps.ts";

export type LinkKind = "notion" | "drive" | "github";
type Fetch = typeof fetch;
export class LinkError extends Error {}

const ALLOWED = /^(docs\.google\.com|drive\.google\.com|drive\.usercontent\.google\.com|raw\.githubusercontent\.com|gist\.githubusercontent\.com|github\.com|gist\.github\.com|www\.notion\.so|notion\.so|[a-z0-9-]+\.notion\.site)$/;
const TIMEOUT = 20_000;
const app = "or hand it to your AI app, which reads it with your own access.";

/** What to fetch for a link the GM pasted. Throws a LinkError the GM can act on. */
export function linkTarget(link: string): { kind: LinkKind; url: string; notionPage?: string } {
  let u: URL;
  try { u = new URL(link.trim()); } catch { throw new LinkError("Paste the whole link, starting with https://."); }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || !ALLOWED.test(host)) throw new LinkError("RPG Tools reads links to Google Docs, Google Drive, GitHub and Notion.");
  const path = u.pathname;
  if (host === "docs.google.com") {
    const doc = /^\/document\/(?:u\/\d+\/)?d\/([\w-]{10,})/.exec(path)?.[1];
    if (!doc) throw new LinkError("Only Google Docs can be read from docs.google.com. For a sheet or slides, copy the text and paste it.");
    return { kind: "drive", url: `https://docs.google.com/document/d/${doc}/export?format=txt` };
  }
  if (host === "drive.google.com") {
    const id = /^\/file\/(?:u\/\d+\/)?d\/([\w-]{10,})/.exec(path)?.[1] ?? (path === "/open" || path === "/uc" ? u.searchParams.get("id") : null);
    if (!id || !/^[\w-]{10,}$/.test(id)) throw new LinkError("Link one file on Google Drive, not a folder.");
    return { kind: "drive", url: `https://drive.google.com/uc?export=download&id=${id}` };
  }
  if (host === "github.com") {
    const m = /^\/([\w.-]+)\/([\w.-]+)\/(blob|tree|raw)\/(.+)$/.exec(path);
    if (m?.[3] === "tree") throw new LinkError("That’s a folder. Link one file in it, such as sessions/session-13.md.");
    if (!m) throw new LinkError("Link one file on GitHub, such as https://github.com/you/campaign/blob/main/sessions/session-13.md.");
    return { kind: "github", url: `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[4]}` };
  }
  if (host === "gist.github.com") {
    const m = /^\/([\w-]+)\/([0-9a-f]{8,})\/?$/.exec(path);
    if (!m) throw new LinkError("Link the gist itself, such as https://gist.github.com/you/1a2b3c….");
    return { kind: "github", url: `https://gist.githubusercontent.com/${m[1]}/${m[2]}/raw` };
  }
  if (host.endsWith("githubusercontent.com")) return { kind: "github", url: u.toString() };
  if (host.startsWith("drive.usercontent")) return { kind: "drive", url: u.toString() };
  // Notion: the page id is the last 32 hex characters of the path, with or without dashes.
  const hex = /([0-9a-f]{32})(?:[^0-9a-f]|$)/i.exec(path.replace(/-/g, ""))?.[1] ?? u.searchParams.get("p")?.replace(/-/g, "");
  if (!hex || !/^[0-9a-f]{32}$/i.test(hex)) throw new LinkError("That Notion link has no page in it. Open the page and copy its link.");
  const id = hex.toLowerCase(), notionPage = `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
  return { kind: "notion", url: "https://www.notion.so/api/v3/loadPageChunk", notionPage };
}

/** Fetches, following redirects only between the allowed hosts. */
async function get(url: string, init: RequestInit, fetchImpl: Fetch) {
  for (let hop = 0; hop < 4; hop++) {
    let res: Response;
    try { res = await fetchImpl(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT) }); }
    catch { throw new LinkError("Couldn’t reach that link. Try again in a moment, " + app); }
    if (res.status < 300 || res.status >= 400) return res;
    const next = res.headers.get("location");
    if (!next) return res;
    const to = new URL(next, url);
    // Google sends a private file to its sign-in page.
    if (to.hostname === "accounts.google.com") throw new LinkError("That file isn’t shared publicly. Share it as “Anyone with the link”, " + app);
    if (to.protocol !== "https:" || !ALLOWED.test(to.hostname)) throw new LinkError("That link went somewhere RPG Tools doesn’t read. Copy the text and paste it, " + app);
    url = to.toString();
  }
  throw new LinkError("That link redirected too many times. Copy the text and paste it, " + app);
}

async function text(res: Response) {
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > TRANSCRIPT_LIMIT * 4) throw new LinkError("That file is too big. Split the session, or paste the part you need.");
  const body = await res.text();
  if (body.length > TRANSCRIPT_LIMIT) throw new LinkError("That’s over 2,000,000 characters. Split the session into two recaps.");
  return body;
}

// ---- Notion ------------------------------------------------------------------------------------

type Rich = [string, unknown?][];
type NotionBlock = { id?: string; type?: string; properties?: { title?: Rich; checked?: [[string]] }; content?: string[]; alive?: boolean };
type NotionRecord = { value?: NotionBlock & { value?: NotionBlock } };
const plain = (r?: Rich) => (r ?? []).map(x => typeof x?.[0] === "string" ? x[0] : "").join("");
const prefix: Record<string, string> = { header: "# ", sub_header: "## ", sub_sub_header: "### ", bulleted_list: "- ", numbered_list: "1. ", quote: "> ", callout: "> ", toggle: "- " };

/** A Notion page's text in reading order, from the blocks Notion sends for a page shared to the web. */
export function notionText(pageId: string, blocks: Record<string, NotionRecord>) {
  const block = (id: string) => { const r = blocks[id]?.value; return (r?.value ?? r) as NotionBlock | undefined; };
  const lines: string[] = [], seen = new Set<string>();
  const walk = (id: string, depth: number) => {
    if (seen.has(id) || lines.length > 20_000) return;
    seen.add(id);
    const b = block(id);
    if (!b || b.alive === false) return;
    const words = plain(b.properties?.title);
    if (b.type === "page" && depth > 0) { if (words) lines.push(`${"  ".repeat(depth - 1)}- ${words}`); return; } // A sub-page: its title only.
    if (depth > 0 && b.type !== "divider") {
      const mark = b.type === "to_do" ? (b.properties?.checked?.[0]?.[0] === "Yes" ? "- [x] " : "- [ ] ") : prefix[b.type ?? ""] ?? "";
      if (words || mark) lines.push(`${"  ".repeat(Math.max(0, depth - 1))}${mark}${words}`.trimEnd());
    }
    for (const c of b.content ?? []) walk(c, depth + 1);
  };
  walk(pageId, 0);
  return { title: plain(block(pageId)?.properties?.title) || undefined, text: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() };
}

async function readNotion(pageId: string, fetchImpl: Fetch) {
  const blocks: Record<string, NotionRecord> = {};
  let cursor: unknown = { stack: [] };
  for (let chunk = 0; chunk < 20; chunk++) {
    const res = await get("https://www.notion.so/api/v3/loadPageChunk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageId, limit: 100, cursor, chunkNumber: chunk, verticalColumns: false }) }, fetchImpl);
    if (!res.ok) throw new LinkError("Notion didn’t share that page. Turn on Share › Publish to the web for it, " + app);
    const body = await res.json().catch(() => null) as { recordMap?: { block?: Record<string, NotionRecord> }; cursor?: { stack?: unknown[] } } | null;
    Object.assign(blocks, body?.recordMap?.block ?? {});
    if (!body?.cursor?.stack?.length) break;
    cursor = body.cursor;
  }
  const page = notionText(pageId, blocks);
  if (!blocks[pageId] || !page.text) throw new LinkError("Notion didn’t share that page, or it’s empty. Turn on Share › Publish to the web for it, " + app);
  return page;
}

// ---- Any link ----------------------------------------------------------------------------------

/** The text behind a public link, ready to use as a session's transcript. */
export async function readLink(link: string, fetchImpl: Fetch = fetch): Promise<{ kind: LinkKind; text: string; title?: string }> {
  const t = linkTarget(link);
  if (t.notionPage) return { kind: "notion", ...await readNotion(t.notionPage, fetchImpl) };
  const res = await get(t.url, { headers: { Accept: "text/plain, text/markdown, application/json;q=0.9, */*;q=0.5" } }, fetchImpl);
  if (res.status === 404 || res.status === 403 || res.status === 401) throw new LinkError(t.kind === "github" ? "GitHub says that file isn’t there, or it’s private. Check the link, " + app : "That file isn’t shared publicly. Share it as “Anyone with the link”, " + app);
  if (!res.ok) throw new LinkError(`That link answered with an error (${res.status}). Try again in a moment, ` + app);
  const type = res.headers.get("content-type") ?? "";
  if (/text\/html/i.test(type)) throw new LinkError(t.kind === "drive" ? "Google sent a web page instead of the file, so it isn’t shared publicly or isn’t a text file. Share it as “Anyone with the link”, " + app : "That link is a web page, not a file. Link the file itself, " + app);
  if (!/^(text\/|application\/(json|octet-stream|x-ndjson))/i.test(type) && type) throw new LinkError("That file isn’t text. Link a Google Doc, or a .txt, .md or Discord .json file.");
  const raw = (await text(res)).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const body = (/json/i.test(type) || /^\s*\{/.test(raw) ? discordJsonToText(raw) : null) ?? raw;
  if (!body.trim()) throw new LinkError("That file has no text in it.");
  return { kind: t.kind, text: body };
}
