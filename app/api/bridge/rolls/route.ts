import { bridge, preflight, readBody, reply } from "@/lib/bridge/http";
import { BridgeError, bridgeRoll, need } from "@/lib/bridge/api";
import { sendEncyclopediaPost } from "@/lib/encyclopedia/discord-send";
export const dynamic = "force-dynamic";
// A roll made at the other table, posted to the campaign's Discord rolls channel like a roll made here.
export const POST = (request: Request) => bridge(request, async ({ grant, bucket }) => {
  need(grant, "rolls", "from");
  const roll = bridgeRoll(await readBody(request));
  let sent: { skipped: boolean };
  try { sent = await sendEncyclopediaPost(bucket, grant.owner, grant.campaignId, roll); }
  catch (e) { throw new BridgeError(409, e instanceof Error ? e.message : "Discord didn’t take the roll."); }
  return reply({ posted: !sent.skipped });
});
export const OPTIONS = preflight;
