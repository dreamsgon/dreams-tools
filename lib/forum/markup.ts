/*
 * How forum posts are written: the Encyclopedia's page text (paragraphs, headings, lists, > quotes, **bold**,
 * `code`, [[page links]]) plus what roleplay posts need: *italic*, __underline__, speech in quotes picked out, and
 * [collapse=Title] … [/collapse] for text a reader opens when they want it, [img]<picture>[/img] for a picture added
 * to the forum and :code: for one of the campaign's emoji. Pure, so the server and the browser
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
  | { type: "link"; target: string; label: string }
  | { type: "roll"; label: string; expr: string }
  /** One of the campaign's emoji, if it has one by that code (otherwise shown as the text). */
  | { type: "emoji"; code: string }
  /** A picture added to the forum, by its id, with words for those who can't see it. */
  | { type: "picture"; id: string; alt: string };
/** [img]<id>[/img] or [img=What it shows]<id>[/img]. */
const PICTURE = /\[img(?:=([^\]\n]{0,120}))?\]([a-f0-9-]{36})\[\/img\]/gi;
/** :code:, not inside a word or a time (10:30:45). */
const EMOJI = /(?<![\w:])(:[a-z][a-z0-9_]{1,31}:)(?![\w:])/g;
/** Inline parts: [roll] tags (rolls.ts), bold, code and links as on Encyclopedia pages, then underline, italic and speech. */
export function postInline(text: string): Inline[] {
  const out: Inline[] = [];
  const parts = text.split(/(\[roll(?:=[^\]\n]{0,60})?\][^[\]\n]{1,80}\[\/roll\]|\[img(?:=[^\]\n]{0,120})?\][a-f0-9-]{36}\[\/img\])/gi);
  for (const [i, part] of parts.entries()) {
    if (!part) continue;
    if (i % 2) {
      const img = /^\[img(?:=([^\]\n]{0,120}))?\]([a-f0-9-]{36})\[\/img\]$/i.exec(part);
      if (img) { out.push({ type: "picture", id: img[2]!.toLowerCase(), alt: (img[1] ?? "").trim() }); continue; }
      const m = /^\[roll(?:=([^\]\n]{0,60}))?\]([^[\]\n]{1,80})\[\/roll\]$/i.exec(part)!; out.push({ type: "roll", label: (m[1] ?? "").trim(), expr: m[2]!.trim() }); continue;
    }
    out.push(...plainInline(part));
  }
  return out;
}
function plainInline(text: string): Inline[] {
  const out: Inline[] = [];
  for (const p of proseParts(text)) {
    if (p.type !== "text") { out.push(p); continue; }
    for (const [i, part] of p.text.split(/(__[^_\n]+__|\*[^*\n]+\*|(?<![\w*])_[^_\n]+_(?![\w]))/g).entries()) {
      if (!part) continue;
      if (i % 2) { out.push(part.startsWith("__") ? { type: "underline", text: part.slice(2, -2) } : { type: "italic", text: part.slice(1, -1) }); continue; }
      // Speech: text in a pair of “curly” or "straight" quotes on one line.
      for (const [j, s] of part.split(/(“[^”\n]+”|"[^"\n]+")/g).entries()) if (s) out.push(...(j % 2 ? [{ type: "speech" as const, text: s }] : withEmoji(s)));
    }
  }
  return out;
}

/** Plain text with :code: picked out as emoji. */
export function withEmoji(text: string): Inline[] {
  return text.split(EMOJI).flatMap((s, i): Inline[] => !s ? [] : i % 2 ? [{ type: "emoji", code: s.slice(1, -1) }] : [{ type: "text", text: s }]);
}
/** The pictures a post shows, in order. */
export const pictureIds = (text: string) => [...text.matchAll(PICTURE)].map(m => m[2]!.toLowerCase());
/** The :codes: a post uses. */
export const emojiCodes = (text: string) => [...text.matchAll(EMOJI)].map(m => m[1]!.slice(1, -1));

/** Every [[page]] a post links to, so the server can tell the reader which ones they may open. */
export function linkTargets(text: string) {
  const out = new Set<string>();
  for (const m of text.matchAll(/\[\[([^\]\n|]+)(?:\|[^\]\n]*)?\]\]/g)) out.add(m[1]!.trim());
  return out;
}

/** Words in a post, as people count them. */
export const wordCount = (text: string) => (text.replace(/\[roll[^\]]*\][^[\]]*\[\/roll\]/gi, " ").replace(/\[\/?collapse[^\]]*\]/gi, " ").replace(PICTURE, " ").replace(EMOJI, " ").match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
