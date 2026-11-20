/*
 * Wiki page text, read into blocks. One reader for the GM's page, the player view and the guide's examples:
 * Markdown (headings, lists, numbered lists, tasks, quotes, code, rules, tables, footnotes) plus wiki syntax
 * (`::: name` blocks, `![[Page]]` embeds, `[[table:…]]` and `[[maptable:…]]` lines, `[dohtml]` HTML).
 * Inline pieces (links, rolls, styling) are split by `inlineParts`. Pure: no React, no workspace.
 *
 * GM-only text (`::: secret` blocks, `%%asides%%`, lines starting `(gm)`) is taken out on the server for players
 * (world-model stripSecrets); here it is only marked so the GM's page can show it.
 */

export type ListItem = { indent: number; text: string };
export type Block =
  | { type: 'heading'; level: number; text: string; id: string }
  | { type: 'paragraph'; text: string }
  | { type: 'gap' }
  | { type: 'rule' }
  | { type: 'bullet'; indent: number; text: string }
  | { type: 'number'; indent: number; n: number; text: string }
  | { type: 'task'; indent: number; done: boolean; text: string; line: number }
  | { type: 'quote'; text: string }
  | { type: 'code'; text: string }
  | { type: 'table'; head: string[]; align: ('left' | 'center' | 'right' | null)[]; rows: string[][] }
  | { type: 'block'; name: string; arg: string; children: Block[]; lines: string[]; columns?: Block[][] }
  | { type: 'embed'; target: string; options: string[] }
  | { type: 'picture'; imageId: string; caption: string; side: PictureSide; size: PictureSize }
  | { type: 'randomTable'; inner: string }
  | { type: 'maptable'; sceneId: string; label: string }
  | { type: 'html'; source: string }
  | { type: 'footnotes'; notes: { key: string; n: number; text: string }[] };

export type PictureSide = 'left' | 'right' | 'center';
export type PictureSize = 'small' | 'medium' | 'large' | 'full';
/** `![[picture:<id>|Caption|right|small]]` on a line of its own: a picture uploaded to the page. */
const PICTURE_LINE = /^!\[\[picture:([0-9a-fA-F-]{36})((?:\|[^\]\n]*)?)\]\]$/;
const PICTURE_ANY = /!\[\[picture:([0-9a-fA-F-]{36})[|\]]/g;
/** The pictures a page's text shows, for checking which pictures a reader may fetch. */
export const pictureIds = (text: string) => [...text.matchAll(PICTURE_ANY)].map(m => m[1]!.toLowerCase());
/** The text that shows a picture, with its caption, side and size. */
export function pictureLine(imageId: string, caption = '', side: PictureSide = 'right', size: PictureSize = 'medium') {
  const parts = [`picture:${imageId}`, caption.replace(/[\]|\n]/g, ' ').trim(), side === 'right' ? '' : side, size === 'medium' ? '' : size].filter(Boolean);
  return `![[${parts.join('|')}]]`;
}
function pictureOptions(raw: string): { caption: string; side: PictureSide; size: PictureSize } {
  let side: PictureSide = 'right', size: PictureSize = 'medium'; const words: string[] = [];
  for (const part of raw.split('|').map(s => s.trim()).filter(Boolean)) {
    const low = part.toLowerCase();
    if (low === 'left' || low === 'right' || low === 'center' || low === 'centre') side = low === 'centre' ? 'center' : low;
    else if (low === 'small' || low === 'medium' || low === 'large' || low === 'full') size = low;
    else words.push(part);
  }
  return { caption: words.join(' | ').slice(0, 300), side, size };
}

export const BLOCK_OPEN = /^[ \t]*:::[ \t]*([a-z][\w-]*)[ \t]*(.*?)[ \t]*$/i;
export const BLOCK_CLOSE = /^[ \t]*:::[ \t]*$/;
const HTML_OPEN = /^\[(do)?html\]$/i, HTML_CLOSE = /^\[\/(do)?html\]$/i;

