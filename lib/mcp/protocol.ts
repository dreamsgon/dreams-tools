/*
 * The Model Context Protocol over Streamable HTTP, without sessions: each POST carries one JSON-RPC
 * message (or a batch from older clients) and gets JSON back. Notifications get 202 and no body.
 */
import { callTool, listTools, serverInstructions, type McpContext } from "./tools.ts";
import { getPrompt, listPrompts } from "./prompts.ts";

export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
export const MAX_BODY = 64_000;
type Message = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
type Reply = { status: number; body: unknown };

const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
const validId = (id: unknown) => typeof id === "string" || (typeof id === "number" && Number.isFinite(id));

async function one(m: Message, load: () => Promise<McpContext>): Promise<unknown | null> {
  if (!m || typeof m !== "object" || m.jsonrpc !== "2.0") return rpcError(null, -32600, "Invalid request");
  if (typeof m.method !== "string") return null; // A response from the client: nothing to answer.
  if (!("id" in m)) return null; // A notification.
  if (!validId(m.id)) return rpcError(null, -32600, "Invalid request id");
  const params = (m.params && typeof m.params === "object" ? m.params : {}) as Record<string, unknown>;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: m.id, result });
  switch (m.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const c = await load();
      return ok({
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
        serverInfo: { name: "rpg-tools", title: `RPG Tools: ${c.campaign.name}`, version: "2.0.0" },
        instructions: serverInstructions(c),
      });
    }
    case "ping": return ok({});
    case "tools/list": return ok({ tools: listTools((await load()).level) });
    case "tools/call": return ok(await callTool(await load(), params.name, params.arguments));
    case "prompts/list": return ok({ prompts: listPrompts() });
    case "prompts/get": {
      const got = getPrompt(await load(), params.name, params.arguments);
      return typeof got === "string" ? rpcError(m.id, -32602, got) : ok(got);
    }
    // Clients may ask for these even though they are not offered; an empty list keeps them happy.
    case "resources/list": return ok({ resources: [] });
    case "resources/templates/list": return ok({ resourceTemplates: [] });
    default: return rpcError(m.id, -32601, `Method not found: ${m.method.slice(0, 80)}`);
  }
}

/** Answers one POST body. `load` reads the campaign, at most once per request. */
export async function handleMcp(raw: string, loadContext: () => Promise<McpContext>): Promise<Reply> {
  if (raw.length > MAX_BODY) return { status: 413, body: rpcError(null, -32600, "Request too large") };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { status: 400, body: rpcError(null, -32700, "Parse error") }; }
  let cached: Promise<McpContext> | null = null;
  const load = () => (cached ??= loadContext());
  if (Array.isArray(parsed)) {
    if (!parsed.length || parsed.length > 20) return { status: 400, body: rpcError(null, -32600, "Invalid batch") };
    const replies = (await Promise.all(parsed.map(m => one(m as Message, load)))).filter(r => r !== null);
    return replies.length ? { status: 200, body: replies } : { status: 202, body: null };
  }
  const reply = await one(parsed as Message, load);
  return reply === null ? { status: 202, body: null } : { status: 200, body: reply };
}
