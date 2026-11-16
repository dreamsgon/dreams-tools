/*
 * Import an existing RP repository (the numbered folder layout) as a new campaign. This is roughly the inverse of rp-export.ts.
 * Everything here is pure: a list of files in, a preview out, and a function that turns the preview into a new world, campaign
 * and pages. Nothing touches existing campaigns; the caller adds the result to the workspace in one save.
 *
 * Wording is kept exactly. A page's body is the file's Markdown with only the YAML front matter and a leading "# Title" taken
 * off (that heading became the page title). Relative links between imported files become [[page id|label]] links, the
 * Encyclopedia's own link syntax; links to anything else are left as written.
 *
 * Visibility. Pages from the public folders are shared with players (as in an export). 6-GM-Only pages and the unmatched files
 * (Imported notes) are GM-only.
 */
import { defaultCharacter, newId as randomId, workspaceSchema, type Entry, type Workspace } from "./world-model.ts";
import { defaultFrontPage } from "./front-page.ts";
import { newQuest, type QuestState } from "./quests.ts";
import { FOLDERS_LIST } from "./rp-export.ts";

/** A file of the repository. `text` is left out for a file that is not Markdown or was not read (a library file, a picture). */
export type RepoFile = { path: string; text?: string; size?: number };

export const IMPORT_LIMITS = {
  /** Files in the whole repository (the ZIP reader's own limit). */
  files: 5000,
  /** Markdown files that would be imported. */
  pages: 600,
  /** All imported text together, in characters. The workspace as a whole is limited to 2 MB. */
  chars: 1_500_000,
  /** One file, in characters (a page body holds 100,000). */
  file: 100_000,
} as const;
/** A file this big in bytes cannot fit a page, so it is not even downloaded. */
const MAX_FILE_BYTES = IMPORT_LIMITS.file * 4;
const FRONT_MAX = 4000;

export type GroupId = "pc" | "npc" | "place" | "org" | "session" | "quest" | "front" | "gm" | "notes";
export type PlannedPage = {
  kind: Entry["kind"];
  role?: "pc" | "companion" | "npc";
  title: string;
  body: string;
  group: GroupId;
  visibility: "players" | "gm";
  parent?: "sessions" | "notes" | "gm";
  /** The file it came from, when the page is that whole file (so links to the file can find it). */
  path?: string;
  /** The page the front page links to, when "Where we are" is too long to sit there. */
  frontLink?: boolean;
  /** Sessions: the played-on date from the file name. */
  date?: string;
  state?: QuestState;
};
export type ImportRow = { from: string; to: string; count: number; note?: string };
export type ImportPreview = {
  ok: true;
  /** The repository's name for the heading: what the caller gave, else the top folder. */
  repoName: string;
  /** The campaign name it will get unless the person changes it. */
  campaignName: string;
  /** Every file of the repository (after any top folder is taken off). */
  files: number;
  rows: ImportRow[];
  /** Files in 7-Library: they stay in the repository. */
  stays: number;
  notImported: { label: string; count: number }[];
  /** Markdown files that matched no folder and go into Imported notes. */
  unmatched: number;
  /** Images and other files that are not Markdown. */
  skipped: number;
  /** Files too big for a page. */
  tooBig: string[];
  notices: string[];
  /** The text of "Where we are", or null. */
  front: { body: string; long: boolean } | null;
  pages: PlannedPage[];
};
export type ImportResult = ImportPreview | { ok: false; error: string };

/* ---- paths ---- */
const NUMBERED = FOLDERS_LIST.map(f => f.toLowerCase());
const isNumbered = (segment: string) => NUMBERED.includes(segment.toLowerCase());
const isMarkdown = (path: string) => /\.(md|markdown)$/i.test(path);

/** Throws for a path that could leave the repository: a leading slash, a backslash, "..", a drive letter. */
function checkPath(path: string) {
  if (!path || path.startsWith("/") || path.includes("\\") || path.includes("\0") || /^[a-zA-Z]:/.test(path) || path.split("/").some((p, i, a) => p === ".." || p === "." || (p === "" && i < a.length - 1)))
    throw new Error(`The files include an unsafe path (${path.slice(0, 80)}), so nothing was read.`);
}

