/* The HTTP side of the hosted MCP server, shared by /api/mcp (key in a header) and /api/mcp/<key> (key in the URL). */
import { getBucket } from "../storage";
import { handleMcp, MAX_BODY } from "./protocol.ts";
import { GoneError, loadContext, resolveKey } from "./load.ts";

const headers = { "Cache-Control": "private, no-store", "Content-Type": "application/json" };
const plain = (status: number, message: string, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32001, message } }), { status, headers: { ...headers, ...extra } });

export async function servePost(request: Request, key: string | null) {
  if (!key) return plain(401, "An RPG Tools AI connection key is required. Make one under AI connection in the Encyclopedia.", { "WWW-Authenticate": "Bearer" });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return plain(413, "Request too large");
  try {
    const bucket = getBucket(), grant = await resolveKey(bucket, key);
    if (!grant) return plain(401, "This AI connection was revoked or the key is wrong. Make a new one under AI connection in the Encyclopedia.");
    const reply = await handleMcp(raw, () => loadContext(bucket, grant));
    return reply.body === null ? new Response(null, { status: 202, headers: { "Cache-Control": "private, no-store" } }) : new Response(JSON.stringify(reply.body), { status: reply.status, headers });
  } catch (e) {
    if (e instanceof GoneError) return plain(404, e.message);
    return plain(500, "RPG Tools could not read the campaign. Try again in a moment.");
  }
}

/** This server keeps no sessions and sends no server-initiated messages, so GET and DELETE are not offered. */
export const notAllowed = () => new Response(null, { status: 405, headers: { Allow: "POST" } });
