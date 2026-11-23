/*
 * Every colour a theme's stylesheets use, so a GM can change any of them: the golds, browns and purples a skin draws
 * with, the stops of its gradients, its shadows. A theme keeps the stylesheets as they came and a `palette` beside them,
 * `{ "#d4a826": "#3fa0d0" }`, that swaps one colour for another wherever it appears. The swap happens when the theme is
 * compiled (model.ts, themeCss), so clearing the palette puts the theme's own colours back.
 *
 * Colours are matched by their red, green and blue: `#000`, `#000000` and `rgba(0, 0, 0, .6)` are one colour, and a
 * swap keeps each use's own transparency, so a shadow stays a shadow in the new colour.
 *
 * Pure logic, shared by the server and the browser.
 */

export type Palette = Record<string, string>;
/** One colour a stylesheet uses. `names`: the variables it is part of (without the `--`), in the order they appear. */
export type PaletteColour = { hex: string; uses: number; names: string[]; version: Version; faint: boolean };
/** A gradient kept in a variable (one that reads no other variable, so it can be shown on its own), with the colours of its stops. */
export type PaletteGradient = { name: string; value: string; version: Version; stops: string[] };
/** Which version of the theme a colour belongs to: one set only for light, only for dark, or both. */
export type Version = "light" | "dark" | "both";

const HEX = /^#[0-9a-f]{6}$/;
/** A colour written out in a value: #rgb, #rgba, #rrggbb, #rrggbbaa, rgb() and rgba(). */
const LITERAL = /#[0-9a-fA-F]{3,8}(?![\w-])|rgba?\([^()]*\)/g;
const DARK = /\[data-theme\s*=\s*["']?dark/i;

const two = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
const channel = (s: string) => s.endsWith("%") ? parseFloat(s) * 2.55 : parseFloat(s);

/** A written colour as `#rrggbb` and its alpha (0 to 1); null for anything else, such as `rgb(var(--x))`. */
export function readColour(text: string): { hex: string; alpha: number } | null {
  const t = text.trim().toLowerCase();
  if (t.startsWith("#")) {
    const h = t.slice(1);
    if (![3, 4, 6, 8].includes(h.length) || /[^0-9a-f]/.test(h)) return null;
    const full = h.length <= 4 ? [...h].map(c => c + c).join("") : h;
    return { hex: "#" + full.slice(0, 6), alpha: full.length === 8 ? parseInt(full.slice(6), 16) / 255 : 1 };
  }
  const m = /^rgba?\(\s*(-?[\d.]+%?)\s*[,\s]\s*(-?[\d.]+%?)\s*[,\s]\s*(-?[\d.]+%?)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/.exec(t);
  if (!m) return null;
  const [r, g, b] = [m[1]!, m[2]!, m[3]!].map(channel);
  if ([r, g, b].some(v => !Number.isFinite(v))) return null;
  const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return { hex: `#${two(r!)}${two(g!)}${two(b!)}`, alpha: Number.isFinite(a) ? Math.max(0, Math.min(1, a)) : 1 };
}

/** A colour written back with the alpha of the one it replaces. */
function writeColour(hex: string, alpha: number) {
  if (alpha >= 1) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${+alpha.toFixed(3)})`;
}

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "));

/** Each innermost rule: its selector and its declarations. Rules inside @media and @supports count as their own. */
function* rules(css: string) {
  for (const m of stripComments(css).matchAll(/([^{}]*)\{([^{}]*)\}/g)) yield { selector: m[1]!.trim(), body: m[2]! };
}
function* declarations(body: string) {
  for (const part of body.split(";")) {
    const colon = part.indexOf(":");
    if (colon < 1) continue;
    yield { prop: part.slice(0, colon).trim().toLowerCase(), value: part.slice(colon + 1).trim() };
  }
}

/**
 * Every colour the stylesheets use (all parts of a theme together), most used first within each group: those that are
 * part of a variable come first, in the order the stylesheet sets them. A colour in a rule for `[data-theme="dark"]` is
 * the dark version's; one in a variable the dark version sets again is the light version's.
 */
export function paletteOf(sheets: string[]): { colours: PaletteColour[]; gradients: PaletteGradient[] } {
  const darkVars = new Set<string>();
  for (const css of sheets) for (const r of rules(css)) if (DARK.test(r.selector)) for (const d of declarations(r.body)) if (d.prop.startsWith("--")) darkVars.add(d.prop);
  const found = new Map<string, { uses: number; names: string[]; light: boolean; dark: boolean; solid: boolean; order: number }>();
  const gradients = new Map<string, PaletteGradient>();
  let order = 0;
  for (const css of sheets) for (const r of rules(css)) {
    const darkRule = DARK.test(r.selector);
    for (const d of declarations(r.body)) {
      const isVar = d.prop.startsWith("--"), version: Version = darkRule ? "dark" : isVar && darkVars.has(d.prop) ? "light" : "both";
      const stops: string[] = [];
      for (const m of d.value.matchAll(LITERAL)) {
        const c = readColour(m[0]);
        if (!c || c.alpha === 0) continue;
        stops.push(c.hex);
        const seen = found.get(c.hex) ?? { uses: 0, names: [], light: false, dark: false, solid: false, order: isVar ? order++ : 1e6 + order++ };
        seen.uses++;
        if (version !== "dark") seen.light = true;
        if (version !== "light") seen.dark = true;
        if (c.alpha >= 0.9) seen.solid = true;
        const name = d.prop.slice(2);
        if (isVar && !seen.names.includes(name)) seen.names.push(name);
        if (isVar) seen.order = Math.min(seen.order, order);
        found.set(c.hex, seen);
      }
      const unique = [...new Set(stops)];
      if (isVar && /gradient\(/.test(d.value) && !/var\(/.test(d.value) && d.value.length <= 400 && unique.length >= 2 && unique.length <= 8) {
        const key = `${d.prop}:${version}`;
        if (!gradients.has(key)) gradients.set(key, { name: d.prop.slice(2), value: d.value, version, stops: unique });
      }
    }
  }
  const colours = [...found.entries()]
    .sort((a, b) => a[1].order - b[1].order || b[1].uses - a[1].uses)
    .map(([hex, s]) => ({ hex, uses: s.uses, names: s.names, version: (s.light && s.dark ? "both" : s.dark ? "dark" : "light") as Version, faint: !s.solid }));
  return { colours, gradients: [...gradients.values()] };
}

/** Swaps the palette's colours in a stylesheet: only in declarations, never in selectors. */
export function swapColours(css: string, palette: Palette | undefined): string {
  const swaps = Object.entries(palette ?? {}).filter(([from, to]) => HEX.test(from) && HEX.test(to) && from !== to);
  if (!swaps.length || !css) return css;
  const map = new Map(swaps);
  return css.replace(/\{([^{}]*)\}/g, (block, body: string) => {
    if (!LITERAL.test(body)) return block;
    LITERAL.lastIndex = 0;
    return "{" + body.replace(LITERAL, lit => {
      const c = readColour(lit), to = c && map.get(c.hex);
      return to ? writeColour(to, c.alpha) : lit;
    }) + "}";
  });
}

/** A variable's name as words: `tb-gold-hi` → "Gold hi" (a skin's own short prefix is left out). */
export function colourName(name: string): string {
  const words = name.split(/[-_]+/).filter(Boolean);
  if (words.length > 1 && words[0]!.length <= 3) words.shift();
  const text = words.join(" ");
  return text ? text[0]!.toUpperCase() + text.slice(1) : name;
}
