/*
 * How forum posts are written: the Encyclopedia's page text (paragraphs, headings, lists, > quotes, **bold**,
 * `code`, [[page links]]) plus what roleplay posts need: *italic*, __underline__, speech in quotes picked out, and
 * [collapse=Title] … [/collapse] for text a reader opens when they want it. Pure, so the server and the browser
 * read posts the same way.
 */
import { proseBlocks, proseParts, type ProseBlock } from "../encyclopedia/player-prose.ts";

export type PostBlock = ProseBlock | { type: "collapse"; title: string; blocks: ProseBlock[] };
const OPEN = /^\s*\[collapse(?:=([^\]\n]{0,80}))?\]\s*$/i, CLOSE = /^\s*\[\/collapse\]\s*$/i;

/** Blocks of a post, with collapsed sections (one level; an unclosed one runs to the end). */
export function postBlocks(text: string): PostBlock[] {
  const out: PostBlock[] = [];
  let inner: string[] | null = null, title = "";
  const flush = () => { if (inner) out.push({ type: "collapse", title: title || "Show more", blocks: proseBlocks(inner.join("\n")) }); inner = null; };
  const plain: string[] = [];
  const flushPlain = () => { if (plain.length) out.push(...proseBlocks(plain.join("\n"))); plain.length = 0; };
  for (const line of text.split("\n")) {
    const open = !inner && line.match(OPEN);
    if (open) { flushPlain(); inner = []; title = (open[1] ?? "").trim(); continue; }
    if (inner && CLOSE.test(line)) { flush(); continue; }
    (inner ?? plain).push(line);
  }
  flush(); flushPlain();
  return out;
}

export type Inline =
  | { type: "text" | "bold" | "code" | "italic" | "underline" | "speech"; text: string }
  | { type: "link"; target: string; label: string };
/** Inline parts: bold, code and links as on Encyclopedia pages, then underline, italic and speech. */
export function postInline(text: string): Inline[] {
  const out: Inline[] = [];
  for (const p of proseParts(text)) {
    if (p.type !== "text") { out.push(p); continue; }
    for (const [i, part] of p.text.split(/(__[^_\n]+__|\*[^*\n]+\*|(?<![\w*])_[^_\n]+_(?![\w]))/g).entries()) {
      if (!part) continue;
      if (i % 2) { out.push(part.startsWith("__") ? { type: "underline", text: part.slice(2, -2) } : { type: "italic", text: part.slice(1, -1) }); continue; }
      // Speech: text in a pair of “curly” or "straight" quotes on one line.
      for (const [j, s] of part.split(/(“[^”\n]+”|"[^"\n]+")/g).entries()) if (s) out.push({ type: j % 2 ? "speech" : "text", text: s });
    }
  }
  return out;
}

/** Every [[page]] a post links to, so the server can tell the reader which ones they may open. */
export function linkTargets(text: string) {
  const out = new Set<string>();
  for (const m of text.matchAll(/\[\[([^\]\n|]+)(?:\|[^\]\n]*)?\]\]/g)) out.add(m[1]!.trim());
  return out;
}

/** Words in a post, as people count them. */
export const wordCount = (text: string) => (text.replace(/\[\/?collapse[^\]]*\]/gi, " ").match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
