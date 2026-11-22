import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCss, scopeSelector } from '../lib/campaign-theme/css.ts';
import { THEME_PRESETS, areaCss, themeSchema, themeColours, PRESET_NOTES, THEME_FONTS, importTheme, themeCss, saveTheme, makeLive, deleteTheme, emptyThemeFile, contrastChecks, onAccent, ThemeError } from '../lib/campaign-theme/model.ts';

const NOW = new Date('2026-01-01T12:00:00.000Z');

test('selectors stay inside the campaign’s part of the page', () => {
  assert.equal(scopeSelector('.post'), '.campaign-skin .post');
  assert.equal(scopeSelector(':root[data-theme="dark"] .post'), ':root[data-theme="dark"] .campaign-skin .post');
  assert.equal(scopeSelector('html'), ':root .campaign-skin');
  assert.equal(scopeSelector('body'), '.campaign-skin');
  assert.equal(scopeSelector('body.x .y'), '.campaign-skin.x .y');
  assert.equal(scopeSelector(':scope > .a'), '.campaign-skin > .a');
  assert.equal(scopeSelector('> .a'), '.campaign-skin > .a');
  for (const bad of ['~ .admin-cp', '+ .x', ':root ~ .x', '.a<b', '.a\\62', '& .b', '@x']) assert.equal(scopeSelector(bad), null, bad);
});

