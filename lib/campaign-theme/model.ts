/*
 * Campaign themes, Jcink-style skins for a campaign: colours (a light version, a dark version or both), fonts from a
 * fixed list, corner size, the banner, and a stylesheet (css.ts makes it safe). A campaign keeps up to
 * THEME_LIMITS.saved themes and one live theme, a copy made when the GM makes a theme live, so editing a saved theme
 * never changes what members see until it's made live again.
 *
 * A theme reaches every part of the campaign (THEME_AREAS): the forum, the Encyclopedia, Maptable and the campaign's
 * dashboard. Colours, fonts and corners apply in all of them; each part has its own stylesheet (`css` for the forum,
 * `areas` for the others), because each is built from its own class names. Every page that shows the campaign wraps
 * its own part in `.campaign-skin` and adds `themeCss(live, scope, area)`; the app bar and the Admin CP sit outside
 * it and are never themed. The app's CSS reads the same variables, so a theme with no stylesheet still restyles it.
 *
 * Pure logic, shared by the server and the browser.
 */
import { z } from "zod";
import { contrastRatio, relativeLuminance } from "../contrast.ts";
import { SKIN_SCOPE, cleanCss, type CssProblem } from "./css.ts";
import { SKIN_PRESETS } from "./presets.ts";
import { NEON_WIRE } from "./skins/neon-wire.ts";

export const THEME_LIMITS = { saved: 20, name: 60, css: 100_000, allCss: 160_000 } as const;

/** The parts of a campaign a theme styles. The forum's stylesheet is the theme's `css`; the others are in `areas`. */
export const THEME_AREAS = [
  { id: "forum", label: "Forum" }, { id: "encyclopedia", label: "Encyclopedia" },
  { id: "maptable", label: "Maptable" }, { id: "dashboard", label: "Dashboard" },
] as const;
export type ThemeArea = (typeof THEME_AREAS)[number]["id"];
export type OtherArea = Exclude<ThemeArea, "forum">;
export const isThemeArea = (v: unknown): v is ThemeArea => THEME_AREAS.some(a => a.id === v);

