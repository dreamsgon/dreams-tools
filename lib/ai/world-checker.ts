/*
 * Check with your AI for world maps: sends a world's settings and a summary of its map, with the campaign pages the GM
 * picked, to one of the GM's API-key connections and brings back findings. The pages are read as that connection may
 * see them (a connection kept to what players see never reads GM-only pages or secrets). Saves nothing; counts the
 * tokens against the connection's monthly limit.
 */
import type { S3Bucket } from "../storage.ts";
import { addUsage, listConnections, overLimit, publicApi } from "../mcp/connections.ts";
import { loadContext } from "../mcp/load.ts";
import { runOnce, ProviderError } from "./chat.ts";
import { unlock } from "./secret.ts";
import { pageText, readWorldCheck, WORLD_SYSTEM, worldCheckPrompt, worldCheckTool, type WorldCheckRequest } from "../encyclopedia/world-check.ts";

const kindWord = (k: string) => k === "faction" ? "organization" : k;

/** Checks a world with a campaign's API-key connection. */
export async function checkWorld(bucket: S3Bucket, owner: string, campaignId: string, connectionId: string, r: WorldCheckRequest, fetchImpl: typeof fetch = fetch) {
  const c = (await listConnections(bucket, owner, campaignId)).find(x => x.id === connectionId);
  if (!c?.api) throw Error("That AI connection was removed.");
  if (overLimit(c.api)) throw Error(`${c.name} has used this month's ${c.api.limit!.toLocaleString("en-US")} tokens. Raise the limit under What it may do.`);
  const ctx = await loadContext(bucket, { owner, campaignId, connectionId: c.id, level: c.level, ...(c.perms ? { perms: c.perms } : {}) });
  const byId = new Map(ctx.book.entries.map(e => [e.id, e]));
  const pages = r.pages.flatMap(id => { const e = byId.get(id); return e ? [{ title: e.title, kind: kindWord(e.kind), text: pageText(e.body) }] : []; });
  const skipped = r.pages.length - pages.length;
  const target = { provider: c.api.provider, baseUrl: c.api.baseUrl, key: unlock(c.api.key), model: c.api.model };
  let tokens = 0;
  try {
    const out = await runOnce(target, WORLD_SYSTEM, worldCheckPrompt(r, ctx.campaign, pages), worldCheckTool(r), 3_000, fetchImpl);
    tokens = out.tokens;
    const check = readWorldCheck(out.input, r);
    if (!check.findings.length) throw new ProviderError("The AI didn't send a check. Try again.");
    const after = await addUsage(bucket, owner, campaignId, c.id, tokens);
    return { ...check, skipped, by: c.name, model: c.api.model, tokens, api: after?.api ? publicApi(after.api) : undefined };
  } catch (e) {
    const spent = (e as { tokens?: unknown }).tokens;
    tokens += typeof spent === "number" ? spent : 0;
    if (tokens) await addUsage(bucket, owner, campaignId, c.id, tokens).catch(() => null);
    throw e;
  }
}
