import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {render, inline, guideHref, guideSlug, readSidebar} from '../lib/guide/markdown.ts';

test('guide links go to guide pages and images', () => {
  assert.equal(guideHref('Maptable-Basics'), '/guide/maptable-basics');
  assert.equal(guideHref('Home'), '/guide');
  assert.equal(guideHref('World-Maps#hex-crawls'), '/guide/world-maps#hex-crawls');
  assert.equal(guideHref('images/home.jpg'), '/guide-images/home.jpg');
  assert.equal(guideHref('https://example.com'), 'https://example.com');
  assert.equal(guideSlug('Home.md'), '');
});

test('guide text is escaped and formatted', () => {
  assert.equal(inline('<b>x</b> **bold** *it* `<code>`'), '&lt;b&gt;x&lt;/b&gt; <strong>bold</strong> <em>it</em> <code>&lt;code&gt;</code>');
  assert.match(inline('[Map Creator](Map-Creator)'), /<a href="\/guide\/map-creator">Map Creator<\/a>/);
  const html = render('# T\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n> 1. one\n> 2. two\n\n3. three\n\n- a\n  - b\n\n```\n::: secret\n```');
  assert.match(html, /<h1 id="t">T<\/h1>/);
  assert.match(html, /<td>1<\/td><td>2<\/td>/);
  assert.match(html, /<blockquote><ol><li>one<\/li><li>two<\/li><\/ol><\/blockquote>/);
  assert.match(html, /<ol start="3">/);
  assert.match(html, /<li>a<ul><li>b<\/li><\/ul><\/li>/);
  assert.match(html, /<pre><code>::: secret<\/code><\/pre>/);
});

test('every guide page, link and picture exists', () => {
  const dir = 'content/guide';
  const pages = new Set(readdirSync(dir).filter(f => f.endsWith('.md') && !f.startsWith('_')).map(guideSlug));
  const groups = readSidebar(readFileSync(`${dir}/_Sidebar.md`, 'utf8'));
  assert.ok(groups.length >= 4);
  for (const g of groups) for (const l of g.links) assert.ok(pages.has(l.slug), l.slug);
  for (const f of readdirSync(dir).filter(f => f.endsWith('.md'))) {
    const html = render(readFileSync(`${dir}/${f}`, 'utf8'));
    for (const [, href] of html.matchAll(/href="\/guide\/?([^"#]*)/g)) assert.ok(pages.has(href), `${f} links to ${href}`);
    for (const [, src] of html.matchAll(/src="\/guide-images\/([^"]+)"/g)) assert.ok(existsSync(`public/guide-images/${src}`), `${f} shows ${src}`);
    assert.doesNotMatch(readFileSync(`${dir}/${f}`, 'utf8'), /claude\.ai/);
  }
});
