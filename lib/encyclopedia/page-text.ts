/*
 * How a Wiki page's text is set: size, font, line spacing, paragraphs, headings and a drop cap. A world can set the
 * default for every page (Every page in the Wiki), a page for itself, or a page for itself and every page inside it
 * (a branch). The page's own settings win over its nearest branch, and that over the Wiki's default. Each reader's
 * own text size in Appearance still scales everything. Pure: world-model.ts keeps the schemas on pages and worlds.
 */
import { z } from 'zod';

export const TEXT_OPTIONS = {
  size: { name: 'Size', values: [['s', 'S'], ['m', 'M'], ['l', 'L'], ['xl', 'XL']] },
  font: { name: 'Font', values: [['serif', 'Book'], ['sans', 'Clean'], ['hand', 'Old hand'], ['mono', 'Typewriter'], ['display', 'Heading']] },
  line: { name: 'Line spacing', values: [['tight', 'Tight'], ['normal', 'Normal'], ['airy', 'Airy']] },
  para: { name: 'Paragraphs', values: [['space', 'Space between'], ['indent', 'Indented']] },
  heads: { name: 'Headings', values: [['plain', 'Plain'], ['rule', 'Underlined'], ['caps', 'Small caps'], ['center', 'Centred']] },
  drop: { name: 'First letter', values: [['off', 'Plain'], ['on', 'Drop cap']] },
} as const;
export type TextKey = keyof typeof TEXT_OPTIONS;
type ValueOf<K extends TextKey> = (typeof TEXT_OPTIONS)[K]['values'][number][0];
export type TextSettings = { [K in TextKey]?: ValueOf<K> };
export type ResolvedText = { [K in TextKey]: ValueOf<K> };
export const TEXT_DEFAULT: ResolvedText = { size: 'm', font: 'serif', line: 'normal', para: 'space', heads: 'plain', drop: 'off' };
export const TEXT_KEYS = Object.keys(TEXT_OPTIONS) as TextKey[];

const values = <K extends TextKey>(k: K) => TEXT_OPTIONS[k].values.map(v => v[0]) as unknown as [ValueOf<K>, ...ValueOf<K>[]];
export const textSettingsSchema = z.object({
  size: z.enum(values('size')).optional(), font: z.enum(values('font')).optional(), line: z.enum(values('line')).optional(),
  para: z.enum(values('para')).optional(), heads: z.enum(values('heads')).optional(), drop: z.enum(values('drop')).optional(),
});
/** A page's own settings, and whether they also reach the pages inside it. */
export const pageTextSchema = textSettingsSchema.extend({ branch: z.boolean().optional() });
export type PageText = z.infer<typeof pageTextSchema>;

type Page = { id: string; parentId: string | null; text?: PageText };
const only = (t: PageText | TextSettings | undefined): TextSettings => Object.fromEntries(TEXT_KEYS.filter(k => t?.[k] !== undefined).map(k => [k, t![k]]));

/**
 * The text settings a page is read with, and where they come from: `page` (its own), `branch` (a page above it whose
 * settings reach the pages inside), or `wiki` (the world's default, or the starting one).
 */
export function resolveText(page: Page, byId: (id: string) => Page | undefined, wiki?: TextSettings): { text: ResolvedText; from: 'page' | 'branch' | 'wiki'; fromId?: string } {
  const text: ResolvedText = { ...TEXT_DEFAULT, ...only(wiki) };
  const above: Page[] = [], seen = new Set([page.id]);
  for (let p = page.parentId ? byId(page.parentId) : undefined; p && !seen.has(p.id); p = p.parentId ? byId(p.parentId) : undefined) { seen.add(p.id); above.unshift(p); }
  let from: 'page' | 'branch' | 'wiki' = 'wiki', fromId: string | undefined;
  for (const p of above) if (p.text?.branch && Object.keys(only(p.text)).length) { Object.assign(text, only(p.text)); from = 'branch'; fromId = p.id; }
  if (Object.keys(only(page.text)).length) { Object.assign(text, only(page.text)); from = 'page'; fromId = page.id; }
  return { text, from, fromId };
}

/** Only the settings that differ from the starting ones, for the player view's payload. Undefined when none do. */
export function textDiff(t: ResolvedText): TextSettings | undefined {
  const out = Object.fromEntries(TEXT_KEYS.filter(k => t[k] !== TEXT_DEFAULT[k]).map(k => [k, t[k]]));
  return Object.keys(out).length ? out as TextSettings : undefined;
}

const SIZE = { s: '16px', m: '18px', l: '20px', xl: '23px' } as const;
const LINE = { tight: '1.45', normal: '1.75', airy: '1.95' } as const;
const FONT = { serif: 'var(--font-reading)', sans: 'var(--font-sans)', hand: 'var(--wiki-font-hand)', mono: 'var(--wiki-font-mono)', display: 'var(--font-display)' } as const;
/** The class and CSS variables for a page's `.prose` (encyclopedia.css: `.prose.t-…`). Nothing when it is all default. */
export function proseLook(t: TextSettings | undefined): { className: string; style: Record<string, string> } {
  const r = { ...TEXT_DEFAULT, ...only(t) };
  const style: Record<string, string> = {};
  if (r.size !== 'm') style['--t-size'] = SIZE[r.size];
  if (r.font !== 'serif') style['--t-font'] = FONT[r.font];
  if (r.line !== 'normal') style['--t-line'] = LINE[r.line];
  const className = [r.para === 'indent' && 't-para-indent', r.heads !== 'plain' && `t-heads-${r.heads}`, r.drop === 'on' && 't-drop', Object.keys(style).length && 't-set'].filter(Boolean).join(' ');
  return { className, style };
}
