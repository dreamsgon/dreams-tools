/*
 * Check with your AI for star systems: sends the survey chart in words, with the campaign pages the GM picked, to one
 * of the GM's API-key connections and brings back findings. Works like the world map check (`world-checker.ts`): pages
 * are read as that connection may see them, nothing is saved, and the tokens count against the connection's monthly limit.
 */
import type { S3Bucket } from "../storage.ts";
import { addUsage, listConnections, overLimit, publicApi, targetFor, type KeyUse } from "../mcp/connections.ts";
import { loadContext } from "../mcp/load.ts";
import { runOnce, ProviderError } from "./chat.ts";
import { pageText } from "../encyclopedia/world-check.ts";
import { readSystemCheck, SYSTEM_SYSTEM, systemCheckPrompt, systemCheckTool, type SystemCheckRequest } from "../encyclopedia/system-check.ts";

const kindWord = (k: string) => k === "faction" ? "organization" : k;

/** Checks a star system with a campaign's API-key connection. */
export async function checkSystem(bucket: S3Bucket, owner: string, campaignId: string, use: KeyUse, r: SystemCheckRequest, fetchImpl: typeof fetch = fetch) {
  const c = (await listConnections(bucket, owner, campaignId)).find(x => x.id === use.connectionId);
  if (!c?.api) throw Error("That AI connection was removed.");
  if (overLimit(c.api)) throw Error(`${c.name} has used this month's ${c.api.limit!.toLocaleString("en-US")} tokens. Raise the limit under What it may do.`);
  const ctx = await loadContext(bucket, { owner, campaignId, connectionId: c.id, level: c.level, ...(c.perms ? { perms: c.perms } : {}) });
  const byId = new Map(ctx.book.entries.map(e => [e.id, e]));
  const pages = r.pages.flatMap(id => { const e = byId.get(id); return e ? [{ title: e.title, kind: kindWord(e.kind), text: pageText(e.body) }] : []; });
  const skipped = r.pages.length - pages.length;
  const target = targetFor(c, use.apiKey);
  let tokens = 0;
  try {
    const out = await runOnce(target, SYSTEM_SYSTEM, systemCheckPrompt(r, ctx.campaign, pages), systemCheckTool(r), 3_000, fetchImpl);
    tokens = out.tokens;
    const check = readSystemCheck(out.input, r);
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
