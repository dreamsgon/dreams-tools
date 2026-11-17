/*
 * A small Markdown renderer for the user guide (content/guide/*.md), run at build time.
 * It covers what the guide uses: headings, paragraphs, lists (one nested level),
 * tables, fenced code, block quotes, images, links, bold, italic and inline code.
 * Text is escaped first, so the guide can't inject HTML.
 */

export type GuideLink = { text: string; slug: string };
export type GuideGroup = { title: string; links: GuideLink[] };

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A guide page's file name ("Maptable-Basics") as its address ("maptable-basics"); "Home" is the guide's front page. */
export function guideSlug(name: string): string {
  const base = name.replace(/\.md$/, "");
  return base === "Home" ? "" : base.toLowerCase();
}

/** Where a link in the guide points: other guide pages by name, images from public/guide-images, this site's /api files and outside links as they are. */
export function guideHref(target: string): string {
  if (/^(https?:|mailto:)/.test(target)) return target;
  if (target.startsWith("images/")) return `/guide-images/${target.slice(7)}`;
  if (target.startsWith("#")) return target;
  // Files this site serves, such as the bridge downloads under /api/bridge.
  if (target.startsWith("/api/")) return target;
  const [page, hash] = target.split("#");
  const slug = guideSlug(page);
  return `/guide${slug ? `/${slug}` : ""}${hash ? `#${hash}` : ""}`;
}

export function headingId(text: string): string {
  return text.toLowerCase().replace(/[`*_]/g, "").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
}

export function inline(src: string): string {
  const codes: string[] = [];
  let s = src.replace(/`([^`]+)`/g, (_, c: string) => `\u0000${codes.push(c) - 1}\u0000`);
  s = escape(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt: string, url: string) => `<img src="${escape(guideHref(url))}" alt="${alt}" loading="lazy">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text: string, url: string) => {
    const href = guideHref(url.replace(/&amp;/g, "&"));
    const outside = /^https?:/.test(href);
    return `<a href="${escape(href)}"${outside ? ' rel="noopener noreferrer"' : ""}>${text}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => `<code>${escape(codes[Number(i)])}</code>`);
}

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
const listItem = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

function renderList(lines: string[]): string {
  // Items at the first indent; deeper lines (and continuation lines) belong to the item above.
  const first = listItem.exec(lines[0])!;
  const ordered = /\d/.test(first[2]);
  const indent = first[1].length;
  const items: string[][] = [];
  for (const line of lines) {
    const m = listItem.exec(line);
    if (m && m[1].length === indent) items.push([m[3]]);
    else items[items.length - 1]?.push(line.slice(Math.min(indent + 2, line.length - line.trimStart().length)));
  }
  const body = items.map(([head, ...rest]) => {
    const inner = rest.filter(l => l.trim()).length ? render(rest.join("\n")) : "";
    return `<li>${inline(head)}${inner}</li>`;
  }).join("");
  const start = ordered ? parseInt(first[2], 10) : 1;
  return ordered ? `<ol${start !== 1 ? ` start="${start}"` : ""}>${body}</ol>` : `<ul>${body}</ul>`;
}

/** Render guide Markdown to HTML. */
export function render(md: string): string {
  const lines = md.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const fence = /^\s*```/.exec(line);
    if (fence) {
      const pad = line.length - line.trimStart().length;
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++].slice(pad));
      i++;
      out.push(`<pre><code>${escape(code.join("\n"))}</code></pre>`);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level} id="${headingId(h[2])}">${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }
    if (line.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) quote.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote>${render(quote.join("\n"))}</blockquote>`);
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && /^\s*\|[\s|:-]+\|\s*$/.test(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<div class="guide-table"><table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    if (listItem.test(line)) {
      const block: string[] = [];
      while (i < lines.length) {
        const l = lines[i];
        if (!l.trim()) {
          // A blank line ends the list unless the list carries on after it.
          const next = lines[i + 1];
          if (next !== undefined && (listItem.test(next) || /^\s{2,}\S/.test(next))) { block.push(l); i++; continue; }
          break;
        }
        if (!listItem.test(l) && !/^\s/.test(l)) break;
        block.push(l);
        i++;
      }
      out.push(renderList(block));
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|>|\s*```)/.test(lines[i]) && !listItem.test(lines[i]) && !isTableRow(lines[i])) para.push(lines[i++].trim());
    const text = para.join(" ");
    out.push(/^!\[[^\]]*\]\([^)]+\)$/.test(text) ? `<figure>${inline(text)}</figure>` : `<p>${inline(text)}</p>`);
  }
  return out.join("\n");
}

/** The guide's table of contents, read from _Sidebar.md: bold lines are groups, list links are pages. */
export function readSidebar(md: string): GuideGroup[] {
  const groups: GuideGroup[] = [];
  for (const line of md.split("\n")) {
    const group = /^\*\*([^*[]+)\*\*\s*$/.exec(line.trim());
    if (group) { groups.push({ title: group[1], links: [] }); continue; }
    const link = /^-\s+\[([^\]]+)\]\(([^)]+)\)/.exec(line.trim());
    if (link && groups.length) groups[groups.length - 1].links.push({ text: link[1], slug: guideSlug(link[2]) });
  }
  return groups;
}

/** The first heading of a page, for its title. */
export function guideTitle(md: string): string {
  return /^#\s+(.*)$/m.exec(md)?.[1].trim() ?? "Guide";
}
