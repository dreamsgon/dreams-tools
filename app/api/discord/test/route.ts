import {loadWorkspace} from "@/lib/workspace-storage";
import { context, failure, privateHeaders } from "@/lib/server";
import { requireCampaign } from "@/lib/campaign-settings";
import { sendDiscordTest } from "@/lib/discord/campaign";

// Sends a test card to one of the campaign's channels: { campaignId, channelId }.
export async function POST(request: Request) {
  try {
    const { bucket, prefix } = await context(request);
    const body = await request.json() as { campaignId: unknown; channelId?: unknown; route?: unknown };
    const stored = await loadWorkspace(bucket,prefix);
    if (!stored) throw new Error("Save and select a campaign before testing Discord.");
    const id = requireCampaign(stored.workspace, body.campaignId);
    await sendDiscordTest(bucket, prefix, id, stored.workspace.collections.find(c => c.id === id)!.name, body.channelId ?? body.route ?? null);
    return Response.json({ ok: true }, { headers: privateHeaders });
  } catch(e) { return failure(e); }
}
