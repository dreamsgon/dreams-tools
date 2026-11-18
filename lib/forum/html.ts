/*
 * HTML in forum posts, for boards whose permissions let a group use it ([html]…[/html] in a post). Nothing typed is
 * ever put into the page as HTML: `htmlNodes` reads the text into a small tree of allowed tags, attributes and
 * styles, and the forum builds elements from that tree (forum-parts.tsx) or writes it out escaped (forum-export.ts).
 * Scripts, event handlers, frames, forms, outside pictures and positioning are dropped; links must be https, and
 * pictures must be ones added to the forum (by id). Pure.
 */

export type HtmlNode = string | { tag: string; attrs: Record<string, string>; style: Record<string, string>; children: HtmlNode[] };

/** Tags kept as they are. `center` and `font` become a div and a span. */
const TAGS = new Set(["div", "span", "p", "br", "hr", "b", "strong", "i", "em", "u", "s", "small", "sup", "sub", "mark", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "blockquote", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "img", "a", "center", "font", "figure", "figcaption", "details", "summary"]);
const VOID = new Set(["br", "hr", "img"]);
/** Tags dropped with everything inside them. */
const DROP = new Set(["script", "style", "iframe", "object", "embed", "noscript", "template", "svg", "math", "form", "textarea", "select", "button", "input", "video", "audio", "link", "meta", "base", "head", "title"]);

const COLOR = /^(?:#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([\d\s.,%/]+\)|[a-z]{3,20})$/i;
const LENGTH = "(?:0|\\d{1,4}(?:\\.\\d{1,3})?(?:px|em|rem|%|vh|vw|ch|pt))";
const LENGTHS = new RegExp(`^${LENGTH}(?:\\s+${LENGTH}){0,3}$`, "i");
const LEN1 = new RegExp(`^(?:${LENGTH}|auto)$`, "i");
/** Fonts a post may ask for: common ones every device has something for. */
const FONTS = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "georgia", "times new roman", "garamond", "palatino", "palatino linotype",
  "book antiqua", "baskerville", "arial", "helvetica", "verdana", "tahoma", "trebuchet ms", "courier new", "courier", "impact", "comic sans ms", "segoe ui", "lucida console"]);
