import type { Picture } from "./world-model.ts";

/** Token sizes offered for a picture, in grid squares. */
export const tokenSizes = [
  { squares: 1, label: "Medium or smaller" },
  { squares: 2, label: "Large (2×2)" },
  { squares: 3, label: "Huge (3×3)" },
  { squares: 4, label: "Gargantuan (4×4)" },
] as const;

/** Ring colours offered for a token; the first is the default for each kind of character. */
export const ringColors = ["#d9b25e", "#ef8a99", "#86a8ea", "#7fc39a", "#b39be6", "#f0956b", "#e6ebee"] as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A new picture's token circle: the largest circle that fits, centred a little above the middle (where faces usually are). */
export function newPicture(imageId: string, width: number, height: number): Picture {
  const tall = height > width;
  return { imageId, width, height, x: 0.5, y: tall ? clamp(0.38, 0.5 * width / height, 1 - 0.5 * width / height) : 0.5, size: 1 };
}

/** Keeps the token circle inside the picture. */
export function fitCircle(p: Picture, x: number, y: number, size: number): Picture {
  const s = clamp(size, 0.2, 1), short = Math.min(p.width, p.height);
  const rx = s * short / 2 / p.width, ry = s * short / 2 / p.height;
  return { ...p, size: s, x: clamp(x, rx, 1 - rx), y: clamp(y, ry, 1 - ry) };
}

/**
 * The Maptable token image settings that show exactly the picture's circle.
 * Maptable scales an image to cover the token, multiplies by imageZoom, and moves its centre by imageOffset × the token's width.
 */
export function tokenImageFit(p: Picture) {
  const diameter = p.size * Math.min(p.width, p.height);
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return {
    imageZoom: round(clamp(1 / p.size, 0.25, 5)),
    imageOffsetX: round(clamp((0.5 - p.x) * p.width / diameter, -1, 1)),
    imageOffsetY: round(clamp((0.5 - p.y) * p.height / diameter, -1, 1)),
  };
}

/** The circle as CSS for a small round preview of the picture, sized in pixels. */
export function circleStyle(p: Picture, px: number) {
  const diameter = p.size * Math.min(p.width, p.height), scale = px / diameter;
  return {
    backgroundSize: `${p.width * scale}px ${p.height * scale}px`,
    backgroundPosition: `${px / 2 - p.x * p.width * scale}px ${px / 2 - p.y * p.height * scale}px`,
  };
}