/** Drops macOS leftovers and the insides of .git and node_modules, then one top folder when the numbered folders sit inside it (GitHub's ZIP download, a picked folder). */
function normalise<T extends { path: string }>(files: T[]): { files: T[]; top: string } {
  const real = files.filter(f => !f.path.startsWith("__MACOSX/") && !/(^|\/)\.DS_Store$/.test(f.path) && !f.path.split("/").some(s => s === ".git" || s === "node_modules"));
  if (real.some(f => f.path.includes("/") && isNumbered(f.path.split("/")[0]))) return { files: real, top: "" };
  const tops = new Set<string>();
  for (const f of real) { const s = f.path.split("/"); if (s.length >= 3 && isNumbered(s[1])) tops.add(s[0]); }
  if (tops.size !== 1) return { files: real, top: "" };
  const top = [...tops][0];
  return { files: real.filter(f => f.path.startsWith(top + "/")).map(f => ({ ...f, path: f.path.slice(top.length + 1) })), top };
}

type Where =
  | { to: "library" | "archive" | "setup" | "other" | "readme" | "front" | "quests" }
  | { to: "page"; group: GroupId; kind: Entry["kind"]; role?: "pc" | "companion" | "npc"; split?: "factions" }
  | { to: "gm"; mirror: Where };
const stemOf = (path: string) => path.split("/").pop()!.replace(/\.(md|markdown)$/i, "");

/** What one file is, by its path alone. */
function place(parts: string[]): Where {
  const top = parts[0].toLowerCase(), rest = parts.slice(1), name = parts[parts.length - 1].toLowerCase();
  if (parts.some(p => p.startsWith(".")) ) return { to: "setup" };
  if (top === "7-library") return { to: "library" };
  if (top === "8-archive") return { to: "archive" };
  if (!isMarkdown(name)) return { to: "other" };
  if (name === "readme.md") return { to: "readme" };
  if (name === "agents.md") return { to: "setup" };
  const notes: Where = { to: "page", group: "notes", kind: "note" };
  if (top === "6-gm-only") {
    const inner = rest.length ? place(rest) : notes;
    return { to: "gm", mirror: inner.to === "page" ? inner : notes };
  }
  switch (top) {
    case "1-now":
      if (rest.length === 1 && name === "current-state.md") return { to: "front" };
      if (rest.length === 1 && name === "quests-and-threads.md") return { to: "quests" };
      return notes;
    case "2-story":
      return rest.length >= 2 && rest[0].toLowerCase() === "sessions" ? { to: "page", group: "session", kind: "session" } : notes;
    case "3-people":
      if (rest.length === 1) return { to: "page", group: "pc", kind: "character", role: "pc" };
      return { to: "page", group: "npc", kind: "character", role: rest[0].toLowerCase() === "companions" ? "companion" : "npc" };
    case "4-world": {
      if (rest.length === 1) {
        const stem = stemOf(name).toLowerCase();
        if (stem === "factions") return { to: "page", group: "org", kind: "faction", split: "factions" };
        if (stem === "locations-and-lore" || stem === "lore") return { to: "page", group: "place", kind: "lore" };
        if (stem === "places" || stem === "locations") return { to: "page", group: "place", kind: "place" };
        return notes;
      }
      const dir = rest[0].toLowerCase();
      if (dir === "places" || dir === "locations") return { to: "page", group: "place", kind: "place" };
      if (dir === "lore") return { to: "page", group: "place", kind: "lore" };
      if (dir === "factions" || dir === "organizations" || dir === "organisations") return { to: "page", group: "org", kind: "faction" };
      return notes;
    }
    default:
      return notes;
  }
}

