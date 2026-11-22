/*
 * Shared by the skins that came after Storm and Spire (Sakura Sky, Rainbow Meadow, Metro Line, Golden Hour, Flamingo
 * Deco, Status Window and Raid Night). Each of those is one file that says what its look is made of (a `Kit`: its
 * variables, its frames, buttons, headings and type, and a drawn scene for the banner) and `buildSkin` writes the four
 * stylesheets from it, one per part of a campaign, covering the same class names in each. What makes a skin its own
 * (its posts, its character card, its GM posts, its marks) is CSS the skin adds after the shared rules, so it wins.
 *
 * The drawing helpers here make pictures from gradients and clip-paths only: a skin never loads a picture, and its
 * stylesheets go through the safety checks in css.ts like a GM's own.
 */
import type { Theme } from "../model.ts";

/* ---- Drawing ---------------------------------------------------------------------------------------------------- */

export const n = (v: number) => +v.toFixed(1);
const px = (v: number) => v ? `${n(v)}px` : "0";
/** A flat fill as a background layer. */
export const flat = (c: string) => `linear-gradient(${c} 0 0)`;

/** Splits a long list of layers into custom properties, so no single value passes the safety check's length limit. */
export function inParts(name: string, items: string[]) {
  const parts: string[][] = [[]];
  for (const item of items) {
    const last = parts[parts.length - 1]!;
    if (last.length && [...last, item].join(", ").length > 1700) parts.push([item]); else last.push(item);
  }
  return { declare: parts.map((part, i) => `--${name}-${i + 1}: ${part.join(", ")};`).join(" "), use: parts.map((_, i) => `var(--${name}-${i + 1})`).join(", ") };
}

/**
 * Layers placed in a box `width` by `height`, measured from its bottom left corner like a drawing on squared paper.
 * Every helper returns one background layer.
 */
export function canvas(width: number, height: number) {
  const at = (x: number, y: number, w: number, h: number) => `${px(x)} ${px(height - y - h)}/${px(w)} ${px(h)} no-repeat`;
  const deg = (w: number, h: number) => Math.atan(w / 2 / h) * 180 / Math.PI;
  return {
    width, height, at,
    /** A rectangle in one colour. */
    rect: (c: string, x: number, y: number, w: number, h: number) => `${flat(c)} ${at(x, y, w, h)}`,
    /** A rectangle filled with a gradient written out, or one named as a variable. */
    fill: (gradient: string, x: number, y: number, w: number, h: number) => `${gradient} ${at(x, y, w, h)}`,
    /** A triangle with its point at the top. */
    tri: (c: string, x: number, y: number, w: number, h: number) => {
      const a = deg(w, h);
      return `conic-gradient(from ${n(180 - a)}deg at 50% 0, ${c} 0 ${n(2 * a)}deg, #0000 ${n(2 * a + .4)}deg) ${at(x, y, w, h)}`;
    },
    /** A triangle with its point at the bottom. */
    triDown: (c: string, x: number, y: number, w: number, h: number) => {
      const a = deg(w, h);
      return `conic-gradient(from ${n(-a)}deg at 50% 100%, ${c} 0 ${n(2 * a)}deg, #0000 ${n(2 * a + .4)}deg) ${at(x, y, w, h)}`;
    },
    /** An ellipse (a circle when `h` is left out) that fills its box. */
    oval: (c: string, x: number, y: number, w: number, h = w) => `radial-gradient(closest-side, ${c} calc(100% - 1px), #0000) ${at(x, y, w, h)}`,
    /** The outline of an ellipse, `t` thick. */
    ring: (c: string, x: number, y: number, w: number, h: number, t: number) => `radial-gradient(closest-side, #0000 calc(100% - ${n(t + 1)}px), ${c} calc(100% - ${n(t)}px) calc(100% - 1px), #0000) ${at(x, y, w, h)}`,
    /** The top half of an ellipse: a dome, a hill or a setting sun. */
    dome: (c: string, x: number, y: number, w: number, h: number) => `radial-gradient(ellipse 50% 100% at 50% 100%, ${c} calc(100% - 1px), #0000) ${at(x, y, w, h)}`,
    /** A line that sags between two points like a wire: the bottom edge of an ellipse. */
    sag: (c: string, x: number, y: number, w: number, h: number, t = 1) => `radial-gradient(ellipse 50% 100% at 50% 0, #0000 calc(100% - ${n(t + 1)}px), ${c} calc(100% - ${n(t)}px) calc(100% - .5px), #0000) ${at(x, y, w, h)}`,
    /** A wire from a high point at one side down to a low point at the other: a quarter of an ellipse. `to` is the side it falls towards. */
    fall: (c: string, to: "left" | "right", x: number, y: number, w: number, h: number, t = 1) => `radial-gradient(ellipse 100% 100% at ${to === "right" ? "100%" : "0"} 0, #0000 calc(100% - ${n(t + 1)}px), ${c} calc(100% - ${n(t)}px) calc(100% - .5px), #0000) ${at(x, y, w, h)}`,
  };
}

/**
 * The same, for a box of any size: every number is a percentage of the box, measured from its bottom left corner.
 * Shapes stretch with the box, so it suits hills, water, roofs and the small picture a location with none gets.
 */