/** Fonts a theme can use. Each loads from Google Fonts only when a live theme picks it. */
export const THEME_FONTS = {
  inter: { label: "Inter", stack: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif', query: "Inter:wght@400;500;600;700" },
  schibsted: { label: "Schibsted Grotesk", stack: '"Schibsted Grotesk", "Inter", sans-serif', query: "Schibsted+Grotesk:wght@400;500;600;700;800" },
  cinzel: { label: "Cinzel", stack: '"Cinzel", Georgia, serif', query: "Cinzel:wght@500;700;900" },
  marcellus: { label: "Marcellus", stack: '"Marcellus", Georgia, serif', query: "Marcellus" },
  cormorant: { label: "Cormorant Garamond", stack: '"Cormorant Garamond", Georgia, serif', query: "Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500" },
  spectral: { label: "Spectral", stack: '"Spectral", Georgia, serif', query: "Spectral:ital,wght@0,400;0,600;0,700;1,400" },
  fell: { label: "IM Fell English", stack: '"IM Fell English", Georgia, serif', query: "IM+Fell+English:ital@0;1" },
  source: { label: "Source Serif 4", stack: '"Source Serif 4", Georgia, serif', query: "Source+Serif+4:ital,wght@0,400;0,600;0,700;1,400" },
  space: { label: "Space Grotesk", stack: '"Space Grotesk", "Inter", sans-serif', query: "Space+Grotesk:wght@400;500;600;700" },
  chakra: { label: "Chakra Petch", stack: '"Chakra Petch", "Inter", sans-serif', query: "Chakra+Petch:wght@400;500;600;700" },
  mono: { label: "JetBrains Mono", stack: '"JetBrains Mono", ui-monospace, Menlo, monospace', query: "JetBrains+Mono:ital,wght@0,400;0,600;1,400" },
  jost: { label: "Jost", stack: '"Jost", "Inter", sans-serif', query: "Jost:ital,wght@0,300;0,400;0,500;0,700;1,400" },
  rajdhani: { label: "Rajdhani", stack: '"Rajdhani", "Inter", sans-serif', query: "Rajdhani:wght@500;600;700" },
  antonio: { label: "Antonio", stack: '"Antonio", "Arial Narrow", sans-serif', query: "Antonio:wght@400;600;700" },
  bangers: { label: "Bangers", stack: '"Bangers", "Impact", sans-serif', query: "Bangers" },
  comic: { label: "Comic Neue", stack: '"Comic Neue", "Comic Sans MS", sans-serif', query: "Comic+Neue:ital,wght@0,400;0,700;1,400" },
  pirata: { label: "Pirata One", stack: '"Pirata One", Georgia, serif', query: "Pirata+One" },
  uncial: { label: "Uncial Antiqua", stack: '"Uncial Antiqua", Georgia, serif', query: "Uncial+Antiqua" },
  michroma: { label: "Michroma", stack: '"Michroma", "Eurostile", Arial, sans-serif', query: "Michroma" },
  saira: { label: "Saira", stack: '"Saira", "Eurostile", "Inter", sans-serif', query: "Saira:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400" },
  metamorphous: { label: "Metamorphous", stack: '"Metamorphous", "Marcellus", Georgia, serif', query: "Metamorphous" },
  caudex: { label: "Caudex", stack: '"Caudex", "Friz Quadrata", Georgia, serif', query: "Caudex:ital,wght@0,400;0,700;1,400;1,700" },
  archivo: { label: "Archivo Narrow", stack: '"Archivo Narrow", "Arial Narrow", "Inter", sans-serif', query: "Archivo+Narrow:ital,wght@0,400;0,500;0,600;0,700;1,400" },
  garamond: { label: "EB Garamond", stack: '"EB Garamond", Garamond, Georgia, serif', query: "EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500" },
} as const;
export type FontId = keyof typeof THEME_FONTS;
const fontId = z.enum(Object.keys(THEME_FONTS) as [FontId, ...FontId[]]);

/** The colours a theme sets, with what the Admin CP calls them. */
export const COLOUR_ROLES = [
  ["bg", "Page"], ["panel", "Panels"], ["raised", "Raised parts"], ["line", "Lines"],
  ["ink", "Text"], ["muted", "Quiet text"], ["accent", "Accent"], ["accent2", "Second accent"],
] as const;
export type ColourRole = (typeof COLOUR_ROLES)[number][0];
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/).transform(s => s.toLowerCase());
const colourSet = z.object({ bg: hex, panel: hex, raised: hex, line: hex, ink: hex, muted: hex, accent: hex, accent2: hex });
export type ColourSet = z.infer<typeof colourSet>;

type Sheets = { css: string; areas?: Partial<Record<OtherArea, string>> };
/** How long a theme's stylesheets are, all parts together. */
export const cssSize = (t: Sheets): number => t.css.length + Object.values(t.areas ?? {}).reduce((n: number, c) => n + (c?.length ?? 0), 0);

export const themeSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  name: z.string().trim().min(1).max(THEME_LIMITS.name),
  /** Which versions it has: members see the one that matches their own light or dark setting. */
  mode: z.enum(["both", "light", "dark"]),
  radius: z.number().int().min(0).max(16),
  /** `picture`: the campaign's banner picture behind the title, when the forum uses it; `plain`: the theme's colours. */
  banner: z.enum(["picture", "plain"]),
  fonts: z.object({ display: fontId, reading: fontId, ui: fontId }),
  /** Both sets are kept even when only one is used, so switching back doesn't lose the other. */
  colors: z.object({ light: colourSet, dark: colourSet }),
  /** The forum's stylesheet. */
  css: z.string().max(THEME_LIMITS.css),
  /** The other parts' stylesheets. Missing: that part gets the theme's colours, fonts and corners only. */
  areas: z.object({ encyclopedia: z.string().max(THEME_LIMITS.css), maptable: z.string().max(THEME_LIMITS.css), dashboard: z.string().max(THEME_LIMITS.css) }).partial().optional(),
  updatedAt: z.string().datetime().optional(),
}).refine(t => cssSize(t) <= THEME_LIMITS.allCss, { message: "The stylesheets are over 160 KB together.", path: ["css"] });
export type Theme = z.infer<typeof themeSchema>;
/** One part's stylesheet. */
export const areaCss = (t: Pick<Theme, "css" | "areas">, area: ThemeArea): string => area === "forum" ? t.css : t.areas?.[area] ?? "";

