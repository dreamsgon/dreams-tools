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

/**
 * Runs in <head> before the first paint so pages never flash the wrong theme
 * or accent. Kept dependency-free because it is inlined as a string.
 */
export const appearanceBootScript = `(function(){try{var d=document.documentElement,s=window.localStorage,m=s.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(m!=="light"&&m!=="dark"&&m!=="system"){m="system";var k=${JSON.stringify(LEGACY_THEME_KEYS)};for(var i=0;i<k.length;i++){var o=s.getItem(k[i]);if(o==="light"||o==="dark"){m=o;break;}}}var dark=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);d.dataset.theme=dark?"dark":"light";d.dataset.themeMode=m;var a=s.getItem(${JSON.stringify(ACCENT_STORAGE_KEY)});d.dataset.accent=${JSON.stringify(ACCENTS.map((a) => a.id))}.indexOf(a)>=0?a:${JSON.stringify(DEFAULT_ACCENT)};}catch(e){}})();`;