const one = (...words: string[]) => new RegExp(`^(?:${words.join("|")})$`, "i");
const BORDER = new RegExp(`^(?:(?:${LENGTH}|none|solid|dashed|dotted|double|groove|ridge|inset|outset|#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\\([\\d\\s.,%/]+\\)|[a-z]{3,20})\\s*){1,3}$`, "i");
const SHADOW = /^(?:none|(?:(?:-?\d{1,3}(?:\.\d{1,2})?(?:px|em)?|#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([\d\s.,%/]+\)|[a-z]{3,20}|inset)\s*){2,6}(?:,\s*(?:(?:-?\d{1,3}(?:\.\d{1,2})?(?:px|em)?|#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([\d\s.,%/]+\)|[a-z]{3,20}|inset)\s*){2,6}){0,3})$/i;
const GRADIENT = /^(?:repeating-)?(?:linear|radial)-gradient\((?:[\w\s.,%#/-]|(?:rgb|rgba|hsl|hsla)\([\d\s.,%/]+\)){1,400}\)$/i;

/** Each allowed style and what its value may be. Positioning, transforms, pictures by address and negative space are left out. */
const STYLES: Record<string, (v: string) => boolean> = {
  "color": v => COLOR.test(v),
  "background-color": v => COLOR.test(v),
  "background": v => COLOR.test(v) || GRADIENT.test(v),
  "background-image": v => GRADIENT.test(v),
  "opacity": v => /^(?:0|1|0?\.\d{1,3})$/.test(v),
  "font-size": v => { const m = /^(\d{1,3}(?:\.\d{1,2})?)(px|em|rem|%)$/i.exec(v); if (!m) return one("x-small", "small", "medium", "large", "x-large", "smaller", "larger").test(v); const n = Number(m[1]), u = m[2]!.toLowerCase(); return u === "px" ? n >= 8 && n <= 48 : u === "%" ? n >= 50 && n <= 300 : n >= 0.5 && n <= 3; },
  "font-family": v => v.split(",").every(f => FONTS.has(f.trim().replace(/^["']|["']$/g, "").toLowerCase())),
  "font-weight": v => one("normal", "bold", "bolder", "lighter", "[1-9]00").test(v),
  "font-style": v => one("normal", "italic", "oblique").test(v),
  "font-variant": v => one("normal", "small-caps").test(v),
  "text-align": v => one("left", "right", "center", "justify", "start", "end").test(v),
  "text-decoration": v => /^(?:(?:none|underline|overline|line-through|solid|dotted|dashed|wavy|double|#[0-9a-f]{3,8}|[a-z]{3,20})\s*){1,3}$/i.test(v),
  "text-transform": v => one("none", "uppercase", "lowercase", "capitalize").test(v),
  "text-shadow": v => SHADOW.test(v),
  "text-indent": v => LEN1.test(v),
  "letter-spacing": v => /^(?:normal|-?\d(?:\.\d{1,3})?(?:px|em))$/i.test(v),
  "line-height": v => /^(?:normal|\d(?:\.\d{1,2})?|\d{1,3}(?:px|%|em))$/i.test(v),
  "white-space": v => one("normal", "nowrap", "pre", "pre-wrap", "pre-line").test(v),
  "vertical-align": v => one("top", "middle", "bottom", "baseline", "text-top", "text-bottom", "sub", "super").test(v),
  "margin": v => LENGTHS.test(v) || /^(?:auto|0)(?:\s+(?:auto|0|\d{1,4}(?:px|em|%)))*$/i.test(v),
  "padding": v => LENGTHS.test(v),
  "border": v => BORDER.test(v), "border-top": v => BORDER.test(v), "border-bottom": v => BORDER.test(v), "border-left": v => BORDER.test(v), "border-right": v => BORDER.test(v),
  "border-color": v => v.split(/\s+/).every(c => COLOR.test(c)),
  "border-style": v => /^(?:(?:none|solid|dashed|dotted|double|groove|ridge|inset|outset)\s*){1,4}$/i.test(v),
  "border-width": v => LENGTHS.test(v),
  "border-radius": v => LENGTHS.test(v),
  "border-collapse": v => one("collapse", "separate").test(v),
  "box-shadow": v => SHADOW.test(v),
  "width": v => LEN1.test(v), "max-width": v => LEN1.test(v) || v === "none", "min-width": v => LEN1.test(v),
  "height": v => LEN1.test(v), "max-height": v => LEN1.test(v) || v === "none", "min-height": v => LEN1.test(v),
  "display": v => one("block", "inline", "inline-block", "flex", "inline-flex", "grid", "none", "table", "table-row", "table-cell", "list-item").test(v),
  "flex": v => /^(?:\d{1,2}(?:\s+\d{1,2})?(?:\s+(?:auto|\d{1,4}(?:px|%|em)))?|auto|none)$/i.test(v),
  "flex-direction": v => one("row", "column", "row-reverse", "column-reverse").test(v),
  "flex-wrap": v => one("wrap", "nowrap").test(v),
  "justify-content": v => one("start", "end", "center", "space-between", "space-around", "space-evenly", "flex-start", "flex-end").test(v),
  "align-items": v => one("start", "end", "center", "stretch", "baseline", "flex-start", "flex-end").test(v),
  "gap": v => LENGTHS.test(v),
  "grid-template-columns": v => /^(?:(?:repeat\(\d{1,2},\s*[\w.%()\s,]{1,40}\)|minmax\([\w.%\s,]{1,30}\)|\d{1,4}(?:px|fr|%|em)|auto)\s*){1,8}$/i.test(v),
  "float": v => one("left", "right", "none").test(v),
  "clear": v => one("left", "right", "both", "none").test(v),
  "overflow": v => one("visible", "hidden", "auto", "scroll").test(v),
  "list-style-type": v => one("none", "disc", "circle", "square", "decimal", "lower-roman", "upper-roman", "lower-alpha", "upper-alpha").test(v),
  "object-fit": v => one("cover", "contain", "fill", "none").test(v),
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", copy: "©", middot: "·", bull: "•", times: "×" };
export const decodeEntities = (t: string) => t.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (m, e: string) => {
  if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 && !(n >= 0xd800 && n < 0xe000) ? String.fromCodePoint(n) : ""; }
  return ENTITIES[e.toLowerCase()] ?? m;
});

/** A style attribute's allowed declarations; the rest are dropped. */
export function cleanStyle(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of decodeEntities(text).replace(/\/\*[\s\S]*?\*\//g, "").split(";")) {
    const at = part.indexOf(":");
    if (at < 1) continue;
    const name = part.slice(0, at).trim().toLowerCase(), value = part.slice(at + 1).trim().replace(/\s*!important$/i, "").replace(/\s+/g, " ");
    // No escapes, addresses, expressions or custom properties, whatever the property.
    if (!value || value.length > 300 || /[\\<>@;{}]|url\s*\(|expression|javascript:|var\s*\(|attr\s*\(|image-set|-moz-binding|behavior/i.test(value)) continue;
    const ok = STYLES[name];
    if (ok && ok(value)) out[name] = value;
  }
  return out;
}

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The attributes a tag keeps. Links must be https; pictures must name a forum picture by id. */
function cleanAttrs(tag: string, raw: Record<string, string>): Record<string, string> | null {
  const out: Record<string, string> = {};
  if (raw.title) out.title = raw.title.slice(0, 200);
  if (tag === "a") { const href = raw.href?.trim() ?? ""; if (/^https:\/\/[^\s"'<>]{1,500}$/i.test(href)) out.href = href; }
  if (tag === "img") { const src = (raw.src ?? "").trim(); if (!ID.test(src)) return null; out.src = src.toLowerCase(); out.alt = (raw.alt ?? "").slice(0, 200); }
  if (tag === "td" || tag === "th") for (const k of ["colspan", "rowspan"]) { const n = Number(raw[k]); if (Number.isInteger(n) && n > 1 && n <= 20) out[k] = String(n); }
  if (tag === "ol" && /^\d{1,4}$/.test(raw.start ?? "")) out.start = raw.start!;
  if (tag === "details" && "open" in raw) out.open = "";
  return out;
}

const ATTR = /([a-z][a-z0-9-]{0,30})(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gi;
const LIMIT = { chars: 30_000, nodes: 3_000, depth: 30 };

/** The allowed part of some HTML, as a tree. Unknown tags are dropped but their text is kept; unclosed tags close at the end. */
export function htmlNodes(source: string): HtmlNode[] {
  const src = source.slice(0, LIMIT.chars), root: HtmlNode[] = [];
  const stack: { tag: string; children: HtmlNode[] }[] = [{ tag: "", children: root }];
  let count = 0, i = 0, dropping: string | null = null;
  const text = (t: string) => { if (dropping || !t) return; const top = stack.at(-1)!.children, d = decodeEntities(t), last = top.at(-1); if (typeof last === "string") top[top.length - 1] = last + d; else if (count++ < LIMIT.nodes) top.push(d); };
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt < 0) { text(src.slice(i)); break; }
    text(src.slice(i, lt));
    if (src.startsWith("<!--", lt)) { const end = src.indexOf("-->", lt + 4); i = end < 0 ? src.length : end + 3; continue; }
    const m = /^<(\/?)([a-z][a-z0-9]{0,15})((?:\s+[^<>]*?)?)\s*(\/?)>/i.exec(src.slice(lt, lt + 2000));
    if (!m) { text("<"); i = lt + 1; continue; }
    i = lt + m[0].length;
    const closing = !!m[1], name = m[2]!.toLowerCase();
    if (dropping) { if (closing && name === dropping) dropping = null; continue; }
    if (DROP.has(name)) { if (!closing && !m[4] && !VOID.has(name)) dropping = name; continue; }
    if (!TAGS.has(name)) continue;
    const tag = name === "center" ? "div" : name === "font" ? "span" : name;
    if (closing) {
      const at = stack.map(s => s.tag).lastIndexOf(tag);
      if (at > 0) stack.length = at;
      continue;
    }
    const raw: Record<string, string> = {};
    for (const a of (m[3] ?? "").matchAll(ATTR)) { const k = a[1]!.toLowerCase(); if (!(k in raw)) raw[k] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? ""); }
    const attrs = cleanAttrs(tag, raw);
    // Past the depth or size limits, tags are dropped and their text kept.
    if (!attrs || count++ >= LIMIT.nodes || stack.length >= LIMIT.depth) continue;
    const style = cleanStyle(raw.style ?? "");
    if (name === "center") style["text-align"] = "center";
    if (name === "font") { if (raw.color && COLOR.test(raw.color)) style.color = raw.color; if (raw.face) Object.assign(style, cleanStyle(`font-family:${raw.face}`)); }
    const node = { tag, attrs, style, children: [] as HtmlNode[] };
    stack.at(-1)!.children.push(node);
    if (!VOID.has(tag) && !m[4]) stack.push({ tag, children: node.children });
  }
  return root;
}

/** The text of a tree, for word counts, snippets and search. */
export const htmlText = (nodes: readonly HtmlNode[]): string => nodes.map(n => typeof n === "string" ? n : (n.tag === "br" || n.tag === "p" || n.tag === "div" || n.tag === "li" ? " " : "") + htmlText(n.children)).join("").replace(/\s+/g, " ");
/** Forum pictures a tree shows (img by id). */
export const htmlPictures = (nodes: readonly HtmlNode[]): string[] => nodes.flatMap(n => typeof n === "string" ? [] : n.tag === "img" ? [n.attrs.src!] : htmlPictures(n.children));

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** A tree as HTML text, everything escaped; `picture` gives the address for a forum picture (a download leaves them out). */
export function htmlString(nodes: readonly HtmlNode[], picture: (id: string) => string | null = () => null): string {
  return nodes.map(n => {
    if (typeof n === "string") return esc(n);
    const style = Object.entries(n.style).map(([k, v]) => `${k}:${v}`).join(";");
    if (n.tag === "img") { const src = picture(n.attrs.src!); return src ? `<img src="${esc(src)}" alt="${esc(n.attrs.alt ?? "")}"${style ? ` style="${esc(style)}"` : ""}>` : `<span>[picture${n.attrs.alt ? `: ${esc(n.attrs.alt)}` : ""}]</span>`; }
    const attrs = Object.entries(n.attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join("") + (n.tag === "a" && n.attrs.href ? ' rel="nofollow noopener noreferrer ugc" target="_blank"' : "") + (style ? ` style="${esc(style)}"` : "");
    return VOID.has(n.tag) ? `<${n.tag}${attrs}>` : `<${n.tag}${attrs}>${htmlString(n.children, picture)}</${n.tag}>`;
  }).join("");
}
