import { z } from "zod";
import { archiveCampaign, json, ownerFrom, sameOrigin } from "@/lib/encyclopedia/workspace-server";
import { ArchiveError } from "@/lib/encyclopedia/store";
export const dynamic = "force-dynamic";
/** The owner archives a campaign's pages (they leave the Wiki and are kept in their own file), or brings them back. */
export async function POST(request: Request) {
    const owner = await ownerFrom(request);
    if (!owner)
        return json({ error: "Sign in to archive campaigns." }, 401);
    if (!sameOrigin(request))
        return json({ error: "A same-origin request is required." }, 403);
    try {
        const text = await request.text();
        if (text.length > 500)
            return json({ error: "Request too large." }, 413);
        const { campaignId, archive } = z.object({ campaignId: z.string().min(1).max(120), archive: z.boolean() }).parse(JSON.parse(text));
        const saved = await archiveCampaign(owner, campaignId, archive);
        if (saved === null)
            return json({ error: "Your Wiki changed in the same moment. Try again." }, 409);
        return json(saved);
    }
    catch (error) {
        if (error instanceof ArchiveError)
            return json({ error: error.message }, 400);
        if (error instanceof z.ZodError)
            return json({ error: error.issues[0]?.message }, 400);
        return json({ error: error instanceof Error && /limit/.test(error.message) ? error.message : "Could not change the archive. Nothing was changed." }, 400);
    }
}
