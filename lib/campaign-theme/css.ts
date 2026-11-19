/*
 * A campaign theme's stylesheet, made safe to put on a page every member opens.
 *
 * The GM's CSS is read into rules and written out again from the parts that pass, so nothing the checks didn't see
 * reaches the page. Every selector is put inside the theme's scope (`.campaign-skin`, the campaign's own part of the
 * page), and `:root`, `html`, `body` and `:scope` mean that scope, so `:root[data-theme="dark"] .post` still works for
 * a theme's dark version. Pictures and fonts from other sites (url(), @import, @font-face), `<`, backslash escapes,
 * nested rules, sibling selectors that would reach outside the scope and `position: fixed` are refused or changed,
 * and each one is reported with its line so the Admin CP can say what happened.
 *
 * Pure logic: the server runs it on every page it sends and the browser runs it for the live preview.
 */

export const SKIN_SCOPE = ".campaign-skin";
export const CSS_LIMIT = 100_000;
export type CssProblem = { line: number; message: string };
export type CleanCss = { css: string; problems: CssProblem[]; rules: number };

/** Properties that can run code or load something in some browser. */
const BLOCKED_PROPS = new Set(["behavior", "-moz-binding", "-ms-behavior"]);
/** Anything in a value that could load from another site, run code, or break out of the style element. */
const BLOCKED_VALUE = /url\s*\(|image-set\s*\(|image\s*\(|element\s*\(|expression\s*\(|javascript:|vbscript:|data:|@import|src\s*\(/i;
const BAD_CHARS = /[<\\@{}]/;
const ALLOWED_AT = new Set(["media", "supports", "container"]);

/** Comments out, with newlines kept so line numbers stay right. Strings are left alone. */
function stripComments(src: string) {
  let out = "", i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === '"' || c === "'") { const end = stringEnd(src, i); out += src.slice(i, end); i = end; continue; }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2), stop = end < 0 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, " "); i = stop; continue;
    }
    out += c; i++;
  }
  return out;
}
/** The index just past a string that starts at `i` (or the end of the line, for one never closed). */
function stringEnd(src: string, i: number) {
  const q = src[i]!;
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === "\\") { j++; continue; }
    if (src[j] === q || src[j] === "\n") return j + 1;
  }
  return src.length;
}
/** The first of `stops` at nesting depth 0 from `i`, outside strings and brackets; src.length when there is none. */
function findTop(src: string, i: number, stops: string) {
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j]!;
    if (c === '"' || c === "'") { j = stringEnd(src, j) - 1; continue; }
    if (c === "(" || c === "[") depth++;
    else if ((c === ")" || c === "]") && depth > 0) depth--;
    else if (depth === 0 && stops.includes(c)) return j;
  }
  return src.length;
}
/** The `}` that closes the block whose `{` is at `open`; -1 when it is never closed. */
function closeOf(src: string, open: number) {
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    const c = src[j]!;
    if (c === '"' || c === "'") { j = stringEnd(src, j) - 1; continue; }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return j;
  }
  return -1;
}
/** Splits on a character at depth 0, outside strings. */
function splitTop(text: string, on: string) {
  const parts: string[] = [];
  let at = 0;
  for (;;) {
    const j = findTop(text, at, on);
    parts.push(text.slice(at, j));
    if (j >= text.length) return parts;
    at = j + 1;
  }
}

/**
 * One selector put inside the scope, or null when it can't be. `:root`, `html` (with attributes such as
 * `[data-theme="dark"]` or classes) stay in front of the scope; `body` and `:scope` become the scope.
 */
export function scopeSelector(raw: string, scope = SKIN_SCOPE): string | null {
  const sel = raw.trim().replace(/\s+/g, " ");
  if (!sel || BAD_CHARS.test(sel) || /[;&]/.test(sel) || sel.length > 500) return null;
  // `+` and `~` at the start would pick the scope's siblings: the app's own parts.
  if (/^[+~]/.test(sel)) return null;
  const root = /^(?::root|html)((?:\[[^\]]*\]|\.[A-Za-z_][\w-]*|:not\([^()]*\))*)/.exec(sel);
  if (root) {
    let rest = sel.slice(root[0].length).trim();
    if (/^[+~]/.test(rest)) return null;
    rest = rest.replace(/^>\s*/, "");
    const body = /^(?:body|:scope)(?![\w-])/.exec(rest);
    if (body) { rest = rest.slice(body[0].length); return `:root${root[1]} ${scope}${rest}`; }
    return `:root${root[1]} ${scope}${rest ? " " + rest : ""}`;
  }
  const body = /^(?:body|:scope)(?![\w-])/.exec(sel);
  if (body) return scope + sel.slice(body[0].length);
  return `${scope} ${sel}`;
}

