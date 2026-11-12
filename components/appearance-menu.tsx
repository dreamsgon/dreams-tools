"use client";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Palette } from "lucide-react";
import {
  ACCENTS,
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT,
  LEGACY_THEME_KEYS,
  THEME_STORAGE_KEY,
  parseAccent,
  pickThemeMode,
  resolveTheme,
  type AccentId,
  type ThemeMode,
} from "@/lib/appearance";

const MODE_LABELS: Record<ThemeMode, string> = { light: "Light", dark: "Dark", system: "System" };

function read(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* private mode: the choice lasts for this page only */ }
}
function prefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}
function apply(mode: ThemeMode, accent: AccentId) {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(mode, prefersDark());
  root.dataset.themeMode = mode;
  root.dataset.accent = accent;
}

/** Theme and accent colour picker. Saved on this device only. */
export default function AppearanceMenu({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  // The panel only renders after a click, so reading storage here cannot cause a
  // hydration mismatch. The boot script in app/layout.tsx already applied both.
  const [mode, setMode] = useState<ThemeMode>(() => typeof window === "undefined" ? "system" : pickThemeMode(read(THEME_STORAGE_KEY), LEGACY_THEME_KEYS.map(read)));
  const [accent, setAccent] = useState<AccentId>(() => typeof window === "undefined" ? DEFAULT_ACCENT : parseAccent(read(ACCENT_STORAGE_KEY)) ?? DEFAULT_ACCENT);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (mode !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => apply("system", accent);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [mode, accent]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const chooseMode = (next: ThemeMode) => { setMode(next); write(THEME_STORAGE_KEY, next); apply(next, accent); };
  const chooseAccent = (next: AccentId) => { setAccent(next); write(ACCENT_STORAGE_KEY, next); apply(mode, next); };

  return <div className={`appearance ${className}`.trim()} ref={wrapper}>
    <button ref={trigger} type="button" className="appearance-trigger icon-button" aria-label="Appearance" title="Appearance" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
      <Palette size={18} aria-hidden="true" />
      <span className="appearance-dot" aria-hidden="true" />
    </button>
    {open && <div className="appearance-panel" id={panelId} role="dialog" aria-label="Appearance">
      <h2>Appearance</h2>
      <fieldset className="appearance-group">
        <legend>Theme</legend>
        <div className="appearance-segments" role="radiogroup" aria-label="Theme">
          {(Object.keys(MODE_LABELS) as ThemeMode[]).map((value) =>
            <button key={value} type="button" role="radio" aria-checked={mode === value} onClick={() => chooseMode(value)}>{MODE_LABELS[value]}</button>)}
        </div>
      </fieldset>
      <fieldset className="appearance-group">
        <legend>Accent colour</legend>
        <div className="appearance-swatches" role="radiogroup" aria-label="Accent colour">
          {ACCENTS.map((item) =>
            <button key={item.id} type="button" role="radio" aria-checked={accent === item.id} onClick={() => chooseAccent(item.id)}
              style={{ "--swatch-light": item.light, "--swatch-dark": item.dark } as CSSProperties}>
              <span className="appearance-swatch" aria-hidden="true" />{item.label}
            </button>)}
        </div>
      </fieldset>
      <p className="appearance-note">Saved on this device. Shared maps and what players see are not affected.</p>
    </div>}
  </div>;
}
