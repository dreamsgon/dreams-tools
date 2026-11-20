/*
 * Fitting a profile picture into its frame (components/avatar-crop.tsx). The picture is drawn `zoom` times the size
 * that just covers the square frame, with its top-left corner at (x, y) in frame pixels. It must always cover the frame.
 */
export type Crop = { zoom: number; x: number; y: number };

const scaleOf = (zoom: number, w: number, h: number, frame: number) => frame / Math.min(w, h) * Math.max(1, zoom);

/** Moves the picture back so it covers the whole frame, with the zoom at least 1. */
export function clampCrop(c: Crop, w: number, h: number, frame: number): Crop {
  const zoom = Math.max(1, Number.isFinite(c.zoom) ? c.zoom : 1), s = scaleOf(zoom, w, h, frame);
  const clamp = (v: number, size: number) => Math.min(0, Math.max(frame - size * s, Number.isFinite(v) ? v : 0));
  return { zoom, x: clamp(c.x, w), y: clamp(c.y, h) };
}
/** The picture at `zoom`, centred in the frame. */
export function centredCrop(w: number, h: number, frame: number, zoom = 1): Crop {
  const s = scaleOf(zoom, w, h, frame);
  return clampCrop({ zoom, x: (frame - w * s) / 2, y: (frame - h * s) / 2 }, w, h, frame);
}
/** Zooms to `zoom` keeping the point under `at` (frame pixels; the centre by default) where it is. */
export function zoomCrop(c: Crop, zoom: number, w: number, h: number, frame: number, at = { x: frame / 2, y: frame / 2 }): Crop {
  const before = scaleOf(c.zoom, w, h, frame), after = scaleOf(zoom, w, h, frame), k = after / before;
  return clampCrop({ zoom, x: at.x - (at.x - c.x) * k, y: at.y - (at.y - c.y) * k }, w, h, frame);
}
/** The square of the original picture inside the frame, in the picture's own pixels. */
export function cropSource(c: Crop, w: number, h: number, frame: number) {
  const s = scaleOf(c.zoom, w, h, frame), side = Math.min(frame / s, w, h);
  return { x: Math.min(w - side, Math.max(0, -c.x / s)), y: Math.min(h - side, Math.max(0, -c.y / s)), side };
}