export function sketch() {
  const p = (v: number, size: number) => size >= 100 ? "0" : `${n(v / (100 - size) * 100)}%`;
  const at = (x: number, y: number, w: number, h: number) => `${p(x, w)} ${p(100 - y - h, h)}/${n(w)}% ${n(h)}% no-repeat`;
  return {
    at,
    rect: (c: string, x: number, y: number, w: number, h: number) => `${flat(c)} ${at(x, y, w, h)}`,
    fill: (gradient: string, x: number, y: number, w: number, h: number) => `${gradient} ${at(x, y, w, h)}`,
    oval: (c: string, x: number, y: number, w: number, h: number) => `radial-gradient(closest-side, ${c} calc(100% - 1px), #0000) ${at(x, y, w, h)}`,
    dome: (c: string, x: number, y: number, w: number, h: number) => `radial-gradient(ellipse 50% 100% at 50% 100%, ${c} calc(100% - 1px), #0000) ${at(x, y, w, h)}`,
    tri: (c: string, x: number, y: number, w: number, h: number) => `linear-gradient(to top left, ${c} 49.6%, #0000 50%) ${at(x, y, w / 2 + .1, h)}, linear-gradient(to top right, ${c} 49.6%, #0000 50%) ${at(x + w / 2, y, w / 2, h)}`,
  };
}
/** A round shape of a fixed size in pixels, placed by percentages of the box (`x` from the left, `y` from the top) and nudged by pixels. */
export const spot = (fill: string, x: number, y: number, w: number, h = w, dx = 0, dy = 0) =>
  `${fill} ${dx ? `calc(${x}% + ${n(dx)}px)` : `${x}%`} ${dy ? `calc(${y}% + ${n(dy)}px)` : `${y}%`}/${n(w)}px ${n(h)}px no-repeat`;

/**
 * A clip-path made of several outlines, each a list of `[x, y]` points in a box `width` by `height` measured from the
 * bottom left. The outlines are joined by lines with no area, so one element can show any number of separate shapes.
 */
export function outline(width: number, height: number, shapes: number[][][]): string[] {
  const pt = ([x, y]: number[]) => `${n(x! / width * 100)}% ${n(100 - y! / height * 100)}%`;
  /* Every outline is walked the same way round, so two that overlap add up instead of cutting a hole. */
  const area = (s: number[][]) => s.reduce((sum, [x, y], i) => { const [x2, y2] = s[(i + 1) % s.length]!; return sum + x! * y2! - x2! * y!; }, 0);
  const turned = shapes.map(s => area(s) < 0 ? [...s].reverse() : s);
  const path: string[] = [];
  for (const shape of turned) path.push(...shape.map(pt), pt(shape[0]!));
  for (let i = turned.length - 2; i >= 0; i--) path.push(pt(turned[i]![0]!));
  return path;
}
/** A palm, as outlines for `outline`: a trunk `h` tall that leans as it rises, and fronds that droop from its crown with a ragged underside. */
export function palm(x: number, h: number, lean: number, s = 1): number[][][] {
  const left: number[][] = [], right: number[][] = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5, px = x + lean * t * t, w = (8 - 4 * t) * s;
    left.push([px - w / 2, h * t]); right.unshift([px + w / 2, h * t]);
  }
  const cx = x + lean, cy = h - 2;
  const frond = (angle: number, len: number, droop: number) => {
    const a = angle * Math.PI / 180, tx = cx + Math.cos(a) * len, ty = cy + Math.sin(a) * len - droop;
    const qx = cx + Math.cos(a) * len * .5, qy = cy + Math.sin(a) * len * .5 + droop * .9 + len * .2;
    const at = (t: number) => [(1 - t) ** 2 * cx + 2 * (1 - t) * t * qx + t * t * tx, (1 - t) ** 2 * cy + 2 * (1 - t) * t * qy + t * t * ty];
    const top: number[][] = [], under: number[][] = [];
    for (let i = 0; i <= 5; i++) top.push(at(i / 5));
    for (let i = 9; i >= 1; i--) { const t = i / 10, [px, py] = at(t), w = len * .2 * Math.sin(Math.PI * t) ** .7 * (i % 2 ? 1 : .4); under.push([px!, py! - w]); }
    return [...top, ...under];
  };
  const L = 80 * s;
  return [[...left, ...right], frond(6, L, 34 * s), frond(38, L * .86, 10 * s), frond(76, L * .7, 0), frond(112, L * .76, 2 * s), frond(146, L * .92, 16 * s), frond(176, L, 36 * s), frond(-24, L * .78, 30 * s), frond(204, L * .78, 30 * s)];
}
/** A line through `points`, `w` thick, as one outline for `outline`: a neck, a leg or a rope. */
export function ribbon(points: number[][], w: number): number[][] {
  const left: number[][] = [], right: number[][] = [];
  points.forEach(([x, y], i) => {
    const [ax, ay] = points[Math.max(i - 1, 0)]!, [bx, by] = points[Math.min(i + 1, points.length - 1)]!;
    const len = Math.hypot(bx! - ax!, by! - ay!) || 1, nx = -(by! - ay!) / len * w / 2, ny = (bx! - ax!) / len * w / 2;
    left.push([x! + nx, y! + ny]); right.unshift([x! - nx, y! - ny]);
  });
  return [...left, ...right];
}
/** An ellipse as an outline for `outline`. */
export const round = (cx: number, cy: number, rx: number, ry = rx, steps = 12): number[][] => Array.from({ length: steps }, (_, i) => [cx + rx * Math.cos(2 * Math.PI * i / steps), cy + ry * Math.sin(2 * Math.PI * i / steps)]);
/** A star with `points` points, as a clip-path for a small mark. */
export function star(points: number, inner = .45) {
  const out: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : 1, a = Math.PI * i / points;
    out.push(`${n(50 + 50 * r * Math.sin(a))}% ${n(50 - 50 * r * Math.cos(a))}%`);
  }
  return `polygon(${out.join(", ")})`;
}
/** An outline of text in `c`, `w` pixels wide, as text-shadow layers. */
export const stroke = (c: string, w = 2) => [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]].map(([x, y]) => `${x! * w}px ${y! * w}px 0 ${c}`).join(", ");
/** Numbers that look scattered but are the same every time. */
export function scatter(seed: number) {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
}

