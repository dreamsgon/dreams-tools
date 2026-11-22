/*
 * Bring an AI GM's edits to an RP repository back into the campaign they were exported from. Pure: files in, a plan out, and a
 * function that applies the picked rows to a workspace. Nothing is saved here.
 *
 * What counts as a change. A file is changed when its SHA-256 differs from what .rpg-tools/files.json recorded at the last push;
 * it is new when it is a layout Markdown file the map does not know; it is removed when the map knows it and the repository does
 * not (listed only, a page is never deleted). Files RPG Tools makes from its data (READMEs, AGENTS.md, .rpg-tools/, the export log)
 * are never brought back.
 *
 * How a changed file is turned back into page fields. A page file is: front matter, "# Title", the overview text, then "## "
 * sections (the page's tabs, and sections written from data such as Details or Stats). The overview and the tab sections are
 * free text and are taken back exactly as written; the sections written from data are left as they are. The app's own current
 * export of the same file is the guide: a section is only changed when it differs from it. Every plan is checked by applying it
 * and exporting again: a file whose text does not come out of the export the same cannot be inverted safely, so its text is added
 * as a new GM-only tab instead of guessing. A file in 6-GM-Only/ only ever reaches the GM part of its page.
 */
import { DEFAULT_PART_LIMIT, sizeProblem } from "./wiki-parts.ts";
import { putWorkspace, workspaceBody } from "./workspace-client.ts";
import { rpExportFiles, isRewrittenPath, textHash, headingLabel, sameApartFromFrontMatter, withoutFrontMatter, DERIVED_SECTIONS, WHERE_WIDGET, FOLDERS_LIST } from "./rp-export.ts";
import { defaultCharacter, newId as randomId, playerText, workspaceSchema, type Entry, type Workspace } from "./world-model.ts";
import { defaultFrontPage } from "./front-page.ts";
import { newQuest } from "./quests.ts";
import { decodeText, previewRepo, rewriteLinks, type PlannedPage, type RepoFile, type Source } from "./rp-import.ts";
import { exportedAt, shortDate } from "./rp-sheet.ts";
import { snapshotOf, type Snapshot } from "./history.ts";

/* ---- .rpg-tools/files.json ---- */
export type FilesMap = { campaignId: string; includeGm: boolean; pages: Record<string, string>; hashes: Record<string, string>; gitBlobs: Record<string, string> };
const strings = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (typeof x === "string") out[k] = x;
  return out;
};
/** The file map of an export, or null when the text is not one. */
export function parseFilesMap(text: string): FilesMap | null {
  try {
    const v = JSON.parse(text.replace(/^﻿/, "")) as Record<string, unknown>;
    if (!v || typeof v !== "object" || v.format !== "rpg-tools-files" || typeof v.campaignId !== "string") return null;
    return { campaignId: v.campaignId, includeGm: v.includeGm === true, pages: strings(v.pages), hashes: strings(v.hashes), gitBlobs: strings(v.gitBlobs) };
  } catch { return null; }
}

/** "Bring back changes" is offered only for an export that came from this campaign. A restored copy gets new ids, so it never matches. */
export const isThisCampaign = (map: FilesMap | null, campaignId: string) => !!map && map.campaignId === campaignId;

/* ---- which files are looked at ---- */
/** Files the app writes from its data. Bring-back never reads them. */
export const isRebuilt = (path: string) => isRewrittenPath(path) || path === "5-Rules-and-Setup/Save-Procedure.md" || path.includes("/Random-Tables/");
const isMd = (path: string) => /\.md$/i.test(path);
const inLibrary = (path: string) => path.startsWith("7-Library/") || path.startsWith("8-Archive/");
/** A layout Markdown file bring-back may read. */
export const isCandidate = (path: string) => isMd(path) && FOLDERS_LIST.includes(path.split("/")[0]) && path.includes("/") && !inLibrary(path) && !isRebuilt(path) && !path.split("/").some(p => p.startsWith("."));
const MAX_FILE_CHARS = 100_000;

