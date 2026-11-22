/*
 * Write mode shows links by page name: the saved text keeps `[[page-id|Label]]`, so a link survives a rename,
 * while the editor shows `[[Label]]`. `namesForEditing` turns saved text into what the editor shows, and
 * `idsForSaving` turns what the GM typed back into saved text. Rolls, tables, Maptable scenes, AI chats,
 * pictures and code are left as they are, and a name that two pages share keeps its id so it can't change page.
 */
import { visibleEntries, type Entry, type Workspace } from "./world-model.ts";
import { rollTarget, tableTarget } from "./inline.ts";

// `[[…]]`, with `!` in front for an embed. A link inside `[words]{style}` still matches on its own brackets.
const LINK = /(!?)\[\[([^[\]\n]+)\]\]/g;
// Fenced blocks and `inline code` are shown exactly as written.
const CODE = /(^```[^\n]*\n[\s\S]*?(?:^```[^\n]*$|(?![\s\S]))|`[^`\n]+`)/m;
const SPECIAL = /^(maptable|ai-chat|table|picture):/i;

type Resolve = (target: string) => Entry | undefined;

/** The same lookup as resolveLink, built once for a whole text: an id first, then a title, this campaign's first. */
function resolver(s: Workspace, from: Entry): { byId: (id: string) => Entry | undefined; resolve: Resolve } {
  const pages = visibleEntries(s, from.worldId, from.campaignId), ids = new Map<string, Entry>(), names = new Map<string, Entry>();
  for (const e of pages) {
    if (!ids.has(e.id)) ids.set(e.id, e);
    const key = e.title.toLowerCase(), had = names.get(key);
    if (!had || (had.campaignId !== from.campaignId && e.campaignId === from.campaignId)) names.set(key, e);
  }
  return { byId: id => ids.get(id), resolve: t => ids.get(t) ?? names.get(t.toLowerCase()) };
}

/** Text the reader would not read as a page link: a roll, a table, a scene, a picture, or empty. */
const notAPage = (target: string) => !target.trim() || SPECIAL.test(target.trim()) || !!rollTarget(target) || !!tableTarget(target);
/** A name that can stand in a link by itself and still find this page. */
const safeName = (name: string, page: Entry, resolve: Resolve) =>
  !!name && name === name.trim() && !/[#|[\]\n]/.test(name) && !notAPage(name) && resolve(name)?.id === page.id;

function split(inner: string) {
  const bar = inner.indexOf("|"), target = bar < 0 ? inner : inner.slice(0, bar), rest = bar < 0 ? null : inner.slice(bar + 1);
  const hash = target.indexOf("#");
  return { page: (hash < 0 ? target : target.slice(0, hash)).trim(), section: hash < 0 ? "" : target.slice(hash), rest };
}

function outsideCode(text: string, change: (part: string) => string) {
  if (!text.includes("[[")) return text;
  return text.split(CODE).map((part, i) => (i % 2 ? part : change(part))).join("");
}

/** Saved text → what Write shows: `[[demo-mara|Mara Venn]]` reads `[[Mara Venn]]`. */
export function namesForEditing(s: Workspace, from: Entry, text: string): string {
  const { byId, resolve } = resolver(s, from);
  return outsideCode(text, part => part.replace(LINK, (whole, bang: string, inner: string) => {
    if (notAPage(inner)) return whole;
    const { page: id, section, rest } = split(inner), page = byId(id);
    if (!page || id === page.title) return whole;
    const label = rest?.trim() || null;
    // A plain link whose words find the page by themselves shows only those words.
    if (!bang && !section && label && safeName(label, page, resolve)) return `[[${label}]]`;
    if (!safeName(page.title, page, resolve)) return whole;
    return `${bang}[[${page.title}${section}${rest === null ? "" : "|" + rest}]]`;
  }));
}

/** What the GM typed → saved text: a link to a page by its name is saved with the page's id. */
export function idsForSaving(s: Workspace, from: Entry, text: string): string {
  const { byId, resolve } = resolver(s, from);
  return outsideCode(text, part => part.replace(LINK, (whole, bang: string, inner: string) => {
    if (notAPage(inner)) return whole;
    const { page: name, section, rest } = split(inner);
    if (!name || byId(name)) return whole;
    const page = resolve(name);
    if (!page) return whole;
    // `[[Mara Venn]]` keeps its words as the label, so the page reads the same.
    const tail = rest !== null ? "|" + rest : bang || section ? "" : "|" + name;
    return `${bang}[[${page.id}${section}${tail}]]`;
  }));
}