export const themeFileSchema = z.object({
  /** What members see now: a copy of a saved theme taken when it was made live. Null: the app's own look. */
  live: themeSchema.nullable(),
  saved: z.array(themeSchema).max(THEME_LIMITS.saved),
});
export type ThemeFile = z.infer<typeof themeFileSchema>;
export const emptyThemeFile = (): ThemeFile => ({ live: null, saved: [] });

export class ThemeError extends Error {}

const FORUM_LIGHT: ColourSet = { bg: "#ece5d6", panel: "#f9f5ea", raised: "#f1ebdb", line: "#dcd1b8", ink: "#2b261d", muted: "#6c6352", accent: "#87620f", accent2: "#1b6c60" };
const FORUM_DARK: ColourSet = { bg: "#111110", panel: "#1a1a18", raised: "#21211e", line: "#302e27", ink: "#ece5d3", muted: "#a59d88", accent: "#dfbe6a", accent2: "#49b8a0" };

/** Themes to start from. Their CSS is short on purpose, a starting point, except Neon Wire, which is a fully custom skin (skins/). */
const BASE_PRESETS: Theme[] = [
  { id: "preset-forum", name: "Parchment and gold", mode: "both", radius: 3, banner: "picture", fonts: { display: "cinzel", reading: "cormorant", ui: "inter" }, colors: { light: FORUM_LIGHT, dark: FORUM_DARK }, css: "" },
  {
    id: "preset-ledger", name: "Parchment Ledger", mode: "light", radius: 0, banner: "plain", fonts: { display: "fell", reading: "spectral", ui: "inter" },
    colors: {
      light: { bg: "#e7dcc0", panel: "#f4ecd6", raised: "#ece2c7", line: "#c4b388", ink: "#2e2416", muted: "#655640", accent: "#7c2a1c", accent2: "#2d5a4c" },
      dark: { bg: "#1c1811", panel: "#262015", raised: "#2e2719", line: "#4a3f29", ink: "#eadfc4", muted: "#ad9f80", accent: "#e08a72", accent2: "#8cc4b0" },
    },
    css: `/* Ruled ledger lines behind posts, and a stamped title. */
.post-body {
  background-image: repeating-linear-gradient(transparent 0 27px, color-mix(in srgb, var(--line) 55%, transparent) 27px 28px);
}
.board-title { letter-spacing: .04em; text-transform: none; }
.category-title { border-bottom: 3px double var(--line); }
`,
  },
  NEON_WIRE,
  {
    id: "preset-plain", name: "Plain", mode: "both", radius: 6, banner: "plain", fonts: { display: "schibsted", reading: "source", ui: "inter" },
    colors: {
      light: { bg: "#f5f6f7", panel: "#ffffff", raised: "#f5f7f8", line: "#e1e5e8", ink: "#1c2329", muted: "#56616a", accent: "#1f6f68", accent2: "#3b6fb6" },
      dark: { bg: "#0f1316", panel: "#181d22", raised: "#1f252b", line: "#2c343a", ink: "#e6ebee", muted: "#a2adb5", accent: "#5fc2b5", accent2: "#82aee8" },
    },
    css: "",
  },
];

