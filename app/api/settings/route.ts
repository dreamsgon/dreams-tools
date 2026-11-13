import {loadWorkspace} from "@/lib/workspace-storage";
import { context, failure, privateHeaders } from "@/lib/server";
import { s3Configured } from "@/lib/s3";
import { requireCampaign } from "@/lib/campaign-settings";
import { discordStatus, editDiscord } from "@/lib/discord/campaign";
import type { DiscordEdit } from "@/lib/discord/settings";

// Storage status, plus the selected campaign's Discord channels (never their webhook URLs). `check=1` looks each webhook up in Discord.
export async function GET(request: Request) {
  try {
    const { bucket, prefix } = await context();
    const params = new URL(request.url).searchParams, campaignId = params.get("campaignId");
    let discord = null;
    if (campaignId !== null) {
      const workspace = await loadWorkspace(bucket,prefix);
      if (!workspace) throw new Error("Save and select a campaign before configuring Discord.");
      requireCampaign(workspace.workspace, campaignId);
      discord = await discordStatus(bucket, prefix, campaignId, { check: params.get("check") === "1" });
    }
    return Response.json({ discordConfigured: !!discord?.channels.length, discord, s3Configured: s3Configured(), s3ObjectPrefix: (process.env.S3_PREFIX || "maptable/").replace(/^\/+|\/+$/g, "") + "/" + prefix }, { headers: privateHeaders });
  } catch (e) { return failure(e); }
}

// One change to the campaign's Discord channels: { campaignId, action, ... } (see DiscordEdit).
export async function PUT(request: Request) {
  try {
    const { bucket, prefix } = await context(request);
    const body = await request.json() as { campaignId?: unknown; action?: unknown };
    if (!body || typeof body.action !== "string") throw new Error("Unknown change.");
    const workspace = await loadWorkspace(bucket,prefix);
    if (!workspace) throw new Error("Save and select a campaign before configuring Discord.");
    const id = requireCampaign(workspace.workspace, body.campaignId);
    const discord = await editDiscord(bucket, prefix, id, body as unknown as DiscordEdit);
    return Response.json({ ok: true, discord }, { headers: privateHeaders });
  } catch (e) { return failure(e); }
}
