/*
 * A picture of a Maptable scene for an AI connection (view_scene): the map image, the grid with its
 * square names, tokens with their names and HP, area effects and the fog. Built as SVG here, then turned
 * into a JPEG on the server. "players" draws what players see; "gm" also shows hidden tokens and dims fog.
 */
import { address, tokenRadius, type Scene, type Token } from "../model.ts";
import { getCurrentInitiativeEntry } from "../initiative-tracker.ts";

export type SceneView = "gm" | "players";
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const n = (v: number) => Math.round(v * 10) / 10;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join("") || "?";

function fogShapes(s: Scene) {
  const out: string[] = [];
  for (const st of s.fog.strokes) {
    const fill = st.mode === "reveal" ? "black" : "white";
    const poly = (pts: { x: number; y: number }[]) => pts.map(p => `${n(p.x)},${n(p.y)}`).join(" ");
    if (st.shape === "rect") {
      const a = st.points[0], b = st.points[st.points.length - 1];
      out.push(`<rect x="${n(Math.min(a.x, b.x))}" y="${n(Math.min(a.y, b.y))}" width="${n(Math.abs(b.x - a.x))}" height="${n(Math.abs(b.y - a.y))}" fill="${fill}"/>`);
    } else if (st.shape === "polygon") out.push(`<polygon points="${poly(st.points)}" fill="${fill}"/>`);
    else if (st.shape === "merged") {
      const parts = st.parts ?? [];
      if (st.fillRule === "evenodd") out.push(`<path fill-rule="evenodd" fill="${fill}" d="${parts.map(p => "M" + st.points.slice(p.start, p.start + p.count).map(v => `${n(v.x)} ${n(v.y)}`).join(" L") + " Z").join(" ")}"/>`);
      else for (const p of parts) {
        const pts = st.points.slice(p.start, p.start + p.count);
        if (p.shape === "rect") { const a = pts[0], b = pts[pts.length - 1]; out.push(`<rect x="${n(Math.min(a.x, b.x))}" y="${n(Math.min(a.y, b.y))}" width="${n(Math.abs(b.x - a.x))}" height="${n(Math.abs(b.y - a.y))}" fill="${fill}"/>`); }
        else out.push(`<polygon points="${poly(pts)}" fill="${fill}"/>`);
      }
    } else {
      const p = st.points[0];
      out.push(`<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(st.size / 2)}" fill="${fill}"/>`);
      if (st.points.length > 1) out.push(`<polyline points="${poly(st.points)}" fill="none" stroke="${fill}" stroke-width="${n(st.size)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
  }
  return out.join("");
}

function grid(s: Scene, view: { x: number; y: number; width: number; height: number }, scale: number) {
  const g = s.grid;
  if (g.type !== "square" || g.size < 4) return { lines: "", labels: "" };
  const lines: string[] = [], labels: string[] = [], font = Math.max(9, 11 / scale);
  const x0 = view.x, y0 = view.y, x1 = view.x + view.width, y1 = view.y + view.height;
  for (let x = g.offsetX + Math.ceil((x0 - g.offsetX) / g.size) * g.size; x <= x1; x += g.size) lines.push(`M${n(x)} ${n(y0)}V${n(y1)}`);
  for (let y = g.offsetY + Math.ceil((y0 - g.offsetY) / g.size) * g.size; y <= y1; y += g.size) lines.push(`M${n(x0)} ${n(y)}H${n(x1)}`);
  // Square names on the top and left edges, so the AI can say "D5" and mean the same square as the tools.
  const label = (x: number, y: number, t: string) => `<text x="${n(x)}" y="${n(y)}" font-size="${n(font)}" text-anchor="middle" dominant-baseline="middle" fill="#fff" stroke="#000" stroke-width="${n(font / 4)}" paint-order="stroke">${esc(t)}</text>`;
  const firstX = g.offsetX + Math.floor((x0 - g.offsetX) / g.size) * g.size + g.size / 2, firstY = g.offsetY + Math.floor((y0 - g.offsetY) / g.size) * g.size + g.size / 2;
  for (let x = firstX; x < x1; x += g.size) { const a = address({ x, y: firstY }, g); if (a) labels.push(label(x, y0 + font, a.replace(/\d+$/, ""))); }
  for (let y = firstY; y < y1; y += g.size) { const a = address({ x: firstX, y }, g); if (a) labels.push(label(x0 + font * 1.2, y, a.replace(/^[A-Z]+/, ""))); }
  return { lines: `<path d="${lines.join("")}" stroke="#000" stroke-opacity=".35" stroke-width="${n(1 / scale)}" fill="none"/>`, labels: labels.join("") };
}

function token(t: Token, s: Scene, mode: SceneView, current: boolean, scale: number) {
  const r = tokenRadius(t, s.grid), font = Math.max(10, 12 / scale), hidden = t.hidden && mode === "gm";
  const parts = [
    current ? `<circle cx="${n(t.x)}" cy="${n(t.y)}" r="${n(r + 5 / scale)}" fill="none" stroke="#f6bb4b" stroke-width="${n(3 / scale)}"/>` : "",
    `<circle cx="${n(t.x)}" cy="${n(t.y)}" r="${n(r)}" fill="${esc(t.color)}" stroke="${t.status === "dead" ? "#7a1d1d" : "#fff"}" stroke-width="${n(2 / scale)}"${hidden ? ` stroke-dasharray="${n(4 / scale)}" opacity=".55"` : ""}/>`,
    `<text x="${n(t.x)}" y="${n(t.y)}" font-size="${n(Math.max(font, r * 0.7))}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#fff">${esc(initials(t.name))}</text>`,
    `<text x="${n(t.x)}" y="${n(t.y + r + font)}" font-size="${n(font)}" text-anchor="middle" dominant-baseline="middle" fill="#fff" stroke="#000" stroke-width="${n(font / 3.5)}" paint-order="stroke">${esc(t.name)}${hidden ? " (hidden)" : ""}${t.status && t.status !== "active" ? ` (${t.status})` : ""}</text>`,
  ];
  if (mode === "gm" || t.rosterRole === "party") {
    const w = r * 1.8, h = Math.max(3, 4 / scale), f = Math.max(0, Math.min(1, t.hp / t.maxHp));
    parts.push(`<rect x="${n(t.x - w / 2)}" y="${n(t.y - r - h * 2)}" width="${n(w)}" height="${n(h)}" fill="#222"/><rect x="${n(t.x - w / 2)}" y="${n(t.y - r - h * 2)}" width="${n(w * f)}" height="${n(h)}" fill="${f > 0.5 ? "#3fb68b" : f > 0.25 ? "#e0a030" : "#d9534f"}"/>`);
  }
  return parts.join("");
}

/** The picture as SVG, at most `max` pixels on its longer side. `mapHref` is the map image as a data URL, when there is one. */
export function sceneSvg(s: Scene, mode: SceneView, mapHref: string | null, max = 1280) {
  const view = s.crop ?? { x: 0, y: 0, width: s.width, height: s.height };
  const scale = Math.min(1, max / Math.max(view.width, view.height));
  const width = Math.round(view.width * scale), height = Math.round(view.height * scale);
  const current = getCurrentInitiativeEntry(s), { lines, labels } = grid(s, view, scale); // Square names go on top of the fog, so they can always be read.
  const shown = s.tokens.filter(t => !t.pieceOf && !(mode === "players" && t.hidden));
  const effects = s.effects.filter(e => !(mode === "players" && e.hidden) && (e.type === "circle" || e.type === "square")).map(e => {
    const size = e.size * s.grid.size, x = e.tokenId ? s.tokens.find(t => t.id === e.tokenId)?.x ?? e.x : e.x, y = e.tokenId ? s.tokens.find(t => t.id === e.tokenId)?.y ?? e.y : e.y;
    const style = `fill="${esc(e.color)}" fill-opacity="${e.fillOpacity ?? 0.25}" stroke="${esc(e.color)}" stroke-width="${n(2 / scale)}"`;
    return e.type === "circle" ? `<circle cx="${n(x)}" cy="${n(y)}" r="${n(size)}" ${style}/>` : `<rect x="${n(x - size / 2)}" y="${n(y - size / 2)}" width="${n(size)}" height="${n(size)}" ${style}/>`;
  }).join("");
  const fog = s.fog.enabled
    ? `<mask id="fog" maskUnits="userSpaceOnUse" x="0" y="0" width="${s.width}" height="${s.height}">${s.fog.base ? `<rect width="${s.width}" height="${s.height}" fill="white"/>` : ""}${fogShapes(s)}</mask><rect width="${s.width}" height="${s.height}" fill="#141b19" opacity="${mode === "gm" ? 0.6 : 1}" mask="url(#fog)"/>`
    : "";
  // Fog goes over the tokens, as on the table: opaque for players, see-through for the GM.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="${n(view.x)} ${n(view.y)} ${n(view.width)} ${n(view.height)}" font-family="DejaVu Sans, Arial, sans-serif">`
    + `<rect x="${n(view.x)}" y="${n(view.y)}" width="${n(view.width)}" height="${n(view.height)}" fill="${esc(s.background ?? "#e3e6d8")}"/>`
    + (mapHref ? `<image href="${esc(mapHref)}" xlink:href="${esc(mapHref)}" x="0" y="0" width="${s.width}" height="${s.height}" preserveAspectRatio="none"/>` : "")
    + lines + effects
    + shown.map(t => token(t, s, mode, current?.tokens.some(x => x.id === t.id) ?? false, scale)).join("") + fog + labels
    + `</svg>`;
  return { svg, width, height };
}
