/* The image work behind /api/scene-picture: read the scene's map image from the GM's storage, shrink it, draw the scene and return a JPEG. Server only; only that route may import this file (it brings sharp). */
import sharp from "sharp";
import { getBucket } from "../storage.ts";
import { s3Request } from "../s3.ts";
import { sceneSvg } from "./scene-image.ts";
import type { MapSource, Picture, PictureRequest } from "./scene-picture.ts";

const MAX = 1280, LIMIT = 25_000_000;

async function read(prefix: string, m: MapSource): Promise<Uint8Array | null> {
  if (m.b === "m") {
    const object = await getBucket().get(m.k);
    return object ? new Uint8Array(await object.arrayBuffer()) : null;
  }
  const res = await s3Request(m.k, prefix, { method: "GET" });
  return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
}

export async function renderScenePicture(r: PictureRequest): Promise<Picture> {
  const s = r.scene;
  const view = s.crop ?? { x: 0, y: 0, width: s.width, height: s.height };
  const scale = Math.min(1, MAX / Math.max(view.width, view.height));
  let href: string | null = null, note = r.note;
  if (r.map) {
    try {
      const bytes = await read(r.p, r.map);
      if (!bytes) note = r.map.b === "s" ? "The map image couldn't be loaded from your S3 bucket." : "The map image is missing.";
      else if (bytes.length > LIMIT) note = "The map image is too large to include.";
      else {
        // Shrink the map to the picture's size first: the SVG carries it inline.
        const small = await sharp(bytes).resize(Math.max(1, Math.round(s.width * scale)), Math.max(1, Math.round(s.height * scale)), { fit: "fill" }).jpeg({ quality: 80 }).toBuffer();
        href = `data:image/jpeg;base64,${small.toString("base64")}`;
      }
    } catch { note = "The map image couldn't be read."; }
  }
  const { svg } = sceneSvg(s, r.mode, href, MAX);
  const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
  return { data: jpeg.toString("base64"), mimeType: "image/jpeg", ...(note ? { note } : {}) };
}
