/*
 * Export a campaign as an RP repository: the numbered folder layout an AI GM skill reads.
 * rpExportFiles is pure: the same workspace and options always give the same files, byte for byte.
 *
 * Visibility. The export starts from campaignExport (this campaign plus shared world lore, nothing from other campaigns).
 * Every page, tab, quest objective, map pin, calendar and stat is then split into a player-visible part and a GM part,
 * using the same flags the player share uses (see playerCampaign in world-model.ts). Player-visible parts are written to the
 * public tree. GM parts (GM-only pages and tabs, ::: secret blocks, GM-only objectives, pins, routes, calendars, stats,
 * random tables, a draft recap) go to the same path under 6-GM-Only/, and only when includeGm is true. With includeGm false
 * there is no 6-GM-Only folder and no .rpg-tools/campaign.json (the full restore copy would hold every GM secret).
 */
import { campaignExport, playerText, stripSecrets, SECRET_OPEN, SECRET_CLOSE, type Workspace, type Entry, type Campaign } from "./world-model.ts";
import { formatDate, publicCalendar, moonPhase, seasonOn, dateOrdinal, type Calendar } from "./calendar-model.ts";
import { playerMap, mapKinds, type MapData, type MapPin } from "./map-model.ts";
import { routeTotals } from "./travel-model.ts";
import { goalStatus, questCategories, categoryOf, stateNames, newQuest, type QuestState } from "./quests.ts";
import { timelineMarkdown, quotesMarkdown } from "./recap-schema.ts";
import { tieTypesOf, tieTypeById } from "./ties.ts";
import { infoRows, templateOf } from "./templates.ts";
import { campaignTables, rangeLabel, rollLabel, type TableLibrary, type RandomTable } from "./tables.ts";
import { rollTarget, tableTarget } from "./inline.ts";

export type RpFile = { path: string; text: string };
export type RpExportOptions = {
  /** Write the GM parts (6-GM-Only/) and the full restore copy (.rpg-tools/campaign.json). False: a player-safe export. */
  includeGm: boolean;
  /** When the export was made (ISO). Only the Export-Log uses it. */
  exportedAt: string;
  /** The account's random tables. They live in their own store, not in the workspace. They are GM-only (players never get tables). */
  tables?: TableLibrary;
  /** The existing 8-Archive/Export-Log.md text, so the new line is added to it. */
  exportLog?: string;
};

/** Files RPG Tools rewrites on every export. Everything else is kept when it was changed after the last export. */
export const FOLDERS_LIST: readonly string[] = ["1-Now", "2-Story", "3-People", "4-World", "5-Rules-and-Setup", "6-GM-Only", "7-Library", "8-Archive"];
export const isRewrittenPath = (path: string) => path === "README.md" || path === "AGENTS.md" || path.startsWith(".rpg-tools/") || path.endsWith("/README.md") || path === "8-Archive/Export-Log.md";
/** Templates the AI GM fills in. An export never replaces one that already exists. */
export const keepIfExists = (path: string) => /^(6-GM-Only\/)?(2-Story\/Handoff-History|5-Rules-and-Setup\/(Player-Wishes|Overrides-and-Rulings))\.md$/.test(path) || path === "6-GM-Only/Director-Notes.md";

type Chunk = { gm: boolean; text: string; t?: boolean };
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** One flattened line. Secret blocks are cut first: flattening would hide their markers and leak them. */
const one = (s: string) => stripSecrets(s).replace(/\s+/g, " ").trim();
/** One side's text. Neighbouring list lines (t) stay together; everything else gets a blank line between. */
function join(cs: Chunk[], gm: boolean) {
  let s = "", prev = false;
  for (const c of cs) { const t = c.text.trim(); if (c.gm !== gm || !t) continue; s += s ? (prev && c.t ? "\n" : "\n\n") : ""; s += t; prev = !!c.t; }
  return s;
}
/** A heading above each side's text, only for a side that has any. */
function sec(heading: string, cs: Chunk[], gmHeading = heading): Chunk[] {
  return ([false, true] as const).flatMap(gm => { const body = join(cs, gm); return body ? [{ gm, text: `${gm ? gmHeading : heading}\n\n${body}` }] : []; });
}
/** One line: players get it through the player text filter (notes and rolls simplified, secrets cut). */
const ln = (gm: boolean, text: string): Chunk => ({ gm, text: gm ? text : playerText(text), t: true });
/** One list line that is already safe for its side. */
const L = (gm: boolean, text: string): Chunk => ({ gm, text: gm ? text : playerText(text), t: true });
const fenced = (text: string) => { const ticks = "`".repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map(m => m[0].length + 1))); return `${ticks}\n${text}\n${ticks}`; };

/** The ::: secret blocks of a text, each kept whole (an unclosed block runs to the end, as in the player view). */
function secretBlocks(text: string): string[] {
  if (!/:::/.test(text)) return [];
  const out: string[] = []; let cur: string[] | null = null;
  for (const line of text.split("\n")) {
    const bare = line.replace(/\r$/, "");
    if (!cur && SECRET_OPEN.test(bare)) { cur = []; continue; }
    if (cur) { if (SECRET_CLOSE.test(bare)) { out.push(cur.join("\n").trim()); cur = null; } else cur.push(line); }
  }
  if (cur) out.push(cur.join("\n").trim());
  return out.filter(Boolean).map(b => `::: secret\n${b}\n:::`);
}
/** Authored text: a player-visible one gives the player text plus its secrets as GM text; a GM-only one is all GM text. */
function txt(pub: boolean, raw: string, secretLabel = ""): Chunk[] {
  if (!raw.trim()) return [];
  if (!pub) return [{ gm: true, text: raw }];
  const secrets = secretBlocks(raw);
  return [{ gm: false, text: playerText(raw) }, ...(secrets.length ? [{ gm: true, text: `${secretLabel}${secrets.join("\n\n")}` }] : [])];
}

/* ---- names and paths ---- */
const FOLD: Record<string, string> = { "ø": "o", "Ø": "O", "æ": "ae", "Æ": "AE", "ß": "ss", "đ": "d", "Đ": "D", "ł": "l", "Ł": "L", "œ": "oe", "Œ": "OE", "þ": "th", "Þ": "Th" };
/** A readable ASCII, hyphenated file stem: letters and digits only, no dots or slashes, never a Windows device name or README. */
export function fileStem(title: string, fallback = "Page", max = 60): string {
  let s = title.replace(/[øØæÆßđĐłŁœŒþÞ]/g, c => FOLD[c] ?? c).normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length > max) s = s.slice(0, max).replace(/-+$/, "");
  if (!s) s = fallback;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9]|readme)$/i.test(s)) s += "-page";
  return s;
}
/** Throws for a path that could leave the repository root or is not plain ASCII. */
export function assertSafePath(path: string) {
  if (!path || path.startsWith("/") || path.includes("\\") || path.includes("\0") || /[^\x21-\x7e]/.test(path) || path.split("/").some(p => !p || p === "." || p === ".." || p.endsWith(".")))
    throw new Error(`Unsafe export path: ${path}`);
}
/** Names for items that share a folder: the lowest id keeps the plain name, the next get -2, -3 (case-insensitively unique). */
function assignNames(items: { id: string; base: string }[], taken = new Set<string>()): Map<string, string> {
  const out = new Map<string, string>();
  for (const it of [...items].sort((a, b) => cmp(a.id, b.id))) {
    let name = it.base, n = 2;
    while (taken.has(name.toLowerCase())) name = `${it.base}-${n++}`;
    taken.add(name.toLowerCase()); out.set(it.id, name);
  }
  return out;
}
const dirOf = (p: string) => p.split("/").slice(0, -1);
function relPath(from: string, to: string) {
  const a = dirOf(from), b = to.split("/"); let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...Array(a.length - i).fill(".."), ...b.slice(i)].join("/");
}

