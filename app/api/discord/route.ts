import {readTransfer} from "@/lib/transfers";
import {loadWorkspace} from "@/lib/workspace-storage";
import { context, failure } from "@/lib/server";
import { campaignSettingsKey, sceneCampaign, validWebhook } from "@/lib/campaign-settings";
export async function POST(request: Request) {
  try {
    const { bucket, prefix } = await context(request);
    const data = await request.formData();
    const workspace = await loadWorkspace(bucket,prefix);
    if (!workspace) throw new Error("Save this scene in a campaign before sending to Discord.");
    const saved = workspace.workspace;
    const campaignId = sceneCampaign(saved, data.get("sceneId"));
    const mapType = saved.scenes.find(s=>s.id===data.get("sceneId"))?.mapType;
    const route = String(data.get("route") || (mapType === "world" ? "world" : mapType === "area" ? "exploration" : "combat"));
    if (!["combat","exploration","world"].includes(route)) throw new Error("Choose a valid map destination.");
    if(data.get("campaignId")!==campaignId) throw new Error("This scene's campaign changed. Wait for it to save, then reopen Share before posting.");
    const stored = await bucket.get(campaignSettingsKey(prefix, campaignId));
    const settings = stored ? await stored.json<{ webhook?: string; webhooks?:Record<string,string> }>() : {};
    const webhook = settings.webhooks?.[route] || settings.webhook;
    if (!validWebhook(webhook))
      throw new Error("Add a Discord webhook for this campaign in Connections first.");
    const stagedId = data.get("transferId");
    const transfer = stagedId ? await readTransfer(bucket,prefix,"discord",stagedId) : null;
    const file = transfer ? new File([transfer.bytes], "map", {type:transfer.type}) : data.get("file"),
      caption = String(data.get("caption") || "").slice(0, 1900);
    if (
      !(file instanceof File) ||
      !["image/webp", "image/png", "image/jpeg"].includes(file.type) ||
      file.size > 9 * 1024 * 1024
    )
      throw new Error(
        "Export must be a WebP, PNG or JPG under 9 MB. Try a smaller export.",
      );
    const body = new FormData();
    body.set(
      "files[0]",
      file,
      "map." + (file.type === "image/webp" ? "webp" : file.type === "image/png" ? "png" : "jpg"),
    );
    body.set(
      "payload_json",
      JSON.stringify({ content: caption, allowed_mentions: { parse: [] } }),
    );
    const res = await fetch(webhook + "?wait=true", {
      method: "POST",
      body,
      // Workers supports manual redirect handling; never forward webhook payloads.
      redirect: "manual",
    });
    if (res.status === 429)
      throw new Error(
        "Discord is rate limiting posts. Please wait a moment before trying again.",
      );
    if (!res.ok)
      throw new Error(
        "Discord rejected the post. Check your webhook and image size.",
      );
    if (transfer) await bucket.delete(transfer.key).catch(() => {});
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}


