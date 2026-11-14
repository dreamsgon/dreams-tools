import { bridge, preflight, reply } from "@/lib/bridge/http";
import { listPages, need } from "@/lib/bridge/api";
export const dynamic = "force-dynamic";
// Places, lore, organizations, notes and folders, as Markdown with their visibility. ?since= sends only newer ones.
export const GET = (request: Request) => bridge(request, async ({ grant, store }) => {
  need(grant, "pages", "to");
  const { data, revision } = await store.read(grant.owner);
  return reply({ revision, ...listPages(data, grant.campaignId, new URL(request.url).searchParams.get("since") ?? undefined) });
});
export const OPTIONS = preflight;
