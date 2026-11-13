import { dragRuler, formatDistance, type Ruler, type RulerBand } from "./drag-ruler.ts";
import type { Grid, Point } from "./model.ts";

const CELL: Record<RulerBand, string> = { walk: "#2fa36a55", dash: "#e9a92c66", over: "#d1483b4d" };
const PILL: Record<RulerBand, string> = { walk: "#1d2622", dash: "#8a5e08", over: "#a8322a" };

export type RulerInput = { points: Point[]; grid: Grid; scale: number; size?: number; speed?: number | null; radius?: number };

/** Clean up a path (no repeated points) before measuring or drawing it. */
export function rulerPoints(points: Point[]) {
  return points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
}
export function measureRuler(input: RulerInput): Ruler {
  return dragRuler(rulerPoints(input.points), input.grid, { size: input.size, speed: input.speed });
}

/** The squares the token passes, coloured by its speed. Drawn under the tokens. */
export function drawRulerCells(ctx: CanvasRenderingContext2D, ruler: Ruler, grid: Grid) {
  if (!ruler.cells.length) return;
  ctx.save();
  const hex = grid.type.startsWith("hex");
  for (const cell of ruler.cells) {
    ctx.fillStyle = CELL[cell.band];
    if (!hex) { ctx.fillRect(cell.center.x - grid.size / 2 + 1, cell.center.y - grid.size / 2 + 1, grid.size - 2, grid.size - 2); continue; }
    ctx.beginPath();
    for (let corner = 0; corner < 6; corner++) {
      const angle = (Math.PI / 3) * corner + (grid.type === "hex-pointy" ? Math.PI / 6 : 0);
      const x = cell.center.x + Math.cos(angle) * (grid.size - 1), y = cell.center.y + Math.sin(angle) * (grid.size - 1);
      if (corner) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, big: string, small: string, color: string, align: "center" | "left") {
  const pad = 8 / scale, bigSize = (small ? 16 : 12) / scale, smallSize = 11 / scale;
  ctx.font = `700 ${bigSize}px Inter, system-ui, sans-serif`;
  const bigWidth = ctx.measureText(big).width;
  ctx.font = `500 ${smallSize}px Inter, system-ui, sans-serif`;
  const smallWidth = small ? ctx.measureText(small).width : 0;
  const width = Math.max(bigWidth, smallWidth) + pad * 2, height = small ? 42 / scale : 22 / scale;
  const left = align === "center" ? x - width / 2 : x, top = y - height / 2;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect(left, top, width, height, (small ? 5 : 11) / scale); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.textAlign = "left";
  ctx.font = `700 ${bigSize}px Inter, system-ui, sans-serif`;
  ctx.fillText(big, left + pad, small ? top + 15 / scale : y);
  if (small) {
    ctx.fillStyle = "#ffffffd0"; ctx.font = `500 ${smallSize}px Inter, system-ui, sans-serif`;
    ctx.fillText(small, left + pad, top + 31 / scale);
  }
}

/** The path, a label on each waypoint with its leg, and the total beside the end (the token). */
export function drawRulerPath(ctx: CanvasRenderingContext2D, input: RulerInput, ruler: Ruler) {
  const points = rulerPoints(input.points), s = input.scale, unit = input.grid.unit;
  if (points.length < 2) return;
  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath(); points.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  ctx.strokeStyle = "#1d262259"; ctx.lineWidth = 7 / s; ctx.stroke();
  ctx.strokeStyle = "#f6bb4b"; ctx.lineWidth = 4 / s; ctx.stroke();
  for (const point of points.slice(1, -1)) {
    ctx.beginPath(); ctx.arc(point.x, point.y, 6 / s, 0, Math.PI * 2);
    ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = "#1d2622"; ctx.lineWidth = 2.5 / s; ctx.stroke();
  }
  if (points.length > 2) points.slice(1, -1).forEach((point, i) => pill(ctx, point.x, point.y - 22 / s, s, formatDistance(ruler.legs[i] ?? 0, unit), "", "#1d2622", "center"));
  const end = points.at(-1)!, last = ruler.cells.at(-1)?.band ?? "walk";
  const speed = input.speed && input.speed > 0 ? input.speed : null;
  const band: RulerBand = speed ? (ruler.total <= speed + 1e-9 ? "walk" : ruler.total <= speed * 2 + 1e-9 ? "dash" : "over") : last;
  const note = speed ? `Speed ${formatDistance(speed, unit)}${band === "dash" ? " · dashing" : band === "over" ? " · too far" : ""}` : "";
  const offset = (input.radius ?? 0) + 12 / s;
  pill(ctx, end.x + offset, end.y, s, formatDistance(ruler.total, unit), note, PILL[band], "left");
  ctx.restore();
}
