import { bridge, preflight, reply } from "@/lib/bridge/http";
import { bridgeInfo } from "@/lib/bridge/api";
export const dynamic = "force-dynamic";
// The bridge API's front door: the campaign this key reaches, what syncs which way, and the endpoints.
export const GET = (request: Request) => bridge(request, async ({ grant, store }) => {
  const { data, revision } = await store.read(grant.owner);
  return reply(bridgeInfo(data, grant, revision));
});
export const OPTIONS = preflight;