/* ---- reading a file ---- */
type Front = { id: string | null; rest: string };
function readFront(raw: string): Front {
  const text = raw.replace(/^﻿/, ""), fm = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text);
  if (!fm || (fm[1] !== undefined && !/^\s*(?:#.*\r?\n\s*)*[\w.-]+[ \t]*:/.test(fm[1]))) return { id: null, rest: text };
  const id = /^rpg-tools-id:[ \t]*["']?([A-Za-z0-9_-]{1,100})["']?[ \t]*\r?$/m.exec(fm[1] ?? "")?.[1] ?? null;
  return { id, rest: text.slice(fm[0].length) };
}
/** A file that uses Windows line endings throughout. */
const isCrlf = (text: string) => /\r\n/.test(text) && !/(?<!\r)\n/.test(text);
const lf = (text: string) => text.replace(/\r\n/g, "\n");
/** An exported file without its front matter, with plain line endings. */
const exported = (text: string) => lf(readFront(text).rest);

type Sections = { h1: string | null; intro: string; sections: { heading: string; text: string }[] };
/** Splits a page file (front matter already off) at the "## " headings in `known`. Headings inside code fences are text. Every part is trimmed, as the export trims it. */
function parseSections(text: string, known: ReadonlySet<string>): Sections {
  const lines = text.split("\n");
  let i = 0, h1: string | null = null, fence: string | null = null;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length && /^#[ \t]+\S/.test(lines[i])) { h1 = lines[i].replace(/^#[ \t]+/, "").replace(/\r$/, "").trim(); i++; }
  const intro: string[] = [], secs: { heading: string; lines: string[] }[] = [];
  for (; i < lines.length; i++) {
    const line = lines[i], f = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line.replace(/\r$/, ""));
    if (f) { if (!fence) fence = f[1]; else if (f[1][0] === fence[0] && f[1].length >= fence.length && !f[2].trim()) fence = null; }
    const m = fence ? null : /^## (.+?)[ \t\r]*$/.exec(line);
    if (m && known.has(m[1])) { secs.push({ heading: m[1], lines: [] }); continue; }
    (secs.length ? secs[secs.length - 1].lines : intro).push(line);
  }
  return { h1, intro: intro.join("\n").trim(), sections: secs.map(s => ({ heading: s.heading, text: s.lines.join("\n").trim() })) };
}
/** Everything under the title, as one text: what a new tab holds. */
function contentOf(raw: string): string { return parseSections(readFront(raw).rest.replace(/^﻿/, ""), new Set()).intro; }

/* ---- edits, rows, plans ---- */
export type Choice = "app" | "repo" | "both";
export type Edit =
  | { op: "body"; id: string; text: string }
  | { op: "tab"; id: string; tabId: string; text: string }
  | { op: "newtab"; id: string; title: string; text: string }
  | { op: "where"; text: string }
  | { op: "newnote"; title: string; text: string }
  | { op: "trackers"; id: string; items: { label: string; value: number; max: number }[] }
  | { op: "stats"; id: string; items: { fieldId: string; value: string | number }[] }
  | { op: "page"; id: string; page: PlannedPage };
export type Row = {
  key: string;
  path: string;
  tag: "New" | "Edit" | "Both";
  /** What it maps to, for example "Mara · Overview". */
  maps: string;
  /** A short extra line: why it is not matched, what was left as it is. */
  note?: string;
  /** False when the file could not be inverted exactly and its text goes to a new tab. */
  matched: boolean;
  /** What "Take repo's" (or an ordinary edit or new file) does. */
  edits: Edit[];
  /** What "Keep both" does: the repo text as a new tab or note. */
  both: Edit[];
  /** The pages whose text these edits replace (their earlier version is kept). */
  overwrites: string[];
  /** Set when this row cannot be brought back (for example the text is too long for a page). */
  blocked?: string;
};
export type BringBackPlan = {
  campaignId: string;
  /** When the repository was last pushed (from its export log), if it says. */
  since: string | null;
  rows: Row[];
  /** Files the app knew that the repository no longer has. Their pages are kept. */
  removed: string[];
  /** Files the app rebuilds from its data. */
  rebuilt: string[];
  /** Changed files that have no page to go to, or are not text. They stay in the repository. */
  kept: { path: string; reason: string }[];
  /** Changed files whose text is already in the app. */
  already: string[];
  /** Files that were not read. */
  skipped: string[];
};
export const changeCount = (plan: BringBackPlan) => plan.rows.length;
export const choicesFor = (row: Row): Choice[] => row.tag !== "Both" ? ["repo"] : row.matched ? ["app", "repo", "both"] : ["app", "both"];
export const defaultChoice = (row: Row): Choice => (row.tag === "Both" ? "both" : "repo");

const MAX_TABS = 30;
const draftOf = (e: Entry) => e.recap?.status === "draft";
const stable = (text: string) => playerText(text).trim() === text.trim();

const DERIVED_PAGE = DERIVED_SECTIONS;
const CURRENT = ["Date", "Party", "Most recent session", "Next session starting point"];
const SHEET = ["Stats", "Trackers", "Played changes"];

type Ctx = {
  ws: Workspace; campaignId: string; map: FilesMap; byId: Map<string, Entry>; current: Map<string, string>; now: string; mint: () => string;
  /** Page files of the last export (path to page id) whose pages still exist: the targets of relative links. */
  linkable: Map<string, string>;
};
const gmPath = (p: string) => p.startsWith("6-GM-Only/");

/** The headings an export can write into a page file on one side, so the split matches the export's own. */
function knownFor(e: Entry, side: "public" | "gm"): { known: Set<string>; tabs: Map<string, string[]>; labels: string[] } {
  const draft = draftOf(e), tabs = new Map<string, string[]>(), labels: string[] = [], known = new Set(DERIVED_PAGE);
  for (const t of e.tabs ?? []) {
    const pub = t.visibility === "players" && !draft, l = headingLabel(t.title);
    labels.push(`${pub ? "p" : "g"}:${l}`);
    if (side === "gm" && pub) { known.add(`${l} (secret lines)`); continue; }
    if ((side === "public") !== pub) continue;
    known.add(l); tabs.set(l, [...(tabs.get(l) ?? []), t.id]);
  }
  return { known, tabs, labels };
}

type Analysis = { edits: Edit[]; maps: string[]; notes: string[]; exact: boolean; check: (exp: Map<string, string>) => boolean };
const same = (a: string, b: string) => lf(a) === lf(b);

/** A changed page file against the app's current export of it. */
function analysePage(cx: Ctx, path: string, e: Entry, repoRaw: string, appText: string, literal: boolean): Analysis {
  const side: "public" | "gm" = gmPath(path) ? "gm" : "public", { known, tabs } = knownFor(e, side);
  const crlf = isCrlf(repoRaw), rest = readFront(repoRaw).rest.replace(/^﻿/, ""), R = parseSections(crlf ? lf(rest) : rest, known), A = parseSections(exported(appText), known);
  const store = (t: string) => (crlf ? t.replace(/\n/g, "\r\n") : t);
  const edits: Edit[] = [], maps: string[] = [], notes: string[] = [], expect: { heading: string | null; text: string }[] = [];
  let exact = true;
  const draft = draftOf(e), bodyPublic = e.overviewVisibility === "players" && !draft;
  const links = (text: string) => (literal ? text : rewriteLinks(text, path, cx.linkable));
  const secOf = (p: Sections, h: string) => p.sections.filter(s => s.heading === h);
  // The overview text. Players' overview text is only taken back when the page's own text reads the same to them (no secret lines, rolls or map links).
  if (!same(R.intro, A.intro)) {
    const target = side === "public" ? bodyPublic : !bodyPublic;
    if (!target || (side === "public" && !stable(e.body))) exact = false;
    else { edits.push({ op: "body", id: e.id, text: store(links(R.intro)) }); maps.push(side === "gm" ? "Overview (GM only)" : "Overview"); expect.push({ heading: null, text: R.intro }); }
  }
  // Tab sections, by heading.
  const labels = new Set<string>([...tabs.keys()]);
  for (const l of labels) {
    const r = secOf(R, l), a = secOf(A, l), ids = tabs.get(l)!;
    const joined = (xs: { text: string }[]) => xs.map(x => x.text).join("\n\n");
    if (same(joined(r), joined(a))) continue;
    const t = ids.length === 1 ? (e.tabs ?? []).find(x => x.id === ids[0]) : undefined;
    if (!t || DERIVED_PAGE.includes(l) || r.length > 1 || (side === "public" && !stable(t.body))) { exact = false; continue; }
    if (!r.length) continue; // a section the AI GM removed: the tab stays as it is
    edits.push({ op: "tab", id: e.id, tabId: t.id, text: store(links(r[0].text)) });
    maps.push(side === "gm" ? `${t.title} (GM tab)` : t.title);
    expect.push({ heading: l, text: r[0].text });
  }
  // Derived sections that differ are left as they are.
  const derived = [...new Set(R.sections.map(s => s.heading))].filter(h => (DERIVED_PAGE.includes(h) || h.endsWith(" (secret lines)")) && !same(joinText(secOf(R, h)), joinText(secOf(A, h))) && !labels.has(h));
  if (derived.length) notes.push(`${derived.join(", ")} stays as the app makes it`);
  const check = (exp: Map<string, string>) => {
    const out = exp.get(path); if (out === undefined) return false;
    const C = parseSections(exported(out), known);
    return expect.every(x => same(x.heading === null ? C.intro : joinText(secOf(C, x.heading)), x.text));
  };
  return { edits, maps, notes, exact, check };
}
const joinText = (xs: { text: string }[]) => xs.map(x => x.text).join("\n\n");

/** 1-Now/Current-State.md: its "Next session starting point" is the front page's "Where we are" text. */
function analyseCurrent(path: string, repoRaw: string, appText: string, widgetOk: boolean): Analysis {
  const crlf = isCrlf(repoRaw), known = new Set(CURRENT), rest = readFront(repoRaw).rest.replace(/^﻿/, "");
  const R = parseSections(crlf ? lf(rest) : rest, known), A = parseSections(exported(appText), known), h = "Next session starting point";
  const r = R.sections.filter(s => s.heading === h), a = A.sections.filter(s => s.heading === h), edits: Edit[] = [], notes: string[] = [];
  let exact = true;
  const other = CURRENT.filter(x => x !== h && !same(joinText(R.sections.filter(s => s.heading === x)), joinText(A.sections.filter(s => s.heading === x))));
  if (other.length) notes.push(`${other.join(", ")} stays as the app makes it`);
  if (r.length === 1 && !same(r[0].text, a[0]?.text ?? "")) {
    const t = r[0].text;
    const stored = crlf ? t.replace(/\n/g, "\r\n") : t;
    // The widget must hold plain text that the file shows whole (no secret lines, no other kind of "where" widget, no heading of the file inside it).
    if (stored.length > 4000 || !stable(t) || !widgetOk || A.sections.some((x, i) => A.sections.findIndex(z => z.heading === x.heading) !== i)) exact = false;
    else edits.push({ op: "where", text: stored });
  }
  const check = (exp: Map<string, string>) => {
    const out = exp.get(path); if (out === undefined) return false;
    return r.length !== 1 || same(parseSections(exported(out), known).sections.find(s => s.heading === h)?.text ?? "", r[0].text);
  };
  return { edits, maps: edits.length ? ["Front page · Where we are"] : [], notes, exact, check };
}

/** 1-Now/<name>-Sheet-Tracker.md: the tracker and number or text stat lines go back to the character. "Played changes" stays in the repository. */
function analyseSheet(cx: Ctx, path: string, e: Entry, repoRaw: string, appText: string): Analysis {
  const known = new Set(SHEET), crlf = isCrlf(repoRaw), rest = readFront(repoRaw).rest.replace(/^﻿/, "");
  const R = parseSections(crlf ? lf(rest) : rest, known), A = parseSections(exported(appText), known), edits: Edit[] = [], notes: string[] = [], maps: string[] = [];
  const c = cx.ws.campaigns.find(x => x.id === cx.campaignId), ch = e.character;
  let exact = true;
  const lines = (p: Sections, h: string) => p.sections.filter(s => s.heading === h).flatMap(s => s.text.split("\n").map(l => l.replace(/\r$/, "")).filter(l => l.trim()));
  const before = new Set(lines(A, "Trackers")), trackers: { label: string; value: number; max: number }[] = [];
  for (const line of lines(R, "Trackers")) {
    if (before.has(line)) continue;
    const m = /^- (.+?): (-?\d+)\/(-?\d+)$/.exec(line), t = m && (ch?.trackers ?? []).filter(x => headingLabel(x.label) === m[1]);
    if (!m || !t || t.length !== 1) { exact = false; continue; }
    trackers.push({ label: t[0].label, value: Number(m[2]), max: Number(m[3]) });
  }
  if (trackers.length) { edits.push({ op: "trackers", id: e.id, items: trackers }); maps.push("Trackers"); }
  const beforeStats = new Set(lines(A, "Stats")), stats: { fieldId: string; value: string | number }[] = [];
  for (const line of lines(R, "Stats")) {
    if (beforeStats.has(line)) continue;
    const m = /^- (.+?): (.*)$/.exec(line), f = m && (c?.statFields ?? []).filter(x => !x.archived && headingLabel(x.label) === m[1] && (x.type === "number" || x.type === "text"));
    if (!m || !f || f.length !== 1) { exact = false; continue; }
    const value = f[0].type === "number" ? Number(m[2]) : m[2];
    if (f[0].type === "number" && !Number.isFinite(value)) { exact = false; continue; }
    stats.push({ fieldId: f[0].id, value });
  }
  if (stats.length) { edits.push({ op: "stats", id: e.id, items: stats }); maps.push("Stats"); }
  if (!same(joinText(R.sections.filter(s => s.heading === "Played changes")), joinText(A.sections.filter(s => s.heading === "Played changes")))) notes.push("Played changes stays in the repository");
  const check = (exp: Map<string, string>) => {
    const out = exp.get(path); if (out === undefined) return false;
    const C = parseSections(exported(out), known);
    return ["Trackers", "Stats"].every(h => { const want = lines(R, h).filter(l => !(h === "Trackers" ? before : beforeStats).has(l)); const got = new Set(lines(C, h)); return want.every(l => got.has(l)); });
  };
  return { edits, maps, notes, exact, check };
}

/* ---- applying edits ---- */
function folderFor(ws: Workspace, campaignId: string, key: "sessions" | "notes" | "gm", now: string, mint: () => string, add: (e: Entry) => void): string {
  const c = ws.campaigns.find(x => x.id === campaignId)!, title = key === "sessions" ? "Sessions" : key === "notes" ? "Imported notes" : "GM only";
  const have = ws.entries.find(e => e.kind === "folder" && e.campaignId === campaignId && e.parentId === null && e.title === title);
  if (have) return have.id;
  const folder: Entry = { id: mint(), worldId: c.worldId, campaignId, updatedAt: now, parentId: null, title, kind: "folder", body: "", ...(key === "sessions" ? {} : { overviewVisibility: "gm" as const }) };
  add(folder); return folder.id;
}
const cut = (text: string, max: number) => (text.length > max ? text.slice(0, max) : text);

/** The workspace with the edits applied, or an error. `lost` lists pages whose text the edits replace; for those `keepTab` also writes the old text as a GM tab (when page history could not keep it). */
export function applyEdits(ws: Workspace, campaignId: string, edits: Edit[], o: { now: string; mint: () => string; show: boolean; keepTab?: ReadonlySet<string> }): { ok: true; workspace: Workspace; keep: { id: string; snapshot: Snapshot }[] } | { ok: false; error: string } {
  const entries = new Map(ws.entries.map(e => [e.id, e])), order = ws.entries.map(e => e.id), added: Entry[] = [], c = ws.campaigns.find(x => x.id === campaignId);
  if (!c) return { ok: false, error: "This campaign is not in your notes any more." };
  const keep = new Map<string, Snapshot>(), olds = new Map<string, { body?: string; tabs: { title: string; text: string }[] }>();
  let frontPage = c.frontPage;
  const touch = (id: string): Entry | null => { const e = entries.get(id); if (!e || e.kind === "folder" || e.worldId !== c.worldId || (e.campaignId !== null && e.campaignId !== campaignId)) return null; const copy: Entry = { ...e, updatedAt: o.now }; entries.set(id, copy); return copy; };
  const remember = (id: string) => { const e = ws.entries.find(x => x.id === id); if (e && !keep.has(id)) keep.set(id, snapshotOf(e)); if (!olds.has(id)) olds.set(id, { tabs: [] }); return olds.get(id)!; };
  const pageFolders: Partial<Record<"sessions" | "notes" | "gm", string>> = {};
  const folder = (k: "sessions" | "notes" | "gm") => pageFolders[k] ??= folderFor({ ...ws, entries: [...ws.entries, ...added] }, campaignId, k, o.now, o.mint, x => added.push(x));
  const newEntry = (p: Omit<Entry, "id" | "worldId" | "campaignId" | "updatedAt">, id = o.mint()): Entry => ({ id, worldId: c.worldId, campaignId, updatedAt: o.now, ...p });
  for (const ed of edits) {
    if (ed.op === "body") { const e = touch(ed.id); if (!e) continue; remember(ed.id).body = ws.entries.find(x => x.id === ed.id)!.body; e.body = ed.text; }
    else if (ed.op === "tab") {
      const e = touch(ed.id); if (!e) continue;
      const old = (ws.entries.find(x => x.id === ed.id)?.tabs ?? []).find(t => t.id === ed.tabId);
      if (old) remember(ed.id).tabs.push({ title: old.title, text: old.body });
      e.tabs = (e.tabs ?? []).map(t => (t.id === ed.tabId ? { ...t, body: ed.text } : t));
    }
    else if (ed.op === "newtab") { const e = touch(ed.id); if (!e) continue; if ((e.tabs ?? []).length >= MAX_TABS) return { ok: false, error: `${e.title} already has the most tabs a page can hold (${MAX_TABS}).` }; e.tabs = [...(e.tabs ?? []), { id: o.mint(), title: ed.title.slice(0, 160), body: ed.text, visibility: "gm" }]; }
    else if (ed.op === "trackers") { const e = touch(ed.id); if (!e?.character) continue; e.character = { ...e.character, trackers: (e.character.trackers ?? []).map(t => { const n = ed.items.find(i => i.label === t.label); return n ? { ...t, value: n.value, max: n.max } : t; }) }; }
    else if (ed.op === "stats") { const e = touch(ed.id); if (!e?.character) continue; e.character = { ...e.character, statsByCampaign: { ...e.character.statsByCampaign, [campaignId]: { ...(e.character.statsByCampaign[campaignId] ?? {}), ...Object.fromEntries(ed.items.map(i => [i.fieldId, i.value])) } } }; }
    else if (ed.op === "where") {
      const widgets = frontPage?.widgets ?? defaultFrontPage().widgets.filter(w => w.id !== "welcome");
      const has = widgets.some(w => w.id === WHERE_WIDGET && w.type === "text");
      if (!has && widgets.length >= 24) return { ok: false, error: "The front page already has the most widgets it can hold, so “Where we are” can't be added." };
      frontPage = { widgets: has ? widgets.map(w => (w.id === WHERE_WIDGET && w.type === "text" ? { ...w, body: ed.text } : w)) : [{ id: WHERE_WIDGET, type: "text", title: "Where we are", body: ed.text, wide: true }, ...widgets] };
    }
    else if (ed.op === "newnote") added.push(newEntry({ parentId: folder("notes"), title: cut(ed.title, 160), kind: "note", body: ed.text, overviewVisibility: "gm" }));
    else if (ed.op === "page") {
      const p = ed.page, vis = o.show && p.visibility === "players" ? "players" as const : "gm" as const;
      const e = newEntry({ parentId: p.parent ? folder(p.parent) : null, title: p.title, kind: p.kind, body: p.body, overviewVisibility: vis }, ed.id);
      if (p.kind === "character") e.character = { ...defaultCharacter(), role: p.role ?? "npc" };
      if (p.kind === "quest") e.quest = newQuest(p.state ?? "active");
      if (p.kind === "session" && p.date) e.recap = { status: vis === "players" ? "published" : "draft", mine: true, playedOn: p.date, timeline: [], quotes: [], gmNotes: "", review: [] };
      added.push(e);
    }
  }
  // Pages whose earlier version page history could not keep get it as a GM-only tab.
  for (const [id, old] of olds) {
    if (!o.keepTab?.has(id)) continue;
    const e = entries.get(id); if (!e) continue;
    const parts = [...(old.body !== undefined ? [old.body] : []), ...old.tabs.map(t => `## ${t.title}\n\n${t.text}`)];
    if ((e.tabs ?? []).length >= MAX_TABS) return { ok: false, error: `${e.title} has no room for a tab that keeps its earlier version, and page history could not keep it.` };
    entries.set(id, { ...e, tabs: [...(e.tabs ?? []), { id: o.mint(), title: `Before bring back ${o.now.slice(0, 10)}`, body: cut(parts.join("\n\n"), MAX_FILE_CHARS), visibility: "gm" }] });
  }
  const nextCampaigns = ws.campaigns.map(x => (x.id === campaignId ? { ...x, ...(frontPage ? { frontPage } : {}) } : x));
  try {
    const next = workspaceSchema.parse({ ...ws, campaigns: nextCampaigns, entries: [...order.map(id => entries.get(id)!), ...added] });
    return { ok: true, workspace: next, keep: [...keep].map(([id, snapshot]) => ({ id, snapshot })).filter(k => !o.keepTab?.has(k.id)) };
  } catch (err) {
    const issue = (err as { issues?: { message?: string; path?: unknown[] }[] }).issues?.[0];
    return { ok: false, error: `These changes do not fit the notes${issue?.message ? `: ${issue.message}` : ""}.` };
  }
}

/* ---- the plan ---- */
export type PlanInput = {
  map: FilesMap;
  /** Every path of the repository. `text` is set for the files that were read (changed or new ones); a path without text counts as unchanged when the map knows it. */
  files: RepoFile[];
  /** 8-Archive/Export-Log.md, for the date of the last push. */
  log?: string;
};
const GROUP_LABEL: Record<string, string> = { session: "New session page", pc: "New character page", npc: "New NPC page", place: "New place page", org: "New organization page", quest: "New quest", gm: "New GM-only page", notes: "New note" };
const sheetStem = (path: string) => /^(?:6-GM-Only\/)?1-Now\/(.+)-Sheet-Tracker\.md$/.exec(path)?.[1] ?? null;

type Cand = { path: string; raw: string; entry: Entry | null; kind: "page" | "current" | "sheet"; appText: string; appChanged: boolean; an: Analysis };

export function planBringBack(ws: Workspace, campaignId: string, input: PlanInput, o: { now?: string; newId?: () => string } = {}): BringBackPlan {
  const now = o.now ?? new Date().toISOString(), mint = o.newId ?? randomId, { map } = input;
  const byId = new Map(ws.entries.map(e => [e.id, e])), world = ws.campaigns.find(c => c.id === campaignId)?.worldId, mine = (e: Entry | undefined) => !!e && e.kind !== "folder" && e.worldId === world && (e.campaignId === campaignId || e.campaignId === null);
  let current = new Map<string, string>();
  try { current = new Map(rpExportFiles(ws, campaignId, { includeGm: map.includeGm, exportedAt: now }).map(f => [f.path, f.text])); } catch { current = new Map(); }
  const linkable = new Map<string, string>();
  for (const [p, id] of Object.entries(map.pages)) if (mine(byId.get(id))) linkable.set(p, id);
  const cx: Ctx = { ws, campaignId, map, byId, current, now, mint, linkable };

  const paths = new Set(input.files.map(f => f.path)), texts = new Map<string, string>();
  for (const f of input.files) if (f.text !== undefined) texts.set(f.path, f.text);
  const plan: BringBackPlan = { campaignId, since: exportedAt(input.log), rows: [], removed: [], rebuilt: [], kept: [], already: [], skipped: [] };
  plan.rebuilt = [...paths].filter(p => isRebuilt(p) && FOLDERS_LIST.concat([".rpg-tools"]).includes(p.split("/")[0]) || p === "README.md" || p === "AGENTS.md").sort();
  plan.removed = Object.keys(map.hashes).filter(p => isCandidate(p) && !paths.has(p)).sort();

  const changed: { path: string; raw: string }[] = [], fresh: { path: string; raw: string }[] = [];
  for (const p of [...paths].sort()) {
    if (!isCandidate(p)) continue;
    const raw = texts.get(p), known = map.hashes[p] !== undefined;
    if (raw === undefined) { if (!known) plan.skipped.push(p); continue; }
    if (raw.length > MAX_FILE_CHARS) { plan.skipped.push(p); continue; }
    if (known && textHash(raw) === map.hashes[p]) continue;
    (known ? changed : fresh).push({ path: p, raw });
  }

  // Changed files: what does each belong to?
  const cands: Cand[] = [];
  const widget = ws.campaigns.find(c => c.id === campaignId)?.frontPage?.widgets.find(w => w.id === WHERE_WIDGET), whereOk = !widget || (widget.type === "text" && stable(widget.body));
  const sheetOwner = (path: string): Entry | null => {
    const stem = sheetStem(path); if (!stem) return null;
    for (const [p, id] of Object.entries(map.pages)) if (p.replace(/^6-GM-Only\//, "") === `3-People/${stem}.md` && mine(byId.get(id)) && byId.get(id)?.character) return byId.get(id)!;
    return null;
  };
  for (const { path, raw } of changed) {
    const front = readFront(raw), appText = current.get(path);
    if (appText !== undefined && sameApartFromFrontMatter(appText, raw)) { plan.already.push(path); continue; }
    const appChanged = appText === undefined || textHash(appText) !== map.hashes[path], A = appText ?? "";
    if (path === "1-Now/Current-State.md") { cands.push({ path, raw, entry: null, kind: "current", appText: A, appChanged, an: analyseCurrent(path, raw, A, whereOk) }); continue; }
    if (sheetStem(path)) {
      const e = sheetOwner(path);
      if (!e) { plan.kept.push({ path, reason: "The character this tracker belongs to is not in the app" }); continue; }
      cands.push({ path, raw, entry: e, kind: "sheet", appText: A, appChanged, an: analyseSheet(cx, path, e, raw, A) }); continue;
    }
    const idFront = front.id && mine(byId.get(front.id)) ? front.id : null, idMap = map.pages[path] && mine(byId.get(map.pages[path])) ? map.pages[path] : null, id = idFront ?? idMap;
    if (!id) { plan.kept.push({ path, reason: map.pages[path] || front.id ? "The page this file belongs to is not in the app any more" : "Made by the app from its data; there is no page for it" }); continue; }
    const e = byId.get(id)!;
    cands.push({ path, raw, entry: e, kind: "page", appText: A, appChanged, an: analysePage(cx, path, e, raw, A, false) });
  }

  // Check by applying: the export of the result must read the same as the file for every part that is taken back.
  const verify = (list: Cand[]) => {
    const ok = new Set<Cand>(), tried = list.filter(c => c.an.exact && c.an.edits.length);
    for (const c of list) if (c.an.exact && !c.an.edits.length) ok.add(c);
    if (!tried.length) return ok;
    const done = applyEdits(ws, campaignId, tried.flatMap(c => c.an.edits), { now, mint, show: false });
    if (!done.ok) return ok;
    let exp: Map<string, string>;
    try { exp = new Map(rpExportFiles(done.workspace, campaignId, { includeGm: map.includeGm, exportedAt: now }).map(f => [f.path, f.text])); } catch { return ok; }
    for (const c of tried) if (c.an.check(exp)) ok.add(c);
    return ok;
  };
  let good = verify(cands);
  const second = cands.filter(c => !good.has(c) && c.kind === "page");
  if (second.length) {
    for (const c of second) c.an = analysePage(cx, c.path, c.entry!, c.raw, c.appText, true);
    const again = verify(second);
    for (const c of again) good.add(c);
  }
  good = new Set(good);

  const title = `Repo version ${shortDate(now)}`;
  for (const c of cands) {
    const e = c.entry, text = contentOf(c.raw), exact = good.has(c);
    const tab: Edit = c.kind === "current" ? { op: "newnote", title: "Where we are (repo version)", text } : { op: "newtab", id: e!.id, title, text };
    const name = c.kind === "current" ? "Front page" : e!.title;
    if (exact && !c.an.edits.length) {
      if (c.an.notes.length) plan.kept.push({ path: c.path, reason: `Only the parts the app makes were changed (${c.an.notes.join("; ")})` });
      else plan.already.push(c.path);
      continue;
    }
    const row: Row = exact
      ? { key: c.path, path: c.path, tag: c.appChanged ? "Both" : "Edit", maps: c.kind === "current" ? c.an.maps.join(", ") : `${name} · ${c.an.maps.join(", ")}`, ...(c.an.notes.length ? { note: `${c.an.notes.join("; ")}.` } : {}), matched: true, edits: c.an.edits, both: [tab], overwrites: [] }
      : { key: c.path, path: c.path, tag: c.appChanged ? "Both" : "Edit", maps: `${name} · Can't be matched to a page part`, note: c.kind === "current" ? "Added as a new GM-only note." : "Added as a new GM-only tab.", matched: false, edits: [tab], both: [tab], overwrites: [] };
    row.overwrites = [...new Set(row.edits.flatMap(x => (x.op === "body" || x.op === "tab" ? [x.id] : [])))];
    if (row.edits.concat(row.both).some(x => (x.op === "body" || x.op === "tab" || x.op === "newtab" || x.op === "newnote") && x.text.length > MAX_FILE_CHARS)) row.blocked = "The text is too long for a page tab (over 100,000 characters).";
    if (row.tag === "Both" && c.appChanged) row.note = [row.note, row.tag === "Both" ? "Edited here too." : ""].filter(Boolean).join(" ");
    plan.rows.push(row);
  }

  // New files: the GM part of a page that had none, or a new page.
  const pages: { path: string; raw: string }[] = [];
  // A new file whose text is already a page file of the app (brought back before and not pushed yet) is not a second page.
  const dirOf = (p: string) => p.replace(/^6-GM-Only\//, "").slice(0, p.replace(/^6-GM-Only\//, "").lastIndexOf("/")), have = new Set([...current].map(([p, t]) => `${dirOf(p)}\n${withoutFrontMatter(t)}`));
  for (const f of fresh) {
    if (have.has(`${dirOf(f.path)}\n${withoutFrontMatter(f.raw)}`)) { plan.already.push(f.path); continue; }
    const front = readFront(f.raw), base = gmPath(f.path) ? f.path.slice("6-GM-Only/".length) : null;
    const twinId = base && map.pages[base] ? map.pages[base] : base && front.id ? front.id : null;
    const e = twinId ? byId.get(twinId) : undefined;
    if (base && mine(e)) {
      const text = contentOf(f.raw);
      plan.rows.push({ key: f.path, path: f.path, tag: "New", maps: `${e!.title} · GM tab (new)`, matched: true, edits: [{ op: "newtab", id: e!.id, title: "GM notes from the repo", text }], both: [], overwrites: [], ...(text.length > MAX_FILE_CHARS ? { blocked: "The text is too long for a page tab (over 100,000 characters)." } : {}) });
      continue;
    }
    pages.push(f);
  }
  if (pages.length) {
    const pre = previewRepo(pages.map(f => ({ path: f.path, text: f.raw })));
    if (pre.ok) {
      const forLinks = new Map(linkable);
      const seen = new Map<string, number>();
      for (const p of pre.pages) {
        const id = mint(), n = (seen.get(p.path ?? "") ?? 0) + 1;
        seen.set(p.path ?? "", n);
        const body = p.path ? rewriteLinks(p.body, p.path, forLinks) : p.body, kept = body.length > MAX_FILE_CHARS ? p.body : body;
        plan.rows.push({ key: `${p.path ?? p.title}#${n}`, path: p.path ?? "", tag: "New", maps: `${GROUP_LABEL[p.group] ?? "New page"}${p.group === "session" ? "" : ` · ${p.title}`}`, ...(p.group === "session" ? { note: p.title } : {}), matched: true, edits: [{ op: "page", id, page: { ...p, body: kept } }], both: [], overwrites: [] });
      }
      for (const t of pre.tooBig) plan.skipped.push(t);
      if (pre.front) plan.kept.push({ path: "1-Now/Current-State.md", reason: "Current State is brought back from a change, not as a new file" });
    } else for (const f of pages) plan.kept.push({ path: f.path, reason: pre.error });
  }
  const rank = (r: Row) => (r.tag === "New" ? 0 : 1);
  plan.rows.sort((a, b) => rank(a) - rank(b) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return plan;
}

/* ---- applying a plan ---- */
export type Selection = { checked: ReadonlySet<string>; choices: Record<string, Choice | undefined>; show: boolean };
export const editsOf = (plan: BringBackPlan, sel: Selection): Edit[] =>
  plan.rows.filter(r => sel.checked.has(r.key) && !r.blocked).flatMap(r => {
    const c = sel.choices[r.key] ?? defaultChoice(r);
    return c === "app" ? [] : c === "both" ? r.both : r.edits;
  });
export type BringBackResult = { ok: true; workspace: Workspace; keep: { id: string; snapshot: Snapshot }[]; count: number } | { ok: false; error: string };
/** The notes with the picked rows applied. `keep` lists the pages whose earlier text must go into page history first. Pass the ids page history could not keep in `keepTab`. */
export function applyBringBack(ws: Workspace, plan: BringBackPlan, sel: Selection, o: { now?: string; newId?: () => string; keepTab?: ReadonlySet<string> } = {}): BringBackResult {
  const edits = editsOf(plan, sel), count = plan.rows.filter(r => sel.checked.has(r.key) && !r.blocked && (sel.choices[r.key] ?? defaultChoice(r)) !== "app").length;
  const done = applyEdits(ws, plan.campaignId, edits, { now: o.now ?? new Date().toISOString(), mint: o.newId ?? randomId, show: sel.show, keepTab: o.keepTab });
  return done.ok ? { ...done, count } : done;
}

/* ---- reading a ZIP or folder ---- */
/** The files bring-back needs from a source that reads one file at a time: the file map, the export log and every candidate Markdown file. */
export async function readBringSources(sources: Source[]): Promise<{ ok: true; files: RepoFile[]; map: FilesMap; log: string | undefined; unreadable: string[] } | { ok: false; error: string }> {
  const mapSource = sources.find(s => s.name === ".rpg-tools/files.json");
  if (!mapSource) return { ok: false, error: "This is not an RPG Tools export: it has no .rpg-tools/files.json." };
  const map = parseFilesMap(new TextDecoder().decode(await mapSource.bytes()));
  if (!map) return { ok: false, error: ".rpg-tools/files.json could not be read." };
  const files: RepoFile[] = [], unreadable: string[] = [];
  let count = 0;
  for (const s of sources) {
    if (!isCandidate(s.name) || s.size > MAX_FILE_CHARS * 4) { files.push({ path: s.name, size: s.size }); if (isCandidate(s.name)) unreadable.push(s.name); continue; }
    if (++count > 700) return { ok: false, error: "This repository has too many Markdown files to bring back at once." };
    try { files.push({ path: s.name, size: s.size, text: decodeText(await s.bytes(), s.name) }); }
    catch { files.push({ path: s.name, size: s.size }); unreadable.push(s.name); }
  }
  const log = sources.find(s => s.name === "8-Archive/Export-Log.md");
  return { ok: true, files, map, log: log ? new TextDecoder().decode(await log.bytes()) : undefined, unreadable };
}

/* ---- saving ---- */
/** The default limit for one campaign; the owner may have raised theirs (lib/encyclopedia/wiki-parts.ts). */
export const WORKSPACE_LIMIT = DEFAULT_PART_LIMIT;
const WORKSPACE_URL = "/api/encyclopedia/workspace", HISTORY_URL = "/api/encyclopedia/history";
type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;
const stableKey = (plan: BringBackPlan) => JSON.stringify(plan.rows.map(r => [r.key, r.tag, r.maps, r.matched, !!r.blocked]));
export type SaveResult =
  | { status: "done"; count: number; kept: number }
  /** The campaign no longer matches what was reviewed. `plan` is the new one to review. */
  | { status: "changed"; plan: BringBackPlan }
  | { status: "error"; message: string };

/**
 * Brings the picked rows back, protecting the person's notes. One GET reads the newest notes and their revision. The plan is made again
 * from them: if it no longer matches what was reviewed, nothing is saved and the new plan is returned. Each page whose text is replaced
 * first has its earlier version kept in page history (when that fails, the old text is kept as a GM-only tab, "Before bring back <date>").
 * One PUT with the revision then saves everything; a 409 means the notes changed meanwhile, so the plan is made again and returned.
 */
export async function saveBringBack(o: { fetch: FetchFn; campaignId: string; plan: BringBackPlan; input: PlanInput; sel: Selection; now?: string; newId?: () => string }): Promise<SaveResult> {
  const now = o.now ?? new Date().toISOString();
  const read = async () => {
    const res = await o.fetch(WORKSPACE_URL, { cache: "no-store" }), body = await workspaceBody<{ data?: unknown; revision?: number; limit?: number; total?: number; error?: string }>(res, o.fetch as typeof fetch).catch(() => ({} as { data?: unknown; revision?: number; limit?: number; total?: number; error?: string }));
    if (res.status === 401) return { error: "Sign in again to bring back changes." };
    if (!res.ok || typeof body.revision !== "number") return { error: body.error || "Could not read your notes. Nothing was changed." };
    const parsed = workspaceSchema.safeParse(body.data);
    if (!parsed.success) return { error: "Your notes could not be read. Nothing was changed." };
    return { ws: parsed.data, revision: body.revision, limit: body.limit ?? DEFAULT_PART_LIMIT, total: body.total };
  };
  try {
    const got = await read();
    if ("error" in got) return { status: "error", message: got.error! };
    if (!got.ws.campaigns.some(c => c.id === o.campaignId)) return { status: "error", message: "This campaign was not found in your notes. Nothing was changed." };
    const fresh = planBringBack(got.ws, o.campaignId, o.input, { now, newId: o.newId });
    if (stableKey(fresh) !== stableKey(o.plan)) return { status: "changed", plan: fresh };
    let done = applyBringBack(got.ws, fresh, o.sel, { now, newId: o.newId });
    if (!done.ok) return { status: "error", message: `${done.error} Nothing was changed.` };
    // Too big to save: say so before anything is written to page history.
    const tooBig = (w: Workspace) => (sizeProblem(w, got.limit, got.total)?.replace(/$/, " Nothing was changed.") ?? null);
    const big = tooBig(done.workspace); if (big) return { status: "error", message: big };
    // Page history keeps the old text first (the server keeps it only for pages that are in the saved notes, which they are).
    const failed = new Set<string>();
    for (const k of done.keep) {
      const kept = await o.fetch(HISTORY_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryId: k.id, snapshot: k.snapshot }) }).then(r => r.ok && true).catch(() => false);
      if (!kept) failed.add(k.id);
    }
    if (failed.size) { done = applyBringBack(got.ws, fresh, o.sel, { now, newId: o.newId, keepTab: failed }); if (!done.ok) return { status: "error", message: `${done.error} Nothing was changed.` }; }
    const next = done.workspace, big2 = failed.size ? tooBig(next) : null;
    if (big2) return { status: "error", message: big2 };
    const put = await putWorkspace(WORKSPACE_URL, { data: next, revision: got.revision }, o.fetch as typeof fetch);
    const out = await put.json().catch(() => ({})) as { error?: string };
    if (put.status === 409) {
      const again = await read();
      if ("error" in again) return { status: "error", message: "This campaign changed while you were reviewing, and the newest copy could not be read. Nothing was changed." };
      return { status: "changed", plan: planBringBack(again.ws, o.campaignId, o.input, { now, newId: o.newId }) };
    }
    if (!put.ok) return { status: "error", message: out.error || "Could not save the changes. Nothing was changed." };
    return { status: "done", count: done.count, kept: done.keep.length };
  } catch (e) { return { status: "error", message: e instanceof Error && e.message ? e.message : "Could not bring back the changes. Nothing was changed." }; }
}
