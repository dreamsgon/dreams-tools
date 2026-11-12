import { compareEntries, resolveLink, type Entry, type Workspace } from "./world-model.ts";

/**
 * Pages inside pages, links between them, and where a page is mentioned.
 * Any page can hold sub-pages in the same campaign (or both in shared lore); folders are just pages without text.
 */

const LINK = /\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/g;
// Text that must never be turned into a link: existing links, hover notes and inline code.
const PROTECTED = /(\[\[[^\]\n]+\]\]|\{\{[^{}\n]+\}\}|`[^`\n]+`)/;

const byId = (s: Workspace, id: string | null) => (id ? s.entries.find(e => e.id === id) : undefined);

/** Titles of the pages above this one, top first. */
export function pagePath(s: Workspace, e: Entry): string[] {
  const names: string[] = [], seen = new Set([e.id]);
  for (let p = byId(s, e.parentId); p && !seen.has(p.id); p = byId(s, p.parentId)) { seen.add(p.id); names.unshift(p.title); }
  return names;
}

export const childrenOf = (s: Workspace, id: string) => s.entries.filter(e => e.parentId === id).sort(compareEntries);

/** Every page below this one, at any depth. */
export function descendantCount(s: Workspace, id: string): number {
  let count = 0;
  const seen = new Set([id]), queue = [id];
  while (queue.length) { const at = queue.pop()!; for (const c of s.entries) if (c.parentId === at && !seen.has(c.id)) { seen.add(c.id); count++; queue.push(c.id); } }
  return count;
}

export function isInside(s: Workspace, id: string, ancestorId: string): boolean {
  const seen = new Set<string>();
  for (let p = byId(s, byId(s, id)?.parentId ?? null); p && !seen.has(p.id); p = byId(s, p.parentId)) { if (p.id === ancestorId) return true; seen.add(p.id); }
  return false;
}

export type DropPlace = "before" | "inside" | "after";

/** Why a drag cannot land here, or null when it can. */
export function dropProblem(s: Workspace, id: string, targetId: string, place: DropPlace): string | null {
  const entry = byId(s, id), target = byId(s, targetId);
  if (!entry || !target) return "That page is gone.";
  if (id === targetId || isInside(s, targetId, id)) return "A page can’t go inside itself.";
  if (entry.worldId !== target.worldId || entry.campaignId !== target.campaignId)
    return entry.campaignId === null ? "Shared lore stays in shared lore. Make a copy in the campaign instead." : "Campaign pages stay in their campaign.";
  const parent = place === "inside" ? target : byId(s, target.parentId);
  let depth = 1;
  for (let p = parent; p; p = byId(s, p.parentId)) if (++depth > 20) return "Use at most 20 levels of pages.";
  return null;
}

/** Moves a page before, after or inside another page, renumbering its new siblings. Returns null when it can’t move there. */
export function movePage(s: Workspace, id: string, targetId: string, place: DropPlace): Workspace | null {
  if (dropProblem(s, id, targetId, place)) return null;
  const entry = byId(s, id)!, target = byId(s, targetId)!;
  const parentId = place === "inside" ? target.id : target.parentId;
  const siblings = s.entries.filter(e => e.id !== id && e.worldId === entry.worldId && e.campaignId === entry.campaignId && e.parentId === parentId).sort(compareEntries);
  const at = place === "inside" ? siblings.length : siblings.findIndex(e => e.id === target.id) + (place === "after" ? 1 : 0);
  siblings.splice(at, 0, entry);
  const orders = new Map(siblings.map((e, i) => [e.id, i]));
  return { ...s, entries: s.entries.map(e => e.id === id ? { ...e, parentId, order: orders.get(e.id) } : orders.has(e.id) ? { ...e, order: orders.get(e.id) } : e) };
}

/** Pages a link typed on `from` can point at: its own campaign and shared lore in the same world. */
const linkable = (s: Workspace, from: Entry) => s.entries.filter(e => e.id !== from.id && e.worldId === from.worldId && (e.campaignId === null || e.campaignId === from.campaignId));

/** Best matches for a [[ or @ link, with where each page sits. An empty query lists recently changed pages. */
export function linkSuggestions(s: Workspace, from: Entry, query: string, limit = 6): { entry: Entry; path: string[] }[] {
  const q = query.trim().toLowerCase();
  const score = (e: Entry) => { const t = e.title.toLowerCase(); return !q ? 0 : t === q ? 0 : t.startsWith(q) ? 1 : t.split(/[\s\-–—'’]+/).some(w => w.startsWith(q)) ? 2 : t.includes(q) ? 3 : -1; };
  return linkable(s, from).map(e => ({ e, rank: score(e) })).filter(x => x.rank >= 0)
    .sort((a, b) => a.rank - b.rank || (q ? 0 : b.e.updatedAt.localeCompare(a.e.updatedAt)) || Number(b.e.campaignId === from.campaignId) - Number(a.e.campaignId === from.campaignId) || a.e.title.localeCompare(b.e.title))
    .slice(0, limit).map(({ e }) => ({ entry: e, path: pagePath(s, e) }));
}

/** The text a link is written as. Brackets and bars are dropped from the label so the link stays one piece. */
export const linkText = (e: Entry, label = e.title) => `[[${e.id}|${label.replace(/[[\]|\n]/g, "").trim() || e.title.replace(/[[\]|\n]/g, "")}]]`;

const texts = (e: Entry) => [e.body, ...(e.tabs ?? []).map(t => t.body)];
const plain = (t: string) => t.replace(/^[ \t]*:::.*$/gm, "").replace(LINK, (_, target: string, label?: string) => label?.trim() || target)
  .replace(/\{\{([^|{}\n]+)\|[^{}\n]*\}\}/g, "$1").replace(/^[ \t]*- \[[ xX]\] /gm, "").replace(/^#+ /gm, "").replace(/[*`>]/g, "").replace(/\s+/g, " ");

