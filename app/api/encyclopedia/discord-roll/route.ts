import { getBucket } from "@/lib/storage";
import { privateHeaders } from "@/lib/server";
import { sendDiscordRoll } from "@/lib/encyclopedia/discord-send";
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
        await sendDiscordRoll(getBucket(), owner, body);
        return Response.json({ ok: true }, { headers: privateHeaders });
    }
    catch (e) { return fail(e instanceof Error && !(e instanceof SyntaxError) && !("issues" in e) ? e.message : "Could not send this roll."); }
}
