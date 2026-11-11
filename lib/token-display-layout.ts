import type { Token } from "./model";

export function tokenNameFontSize(token: Token, radius: number) {
  return Math.max(12, Math.min(20, radius * 0.48)) * (token.nameScale ?? 1);
}

export function tokenHpLayout(token: Token, radius: number) {
  const position = token.hpPosition ?? "bottom";
  const thickness = token.hpBarHeight ?? 7;
  const widthScale = token.hpBarWidth ?? 1;
  const length = radius * 2 * widthScale;
  const gap = (token.hpSpacing ?? 0) + (position === "wrap" ? Math.max(1.5, (token.borderWidth ?? 4) / 2 + 1) : Math.max(6, (token.borderWidth ?? 4) / 2 + 3));
  const badges = token.conditions.length ? 20 : 0;
  // Follow the border closely. Condition badges render over the ring instead
  // of pushing the entire ring away from the portrait.
  const ringRadius = radius + gap + thickness / 2;
  return {position, thickness, length, gap, badges, ringRadius,
    sweep: Math.PI * widthScale,
    top: !token.showHp ? 0 : position === "top" || position === "wrap" ? gap + thickness : 0,
    bottom: !token.showHp ? 0 : position === "bottom" || position === "wrap" ? gap + thickness : 0,
    side: !token.showHp ? 0 : position === "side" || position === "wrap" ? gap + thickness : 0,
  };
}

/** Uses the resolved token so campaign visibility and placement apply to exports too. */
export function drawTokenHp(ctx: CanvasRenderingContext2D, token: Token, radius: number) {
  if (!token.showHp) return;
  const layout = tokenHpLayout(token, radius);
  const ratio = Math.max(0, Math.min(1, token.hp / token.maxHp));
  const color = token.hpBarColor ?? (ratio > .5 ? "#63b88b" : ratio > .25 ? "#e6b352" : "#df6b62");
  ctx.save();
  if (layout.position === "wrap") {
    const start = Math.PI / 2 - layout.sweep / 2;
    ctx.lineWidth = layout.thickness;
    ctx.lineCap = layout.sweep >= Math.PI * 2 ? "butt" : "round";
    ctx.beginPath();
    ctx.arc(token.x, token.y, layout.ringRadius, start, start + layout.sweep);
    ctx.strokeStyle = "#202c27";
    ctx.stroke();
    if (ratio > 0) {
      ctx.beginPath();
      ctx.arc(token.x, token.y, layout.ringRadius, start, start + layout.sweep * ratio);
      ctx.strokeStyle = color;
      ctx.stroke();
    }
  } else if (layout.position === "side") {
    const x = token.x + radius + layout.gap;
    const y = token.y - layout.length / 2;
    ctx.fillStyle = "#202c27";
    ctx.fillRect(x, y, layout.thickness, layout.length);
    ctx.fillStyle = color;
    ctx.fillRect(x, y + layout.length * (1 - ratio), layout.thickness, layout.length * ratio);
  } else {
    const x = token.x - layout.length / 2;
    const y = layout.position === "top"
      ? token.y - radius - layout.gap - layout.thickness - layout.badges
      : token.y + radius + layout.gap;
    ctx.fillStyle = "#202c27";
    ctx.fillRect(x, y, layout.length, layout.thickness);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, layout.length * ratio, layout.thickness);
  }
  ctx.restore();
}