/** Every starting point: the app's own four, then the skins inspired by games and worlds (presets.ts). */
export const THEME_PRESETS: Theme[] = [...BASE_PRESETS, ...SKIN_PRESETS.map(p => p.theme)];
/** What a preset skin is inspired by, by its id, for the Admin CP's list. */
export const PRESET_NOTES: Record<string, string> = { [NEON_WIRE.id]: "Synthwave", ...Object.fromEntries(SKIN_PRESETS.map(p => [p.theme.id, p.inspired])) };

/** The colour a theme's text on its accent should be: near-black or white, whichever reads better. */
export const onAccent = (accent: string) => contrastRatio(accent, "#111111") >= contrastRatio(accent, "#ffffff") ? "#111111" : "#ffffff";

/** Contrast checks for one colour set: text and quiet text need 4.5, accents 3, all on the panels. */
export function contrastChecks(c: ColourSet) {
  return [
    { label: "Text on panels", ratio: contrastRatio(c.ink, c.panel), need: 4.5 },
    { label: "Quiet text", ratio: contrastRatio(c.muted, c.panel), need: 4.5 },
    { label: "Accent", ratio: contrastRatio(c.accent, c.panel), need: 3 },
    { label: "Second accent", ratio: contrastRatio(c.accent2, c.panel), need: 3 },
  ];
}

function varsOf(t: Theme, c: ColourSet, dark: boolean) {
  const f = THEME_FONTS;
  return [
    `--bg: ${c.bg}`, `--panel: ${c.panel}`, `--raised: ${c.raised}`, `--line: ${c.line}`, `--line-strong: color-mix(in srgb, ${c.line} 65%, ${c.ink})`,
    `--ink: ${c.ink}`, `--muted: ${c.muted}`, `--accent: ${c.accent}`, `--accent-2: ${c.accent2}`, `--on-accent: ${onAccent(c.accent)}`,
    `--accent-soft: color-mix(in srgb, ${c.accent} ${dark ? 18 : 16}%, ${c.panel})`, `--danger: ${dark ? "#f0a196" : "#a33a2e"}`,
    `--font-display: ${f[t.fonts.display].stack}`, `--font-reading: ${f[t.fonts.reading].stack}`, `--font-sans: ${f[t.fonts.ui].stack}`,
    `--radius: ${t.radius}px`, `color-scheme: ${dark ? "dark" : "light"}`,
    // The rest of the app's tokens (app/appearance.css), so the Encyclopedia, Maptable and the dashboard follow too.
    `--radius-sm: ${Math.min(t.radius, 2)}px`, `--radius-lg: ${t.radius + 2}px`,
    `--accent-hover: color-mix(in srgb, ${c.accent} 84%, ${c.ink})`, `--hover: color-mix(in srgb, ${c.ink} 7%, ${c.panel})`,
    `--chrome: ${c.panel}`, `--chrome-text: ${c.ink}`, `--chrome-muted: ${c.muted}`, `--chrome-hover: color-mix(in srgb, ${c.ink} 7%, ${c.panel})`, `--chrome-line: ${c.line}`,
    `--control: ${dark ? `color-mix(in srgb, ${c.bg} 60%, ${c.panel})` : c.panel}`, `--heading-surface: ${c.raised}`,
    `--workspace: color-mix(in srgb, ${c.bg} 88%, ${dark ? "#000" : c.ink})`, `--workspace-dot: color-mix(in srgb, ${c.line} 70%, ${c.bg})`,
    `--grid-line: color-mix(in srgb, ${c.ink} 9%, transparent)`, `--danger-soft: ${dark ? "#3a2522" : "#fbecea"}`,
    `--overlay: color-mix(in srgb, ${dark ? "#000" : c.ink} ${dark ? 65 : 30}%, transparent)`,
    // The Encyclopedia's own names for some of them.
    `--paper: ${c.bg}`, `--white: ${c.panel}`, `--green: ${c.accent}`, `--green-pale: color-mix(in srgb, ${c.accent} ${dark ? 18 : 16}%, ${c.panel})`, `--sand: ${c.raised}`,
    // The banner when it has no picture, in the theme's own colours.
    ...(t.banner === "plain" ? [
      `--head-bg: linear-gradient(160deg, color-mix(in srgb, ${c.accent} ${dark ? 22 : 14}%, ${c.raised}), ${c.panel})`,
      `--head-ink: ${c.ink}`, `--head-title: ${c.accent}`, `--head-shadow: none`, `--head-nav: color-mix(in srgb, ${c.ink} 6%, transparent)`, `--head-line: ${c.line}`,
    ] : []),
  ].join("; ");
}

