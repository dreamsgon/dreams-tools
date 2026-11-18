/*
 * From a setting (AI): asks one of the GM's API-key connections to build a star system from a setting the GM names.
 * Sends only the request and the campaign's name and description; reads no pages and saves nothing. The answer comes
 * back as the tool's raw input, which the browser turns into a survey chart (`readSystemDraft`) for the GM to preview.
 * Tokens count against the connection's monthly limit.
 */
import type { S3Bucket } from "../storage.ts";
import { addUsage, listConnections, overLimit, publicApi, targetFor, type KeyUse } from "../mcp/connections.ts";
import { loadContext } from "../mcp/load.ts";
import { runOnce, ProviderError } from "./chat.ts";
import { DRAFT_SYSTEM, systemDraftPrompt, systemDraftTool, type SystemDraftRequest } from "../encyclopedia/system-draft.ts";

/** Drafts a star system with a campaign's API-key connection. */
export async function draftSystem(bucket: S3Bucket, owner: string, campaignId: string, use: KeyUse, r: SystemDraftRequest, fetchImpl: typeof fetch = fetch) {
  const c = (await listConnections(bucket, owner, campaignId)).find(x => x.id === use.connectionId);
  if (!c?.api) throw Error("That AI connection was removed.");
  if (overLimit(c.api)) throw Error(`${c.name} has used this month's ${c.api.limit!.toLocaleString("en-US")} tokens. Raise the limit under What it may do.`);
  const ctx = await loadContext(bucket, { owner, campaignId, connectionId: c.id, level: c.level, ...(c.perms ? { perms: c.perms } : {}) });
  const target = targetFor(c, use.apiKey);
  let tokens = 0;
  try {
    const out = await runOnce(target, DRAFT_SYSTEM, systemDraftPrompt(r, ctx.campaign), systemDraftTool(), 6_000, fetchImpl);
    tokens = out.tokens;
    if (!out.input || !Array.isArray(out.input.worlds) || !out.input.worlds.length) throw new ProviderError("The AI sent no worlds. Try again, or name the system more plainly.");
    const after = await addUsage(bucket, owner, campaignId, c.id, tokens);
    return { draft: out.input, by: c.name, model: c.api.model, tokens, api: after?.api ? publicApi(after.api) : undefined };
  } catch (e) {
    const spent = (e as { tokens?: unknown }).tokens;
    tokens += typeof spent === "number" ? spent : 0;
    if (tokens) await addUsage(bucket, owner, campaignId, c.id, tokens).catch(() => null);
    throw e;
  }
}