test('the stylesheet: nothing loads from elsewhere, nothing escapes, and each change is reported by line', () => {
  const { css, problems, rules } = cleanCss(`/* a comment */
.a, ~ .cp { color: red; position: fixed; }
.b { background: url(https://evil.test/x.png); }
.c { background-image: image-set("x.png" 1x); }
@import url(x.css);
@font-face { font-family: x; src: url(y.woff); }
.d { content: "</style><script>"; }
.e { -moz-binding: x; behavior: y; }
@media (max-width: 600px) { .f { padding: 0 } }
@supports (display: grid) { .g { display: grid } }
@keyframes glow { from { opacity: 0 } 50% { opacity: .5 } to { opacity: 1 } }
.h { animation: glow 2s infinite; }
.i { .j { color: blue } color: green; }
.k { width: expression(alert(1)); color: var(--accent) !important; }
@page { margin: 0 }
`);
  assert.doesNotMatch(css, /url\(|image-set|@import|@font-face|<|expression|binding|behavior|@page|fixed|\.cp/);
  assert.match(css, /\.campaign-skin \.a \{ color: red; position: absolute \}/);
  assert.match(css, /@media \(max-width: 600px\) \{\n\.campaign-skin \.f \{ padding: 0 \}\n\}/);
  assert.match(css, /@supports \(display: grid\)/);
  assert.match(css, /@keyframes skin-glow \{/);
  assert.match(css, /\.campaign-skin \.h \{ animation: skin-glow 2s infinite \}/);
  assert.match(css, /\.campaign-skin \.i \{ color: green \}/);
  assert.match(css, /\.campaign-skin \.k \{ color: var\(--accent\) !important \}/);
  assert.equal(rules, 6);
  const lines = problems.map(p => p.line);
  for (const line of [2, 3, 4, 5, 6, 7, 8, 13, 14, 15]) assert.ok(lines.includes(line), `line ${line} reported`);
  assert.deepEqual(cleanCss('   '), { css: '', problems: [], rules: 0 });
  // Unclosed blocks stop cleanly rather than swallowing what follows into the page.
  assert.equal(cleanCss('.a { color: red').css, '');
  assert.ok(cleanCss('x'.repeat(100_001)).problems.some(p => /cut off/.test(p.message)));
});

test('a theme’s variables: both versions follow the member’s setting, a one-version theme shows it to everyone', () => {
  const salt = THEME_PRESETS[0], neon = { ...THEME_PRESETS.find(t => t.id === 'preset-neon'), mode: 'dark' }, ledger = THEME_PRESETS.find(t => t.mode === 'light');
  const both = themeCss(salt).css;
  assert.match(both, /^\.campaign-skin \{ --bg: #ece5d6;/);
  assert.match(both, /\n:root\[data-theme="dark"\] \.campaign-skin \{ --bg: #111110;/);
  assert.match(both, /--font-display: "Cinzel"/);
  const dark = themeCss(neon).css;
  assert.equal(dark.match(/--bg: #07060f/g).length, 2, 'dark everywhere');
  assert.equal(themeCss(ledger).css.match(/--bg: #e7dcc0/g).length, 2, 'light everywhere');
  assert.match(themeCss({ ...ledger, banner: 'plain' }).css, /--head-title: #7c2a1c/);
  assert.equal(onAccent('#ffeb3b'), '#111111');
  assert.equal(onAccent('#1b3a8a'), '#ffffff');
  for (const t of THEME_PRESETS) for (const set of t.mode === 'both' ? [t.colors.light, t.colors.dark] : [t.colors[t.mode]])
    for (const c of contrastChecks(set)) assert.ok(c.ratio >= c.need, `${t.name}: ${c.label} ${c.ratio.toFixed(2)}`);
});

test('pasted theme code: the prototype’s shape, a missing version, bad colours', () => {
  const { theme, notes } = importTheme({ name: 'Mine', mode: 'dark', radius: 40, banner: 'banner-neon', fonts: { display: 'chakra', reading: 'nope' }, colors: { dark: THEME_PRESETS[0].colors.dark }, css: '.a{}', templates: { post: '<div></div>' } }, 'x1');
  assert.equal(theme.radius, 16);
  assert.equal(theme.banner, 'picture');
  assert.deepEqual(theme.fonts, { display: 'chakra', reading: 'cormorant', ui: 'inter' });
  assert.deepEqual(theme.colors.light, theme.colors.dark, 'the missing version copies the other');
  assert.match(notes[0], /templates/);
  assert.throws(() => importTheme({ colors: { light: { ...THEME_PRESETS[0].colors.light, ink: 'black' } } }, 'x2'), ThemeError);
  assert.throws(() => importTheme('nope', 'x3'), ThemeError);
});

test('the theme file: save, make live (a copy), delete, and the limit', () => {
  let f = saveTheme(emptyThemeFile(), { ...THEME_PRESETS[1], id: 'a' }, { now: NOW });
  assert.equal(f.live, null);
  f = makeLive(f, 'a');
  f = saveTheme(f, { ...f.saved[0], name: 'Changed' }, { now: NOW });
  assert.equal(f.live.name, 'Parchment Ledger', 'live is a copy');
  f = deleteTheme(f, 'a');
  assert.equal(f.saved.length, 0);
  assert.equal(f.live.id, 'a', 'stays live until another is picked');
  assert.throws(() => makeLive(f, 'a'), ThemeError);
  for (let i = 0; i < 20; i++) f = saveTheme(f, { ...THEME_PRESETS[3], id: 'p' + i }, { now: NOW });
  assert.throws(() => saveTheme(f, { ...THEME_PRESETS[3], id: 'one-more' }, { now: NOW }), /up to 20/);
});

test('preset skins: a light and a dark version each, readable, and their CSS passes the safety checks untouched', () => {
  const skins = THEME_PRESETS.filter(t => PRESET_NOTES[t.id]);
  assert.equal(skins.length, 19);
  assert.equal(new Set(THEME_PRESETS.map(t => t.id)).size, THEME_PRESETS.length, 'ids are unique');
  for (const t of skins) {
    assert.equal(t.mode, 'both', t.name);
    for (const mode of ['light', 'dark']) for (const c of contrastChecks(t.colors[mode])) assert.ok(c.ratio >= c.need, `${t.name} ${mode}: ${c.label} ${c.ratio.toFixed(2)}`);
    for (const f of Object.values(t.fonts)) assert.ok(THEME_FONTS[f], `${t.name}: ${f}`);
    const cleaned = cleanCss(t.css);
    assert.deepEqual(cleaned.problems, [], t.name);
    assert.ok(cleaned.rules >= 8, `${t.name} has a stylesheet`);
    // A fully custom skin's other stylesheets pass the same checks.
    for (const [part, css] of Object.entries(t.areas ?? {})) assert.deepEqual(cleanCss(css).problems, [], `${t.name}: ${part}`);
    // The banner's own art stands aside for a campaign's picture.
    assert.match(t.css, /\.board-head:not\(\.has-art\)/, t.name);
    assert.notDeepEqual(t.colors.light, t.colors.dark, t.name);
  }
});

test('theme stylesheets for each part of the campaign', () => {
  const t = { ...THEME_PRESETS[0], id: 'x', css: '.post { color: red }', areas: { maptable: '.app-header { color: blue } .a { background: url(x.png) }' } };
  assert.equal(areaCss(t, 'forum'), '.post { color: red }');
  assert.equal(areaCss(t, 'encyclopedia'), '');
  const maps = themeCss(t, '.campaign-skin', 'maptable');
  assert.match(maps.css, /\.campaign-skin \.app-header \{ color: blue \}/);
  assert.doesNotMatch(maps.css, /\.post|url\(/);
  assert.equal(maps.problems.length, 1);
  assert.match(themeCss(t).css, /--paper: #ece5d6; --white: /, 'the Encyclopedia’s own names too');
  // Each part up to 100 KB, and 160 KB together.
  const big = 'a { color: red }\n'.repeat(5500);
  assert.ok(themeSchema.safeParse({ ...t, areas: { encyclopedia: big } }).success);
  assert.equal(themeSchema.safeParse({ ...t, css: big, areas: { encyclopedia: big } }).success, false);
  assert.throws(() => saveTheme(emptyThemeFile(), { ...t, css: big, areas: { encyclopedia: big } }, { now: NOW }), /160 KB together/);
  // Theme code carries the parts' stylesheets.
  const { theme } = importTheme({ ...t, areas: { encyclopedia: '.topbar { color: red }', nonsense: 'x' } }, 'y');
  assert.deepEqual(theme.areas, { encyclopedia: '.topbar { color: red }' });
});

test('a theme’s colours alone, for the Admin CP', () => {
  const both = themeColours(THEME_PRESETS.find(t => t.id === 'preset-neon'), '.admin-cp');
  assert.match(both, /^\.admin-cp \{ --bg: #efe6f5; /);
  assert.match(both, /\n:root\[data-theme="dark"\] \.admin-cp \{ --bg: #07060f; /);
  assert.doesNotMatch(both, /--font-|--radius|--head-|nw-/, 'no fonts, corners, banner or stylesheet');
  const dark = themeColours({ ...THEME_PRESETS[0], mode: 'dark' }, '.admin-cp');
  assert.equal(dark.split('\n')[0].replace('.admin-cp', ''), dark.split('\n')[1].replace(':root[data-theme="dark"] .admin-cp', ''), 'a one-version theme shows that version to everyone');
});

test('an open dialog stays above a theme’s drawing', async () => {
  const { liveTheme } = await import('../lib/campaign-theme/model.ts');
  // A theme that tries to hide or lower the parts holding a dialog still gets the lift, after its own rules.
  const t = { ...THEME_PRESETS[0], id: 'x', css: '.hub-head { isolation: isolate } .hub-head > * { z-index: 2 }', areas: { dashboard: '.hub-head > * { z-index: 2 }' } };
  for (const area of ['forum', 'dashboard', 'encyclopedia', 'maptable']) {
    const css = themeCss(t, '.campaign-skin', area).css;
    assert.ok(css.endsWith('.campaign-skin :has([aria-modal="true"]) { z-index: var(--z-modal, 200) !important; }'), area);
  }
  // Browsers drop the stylesheets they kept from before the lift.
  assert.match(liveTheme(t, 'dashboard').key, /:dashboard:v2$/);
});