/** The fonts a theme uses, as one Google Fonts stylesheet address. */
export function themeFontsUrl(t: Theme) {
  const ids = [...new Set([t.fonts.display, t.fonts.reading, t.fonts.ui])];
  return `https://fonts.googleapis.com/css2?${ids.map(id => "family=" + THEME_FONTS[id].query).join("&")}&display=swap`;
}

/**
 * The CSS a page adds for a theme: its variables for the versions it has (members' light or dark setting picks one;
 * a one-version theme shows that version to everyone), then its cleaned stylesheet, all inside `scope`.
 */
export function themeCss(t: Theme, scope = SKIN_SCOPE, area: ThemeArea = "forum"): { css: string; problems: CssProblem[] } {
  const light = `${scope} { ${varsOf(t, t.colors.light, false)}; }`, dark = `${scope} { ${varsOf(t, t.colors.dark, true)}; }`;
  const vars = t.mode === "both" ? `${light}\n:root[data-theme="dark"] ${dark}`
    : t.mode === "light" ? `${light}\n:root[data-theme="dark"] ${light}`
    : `${dark}\n:root[data-theme="dark"] ${dark}`;
  const sheet = cleanCss(areaCss(t, area), scope);
  return { css: `${vars}\n${sheet.css}`, problems: sheet.problems };
}

/**
 * Only a theme's colours, inside `scope`: for a part that keeps its own fonts, corners and layout, like the Admin CP,
 * which has to stay usable whatever the theme's stylesheet does.
 */
export function themeColours(t: Theme, scope: string): string {
  const only = (c: ColourSet, dark: boolean) => `${scope} { ${varsOf(t, c, dark).split("; ").filter(v => !/^--(?:font|radius|head)\b/.test(v)).join("; ")}; }`;
  const light = only(t.colors.light, false), dark = only(t.colors.dark, true);
  return t.mode === "both" ? `${light}\n:root[data-theme="dark"] ${dark}` : t.mode === "light" ? `${light}\n:root[data-theme="dark"] ${light}` : `${dark}\n:root[data-theme="dark"] ${dark}`;
}

/** What a page needs for the live theme: the CSS and the fonts to load. */
export function liveTheme(t: Theme | null, area: ThemeArea = "forum") {
  if (!t) return null;
  return { key: `${t.id}:${t.updatedAt ?? ""}:${area}`, name: t.name, mode: t.mode, banner: t.banner, css: themeCss(t, SKIN_SCOPE, area).css, fonts: themeFontsUrl(t) };
}
export type LiveTheme = NonNullable<ReturnType<typeof liveTheme>>;

/**
 * A theme from pasted JSON (the Admin CP's Paste theme code, or what Claude writes from the theme prompt). Takes the
 * prototype's shape too: a missing colour set copies the other, a named banner picture means the campaign's own
 * picture, and templates are left out (they aren't here yet). Throws ThemeError with what's wrong.
 */
