"use client";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Palette } from "lucide-react";
import {
  ACCENTS,
  ACCENT_STORAGE_KEY,
  APPEARANCE_STORAGE_KEYS,
  DEFAULT_ACCENT,
  DEFAULT_THEME_MODE,
  FONT_ROLES,
  FONT_ROLE_IDS,
  LEGACY_THEME_KEYS,
  MOTION_STORAGE_KEY,
  TEXT_SIZES,
  TEXT_SIZE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  fontOption,
  fontStylesheetUrl,
  parseAccent,
  parseFont,
  parseMotion,
  parseTextSize,
  pickThemeMode,
  resolveTheme,
  type AccentId,
  type FontRole,
  type MotionPreference,
  type TextSizeId,
  type ThemeMode,
} from "@/lib/appearance";

const MODE_LABELS: Record<ThemeMode, string> = { light: "Light", dark: "Dark", system: "System" };

type Settings = { mode: ThemeMode; accent: AccentId; motion: MotionPreference; textSize: TextSizeId; fonts: Record<FontRole, string> };

function read(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* private mode: the choice lasts for this page only */ }
}
function forget(key: string) {
  try { localStorage.removeItem(key); } catch { /* nothing saved */ }
}
function prefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}
function defaults(): Settings {
  return {
    mode: DEFAULT_THEME_MODE,
    accent: DEFAULT_ACCENT,
    motion: "system",
    textSize: "default",
    fonts: Object.fromEntries(FONT_ROLE_IDS.map((role) => [role, FONT_ROLES[role].defaultId])) as Record<FontRole, string>,
  };
}
function load(): Settings {
  if (typeof window === "undefined") return defaults();
  return {
    mode: pickThemeMode(read(THEME_STORAGE_KEY), LEGACY_THEME_KEYS.map(read)),
    accent: parseAccent(read(ACCENT_STORAGE_KEY)) ?? DEFAULT_ACCENT,
    motion: parseMotion(read(MOTION_STORAGE_KEY)),
    textSize: parseTextSize(read(TEXT_SIZE_STORAGE_KEY)),
    fonts: Object.fromEntries(FONT_ROLE_IDS.map((role) => [role, parseFont(role, read(FONT_ROLES[role].storageKey))])) as Record<FontRole, string>,
  };
}
function applyFont(role: FontRole, id: string) {
  const root = document.documentElement, config = FONT_ROLES[role], option = fontOption(role, id);
  if (id === config.defaultId) root.style.removeProperty(config.cssVar);
  else root.style.setProperty(config.cssVar, option.stack);
  const linkId = `rpg-font-${role}`, href = fontStylesheetUrl(option);
  let link = document.getElementById(linkId) as HTMLLinkElement | null;
  if (!href) { link?.remove(); return; }
  if (!link) { link = document.createElement("link"); link.rel = "stylesheet"; link.id = linkId; document.head.appendChild(link); }
  if (link.href !== href) link.href = href;
}
function apply(settings: Settings) {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(settings.mode, prefersDark());
  root.dataset.themeMode = settings.mode;
  root.dataset.accent = settings.accent;
  if (settings.motion === "reduced") root.dataset.motion = "reduced"; else delete root.dataset.motion;
  if (settings.textSize === "default") delete root.dataset.textSize; else root.dataset.textSize = settings.textSize;
  for (const role of FONT_ROLE_IDS) applyFont(role, settings.fonts[role]);
}

/** Theme, accent, fonts and motion. Saved on this device only. */
export default function AppearanceMenu({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  // The panel only renders after a click, so reading storage here cannot cause a
  // hydration mismatch. The boot script in app/layout.tsx already applied it all.
  const [settings, setSettings] = useState<Settings>(load);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (settings.mode !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => { document.documentElement.dataset.theme = resolveTheme("system", query.matches); };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [settings.mode]);

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

  const update = (next: Settings, key: string, value: string) => { setSettings(next); write(key, value); apply(next); };
  const chooseMode = (mode: ThemeMode) => update({ ...settings, mode }, THEME_STORAGE_KEY, mode);
  const chooseAccent = (accent: AccentId) => update({ ...settings, accent }, ACCENT_STORAGE_KEY, accent);
  const chooseMotion = (motion: MotionPreference) => update({ ...settings, motion }, MOTION_STORAGE_KEY, motion);
  const chooseTextSize = (textSize: TextSizeId) => update({ ...settings, textSize }, TEXT_SIZE_STORAGE_KEY, textSize);
  const chooseFont = (role: FontRole, id: string) => update({ ...settings, fonts: { ...settings.fonts, [role]: id } }, FONT_ROLES[role].storageKey, id);
  const reset = () => {
    for (const key of [...APPEARANCE_STORAGE_KEYS, ...LEGACY_THEME_KEYS]) forget(key);
    const next = defaults();
    setSettings(next);
    apply(next);
  };

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
            <button key={value} type="button" role="radio" aria-checked={settings.mode === value} onClick={() => chooseMode(value)}>{MODE_LABELS[value]}</button>)}
        </div>
      </fieldset>
      <fieldset className="appearance-group">
        <legend>Text size · {TEXT_SIZES.find((size) => size.id === settings.textSize)?.label}</legend>
        <div className="appearance-segments appearance-text-sizes" role="radiogroup" aria-label="Text size">
          {TEXT_SIZES.map((size) =>
            <button key={size.id} type="button" role="radio" aria-checked={settings.textSize === size.id} aria-label={size.label} title={`${size.label} (${Math.round(size.zoom * 100)}%)`} onClick={() => chooseTextSize(size.id)}>
              <span aria-hidden="true" style={{ fontSize: Math.round(13 * size.zoom) }}>A</span>
            </button>)}
        </div>
      </fieldset>
      <fieldset className="appearance-group">
        <legend>Accent colour</legend>
        <div className="appearance-swatches" role="radiogroup" aria-label="Accent colour">
          {ACCENTS.map((item) =>
            <button key={item.id} type="button" role="radio" aria-checked={settings.accent === item.id} onClick={() => chooseAccent(item.id)}
              style={{ "--swatch-light": item.light, "--swatch-dark": item.dark } as CSSProperties}>
              <span className="appearance-swatch" aria-hidden="true" />{item.label}
            </button>)}
        </div>
      </fieldset>
      <fieldset className="appearance-group">
        <legend>Fonts</legend>
        {FONT_ROLE_IDS.map((role) => {
          const config = FONT_ROLES[role], id = `${panelId}-font-${role}`;
          return <div className="appearance-font" key={role}>
            <label htmlFor={id}>{config.label}</label>
            <select id={id} value={settings.fonts[role]} onChange={(event) => chooseFont(role, event.target.value)}>
              {config.options.map((option) => <option key={option.id} value={option.id}>{option.label}{option.id === config.defaultId ? " (default)" : ""}</option>)}
            </select>
            <p className="appearance-sample" style={{ fontFamily: `var(${config.cssVar})` }}>{config.sample}</p>
          </div>;
        })}
      </fieldset>
      <label className="appearance-check">
        <input type="checkbox" checked={settings.motion === "reduced"} onChange={(event) => chooseMotion(event.target.checked ? "reduced" : "system")} />
        Reduce motion and animations
      </label>
      <div className="appearance-footer">
        <p className="appearance-note">Saved on this device. Shared maps and what players see are not affected.</p>
        <button type="button" className="appearance-reset" onClick={reset}>Reset</button>
      </div>
    </div>}
  </div>;
}
