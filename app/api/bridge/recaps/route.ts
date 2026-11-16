import { bridge, preflight, reply } from "@/lib/bridge/http";
import { listRecaps, need } from "@/lib/bridge/api";
export const dynamic = "force-dynamic";
// Session pages and their recaps, as Markdown with their visibility. A draft recap is GM only. ?since= sends only newer ones.
export const GET = (request: Request) => bridge(request, async ({ grant, store }) => {
  need(grant, "recaps", "to");
  const { data, revision } = await store.read(grant.owner);
  return reply({ revision, ...listRecaps(data, grant.campaignId, new URL(request.url).searchParams.get("since") ?? undefined) });
});
export const OPTIONS = preflight;