/** A heading's anchor: `[[Page#Some heading]]` links to `h-some-heading`. */
export const headingId = (text: string) => 'h-' + (plainInline(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section');

/** Lines of a `:::` block up to its matching close, counting blocks inside it. Returns the inner lines and the index after the close. */
function blockBody(lines: readonly string[], start: number): { body: string[]; next: number } {
  let depth = 1, i = start;
  const body: string[] = [];
  for (; i < lines.length; i++) {
    const bare = lines[i]!.replace(/\r$/, '');
    if (BLOCK_OPEN.test(bare)) depth++;
    else if (BLOCK_CLOSE.test(bare) && --depth === 0) return { body, next: i + 1 };
    body.push(lines[i]!);
  }
  return { body, next: i };
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split(/\|(?![^[]*\]\])/).map(c => c.trim());
const isRow = (line: string | undefined) => !!line && /^\s*\|.*\|\s*$/.test(line);
const isDivider = (line: string | undefined) => !!line && line.includes('|') && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line);

/** Reads page text into blocks. `offset` is the line number of the first line (for task checkboxes inside blocks). */
export function wikiBlocks(text: string, offset = 0, depth = 0): Block[] {
  const lines = text.split('\n').map(l => l.replace(/\r$/, ''));
  const out: Block[] = [];
  const notes = new Map<string, string>();
  for (const l of lines) { const m = /^\[\^([\w-]{1,40})\]:\s*(.*)$/.exec(l); if (m) notes.set(m[1]!, m[2]!); }
  const nums = new Map<number, number>();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    let m: RegExpExecArray | null;
    const listish = /^(\s*)(?:[-*]|\d{1,4}[.)]) /.test(line);
    if (!listish) nums.clear();
    if (/^\[\^[\w-]{1,40}\]:/.test(line)) { i++; continue; }
    if (line.startsWith('```')) {
      const code: string[] = []; i++;
      while (i < lines.length && !lines[i]!.startsWith('```')) code.push(lines[i++]!);
      i++; out.push({ type: 'code', text: code.join('\n') }); continue;
    }
    if (HTML_OPEN.test(line.trim())) {
      const src: string[] = []; i++;
      while (i < lines.length && !HTML_CLOSE.test(lines[i]!.trim())) src.push(lines[i++]!);
      i++; out.push({ type: 'html', source: src.join('\n') }); continue;
    }
    if ((m = BLOCK_OPEN.exec(line))) {
      const name = m[1]!.toLowerCase(), arg = m[2]!.trim(), start = i + 1;
      const { body, next } = blockBody(lines, start);
      i = next;
      if (name === 'html') { out.push({ type: 'html', source: body.join('\n') }); continue; }
      const block: Extract<Block, { type: 'block' }> = { type: 'block', name, arg, lines: body, children: depth > 6 ? [] : wikiBlocks(body.join('\n'), offset + start, depth + 1) };
      if (name === 'columns') {
        const cols: string[][] = [[]];
        for (const l of body) { if (/^\+{3,}\s*$/.test(l)) cols.push([]); else cols[cols.length - 1]!.push(l); }
        block.columns = cols.slice(0, 4).map(c => wikiBlocks(c.join('\n'), offset + start, depth + 1));
      }
      out.push(block); continue;
    }
    if ((m = /^> \[!(\w{1,20})\][ \t]*(.*)$/.exec(line))) {
      const body: string[] = []; const start = i + 1; i++;
      while (i < lines.length && /^> ?/.test(lines[i]!) && lines[i]!.trim()) body.push(lines[i++]!.replace(/^> ?/, ''));
      out.push({ type: 'block', name: m[1]!.toLowerCase(), arg: m[2]!.trim(), lines: body, children: wikiBlocks(body.join('\n'), offset + start, depth + 1) }); continue;
    }
    const trimmed = line.trim();
    if ((m = PICTURE_LINE.exec(trimmed))) { out.push({ type: 'picture', imageId: m[1]!.toLowerCase(), ...pictureOptions(m[2]!) }); i++; continue; }
    if ((m = /^!\[\[([^\]\n]{1,300})\]\]$/.exec(trimmed))) { const [target = '', ...options] = m[1]!.split('|').map(s => s.trim()); out.push({ type: 'embed', target, options }); i++; continue; }
    if ((m = /^\[\[(table:[^\]\n]{1,300})\]\]$/i.exec(trimmed))) { out.push({ type: 'randomTable', inner: m[1]! }); i++; continue; }
    if ((m = /^\[\[maptable:([A-Za-z0-9_-]{1,120})(?:\|([^\]]*))?\]\]$/.exec(trimmed))) { out.push({ type: 'maptable', sceneId: m[1]!, label: m[2]?.trim() || 'Battle map' }); i++; continue; }
    if ((m = /^(#{1,6}) (.*)$/.exec(line))) { out.push({ type: 'heading', level: Math.min(m[1]!.length + 1, 6), text: m[2]!, id: headingId(m[2]!) }); i++; continue; }
    if (/^ {0,3}(?:-[ \t]*){3,}$|^ {0,3}(?:\*[ \t]*){3,}$|^ {0,3}(?:_[ \t]*){3,}$/.test(line)) { out.push({ type: 'rule' }); i++; continue; }
    if (isRow(line) && isDivider(lines[i + 1])) {
      const head = cells(line), align = cells(lines[i + 1]!).map(c => /^:-+:$/.test(c) ? 'center' as const : /^-+:$/.test(c) ? 'right' as const : /^:-+$/.test(c) ? 'left' as const : null);
      const rows: string[][] = []; i += 2;
      while (i < lines.length && isRow(lines[i])) rows.push(cells(lines[i++]!));
      out.push({ type: 'table', head, align, rows: rows.slice(0, 500) }); continue;
    }
    if ((m = /^(\s*)- \[([ xX])\] (.*)$/.exec(line))) { out.push({ type: 'task', indent: Math.min(m[1]!.length, 40), done: m[2]!.toLowerCase() === 'x', text: m[3]!, line: offset + i }); i++; continue; }
    if ((m = /^(\s*)[-*] (.*)$/.exec(line))) { out.push({ type: 'bullet', indent: Math.min(m[1]!.length, 40), text: m[2]! }); i++; continue; }
    if ((m = /^(\s*)(\d{1,4})[.)] (.*)$/.exec(line))) {
      const indent = Math.min(m[1]!.length, 40);
      for (const k of [...nums.keys()]) if (k > indent) nums.delete(k);
      const n = nums.has(indent) ? nums.get(indent)! + 1 : Number(m[2]);
      nums.set(indent, n);
      out.push({ type: 'number', indent, n, text: m[3]! }); i++; continue;
    }
    if (line.startsWith('> ') || line === '>') { out.push({ type: 'quote', text: line.slice(2) }); i++; continue; }
    out.push(trimmed ? { type: 'paragraph', text: line } : { type: 'gap' }); i++;
  }
  if (!depth && notes.size) {
    const used = [...text.matchAll(/\[\^([\w-]{1,40})\](?!:)/g)].map(m => m[1]!).filter((k, n, all) => all.indexOf(k) === n && notes.has(k));
    if (used.length) out.push({ type: 'footnotes', notes: used.map((key, n) => ({ key, n: n + 1, text: notes.get(key)! })) });
  }
  return out;
}

