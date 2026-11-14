import {
  address,
  sceneRenderBounds,
  perimeterLabels,
  pathDistance,
  hexCenter,
  hexGridBounds,
  tokenRadius,
  type MapCrop,
  type Workspace,
  type Scene,
  type Point,
  type FogStroke,
  type Token,
} from "./model";
import { resolvedToken } from "./token-defaults";
import { sceneInitials } from "./token-initials";
import { drawTokenName } from "./token-name";
import { drawTokenHp, tokenHpLayout, tokenNameFontSize } from "./token-display-layout";
import { drawMapDrawing } from "./map-style";
import { effectPolygon, effectHandles, resolveEffect, effectVisibleToPlayers } from "./effects";
export type Images = Map<string, HTMLImageElement>;
export type RenderOptions = {
  crop?: MapCrop | null;
  markerScale?: number;
  player?: boolean;
  selected?: string | null;
  draft?: FogStroke | null;
  measure?: Point[];
  /** Drawn on the map after effects and before tokens, e.g. the squares a dragged token passes. */
  underTokens?: (ctx: CanvasRenderingContext2D) => void;
};
/** The board backing follows the visible map, including coordinate gutters. */
export function drawSceneBackdrop(ctx: CanvasRenderingContext2D, scene: Scene, crop?: MapCrop | null) {
  const bounds = sceneRenderBounds(scene, crop);
  ctx.fillStyle = scene.background ?? "#e3e6d8";
  ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
}
/** Vector marks stay legible in exports without depending on emoji fonts. */
/** A map piece: its picture, turned, with no ring, HP or name. A dashed box shows it is selected. */
function drawPiece(ctx: CanvasRenderingContext2D, t: Token, side: number, img: CanvasImageSource | null | undefined, selected: boolean) {
  ctx.save();
  if (t.hidden) ctx.globalAlpha = 0.4;
  ctx.translate(t.x, t.y);
  ctx.rotate(((t.imageRotation ?? 0) + (t.facing ?? 0)) * Math.PI / 180);
  ctx.scale(t.flipX ? -1 : 1, t.flipY ? -1 : 1);
  if (img) {
    ctx.shadowColor = "#00000040"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
    ctx.drawImage(img, -side / 2, -side / 2, side, side);
  } else {
    ctx.fillStyle = t.color; ctx.fillRect(-side / 4, -side / 4, side / 2, side / 2);
  }
  if (selected) {
    ctx.shadowColor = "transparent"; ctx.setLineDash([6, 4]); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
    ctx.strokeRect(-side / 2 - 3, -side / 2 - 3, side + 6, side + 6);
  }
  ctx.restore();
}
/** Bold letters centred in a picture-less token, sized to fit inside the circle. */
export function drawTokenInitials(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, text: string, colour: string) {
  if (!text) return;
  ctx.save();
  ctx.fillStyle = colour;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = r * 0.95;
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  const width = ctx.measureText(text).width, room = r * 1.45;
  if (width > room) { size = Math.max(4, size * room / width); ctx.font = `700 ${size}px system-ui, sans-serif`; }
  ctx.fillText(text, x, y + size * 0.04);
  ctx.restore();
}

/** A thin white edge just outside a token, so it stands out on any map. About 1.5 map pixels, a little more on big tokens. */
export function drawTokenEdge(ctx: CanvasRenderingContext2D, x: number, y: number, outer: number) {
  const edge = Math.max(1.5, outer * 0.03);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, outer + edge / 2, 0, Math.PI * 2);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = edge;
  ctx.shadowColor = "transparent";
  ctx.stroke();
  ctx.restore();
}

/** A small arrow on the ring showing which way a turned token faces. */
export function drawFacingNotch(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, facing: number, color: string) {
  const size = Math.max(6, Math.min(14, radius * 0.28));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing * Math.PI / 180);
  ctx.beginPath();
  ctx.moveTo(-size * 0.8, -radius - 1); ctx.lineTo(0, -radius - size * 1.2); ctx.lineTo(size * 0.8, -radius - 1); ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
}
/** Condition badges grow with the token so they read at any zoom. */
export const conditionBadgeRadius = (tokenRadius: number) => Math.max(11, Math.min(22, tokenRadius * 0.38));
/**
 * Condition badges along the top of the ring, sized to the token so they read at any zoom.
 * When they don't all fit over the top half, the last badge counts the rest (+3).
 */
