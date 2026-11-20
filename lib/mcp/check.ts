/*
 * "Check it" in the AI panel: runs the hosted MCP server the way an AI app would (initialize, then tools/list) for one
 * connection, from the GM's side, without the key. It tells the GM whether RPG Tools is ready, and whether their AI app
 * has ever reached it, so a setup mistake in the app can be told apart from a problem here.
 */
import type { S3Bucket } from "../storage.ts";
import { grantOf, listConnections } from "./connections.ts";
import { handleMcp, PROTOCOL_VERSIONS } from "./protocol.ts";
import { GoneError, loadContext } from "./load.ts";

export type ConnectionCheck = { ok: boolean; name: string; tools: number; campaign: string; reached: boolean; lastUsedAt?: string; problem?: string };

export async function checkConnection(bucket: S3Bucket, owner: string, campaignId: string, id: unknown): Promise<ConnectionCheck> {
  const c = (await listConnections(bucket, owner, campaignId)).find(x => x.id === id);
  if (!c) throw Error("That connection was already revoked.");
  const base = { name: c.name, reached: !!c.lastUsedAt, ...(c.lastUsedAt ? { lastUsedAt: c.lastUsedAt } : {}) };
  if (c.api) return { ...base, ok: true, tools: 0, campaign: "", reached: true };
  const grant = await grantOf(bucket, owner, campaignId, id);
  const asked = JSON.stringify([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: PROTOCOL_VERSIONS[0], capabilities: {}, clientInfo: { name: "rpg-tools-check", version: "1" } } },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
  ]);
  try {
    const reply = await handleMcp(asked, () => loadContext(bucket, grant));
    const [init, tools] = (Array.isArray(reply.body) ? reply.body : []) as { result?: Record<string, unknown>; error?: { message?: string } }[];
    const failed = init?.error?.message ?? tools?.error?.message;
    if (failed || !init?.result || !tools?.result) return { ...base, ok: false, tools: 0, campaign: "", problem: failed ?? "The server didn't answer as expected." };
    const info = init.result.serverInfo as { title?: string } | undefined, list = tools.result.tools;
    return { ...base, ok: true, tools: Array.isArray(list) ? list.length : 0, campaign: (info?.title ?? "").replace(/^RPG Tools: /, "") };
  } catch (e) {
    return { ...base, ok: false, tools: 0, campaign: "", problem: e instanceof GoneError ? e.message : "RPG Tools couldn't read this campaign. Try again in a moment." };
  }
}
