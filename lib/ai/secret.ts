/*
 * Locks a GM's AI API key before it is stored, with AES-256-GCM. The lock key comes from the server's
 * AI_KEY_SECRET, or, when that isn't set, from the S3 secret the server already has. If that secret
 * changes, stored keys can't be opened any more and the GM is asked to paste theirs again.
 * Server only: the browser never sees a stored key.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

export class LockedKeyError extends Error {}

function lockKey(env: NodeJS.ProcessEnv): Buffer {
  const material = env.AI_KEY_SECRET || env.MAPTABLE_AWS_SECRET_ACCESS_KEY;
  if (!material) throw Error("The server has no secret to lock API keys with. Set AI_KEY_SECRET (see .env.example).");
  return Buffer.from(hkdfSync("sha256", material, "rpg-tools", "ai-api-keys", 32));
}

export function lock(apiKey: string, env: NodeJS.ProcessEnv = process.env): string {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", lockKey(env), iv);
  const data = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  return "v1:" + Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

export function unlock(locked: string, env: NodeJS.ProcessEnv = process.env): string {
  const raw = locked.startsWith("v1:") ? Buffer.from(locked.slice(3), "base64") : null;
  if (!raw || raw.length < 29) throw new LockedKeyError("The saved API key can't be read. Paste it again under Replace key.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", lockKey(env), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    throw new LockedKeyError("The saved API key can't be read any more (the server's secret changed). Paste it again under Replace key.");
  }
}

/** Checks a pasted key: one line of printable characters. */
export function cleanApiKey(v: unknown): string {
  if (typeof v !== "string") throw Error("Paste the API key.");
  const key = v.trim();
  if (key.length < 8 || key.length > 400 || /[^\x21-\x7e]/.test(key)) throw Error("That doesn't look like an API key. Paste it again, without spaces.");
  return key;
}