export function drawTokenConditions(ctx: CanvasRenderingContext2D, t: Token, r: number, conditions: Workspace["conditions"], images: Images) {
  const shown = t.conditions.map(id => conditions.find(c => c.id === id)).filter(c => !!c);
  if (!shown.length) return;
  const badge = conditionBadgeRadius(r), orbit = r + 2;
  const step = 2 * Math.asin(Math.min(1, badge * 1.08 / orbit));
  const fit = Math.max(1, Math.floor(Math.PI * 1.15 / step) + 1);
  const count = Math.min(shown.length, fit), extra = shown.length - count + (shown.length > fit ? 1 : 0);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i - (count - 1) / 2) * step, x = t.x + Math.cos(a) * orbit, y = t.y + Math.sin(a) * orbit;
    const more = extra > 0 && i === count - 1, c = shown[i];
    ctx.beginPath(); ctx.arc(x, y, badge, 0, Math.PI * 2);
    ctx.fillStyle = more ? "#1d2622" : c.color; ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(1.5, badge * 0.14); ctx.stroke();
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#fff";
    if (more) { ctx.font = `700 ${Math.round(badge * 0.95)}px system-ui`; ctx.fillText(`+${extra}`, x, y + 0.5, badge * 1.7); continue; }
    const symbol = c.assetId ? images.get(c.assetId) : null;
    if (symbol) {
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, badge * 0.82, 0, Math.PI * 2); ctx.clip();
      const scale = badge * 1.64 / Math.max(symbol.width, symbol.height);
      ctx.drawImage(symbol, x - symbol.width * scale / 2, y - symbol.height * scale / 2, symbol.width * scale, symbol.height * scale); ctx.restore();
    } else {
      ctx.font = `700 ${Math.round(badge * 1.15)}px system-ui`;
      ctx.fillText(c.icon || c.name[0], x, y + 0.5, badge * 1.6);
    }
  }
  ctx.restore();
}
export function drawTokenStatus(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, status?: "active" | "dead" | "unconscious") {
  if (status !== "dead" && status !== "unconscious") return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(radius, radius);
  ctx.shadowColor = "transparent";
  ctx.beginPath();
  ctx.arc(0, 0, .84, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(10, 15, 19, 0.78)";
  ctx.fill();
  if (status === "dead") {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(-.35, .29);
    ctx.bezierCurveTo(-.84, .05, -.72, -.68, 0, -.68);
    ctx.bezierCurveTo(.72, -.68, .84, .05, .35, .29);
    ctx.lineTo(.35, .62);
    ctx.lineTo(-.35, .62);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#10171d";
    for (const eyeX of [-.27, .27]) {
      ctx.beginPath();
      ctx.arc(eyeX, -.12, .16, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(0, .09); ctx.lineTo(-.1, .28); ctx.lineTo(.1, .28); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#10171d";
    ctx.lineWidth = .055;
    ctx.beginPath();
    for (const toothX of [-.12, .12]) { ctx.moveTo(toothX, .42); ctx.lineTo(toothX, .63); }
    ctx.stroke();
  } else {
    ctx.strokeStyle = "#ffe3a0";
    ctx.lineWidth = .09;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    // Ascending Zs form a centered sleep symbol, including at small token sizes.
    for (const [left, top, size] of [[-.65, .07, .48], [-.13, -.18, .37], [.3, -.49, .3]]) {
      ctx.moveTo(left, top); ctx.lineTo(left + size, top);
      ctx.lineTo(left, top + size); ctx.lineTo(left + size, top + size);
    }
    ctx.stroke();
  }
  ctx.restore();
}
export function drawGrid(ctx: CanvasRenderingContext2D, s: Scene) {
  const g = s.grid;
  if (g.type === "none") return;
  ctx.save();
  ctx.strokeStyle = g.color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = g.opacity;
  ctx.beginPath();
  const cells: Point[] = [];
  if (g.type === "square") {
    for (let x = g.offsetX % g.size; x <= s.width; x += g.size) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, s.height);
    }
    for (let y = g.offsetY % g.size; y <= s.height; y += g.size) {
      ctx.moveTo(0, y);
      ctx.lineTo(s.width, y);
    }
    if (g.labels && (g.labelMode !== "perimeter" || g.type !== "square"))
      for (let x = (g.offsetX % g.size) + g.size / 2; x < s.width; x += g.size)
        for (
          let y = (g.offsetY % g.size) + g.size / 2;
          y < s.height;
          y += g.size
        )
          cells.push({ x, y });
  } else {
    const bounds = hexGridBounds(s.width, s.height, g);
    for (let col = bounds.minCol; col <= bounds.maxCol; col++)
      for (let row = bounds.minRow; row <= bounds.maxRow; row++) {
        const q = g.type === "hex-flat" ? col : col - Math.floor(row / 2),
          r = g.type === "hex-flat" ? row - Math.floor(col / 2) : row;
        const p = hexCenter(q, r, g);
        cells.push(p);
        for (let i = 0; i < 6; i++) {
          const a =
            ((i * 60 + (g.type === "hex-pointy" ? 30 : 0)) * Math.PI) / 180;
          const x = p.x + g.size * Math.cos(a),
            y = p.y + g.size * Math.sin(a);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
      }
  }
  ctx.stroke();
  if (g.labels && (g.labelMode !== "perimeter" || g.type !== "square")) {
    ctx.globalAlpha = Math.max(0.45, g.opacity);
    ctx.font = `${Math.max(9, Math.min(15, g.size * 0.17))}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const p of cells) {
      const label = address(p, g);
      if (!label) continue;
      const y = p.y - (g.type === "square" ? g.size * 0.32 : g.size * 0.62);
      ctx.lineWidth = 3;
      ctx.strokeStyle = g.labelTheme === "dark" ? "#202925" : "#f1f1e6";
      ctx.strokeText(label, p.x, y);
      ctx.fillStyle = g.labelTheme === "dark" ? "#f1f1e6" : "#354039";
      ctx.fillText(label, p.x, y);
    }
  }
  ctx.restore();
}
export function strokeFog(ctx: CanvasRenderingContext2D, stroke: FogStroke) {
  ctx.globalCompositeOperation =
    stroke.mode === "reveal" ? "destination-out" : "source-over";
  ctx.fillStyle = "#141b19";
  ctx.strokeStyle = "#141b19";
  ctx.lineWidth = stroke.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const p = stroke.points[0];
  if (!p) return;
  if (stroke.shape === "merged" && stroke.fillRule === "evenodd") {
    ctx.beginPath();
    for (const part of stroke.parts ?? []) {
      stroke.points.slice(part.start,part.start+part.count).forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));
      ctx.closePath();
    }
    ctx.fill("evenodd");
  } else if (stroke.shape === "merged") {
    for (const part of stroke.parts ?? []) strokeFog(ctx, {...stroke,shape:part.shape,points:stroke.points.slice(part.start,part.start+part.count),parts:undefined});
  } else if (stroke.shape === "rect") {
    const b = stroke.points[stroke.points.length - 1];
    ctx.fillRect(
      Math.min(p.x, b.x),
      Math.min(p.y, b.y),
      Math.abs(b.x - p.x),
      Math.abs(b.y - p.y),
    );
  } else if (stroke.shape === "polygon") {
    ctx.beginPath();
    stroke.points.forEach((v, i) => i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y));
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(p.x, p.y, stroke.size / 2, 0, Math.PI * 2);
    ctx.fill();
    if (stroke.points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      stroke.points.slice(1).forEach((v) => ctx.lineTo(v.x, v.y));
      ctx.stroke();
    }
  }
}
let cachedFog: { key: string; canvas: HTMLCanvasElement } | null = null;
export function fogCanvas(scene: Scene, draft?: FogStroke | null) {
  const key = JSON.stringify([scene.id, scene.width, scene.height, scene.fog]);
  if (!cachedFog || cachedFog.key !== key) {
    const c = document.createElement("canvas");
    c.width = scene.width;
    c.height = scene.height;
    const x = c.getContext("2d")!;
    if (scene.fog.base) {
      x.fillStyle = "#141b19";
      x.fillRect(0, 0, c.width, c.height);
    }
    scene.fog.strokes.forEach((st) => strokeFog(x, st));
    cachedFog = { key, canvas: c };
  }
  if (!draft) return cachedFog.canvas;
  const c = document.createElement("canvas");
  c.width = scene.width;
  c.height = scene.height;
  const x = c.getContext("2d")!;
  x.drawImage(cachedFog.canvas, 0, 0);
  strokeFog(x, draft);
  return c;
}
export function renderScene(
  ctx: CanvasRenderingContext2D,
  s: Scene,
  w: Workspace,
  images: Images,
  options: RenderOptions = {},
) {
  ctx.save();
  ctx.beginPath();
  const region=options.crop??{x:0,y:0,width:s.width,height:s.height};
  ctx.rect(region.x, region.y, region.width, region.height);
  ctx.clip();
  ctx.fillStyle = s.background ?? "#e3e6d8";
  ctx.fillRect(region.x, region.y, region.width, region.height);
  if (s.mapId) {
    const img = images.get(s.mapId);
    if (img) ctx.drawImage(img, 0, 0, s.width, s.height);
  }
  if (s.drawing) drawMapDrawing(ctx, s.drawing, s.width, s.height, new Set(s.tokens.flatMap(t => t.pieceOf ? [t.pieceOf] : [])), images);
  drawGrid(ctx, s);
  for (const storedEffect of s.effects) {
    if (options.player && !effectVisibleToPlayers(storedEffect, s.tokens)) continue;
    const e = resolveEffect(storedEffect, s.tokens);
    const radius = e.size * s.grid.size;
    ctx.save();
    if (e.hidden) ctx.globalAlpha = 0.4;
    ctx.fillStyle = e.color + Math.round((e.fillOpacity ?? 69/255)*255).toString(16).padStart(2,"0");
    ctx.strokeStyle = e.color;
    ctx.lineWidth = e.strokeWidth ?? 3;
    ctx.setLineDash(e.strokeStyle === "dashed" ? [10,6] : []);
    ctx.beginPath();
    if (e.type === "circle") ctx.arc(e.x, e.y, radius, 0, Math.PI * 2);
    else {
      const points = effectPolygon(e, s.grid);
      points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.closePath();
    }
    if (e.kind !== "label") {
      ctx.fill();
      if ((e.strokeWidth ?? 3) > 0) ctx.stroke();
    }
    ctx.setLineDash([]);
    if (options.selected === e.id && !options.player && e.kind !== "label" && !e.locked) {
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = e.labelColor ?? "#15241e";
    ctx.font = `bold ${e.labelSize ?? (e.kind === "label" ? 24 : 16)}px system-ui`;
    ctx.textAlign = "center";
    if (e.label && e.showLabel !== false) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.strokeText(e.label, e.x + (e.labelOffsetX ?? 0), e.y + (e.labelOffsetY ?? 0));
      ctx.fillText(e.label, e.x + (e.labelOffsetX ?? 0), e.y + (e.labelOffsetY ?? 0));
    }
    if (options.selected === e.id && !options.player && e.kind !== "label" && !e.locked) {
      const handles = effectHandles(e, s.grid);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(handles.rotate.x, handles.rotate.y);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
      for (const [name, p] of Object.entries(handles)) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = name === "rotate" ? "#f6bb4b" : "#fff";
        ctx.fill();
        ctx.strokeStyle = "#15241e";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  options.underTokens?.(ctx);
  // Initials for picture-less tokens: no two differently named tokens share them. Players only count the tokens they can see.
  const initials = sceneInitials(s.tokens.filter(t => !t.pieceOf && !(options.player && t.hidden)));
  // Map pieces lie on the floor, under everyone else.
  for (const storedToken of [...s.tokens.filter(t => t.pieceOf), ...s.tokens.filter(t => !t.pieceOf)]) {
    const t = resolvedToken(w, s.id, storedToken);
    if (t.hidden && options.player) continue;
    const r = tokenRadius(t, s.grid),
      img = t.assetId ? images.get(t.assetId) : null;
    if (t.pieceOf) {
      drawPiece(ctx, t, s.grid.size * t.size, img, t.id === options.selected && !options.player);
      continue;
    }
    ctx.save();
    if (t.hidden) ctx.globalAlpha = 0.4;
    ctx.shadowColor = "#00000045";
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 3;
    ctx.beginPath();
    ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
    ctx.fillStyle = t.color;
    ctx.fill();
    ctx.shadowColor = "transparent";
    if (img) {
      ctx.save();
      ctx.clip();
      const scale = Math.max(r*2/img.width, r*2/img.height) * (t.imageZoom ?? 1);
      // Facing and flips turn the framed picture as a whole; the frame (offset, zoom, image rotation) goes with it.
      ctx.translate(t.x, t.y);
      ctx.rotate((t.facing ?? 0)*Math.PI/180);
      ctx.scale(t.flipX ? -1 : 1, t.flipY ? -1 : 1);
      ctx.translate((t.imageOffsetX ?? 0)*r*2, (t.imageOffsetY ?? 0)*r*2);
      ctx.rotate((t.imageRotation ?? 0)*Math.PI/180);
      ctx.drawImage(img, -img.width*scale/2, -img.height*scale/2, img.width*scale, img.height*scale);
      ctx.restore();
    }
    if (!t.assetId) drawTokenInitials(ctx, t.x, t.y, r, initials.get(t.id) ?? "", t.textColor ?? "#ffffff");
    ctx.strokeStyle = t.borderColor ?? t.color;
    const borderImage = t.borderAssetId ? images.get(t.borderAssetId) : null;
    if (borderImage) ctx.drawImage(borderImage, t.x-r, t.y-r, r*2, r*2);
    else if ((t.borderWidth ?? 4) > 0) {
      ctx.lineWidth = t.borderWidth ?? 4;
      ctx.stroke();
    }
    // No edge on a token whose border was set to nothing.
    if (!t.assetId && (borderImage || (t.borderWidth ?? 4) > 0)) drawTokenEdge(ctx, t.x, t.y, r + (borderImage ? 0 : (t.borderWidth ?? 4) / 2));
    if (t.facing !== undefined) drawFacingNotch(ctx, t.x, t.y, r, t.facing, t.borderColor ?? t.color);
    drawTokenStatus(ctx, t.x, t.y, r, t.status);
    if (t.id === options.selected && !options.player) {
      ctx.beginPath();
      ctx.arc(t.x, t.y, r + 6, 0, Math.PI * 2);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    drawTokenHp(ctx, t, r);
    drawTokenName(ctx, t, r);
    if (Number.isFinite(t.elevation) && t.elevation !== 0) {
      const text = `${t.elevation > 0 ? "+" : ""}${t.elevation} ${s.grid.unit}`;
      ctx.font = "600 12px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const width = ctx.measureText(text).width + 10;
      const nameAbove = t.showName && (t.namePosition === "top" || t.namePosition === "wrap");
      const hpLayout = tokenHpLayout(t, r);
      const x = t.x, y = t.y - r - (t.conditions.length ? 8 + conditionBadgeRadius(r) * 2 : 15) - hpLayout.top - (nameAbove ? tokenNameFontSize(t, r) + 20 : 0);
      ctx.fillStyle = "#15241ee8";
      ctx.fillRect(x - width / 2, y - 9, width, 18);
      ctx.fillStyle = "#fff";
      ctx.fillText(text, x, y);
    }
    drawTokenConditions(ctx, t, r, w.conditions, images);
    ctx.restore();
  }
  for (const point of s.pointsOfInterest ?? []) {
    if (options.player && point.hidden) continue;
    ctx.save();
    const markerScale = options.markerScale ?? 1;
    ctx.translate(point.x,point.y);ctx.scale(markerScale,markerScale);
    ctx.globalAlpha = point.hidden ? 0.5 : 1;
    ctx.beginPath();ctx.arc(0,0,14,0,Math.PI*2);
    ctx.fillStyle=point.color;ctx.fill();ctx.strokeStyle="#ffffff";ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle="#111827";ctx.font="bold 16px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.fillText(point.activation==="single"?">":"i",0,0);
    // Map notes: a small badge when the marker has a note (for players, only a shared one).
    const noted=options.player?point.playersSee&&!!(point.readAloud?.trim()||point.pages?.length):!!(point.notes?.trim()||point.readAloud?.trim()||point.pages?.length);
    if(noted){ctx.beginPath();ctx.arc(11,-11,5,0,Math.PI*2);ctx.fillStyle="#ffffff";ctx.fill();ctx.strokeStyle=point.color;ctx.lineWidth=2;ctx.stroke();}
    ctx.font="bold 12px sans-serif";
    const label=point.name.slice(0,60), width=ctx.measureText(label).width+12;
    const labelX = (Math.max(width*markerScale/2,Math.min(s.width-width*markerScale/2,point.x))-point.x)/markerScale;
    ctx.fillStyle="rgba(15,23,42,0.88)";ctx.fillRect(labelX-width/2,18,width,20);
    ctx.fillStyle="#ffffff";ctx.fillText(label,labelX,28);
    ctx.restore();
  }
  for (const measurement of s.measurements ?? []) {
    if (options.player && measurement.hidden) continue;
    drawMeasurement(ctx, measurement.points, s, measurement.color, measurement.label, measurement.hidden);
  }
  if (s.fog.enabled) {
    ctx.save();
    ctx.globalAlpha = options.player ? 1 : 0.7;
    ctx.drawImage(fogCanvas(s, options.draft), 0, 0);
    ctx.restore();
  }
  if (options.measure?.length) {
    ctx.save();
    ctx.beginPath();
    options.measure.forEach((p, i) =>
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
    );
    ctx.strokeStyle = "#f6bb4b";
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 5]);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  drawPerimeterLabels(ctx, s, options.crop);
}
export function drawPerimeterLabels(ctx: CanvasRenderingContext2D, s: Scene, crop?:MapCrop|null) {
  const r=crop??{x:0,y:0,width:s.width,height:s.height};
  const bounds = sceneRenderBounds(s,crop), margin = r.x-bounds.x;
  if (!margin) return;
  const dark = s.grid.labelTheme === "dark";
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = dark ? "#202925" : "#f1f1e6";
  ctx.fillRect(r.x-margin, r.y-margin, r.width + margin, margin);
  ctx.fillRect(r.x-margin, r.y, margin, r.height);
  ctx.fillStyle = dark ? "#f1f1e6" : "#28392e";
  ctx.font = `600 ${Math.min(15, Math.max(10, s.grid.size * .25))}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const labels = perimeterLabels(s,crop);
  for (const c of labels.columns) ctx.fillText(c.label, c.position, r.y-margin / 2, s.grid.size - 2);
  for (const row of labels.rows) ctx.fillText(row.label, r.x-margin / 2, row.position, margin - 4);
  ctx.restore();
}
export function drawMeasurement(ctx: CanvasRenderingContext2D, points: Point[], scene: Scene, color: string, label = "", hidden = false) {
  if (points.length < 2) return;
  ctx.save();
  ctx.globalAlpha = hidden ? .6 : 1;
  ctx.beginPath();
  points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.setLineDash([8, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
  const last = points[points.length - 1];
  const text = `${label ? label + " · " : ""}${Math.round(pathDistance(points, scene.grid) * 100) / 100} ${scene.grid.unit}`;
  ctx.font = "600 14px system-ui";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.strokeStyle = "#15241e";
  ctx.lineWidth = 4;
  ctx.strokeText(text, last.x + 8, last.y - 8);
  ctx.fillStyle = color;
  ctx.fillText(text, last.x + 8, last.y - 8);
  ctx.restore();
}