/* ---- What a skin says about itself ------------------------------------------------------------------------------ */

/** A drawn banner: layers behind, and up to two drawn boxes in front of them. */
export type Scene = {
  /** How tall the forum's banner is. */
  height: number;
  align: "left" | "center";
  /** Padding round the title when the page is wide, medium and a phone, so the words keep clear of the drawing. */
  pad: [string, string, string];
  /** Layers behind everything, the back one last. Written in percentages, so they fit any width. */
  back: string[];
  /** Two drawn boxes: all their declarations but `content` and `position`, with their background as `layers` when it is long. Each has changes for medium and phone widths. */
  boxes: { css: string; layers?: string[]; shape?: string[]; mid: string; phone: string }[];
  /** An edge round the banner. */
  edge: string;
};

export type Kit = {
  id: string; name: string; inspired: string;
  /** A short name for this skin's variables, such as `sk`. */
  p: string;
  /** What the skin is, for the comment at the top of each stylesheet. */
  about: string;
  radius: number; fonts: Theme["fonts"]; colors: Theme["colors"];
  /** `:root { … }` and `:root[data-theme="dark"] { … }`: everything a version changes is a variable here. */
  vars: string;
  /** The page behind everything, the selection and the scrollbar. */
  page: string; select: string; scroll: string;
  /** Colours by name: headings, the skin's mark (rules, rings, the edge of a frame under the pointer) and links under the pointer. */
  hi: string; mark: string; link: string;
  /** A frame (boards, topics, posts, cards) and what changes under the pointer. */
  frame: string; frameOn: string;
  /** Corners of small things: boxes to type in, chips, tabs. */
  corner: string;
  /** Headings and small labels. */
  titleType: string; small: string;
  /** The main button, other buttons, and each under the pointer. */
  btn: string; btnOn: string; ghost: string; ghostOn: string;
  /** A small plate: the kind of a page, a campaign's tags, the staff circle. */
  chip: string;
  /** Bars and side panels: their background, and a rule along one edge of them. */
  bar: string; rule: (edge: "top" | "bottom" | "left" | "right") => string;
  /** Rules that dress a heading: `center` for the forum's categories, `left` everywhere else. */
  heading: (selector: string, side: "center" | "left") => string;
  /** The tab that is open. */
  tabOn: string;
  /** The campaign's name over the scene, the line under it, and the small line above it in the other parts. */
  title: string; titleSizes: [number, number, number]; tagline: string; eyebrow: string;
  /** The same three over a campaign's own banner picture, when they need to change. */
  titleOnArt?: string;
  /** The forum's row of links under the banner. */
  nav: string; navLink: string; navOn: string;
  scene: Scene;
  /** What a location with no picture shows. */
  mini: string;
  /** The words above the character card. */
  cardLabel: string;
  /** The skin's own rules, added after the shared ones in each part. `phone` is the forum at phone width. */
  extra: { all?: string; forum?: string; phone?: string; encyclopedia?: string; maptable?: string; dashboard?: string };
};

/* ---- The stylesheets --------------------------------------------------------------------------------------------- */

const soft = (k: Kit, pct: number) => `color-mix(in srgb, ${k.mark} ${pct}%, transparent)`;
const BOX = `content: ""; position: absolute; z-index: 1; pointer-events: none;`;
const boxCss = (k: Kit, i: number, tag: string) => {
  const box = k.scene.boxes[i];
  if (!box) return "";
  let css = `${BOX} ${box.css}`;
  if (box.layers) { const parts = inParts(`${k.p}-${tag}${i}`, box.layers); css += ` ${parts.declare} background: ${parts.use};`; }
  /* An outline's points, as `outline` gives them, cut the box to a shape. */
  if (box.shape) { const parts = inParts(`${k.p}-${tag}${i}o`, box.shape); css += ` ${parts.declare} clip-path: polygon(${parts.use});`; }
  return css;
};
const WRAP = "display: block; width: fit-content; max-width: 100%; overflow-wrap: break-word; text-wrap: balance;";

/** The scene as the top of a part other than the forum: `host` keeps its own content above the drawing. */
function cover(k: Kit, host: string, name: string) {
  const back = inParts(`${k.p}-${name}`, k.scene.back);
  const [a, b] = k.scene.boxes;
  return `${host} {
  position: relative; overflow: hidden; isolation: isolate; ${k.scene.edge}
  ${back.declare}
  background: ${back.use};
}
${host} > * { position: relative; z-index: 2; }
${a ? `${host}::before { ${boxCss(k, 0, name)} }` : ""}
${b ? `${host}::after { ${boxCss(k, 1, name)} }` : ""}`;
}
const coverAt = (k: Kit, host: string, width: "mid" | "phone") => {
  const [a, b] = k.scene.boxes;
  return `${a && a[width] ? `${host}::before { ${a[width]} }` : ""}
  ${b && b[width] ? `${host}::after { ${b[width]} }` : ""}`;
};
const head = (k: Kit, part: string) => `/* ${k.name} for ${part}. ${k.about} */
${k.vars}
body { ${k.page} scrollbar-color: ${k.scroll}; }
::selection { ${k.select} }`;
const inputs = (k: Kit, range = false) => {
  const sel = `input:not([type="checkbox"]):not([type="radio"])${range ? `:not([type="range"])` : ""}`;
  return `${sel}, select, textarea { border-radius: ${k.corner}; caret-color: ${k.mark}; }
${sel}:focus, select:focus, textarea:focus { border-color: ${k.mark}; box-shadow: none; }`;
};

