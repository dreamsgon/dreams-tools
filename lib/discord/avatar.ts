/*
 * The small round picture on a roll card: a Maptable token's image, or an Encyclopedia page's picture
 * framed the way its token is. Read from the GM's own storage only, shrunk to 128 px, sent as a file.
 * Any problem just means no picture: a roll is never held up by its avatar.
 */
import type { S3Bucket } from "../storage.ts";
import type { Token, Workspace as Maps } from "../model.ts";
import type { Picture } from "../encyclopedia/world-model.ts";
import { encyclopediaPrefix } from "../encyclopedia/store.ts";
import { assetBytes } from "../mcp/scene-picture.ts";
import type { DiscordFile } from "./send.ts";

const SIZE = 128, LIMIT = 15_000_000;

async function square(bytes: Uint8Array, crop?: { left: number; top: number; size: number }): Promise<DiscordFile | null> {
  if (bytes.length > LIMIT) return null;
  const { default: sharp } = await import("sharp");
  let image = sharp(bytes).rotate();
  if (crop) image = image.extract({ left: crop.left, top: crop.top, width: crop.size, height: crop.size });
  const out = await image.resize(SIZE, SIZE, { fit: "cover" }).png().toBuffer();
  return { name: "avatar.png", type: "image/png", bytes: new Uint8Array(out) };
}

export async function tokenAvatar(bucket: S3Bucket, prefix: string, maps: Maps, token: Pick<Token, "assetId">): Promise<DiscordFile | null> {
  try {
    const { bytes } = await assetBytes(bucket, prefix, maps, token.assetId);
    return bytes ? await square(bytes) : null;
  } catch { return null; }
}

export async function pictureAvatar(bucket: S3Bucket, owner: string, picture: Picture): Promise<DiscordFile | null> {
  try {
    const object = await bucket.get(encyclopediaPrefix(owner) + "images/" + picture.imageId);
    if (!object) return null;
    const bytes = new Uint8Array(await object.arrayBuffer());
    const { default: sharp } = await import("sharp");
    const meta = await sharp(bytes).rotate().metadata();
    const w = meta.width ?? picture.width, h = meta.height ?? picture.height;
    // The token circle: centre (x, y) as fractions of the picture, diameter as a fraction of its shorter side.
    const size = Math.max(1, Math.min(w, h, Math.round(picture.size * Math.min(w, h))));
    const left = Math.min(w - size, Math.max(0, Math.round(picture.x * w - size / 2)));
    const top = Math.min(h - size, Math.max(0, Math.round(picture.y * h - size / 2)));
    return await square(bytes, { left, top, size });
  } catch { return null; }
}