export type Mention = { entry: Entry; before: string; label: string; after: string };

/** Pages that link to this one, each with the words around its first link. */
export function mentionsOf(s: Workspace, entry: Entry): Mention[] {
  const out: Mention[] = [];
  for (const e of s.entries) {
    if (e.id === entry.id || e.worldId !== entry.worldId || !(entry.campaignId === null || e.campaignId === entry.campaignId)) continue;
    for (const text of texts(e)) {
      const hit = [...text.matchAll(LINK)].find(m => resolveLink(s, e, m[1])?.id === entry.id);
      if (!hit) continue;
      const at = hit.index!, before = plain(text.slice(Math.max(0, at - 160), at)).trimStart(), after = plain(text.slice(at + hit[0].length, at + hit[0].length + 160)).trimEnd();
      out.push({ entry: e, before: (before.length > 48 ? "…" + before.slice(-48).replace(/^\S*\s/, "") : before), label: hit[2]?.trim() || entry.title, after: after.length > 48 ? after.slice(0, 48).replace(/\s\S*$/, "") + "…" : after });
      break;
    }
  }
  return out.sort((a, b) => b.entry.updatedAt.localeCompare(a.entry.updatedAt));
}

const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const nameRegex = (title: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(title.trim())}(?![\\p{L}\\p{N}])`, "iu");

/** Index of the first plain-text use of the name, skipping links, notes and code; -1 when none. */
function firstPlainMention(text: string, title: string): { at: number; length: number } | null {
  const pattern = nameRegex(title);
  let offset = 0;
  for (const [i, part] of text.split(PROTECTED).entries()) {
    if (i % 2 === 0) { const m = part.match(pattern); if (m) return { at: offset + m.index!, length: m[0].length }; }
    offset += part.length;
  }
  return null;
}

/** Pages that name this page in plain text but never link to it. Short names (under 3 letters) and folders are left out. */
export function unlinkedMentions(s: Workspace, entry: Entry): Entry[] {
  if (entry.kind === "folder" || entry.title.trim().length < 3) return [];
  const linked = new Set(mentionsOf(s, entry).map(m => m.entry.id));
  return s.entries.filter(e => e.id !== entry.id && !linked.has(e.id) && e.kind !== "folder" && e.worldId === entry.worldId && (entry.campaignId === null || e.campaignId === entry.campaignId)
    && texts(e).some(t => firstPlainMention(t, entry.title))).sort((a, b) => a.title.localeCompare(b.title));
}

/** Turns the first plain-text use of the page’s name into a link on each of the given pages. */
export function linkMentions(s: Workspace, entry: Entry, pageIds: string[], now = new Date().toISOString()): Workspace {
  const ids = new Set(pageIds);
  const link = (text: string) => { const m = firstPlainMention(text, entry.title); return m ? text.slice(0, m.at) + linkText(entry, text.slice(m.at, m.at + m.length)) + text.slice(m.at + m.length) : null; };
  return { ...s, entries: s.entries.map(e => {
    if (!ids.has(e.id)) return e;
    const body = link(e.body);
    if (body !== null) return { ...e, body, updatedAt: now };
    const tabs = e.tabs ?? [], at = tabs.findIndex(t => firstPlainMention(t.body, entry.title));
    return at < 0 ? e : { ...e, tabs: tabs.map((t, i) => i === at ? { ...t, body: link(t.body)! } : t), updatedAt: now };
  }) };
}