/* ---- reading a Markdown file ---- */
/** Closing #s of an ATX heading count only after a space ("# C#" keeps its #). Written without a regex so a long run of blanks stays fast. */
function closeHashes(t: string): string {
  let i = t.length;
  while (i > 0 && t[i - 1] === "#") i--;
  if (i === t.length) return t;
  if (i === 0) return "";
  return t[i - 1] === " " || t[i - 1] === "\t" ? t.slice(0, i).trimEnd() : t;
}
/** Front matter and the leading "# Title" taken off. Line endings and wording inside the body are left alone. `gmOnly` is set when the file says it is a GM part. */
export function readMarkdown(raw: string): { title: string | null; body: string; gmOnly: boolean } {
  let text = raw.replace(/^\uFEFF/, ""), title: string | null = null, gmOnly = false;
  const fm = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text);
  // Only a block that starts like YAML ("key: value") is front matter; a "---" rule with another further down is text.
  if (fm && (fm[1] === undefined || /^\s*(?:#.*\r?\n\s*)*[\w.-]+[ \t]*:/.test(fm[1]))) {
    text = text.slice(fm[0].length);
    const block = fm[1] ?? "";
    const t = /^title:[ \t]*(.+?)[ \t]*\r?$/m.exec(block);
    if (t) title = t[1].replace(/^(["'])(.*)\1$/, "$2").trim() || null;
    gmOnly = /^part:[ \t]*["']?gm[-_ ]?only["']?[ \t]*\r?$/im.test(block) || /^(?:visibility|audience):[ \t]*["']?gm(?:[-_ ]?only)?["']?[ \t]*\r?$/im.test(block);
  }
  text = text.replace(/^(?:[ \t]*\r?\n)+/, "");
  const h1 = /^#[ \t]+(\S[^\r\n]*)(?:\r?\n|$)/.exec(text);
  if (h1) { title = closeHashes(h1[1].trimEnd()).trim(); text = text.slice(h1[0].length); }
  if (title && /\(GM only\)$/i.test(title)) gmOnly = true;
  return { title, body: text.replace(/^(?:[ \t]*\r?\n)+/, "").trimEnd(), gmOnly };
}

/** Code fences: the state after a line is the opening marker while inside a fence, else null. A fence closes only with the same character and at least as many. */
const fenceAfter = (open: string | null, line: string): string | null => {
  const m = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)/.exec(line);
  if (!m) return open;
  if (!open) return m[1][0] === "`" && m[2].includes("`") ? null : m[1];
  return m[1][0] === open[0] && m[1].length >= open.length && !m[2].trim() ? null : open;
};
/** Splits a body at headings of one level. Headings inside a code fence are text. */
function splitHeadings(text: string, level: number): { intro: string; sections: { title: string; body: string }[] } {
  const re = new RegExp(`^#{${level}}(?!#)[ \\t]+(\\S[^\\r\\n]*)`);
  const intro: string[] = [], sections: { title: string; lines: string[] }[] = [];
  let open: string | null = null;
  for (const line of text.split("\n")) {
    const was = open;
    open = fenceAfter(open, line);
    const m = was || open ? null : re.exec(line.trimEnd());
    if (m) sections.push({ title: closeHashes(m[1]).trim(), lines: [] });
    else (sections.length ? sections[sections.length - 1].lines : intro).push(line);
  }
  const tidy = (lines: string[]) => lines.join("\n").replace(/^(?:[ \t]*\r?\n)+/, "").trimEnd();
  return { intro: tidy(intro), sections: sections.map(s => ({ title: s.title, body: tidy(s.lines) })) };
}

const noContent = (body: string) => !body || /^none( yet)?\.?$/i.test(body.trim());
const humanName = (stem: string) => stem.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
const clip = (title: string) => title.replace(/\s+/g, " ").trim().slice(0, 160);

/** A date in a session file name: 2025-03-14-The-Salt-Road.md. */
export function sessionName(file: string): { date?: string; title: string } {
  const stem = stemOf(file), m = /^(\d{4}-\d{2}-\d{2})(?:[-_ ]+(.*))?$/.exec(stem);
  if (!m) return { title: humanName(stem) };
  const d = new Date(`${m[1]}T00:00:00Z`);
  const real = !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === m[1];
  return real ? { date: m[1], title: humanName(m[2] ?? "") || m[1] } : { title: humanName(stem) };
}

/** An index or roster of people: named like one, or mostly links to other files. */
export function looksLikeRoster(stem: string, body: string): boolean {
  if (/^(index|roster|list|npcs|npc[-_ ]?(index|list|roster)|characters|people|cast|directory|who[-_ ]?is[-_ ]?who|party|pcs)$/i.test(stem)) return true;
  const items = body.split("\n").filter(l => /^\s*(?:[-*+]|\d+[.)])\s+\S/.test(l));
  const linked = items.filter(l => /\]\([^)\s]+\.(md|markdown)(#[^)]*)?\)/i.test(l));
  return linked.length >= 5 && linked.length >= items.length * 0.6;
}

/** A page that is only a list of links to other files (an index). */
function isLinkIndex(body: string): boolean {
  const lines = body.split("\n").filter(l => l.trim() && !/^\s*#/.test(l));
  return lines.length > 0 && lines.every(l => /^\s*(?:[-*+]|\d+[.)])\s+.*\]\([^)\s]+\.(md|markdown)(#[^)]*)?\)/i.test(l));
}

const stateOf = (heading: string): QuestState | null => {
  const h = heading.toLowerCase();
  if (/rumou?r/.test(h)) return "rumour";
  if (/fail|abandon|dropped/.test(h)) return "failed";
  if (/done|complete|finished|resolved|closed/.test(h)) return "done";
  if (/^(active|open|current|ongoing|in progress)\b/.test(h)) return "active";
  return null;
};

/* ---- limits and what needs reading ---- */
/**
 * Which files must be read, from their paths and sizes alone, so a source that downloads files one by one (GitHub) fetches only
 * these: Markdown files that would be imported, plus the root README.md for the name. The library and archive are never read.
 * Fails when the repository is over a limit, before anything is downloaded.
 */
export function planRead(files: { path: string; size?: number }[]): { ok: true; wanted: string[] } | { ok: false; error: string } {
  try { for (const f of files) checkPath(f.path); } catch (e) { return { ok: false, error: (e as Error).message }; }
  const norm = normalise(files);
  if (norm.files.length > IMPORT_LIMITS.files) return { ok: false, error: `This repository has more than ${IMPORT_LIMITS.files} files, which is too many to import.` };
  const prefix = norm.top ? norm.top + "/" : "", wanted: string[] = [];
  let pages = 0, bytes = 0;
  for (const f of norm.files) {
    const w = place(f.path.split("/")), root = f.path.toLowerCase() === "readme.md";
    if (root && isMarkdown(f.path) && (f.size ?? 0) <= MAX_FILE_BYTES) { wanted.push(prefix + f.path); continue; }
    if (w.to === "library" || w.to === "archive" || w.to === "other" || w.to === "setup" || w.to === "readme" || !isMarkdown(f.path)) continue;
    if ((f.size ?? 0) > MAX_FILE_BYTES) continue;
    pages++; bytes += f.size ?? 0; wanted.push(prefix + f.path);
  }
  if (pages > IMPORT_LIMITS.pages) return { ok: false, error: `This repository has ${pages} Markdown files to import. The limit is ${IMPORT_LIMITS.pages}.` };
  if (bytes > IMPORT_LIMITS.chars * 2) return { ok: false, error: `The Markdown files in this repository are over ${Math.round(IMPORT_LIMITS.chars / 1_000_000 * 10) / 10} MB of text, which is too much to import at once.` };
  return { ok: true, wanted };
}

/* ---- the preview ---- */
export function previewRepo(input: RepoFile[], opts: { name?: string } = {}): ImportResult {
  try { for (const f of input) checkPath(f.path); } catch (e) { return { ok: false, error: (e as Error).message }; }
  const { files, top } = normalise(input);
  if (files.length > IMPORT_LIMITS.files) return { ok: false, error: `This repository has more than ${IMPORT_LIMITS.files} files, which is too many to import.` };
  if (!files.some(f => isNumbered(f.path.split("/")[0]) && f.path.includes("/"))) return { ok: false, error: "This is not an RP repository in the numbered layout. It has no 1-Now/, 2-Story/ or 3-People/ folder." };

  const pages: PlannedPage[] = [], tooBig: string[] = [], notices: string[] = [];
  const count = { archive: 0, readme: 0, setup: 0, empty: 0 };
  let stays = 0, skipped = 0, unmatched = 0, rosters = 0, front: ImportPreview["front"] = null, frontPath = "", rootReadme = "";
  const candidates: { file: RepoFile; where: Where }[] = [];
  for (const f of files) {
    const parts = f.path.split("/"), w = place(parts);
    if (w.to === "library") { stays++; continue; }
    if (w.to === "archive") { count.archive++; continue; }
    if (w.to === "setup") { count.setup++; continue; }
    if (w.to === "readme") { count.readme++; if (parts.length === 1 && f.text !== undefined) rootReadme = f.text; continue; }
    if (w.to === "other" || !isMarkdown(f.path) || (f.text ?? "").includes("\0")) { skipped++; continue; }
    candidates.push({ file: f, where: w });
  }
  if (candidates.length > IMPORT_LIMITS.pages) return { ok: false, error: `This repository has ${candidates.length} Markdown files to import. The limit is ${IMPORT_LIMITS.pages}.` };

  let total = 0;
  for (const { file, where: first } of candidates) {
    let where = first;
    const { path } = file, text = file.text;
    if (text === undefined || text.length > IMPORT_LIMITS.file) { tooBig.push(path); continue; }
    total += text.length;
    if (total > IMPORT_LIMITS.chars) return { ok: false, error: `The Markdown files in this repository are over ${Math.round(IMPORT_LIMITS.chars / 1_000_000 * 10) / 10} MB of text, which is too much to import at once.` };
    const md = readMarkdown(text), stem = stemOf(path);
    const fileTitle = clip(md.title ?? humanName(stem)) || humanName(stem) || "Page";
    const add = (p: Omit<PlannedPage, "visibility"> & { visibility?: PlannedPage["visibility"] }) => pages.push({ visibility: md.gmOnly || p.group === "gm" || p.group === "notes" ? "gm" : "players", ...p });
    if (!md.body && !md.title && !text.trim()) { count.empty++; continue; }

    if (where.to === "gm") {
      if (noContent(md.body) && !md.title) { count.empty++; continue; }
      add({ kind: "note", group: "gm", title: clip((md.title ?? humanName(stem)).replace(/\s*\(GM only\)\s*$/i, "")) || fileTitle, body: md.body, parent: "gm", path });
      continue;
    }
    if (md.gmOnly) where = { to: "page", group: "notes", kind: "note" }; // a file that says it is a GM part (front matter, "(GM only)") stays GM-only wherever it sits
    if (where.to === "front") {
      if (noContent(md.body)) { count.empty++; continue; }
      frontPath = path;
      if (md.body.length <= FRONT_MAX) front = { body: md.body, long: false };
      else { front = { body: md.body, long: true }; add({ kind: "note", group: "notes", title: fileTitle, body: md.body, parent: "notes", path, frontLink: true }); }
      continue;
    }
    if (where.to === "quests") {
      if (noContent(md.body)) { count.empty++; continue; }
      const heading = md.title ?? "Quests and Threads", leftovers: PlannedPage[] = [];
      const leftover = (title: string, body: string) => { if (!noContent(body)) leftovers.push({ kind: "note", group: "notes", title: clip(title) || "Quests and Threads", body, visibility: "gm", parent: "notes" }); };
      const quest = (title: string, body: string, state: QuestState, solo?: string) => pages.push({ kind: "quest", group: "quest", title: clip(title) || "Quest", body, visibility: md.gmOnly ? "gm" : "players", state, ...(solo ? { path: solo } : {}) });
      const h2 = splitHeadings(md.body, 2);
      const groups = h2.sections.map(s => ({ ...s, kids: splitHeadings(s.body, 3) }));
      if (groups.some(g => g.kids.sections.length)) {
        leftover(heading, h2.intro);
        for (const g of groups) {
          const state = stateOf(g.title) ?? "active";
          if (!g.kids.sections.length) { if (!noContent(g.body)) quest(g.title, g.body, state); continue; }
          leftover(`${heading}: ${g.title}`, g.kids.intro);
          for (const k of g.kids.sections) quest(k.title, k.body, state);
        }
      } else if (h2.sections.length && !h2.sections.every(s => stateOf(s.title))) {
        leftover(heading, h2.intro);
        for (const s of h2.sections) quest(s.title, s.body, stateOf(s.title) ?? "active");
      } else quest(heading, md.body, "active", path);
      pages.push(...leftovers);
      continue;
    }
    // where.to === "page" or a plain note
    if (where.to !== "page") continue;
    if (noContent(md.body) && !md.title) { count.empty++; continue; }
    if (where.group === "notes") { unmatched++; add({ kind: "note", group: "notes", title: fileTitle, body: md.body, parent: "notes", path }); continue; }
    if (where.group === "pc" || where.group === "npc") {
      if (looksLikeRoster(stem, md.body)) { rosters++; add({ kind: "note", group: "notes", title: fileTitle, body: md.body, parent: "notes", path }); continue; }
      add({ kind: "character", role: where.role, group: where.group, title: fileTitle, body: md.body, path });
      continue;
    }
    if (where.split === "factions") {
      const h2 = splitHeadings(md.body, 2);
      if (h2.sections.length < 2 && isLinkIndex(md.body)) { add({ kind: "note", group: "notes", title: fileTitle, body: md.body, parent: "notes", path }); rosters++; continue; }
      if (h2.sections.length >= 2) {
        if (!noContent(h2.intro)) add({ kind: "note", group: "notes", title: fileTitle, body: h2.intro, parent: "notes" });
        for (const s of h2.sections) add({ kind: "faction", group: "org", title: clip(s.title) || "Organization", body: s.body });
        continue;
      }
      add({ kind: "faction", group: "org", title: fileTitle, body: md.body, path });
      continue;
    }
    if (where.group === "session") {
      const named = sessionName(path);
      add({ kind: "session", group: "session", title: clip(md.title ?? named.title) || named.title, body: md.body, parent: "sessions", path, ...(named.date ? { date: named.date } : {}) });
      continue;
    }
    add({ kind: where.kind, group: where.group, title: fileTitle, body: md.body, path });
  }

  const n = (g: GroupId) => pages.filter(p => p.group === g).length;
  const companions = pages.filter(p => p.role === "companion").length;
  const rows: ImportRow[] = ([
    { from: "3-People/<name>.md", to: "Player characters", count: n("pc") },
    { from: "3-People/NPCs/ and Companions/", to: "NPCs", count: n("npc"), ...(companions ? { note: `${companions} ${companions === 1 ? "is a companion" : "are companions"}` } : {}) },
    { from: "4-World/ Lore, Places, Locations-and-Lore.md", to: "Places & lore", count: n("place") },
    { from: "4-World/Factions", to: "Organizations", count: n("org") },
    { from: "2-Story/Sessions/", to: "Session pages", count: n("session") },
    { from: "1-Now/Quests-and-Threads.md", to: "Quests", count: n("quest") },
    { from: "6-GM-Only/", to: "GM-only pages", count: n("gm"), note: "hidden from players" },
  ] as ImportRow[]).filter(r => r.count > 0);
  if (front) rows.splice(rows.findIndex(r => r.to === "GM-only pages") < 0 ? rows.length : rows.findIndex(r => r.to === "GM-only pages"), 0, { from: frontPath, to: front.long ? "Imported notes, linked from the front page" : "Front page: Where we are", count: 1 });

  const notImported = [
    { label: "8-Archive/", count: count.archive },
    { label: "README.md files", count: count.readme },
    { label: "AGENTS.md, .gitignore", count: count.setup },
    { label: "Empty files", count: count.empty },
  ].filter(x => x.count > 0);
  if (rosters) notices.push(`${rosters} index or roster ${rosters === 1 ? "file that lists" : "files that list"} many pages ${rosters === 1 ? "was" : "were"} kept as ${rosters === 1 ? "a note" : "notes"} instead of becoming one page.`);
  if (front?.long) notices.push(`The current state is longer than the front page can hold (${FRONT_MAX.toLocaleString("en-US")} characters), so it becomes a note with a link on the front page.`);
  if (tooBig.length) notices.push(`${tooBig.length} ${tooBig.length === 1 ? "file is" : "files are"} too big for a page (over ${IMPORT_LIMITS.file.toLocaleString("en-US")} characters) and will be left out.`);
  if (files.some(f => f.path === ".rpg-tools/files.json") && !pages.some(p => p.group === "gm")) notices.push("This was made by RPG Tools without the GM-only folder, so it has no GM-only pages.");
  if (!pages.length && !front) return { ok: false, error: "There is nothing to import. The numbered folders hold no Markdown pages." };

  const heading = /^#[ \t]+(\S[^\r\n]*)/m.exec(rootReadme)?.[1].trim();
  const fromFolder = humanName((opts.name ?? top).replace(/(-main|-master)$/i, ""));
  const repoName = clip(opts.name ?? top) || "repository";
  const campaignName = clip(heading || fromFolder) || "Imported campaign";
  return { ok: true, repoName, campaignName, files: files.length, rows, stays, notImported, unmatched, skipped, tooBig, notices, front, pages };
}

/* ---- links between imported files ---- */
const dirParts = (path: string) => path.split("/").slice(0, -1);
function resolveHref(from: string, href: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("/") || href.startsWith("#")) return null;
  let target = href.split(/[#?]/)[0];
  if (!target) return null;
  try { target = decodeURIComponent(target); } catch { return null; }
  const out = dirParts(from);
  for (const seg of target.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") { if (!out.length) return null; out.pop(); } else out.push(seg);
  }
  return out.join("/");
}
/** Runs `fn` on the parts of a text that are not code. */
function outsideCode(text: string, fn: (part: string) => string): string {
  let open: string | null = null, plain: string[] = [];
  const out: string[] = [], flush = () => { if (plain.length) out.push(fn(plain.join("\n"))); plain = []; };
  for (const line of text.split("\n")) {
    const was = open;
    open = fenceAfter(open, line);
    if (was || open) { if (!was) flush(); out.push(line); continue; }
    plain.push(line);
  }
  flush();
  return out.join("\n");
}
const LINK = /(!?)\[([^\]\n]{0,200})\]\(<?([^)\s>]+)>?(?:[ \t]+"[^"\n]*")?\)/g;
export function rewriteLinks(text: string, from: string, ids: Map<string, string>): string {
  if (!/\]\(/.test(text)) return text;
  const lower = new Map([...ids].map(([p, id]) => [p.toLowerCase(), id]));
  return outsideCode(text, part => part.split(/(`+[^`\n]*`+)/).map((seg, i) => i % 2 ? seg : seg.replace(LINK, (whole, bang: string, label: string, href: string) => {
    if (bang) return whole;
    const path = resolveHref(from, href), id = path ? ids.get(path) ?? lower.get(path.toLowerCase()) : undefined;
    if (!id || /[|[\]]/.test(label)) return whole;
    return label ? `[[${id}|${label}]]` : `[[${id}]]`;
  })).join(""));
}

/** The front page's text widget shows plain text, so the # signs of headings are dropped (the words stay). */
const plainHeadings = (text: string) => { let open: string | null = null; return text.split("\n").map(l => { const was = open; open = fenceAfter(open, l); return was || open ? l : l.replace(/^#{1,6}[ \t]+/, ""); }).join("\n"); };

/* ---- the new campaign ---- */
export type BuildOptions = { name?: string; now?: string; newId?: () => string };
/** A workspace holding only the new world, campaign and pages. Add it to the person's notes with `addImported`. */
export function buildCampaign(preview: ImportPreview, opts: BuildOptions = {}): { workspace: Workspace; campaignId: string; name: string } {
  const now = opts.now ?? new Date().toISOString(), mint = opts.newId ?? randomId;
  const name = clip(opts.name ?? "") || clip(preview.campaignName) || "Imported campaign";
  const worldId = mint(), campaignId = mint();
  const base = { worldId, campaignId, updatedAt: now };
  const folders: Partial<Record<"sessions" | "notes" | "gm", Entry>> = {};
  const folder = (key: "sessions" | "notes" | "gm") => {
    if (!folders[key]) folders[key] = { id: mint(), ...base, parentId: null, title: key === "sessions" ? "Sessions" : key === "notes" ? "Imported notes" : "GM only", kind: "folder", body: "", ...(key === "sessions" ? {} : { overviewVisibility: "gm" as const }) };
    return folders[key]!;
  };
  const ids = preview.pages.map(() => mint());
  const linkable = new Map<string, string>();
  preview.pages.forEach((p, i) => { if (p.path) linkable.set(p.path, ids[i]); });
  const order = new Map<number, number>();
  preview.pages.map((p, i) => ({ p, i })).filter(x => x.p.group === "session").sort((a, b) => (a.p.date ?? "").localeCompare(b.p.date ?? "") || a.i - b.i).forEach((x, k) => order.set(x.i, k + 1));

  const entries: Entry[] = preview.pages.map((p, i) => {
    let body = p.path ? rewriteLinks(p.body, p.path, linkable) : p.body;
    if (body.length > 100_000) body = p.body; // [[id|label]] can be longer than the link it replaces; a page body holds 100,000 characters
    const e: Entry = { id: ids[i], ...base, parentId: p.parent ? folder(p.parent).id : null, title: p.title, kind: p.kind, body, overviewVisibility: p.visibility };
    if (p.kind === "character") e.character = { ...defaultCharacter(), role: p.role ?? "npc" };
    if (p.kind === "quest") e.quest = newQuest(p.state ?? "active");
    if (p.kind === "session") {
      if (p.date) { e.recap = { status: "published", mine: true, playedOn: p.date, timeline: [], quotes: [], gmNotes: "", review: [] }; e.updatedAt = `${p.date}T12:00:00.000Z`; }
      e.order = order.get(i);
    }
    return e;
  });

  const standard = defaultFrontPage().widgets.filter(w => w.id !== "welcome");
  const longAt = preview.pages.findIndex(p => p.frontLink);
  const where = !preview.front ? [] : preview.front.long && longAt >= 0
    ? [{ id: "where", type: "links" as const, title: "Where we are", links: [{ label: "Current state", entryId: ids[longAt] }] }]
    : [{ id: "where", type: "text" as const, title: "Where we are", body: plainHeadings(preview.front.body), wide: true }];
  const frontPage = { widgets: [...where, ...standard] };

  const workspace = workspaceSchema.parse({
    schemaVersion: 1,
    worlds: [{ id: worldId, name, description: "", archived: false }],
    campaigns: [{ id: campaignId, worldId, name, description: "", github: { repository: "", branch: "main" }, frontPage }],
    entries: [...Object.values(folders), ...entries],
  });
  return { workspace, campaignId, name };
}

/** The person's notes plus the new world, campaign and pages. Everything already there is kept exactly as it is. */
export function addImported(current: Workspace, built: { workspace: Workspace }): Workspace {
  return workspaceSchema.parse({
    schemaVersion: 1,
    worlds: [...current.worlds, ...built.workspace.worlds],
    campaigns: [...current.campaigns, ...built.workspace.campaigns],
    entries: [...current.entries, ...built.workspace.entries],
  });
}

/* ---- reading files from a ZIP or a picked folder ---- */
/** UTF-8 text, or an error naming the file: a lossy decode would quietly change the wording. */
export function decodeText(bytes: Uint8Array, path: string): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error(`${path.slice(0, 80)} is not UTF-8 text, so nothing was imported. Save it as UTF-8 and try again.`); }
}
export type Source = { name: string; size: number; bytes: () => Promise<Uint8Array> };
/** The files for previewRepo from a source that reads one file at a time. Only the files that will be imported are read. */
export async function readSources(sources: Source[]): Promise<{ ok: true; files: RepoFile[] } | { ok: false; error: string }> {
  const plan = planRead(sources.map(s => ({ path: s.name, size: s.size })));
  if (!plan.ok) return plan;
  const wanted = new Set(plan.wanted);
  const files: RepoFile[] = [];
  try { for (const s of sources) files.push({ path: s.name, size: s.size, ...(wanted.has(s.name) ? { text: decodeText(await s.bytes(), s.name) } : {}) }); }
  catch (e) { return { ok: false, error: (e as Error).message }; }
  return { ok: true, files };
}
