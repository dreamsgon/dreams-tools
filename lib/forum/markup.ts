/*
 * How forum posts are written: the Encyclopedia's page text (paragraphs, headings, lists, > quotes, **bold**,
 * `code`, [[page links]]) plus what roleplay posts need: *italic*, __underline__, speech in quotes picked out, and
 * [collapse=Title] … [/collapse] for text a reader opens when they want it, [img]<picture>[/img] for a picture added
 * to the forum and :code: for one of the campaign's emoji, ~~strike~~ and [links](https://…). BBCode works too
 * (`fromBbcode`): [b], [i], [u], [s], [quote=Name], [code], [spoiler=Title], [url=…], [list][*]; the forum's settings
 * say which of the two the toolbar writes. Pure, so the server and the browser read posts the same way.
 */
import { proseBlocks, proseParts, type ProseBlock } from "../encyclopedia/player-prose.ts";
import { htmlNodes, htmlPictures, htmlText, type HtmlNode } from "./html.ts";

/** An [html]…[/html] section, already cut down to what's allowed (html.ts). */
export type HtmlBlock = { type: "html"; nodes: HtmlNode[] };
export type PostBlock = ProseBlock | HtmlBlock | { type: "collapse"; title: string; blocks: (ProseBlock | HtmlBlock)[] };
const HTML_PART = /\[html\]([\s\S]*?)(?:\[\/html\]|$)/gi, HTML_LINE = /^\u0001(\d+)\u0001$/;
/** [html] sections, set aside before anything else reads the post. */
export const htmlParts = (text: string) => [...text.matchAll(HTML_PART)].map(m => m[1]!);
const OPEN = /^\s*\[collapse(?:=([^\]\n]{0,80}))?\]\s*$/i, CLOSE = /^\s*\[\/collapse\]\s*$/i;

/** BBCode that marks text inside a line, and the Markdown it becomes (applied line by line, as Markdown marks don't cross lines). */
const BB_INLINE: [string, string][] = [["b", "**"], ["i", "*"], ["u", "__"], ["s", "~~"]];
/** Tags BBCode boards use for looks only (colour, size, font, alignment): their text is kept, the tags dropped. */
const BB_LOOKS = /\[\/?(?:color|colour|size|font|center|left|right|justify|align|highlight)(?:=[^\]\n]{0,40})?\]/gi;
const own = (t: string) => `\n${t.replace(/^\n+|\n+$/g, "")}\n`;
/**
 * BBCode as the forum's own markup, so a post may use either: bold, italic, underline and strike, quotes (with who
 * said it), code, spoilers (collapsed text), links and lists. [img], [roll] and [collapse] are the forum's own already.
 */
