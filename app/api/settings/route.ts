import {loadWorkspace} from "@/lib/workspace-storage";
import { context, failure, privateHeaders } from "@/lib/server";
import { s3Configured } from "@/lib/s3";
import { campaignSettingsKey, requireCampaign, validWebhook } from "@/lib/campaign-settings";
export async function GET(request: Request) {
  try {
    const { bucket, prefix } = await context();
    const campaignId = new URL(request.url).searchParams.get("campaignId");
    let discordConfigured = false;
    let discordRoutes: Record<string, boolean> = {};
    if (campaignId !== null) {
      const workspace = await loadWorkspace(bucket,prefix);
      if (!workspace) throw new Error("Save and select a campaign before configuring Discord.");
      requireCampaign(workspace.workspace, campaignId);
      const settings = await bucket.get(campaignSettingsKey(prefix, campaignId));
      const value = settings ? await settings.json<{ webhook?: string; webhooks?: Record<string,string> }>() : {};
      discordRoutes = Object.fromEntries(["default","combat","exploration","world"].map(route => [route, validWebhook(route === "default" ? value.webhook : value.webhooks?.[route])]));
      discordConfigured = Object.values(discordRoutes).some(Boolean);
    }
    return Response.json({ discordConfigured, discordRoutes, s3Configured: s3Configured(), s3ObjectPrefix: (process.env.S3_PREFIX || "maptable/").replace(/^\/+|\/+$/g, "") + "/" + prefix }, { headers: privateHeaders });
  } catch (e) { return failure(e); }
}
export async function PUT(request: Request) {
  try {
    const { bucket, prefix } = await context(request);
    const { campaignId, webhook, route = "default" } = await request.json() as { campaignId: unknown; webhook: unknown; route?: string };
    if (!["default","combat","exploration","world"].includes(route)) throw new Error("Choose a valid map destination.");
    const workspace = await loadWorkspace(bucket,prefix);
    if (!workspace) throw new Error("Save and select a campaign before configuring Discord.");
    const id = requireCampaign(workspace.workspace, campaignId);
    if (webhook !== "" && !validWebhook(webhook))
      throw new Error("Use a Discord webhook URL beginning https://discord.com/api/webhooks/.");
    const previous = await bucket.get(campaignSettingsKey(prefix, id));
    const settings = previous ? await previous.json<{webhook?:string;webhooks?:Record<string,string>}>() : {};
    if (route === "default") settings.webhook = webhook as string;
    else settings.webhooks = {...settings.webhooks, [route]: webhook as string};
    await bucket.put(campaignSettingsKey(prefix, id), JSON.stringify(settings), {
      httpMetadata: { contentType: "application/json" },
    });
    return Response.json({ ok: true }, { headers: privateHeaders });
  } catch (e) { return failure(e); }
}