function encyclopedia(k: Kit) {
  const [wide, mid, phone] = k.scene.pad, [big, , small] = k.titleSizes;
  return `${head(k, "the Wiki")}

/* The side. */
.sidebar { ${k.rule("right")} background: ${k.bar}; }
.csw-name b { ${k.titleType} font-size: 16px; color: ${k.hi}; }
.campaign-link { border-radius: ${k.corner}; }
.campaign-link:hover { color: ${k.hi}; }
.campaign-link.active { background: ${soft(k, 16)}; color: ${k.hi}; box-shadow: inset 3px 0 0 ${k.mark}; }
.side-heading .section-toggle { ${k.small} font-size: 10.5px; color: var(--muted); }
.shared-tag { border-radius: ${k.corner}; ${k.small} font-size: 9.5px; }
.tree-row { border-radius: ${k.corner}; }
.tree-row:hover { background: ${soft(k, 9)}; }
.tree-row:has(.active), .tree-item.active { background: ${soft(k, 16)}; color: ${k.hi}; box-shadow: inset 3px 0 0 ${k.mark}; }

/* The bar along the top. */
.topbar { ${k.rule("bottom")} background: ${k.bar}; }
.search-box { border-radius: ${k.corner}; border-color: var(--line); background: var(--bg); }
.search-box:focus-within { border-color: ${k.mark}; }

/* Buttons and boxes to type in. */
.button { ${k.ghost} font-size: 12px; }
.button:hover { ${k.ghostOn} }
.button.primary { ${k.btn} font-size: 12px; }
.button.primary:hover { ${k.btnOn} }
.icon-button:hover { color: ${k.hi}; }
${inputs(k)}

/* The campaign's overview: the scene. */
${cover(k, ".dashboard-intro", "enc")}
.dashboard-intro { min-height: ${k.scene.height - 64}px; align-items: flex-start; margin-bottom: 26px; padding: ${wide}; }
.dashboard-intro .eyebrow { ${k.eyebrow} }
.dashboard-intro h1 { margin: 14px 0 12px; font-size: ${big - 10}px; line-height: 1.12; ${WRAP} ${k.title} }
.dashboard-intro .subtitle { ${k.tagline} max-width: 44ch; }
.dashboard-intro.has-picture h1 { filter: none; }
/* Over a campaign's picture the app turns this text white, so a pale plate behind it has to go. */
.dashboard-intro.has-picture .subtitle { padding: 0; border: 0; background: none; box-shadow: none; }
.dashboard-intro.has-picture .subtitle::before { display: none; }
.dashboard-intro.has-picture .eyebrow { border-color: rgba(255, 255, 255, .3); background: rgba(10, 10, 12, .5); box-shadow: none; }
/* The banner's own controls sit in its corner on something solid, so the drawing never runs under their words. */
.dashboard-intro > .home-hero-actions { position: absolute; z-index: 3; right: 14px; top: 14px; }
.dashboard-intro:not(.has-picture) .hero-action { border: 1px solid var(--line); background: var(--panel); color: var(--ink); box-shadow: none; }
.overview-strip { border-color: var(--line); }
.overview-strip strong { font: 700 19px var(--font-sans); color: ${k.hi}; }

/* Headings. */
.section-heading h2 { flex: 1; ${k.titleType} font-size: 22px; color: ${k.hi}; }
${k.heading(".section-heading h2", "left")}
.eyebrow { ${k.small} font-size: 10.5px; }

/* Cards. */
.note-card { ${k.frame} padding: 18px 20px; transition: none; }
.note-card:hover { ${k.frameOn} transform: none; }
.note-card h3 { ${k.titleType} font-size: 20px; color: ${k.hi}; }
.note-card.add-card { border: 1px dashed var(--line); background: transparent; box-shadow: none; }

/* A page. */
.kind-pill { padding: 3px 10px; ${k.chip} ${k.small} font-size: 10px; }
.article-title h1 { ${k.titleType} color: ${k.hi}; }
.article-tabs { ${k.rule("bottom")} }
.article-tabs button { ${k.small} font-size: 11.5px; }
.article-tabs button[aria-selected="true"], .article-tabs button.active { ${k.tabOn} }
.picture-panel:not(.picture-empty) { border-radius: var(--radius); border: 2px solid ${k.mark}; }
.prose { font-family: var(--font-reading); }
.prose h1, .prose h2, .prose h3 { ${k.titleType} color: ${k.hi}; }
.prose blockquote { border-left: 4px solid ${k.mark}; border-radius: 0 ${k.corner} ${k.corner} 0; background: ${soft(k, 9)}; }
.article-aside .eyebrow { color: ${k.hi}; }
${k.extra.all ?? ""}
${k.extra.encyclopedia ?? ""}

/* The Wiki keeps its side panel down to 720px, so its scene steps down sooner than the others. */
@media (max-width: 1380px) {
  ${coverAt(k, ".dashboard-intro", "mid")}
  .dashboard-intro { padding: ${mid}; }
  .dashboard-intro h1 { font-size: ${Math.round((big - 10) * .8)}px; }
}
@media (max-width: 640px) {
  .dashboard-intro { min-height: 0; padding: ${phone}; }
  .dashboard-intro h1 { font-size: ${small - 2}px; }
  ${coverAt(k, ".dashboard-intro", "phone")}
  .dashboard-intro > .icon-button { position: absolute; z-index: 3; right: 14px; top: 14px; }
}
`;
}

