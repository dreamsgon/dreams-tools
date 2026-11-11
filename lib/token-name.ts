import type { Token } from "./model";
import { tokenNameFontSize, tokenHpLayout } from "./token-display-layout.ts";

/** Shared by the board and screenshot renderer. Coordinates are in map pixels. */
export function drawTokenName(ctx: CanvasRenderingContext2D, token: Token, radius: number) {
  if (!token.showName || !token.name.trim()) return;
  const text = token.name;
  const position = token.namePosition ?? "bottom";
  const fontSize = tokenNameFontSize(token, radius);
  const hp = tokenHpLayout(token, radius);
  const gap = Math.max(8, (token.borderWidth ?? 4) / 2 + 5);
  ctx.save();
  ctx.font = `600 ${fontSize}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = token.textColor ?? "#fff";
  if (position === "wrap") {
    const characters = Array.from(text);
    const widths = characters.map(char => ctx.measureText(char).width);
    const totalWidth = widths.reduce((sum, width) => sum + width, 0);
    // Keep the name on the upper half, close to the border. A lower HP
    // semicircle must not push the name outward on the opposite side.
    const nameGap = Math.max(3, (token.borderWidth ?? 4) / 2 + 2) + (token.nameSpacing ?? 0);
    let arcRadius = radius + nameGap + (token.conditions.length ? 16 : 0) + fontSize / 2;
    const maxSweep = Math.PI * .95;
    const initialSweep = Math.min(maxSweep, totalWidth / arcRadius);
    const overlapsHpRing = token.showHp && hp.position === "wrap" && initialSweep + hp.sweep + .16 > Math.PI * 2;
    if (overlapsHpRing || (token.showHp && (hp.position === "top" || hp.position === "side"))) {
      arcRadius += Math.max(hp.top, hp.side) + (token.nameHpSpacing ?? 3);
    }
    const scale = Math.min(1, (maxSweep * arcRadius) / Math.max(1, totalWidth));
    let angle = -Math.PI / 2 - totalWidth * scale / arcRadius / 2;
    ctx.strokeStyle = "#15241e";
    ctx.lineWidth = Math.max(2, Math.min(4, fontSize * .15));
    ctx.lineJoin = "round";
    for (let i = 0; i < characters.length; i++) {
      const advance = widths[i] * scale / arcRadius;
      const center = angle + advance / 2;
      ctx.save();
      ctx.translate(token.x + Math.cos(center) * arcRadius, token.y + Math.sin(center) * arcRadius);
      ctx.rotate(center + Math.PI / 2);
      ctx.scale(scale, 1);
      ctx.strokeText(characters[i], 0, 0);
      ctx.fillText(characters[i], 0, 0);
      ctx.restore();
      angle += advance;
    }
  } else {
    let x = token.x;
    let y = token.y + radius + (hp.bottom ? hp.bottom + 5 : gap) + fontSize / 2;
    if (position === "top") y = token.y - radius - gap - fontSize / 2 - (token.conditions.length ? 20 : 0) - hp.top;
    if (position === "side") {
      x += radius + gap + fontSize / 2 + hp.side;
      y = token.y;
    }
    ctx.translate(x, y);
    if (position === "side") ctx.rotate(-Math.PI / 2);
    const width = ctx.measureText(text).width;
    ctx.fillStyle = "#15241ee8";
    ctx.fillRect(-width / 2 - 5, -fontSize / 2 - 3, width + 10, fontSize + 6);
    ctx.fillStyle = token.textColor ?? "#fff";
    ctx.fillText(text, 0, 0);
  }
  ctx.restore();
}