/** How many HTML boxes (`::: html`, `[html]`, `[dohtml]`) the text has, for "Use HTML in Wiki pages". */
export function htmlBlockCount(text: string): number {
  const count = (blocks: readonly Block[]): number => blocks.reduce((n, b) => n + (b.type === 'html' ? 1 : b.type === 'block' ? count(b.children) + (b.columns ?? []).reduce((m, c) => m + count(c), 0) : 0), 0);
  return /:::|\[(?:do)?html\]/i.test(text) ? count(wikiBlocks(text)) : 0;
}
/** Whether `after` has HTML that `before` didn't: someone without "Use HTML in Wiki pages" may keep or remove HTML, not add it. */
export const addsHtml = (before: string, after: string) => htmlBlockCount(after) > htmlBlockCount(before);

/** Footnote numbers in order of first use, for `[^key]` markers. */
export function footnoteNumbers(text: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of text.matchAll(/\[\^([\w-]{1,40})\](?!:)/g)) if (!out.has(m[1]!)) out.set(m[1]!, out.size + 1);
  return out;
}

/* ---------- Inline ---------- */

export type InlinePart =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'aside'; text: string }
  | { type: 'styled'; text: string; attrs: string }
  | { type: 'link'; inner: string }
  | { type: 'note'; word: string; note: string }
  | { type: 'web'; label: string; href: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'strike'; text: string }
  | { type: 'mark'; text: string }
  | { type: 'footnote'; key: string };

