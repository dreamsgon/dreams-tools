import { bridge, preflight, reply } from "@/lib/bridge/http";
import { listQuests, need } from "@/lib/bridge/api";
export const dynamic = "force-dynamic";
// Quests with their state, goals and log, as Markdown with their visibility. ?since= sends only newer ones.
export const GET = (request: Request) => bridge(request, async ({ grant, store }) => {
  need(grant, "quests", "to");
  const { data, revision } = await store.read(grant.owner);
  return reply({ revision, ...listQuests(data, grant.campaignId, new URL(request.url).searchParams.get("since") ?? undefined) });
});
export const OPTIONS = preflight;
