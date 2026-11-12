import { parseDice } from '../rolls.ts';

/**
 * Inline markup shared by the reader, the player filter and tests.
 *   [[1d20+5]] or [[1d20+5|Sneak attack]]  a roll (must contain at least one die, so [[1999]] stays a link)
 *   {{word|note}}                          a word with your own hover note
 */
export type InlineRoll = { formula: string; label: string | null };
export function rollTarget(inner: string): InlineRoll | null {
  const at = inner.indexOf('|');
  const formula = (at < 0 ? inner : inner.slice(0, at)).trim();
  const label = at < 0 ? null : inner.slice(at + 1).trim() || null;
  if (!/d\s*\d/i.test(formula) || formula.length > 200) return null;
  try { parseDice(formula); } catch { return null; }
  return { formula: formula.replace(/\s+/g, ''), label };
}
export const NOTE = /\{\{([^|{}\n]{1,200})\|([^{}\n]{1,1000})\}\}/g;
export const INLINE_TOKENS = /(\[\[[^\]\n]+\]\]|\{\{[^{}\n]+\}\}|\*\*[^*]+\*\*|`[^`]+`)/g;

/** Plain text for players: rolls become their label or formula; notes keep only the word (notes are the GM's). */
export function playerInline(text: string) {
  return text
    .replace(/\[\[([^\]\n]+)\]\]/g, (whole, inner: string) => { const roll = rollTarget(inner); return roll ? (roll.label ? `${roll.label} (${roll.formula})` : roll.formula) : whole; })
    .replace(NOTE, (_, word: string) => word);
}

/** A short plain-text preview of a page's text for hover cards. */
export function plainExcerpt(text: string, max = 220) {
  const out = text
    .replace(/^[ \t]*:::[ \t]*secret[\s\S]*?^[ \t]*:::[ \t]*$/gim, '')
    .replace(/\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/g, (_, target: string, label?: string) => label?.trim() || (target.startsWith('maptable:') ? 'Battle map' : target))
    .replace(NOTE, (_, word: string) => word)
    .replace(/^[ \t]*- \[[ xX]\] /gm, '').replace(/^#+ /gm, '').replace(/[*`>]/g, '')
    .replace(/\s+/g, ' ').trim();
  return out.length > max ? out.slice(0, max - 1).trimEnd() + '…' : out;
}
