/*
 * Sends to a Discord webhook. Server only. Mentions are always turned off, redirects are never followed
 * (so a post can't be forwarded somewhere else), and Discord's errors are turned into plain sentences.
 */
import type { Webhook } from "./webhook.ts";

export type Embed = {
  title?: string; description?: string; color?: number; url?: string;
  author?: { name: string; icon_url?: string };
  fields?: { name: string; value: string; inline?: boolean }[];
  image?: { url: string }; thumbnail?: { url: string };
  footer?: { text: string };
};
export type DiscordFile = { name: string; type: string; bytes: Uint8Array };
export type Post = { content?: string; embeds?: Embed[]; username?: string; files?: DiscordFile[] };
type Fetch = typeof fetch;

export class DiscordError extends Error {}

/** A name Discord accepts for a webhook post: it refuses names containing "discord" or "clyde". */
export function postName(name: string | undefined) {
  const clean = (name ?? "").replace(/discord|clyde/gi, "").replace(/[\u0000-\u001f\u007f@#:`]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return clean && !/^(everyone|here)$/i.test(clean) ? clean : undefined;
}

async function problem(res: Response, editing: boolean): Promise<string> {
  if (res.status >= 300 && res.status < 400) return "Discord rejected the post. Check the webhook in Maptable › Connections.";
  if (res.status === 429) return "Discord is rate limiting posts. Wait a moment before sending again.";
  if (res.status === 401 || res.status === 404) {
    if (editing) return "The message to update is gone from Discord. Post it again to start a new one.";
    return "This webhook was deleted in Discord. Paste a new one in Maptable › Connections.";
  }
  if (res.status === 413) return "That's too large for Discord. Try a smaller picture.";
  let code = 0;
  try { code = Number(((await res.json()) as { code?: unknown }).code) || 0; } catch { /* Not JSON. */ }
  if (code === 220001 || code === 220003) return "This webhook is for a forum channel. Paste the link to one post in the forum instead (it ends in ?thread_id=…), or use a text channel.";
  if (code === 10003) return "That thread or channel no longer exists in Discord. Paste a new webhook in Maptable › Connections.";
  if (code === 50083) return "That thread is archived in Discord. Reopen it, or choose another channel.";
  return "Discord rejected the post. Check the webhook in Maptable › Connections.";
}

/** Posts, or edits message `edit`. Returns the message id Discord gives back. */
export async function sendToDiscord(hook: Webhook, post: Post, opts: { edit?: string; fetcher?: Fetch } = {}): Promise<{ id?: string }> {
  const fetcher = opts.fetcher ?? fetch;
  const params = new URLSearchParams();
  if (!opts.edit) params.set("wait", "true");
  if (hook.threadId) params.set("thread_id", hook.threadId);
  const url = (opts.edit ? `${hook.url}/messages/${opts.edit}` : hook.url) + (params.size ? `?${params}` : "");
  const { files, ...rest } = post;
  const json = { ...rest, allowed_mentions: { parse: [] as string[] }, ...(files?.length ? { attachments: files.map((f, id) => ({ id, filename: f.name })) } : {}) };
  let body: BodyInit, headers: Record<string, string> | undefined;
  if (files?.length) {
    const form = new FormData();
    form.set("payload_json", JSON.stringify(json));
    files.forEach((f, i) => form.set(`files[${i}]`, new Blob([f.bytes as BlobPart], { type: f.type }), f.name));
    body = form;
  } else { body = JSON.stringify(json); headers = { "Content-Type": "application/json" }; }
  let res: Response;
  try { res = await fetcher(url, { method: opts.edit ? "PATCH" : "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(15000) }); }
  catch { throw new DiscordError("Discord could not confirm delivery. Check the channel before sending again."); }
  if (!res.ok) throw new DiscordError(await problem(res, !!opts.edit));
  try { const data = await res.json() as { id?: unknown }; return typeof data.id === "string" && /^\d+$/.test(data.id) ? { id: data.id } : {}; }
  catch { return {}; }
}

/** Whether a webhook still exists, and its name in Discord. Reads only; posts nothing. */
export async function checkWebhook(hook: Webhook, fetcher: Fetch = fetch): Promise<{ state: "ok"; name: string } | { state: "deleted" } | { state: "unknown" }> {
  try {
    const res = await fetcher(hook.url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(8000) });
    if (res.status === 401 || res.status === 404) return { state: "deleted" };
    if (!res.ok) return { state: "unknown" };
    const data = await res.json() as { name?: unknown };
    return { state: "ok", name: typeof data.name === "string" ? data.name.slice(0, 80) : "" };
  } catch { return { state: "unknown" }; }
}
