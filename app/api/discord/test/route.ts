import {loadWorkspace} from "@/lib/workspace-storage";
import { context, failure, privateHeaders } from "@/lib/server";
import { campaignSettingsKey, requireCampaign, validWebhook } from "@/lib/campaign-settings";

export async function POST(request: Request) {
  try {
    const { bucket, prefix } = await context(request);
    const { campaignId, route = "default" } = await request.json() as {campaignId:unknown;route?:string};
    if (!["default","combat","exploration","world"].includes(route)) throw new Error("Choose a valid map destination.");
    const storedWorkspace = await loadWorkspace(bucket,prefix);
    if (!storedWorkspace) throw new Error("Save and select a campaign before testing Discord.");
    const workspace = storedWorkspace.workspace;
    const id = requireCampaign(workspace, campaignId);
    const stored = await bucket.get(campaignSettingsKey(prefix, id));
    const settings = stored ? await stored.json<{webhook?:string;webhooks?:Record<string,string>}>() : {};
    const webhook = route === "default" ? settings.webhook : settings.webhooks?.[route] || settings.webhook;
    if (!validWebhook(webhook)) throw new Error("Save a webhook for this campaign before testing it.");
    const name = workspace.collections.find(c=>c.id===id)!.name;
    let response: Response;
    try {
      response = await fetch(webhook + "?wait=true", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({content:`Maptable webhook test — campaign: ${name} (${route})\nIf this is the intended channel, your campaign is connected correctly.`,allowed_mentions:{parse:[]}}),
        // Workers supports manual redirect handling; never forward webhook payloads.
      redirect: "manual",
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new Error("Discord could not confirm delivery. Check the channel before trying again.");
    }
    if(response.status===429) throw new Error("Discord is rate limiting messages. Wait a moment before testing again.");
    if(!response.ok) throw new Error("Discord rejected the test. Check or replace this campaign's saved webhook.");
    return Response.json({ok:true},{headers:privateHeaders});
  } catch(e) { return failure(e); }
}

