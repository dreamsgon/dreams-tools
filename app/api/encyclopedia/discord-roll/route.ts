import { getBucket } from "@/lib/storage";
import { privateHeaders } from "@/lib/server";
import { loadWorkspace } from "@/lib/workspace-storage";
import { campaignSettingsKey, validWebhook } from "@/lib/campaign-settings";
import { EncyclopediaStore } from "@/lib/encyclopedia/store";
import { discordRollMessage, discordRollSchema, discordTarget } from "@/lib/encyclopedia/discord-roll";
import { ownerFrom, sameOrigin } from "@/lib/encyclopedia/workspace-server";
export const dynamic = "force-dynamic";
const fail = (error: string, status = 400) => Response.json({ error }, { status, headers: privateHeaders });
// Posts one Encyclopedia roll to the Discord webhook of the Maptable campaign the GM chose. Reads only the owner's own data.
export async function POST(request: Request) {
    const owner = await ownerFrom(request);
    if (!owner) return fail("Unauthorized", 401);
    if (!sameOrigin(request)) return fail("A same-origin request is required.", 403);
    try {
        const text = await request.text();
        if (text.length > 4000) return fail("This roll is too large to send.");
        const body = JSON.parse(text);
        const content = discordRollMessage(body);
        const bucket = getBucket(), prefix = `users/${encodeURIComponent(owner)}/`;
        const { data } = await new EncyclopediaStore(bucket).read(owner);
        const target = discordTarget(data, discordRollSchema.parse(body).campaignId);
        const maptable = await loadWorkspace(bucket, prefix);
        if (!maptable?.workspace.collections.some(c => c.id === target.maptableCampaignId && c.kind === "campaign")) throw Error("The Maptable campaign for Discord rolls no longer exists. Choose another in AI & campaign repositories.");
        const stored = await bucket.get(campaignSettingsKey(prefix, target.maptableCampaignId));
        const settings = stored ? await stored.json<{ webhook?: string; webhooks?: Record<string, string> }>() : {};
        const webhook = settings.webhooks?.[target.route] || settings.webhook;
        if (!validWebhook(webhook)) throw Error("That Maptable campaign has no Discord webhook yet. Add one in Maptable's campaign Connections.");
        let response: Response;
        try { response = await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, allowed_mentions: { parse: [] } }), redirect: "manual", signal: AbortSignal.timeout(15000) }); }
        catch { throw Error("Discord could not confirm delivery. Check the channel before sending again."); }
        if (response.status === 429) throw Error("Discord is rate limiting posts. Wait a moment before sending again.");
        if (!response.ok) throw Error("Discord rejected the roll. Check the campaign webhook in Maptable.");
        return Response.json({ ok: true }, { headers: privateHeaders });
    }
    catch (e) { return fail(e instanceof Error && !(e instanceof SyntaxError) && !("issues" in e) ? e.message : "Could not send this roll."); }
}
