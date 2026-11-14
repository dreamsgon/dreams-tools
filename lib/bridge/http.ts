/*
 * The HTTP side of the bridge API, shared by the /api/bridge routes. A bridge (the Foundry module) calls from the
 * other table's page in the browser, so every reply allows any origin: the key travels in the Authorization header,
 * never in a cookie, so a page without the key can do nothing with it.
 */
import { z } from "zod";
import { getBucket } from "../storage";
import { EncyclopediaStore } from "../encyclopedia/store";
import { createThrottle } from "../encyclopedia/throttle";
import type { Workspace } from "../encyclopedia/world-model";
import { BRIDGE_KEY, bridgeGrant, type BridgeGrant } from "./keys";
import { BridgeError } from "./api";
import { checkScope } from "../mcp/commit";

export const MAX_BRIDGE_BODY = 500_000;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "600",
};
const headers = { ...cors, "Cache-Control": "private, no-store", "Content-Type": "application/json" };
export const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
export const preflight = () => new Response(null, { status: 204, headers: cors });
// A sync checks often while the table is open; this keeps a runaway loop from hammering the store.
const throttle = createThrottle(240, 60_000);

type Ctx = { grant: BridgeGrant; store: EncyclopediaStore };
/** Runs a bridge call: checks the key, the rate and the body size, and turns errors into JSON with the right status. */
export async function bridge(request: Request, run: (ctx: Ctx) => Promise<Response>) {
  const key = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!key) return reply({ error: "A bridge key is required: Authorization: Bearer rpgb_… Make one in the Encyclopedia under AI & GitHub › Other tables." }, 401);
  const wrong = () => reply({ error: "This bridge key was revoked or is wrong. Make a new one in the Encyclopedia under AI & GitHub › Other tables." }, 401);
  if (!BRIDGE_KEY.test(key)) return wrong();
  try {
    const bucket = getBucket(), grant = await bridgeGrant(bucket, key);
    if (!grant) return wrong();
    if (throttle.hit(grant.keyId)) return reply({ error: "Too many requests. Wait a minute and sync again." }, 429);
    return await run({ grant, store: new EncyclopediaStore(bucket) });
  } catch (e) {
    if (e instanceof BridgeError) return reply({ error: e.message, ...(e.body ?? {}) }, e.status);
    if (e instanceof z.ZodError || e instanceof SyntaxError) return reply({ error: "The request isn’t what this endpoint takes. See GET /api/bridge." }, 400);
    return reply({ error: "RPG Tools could not read the campaign. Try again in a moment." }, 500);
  }
}

export async function readBody(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BRIDGE_BODY) throw new BridgeError(413, "Request too large.");
  return JSON.parse(raw) as unknown;
}

/** Saves a change made from the latest workspace, running it again when the GM saved in between. */
export async function commit<T>(ctx: Ctx, change: (data: Workspace) => { workspace: Workspace } & T) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, revision } = await ctx.store.read(ctx.grant.owner);
    const out = change(data);
    // The same fence as AI changes: only this campaign's own pages, never worlds or campaign settings.
    try { checkScope(data, out.workspace, ctx.grant.campaignId); } catch (e) { throw new BridgeError(403, e instanceof Error ? e.message : "That change reached outside this campaign."); }
    let saved: Awaited<ReturnType<EncyclopediaStore["saveTagged"]>>;
    try { saved = await ctx.store.saveTagged(ctx.grant.owner, out.workspace, revision); }
    catch (e) { throw new BridgeError(400, e instanceof Error ? e.message : "Could not save the change."); }
    if (saved) return { ...out, revision: saved.revision };
  }
  throw new BridgeError(409, "The campaign kept changing while saving. Try again in a moment.");
}