export function importTheme(raw: unknown, id: string): { theme: Theme; notes: string[] } {
  if (!raw || typeof raw !== "object") throw new ThemeError("That isn't a theme. Paste the whole JSON object, from { to }.");
  const o = raw as Record<string, unknown>, notes: string[] = [];
  const colours = (o.colors ?? {}) as Record<string, unknown>;
  const lightIn = colours.light ?? colours.dark, darkIn = colours.dark ?? colours.light;
  if (!lightIn) throw new ThemeError("The theme has no colours.");
  const mode = o.mode === "light" || o.mode === "dark" ? o.mode : "both";
  const banner = o.banner === "plain" || o.banner === "none" ? "plain" : o.banner === undefined ? "plain" : "picture";
  const fonts = (o.fonts ?? {}) as Record<string, unknown>, pick = (v: unknown, fallback: FontId): FontId => typeof v === "string" && v in THEME_FONTS ? v as FontId : fallback;
  if (o.templates && typeof o.templates === "object" && Object.keys(o.templates).length) notes.push("Its templates were left out: templates come in a later update.");
  const areasIn = (o.areas && typeof o.areas === "object" ? o.areas : {}) as Record<string, unknown>;
  const areas = Object.fromEntries(THEME_AREAS.filter(a => a.id !== "forum" && typeof areasIn[a.id] === "string" && areasIn[a.id]).map(a => [a.id, areasIn[a.id]]));
  const parsed = themeSchema.safeParse({
    id, name: typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, THEME_LIMITS.name) : "Pasted theme", mode,
    radius: Math.max(0, Math.min(16, Math.round(Number(o.radius ?? 3)) || 0)), banner,
    fonts: { display: pick(fonts.display, "cinzel"), reading: pick(fonts.reading, "cormorant"), ui: pick(fonts.ui, "inter") },
    colors: { light: lightIn, dark: darkIn }, css: typeof o.css === "string" ? o.css : "", ...(Object.keys(areas).length ? { areas } : {}),
  });
  if (!parsed.success) {
    const where = parsed.error.issues[0]?.path.join(".") ?? "";
    throw new ThemeError(/colors/.test(where) ? `The colour ${where.replace("colors.", "")} must be a 6-digit hex colour like #1a2b3c.` : where === "css" || where.startsWith("areas") ? (parsed.error.issues[0]?.message.includes("together") ? "The stylesheets are over 160 KB together." : "A stylesheet is over 100 KB.") : `The theme's ${where || "shape"} isn't right.`);
  }
  return { theme: parsed.data, notes };
}

/** A theme with its version for this light or dark setting: the colours members see. */
export const shownColours = (t: Theme, dark: boolean) => t.mode === "both" ? (dark ? t.colors.dark : t.colors.light) : t.mode === "dark" ? t.colors.dark : t.colors.light;
/** Whether a colour is dark: the Admin CP uses it to suggest a first version. */
export const isDark = (hex: string) => relativeLuminance(hex) < 0.2;

/* Changes to the theme file. Each checks the file and returns the new one. */
export function saveTheme(file: ThemeFile, input: unknown, opts: { live?: boolean; now: Date }): ThemeFile {
  const parsed = themeSchema.safeParse(input);
  if (!parsed.success) throw new ThemeError(parsed.error.issues.some(i => /stylesheets? (are|is) over|too_big/.test(i.message + i.code) && (i.path[0] === "css" || i.path[0] === "areas")) ? "The stylesheets are too long: each part can have 100 KB, and 160 KB together." : "That theme isn't valid. Check its name and colours.");
  const theme = { ...parsed.data, updatedAt: opts.now.toISOString() };
  const has = file.saved.some(t => t.id === theme.id);
  if (!has && file.saved.length >= THEME_LIMITS.saved) throw new ThemeError(`A campaign keeps up to ${THEME_LIMITS.saved} themes. Delete one first.`);
  const saved = has ? file.saved.map(t => t.id === theme.id ? theme : t) : [...file.saved, theme];
  return { live: opts.live ? theme : file.live, saved };
}
export function makeLive(file: ThemeFile, id: string | null): ThemeFile {
  if (id === null) return { ...file, live: null };
  const t = file.saved.find(x => x.id === id);
  if (!t) throw new ThemeError("That theme was deleted.");
  return { ...file, live: t };
}
export function deleteTheme(file: ThemeFile, id: string): ThemeFile {
  return { ...file, saved: file.saved.filter(t => t.id !== id) };
}
