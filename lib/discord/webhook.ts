/*
 * Discord webhook links. People paste links copied from any Discord app: discord.com, discordapp.com,
 * PTB or Canary, with or without an API version, and links to a thread or forum post (?thread_id=…).
 * Each is turned into one plain https://discord.com/api/webhooks/<id>/<token> URL plus an optional thread.
 */

const HOSTS = new Set(["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com", "ptb.discordapp.com", "canary.discordapp.com"]);

export type Webhook = { url: string; threadId?: string };

/** The webhook in a pasted link, or null when it isn't a Discord webhook link. */
export function parseWebhook(value: unknown): Webhook | null {
  if (typeof value !== "string" || value.length > 600) return null;
  let u: URL;
  try { u = new URL(value.trim()); } catch { return null; }
  if (u.protocol !== "https:" || !HOSTS.has(u.hostname.toLowerCase()) || u.port || u.username || u.password || u.hash) return null;
  const path = /^\/api\/(?:v\d{1,2}\/)?webhooks\/(\d{5,30})\/([A-Za-z0-9_-]{1,200})\/?$/.exec(u.pathname);
  if (!path) return null;
  let threadId: string | undefined;
  for (const [key, v] of u.searchParams) {
    if (key === "thread_id" && /^\d{5,30}$/.test(v) && !threadId) threadId = v;
    else if (key === "wait" && (v === "true" || v === "false")) continue;
    else return null; // Anything else could change what Discord does with the post.
  }
  return { url: `https://discord.com/api/webhooks/${path[1]}/${path[2]}`, ...(threadId ? { threadId } : {}) };
}

/** A saved webhook URL: only the plain form that parseWebhook makes. */
export function savedWebhook(value: unknown): value is string {
  return typeof value === "string" && /^https:\/\/discord\.com\/api\/webhooks\/\d{1,30}\/[A-Za-z0-9_-]{1,200}$/.test(value);
}