const INLINE = /(`[^`\n]+`|%%[^%\n]+%%|\[(?:\[\[[^\]\n]+\]\]|[^\]\n])+\]\{[^}\n]{1,200}\}|\[\[[^\]\n]+\]\]|\{\{[^{}\n]+\}\}|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*|~~[^~\n]+~~|==[^=\n]+==|\[\^[\w-]{1,40}\])/g;

export function inlineParts(text: string): InlinePart[] {
  const out: InlinePart[] = [];
  text.split(INLINE).forEach((part, i) => {
    if (!part) return;
    if (i % 2 === 0) { out.push({ type: 'text', text: part }); return; }
    if (part[0] === '`') { out.push({ type: 'code', text: part.slice(1, -1) }); return; }
    if (part.startsWith('%%')) { out.push({ type: 'aside', text: part.slice(2, -2).trim() }); return; }
    if (part[0] === '[' && part.endsWith('}')) { const m = /^\[([\s\S]+)\]\{([^}]+)\}$/.exec(part); if (m) { out.push({ type: 'styled', text: m[1]!, attrs: m[2]! }); return; } }
    if (part.startsWith('[[')) { out.push({ type: 'link', inner: part.slice(2, -2) }); return; }
    if (part.startsWith('{{')) { const at = part.indexOf('|'); out.push(at > 2 ? { type: 'note', word: part.slice(2, at), note: part.slice(at + 1, -2) } : { type: 'text', text: part }); return; }
    if (part.startsWith('[^')) { out.push({ type: 'footnote', key: part.slice(2, -1) }); return; }
    if (part[0] === '[') { const m = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part); if (m) { out.push({ type: 'web', label: m[1]!, href: m[2]! }); return; } }
    if (part.startsWith('**')) { out.push({ type: 'bold', text: part.slice(2, -2) }); return; }
    if (part.startsWith('~~')) { out.push({ type: 'strike', text: part.slice(2, -2) }); return; }
    if (part.startsWith('==')) { out.push({ type: 'mark', text: part.slice(2, -2) }); return; }
    if (part[0] === '*') { out.push({ type: 'italic', text: part.slice(1, -1) }); return; }
    out.push({ type: 'text', text: part });
  });
  return out;
}

