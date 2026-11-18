'use client';
/* Print and download: a topic or a whole board as a plain HTML page or text file, made in the browser. */
import { postBlocks, postInline } from '@/lib/forum/markup';

export type ExportPost = { name: string; by?: string; at: string; body: string };
export type ExportTopic = { title: string; posts: ExportPost[] };

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const inline = (text: string) => postInline(text).map(p => {
  switch (p.type) {
    case 'bold': return `<b>${esc(p.text)}</b>`;
    case 'italic': return `<i>${esc(p.text)}</i>`;
    case 'underline': return `<u>${esc(p.text)}</u>`;
    case 'code': return `<code>${esc(p.text)}</code>`;
    case 'speech': return `<span class="speech">${esc(p.text)}</span>`;
    case 'link': return esc(p.label);
    default: return esc(p.text);
  }
}).join('');
type Block = ReturnType<typeof postBlocks>[number];
const blockHtml = (b: Block): string => {
  switch (b.type) {
    case 'collapse': return `<details open><summary>${esc(b.title)}</summary>${b.blocks.map(blockHtml).join('\n')}</details>`;
    case 'heading': return `<h3>${inline(b.text)}</h3>`;
    case 'bullet': return `<p>• ${inline(b.text)}</p>`;
    case 'task': return `<p>${b.done ? '☑' : '☐'} ${inline(b.text)}</p>`;
    case 'quote': return `<blockquote>${inline(b.text)}</blockquote>`;
    case 'code': return `<pre>${esc(b.text)}</pre>`;
    case 'paragraph': return `<p>${inline(b.text)}</p>`;
    default: return '';
  }
};
/** A post's text as HTML, the forum's markup worked out, nothing else let through. */
export const postHtml = (text: string) => postBlocks(text).map(blockHtml).join('\n');
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** A whole file: one or more topics, each post with who wrote it and when. */
export function topicsHtml(heading: string, topics: ExportTopic[]) {
  const one = topics.length === 1 && topics[0]!.title === heading;
  const body = topics.map(t => `<section>${one ? '' : `<h2>${esc(t.title)}</h2>`}${t.posts.map(p => `<article><header><b>${esc(p.name)}</b>${p.by && p.by !== p.name ? ` <span>played by ${esc(p.by)}</span>` : ''} <time>${esc(when(p.at))}</time></header>${postHtml(p.body)}</article>`).join('\n')}</section>`).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(heading)}</title>
<style>body{max-width:760px;margin:2em auto;padding:0 16px;font:18px/1.6 Georgia,serif;color:#222}h1{font-size:28px}h2{margin-top:2em;border-bottom:2px solid #999}article{margin:1.2em 0;padding-bottom:.8em;border-bottom:1px solid #ddd}header{font:14px system-ui,sans-serif;color:#555}header b{color:#222;font-size:16px}blockquote{margin:0 0 .8em;padding:4px 12px;border-left:3px solid #999;font-style:italic}.speech{color:#1b6c60}details summary{font:600 13px system-ui,sans-serif}</style></head>
<body><h1>${esc(heading)}</h1>${body}</body></html>`;
}
export function topicsText(heading: string, topics: ExportTopic[]) {
  const one = topics.length === 1 && topics[0]!.title === heading;
  return [heading, ...(one ? ['='.repeat(Math.min(heading.length, 60))] : []), '', ...topics.flatMap(t => [...(one ? [] : [t.title, '='.repeat(Math.min(t.title.length, 60)), '']), ...t.posts.flatMap(p => [`${p.name}${p.by && p.by !== p.name ? ` (${p.by})` : ''} · ${when(p.at)}`, '', p.body, '', '---', ''])])].join('\n');
}
export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name.replace(/[\\/:*?"<>|]+/g, '').slice(0, 80) || 'forum';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