export function fromBbcode(text: string) {
  if (!/\[\/?[a-z*]/i.test(text)) return text;
  // Code is kept as written: set aside first, put back last.
  const codes: string[] = [];
  let t = text.replace(/\[code\]([\s\S]*?)\[\/code\]/gi, (_m, inner: string) => { codes.push(own("```\n" + inner.replace(/^\n+|\n+$/g, "") + "\n```")); return `\u0000${codes.length - 1}\u0000`; });
  for (let pass = 0; pass < 3; pass++) for (const [tag, mark] of BB_INLINE)
    t = t.replace(new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]`, "gi"), (_m, inner: string) => inner.split("\n").map(l => l.trim() ? `${mark}${l}${mark}` : l).join("\n"));
  for (let pass = 0; pass < 3; pass++) t = t.replace(/\[quote(?:=["']?([^\]\n"']{1,60})["']?)?\]((?:(?!\[quote)[\s\S])*?)\[\/quote\]/gi, (_m, who: string | undefined, inner: string) =>
    own(inner.replace(/^\n+|\n+$/g, "").split("\n").map(l => `> ${l.replace(/^> ?/, "")}`).join("\n") + (who?.trim() ? `\n> — ${who.trim()}` : "")));
  t = t.replace(/\[spoiler(?:=([^\]\n]{0,80}))?\]([\s\S]*?)\[\/spoiler\]/gi, (_m, title: string | undefined, inner: string) => own(`[collapse=${(title ?? "").trim() || "Spoiler"}]\n${inner.replace(/^\n+|\n+$/g, "")}\n[/collapse]`));
  t = t.replace(/\[url=["']?(https?:\/\/[^\s\]"']{1,500})["']?\]([^[\n]{1,200})\[\/url\]/gi, (_m, href: string, label: string) => `[${label.replace(/[[\]]/g, "")}](${href})`);
  t = t.replace(/\[url\](https?:\/\/[^\s[\]]{1,500})\[\/url\]/gi, (_m, href: string) => `[${href}](${href})`);
  t = t.replace(/\[list(?:=[^\]\n]{0,10})?\]([\s\S]*?)\[\/list\]/gi, (_m, inner: string) => own(inner.split(/\[\*\]/).slice(1).map(x => `- ${x.replace(/\s+/g, " ").trim()}`).join("\n")));
  return t.replace(BB_LOOKS, "").replace(/\u0000(\d+)\u0000/g, (_m, n: string) => codes[Number(n)] ?? "");
}

/** Blocks of a post, with collapsed sections (one level; an unclosed one runs to the end). */
export function postBlocks(source: string): PostBlock[] {
  // HTML is set aside on lines of its own, so neither BBCode nor Markdown touches it.
  const parts: string[] = [];
  const out: PostBlock[] = [], text = fromBbcode(source.replace(HTML_PART, (_m, inner: string) => { parts.push(inner); return `\n\u0001${parts.length - 1}\u0001\n`; }));
  // Prose with the HTML sections between its blocks.
  const read = (lines: string[]) => {
    const blocks: (ProseBlock | HtmlBlock)[] = [], run: string[] = [];
    const prose = () => { if (run.length) blocks.push(...proseBlocks(run.join("\n"))); run.length = 0; };
    let after = false; // Blank lines next to an HTML part are the ones set aside with it.
    for (const l of lines) {
      const h = l.trim().match(HTML_LINE);
      if (h) { while (run.length && !run.at(-1)!.trim()) run.pop(); prose(); blocks.push({ type: "html", nodes: htmlNodes(parts[Number(h[1])] ?? "") }); after = true; }
      else if (!(after && !l.trim())) { run.push(l); after = false; }
    }
    prose();
    return blocks;
  };
  let inner: string[] | null = null, title = "";
  const flush = () => { if (inner) out.push({ type: "collapse", title: title || "Show more", blocks: read(inner) }); inner = null; };
  const plain: string[] = [];
  const flushPlain = () => { if (plain.length) out.push(...read(plain)); plain.length = 0; };
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
  | { type: "text" | "bold" | "code" | "italic" | "underline" | "strike" | "speech"; text: string }
  /** A link to a web page (http or https only). */
  | { type: "url"; label: string; href: string }
  | { type: "link"; target: string; label: string }
  | { type: "roll"; label: string; expr: string }
  /** One of the campaign's emoji, if it has one by that code (otherwise shown as the text). */
  | { type: "emoji"; code: string }
  /** A feature or spell from a character's sheet, by name; readers who may see it get its text on hover. */
  | { type: "feature"; kind: "feature" | "spell"; char: string; id: string; name: string }
  /** A picture added to the forum, by its id, with words for those who can't see it. */
  | { type: "picture"; id: string; alt: string };
/** [img]<id>[/img] or [img=What it shows]<id>[/img]. */
const PICTURE = /\[img(?:=([^\]\n]{0,120}))?\]([a-f0-9-]{36})\[\/img\]/gi;
/** :code:, not inside a word or a time (10:30:45). */
const EMOJI = /(?<![\w:])(:[a-z][a-z0-9_]{1,31}:)(?![\w:])/g;
/** Inline parts: [roll] tags (rolls.ts), bold, code and links as on Encyclopedia pages, then underline, italic and speech. */
export function postInline(text: string): Inline[] {
  const out: Inline[] = [];
  const parts = text.split(/(\[roll(?:=[^\]\n]{0,60})?\][^[\]\n]{1,80}\[\/roll\]|\[img(?:=[^\]\n]{0,120})?\][a-f0-9-]{36}\[\/img\]|(?<!\[)\[[^[\]\n]{1,200}\]\(https?:\/\/[^\s)]{1,500}\)|\[(?:feature|spell)=[A-Za-z0-9_-]{1,100}\/[A-Za-z0-9_-]{1,100}\][^[\]\n]{1,80}\[\/(?:feature|spell)\])/gi);
  for (const [i, part] of parts.entries()) {
    if (!part) continue;
    if (i % 2) {
      const img = /^\[img(?:=([^\]\n]{0,120}))?\]([a-f0-9-]{36})\[\/img\]$/i.exec(part);
      if (img) { out.push({ type: "picture", id: img[2]!.toLowerCase(), alt: (img[1] ?? "").trim() }); continue; }
      const feat = FEATURE_ONE.exec(part);
      if (feat) { out.push({ type: "feature", kind: feat[1]!.toLowerCase() as "feature" | "spell", char: feat[2]!, id: feat[3]!, name: feat[4]!.trim() }); continue; }
      const url = /^\[([^[\]\n]{1,200})\]\((https?:\/\/[^\s)]{1,500})\)$/i.exec(part);
      if (url) { out.push({ type: "url", label: url[1]!.trim() || url[2]!, href: url[2]! }); continue; }
      const m = /^\[roll(?:=([^\]\n]{0,60}))?\]([^[\]\n]{1,80})\[\/roll\]$/i.exec(part);
      if (m) { out.push({ type: "roll", label: (m[1] ?? "").trim(), expr: m[2]!.trim() }); continue; }
    }
    out.push(...plainInline(part));
  }
  return out;
}
function plainInline(text: string): Inline[] {
  const out: Inline[] = [];
  for (const p of proseParts(text)) {
    if (p.type !== "text") { out.push(p); continue; }
    for (const [i, part] of p.text.split(/(__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|(?<![\w*])_[^_\n]+_(?![\w]))/g).entries()) {
      if (!part) continue;
      if (i % 2) { out.push(part.startsWith("__") ? { type: "underline", text: part.slice(2, -2) } : part.startsWith("~~") ? { type: "strike", text: part.slice(2, -2) } : { type: "italic", text: part.slice(1, -1) }); continue; }
      // Speech: text in a pair of “curly” or "straight" quotes on one line.
      for (const [j, s] of part.split(/(“[^”\n]+”|"[^"\n]+")/g).entries()) if (s) out.push(...(j % 2 ? [{ type: "speech" as const, text: s }] : withEmoji(s)));
    }
  }
  return out;
}

const FEATURE_ONE = /^\[(feature|spell)=([A-Za-z0-9_-]{1,100})\/([A-Za-z0-9_-]{1,100})\]([^[\]\n]{1,80})\[\/\1\]$/i;
/** The features and spells a post shows, as kind:character:id. */
export const featureRefs = (text: string) => [...text.matchAll(/\[(feature|spell)=([A-Za-z0-9_-]{1,100})\/([A-Za-z0-9_-]{1,100})\][^[\]\n]{1,80}\[\/\1\]/gi)].map(m => `${m[1]!.toLowerCase()}:${m[2]}:${m[3]}`);
/** Plain text with :code: picked out as emoji. */
export function withEmoji(text: string): Inline[] {
  return text.split(EMOJI).flatMap((s, i): Inline[] => !s ? [] : i % 2 ? [{ type: "emoji", code: s.slice(1, -1) }] : [{ type: "text", text: s }]);
}
/** The pictures a post shows, in order. */
export const pictureIds = (text: string) => [...withoutHtml(text).matchAll(PICTURE)].map(m => m[2]!.toLowerCase()).concat(htmlParts(text).flatMap(h => htmlPictures(htmlNodes(h))));
/** A post with its [html] sections as their text. */
export const withoutHtml = (text: string) => text.replace(HTML_PART, (_m, inner: string) => ` ${htmlText(htmlNodes(inner))} `);
/** The :codes: a post uses. */
export const emojiCodes = (text: string) => [...withoutHtml(text).matchAll(EMOJI)].map(m => m[1]!.slice(1, -1));

/** Every [[page]] a post links to, so the server can tell the reader which ones they may open. */
export function linkTargets(text: string) {
  const out = new Set<string>();
  for (const m of text.matchAll(/\[\[([^\]\n|]+)(?:\|[^\]\n]*)?\]\]/g)) out.add(m[1]!.trim());
  return out;
}

/** Words in a post, as people count them. */
export const wordCount = (text: string) => (fromBbcode(withoutHtml(text)).replace(/\]\(https?:\/\/[^\s)]+\)/g, "]").replace(/\[roll[^\]]*\][^[\]]*\[\/roll\]/gi, " ").replace(/\[\/?collapse[^\]]*\]/gi, " ").replace(PICTURE, " ").replace(EMOJI, " ").match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

/**
 * A post style with `text` in its {text} slot, and where that text sits. Inside an [html] part the words go in as
 * HTML text (escaped, blank lines as paragraphs), since an [html] part holds only HTML; elsewhere they go in as written.
 * A style with no slot goes first, then the text.
 */
export function fillStyle(body: string, text: string): { text: string; select: [number, number] } {
  const at = body.indexOf("{text}");
  if (at < 0) { const head = body + "\n\n"; return { text: head + text, select: [head.length, head.length + text.length] }; }
  const before = body.slice(0, at).toLowerCase(), inHtml = before.lastIndexOf("[html]") > before.lastIndexOf("[/html]");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paras = text.trim().split(/\n\s*\n/).map(p => esc(p.trim()).split("\n").join("<br>"));
  const inner = !inHtml ? text : paras.length > 1 ? paras.map(p => `<p>${p}</p>`).join("") : paras[0] ?? "";
  return { text: body.slice(0, at) + inner + body.slice(at + 6), select: [at, at + inner.length] };
}