/** Text without markup, for headings' anchors, contents lists and excerpts. */
export function plainInline(text: string): string {
  return text
    .replace(/%%[^%\n]*%%/g, '')
    .replace(/\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/g, (_, t: string, l?: string) => l?.trim() || t.replace(/^(table|maptable):/i, '').replace(/#.*$/, ''))
    .replace(/\[([^\]\n]+)\]\{[^}\n]*\}/g, '$1')
    .replace(/\[([^\]\n]+)\]\(https?:[^)]*\)/g, '$1')
    .replace(/\{\{([^|{}\n]+)\|[^{}\n]*\}\}/g, '$1')
    .replace(/\[\^[\w-]+\]/g, '')
    .replace(/[*`~=]/g, '')
    .trim();
}

/** `[[Page#Section|label]]`: the page, the section and the label. */
export function linkParts(inner: string): { page: string; section: string | null; label: string | null } {
  const bar = inner.indexOf('|'), target = (bar < 0 ? inner : inner.slice(0, bar)).trim(), label = bar < 0 ? null : inner.slice(bar + 1).trim() || null;
  const hash = target.indexOf('#');
  return { page: hash < 0 ? target : target.slice(0, hash).trim(), section: hash < 0 ? null : target.slice(hash + 1).trim() || null, label };
}

/** The text of one section of a page (under the heading with that name, up to the next heading at its level or above). */
export function sectionText(body: string, name: string): string | null {
  const lines = body.split('\n'), want = headingId(name);
  let start = -1, level = 0, fenced = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.startsWith('```')) fenced = !fenced;
    if (fenced) continue;
    const m = /^(#{1,6}) (.*)$/.exec(lines[i]!.replace(/\r$/, ''));
    if (!m) continue;
    if (start < 0) { if (headingId(m[2]!) === want) { start = i; level = m[1]!.length; } }
    else if (m[1]!.length <= level) return lines.slice(start + 1, i).join('\n').trim();
  }
  return start < 0 ? null : lines.slice(start + 1).join('\n').trim();
}

/** The opening of a page: its text up to the first heading, without info boxes. */
export function leadText(body: string): string {
  const lines = body.split('\n'), out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const bare = lines[i]!.replace(/\r$/, '');
    if (/^#{1,6} /.test(bare)) break;
    const open = BLOCK_OPEN.exec(bare);
    if (open && open[1]!.toLowerCase() === 'infobox') { i = blockBody(lines, i + 1).next - 1; continue; }
    out.push(lines[i]!);
  }
  return out.join('\n').trim();
}

/** Headings for a contents list (only top-level ones, not inside blocks). */
export function contents(blocks: readonly Block[]): { level: number; text: string; id: string }[] {
  return blocks.filter((b): b is Extract<Block, { type: 'heading' }> => b.type === 'heading').map(b => ({ level: b.level, text: plainInline(b.text), id: b.id }));
}

/* ---------- Styling ---------- */

/** Colours you can name in `[words]{color=…}`; each follows light and dark mode (encyclopedia.css). */
export const PALETTE = ['crimson', 'ember', 'brass', 'verdigris', 'lapis', 'amethyst', 'muted'] as const;
export const FONTS = { serif: 'var(--wiki-font-serif)', sans: 'var(--wiki-font-sans)', hand: 'var(--wiki-font-hand)', mono: 'var(--wiki-font-mono)', display: 'var(--wiki-font-display)' } as const;
const SIZES: Record<string, string> = { small: '0.85em', big: '1.25em', huge: '1.6em' };

/**
 * `size=big font=hand color=ember bg=lapis caps align=center` into CSS properties. Only these words and values
 * are read; anything else is ignored, so styling can't reach outside the words it wraps.
 */
export function styleOf(attrs: string, block = false): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of attrs.matchAll(/([a-z]+)(?:=([#\w-]+))?/gi)) {
    const key = m[1]!.toLowerCase(), value = (m[2] ?? '').toLowerCase();
    const colour = (PALETTE as readonly string[]).includes(value) ? `var(--wiki-${value})` : /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/.test(value) ? value : null;
    if (key === 'size' && SIZES[value]) out.fontSize = SIZES[value]!;
    else if ((key === 'color' || key === 'colour') && colour) out.color = colour;
    else if (key === 'bg' && colour) out.backgroundColor = `color-mix(in srgb, ${colour} 22%, transparent)`;
    else if (key === 'font' && value in FONTS) out.fontFamily = FONTS[value as keyof typeof FONTS];
    else if (key === 'caps') { out.fontVariant = 'small-caps'; out.letterSpacing = '0.04em'; }
    else if (key === 'bold') out.fontWeight = '600';
    else if (key === 'italic') out.fontStyle = 'italic';
    else if (block && key === 'align' && /^(left|center|centre|right)$/.test(value)) out.textAlign = value === 'centre' ? 'center' : value;
  }
  return out;
}

/* ---------- Page lists ---------- */

export type PageListOptions = { kinds: string[]; tag: string | null; inside: string | null; sort: 'title' | 'changed'; limit: number | null; show: 'list' | 'cards' | 'table' };
export function pageListOptions(lines: readonly string[]): PageListOptions {
  const o: Record<string, string> = {};
  for (const l of lines) { const at = l.indexOf(':'); if (at > 0) o[l.slice(0, at).trim().toLowerCase()] = l.slice(at + 1).trim(); }
  const alias: Record<string, string> = { organization: 'faction', organisation: 'faction', npc: 'character', page: 'note', category: 'folder' };
  return {
    kinds: (o.kind ?? o.kinds ?? '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean).map(k => { const one = k.replace(/s$/, ''); return alias[k] ?? alias[one] ?? one; }),
    tag: o.tag ? o.tag.replace(/^#/, '').trim().toLowerCase() || null : null,
    inside: o.inside?.replace(/^\[\[|\]\]$/g, '').trim() || null,
    sort: o.sort?.toLowerCase().startsWith('changed') ? 'changed' : 'title',
    limit: Number(o.limit) > 0 ? Math.min(Number(o.limit), 200) : null,
    show: o.show === 'cards' ? 'cards' : o.show === 'table' ? 'table' : 'list',
  };
}

/** `name: value` rows of an info box. Rows starting `(gm)` are the GM's; the server takes them out for players. */
export function infoRows(lines: readonly string[]): { label: string; value: string; gm: boolean }[] {
  return lines.flatMap(l => {
    const gm = /^\s*\(gm\)\s*/i.test(l), t = l.replace(/^\s*\(gm\)\s*/i, ''), at = t.indexOf(':');
    if (at < 1) return [];
    const label = t.slice(0, at).trim(), value = t.slice(at + 1).trim();
    return value && label.toLowerCase() !== 'image' ? [{ label, value, gm }] : [];
  });
}