function maptable(k: Kit) {
  const [wide, mid, phone] = k.scene.pad, [big, , small] = k.titleSizes;
  return `${head(k, "Maptable")}

/* The bar along the top. */
.app-header, .campaign-dashboard > header { ${k.rule("bottom")} background: ${k.bar}; }
.header-scene strong { ${k.titleType} color: ${k.hi}; }
.csw-name b { ${k.titleType} font-size: 16px; color: ${k.hi}; }

/* Buttons and boxes to type in. Three times over, to outrank the app's own rule for the dark version. */
.primary.primary.primary, .dashboard-continue-action { ${k.btn} font-size: 12px; }
.primary.primary.primary:hover, .dashboard-continue:hover .dashboard-continue-action { ${k.btnOn} }
.icon-button:hover { color: ${k.hi}; }
${inputs(k, true)}
input[type="range"] { accent-color: ${k.mark}; }

/* The tool rail and the side panel. */
.rail { ${k.rule("right")} background: ${k.bar}; }
.rail button { border-radius: ${k.corner}; }
.rail button:hover { color: ${k.hi}; }
.rail button.active { background: ${soft(k, 18)}; color: ${k.hi}; box-shadow: inset 0 0 0 2px ${k.mark}; }
.side-panel { ${k.rule("right")} background: ${k.bar}; }
.panel-title { ${k.rule("bottom")} }
.panel-title h2 { ${k.titleType} font-size: 18px; color: ${k.hi}; }
.organizer-scene { border-radius: ${k.corner}; white-space: normal; }
.organizer-scene:hover { background: ${soft(k, 9)}; }
.organizer-scene.active { background: ${soft(k, 16)}; box-shadow: inset 3px 0 0 ${k.mark}; }
.organizer-scene.active strong { color: ${k.hi}; }
/* Under 1000px the rail is a bar along the bottom and the side panel a sheet: their rule moves to the top. */
@media (max-width: 1000px) {
  .rail { border-right: 0; ${k.rule("top")} }
  .side-panel { border-right: 0; ${k.rule("top")} }
}

/* Around the map. */
.map-topbar { ${k.rule("bottom")} background: ${k.bar}; }
.map-title, .board-info { ${k.small} font-size: 10.5px; color: var(--muted); }
.toolbar { border-radius: var(--radius); border: 1px solid ${k.mark}; }
.toolbar button { border-radius: ${k.corner}; }
.toolbar button.active { box-shadow: inset 0 0 0 2px ${k.mark}; }

/* The Scene Picker: the scene. */
${cover(k, ".campaign-scenes-head", "map")}
.campaign-scenes-head { min-height: ${k.scene.height - 84}px; align-items: flex-start; padding: ${wide}; }
.campaign-scenes-head > div { flex: 1; min-width: 0; }
.campaign-scenes-head > button { flex: none; }
.campaign-scenes-head small { ${k.eyebrow} }
.campaign-scenes-head h1 { margin-top: 14px; font-size: ${big - 14}px; line-height: 1.12; ${WRAP} ${k.title} }
.campaign-scenes-head.has-picture h1 { filter: none; }
.campaign-scenes-head.has-picture small { border-color: rgba(255, 255, 255, .3); background: rgba(10, 10, 12, .5); box-shadow: none; }
.dashboard-continue { ${k.frame} padding: 18px 24px; }
.dashboard-continue:hover { ${k.frame} ${k.frameOn} padding: 18px 24px; }
.dashboard-continue small { ${k.small} font-size: 10.5px; color: ${k.hi}; }
.dashboard-continue strong { ${k.titleType} font-size: 23px; color: ${k.hi}; overflow-wrap: anywhere; }
.campaign-scenes-kinds button { border-radius: ${k.corner}; ${k.small} font-size: 11px; }
.campaign-scenes-group h2 { ${k.titleType} font-size: 20px; color: ${k.hi}; }
${k.heading(".campaign-scenes-group h2", "left")}
.campaign-scenes-group h2 span { ${k.small} font-size: 10.5px; }
.campaign-scene-card { ${k.frame} overflow: hidden; }
.campaign-scene-card:hover, .campaign-scene-card:focus-visible { ${k.frameOn} }
.campaign-scene-card:hover strong, .campaign-scene-card:focus-visible strong { color: ${k.hi}; }
.campaign-scene-card strong { overflow-wrap: anywhere; }
.campaign-scene-card em { ${k.small} font-style: normal; font-size: 10px; color: ${k.hi}; }
${k.extra.all ?? ""}
${k.extra.maptable ?? ""}

@media (max-width: 1100px) {
  ${coverAt(k, ".campaign-scenes-head", "mid")}
  .campaign-scenes-head { padding: ${mid}; }
  .campaign-scenes-head h1 { font-size: ${Math.round((big - 14) * .82)}px; }
}
@media (max-width: 640px) {
  .campaign-scenes-head { min-height: 0; flex-wrap: wrap; padding: ${phone}; }
  .campaign-scenes-head > div { flex: 1 1 100%; }
  .campaign-scenes-head h1 { font-size: ${small - 2}px; }
  .dashboard-continue strong { font-size: 19px; }
  ${coverAt(k, ".campaign-scenes-head", "phone")}
}
`;
}

