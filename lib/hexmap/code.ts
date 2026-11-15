import { defaultHexLook, defaultHexOptions, normalizeHexOptions, type HexLook, type HexMapOptions } from "./generate.ts";

/**
 * A settings code holds a hex map's seed, every setting that differs from the defaults and its
 * look, as "HEX1-" and base64url JSON, so a friend who pastes it gets the same map.
 */
const PREFIX = "HEX1-";

function toBase64Url(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = ""; for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(text: string) {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
}

export function hexSettingsCode(options: HexMapOptions, look: HexLook = defaultHexLook): string {
  const o = normalizeHexOptions(options), out: Record<string, unknown> = { seed: o.seed };
  for (const [key, value] of Object.entries(o)) if (value !== defaultHexOptions[key as keyof HexMapOptions]) out[key] = value;
  for (const [key, value] of Object.entries(look)) if (value !== defaultHexLook[key as keyof HexLook]) out[`look.${key}`] = value;
  return PREFIX + toBase64Url(JSON.stringify(out));
}

/** The options and look in a settings code, or null when it is not one. Anything it leaves out is the default. */
export function readHexSettingsCode(code: string): { options: HexMapOptions; look: HexLook } | null {
  const text = code.trim();
  if (!text.toUpperCase().startsWith(PREFIX) || text.length > 4000) return null;
  let data: unknown;
  try { data = JSON.parse(fromBase64Url(text.slice(PREFIX.length))); } catch { return null; }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const raw = data as Record<string, unknown>, options: Record<string, unknown> = { ...defaultHexOptions }, look: HexLook = { ...defaultHexLook };
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith("look.")) {
      const k = key.slice(5) as keyof HexLook;
      if (k in defaultHexLook && typeof value === typeof defaultHexLook[k]) (look as Record<string, unknown>)[k] = value;
    } else options[key] = value;
  }
  if (!["painted", "flat", "ink"].includes(look.look)) look.look = defaultHexLook.look;
  if (!["none", "nw", "ne", "sw", "se"].includes(look.legend)) look.legend = defaultHexLook.legend;
  // Settings a code leaves out are today's defaults, not the older maps' ones.
  return { options: normalizeHexOptions(options), look };
}
