// Appearance settings shared by every RPG Tools page: light/dark/system theme
// and an accent colour. Both are per-device preferences kept in localStorage;
// they never touch saved workspaces, shared maps or what players see.

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_MODES: readonly ThemeMode[] = ["light", "dark", "system"];

export const ACCENTS = [
  { id: "verdigris", label: "Verdigris", light: "#1f6f68", dark: "#5fc2b5" },
  { id: "lapis", label: "Lapis", light: "#2f5ea8", dark: "#86a8ea" },
  { id: "ember", label: "Ember", light: "#a94c27", dark: "#f0956b" },
  { id: "amethyst", label: "Amethyst", light: "#6a4f9f", dark: "#b39be6" },
  { id: "brass", label: "Brass", light: "#7d5f1a", dark: "#d9b25e" },
  { id: "crimson", label: "Crimson", light: "#a33346", dark: "#ef8a99" },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];

export const DEFAULT_ACCENT: AccentId = "verdigris";
export const DEFAULT_THEME_MODE: ThemeMode = "system";

export const THEME_STORAGE_KEY = "rpg-tools:theme";
export const ACCENT_STORAGE_KEY = "rpg-tools:accent";
/** Older per-tool keys, read once so nobody loses the theme they picked. */
export const LEGACY_THEME_KEYS = ["maptable-theme", "ttrpg-color-theme"] as const;

export function parseThemeMode(value: unknown): ThemeMode | null {
  return typeof value === "string" && (THEME_MODES as readonly string[]).includes(value) ? (value as ThemeMode) : null;
}

export function parseAccent(value: unknown): AccentId | null {
  return typeof value === "string" && ACCENTS.some((accent) => accent.id === value) ? (value as AccentId) : null;
}

export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  return mode === "system" ? (prefersDark ? "dark" : "light") : mode;
}

/** Picks the saved theme, falling back to the old per-tool keys, then to system. */
export function pickThemeMode(saved: unknown, legacy: readonly unknown[]): ThemeMode {
  const current = parseThemeMode(saved);
  if (current) return current;
  for (const value of legacy) {
    const old = parseThemeMode(value);
    if (old && old !== "system") return old;
  }
  return DEFAULT_THEME_MODE;
}

export type FontRole = "ui" | "title" | "reading";
export type FontOption = { id: string; label: string; stack: string; query: string | null };

const sans = (name: string) => `"${name}", system-ui, -apple-system, "Segoe UI", sans-serif`;
const serif = (name: string) => `"${name}", Georgia, "Times New Roman", serif`;
const SAME_AS_UI: FontOption = { id: "same", label: "Same as interface", stack: "var(--font-sans)", query: null };

/**
 * Fonts people can pick. Each is a Google Fonts family loaded only when chosen;
 * the three defaults are always loaded by app/appearance.css.
 */
