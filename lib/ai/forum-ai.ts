/*
 * The forum's AI help (lib/forum/ai.ts) on one of the campaign's API-key connections: lists the connections the GM can
 * choose in Forum settings, and sends one request, counting its tokens against the connection's monthly limit.
 */
import type { S3Bucket } from "../storage.ts";
import { addUsage, listConnections, overLimit, usedNow } from "../mcp/connections.ts";
import { runOnce, ProviderError } from "./chat.ts";
import { unlock } from "./secret.ts";
import { ForumError } from "../forum/model.ts";
import type { Deps } from "../forum/request.ts";

export function forumAi(bucket: S3Bucket): NonNullable<Deps["ai"]> {
  return {
    async connections(owner, campaignId) {
      return (await listConnections(bucket, owner, campaignId)).flatMap(c => c.api ? [{ id: c.id, name: c.name, model: c.api.model, used: usedNow(c.api), limit: c.api.limit }] : []);
    },
    async run(owner, campaignId, connectionId, ask) {
      const c = (await listConnections(bucket, owner, campaignId)).find(x => x.id === connectionId);
      if (!c?.api) throw new ForumError("The forum's AI connection was removed. Ask the GM to choose another in Forum settings.");
      if (overLimit(c.api)) throw new ForumError(`${c.name} has used this month's tokens. The GM can raise its limit in the Encyclopedia.`);
      let tokens = 0;
      try {
        const out = await runOnce({ provider: c.api.provider, baseUrl: c.api.baseUrl, key: unlock(c.api.key), model: c.api.model }, ask.system, ask.prompt, ask.tool, ask.maxTokens);
        tokens = out.tokens;
        return { input: out.input, tokens, name: c.name };
      } catch (e) {
        const spent = (e as { tokens?: unknown }).tokens;
        tokens += typeof spent === "number" ? spent : 0;
        if (e instanceof ProviderError) throw new ForumError(e.message);
        throw e;
      } finally {
        if (tokens) await addUsage(bucket, owner, campaignId, c.id, tokens).catch(() => null);
      }
    },
  };
}
