/* The image work behind /api/discord/avatar: read the picture from the GM's storage, cut the token circle, shrink to 128 px. Server only. */
import sharp from "sharp";
import { getBucket } from "../storage.ts";
import { s3Request } from "../s3.ts";
import type { AvatarSource } from "./avatar.ts";

const SIZE = 128, LIMIT = 15_000_000;

async function read(s: AvatarSource): Promise<Uint8Array | null> {
  if (s.b === "m") {
    const object = await getBucket().get(s.k);
    return object ? new Uint8Array(await object.arrayBuffer()) : null;
  }
  const res = await s3Request(s.k, s.p, { method: "GET" });
  return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
}

export async function avatarPng(s: AvatarSource): Promise<Uint8Array | null> {
  const bytes = await read(s);
  if (!bytes || bytes.length > LIMIT) return null;
  const { data, info } = await sharp(bytes).rotate().toBuffer({ resolveWithObject: true });
  let image = sharp(data);
  if (s.c) {
    const w = info.width, h = info.height, [x, y, fraction] = s.c;
    // The token circle: centre (x, y) as fractions of the picture, diameter as a fraction of its shorter side.
    const size = Math.max(1, Math.min(w, h, Math.round(fraction * Math.min(w, h))));
    const left = Math.min(w - size, Math.max(0, Math.round(x * w - size / 2)));
    const top = Math.min(h - size, Math.max(0, Math.round(y * h - size / 2)));
    image = image.extract({ left, top, width: size, height: size });
  }
  return new Uint8Array(await image.resize(SIZE, SIZE, { fit: "cover" }).png().toBuffer());
}
