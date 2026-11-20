/*
 * The forum's AI help (lib/forum/ai.ts): lists the campaign's API-key connections the GM can choose in Forum settings, and
 * sends one request. The key comes with the request from the asker's device and is never saved: the GM's key for the
 * forum's connection (its tokens count against that connection's monthly limit), or the asker's own AI from Account
 * settings › AI on this device.
 */
import type { S3Bucket } from "../storage.ts";
import { addUsage, listConnections, overLimit, ownTarget, targetFor, usedNow } from "../mcp/connections.ts";
import { runOnce, ProviderError } from "./chat.ts";
import { ForumError } from "../forum/model.ts";
import type { Deps } from "../forum/request.ts";

export function forumAi(bucket: S3Bucket): NonNullable<Deps["ai"]> {
  return {
    async connections(owner, campaignId) {
      return (await listConnections(bucket, owner, campaignId)).flatMap(c => c.api ? [{ id: c.id, name: c.name, model: c.api.model, used: usedNow(c.api), limit: c.api.limit }] : []);
    },
    async run(owner, campaignId, use, ask) {
      if ("own" in use) {
        let own: ReturnType<typeof ownTarget>;
        try { own = ownTarget(use.own); } catch (e) { throw new ForumError((e as Error).message); }
        try {
          const out = await runOnce(own, ask.system, ask.prompt, ask.tool, ask.maxTokens);
          return { input: out.input, tokens: out.tokens, name: own.name };
        } catch (e) { if (e instanceof ProviderError) throw new ForumError(e.message); throw e; }
      }
      const c = (await listConnections(bucket, owner, campaignId)).find(x => x.id === use.connectionId);
      if (!c?.api) throw new ForumError("The forum's AI connection was removed. Ask the GM to choose another in Forum settings.");
      if (overLimit(c.api)) throw new ForumError(`${c.name} has used this month's tokens. The GM can raise its limit in the Wiki.`);
      let target: ReturnType<typeof targetFor>;
      try { target = targetFor(c, use.apiKey); } catch (e) { throw new ForumError((e as Error).message); }
      let tokens = 0;
      try {
        const out = await runOnce(target, ask.system, ask.prompt, ask.tool, ask.maxTokens);
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