type Ctx = { problems: CssProblem[]; lineOf: (i: number) => number; keyframes: Map<string, string>; scope: string; rules: number };

/** One declaration block, cleaned; "" when nothing in it passed. */
function cleanDecls(body: string, start: number, ctx: Ctx) {
  const out: string[] = [];
  let offset = 0;
  for (const part of splitTop(body, ";")) {
    const at = start + offset;
    offset += part.length + 1;
    const text = part.trim();
    if (!text) continue;
    const colon = text.indexOf(":");
    if (colon < 1) { ctx.problems.push({ line: ctx.lineOf(at), message: `“${short(text)}” isn't a property and value, so it was left out.` }); continue; }
    const prop = text.slice(0, colon).trim().toLowerCase();
    let value = text.slice(colon + 1).trim();
    if (!/^(?:--[A-Za-z0-9_-]{1,80}|-?[a-z][a-z-]{0,60})$/.test(prop)) { ctx.problems.push({ line: ctx.lineOf(at), message: `“${short(prop)}” isn't a property name.` }); continue; }
    if (BLOCKED_PROPS.has(prop)) { ctx.problems.push({ line: ctx.lineOf(at), message: `${prop} isn't allowed.` }); continue; }
    const important = /!\s*important\s*$/i.test(value);
    if (important) value = value.replace(/!\s*important\s*$/i, "").trim();
    if (!value || value.length > 2000) { ctx.problems.push({ line: ctx.lineOf(at), message: `${prop} has no value, or one that is too long.` }); continue; }
    if (BAD_CHARS.test(value) || BLOCKED_VALUE.test(value)) {
      ctx.problems.push({ line: ctx.lineOf(at), message: /url\s*\(|image-set|image\s*\(|data:/i.test(value) ? `${prop}: pictures from addresses (url) aren't allowed. Use the campaign's banner and place pictures, or a gradient.` : `${prop}: that value isn't allowed.` });
      continue;
    }
    if (/["']/.test(value) && !/^(?:content|font-family|quotes|grid-template-areas|font-feature-settings|font-variation-settings|--.*)$/.test(prop)) {
      ctx.problems.push({ line: ctx.lineOf(at), message: `${prop}: quotes only belong in content, font-family and similar properties.` });
      continue;
    }
    if (prop === "position" && /\bfixed\b/i.test(value)) {
      value = value.replace(/\bfixed\b/gi, "absolute");
      ctx.problems.push({ line: ctx.lineOf(at), message: "position: fixed became absolute, so a theme can't cover the app's own controls." });
    }
    if ((prop === "animation" || prop === "animation-name") && ctx.keyframes.size) {
      value = value.replace(/[A-Za-z_][\w-]*/g, w => ctx.keyframes.get(w) ?? w);
    }
    out.push(`${prop}: ${value}${important ? " !important" : ""}`);
  }
  return out.join("; ");
}

const short = (s: string) => (s.length > 40 ? s.slice(0, 40) + "…" : s).replace(/\s+/g, " ");

/** Rules from `src[from..to)`, cleaned and scoped, as CSS text. */
function cleanBlock(src: string, from: number, to: number, ctx: Ctx, depth: number): string {
  const out: string[] = [];
  let i = from;
  while (i < to) {
    while (i < to && /\s/.test(src[i]!)) i++;
    if (i >= to) break;
    if (src[i] === "}") { ctx.problems.push({ line: ctx.lineOf(i), message: "A } without its {. It was skipped." }); i++; continue; }
    if (src[i] === "@") {
      const name = /^@([A-Za-z-]+)/.exec(src.slice(i, i + 40))?.[1]?.toLowerCase() ?? "";
      const stop = Math.min(findTop(src, i, "{;}"), to);
      if (stop >= to || src[stop] !== "{") {
        ctx.problems.push({ line: ctx.lineOf(i), message: name === "import" ? "@import isn't allowed: stylesheets from other sites can't load." : `@${name || "…"} isn't allowed here.` });
        i = stop + 1; continue;
      }
      const close = closeOf(src, stop);
      if (close < 0 || close > to) { ctx.problems.push({ line: ctx.lineOf(i), message: `@${name} is never closed with }.` }); return out.join("\n"); }
      const prelude = src.slice(i + 1 + name.length, stop).trim().replace(/\s+/g, " ");
      if (ALLOWED_AT.has(name) && depth < 4) {
        if (BAD_CHARS.test(prelude) || BLOCKED_VALUE.test(prelude) || prelude.length > 300) ctx.problems.push({ line: ctx.lineOf(i), message: `That @${name} condition isn't allowed.` });
        else { const inner = cleanBlock(src, stop + 1, close, ctx, depth + 1); if (inner) out.push(`@${name} ${prelude} {\n${inner}\n}`); }
      } else if ((name === "keyframes" || name === "-webkit-keyframes") && depth < 4) {
        const own = ctx.keyframes.get(prelude);
        if (!own) ctx.problems.push({ line: ctx.lineOf(i), message: "A @keyframes name may only use letters, numbers, - and _." });
        else out.push(`@keyframes ${own} {\n${cleanFrames(src, stop + 1, close, ctx)}\n}`);
      } else {
        ctx.problems.push({ line: ctx.lineOf(i), message: name === "font-face" ? "@font-face isn't allowed: pick fonts in Basics, as they come from the app's list." : `@${name} isn't allowed in a campaign theme.` });
      }
      i = close + 1; continue;
    }
    const open = findTop(src, i, "{;}");
    if (open >= to || src[open] !== "{") {
      ctx.problems.push({ line: ctx.lineOf(i), message: `“${short(src.slice(i, Math.min(open, to)).trim())}” isn't followed by a { block, so it was skipped.` });
      i = open + 1; continue;
    }
    const close = closeOf(src, open);
    if (close < 0 || close > to) { ctx.problems.push({ line: ctx.lineOf(i), message: "A rule is never closed with }." }); return out.join("\n"); }
    const selectors: string[] = [];
    for (const one of splitTop(src.slice(i, open), ",")) {
      const scoped = scopeSelector(one, ctx.scope);
      if (scoped) selectors.push(scoped);
      else if (one.trim()) ctx.problems.push({ line: ctx.lineOf(i), message: `The selector “${short(one.trim())}” can't be used: it may not start with + or ~, or use <, \\, & or @.` });
    }
    let body = src.slice(open + 1, close);
    if (findTop(body, 0, "{") < body.length) {
      ctx.problems.push({ line: ctx.lineOf(open), message: "Rules inside rules (nesting) aren't supported. Write each rule on its own." });
      body = body.replace(/[^;{}]*\{[^{}]*\}/g, m => " ".repeat(m.length));
    }
    const decls = cleanDecls(body, open + 1, ctx);
    if (selectors.length && decls) { out.push(`${selectors.join(",\n")} { ${decls} }`); ctx.rules++; }
    i = close + 1;
  }
  return out.join("\n");
}

/** The inside of @keyframes: from, to and percentages, each with cleaned declarations. */
function cleanFrames(src: string, from: number, to: number, ctx: Ctx) {
  const out: string[] = [];
  let i = from;
  while (i < to) {
    const open = findTop(src, i, "{}");
    if (open >= to || src[open] !== "{") break;
    const close = closeOf(src, open);
    if (close < 0 || close > to) break;
    const steps = src.slice(i, open).trim();
    if (/^(?:from|to|\d{1,3}(?:\.\d+)?%)(?:\s*,\s*(?:from|to|\d{1,3}(?:\.\d+)?%))*$/i.test(steps)) {
      const decls = cleanDecls(src.slice(open + 1, close), open + 1, ctx);
      if (decls) out.push(`${steps} { ${decls} }`);
    } else ctx.problems.push({ line: ctx.lineOf(i), message: "Keyframes use from, to or percentages." });
    i = close + 1;
  }
  return out.join("\n");
}

/** Cleans and scopes a theme's stylesheet. */
export function cleanCss(source: string, scope = SKIN_SCOPE): CleanCss {
  const problems: CssProblem[] = [];
  if (!source.trim()) return { css: "", problems, rules: 0 };
  let text = source;
  if (text.length > CSS_LIMIT) { problems.push({ line: 1, message: `The stylesheet is over ${CSS_LIMIT / 1000} KB, so the end was cut off.` }); text = text.slice(0, CSS_LIMIT); }
  const src = stripComments(text);
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === "\n") starts.push(i + 1);
  const lineOf = (at: number) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid]! <= at) lo = mid; else hi = mid - 1; } return lo + 1; };
  // Keyframe names get the theme's own prefix, so they never replace the app's animations.
  const keyframes = new Map<string, string>();
  for (const m of src.matchAll(/@(?:-webkit-)?keyframes\s+([A-Za-z_][\w-]{0,60})\s*\{/g)) keyframes.set(m[1]!, `skin-${m[1]}`);
  const ctx: Ctx = { problems, lineOf, keyframes, scope, rules: 0 };
  const css = cleanBlock(src, 0, src.length, ctx, 0);
  return { css, problems: problems.slice(0, 100), rules: ctx.rules };
}
