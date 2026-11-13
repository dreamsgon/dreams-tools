/* Server side of view_scene: loads the scene's map image from the GM's own storage and turns the picture into a JPEG. */
import type { S3Bucket } from "../storage.ts";
import type { Scene, Workspace as Maps } from "../model.ts";
import { s3Request } from "../s3.ts";
import { sceneSvg, type SceneView } from "./scene-image.ts";

const MAX = 1280, LIMIT = 25_000_000;

/** The map image, from the GM's uploads or their own S3 only. Images on other sites are never fetched by the server. */
async function mapBytes(bucket: S3Bucket, prefix: string, maps: Maps, s: Scene): Promise<{ bytes: Uint8Array; note?: string } | { bytes: null; note?: string }> {
  const asset = s.mapId ? maps.assets.find(a => a.id === s.mapId) : null;
  if (!asset) return { bytes: null, note: s.drawing ? "This map was drawn in the Map Creator; the picture shows the grid and tokens without the drawing." : undefined };
  const url = new URL(asset.src, "https://maptable.local");
  if (asset.src.startsWith("/api/assets?")) {
    const id = url.searchParams.get("id");
    if (!id || !/^[a-f0-9-]{36}$/.test(id)) return { bytes: null, note: "The map image is missing." };
    const object = await bucket.get(prefix + "images/" + id);
    if (!object) return { bytes: null, note: "The map image is missing." };
    return { bytes: new Uint8Array(await object.arrayBuffer()) };
  }
  if (asset.src.startsWith("/api/s3?")) {
    const res = await s3Request(url.searchParams.get("key") ?? "", prefix, { method: "GET" });
    if (!res.ok) return { bytes: null, note: "The map image couldn't be loaded from your S3 bucket." };
    return { bytes: new Uint8Array(await res.arrayBuffer()) };
  }
  return { bytes: null, note: "The map image is on another website, so it isn't in the picture." };
}

export async function scenePicture(bucket: S3Bucket, prefix: string, maps: Maps, s: Scene, mode: SceneView) {
  const { default: sharp } = await import("sharp");
  const view = s.crop ?? { x: 0, y: 0, width: s.width, height: s.height };
  const scale = Math.min(1, MAX / Math.max(view.width, view.height));
  let href: string | null = null, note: string | undefined;
  try {
    const map = await mapBytes(bucket, prefix, maps, s);
    note = map.note;
    if (map.bytes && map.bytes.length <= LIMIT) {
      // Shrink the map to the picture's size first: the SVG carries it inline.
      const small = await sharp(map.bytes).resize(Math.max(1, Math.round(s.width * scale)), Math.max(1, Math.round(s.height * scale)), { fit: "fill" }).jpeg({ quality: 80 }).toBuffer();
      href = `data:image/jpeg;base64,${small.toString("base64")}`;
    } else if (map.bytes) note = "The map image is too large to include.";
  } catch { note = "The map image couldn't be read."; }
  const { svg } = sceneSvg(s, mode, href, MAX);
  const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
  return { data: jpeg.toString("base64"), mimeType: "image/jpeg", note };
}