function dashboard(k: Kit) {
  const [wide, mid, phone] = k.scene.pad, [big, , small] = k.titleSizes;
  return `${head(k, "the campaign's dashboard")}
.hub-crumbs { ${k.small} font-size: 11px; }
.hub-crumbs a { color: ${k.hi}; }

/* The top: the scene. */
${cover(k, ".hub-head", "hub")}
.hub-head { min-height: ${k.scene.height - 64}px; padding: ${wide}; }
.hub-title p { ${k.eyebrow} }
.hub-title h1 { margin-top: 14px; font-size: ${big - 8}px; line-height: 1.12; ${WRAP} ${k.title} }
.hub-head.has-picture .hub-title h1 { filter: none; }
.hub-head.has-picture .hub-title p { border-color: rgba(255, 255, 255, .3); background: rgba(10, 10, 12, .5); box-shadow: none; }
.hub-chip { ${k.chip} ${k.small} font-size: 9.5px; }

/* Buttons. */
.hub-button { ${k.ghost} font-size: 12px; }
.hub-button-primary, a.hub-button-primary { ${k.btn} font-size: 12px; }
.hub-button-primary:hover, .hub-button-primary:hover:not(:disabled), a.hub-button-primary:hover { ${k.btnOn} }
.hub-button:not(.hub-button-primary):hover, .hub-button:not(.hub-button-primary):hover:not(:disabled) { ${k.ghostOn} }
/* Over the scene the other buttons are filled, so they read on any part of the drawing. */
.hub-head .hub-button:not(.hub-button-primary), .hub-head .tag-add { border-color: ${k.mark}; background: var(--panel); color: var(--ink); }
.hub-head .hub-button:not(.hub-button-primary):hover, .hub-head .hub-button:not(.hub-button-primary):hover:not(:disabled) { background: var(--raised); color: ${k.hi}; }

/* Prep, Front page, Members and Settings. */
.hub-tabs { ${k.rule("bottom")} }
.hub-tabs button, .hub-tabs a { ${k.small} font-size: 11.5px; }
.hub-tabs [aria-selected="true"], .hub-tabs [aria-current="page"] { color: ${k.hi}; }

/* Cards. */
.hub-card { ${k.frame} }
.hub-card-head h2 { flex: 1; ${k.titleType} font-size: 20px; text-transform: none; color: ${k.hi}; }
.hub-card-head a, .hub-card-head .hub-text-button { ${k.small} font-size: 10.5px; }
.hub-scene-grid li { border-radius: ${k.corner}; }
${k.extra.all ?? ""}
${k.extra.dashboard ?? ""}

@media (max-width: 1100px) {
  ${coverAt(k, ".hub-head", "mid")}
  .hub-head { padding: ${mid}; }
  .hub-title h1 { font-size: ${Math.round((big - 8) * .8)}px; }
}
@media (max-width: 640px) {
  .hub-head { min-height: 0; padding: ${phone}; }
  .hub-title h1 { font-size: ${small}px; }
  ${coverAt(k, ".hub-head", "phone")}
}
`;
}

