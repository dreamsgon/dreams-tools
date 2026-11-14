/** WCAG relative luminance and contrast ratio for #rrggbb colours. Pure logic, no UI. */

function channels(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function relativeLuminance(hex: string): number {
  const c = channels(hex);
  if (!c) return 0;
  const [r, g, b] = c.map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Smallest contrast WCAG asks for normal-sized text. */
export const READABLE_CONTRAST = 4.5;
export const readable = (ratio: number) => ratio >= READABLE_CONTRAST;
/** "6.2 : 1", rounded down so a ratio just under 4.5 never reads as 4.5. */
export function formatContrast(ratio: number): string {
  return `${(Math.floor(ratio * 10) / 10).toFixed(1)} : 1`;
}
