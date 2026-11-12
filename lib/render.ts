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
  ctx.rotate((t.imageRotation ?? 0) * Math.PI / 180);
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
  if (s.drawing) drawMapDrawing(ctx, s.drawing, s.width, s.height, new Set(s.tokens.flatMap(t => t.pieceOf ? [t.pieceOf] : [])));
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
      ctx.translate(t.x + (t.imageOffsetX ?? 0)*r*2, t.y + (t.imageOffsetY ?? 0)*r*2);
      ctx.rotate((t.imageRotation ?? 0)*Math.PI/180);
      ctx.drawImage(img, -img.width*scale/2, -img.height*scale/2, img.width*scale, img.height*scale);
      ctx.restore();
    }
    ctx.strokeStyle = t.borderColor ?? t.color;
    const borderImage = t.borderAssetId ? images.get(t.borderAssetId) : null;
    if (borderImage) ctx.drawImage(borderImage, t.x-r, t.y-r, r*2, r*2);
    else if ((t.borderWidth ?? 4) > 0) {
      ctx.lineWidth = t.borderWidth ?? 4;
      ctx.stroke();
    }
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
      const x = t.x, y = t.y - r - (t.conditions.length ? 28 : 15) - hpLayout.top - (nameAbove ? tokenNameFontSize(t, r) + 20 : 0);
      ctx.fillStyle = "#15241ee8";
      ctx.fillRect(x - width / 2, y - 9, width, 18);
      ctx.fillStyle = "#fff";
      ctx.fillText(text, x, y);
    }
    t.conditions.forEach((id, i) => {
      const c = w.conditions.find((c) => c.id === id);
      if (!c) return;
      const a = -Math.PI / 2 + i * 0.6,
        x = t.x + Math.cos(a) * (r + 3),
        y = t.y + Math.sin(a) * (r + 3);
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fillStyle = c.color;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = "bold 12px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      const symbolImage=c.assetId?images.get(c.assetId):null;
      if(symbolImage){
        ctx.save();ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.clip();
        const scale=16/Math.max(symbolImage.width,symbolImage.height);
        const width=symbolImage.width*scale,height=symbolImage.height*scale;
        ctx.drawImage(symbolImage,x-width/2,y-height/2,width,height);ctx.restore();
      }else ctx.fillText(c.icon || c.name[0], x, y, 16);
    });
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