export const FONT_ROLES: Record<FontRole, { label: string; cssVar: string; storageKey: string; defaultId: string; sample: string; options: FontOption[] }> = {
  ui: {
    label: "Interface", cssVar: "--font-sans", storageKey: "rpg-tools:font-ui", defaultId: "inter",
    sample: "Roll for initiative, 2d6 + 3",
    options: [
      { id: "inter", label: "Inter", stack: sans("Inter"), query: null },
      { id: "atkinson", label: "Atkinson Hyperlegible", stack: sans("Atkinson Hyperlegible"), query: "Atkinson+Hyperlegible:wght@400;700" },
      { id: "dm-sans", label: "DM Sans", stack: sans("DM Sans"), query: "DM+Sans:wght@400;500;600;700" },
      { id: "figtree", label: "Figtree", stack: sans("Figtree"), query: "Figtree:wght@400;500;600;700" },
      { id: "ibm-plex-sans", label: "IBM Plex Sans", stack: sans("IBM Plex Sans"), query: "IBM+Plex+Sans:wght@400;500;600;700" },
      { id: "lato", label: "Lato", stack: sans("Lato"), query: "Lato:wght@400;700" },
      { id: "lexend", label: "Lexend", stack: sans("Lexend"), query: "Lexend:wght@400;500;600;700" },
      { id: "manrope", label: "Manrope", stack: sans("Manrope"), query: "Manrope:wght@400;500;600;700" },
      { id: "nunito-sans", label: "Nunito Sans", stack: sans("Nunito Sans"), query: "Nunito+Sans:wght@400;500;600;700" },
      { id: "rubik", label: "Rubik", stack: sans("Rubik"), query: "Rubik:wght@400;500;600;700" },
      { id: "source-sans", label: "Source Sans 3", stack: sans("Source Sans 3"), query: "Source+Sans+3:wght@400;500;600;700" },
      { id: "work-sans", label: "Work Sans", stack: sans("Work Sans"), query: "Work+Sans:wght@400;500;600;700" },
      { id: "system", label: "Your device's font", stack: "system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif", query: null },
    ],
  },
  title: {
    label: "Titles", cssVar: "--font-display", storageKey: "rpg-tools:font-title", defaultId: "schibsted",
    sample: "The Sunless Citadel",
    options: [
      { id: "schibsted", label: "Schibsted Grotesk", stack: sans("Schibsted Grotesk"), query: null },
      { id: "alegreya-sc", label: "Alegreya SC", stack: serif("Alegreya SC"), query: "Alegreya+SC:wght@500;700" },
      { id: "bricolage", label: "Bricolage Grotesque", stack: sans("Bricolage Grotesque"), query: "Bricolage+Grotesque:wght@500;600;700" },
      { id: "cinzel", label: "Cinzel", stack: serif("Cinzel"), query: "Cinzel:wght@500;600;700" },
      { id: "cormorant", label: "Cormorant Garamond", stack: serif("Cormorant Garamond"), query: "Cormorant+Garamond:wght@500;600;700" },
      { id: "eb-garamond", label: "EB Garamond", stack: serif("EB Garamond"), query: "EB+Garamond:wght@500;600;700" },
      { id: "fraunces", label: "Fraunces", stack: serif("Fraunces"), query: "Fraunces:wght@500;600;700" },
      { id: "marcellus", label: "Marcellus", stack: serif("Marcellus"), query: "Marcellus" },
      { id: "playfair", label: "Playfair Display", stack: serif("Playfair Display"), query: "Playfair+Display:wght@500;600;700" },
      { id: "space-grotesk", label: "Space Grotesk", stack: sans("Space Grotesk"), query: "Space+Grotesk:wght@500;600;700" },
      { id: "spectral", label: "Spectral", stack: serif("Spectral"), query: "Spectral:wght@500;600;700" },
      SAME_AS_UI,
    ],
  },
  reading: {
    label: "Reading (Encyclopedia articles)", cssVar: "--font-reading", storageKey: "rpg-tools:font-reading", defaultId: "source-serif",
    sample: "A quiet village at the edge of the Ashenwood.",
    options: [
      { id: "source-serif", label: "Source Serif 4", stack: serif("Source Serif 4"), query: null },
      { id: "alegreya", label: "Alegreya", stack: serif("Alegreya"), query: "Alegreya:ital,wght@0,400;0,600;1,400" },
      { id: "atkinson", label: "Atkinson Hyperlegible", stack: sans("Atkinson Hyperlegible"), query: "Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400" },
      { id: "crimson-pro", label: "Crimson Pro", stack: serif("Crimson Pro"), query: "Crimson+Pro:ital,wght@0,400;0,600;1,400" },
      { id: "eb-garamond", label: "EB Garamond", stack: serif("EB Garamond"), query: "EB+Garamond:ital,wght@0,400;0,600;1,400" },
      { id: "literata", label: "Literata", stack: serif("Literata"), query: "Literata:ital,wght@0,400;0,600;1,400" },
      { id: "lora", label: "Lora", stack: serif("Lora"), query: "Lora:ital,wght@0,400;0,600;1,400" },
      { id: "merriweather", label: "Merriweather", stack: serif("Merriweather"), query: "Merriweather:ital,wght@0,400;0,700;1,400" },
      SAME_AS_UI,
    ],
  },
};

export const FONT_ROLE_IDS = Object.keys(FONT_ROLES) as FontRole[];

export function parseFont(role: FontRole, value: unknown): string {
  const config = FONT_ROLES[role];
  return typeof value === "string" && config.options.some((option) => option.id === value) ? value : config.defaultId;
}

export function fontOption(role: FontRole, id: string): FontOption {
  const config = FONT_ROLES[role];
  return config.options.find((option) => option.id === id) ?? config.options.find((option) => option.id === config.defaultId)!;
}

export function fontStylesheetUrl(option: FontOption): string | null {
  return option.query ? `https://fonts.googleapis.com/css2?family=${option.query}&display=swap` : null;
}

export type MotionPreference = "system" | "reduced";
export const MOTION_STORAGE_KEY = "rpg-tools:motion";
export function parseMotion(value: unknown): MotionPreference {
  return value === "reduced" ? "reduced" : "system";
}

/**
 * Text size scales the whole interface (text, controls and spacing together), like browser
 * zoom but saved per device for RPG Tools only. Maps keep their own zoom.
 */