function forum(k: Kit) {
  const s = k.scene, [wide, mid, phone] = s.pad, [big, medium, small] = k.titleSizes, back = inParts(`${k.p}-sky`, s.back), [a, b] = s.boxes;
  const centre = s.align === "center";
  return `/* ${k.name}. ${k.about} Everything a version changes is a variable in the first two rules. */

${k.vars}

body { ${k.page} scrollbar-color: ${k.scroll}; }
::selection { ${k.select} }
a { text-underline-offset: 3px; }

/* The strip above the banner. */
.board-bar { ${k.frame} box-shadow: none; }
.board-date { ${k.small} font-size: 11px; }
.board-date b { color: ${k.hi}; }
.circ { ${k.chip} font: 700 11px var(--font-sans); }
.you b { ${k.titleType} font-size: 16px; color: ${k.hi}; }
.search-box { border-radius: ${k.corner}; border-color: var(--line); background: var(--bg); }
.search-box:focus-within { border-color: ${k.mark}; }
.search-box input:not([type="checkbox"]), .search-box input:not([type="checkbox"]):focus { border: 0; background: transparent; box-shadow: none; }

/* The banner: the scene, with the campaign's name over it. */
.board-head { min-height: ${s.height}px; ${s.edge} text-align: ${s.align}; overflow: hidden; }
.board-head:not(.has-art) {
  ${back.declare}
  background: ${back.use};
  --head-shadow: none; --head-line: transparent;
}
.board-head-text { position: relative; flex: 1; display: flex; flex-direction: column; justify-content: flex-start; align-items: ${centre ? "center" : "flex-start"}; padding: ${wide}; overflow: hidden; }
.board-title, .board-tagline { position: relative; z-index: 2; }
${a ? `.board-head:not(.has-art) .board-head-text::before { ${boxCss(k, 0, "box")} }` : ""}
${b ? `.board-head:not(.has-art) .board-head-text::after { ${boxCss(k, 1, "box")} }` : ""}
.board-title { margin: 0; font-size: ${big}px; line-height: 1.12; letter-spacing: 0; text-transform: none; }
.board-title a { ${WRAP} display: inline-block; ${k.title} }
.board-tagline { margin-top: 16px; ${k.tagline} }
.board-nav { ${k.nav} }
.board-nav a { ${k.navLink} }
.board-nav a:hover { ${k.navOn} }
.board-nav a:focus-visible { outline: 2px solid ${k.mark}; outline-offset: -4px; }
/* With a banner picture: the picture under a dark wash, the name in white over it. */
.board-head.has-art {
  background: linear-gradient(${centre ? "180deg" : "90deg"}, rgba(8, 8, 14, .72), rgba(8, 8, 14, .34) 55%, rgba(8, 8, 14, .16)), var(--banner) var(--banner-x, 50%) var(--banner-y, 50%) / var(--banner-size, cover) no-repeat;
  --head-shadow: none; --head-line: transparent;
}
.board-head.has-art .board-head-text { justify-content: center; padding: 56px 48px; }
.board-head.has-art .board-title a { ${k.titleOnArt ?? "color: #fff; text-shadow: 0 2px 0 rgba(0, 0, 0, .55), 0 4px 18px rgba(0, 0, 0, .6); filter: none; background: none;"} }

/* Headings. */
.category-title { justify-content: ${centre ? "center" : "flex-start"}; ${k.titleType} font-size: 24px; text-transform: none; color: ${k.hi}; text-shadow: none; }
${k.heading(".category-title", centre ? "center" : "left")}
.tag { border-radius: ${k.corner}; ${k.small} font-size: 9.5px; text-shadow: none; }
.tag:where(:not(.topic-tag)) { border-color: var(--line); color: var(--muted); }
.tag.new { border-color: var(--accent-2); background: var(--accent-2); color: var(--bg); }

/* Boards and topics. */
.category-forums, .topics { gap: 12px; }
.forum, .topic-row { ${k.frame} }
.forum { padding: 16px 20px; }
.topic-row { padding: 14px 20px; }
.forum:hover, .topic-row:hover { ${k.frameOn} }
.topic-row.pinned { box-shadow: inset 5px 0 0 var(--accent-2); }
.topic-row.picked { box-shadow: inset 5px 0 0 ${k.mark}; }
.forum-name { ${k.titleType} font-size: 22px; line-height: 1.2; text-transform: none; }
.forum-name a, .topic-title a { color: ${k.hi}; text-decoration: none; }
.forum-name a:hover, .topic-title a:hover { color: ${k.link}; }
.forum-desc { font: 400 15.5px/1.45 var(--font-reading); font-style: normal; }
.forum-place { ${k.small} font-size: 10px; }
.forum-place a { color: ${k.link}; }
.forum-counts b { font: 700 18px var(--font-sans); color: var(--ink); }
.last-label { ${k.small} font-size: 9.5px; color: ${k.hi}; }
.forum-last a, .foot-list a { color: var(--ink); font: 600 14.5px/1.3 var(--font-reading); }
.forum-last a:hover, .foot-list a:hover { color: ${k.link}; }
.topic-title { font: 600 17.5px/1.3 var(--font-reading); letter-spacing: 0; text-transform: none; }
.topic-main small { font-style: normal; }
.topic-count b { font: 700 17px var(--font-sans); color: var(--ink); }
.unread-dot { background: ${k.mark}; box-shadow: none; }
.portrait.small, .portrait.tiny { border: 2px solid ${k.mark}; font-family: var(--font-sans); font-weight: 700; }
/* A location's picture, and what one with no picture shows. */
.forum-art { border-right: 2px solid ${k.mark}; }
.forum-art:not([style]) { background: ${k.mini}; }

/* A location's own page. */
.location { ${k.frame} overflow: hidden; }
.location-art { border-right: 2px solid ${k.mark}; }
.location-art.portrait-empty { background: ${k.mini}; }
.location-art.portrait-empty span { visibility: hidden; }
.location-kind { ${k.small} font-size: 10.5px; color: ${k.link}; }
.location-name { ${k.titleType} font-size: 34px; text-transform: none; color: ${k.hi}; overflow-wrap: anywhere; }
.location-summary { font: italic 400 16.5px/1.55 var(--font-reading); }

/* Topic pages. */
.crumbs { ${k.small} font-size: 11px; }
.crumbs a { color: ${k.link}; }
.topic-head { ${k.frame} }
.topic-name { ${k.titleType} font-size: 34px; line-height: 1.15; text-transform: none; color: ${k.hi}; overflow-wrap: anywhere; }
.cast-chip, .today-chip { border-radius: ${k.corner}; border-color: var(--line); }

/* Posts. */
.posts { gap: 22px; }
.post { ${k.frame} overflow: hidden; }
.post.fresh { border-color: ${k.mark}; }
.post-band, .post.flip .post-band { padding: 12px 22px; border-bottom: 1px solid var(--line); background: ${soft(k, 10)}; }
.post-name { ${k.titleType} font-size: 22px; line-height: 1.15; text-transform: none; color: ${k.hi}; }
.post-meta { font: 500 12.5px var(--font-sans); letter-spacing: .02em; }
.post-meta a { color: var(--muted); }
.post.post-gm { border-color: ${k.mark}; }
.post.post-gm .gm-band { background: ${soft(k, 16)}; }
.gm-seal { background: ${k.mark}; color: var(--panel); box-shadow: 0 0 0 3px var(--panel), 0 0 0 5px ${k.mark}; }
.portrait.big { border: 2px solid ${k.mark}; border-radius: var(--radius); }
.portrait.big.portrait-empty { background: linear-gradient(170deg, var(--raised), ${soft(k, 30)}); }
.portrait.big.portrait-empty span { font: 400 96px var(--font-display); color: ${k.mark}; }
/* The character card that opens over a portrait. It fades in and does not move. */
.mini-card {
  display: flex; flex-direction: column; padding: 0 16px 14px; border: 2px solid ${k.mark}; border-radius: var(--radius);
  background: var(--panel); color: var(--ink); box-shadow: 0 14px 28px -12px rgba(0, 0, 0, .5);
}
.mini-card::before { content: "${k.cardLabel}"; flex: none; margin: 0 -16px 12px; padding: 8px 16px 7px; background: ${k.mark}; color: var(--panel); ${k.small} font-size: 10px; }
.mini-card > *, .mini-card dd { color: var(--ink); }
.mini-name { ${k.titleType} font-size: 21px; line-height: 1.2; text-transform: none; color: ${k.hi}; }
.mini-role { margin: 2px 0 8px; padding: 0 0 8px; border-bottom: 2px solid var(--line); font: 400 14.5px/1.4 var(--font-reading); font-style: normal; color: var(--muted); }
.mini-quote { font: italic 400 14.5px/1.45 var(--font-reading); color: var(--muted); opacity: 1; }
.mini-traits .chip { border: 1px solid ${k.mark}; border-radius: ${k.corner}; background: none; color: ${k.hi} !important; ${k.small} font-size: 9.5px; }
.mini-fields dt { ${k.small} font-size: 9px; color: var(--muted); }
.mini-fields dd { font: 600 14.5px/1.4 var(--font-reading); }
.mini-card > .mini-link { align-self: flex-start; margin-top: auto; padding: 6px 14px; ${k.btn} font-size: 11px; text-decoration: none; }
.mini-link:hover { ${k.btnOn} }
.mini-card > :nth-last-child(2) { margin-bottom: 12px; }
.mini-player { font: 500 12.5px/1.6 var(--font-sans); }
.mini-player b { color: ${k.hi}; }
.post-text { font: 400 17px/1.7 var(--font-reading); }
.post-text blockquote { border-left: 4px solid ${k.mark}; border-radius: 0 ${k.corner} ${k.corner} 0; background: ${soft(k, 9)}; }
.post-text pre { border: 1px solid var(--line); border-radius: ${k.corner}; background: var(--bg); }
.post-text h3, .post-text h4, .post-text h5, .post-text h6 { ${k.titleType} color: ${k.hi}; }
.roll-card { border-radius: ${k.corner}; border: 1px solid var(--line); border-left: 4px solid ${k.mark}; }
.roll-total { border-radius: ${k.corner}; }
.post-actions { border-top: 1px solid var(--line); }
.post-actions button { ${k.small} font-size: 10.5px; }
.post-actions button:hover { color: ${k.hi}; }

/* Buttons and boxes to type in. */
.f-btn { font-size: 12px; }
.f-btn.small { font-size: 11px; }
.f-btn.ghost { ${k.ghost} }
.f-btn:not(.ghost), .tools .tool-pop .f-btn:not(.ghost) { ${k.btn} }
.f-btn:not(.ghost):hover:not(:disabled) { ${k.btnOn} }
.f-btn.ghost:hover:not(:disabled) { ${k.ghostOn} }
input:not([type="checkbox"]), select, textarea { border-radius: ${k.corner}; background: var(--bg); caret-color: ${k.mark}; }
input:not([type="checkbox"]):focus, select:focus, textarea:focus { border-color: ${k.mark}; box-shadow: none; }
.composer { border: 0; ${k.rule("top")} }
.composer-kind, .as-label { ${k.small} color: ${k.hi}; }

/* The foot of the forum. */
.board-foot { ${k.frame} }
.foot-cols h3, .foot-line h3 { ${k.titleType} font-size: 18px; text-transform: none; color: ${k.hi}; }
.foot-stats b { font: 700 17px var(--font-sans); color: ${k.hi}; }
.to-top { border-radius: ${k.corner}; color: ${k.hi}; }
${k.extra.all ?? ""}
${k.extra.forum ?? ""}

@container page (max-width: 900px) {
  .board-head-text { padding: ${mid}; }
  .board-title { font-size: ${medium}px; }
  ${a?.mid ? `.board-head:not(.has-art) .board-head-text::before { ${a.mid} }` : ""}
  ${b?.mid ? `.board-head:not(.has-art) .board-head-text::after { ${b.mid} }` : ""}
}
@container page (max-width: 640px) {
  .board-head { min-height: ${Math.round(s.height * .86)}px; }
  .board-head-text { padding: ${phone}; }
  .board-head.has-art .board-head-text { padding: 36px 20px 40px; }
  .board-title { font-size: ${small}px; }
  .board-tagline { margin-top: 12px; }
  ${a?.phone ? `.board-head:not(.has-art) .board-head-text::before { ${a.phone} }` : ""}
  ${b?.phone ? `.board-head:not(.has-art) .board-head-text::after { ${b.phone} }` : ""}
  .category-title { font-size: 20px; gap: 10px; }
  .forum, .topic-row { padding: 14px 16px; }
  .forum-name { font-size: 19px; }
  .topic-name { font-size: 25px; }
  .location-name { font-size: 25px; }
  .post-name { font-size: 19px; }
  .portrait.big.portrait-empty span { font-size: 54px; }
  .mini-card { box-sizing: border-box; }
  .location-art { border-right: 0; border-bottom: 2px solid ${k.mark}; }
  /* A place's row stacks beside its picture on phones: room above the name and below the latest post. */
  .forum-location > :nth-child(2) { padding-top: 14px; }
  .forum-location > :last-child { padding-bottom: 16px; }
  ${k.extra.phone ?? ""}
}
`;
}

/** The theme a kit makes: the forum's stylesheet and one for each other part. */
export function buildSkin(k: Kit): Theme {
  return {
    id: k.id, name: k.name, mode: "both", radius: k.radius, banner: "picture", fonts: k.fonts, colors: k.colors,
    css: forum(k), areas: { encyclopedia: encyclopedia(k), maptable: maptable(k), dashboard: dashboard(k) },
  };
}
