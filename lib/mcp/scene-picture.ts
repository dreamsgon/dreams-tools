/*
 * view_scene's picture. The image work (sharp) runs in one route, POST /api/scene-picture, so the image
 * library stays out of the MCP and AI functions: each copy of sharp is about 19 MB of Functions Storage.
 * This side signs a short-lived request naming the scene and where its map image is (the GM's uploads
 * or their own S3); that route reads the image itself and answers with the JPEG.
 * No site address or secret means no pictures: view_scene then says so and read_scene still works.
 */
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import type { Scene, Workspace as Maps } from "../model.ts";
import type { SceneView } from "./scene-image.ts";
import { siteOrigin } from "../discord/avatar.ts";

/** The map image: in the app's own bucket ("m", full key) or the GM's optional S3 bucket ("s", their key). */
export type MapSource = { b: "m" | "s"; k: string };
export type PictureRequest = { p: string; scene: Scene; mode: SceneView; map: MapSource | null; note?: string; exp: number };
export type Picture = { data: string; mimeType: string; note?: string };

const TTL = 60_000, BODY_LIMIT = 4_000_000;

function secret(env: NodeJS.ProcessEnv) {
  const material = env.AI_KEY_SECRET || env.MAPTABLE_AWS_SECRET_ACCESS_KEY;
  return material ? Buffer.from(hkdfSync("sha256", material, "rpg-tools", "scene-picture", 32)) : null;
}
const sign = (body: string, key: Buffer) => createHmac("sha256", key).update(body).digest("base64url");

/** Where a scene's map image is, from the GM's uploads or their own S3 only. Images on other sites are never fetched by the server. */
export function mapSource(prefix: string, maps: Maps, s: Scene): { map: MapSource | null; note?: string } {
  const asset = s.mapId ? maps.assets.find(a => a.id === s.mapId) : null;
  if (!asset) return { map: null, note: s.drawing ? "This map was drawn in the Map Creator; the picture shows the grid and tokens without the drawing." : undefined };
  const url = new URL(asset.src, "https://maptable.local");
  if (asset.src.startsWith("/api/assets?")) {
    const id = url.searchParams.get("id");
    return id && /^[a-f0-9-]{36}$/.test(id) ? { map: { b: "m", k: prefix + "images/" + id } } : { map: null, note: "The map image is missing." };
  }
  if (asset.src.startsWith("/api/s3?")) {
    const key = url.searchParams.get("key");
    return key ? { map: { b: "s", k: key } } : { map: null, note: "The map image couldn't be loaded from your S3 bucket." };
  }
  return { map: null, note: "The map image is on another website, so it isn't in the picture." };
}

/** A request body and its signature, or null when this site can't make pictures. */
export function pictureRequest(prefix: string, maps: Maps, s: Scene, mode: SceneView, env: NodeJS.ProcessEnv = process.env, now = Date.now()) {
  const key = secret(env);
  if (!key) return null;
  const body = JSON.stringify({ p: prefix, scene: s, mode, ...mapSource(prefix, maps, s), exp: now + TTL } satisfies PictureRequest);
  return { body, signature: sign(body, key) };
}

/** The request inside a body this server signed in the last minute, or null. */
export function readPictureRequest(body: string, signature: string | null, env: NodeJS.ProcessEnv = process.env, now = Date.now()): PictureRequest | null {
  const key = secret(env);
  if (!key || !signature || body.length > BODY_LIMIT) return null;
  const want = Buffer.from(sign(body, key)), got = Buffer.from(signature);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const r = JSON.parse(body) as PictureRequest;
    if (typeof r.exp !== "number" || r.exp < now || r.exp > now + TTL) return null;
    if (typeof r.p !== "string" || !/^users\/[^/]+\/$/.test(r.p) || !r.scene || (r.mode !== "gm" && r.mode !== "players")) return null;
    if (r.map && (typeof r.map.k !== "string" || (r.map.b !== "m" && r.map.b !== "s") || (r.map.b === "m" && !r.map.k.startsWith(r.p + "images/")))) return null;
    return r;
  } catch { return null; }
}

export async function scenePicture(prefix: string, maps: Maps, s: Scene, mode: SceneView, env: NodeJS.ProcessEnv = process.env, request: typeof fetch = fetch): Promise<Picture> {
  const origin = siteOrigin(env), signed = pictureRequest(prefix, maps, s, mode, env);
  if (!origin || !signed) throw new Error("Scene pictures aren't set up on this site. Use read_scene.");
  if (signed.body.length > BODY_LIMIT) throw new Error("This scene is too large to picture. Use read_scene.");
  const res = await request(`${origin}/api/scene-picture`, { method: "POST", headers: { "Content-Type": "application/json", "X-Scene-Signature": signed.signature }, body: signed.body });
  const out = await res.json().catch(() => null) as Picture | null;
  if (!res.ok || !out || typeof out.data !== "string") throw new Error("The scene picture couldn't be drawn. Use read_scene.");
  return { data: out.data, mimeType: out.mimeType, ...(out.note ? { note: out.note } : {}) };
}