export const TEXT_SIZES = [
  { id: "smaller", label: "Smaller", zoom: 0.85 },
  { id: "small", label: "Small", zoom: 0.92 },
  { id: "default", label: "Default", zoom: 1 },
  { id: "large", label: "Large", zoom: 1.1 },
  { id: "larger", label: "Larger", zoom: 1.25 },
] as const;
export type TextSizeId = (typeof TEXT_SIZES)[number]["id"];
export const DEFAULT_TEXT_SIZE: TextSizeId = "default";
export const TEXT_SIZE_STORAGE_KEY = "rpg-tools:text-size";
export function parseTextSize(value: unknown): TextSizeId {
  return typeof value === "string" && TEXT_SIZES.some((size) => size.id === value) ? (value as TextSizeId) : DEFAULT_TEXT_SIZE;
}
/**
 * The interface zoom now in use. Mouse positions (clientX, getBoundingClientRect) are in screen
 * pixels, while CSS lengths inside the page are zoomed, so divide a screen position by this
 * before using it as a fixed position.
 */
export function uiZoom(): number {
  if (typeof document === "undefined") return 1;
  return TEXT_SIZES.find((size) => size.id === document.documentElement.dataset.textSize)?.zoom ?? 1;
}

/**
 * How wide pages may grow: the home page, Campaigns, the campaign hub and Encyclopedia
 * pages. Maptable's board always fills the window. Saved per device.
 */
export const PAGE_WIDTHS = [
  { id: "narrow", label: "Narrow" },
  { id: "default", label: "Standard" },
  { id: "wide", label: "Wide" },
  { id: "full", label: "Full" },
] as const;
export type PageWidthId = (typeof PAGE_WIDTHS)[number]["id"];
export const DEFAULT_PAGE_WIDTH: PageWidthId = "default";
export const PAGE_WIDTH_STORAGE_KEY = "rpg-tools:page-width";
export function parsePageWidth(value: unknown): PageWidthId {
  return typeof value === "string" && PAGE_WIDTHS.some((w) => w.id === value) ? (value as PageWidthId) : DEFAULT_PAGE_WIDTH;
}

/** Every key the Appearance menu writes, for "Reset to defaults". */
export const APPEARANCE_STORAGE_KEYS = [THEME_STORAGE_KEY, ACCENT_STORAGE_KEY, MOTION_STORAGE_KEY, TEXT_SIZE_STORAGE_KEY, PAGE_WIDTH_STORAGE_KEY, ...FONT_ROLE_IDS.map((role) => FONT_ROLES[role].storageKey)];

const bootFonts = FONT_ROLE_IDS.map((role) => {
  const config = FONT_ROLES[role];
  return { role, key: config.storageKey, cssVar: config.cssVar, options: Object.fromEntries(config.options.map((o) => [o.id, [o.stack, fontStylesheetUrl(o)]])) };
});

/**
 * Runs in <head> before the first paint so pages never flash the wrong theme,
 * accent or font. Kept dependency-free because it is inlined as a string.
 */
export const appearanceBootScript = `(function(){try{var d=document.documentElement,s=window.localStorage,m=s.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(m!=="light"&&m!=="dark"&&m!=="system"){m="system";var k=${JSON.stringify(LEGACY_THEME_KEYS)};for(var i=0;i<k.length;i++){var o=s.getItem(k[i]);if(o==="light"||o==="dark"){m=o;break;}}}var dark=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);d.dataset.theme=dark?"dark":"light";d.dataset.themeMode=m;var a=s.getItem(${JSON.stringify(ACCENT_STORAGE_KEY)});d.dataset.accent=${JSON.stringify(ACCENTS.map((a) => a.id))}.indexOf(a)>=0?a:${JSON.stringify(DEFAULT_ACCENT)};if(s.getItem(${JSON.stringify(MOTION_STORAGE_KEY)})==="reduced")d.dataset.motion="reduced";var z=s.getItem(${JSON.stringify(TEXT_SIZE_STORAGE_KEY)});if(${JSON.stringify(TEXT_SIZES.map((x) => x.id).filter((id) => id !== DEFAULT_TEXT_SIZE))}.indexOf(z)>=0)d.dataset.textSize=z;var pw=s.getItem(${JSON.stringify(PAGE_WIDTH_STORAGE_KEY)});if(${JSON.stringify(PAGE_WIDTHS.map((x) => x.id).filter((id) => id !== DEFAULT_PAGE_WIDTH))}.indexOf(pw)>=0)d.dataset.pageWidth=pw;var f=${JSON.stringify(bootFonts)};for(var j=0;j<f.length;j++){var c=f[j].options[s.getItem(f[j].key)];if(!c)continue;d.style.setProperty(f[j].cssVar,c[0]);if(c[1]){var l=document.createElement("link");l.rel="stylesheet";l.href=c[1];l.id="rpg-font-"+f[j].role;document.head.appendChild(l);}}}catch(e){}})();`;

/** The three default faces, always loaded by the root layout. */
export const DEFAULT_FONTS_URL = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Schibsted+Grotesk:wght@500;600;700&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&display=swap";
