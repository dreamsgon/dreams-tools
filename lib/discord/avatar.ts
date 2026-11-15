/*
 * The small round picture on a roll card: a Maptable token's image, or an Encyclopedia page's picture
 * framed the way its token is. The card names it by a signed link to /api/discord/avatar, which Discord
 * fetches; that one route reads the image from the GM's own storage and shrinks it to 128 px. Keeping the
 * image work there keeps the image library (sharp) out of every other Vercel Function.
 * No link (no site address or secret) just means no picture: a roll is never held up by its avatar.
 */
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import type { Token, Workspace as Maps } from "../model.ts";
import type { Picture } from "../encyclopedia/world-model.ts";
import { encyclopediaPrefix } from "../encyclopedia/store.ts";

/** Where the image is: the app's own bucket ("m") or the GM's optional S3 bucket ("s"), and the token circle to cut out. */
export type AvatarSource = { b: "m" | "s"; k: string; p: string; c?: [x: number, y: number, size: number] };

function secret(env: NodeJS.ProcessEnv) {
  const material = env.AI_KEY_SECRET || env.MAPTABLE_AWS_SECRET_ACCESS_KEY;
  return material ? Buffer.from(hkdfSync("sha256", material, "rpg-tools", "discord-avatar", 32)) : null;
}
const sign = (body: string, key: Buffer) => createHmac("sha256", key).update(body).digest("base64url");

/** The public address Discord can fetch: APP_ORIGIN if set, else Vercel's production domain. */
export function siteOrigin(env: NodeJS.ProcessEnv = process.env) {
  if (env.APP_ORIGIN) return env.APP_ORIGIN.replace(/\/+$/, "");
  return env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : null;
}

export function avatarUrl(source: AvatarSource, env: NodeJS.ProcessEnv = process.env): string | null {
  const origin = siteOrigin(env), key = secret(env);
  if (!origin || !key) return null;
  const body = Buffer.from(JSON.stringify(source)).toString("base64url");
  return `${origin}/api/discord/avatar?a=${body}.${sign(body, key)}`;
}

/** The source inside a link this server signed, or null. */
export function readAvatarLink(a: string | null, env: NodeJS.ProcessEnv = process.env): AvatarSource | null {
  const key = secret(env);
  if (!key || !a || a.length > 2000) return null;
  const [body, sig] = a.split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(sign(body, key)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AvatarSource;
    if ((s.b !== "m" && s.b !== "s") || typeof s.k !== "string" || typeof s.p !== "string" || !/^users\/[^/]+\/$/.test(s.p)) return null;
    if (s.b === "m" && !s.k.startsWith(s.p)) return null;
    return s;
  } catch { return null; }
}

/** A Maptable token's image, from the GM's uploads or their own S3 only. */
export function tokenAvatar(prefix: string, maps: Maps, token: Pick<Token, "assetId">, env: NodeJS.ProcessEnv = process.env): string | null {
  const asset = token.assetId ? maps.assets.find(a => a.id === token.assetId) : null;
  if (!asset) return null;
  const url = new URL(asset.src, "https://maptable.local");
  if (asset.src.startsWith("/api/assets?")) {
    const id = url.searchParams.get("id");
    return id && /^[a-f0-9-]{36}$/.test(id) ? avatarUrl({ b: "m", k: prefix + "images/" + id, p: prefix }, env) : null;
  }
  if (asset.src.startsWith("/api/s3?")) {
    const key = url.searchParams.get("key");
    return key ? avatarUrl({ b: "s", k: key, p: prefix }, env) : null;
  }
  return null;
}

/** An Encyclopedia page's picture, cut to its token circle. */
export function pictureAvatar(owner: string, picture: Picture, env: NodeJS.ProcessEnv = process.env): string | null {
  const prefix = `users/${encodeURIComponent(owner)}/`;
  return avatarUrl({ b: "m", k: encyclopediaPrefix(owner) + "images/" + picture.imageId, p: prefix, c: [picture.x, picture.y, picture.size] }, env);
}
