/*
 * How a banner picture is framed in its box: which point stays in view (`x`, `y`, from 0 to 1 across and down the
 * picture) and how far it is zoomed in (`zoom`, 1 fills the box, up to BANNER_ZOOM_MAX). The point (x, y) of the
 * picture sits at the same point of the box, so zooming keeps it where it is. Shared by the Wiki's front page, the
 * campaign dashboard, Maptable's scene list, the forum's banner, a page's banner and the player site.
 */

export const BANNER_ZOOM_MAX = 4;
export type BannerFraming = { width: number; height: number; y: number; x?: number; zoom?: number };
type Box = { width: number; height: number };

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const round = (n: number, places = 3) => Math.round(n * 10 ** places) / 10 ** places;
const pct = (n: number) => `${round(n * 100, 1)}%`;

/** The picture's size in the box: as large as it needs to be to cover it, times the zoom. */
function scaled(b: BannerFraming, box: Box) {
  const s = Math.max(box.width / b.width, box.height / b.height) * clamp(b.zoom ?? 1, 1, BANNER_ZOOM_MAX);
  return { width: b.width * s, height: b.height * s };
}

/**
 * The CSS `background-position` and `background-size` for a banner in a box of this size. Without a zoom (or before
 * the box is measured) it is plain `cover`, so it needs no measuring.
 */
export function bannerBackground(b: BannerFraming, box?: Box | null): { position: string; size: string } {
  const position = `${pct(b.x ?? .5)} ${pct(b.y)}`;
  if ((b.zoom ?? 1) <= 1 || !box?.width || !box.height) return { position, size: "cover" };
  const s = scaled(b, box);
  return { position, size: `${Math.ceil(s.width)}px ${Math.ceil(s.height)}px` };
}

/** The framing after the picture is dragged by (dx, dy) pixels in the box: it follows the pointer, up to its edges. */
export function bannerMoved<B extends BannerFraming>(b: B, box: Box, dx: number, dy: number): B {
  const s = scaled(b, box), spareX = s.width - box.width, spareY = s.height - box.height;
  const x = b.x ?? .5;
  return {
    ...b,
    x: spareX > .5 ? round(clamp(x - dx / spareX)) : x,
    y: spareY > .5 ? round(clamp(b.y - dy / spareY)) : b.y,
  };
}

/** The framing at another zoom (1 to BANNER_ZOOM_MAX, in steps of a twentieth). */
export function bannerZoomed<B extends BannerFraming>(b: B, zoom: number): B {
  return { ...b, zoom: round(clamp(zoom, 1, BANNER_ZOOM_MAX), 2) };
}

/** The framing as it is saved: x and zoom only when they differ from the middle and no zoom. */
export function cleanFraming<B extends BannerFraming>(b: B): B {
  const out = { ...b, y: round(clamp(b.y)) };
  if (out.x === undefined || Math.abs(out.x - .5) < .001) delete out.x; else out.x = round(clamp(out.x));
  if (out.zoom === undefined || out.zoom <= 1) delete out.zoom; else out.zoom = round(clamp(out.zoom, 1, BANNER_ZOOM_MAX), 2);
  return out;
}