/* ---- SHA-256, so the content hashes work in the browser and in Node without async calls ---- */
const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
export function sha256Hex(bytes: Uint8Array): string {
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const total = Math.ceil((bytes.length + 9) / 64) * 64, buf = new Uint8Array(total), view = new DataView(buf.buffer);
  buf.set(bytes); buf[bytes.length] = 0x80;
  view.setUint32(total - 8, Math.floor(bytes.length / 0x20000000), false); view.setUint32(total - 4, (bytes.length << 3) >>> 0, false);
  const w = new Uint32Array(64), rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(o + i * 4, false);
    for (let i = 16; i < 64; i++) { const a = w[i - 15], b = w[i - 2]; w[i] = (w[i - 16] + (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) + w[i - 7] + (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10))) >>> 0; }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0, t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  return [...h].map(x => x.toString(16).padStart(8, "0")).join("");
}
export const textHash = (text: string) => sha256Hex(new TextEncoder().encode(text));

/* ---- what each entry contributes ---- */
const FOLDERS = FOLDERS_LIST;
type Where = { dir: string; fallback: string };
function whereOf(e: Entry): Where | null {
  switch (e.kind) {
    case "folder": case "quest": case "tasks": return null;
    case "session": return { dir: "2-Story/Sessions", fallback: "Session" };
    case "character": { const r = e.character?.role ?? "npc"; return r === "pc" ? { dir: "3-People", fallback: "Character" } : r === "companion" ? { dir: "3-People/Companions", fallback: "Companion" } : { dir: "3-People/NPCs", fallback: r === "creature" ? "Creature" : "NPC" }; }
    case "place": return { dir: "4-World/Places", fallback: "Place" };
    case "lore": case "note": return { dir: "4-World/Lore", fallback: "Lore" };
    case "faction": return { dir: "4-World/Factions", fallback: "Faction" };
    case "map": return { dir: "4-World/Maps", fallback: "Map" };
    case "vehicle": return { dir: "4-World/Vehicles", fallback: "Vehicle" };
    case "store": return { dir: "4-World/Stores", fallback: "Store" };
    default: return { dir: "4-World/Space", fallback: "Space" };
  }
}
const sessionDate = (e: Entry) => e.recap?.playedOn ?? /\b(\d{4}-\d{2}-\d{2})\b/.exec(e.title)?.[1] ?? e.updatedAt.slice(0, 10);
/** The opening paragraph of a text. Page links stay as [[id|Label]] so they are rewritten (or hidden) like any other link. */
const lead = (text: string, max = 300) => {
  const plain = text.replace(/\[\[([^\]\n]+)\]\]/g, (whole, inner: string) => {
    const roll = rollTarget(inner); if (roll) return roll.label ?? roll.formula;
    const table = tableTarget(inner); if (table) return table.label ?? table.name;
    const at = inner.indexOf("|"), raw = (at < 0 ? inner : inner.slice(0, at)).trim();
    return /^maptable:/i.test(raw) ? (at < 0 ? "" : inner.slice(at + 1).trim()) || "Battle map" : whole;
  }).replace(/\{\{([^|{}\n]+)\|[^{}\n]*\}\}/g, "$1").replace(/^[ \t]*:::.*$/gm, "");
  const para = plain.split(/\n\s*\n/).map(p => p.split("\n").filter(l => !/^\s*#/.test(l)).join(" ").replace(/[*`>]|^\s*[-*] /g, "").replace(/\s+/g, " ").trim()).find(Boolean) ?? "";
  return para.length > max ? para.slice(0, max - 3).replace(/\s+\S*$/, "").replace(/\[\[[^\]]*$/, "") + "..." : para;
};
const label = (t: string) => one(t).replace(/[[\]|]/g, " ");
/** The heading text a tab title gets in a page file. Bring-back uses it to find the tab again. */
export const headingLabel = label;
const dash = (p: string) => p.replace(/–/g, "-");
const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "" : typeof v === "boolean" ? (v ? "yes" : "no") : String(v));
const bullet = (head: string, value: string) => `- ${head}: ${value.replace(/\n/g, "\n  ")}`;

type Ctx = { ws: Workspace; c: Campaign; byId: Map<string, Entry>; ok: (id: string, gm: boolean) => boolean };
/** A link to another page, in the [[id|Title]] form that is turned into a file link at the end. Nothing when players can't read it. */
const ref = (cx: Ctx, id: string | null | undefined, gm: boolean) => { const t = id ? cx.byId.get(id) : undefined; return t && cx.ok(t.id, gm) ? `[[${t.id}|${label(t.title)}]]` : ""; };

function calendarChunks(c: Calendar): Chunk[] {
  const shown = c.visibility === "players", pub = publicCalendar(c), out: Chunk[] = [];
  const gm = !shown;
  const months = c.periods.map(p => `${p.name} (${p.days})`).join(", ");
  const season = seasonOn(c, c.current);
  const head = [`- Current date: ${formatDate(c, c.current)}`, ...(season ? [`- Season: ${season.name}`] : []), ...(c.weekdays.length ? [`- Weekdays: ${c.weekdays.join(", ")}`] : []), `- Months and festivals: ${months}`];
  out.push(L(gm, head.join("\n")));
  if (c.notes.trim()) out.push({ gm: true, text: `Calendar notes: ${c.notes}` });
  if (pub.almanacNotes?.trim() || c.almanacNotes?.trim()) out.push(ln(gm, `Almanac: ${c.almanacNotes}`));
  for (const m of c.moons ?? []) out.push(L(gm || m.visibility !== "players", `- Moon ${m.name}: ${moonPhase(c, m, c.current).name}${m.notes ? `. ${m.notes}` : ""}`));
  return sec(`### ${label(c.name)}`, out);
}

/** The text of one entry, split into player and GM chunks. */
function entryChunks(cx: Ctx, e: Entry): { chunks: Chunk[]; leadPub: string; leadGm: string } {
  const { ws } = cx, draft = e.recap?.status === "draft", ovPub = e.overviewVisibility === "players" && !draft;
  const cs: Chunk[] = [];
  const body = txt(ovPub, e.body, "## Secret lines in the overview\n\n");
  cs.push(...body);
  const tpl = templateOf(ws, e);
  if (tpl) cs.push(...sec("## Details", infoRows(ws, tpl, e, false).map(r => ln(!!r.gm || !ovPub || (!!r.pageId && !cx.ok(r.pageId, false)), bullet(label(r.label), String(r.value))))));
  for (const t of e.tabs ?? []) cs.push(...sec(`## ${label(t.title)}`, txt(t.visibility === "players" && !draft, t.body, ""), `## ${label(t.title)}${t.visibility === "players" && !draft ? " (secret lines)" : ""}`));
  if (e.recap) {
    const r = e.recap, shared = ovPub && r.status === "published";
    if (r.timeline.length) cs.push(...sec("## Recap timeline", txt(shared && !!r.shareTimeline, timelineMarkdown(r.timeline))));
    if (r.quotes.length) cs.push(...sec("## Recap quotes", txt(shared && !!r.shareQuotes, quotesMarkdown(r.quotes))));
    if (r.gmNotes.trim()) cs.push(...sec("## GM notes", [{ gm: true, text: r.gmNotes }]));
    const open = r.review.filter(i => i.state === "open");
    if (open.length) cs.push(...sec("## Recap items to check", open.map(i => L(true, `- ${i.kind}: ${one(i.name)}${i.text ? ` - ${one(i.text)}` : ""}`))));
  }
  if (e.kind === "character" && e.character) cs.push(...characterChunks(cx, e, draft));
  if (e.kind === "character" && e.profile) cs.push(...profileChunks(cx, e, draft));
  if (e.mapData) cs.push(...mapChunks(cx, e, draft));
  const first = (gm: boolean) => lead(body.filter(b => b.gm === gm).map(b => b.text).join("\n\n"));
  return { chunks: cs, leadPub: first(false), leadGm: first(true) };
}

function statChunks(c: Campaign, e: Entry, pubStats: boolean): { stats: Chunk[]; trackers: Chunk[] } {
  const ch = e.character!, vals = ch.statsByCampaign[c.id] ?? {};
  const stats = (c.statFields ?? []).filter(f => !f.archived && f.type !== "none").flatMap(f => { const v = fmt(vals[f.id]); return v ? [L(!(pubStats && f.visibility === "players"), bullet(label(f.label), v))] : []; });
  const trackers = (ch.trackers ?? []).map(t => L(!!t.gm || !pubStats, `- ${label(t.label)}: ${t.value}/${t.max}`));
  return { stats, trackers };
}
function characterChunks(cx: Ctx, e: Entry, draft: boolean): Chunk[] {
  const ch = e.character!, { c } = cx, out: Chunk[] = [], pubStats = ch.statsVisibility === "players" && !draft;
  const dir = [["Status", ch.status === "active" ? "" : ch.status], ["Group", ch.group], ["Location", ch.location], ["Faction", ch.faction], ["Tags", ch.tags.join(", ")]].filter(([, v]) => v);
  out.push(...sec("## Directory entry", dir.map(([k, v]) => L(true, `- ${k}: ${one(v)}`))));
  if (ch.role !== "pc") { const s = statChunks(c, e, pubStats); out.push(...sec("## Stats", s.stats), ...sec("## Trackers", s.trackers)); }
  if (ch.statblock?.trim()) out.push(...sec("## Statblock", [{ gm: true, text: fenced(ch.statblock) }]));
  return out;
}
function profileChunks(cx: Ctx, e: Entry, draft: boolean): Chunk[] {
  const p = e.profile!, shared = p.visibility === "players" && !draft, types = tieTypesOf(cx.ws.worlds.find(w => w.id === e.worldId)), out: Chunk[] = [];
  const it = (gm: boolean | undefined, text: string): Chunk => ln(!shared || !!gm, text);
  for (const t of p.traits) out.push(it(t.gm, `- Trait: ${label(t.label)}`));
  for (const f of p.bar.fields) if (f.value.trim()) out.push(it(p.bar.hidden || f.gm, bullet(`${label(p.bar.title || "Right now")} - ${label(f.label)}`, f.value)));
  for (const b of p.blocks) {
    if (b.kind === "beliefs") for (const x of b.beliefs) out.push(it(b.gm || x.gm, `- ${label(b.title)}: ${label(x.topic)}${x.stance ? ` - ${x.stance}` : ""}${x.detail ? `. ${x.detail}` : ""}`));
    if (b.kind === "text" && b.text.trim()) out.push(...txt(shared && !b.gm, b.text).map(x => ({ ...x, text: `${label(b.title)}: ${x.text}` })));
    if (b.kind === "ties") for (const t of b.ties) {
      const target = cx.byId.get(t.entryId), tgm = !target || !cx.ok(target.id, false), kind = t.typeId ? tieTypeById(types, t.typeId).name : "Knows";
      const link = ref(cx, t.entryId, tgm || b.gm || !shared || !!t.gm);
      if (link) out.push(it(b.gm || t.gm || tgm, `- ${kind}: ${link}${t.note ? ` - ${t.note}` : ""}`));
    }
  }
  return sec("## Profile", out);
}

function mapChunks(cx: Ctx, e: Entry, draft: boolean): Chunk[] {
  const m = e.mapData as MapData, pm = m.visibility === "players" && !draft ? playerMap(m) : null, out: Chunk[] = [];
  const pubPins = new Set(pm?.pins.map(p => p.id)), pubRoutes = new Set(pm?.routes?.map(r => r.id)), pubPaths = new Set(pm?.paths?.map(p => p.id.replace(/-\d+$/, "")));
  const pubLabels = new Set(pm?.labels?.map(l => l.id)), pubHexes = new Set(pm?.hexes?.map(h => h.cell));
  const kind = mapKinds[m.category] ?? "Map";
  out.push({ gm: !pm, text: [`- Kind: ${kind}${m.source === "image" ? " (picture map; the picture is not exported)" : ""}`, `- Grid: ${m.grid === "none" ? "none" : `${m.grid}, ${m.columns} x ${m.rows}`}`, ...(m.scale ? [`- Scale: the full width is ${m.scale.width} ${m.scale.unit}`] : [])].join("\n") });
  const pinLine = (p: MapPin, gm: boolean) => { const link = ref(cx, p.entryId, gm); return `- ${label(p.title)}${p.kind ? ` (${p.kind})` : ""} at ${Math.round(p.x * 100)}%, ${Math.round(p.y * 100)}%${p.notes.trim() ? `: ${one(p.notes)}` : ""}${link ? ` - ${link}` : ""}`; };
  out.push(...sec("### Pins", m.pins.map(p => ln(!pubPins.has(p.id), pinLine(p, !pubPins.has(p.id))))));
  const title = (id: string) => m.pins.find(p => p.id === id)?.title ?? "?";
  out.push(...sec("### Routes", (m.routes ?? []).map(r => { const t = routeTotals(r); return ln(!pubRoutes.has(r.id), `- ${label(r.name)}: ${r.stops.map(s => label(title(s))).join(" -> ")}; legs ${r.distances.join(", ")} ${r.unit}; total ${t.distance} ${r.unit}; ${r.speed} ${r.unit} per hour, ${r.hoursPerDay} hours a day, ${t.days} ${t.days === 1 ? "day" : "days"}`); })));
  out.push(...sec("### Roads, rivers and borders", (m.paths ?? []).map(p => ln(!pubPaths.has(p.id), `- ${p.kind}${p.name ? `: ${label(p.name)}` : ""}`))));
  out.push(...sec("### Labels on the map", (m.labels ?? []).map(l => ln(!pubLabels.has(l.id), `- ${label(l.text)}`))));
  out.push(...sec("### Notes on cells", (m.hexes ?? []).map(h => ln(!pubHexes.has(h.cell), `- Cell ${h.cell}${h.title ? ` ${label(h.title)}` : ""}${h.notes.trim() ? `: ${one(h.notes)}` : ""}`))));
  return sec("## Map", out);
}

/** Page headings sit one level lower inside a quest or task list section. */
const demote = (cs: Chunk[]): Chunk[] => cs.map(c => ({ ...c, text: c.text.replace(/^## /, "#### ") }));
/** A quest as a section of Quests-and-Threads.md. */
function questChunks(cx: Ctx, e: Entry): Chunk[] {
  const { c } = cx, q = e.quest ?? newQuest(), pub = e.overviewVisibility === "players" && e.recap?.status !== "draft", out: Chunk[] = [];
  const cat = categoryOf(questCategories(c), q.type), g = (hidden?: boolean) => !pub || !!hidden;
  const d: Chunk[] = [ln(!pub, `- Category: ${label(cat.name)}`)];
  const giver = ref(cx, q.giverId, !pub), place = ref(cx, q.placeId, !pub);
  if (giver) d.push(ln(!pub, `- Quest giver: ${giver}`)); if (place) d.push(ln(!pub, `- Place: ${place}`));
  const rewards = (q.rewardIds ?? []).map(id => ref(cx, id, g(q.rewardHidden))).filter(Boolean);
  if (q.reward || rewards.length) d.push(ln(g(q.rewardHidden), `- Reward: ${[q.reward, ...rewards].filter(Boolean).join("; ")}`));
  out.push(...d);
  out.push(...demote(entryChunks(cx, e).chunks));
  out.push(...sec("#### Objectives", q.objectives.map(o => { const s = goalStatus(o); return ln(g(o.hidden), `- [${s === "done" ? "x" : " "}] ${one(o.text)}${s === "failed" || s === "dropped" ? ` (${s})` : ""}${o.note ? `\n  - ${one(o.note)}` : ""}`); })));
  out.push(...sec("#### Journal", q.log.map(l => ln(g(!l.players), `- ${l.label || l.at.slice(0, 10)}${l.author ? ` (${label(l.author)})` : ""}: ${one(l.text)}`))));
  if (q.prep?.trim()) out.push(...sec("#### Preparation", [{ gm: true, text: q.prep }]));
  return out;
}

/* ---- the build ---- */
const PURPOSES: Record<string, string> = {
  "1-Now": "Everything needed to resume play: the current state, one sheet tracker per player character, quests and threads.",
  "2-Story": "What has happened: the timeline, the handoff history and one file per session.",
  "3-People": "Player characters, companions (Companions/) and non-player characters and creatures (NPCs/).",
  "3-People/NPCs": "Non-player characters and creatures.",
  "4-World": "Places, lore, factions, maps and other world pages. Maps are described as text; pictures are not exported.",
  "5-Rules-and-Setup": "The campaign contract: configuration, player wishes, overrides and rulings, and how to save.",
  "6-GM-Only": "Spoilers. Every GM-only part of the campaign, at the same path as the page it belongs to, plus the random tables and Director-Notes.md.",
  "7-Library": "Published reference material (rulebooks, setting books, map packs). Never edited. RPG Tools puts nothing here.",
  "8-Archive": "Superseded builds, raw exports and the export log. Never deleted.",
};

/** The front page text widget "Where we are". Its text is the "Next session starting point" in 1-Now/Current-State.md, so a change made in the repository can come back into it. */
export const WHERE_WIDGET = "where";
const NO_START = "None recorded yet. The GM writes the exact opening situation and the next decision here at the end of each session.";
function nextStart(c: Campaign): string {
  const w = c.frontPage?.widgets.find(x => x.id === WHERE_WIDGET && x.type === "text");
  const text = w && w.type === "text" ? playerText(w.body).trim() : "";
  return text || NO_START;
}

export function rpExportFiles(workspace: Workspace, campaignId: string, opts: RpExportOptions): RpFile[] {
  const ws = campaignExport(workspace, campaignId), c = ws.campaigns[0], world = ws.worlds[0], includeGm = opts.includeGm;
  const byId = new Map(ws.entries.map(e => [e.id, e]));
  const sorted = [...ws.entries].sort((a, b) => cmp(a.id, b.id));

  // File names are the same whether or not the GM parts are written.
  const dirs = new Map<string, { id: string; base: string }[]>();
  for (const e of sorted) {
    const w = whereOf(e); if (!w) continue;
    const base = e.kind === "session" ? `${sessionDate(e)}-${fileStem(e.title, "Session", 48)}` : fileStem(e.title, w.fallback);
    if (!dirs.has(w.dir)) dirs.set(w.dir, []);
    dirs.get(w.dir)!.push({ id: e.id, base });
  }
  const pubPath = new Map<string, string>(); // filled once we know which pages are public
  const QUESTS = "1-Now/Quests-and-Threads.md";
  const gmOf = (p: string) => `6-GM-Only/${p}`;
  const baseOf = (e: Entry) => (e.kind === "quest" || e.kind === "tasks" ? QUESTS : pubPath.get(e.id) ?? null);

  // Which entries have player text and which have GM text. Links depend on this and the text depends on links, so repeat until it settles.
  const pcIds = new Set(sorted.filter(e => e.kind === "character" && e.character?.role === "pc").map(e => e.id));
  // A PC is in the public tree only when the player share would show it: a player-visible overview, or shared stats with a shared field.
  const sharedFields = (c.statFields ?? []).some(f => !f.archived && f.visibility === "players" && f.type !== "none");
  const pubPcs = new Set([...pcIds].filter(id => { const e = byId.get(id)!; return e.recap?.status !== "draft" && (e.overviewVisibility === "players" || (e.character?.statsVisibility === "players" && (sharedFields || (e.character.trackers ?? []).some(t => !t.gm)))); }));
  let hasPub = new Set<string>(), hasGm = new Set<string>();
  const ok = (id: string, gm: boolean) => hasPub.has(id) || (gm && hasGm.has(id));
  const cx: Ctx = { ws, c, byId, ok };
  const pass = () => new Map(sorted.filter(e => e.kind !== "folder").map(e => [e.id, e.kind === "quest" ? { chunks: questChunks(cx, e), leadPub: "", leadGm: "" } : entryChunks(cx, e)] as const));
  let built = pass();
  for (let i = 0; i < 6; i++) {
    const p = new Set<string>(), g = new Set<string>();
    for (const [id, r] of built) { if (join(r.chunks, false) || pubPcs.has(id)) p.add(id); if (includeGm && join(r.chunks, true)) g.add(id); }
    const same = p.size === hasPub.size && g.size === hasGm.size && [...p].every(x => hasPub.has(x)) && [...g].every(x => hasGm.has(x));
    hasPub = p; hasGm = g;
    if (same) break;
    built = pass();
  }
  // Names. Public files are numbered among public pages only, so a GM-only page never shifts a public name. GM-only pages are
  // numbered after them, inside 6-GM-Only (a page with both parts keeps one name for both files).
  for (const [dir, items] of dirs) {
    const taken = new Set(["readme"]);
    for (const [id, name] of assignNames(items.filter(i => hasPub.has(i.id)), taken)) pubPath.set(id, `${dir}/${name}.md`);
    for (const [id, name] of assignNames(items.filter(i => !hasPub.has(i.id) && hasGm.has(i.id)), taken)) pubPath.set(id, `${dir}/${name}.md`);
  }
  const pathOf = (id: string, gm: boolean): string | null => {
    const e = byId.get(id), base = e ? baseOf(e) : null; if (!base) return null;
    return hasPub.has(id) ? base : gm && hasGm.has(id) ? gmOf(base) : null;
  };

  // [[id|Label]] becomes a relative file link. [[gm:id|Label]] links the GM-only twin. Anything that does not resolve, or that
  // players cannot read, becomes its label. Rolls stay as they are (the player text has already simplified them).
  const byTitle = new Map<string, Entry>();
  for (const e of [...sorted].sort((a, b) => Number(b.campaignId !== null) - Number(a.campaignId !== null) || cmp(b.id, a.id))) byTitle.set(e.title.trim().toLowerCase(), e);
  const tableFiles = new Map<string, string>();
  const rewrite = (text: string, from: string, gm: boolean) => text.replace(/\[\[([^\]\n]+)\]\]/g, (whole, inner: string) => {
    if (rollTarget(inner)) return whole;
    const tt = tableTarget(inner);
    if (tt) { const f = gm ? tableFiles.get(tt.name.toLowerCase()) : undefined; return f ? `[${label(tt.label ?? tt.name)}](${relPath(from, f)})` : tt.label ?? tt.name; }
    const at = inner.indexOf("|"), raw = (at < 0 ? inner : inner.slice(0, at)).trim(), lab = at < 0 ? "" : inner.slice(at + 1).trim();
    if (/^maptable:/i.test(raw)) return lab || "Battle map";
    const twinOnly = raw.startsWith("gm:"), target = twinOnly ? raw.slice(3) : raw;
    const e = byId.get(target) ?? byTitle.get(target.toLowerCase());
    const base = e ? baseOf(e) : null;
    const file = !e ? null : twinOnly ? (gm && hasGm.has(e.id) && base ? gmOf(base) : null) : pathOf(e.id, gm);
    if (!e || !file) return lab || (e ? "(hidden page)" : target);
    return `[${label(lab || e.title)}](${relPath(from, file)})`;
  });

  const out = new Map<string, string>(), meta = new Map<string, { desc: string; spoilers: boolean }>();
  const put = (path: string, text: string, desc: string, spoilers: boolean) => {
    assertSafePath(path); if (out.has(path)) throw new Error(`Duplicate export path: ${path}`);
    out.set(path, text.endsWith("\n") ? text : text + "\n"); meta.set(path, { desc, spoilers });
  };
  /** A file with a player version (written when it has text, or always) and a GM twin under 6-GM-Only (only with includeGm, only when it has text). */
  const twin = (path: string, title: string, cs: Chunk[], desc: string, o: { always?: boolean; fm?: (gm: boolean) => string } = {}) => {
    const p = join(cs, false), g = join(cs, true), head = (gm: boolean) => `${o.fm?.(gm) ?? ""}# ${title}${gm ? " (GM only)" : ""}\n\n`;
    if (p || o.always) put(path, rewrite(head(false) + (p || "None yet."), path, false), desc, false);
    if (includeGm && g) put(gmOf(path), rewrite(head(true) + g, gmOf(path), true), `${desc} - GM-only part`, true);
  };
  const fm = (e: Entry, gm: boolean) => `---\nrpg-tools-id: ${e.id}\nkind: ${e.kind}\nupdated: ${e.updatedAt}${gm ? "\npart: gm-only" : ""}\n---\n`;

  // Page files.
  const pageIds = new Map<string, string>(); // path -> entry id
  for (const e of sorted) {
    const base = whereOf(e) ? pubPath.get(e.id)! : null; if (!base) continue;
    const role = e.kind === "character" ? e.character?.role ?? "npc" : e.kind;
    twin(base, one(e.title), built.get(e.id)!.chunks, `${one(e.title)} (${role})`, { always: hasPub.has(e.id), fm: gm => fm(e, gm) });
    if (hasPub.has(e.id)) pageIds.set(base, e.id);
    if (hasGm.has(e.id)) pageIds.set(gmOf(base), e.id);
  }
  const people = sorted.filter(e => e.kind === "character"), pcs = people.filter(e => pcIds.has(e.id));
  const stemOf = (id: string) => (pubPath.get(id) ?? `${fileStem(byId.get(id)!.title, "Character")}.md`).split("/").pop()!.replace(/\.md$/, "");
  const calendars = c.calendars ?? [];
  const link = (id: string, gm: boolean) => `[[${gm ? "gm:" : ""}${id}|${label(byId.get(id)?.title ?? "")}]]`;

  // 1-Now
  const sessions = sorted.filter(e => e.kind === "session").sort((a, b) => cmp(sessionDate(b), sessionDate(a)) || cmp(b.updatedAt, a.updatedAt) || cmp(a.id, b.id));
  const latestPub = sessions.find(s => hasPub.has(s.id) && built.get(s.id)!.leadPub), latestGm = sessions.find(s => hasGm.has(s.id) && built.get(s.id)!.leadGm);
  twin("1-Now/Current-State.md", "Current State", [
    ...sec("## Date", calendars.map(cal => L(cal.visibility !== "players", `- ${label(cal.name)}: ${formatDate(cal, cal.current)}`))),
    ...sec("## Party", pcs.map(p => pubPcs.has(p.id) ? L(false, `- ${link(p.id, false)}`) : L(true, `- ${link(p.id, true)}`))),
    ...sec("## Most recent session", [...(latestPub ? [{ gm: false, text: `${link(latestPub.id, false)}\n\n${built.get(latestPub.id)!.leadPub}` }] : []), ...(latestGm ? [{ gm: true, text: `${link(latestGm.id, true)}\n\n${built.get(latestGm.id)!.leadGm}` }] : [])]),
    { gm: false, text: `## Next session starting point\n\n${nextStart(c)}` },
  ], "Where the story stands: date, party, most recent session, next starting point", { always: true });
  for (const pc of pcs) {
    const pub = pubPcs.has(pc.id), s = statChunks(c, pc, pub && pc.character!.statsVisibility === "players");
    twin(`1-Now/${stemOf(pc.id)}-Sheet-Tracker.md`, `${one(pc.title)} - Sheet Tracker`, [
      { gm: !pub, text: `Baseline from the character page, last changed ${pc.updatedAt}. Record played changes (damage, spending, advancement) under "Played changes". An export does not replace this file once you edited it.` },
      ...sec("## Stats", s.stats), ...sec("## Trackers", s.trackers), { gm: !pub, text: "## Played changes\n\nNone yet." },
    ], `${one(pc.title)}: stat values and trackers`, { always: pub });
  }
  const qs = sorted.filter(e => e.kind === "quest").sort((a, b) => (a.quest?.rank ?? 1e9) - (b.quest?.rank ?? 1e9) || cmp(a.title, b.title) || cmp(a.id, b.id));
  const questSecs: Chunk[] = [];
  for (const st of ["active", "rumour", "done", "failed"] as QuestState[]) questSecs.push(...sec(`## ${stateNames[st]}`, qs.filter(q => (q.quest?.state ?? "active") === st).flatMap(q => sec(`### ${label(q.title)}`, built.get(q.id)!.chunks))));
  questSecs.push(...sec("## Task lists", sorted.filter(e => e.kind === "tasks").flatMap(t => sec(`### ${label(t.title)}`, demote(built.get(t.id)!.chunks)))));
  twin(QUESTS, "Quests and Threads", questSecs, "Quests by status with objectives, and task lists", { always: true });

  // 2-Story
  const sline = (s: Entry, gm: boolean) => `- ${sessionDate(s)} - ${link(s.id, gm)}${(gm ? built.get(s.id)!.leadGm : built.get(s.id)!.leadPub) ? ` - ${gm ? built.get(s.id)!.leadGm : built.get(s.id)!.leadPub}` : ""}`;
  const events = calendars.flatMap(cal => [...cal.events].sort((a, b) => dateOrdinal(cal, a.date) - dateOrdinal(cal, b.date) || cmp(a.id, b.id)).map(ev =>
    L(cal.visibility !== "players" || ev.visibility !== "players", `- ${formatDate(cal, ev.date)}${ev.annual ? " (every year)" : ""} - ${label(ev.title)}${calendars.length > 1 ? ` (${label(cal.name)})` : ""}${ev.notes.trim() ? `: ${one(ev.notes)}` : ""}`)));
  twin("2-Story/Timeline.md", "Timeline", [
    ...sec("## Sessions, newest first", [...sessions.filter(s => hasPub.has(s.id)).map(s => L(false, sline(s, false))), ...sessions.filter(s => hasGm.has(s.id)).map(s => L(true, sline(s, true)))]),
    ...sec("## Calendar events", events),
  ], "Sessions newest first, then calendar events", { always: true });
  put("2-Story/Handoff-History.md", "# Handoff History\n\nSuperseded handoffs, newest first, word for word. Before writing a new handoff in 1-Now/Current-State.md, move the old one here.\n\n## Entry format\n\n- Date and session\n- The old Next session starting point, unchanged\n\n## Entries\n\nNone yet.\n", "Older handoffs, newest first", false);

  // 4-World indexes
  const by = (...kinds: string[]) => sorted.filter(e => kinds.includes(e.kind)).sort((a, b) => cmp(a.title.toLowerCase(), b.title.toLowerCase()) || cmp(a.id, b.id));
  const idx = (es: Entry[]) => [...es.filter(e => hasPub.has(e.id)).map(e => L(false, `- ${link(e.id, false)}${built.get(e.id)!.leadPub ? ` - ${built.get(e.id)!.leadPub}` : ""}`)), ...es.filter(e => hasGm.has(e.id)).map(e => L(true, `- ${link(e.id, true)}${built.get(e.id)!.leadGm ? ` - ${built.get(e.id)!.leadGm}` : ""}`))];
  const group = (title: string, ...kinds: string[]) => sec(`## ${title}`, idx(by(...kinds)));
  twin("4-World/Locations-and-Lore.md", "Locations and Lore", [...group("Places", "place"), ...group("Lore and notes", "lore", "note"), ...group("Maps", "map"), ...group("Vehicles", "vehicle"), ...group("Stores", "store"), ...group("Galaxies, sectors and star systems", "galaxy", "sector", "system")], "Index of places, lore, maps and other world pages", { always: true });
  twin("4-World/Factions.md", "Factions", group("Factions", "faction"), "Index of factions", { always: true });

  // 5-Rules-and-Setup
  const stat = (c.statFields ?? []).filter(f => !f.archived && f.type !== "none").map(f => L(f.visibility !== "players", `- ${label(f.label)} (${f.type}${f.section ? `, ${label(f.section)}` : ""})${f.options.length ? `: ${f.options.join(", ")}` : ""}`));
  const groups = [...new Set(people.map(p => (p.character?.group ?? "").trim()).filter(Boolean))].sort(cmp);
  const agreements = ["Ruleset / Edition", "Campaign Setting", "Campaign Focus", "Campaign Mode", "Advancement Method", "Heroic Reward Mechanic", "Monster Sources", "House Rules", "Standing OOC Preferences and Boundaries"].map(k => `- ${k}: not set yet`).join("\n");
  twin("5-Rules-and-Setup/Campaign-Configuration.md", "Campaign Configuration", [
    L(false, `- Campaign: ${one(c.name)}`), L(false, `- World: ${one(world.name)}`),
    { gm: false, text: `## Table agreements\n\nFill these in with the players. An export does not replace this file once you edited it.\n\n${agreements}` },
    ...sec("## Calendars", calendars.flatMap(calendarChunks)), ...sec("## Stat form fields", stat),
    ...sec("## Quest categories", questCategories(c).map(q => L(false, `- ${label(q.name)}`))),
    ...sec("## Character groups", groups.map(g => L(true, `- ${label(g)}`))),
  ], "Table agreements, calendars, stat form fields, quest categories, groups", { always: true });
  put("5-Rules-and-Setup/Player-Wishes.md", "# Player Wishes\n\nStanding out-of-character preferences and feedback from the players.\n\n## Entry format\n\n- Date - the wish or preference - standing or one-time - how the GM handles it\n\n## Entries\n\nNone yet.\n", "Standing preferences and feedback from the players", false);
  put("5-Rules-and-Setup/Overrides-and-Rulings.md", "# Overrides and Rulings\n\n## Entry format\n\n- Date - scope - previous state and replacement - dependent changes - standing or one-time\n- Date - question - temporary ruling - basis in the chosen rules - review needed\n\n## Player override log\n\nNone yet.\n\n## Temporary rulings\n\nNone yet.\n", "Player override log and temporary rulings", false);
  put("5-Rules-and-Setup/Save-Procedure.md", saveProcedure(), "How to save a session and bring changes back", false);
  // Random tables live in their own store and have no player visibility: they are GM-only.
  const allTables = opts.tables ? (t => [...t.tables, ...t.oracles])(campaignTables(opts.tables, c.id)) : [];
  if (includeGm && allTables.length) {
    const names = assignNames(allTables.map(t => ({ id: t.id, base: fileStem(t.name, "Table") })), new Set(["readme"]));
    const tablePath = (t: RandomTable) => gmOf(`5-Rules-and-Setup/Random-Tables/${names.get(t.id)}.md`);
    for (const t of [...allTables].sort((a, b) => cmp(a.id, b.id))) tableFiles.set(t.name.trim().toLowerCase(), tablePath(t));
    const tname = (id: string) => opts.tables!.tables.find(x => x.id === id)?.name ?? "?";
    for (const t of [...allTables].sort((a, b) => cmp(a.id, b.id))) put(tablePath(t), rewrite(tableText(t, tname), tablePath(t), true), `${one(t.name)} (${t.category}, ${rollLabel(t)})`, true);
  }

  // 6-GM-Only, 8-Archive
  if (includeGm) put("6-GM-Only/Director-Notes.md", "# Director Notes (GM only)\n\nThe campaign director review from the ai-gm-revised skill. Never shown to players.\n\n## Entry format\n\n- Date and session\n- Engagement, pacing, tone, variety, challenge, continuity\n- Future-facing adjustment, if any\n\n## Entries\n\nNone yet.\n", "Campaign director review notes", true);
  const logPath = "8-Archive/Export-Log.md";
  put(logPath, "", "One line per export: date and file count", false);

  // Folder READMEs: one line per file, a subfolder with its own README as one line.
  const readmeDirs = ["1-Now", "2-Story", "3-People", "3-People/NPCs", "4-World", "5-Rules-and-Setup", ...(includeGm ? ["6-GM-Only"] : []), "7-Library", "8-Archive"];
  for (const dir of readmeDirs) {
    const lines: string[] = [], readme = `${dir}/README.md`, subs = readmeDirs.filter(d => d.startsWith(dir + "/")), shown = new Set<string>();
    for (const p of [...out.keys()].sort(cmp)) {
      if (!p.startsWith(dir + "/")) continue;
      const sub = subs.find(d => p.startsWith(d + "/"));
      if (sub) { if (!shown.has(sub)) { shown.add(sub); lines.push(`- [${sub.slice(dir.length + 1)}/](${sub.slice(dir.length + 1)}/README.md) - ${PURPOSES[sub]} Spoilers: none.`); } continue; }
      const m = meta.get(p)!;
      lines.push(`- [${p.slice(dir.length + 1)}](${p.slice(dir.length + 1)}) - ${m.desc}. ${m.spoilers ? "Spoilers: yes." : "Spoilers: none."}`);
    }
    if (dir === "3-People/NPCs" && !lines.length) lines.push("None yet.");
    const gmDir = dir === "6-GM-Only", extra = dir === "5-Rules-and-Setup" && includeGm ? " Random tables are GM-only: see 6-GM-Only/5-Rules-and-Setup/Random-Tables/." : "";
    put(readme, `# ${dir.split("/").pop()}\n\n${PURPOSES[dir]}${extra}\n\nSpoilers: ${gmDir ? "yes, all of it. Keep this folder away from players." : "none. Everything here is player-visible."}\n${gmDir ? `\n## Campaign description (GM copy of the front page text)\n\n${c.description.trim() || "No description yet."}\n` : ""}\n## Files\n\n${lines.join("\n") || "None yet."}\n`, PURPOSES[dir], gmDir);
  }
  put("AGENTS.md", agentsText(c.name, includeGm), "Instructions for an AI GM", false);

  // README.md: front page.
  const dates = calendars.filter(x => x.visibility === "players").map(x => `${label(x.name)}: ${formatDate(x, x.current)}`);
  const open = qs.filter(q => (q.quest?.state ?? "active") === "active" && hasPub.has(q.id)).map(q => { const next = (q.quest?.objectives ?? []).find(o => !o.hidden && goalStatus(o) === "todo"); return `  - ${link(q.id, false)}${next ? ` - next: ${one(next.text)}` : ""}`; });
  const rows = FOLDERS.map(f => `| [${f}](${f}/README.md) | ${PURPOSES[f].replace(/\|/g, "/")} | ${f === "6-GM-Only" ? (includeGm ? "Yes, all of it" : "Not in this export") : "None"} |`);
  const front = `# ${one(c.name)}\n\nA campaign in the world "${one(world.name)}", exported from RPG Tools. AI GMs: read [AGENTS.md](AGENTS.md) first.\n\n## Where we are\n\n- In-game date: ${dates.length ? dates.join("; ") : "not set"}\n- Latest session: ${latestPub ? `${link(latestPub.id, false)} - ${built.get(latestPub.id)!.leadPub}` : "none shared yet"}\n- Open quests:${open.length ? "\n" + open.join("\n") : " none shared yet"}\n\n## Folders\n\n| Folder | What is in it | Spoilers |\n| --- | --- | --- |\n${rows.join("\n")}\n`;
  put("README.md", rewrite(front, "README.md", false), "Front page", false);

  // Export log, then the id map and hashes. The log counts every file of this export, itself included.
  const count = out.size + 1 + (includeGm ? 1 : 0);
  const logLines = (opts.exportLog ?? "").split("\n").filter(l => l.startsWith("- ") && !l.startsWith(`- ${opts.exportedAt} - `));
  out.set(logPath, `# Export Log\n\nOne line per export: date and file count.\n\n${[...logLines, `- ${opts.exportedAt} - ${count} files`].join("\n")}\n`);
  const hashes: Record<string, string> = {}, pages: Record<string, string> = {};
  for (const p of [...out.keys()].sort(cmp)) hashes[p] = textHash(out.get(p)!);
  for (const p of [...pageIds.keys()].sort(cmp)) pages[p] = pageIds.get(p)!;
  put(".rpg-tools/files.json", JSON.stringify({ format: "rpg-tools-files", version: 1, campaignId: c.id, includeGm, pages, hashes }, null, 2), "Page id map and content hashes", false);
  if (includeGm) put(".rpg-tools/campaign.json", JSON.stringify(ws, null, 2), "Full restore copy", true);
  return [...out.entries()].map(([path, text]) => ({ path, text })).sort((a, b) => cmp(a.path, b.path));
}

function tableText(t: RandomTable, name: (id: string) => string): string {
  const head = [`# ${one(t.name)} (GM only)`, `Category: ${t.category}. Kind: ${t.kind}${t.kind === "table" ? `, rolled as ${rollLabel(t)}` : ""}.`, ...(t.description ? [t.description] : [])];
  let body: string[] = [];
  if (t.kind === "table") body = (t.rows ?? []).map(r => `- ${t.mode === "ranges" ? dash(rangeLabel(r)) : `weight ${r.weight ?? 1}`}: ${r.text}`);
  else if (t.kind === "pair") body = [`Rolls ${t.pair!.map(name).join(" and ")} and joins the results with "${t.joiner ?? " · "}".`.replace("·", "-")];
  else if (t.kind === "generator") body = [...(t.parts ?? []).map(p => `- ${p.label}: roll ${name(p.tableId)}`), ...(t.extras ?? []).map(p => `- Extra, ${p.label}: roll ${name(p.tableId)}`)];
  else body = (t.odds ?? []).map(o => `- ${o.label}: ${o.yes}% yes`);
  return `${head.join("\n\n")}\n\n${body.join("\n")}`;
}

function saveProcedure(): string {
  return `# Save Procedure

Keep the repository the saved copy of play. Write the record before the end of every session.

## At the end of a session

1. Move the old handoff in 1-Now/Current-State.md to 2-Story/Handoff-History.md first, word for word.
2. Write the session record (ai-gm-revised end-of-session template, every heading, "None" when nothing changed) as 2-Story/Sessions/YYYY-MM-DD-Short-Title.md.
3. Copy each part to its home file:

| Heading | File |
| --- | --- |
| Session Summary | 2-Story/Sessions/YYYY-MM-DD-Short-Title.md |
| Updated Campaign State, Next Session Starting Point | 1-Now/Current-State.md |
| Player Character Updates, Treasure and Inventory Changes, Advancement, Heroic Reward Status | 1-Now/<PC>-Sheet-Tracker.md |
| Quest Updates, Outstanding Plot Threads | 1-Now/Quests-and-Threads.md |
| NPC Updates | 3-People/NPCs/ |
| Timeline Updates | 2-Story/Timeline.md |
| World Changes | 4-World/Locations-and-Lore.md |
| Faction Updates | 4-World/Factions.md |
| Player Override Log, Rules Questions and Temporary Rulings | 5-Rules-and-Setup/Overrides-and-Rulings.md |
| OOC Preferences and Feedback | 5-Rules-and-Setup/Player-Wishes.md if standing, otherwise the session record |
| Campaign Director Review | 6-GM-Only/Director-Notes.md (when that folder exists) |

4. Update "Where we are" in README.md if you can; the next export rewrites it from the campaign anyway.

## Getting the files to and from RPG Tools

- Push from RPG Tools: the export writes this layout and commits it. Files you edited since the last export are kept and listed, not overwritten. Files RPG Tools owns (see AGENTS.md) are always rewritten.
- Or edit the files here, commit them, and bring the changes back into RPG Tools with its bring-back step. It reads .rpg-tools/files.json to see which page files changed.
- Keep the front-matter block at the top of every page file. It ties the file to its page.
`;
}

function agentsText(name: string, gm: boolean): string {
  return `# AGENTS.md - instructions for an AI GM

This repository is the saved copy of the campaign "${one(name)}", exported by RPG Tools. Run it with the ai-gm-revised skill.

## Before you narrate

Read all of these first, in this order:

1. Every file in 1-Now/
2. 5-Rules-and-Setup/Campaign-Configuration.md
3. 5-Rules-and-Setup/Player-Wishes.md
4. 5-Rules-and-Setup/Overrides-and-Rulings.md
${gm ? `
This export includes 6-GM-Only/. It mirrors the paths of the player files: a page's GM-only tabs, secret lines and GM-only pages are at the same path under 6-GM-Only/ (for example 3-People/NPCs/Mara.md has its GM part at 6-GM-Only/3-People/NPCs/Mara.md). Read the GM twin of every file you read, and 6-GM-Only/Director-Notes.md. Never quote or hint at 6-GM-Only to players.
` : `
This is a player-safe export. It has no 6-GM-Only folder and no .rpg-tools/campaign.json (that restore copy would hold the GM's secrets). Hidden information is absent, not blank: do not invent secrets that contradict it, and ask the GM out of character when something is missing.
`}
Then resume from "Next session starting point" in 1-Now/Current-State.md. If records conflict, pause out of character and ask.

## Layout

- 1-Now/: what is needed to resume
- 2-Story/: timeline, handoff history, Sessions/
- 3-People/: player characters, Companions/, NPCs/
- 4-World/: Places/, Lore/, Factions/, Maps/, Vehicles/, Stores/, Space/
- 5-Rules-and-Setup/: configuration, wishes, rulings, save procedure
${gm ? "- 6-GM-Only/: spoilers and the GM-only twins\n" : ""}- 7-Library/ and 8-Archive/: reference and history, never edited

Every numbered folder has a README.md with one line per file and whether it holds spoilers.

## What RPG Tools rewrites on every export

Do not edit these; your changes would be lost:

- README.md and this AGENTS.md
- every README.md inside a numbered folder
- 8-Archive/Export-Log.md (one line is added per export)
- everything in .rpg-tools/ (files.json${gm ? " and campaign.json" : ""})

## What you may write

- New session files in 2-Story/Sessions/, named YYYY-MM-DD-Short-Title.md
- The files in 1-Now/ (Current-State.md, the Sheet-Tracker files, Quests-and-Threads.md) and 2-Story/Timeline.md
- Page files in 3-People/ and 4-World/ (new details, NPC updates, world changes)
- 2-Story/Handoff-History.md, 5-Rules-and-Setup/Player-Wishes.md and Overrides-and-Rulings.md${gm ? ", 6-GM-Only/Director-Notes.md" : ""}
- The "Table agreements" part of 5-Rules-and-Setup/Campaign-Configuration.md

An export does not replace a file you changed since the last export; it keeps it and says so.

## What happens to your files

RPG Tools compares this repository with its last push and lists each change against the page it belongs to. A new file becomes a new page. A changed page file updates its page, and the page keeps its earlier version in Page history. The index and overview files (Locations-and-Lore.md, Factions.md, Timeline.md, Quests-and-Threads.md) and the sections RPG Tools writes from data (Details, Directory entry, Stats, Trackers, Statblock, Profile, Map, recap lists) are rebuilt from the app, so put page text and play records in the page files and session files instead.

## Page files keep their front matter

Each page file starts with a small block between two lines of three dashes:

    ---
    rpg-tools-id: <the page's id>
    kind: <page kind>
    updated: <when RPG Tools last changed the page>
    ---

Do not remove or change it. It ties the file to its page in RPG Tools, so edits can be brought back. Write the new text below it.

## Writing rules

- Use straight ASCII quotes and apostrophes.
- Never reword recorded play. Keep session records, handoffs and rulings word for word.
- Follow 5-Rules-and-Setup/Save-Procedure.md at the end of every session.
`;
}

/** A page file's text without its front matter block, with line endings and the final newline made plain. */
export const withoutFrontMatter = (text: string) => text.replace(/^\uFEFF/, "").replace(/^---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/, "").replace(/\r\n/g, "\n").trimEnd();
/** True when two versions of a page file differ only in the front matter (for example its "updated" line) or in line endings. */
export const sameApartFromFrontMatter = (a: string, b: string) => withoutFrontMatter(a) === withoutFrontMatter(b);

/** The "## " sections of a page file the app writes from its data. Text under these headings is rebuilt on every export. */
export const DERIVED_SECTIONS = ["Details", "Directory entry", "Stats", "Trackers", "Statblock", "Profile", "Map", "Recap timeline", "Recap quotes", "GM notes", "Recap items to check", "Secret lines in the overview"];
/** The sections of one file that are written from data, by path. */
export function derivedSectionsOf(path: string): string[] {
  if (path === "1-Now/Current-State.md") return ["Date", "Party", "Most recent session"];
  if (/^1-Now\/.+-Sheet-Tracker\.md$/.test(path) || /^6-GM-Only\/1-Now\/.+-Sheet-Tracker\.md$/.test(path)) return ["Stats", "Trackers"];
  if (/^(6-GM-Only\/)?(3-People|4-World|2-Story\/Sessions)\//.test(path)) return DERIVED_SECTIONS;
  return [];
}
/** A page file's front matter lines other than "updated", which changes with every edit. */
const frontLines = (text: string) => /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text.replace(/^\uFEFF/, ""))?.[1].split(/\r?\n/).filter(l => l.trim() && !/^updated:/.test(l)).join("\n") ?? "";
/** A file split into what a person may write (kept) and what the app owns: the front matter and the sections it writes from data (owned). */
function splitOwned(text: string, drop: string[]) {
  const kept: string[] = [], owned: string[] = []; let skip = false, fence: string | null = null;
  for (const line of withoutFrontMatter(text).split("\n")) {
    const f = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (f) { if (!fence) fence = f[1]; else if (f[1][0] === fence[0] && f[1].length >= fence.length && !f[2].trim()) fence = null; }
    if (!fence && !f) { const h = /^## (.+?)\s*$/.exec(line); if (h) skip = drop.includes(h[1]); }
    (skip ? owned : kept).push(skip ? line : line.replace(/last changed \S+/, "last changed X"));
  }
  const tidy = (l: string[]) => l.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { kept: tidy(kept), owned: `${frontLines(text)}\n--\n${tidy(owned)}` };
}
/**
 * True when a repository file `a` is the app's own: it equals the new export `b` apart from the front matter, line endings and the sections the app
 * writes from its data (a heading that appears once in `b`, so a tab with the same name is never mistaken for one), and the app-owned parts of `a`
 * were not edited. Those parts must read like the new export, or like `prev` (the file as the last push wrote it, so the app has only moved on since).
 * Without `prev` (a new file) the file must hold none of them. A person's edit to the front matter or to a data section is never overwritten.
 */
export function sameApartFromOwned(path: string, a: string, b: string, prev?: string): boolean {
  const drop = derivedSectionsOf(path).filter(h => withoutFrontMatter(b).split("\n").filter(l => l.trimEnd() === `## ${h}`).length === 1);
  const A = splitOwned(a, drop), B = splitOwned(b, drop);
  if (A.kept !== B.kept) return false;
  if (A.owned === B.owned) return true;
  return prev === undefined ? A.owned === "\n--\n" : A.owned === splitOwned(prev, drop).owned;
}

/* ---- what to write, skip or delete when the files go into a repository ---- */
const ROOT_FILES = ["README.md", "AGENTS.md"];
/** A path an export could have produced: safe, and inside a numbered folder, .rpg-tools/ or one of the two root files. Never .git. */
export function isLayoutPath(path: string): boolean {
  try { assertSafePath(path); } catch { return false; }
  const top = path.split("/")[0];
  return ROOT_FILES.includes(path) || (path.includes("/") && (FOLDERS_LIST.includes(top) || top === ".rpg-tools"));
}
export type WriteSkip = { path: string; reason: "edited" | "unowned" | "template" };
export type WriteRemove = { path: string; reason: "gm" | "stale" };
/**
 * Decides what an export does to a repository. Pure, so the command line and the in-app push follow the same rules.
 * `existing` maps each layout file already there to the SHA-256 of its text. `previous` is the old .rpg-tools/files.json (parsed).
 *  - A file that is absent, unchanged, or still exactly as the last export wrote it is written.
 *  - A file that exists but was edited, or that the last export never recorded (even README.md or AGENTS.md), belongs to the user: skipped.
 *    Templates the AI GM fills in are skipped whenever they exist. Export-Log.md and the two .rpg-tools files are always written.
 *  - Without GM content, everything under 6-GM-Only/ and .rpg-tools/campaign.json is removed even if edited, since it holds secrets.
 *  - Files the last export wrote that this one no longer has are removed only when unedited, and only inside the layout.
 */
export function planWrite(existing: Map<string, string | null>, previous: unknown, newFiles: RpFile[], includeGm: boolean) {
  const prevHashes: Record<string, string> = {};
  const raw = previous && typeof previous === "object" ? (previous as { hashes?: unknown }).hashes : undefined;
  if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw)) if (typeof v === "string") prevHashes[k] = v;
  const write: RpFile[] = [], skip: WriteSkip[] = [], remove: WriteRemove[] = [], names = new Set(newFiles.map(f => f.path));
  for (const f of newFiles) {
    assertSafePath(f.path);
    const have = existing.get(f.path) ?? null;
    if (have === null || have === textHash(f.text) || f.path === "8-Archive/Export-Log.md" || f.path.startsWith(".rpg-tools/")) { write.push(f); continue; }
    if (keepIfExists(f.path)) { skip.push({ path: f.path, reason: "template" }); continue; }
    if (prevHashes[f.path] === have) write.push(f);
    else skip.push({ path: f.path, reason: prevHashes[f.path] === undefined ? "unowned" : "edited" });
  }
  for (const [path, have] of [...existing].sort((a, b) => cmp(a[0], b[0]))) {
    if (have === null || names.has(path) || !isLayoutPath(path)) continue;
    if (!includeGm && (path.startsWith("6-GM-Only/") || path === ".rpg-tools/campaign.json")) remove.push({ path, reason: "gm" });
    else if (prevHashes[path] === have && !path.startsWith(".rpg-tools/")) remove.push({ path, reason: "stale" });
  }
  return { write, skip, remove };
}
