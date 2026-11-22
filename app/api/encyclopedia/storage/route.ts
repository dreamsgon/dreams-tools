import { z } from "zod";
import { json, ownerFrom, sameOrigin, setWikiPartLimit, setWikiTotalLimit } from "@/lib/encyclopedia/workspace-server";
import { PART_LIMITS, TOTAL_LIMITS } from "@/lib/encyclopedia/wiki-parts";
export const dynamic = "force-dynamic";
/** The owner raises (or lowers) how big one campaign, or one world's shared lore, may be, or the whole Wiki. */
export async function PUT(request: Request) {
    const owner = await ownerFrom(request);
    if (!owner)
        return json({ error: "Sign in to change your Wiki settings." }, 401);
    if (!sameOrigin(request))
        return json({ error: "A same-origin request is required." }, 403);
    try {
        const text = await request.text();
        if (text.length > 200)
            return json({ error: "Request too large." }, 413);
        const offered = (list: readonly number[]) => z.number().refine(n => list.includes(n), "Choose one of the limits offered.");
        const body = z.union([z.object({ limit: offered(PART_LIMITS) }).strict(), z.object({ total: offered(TOTAL_LIMITS) }).strict()]).parse(JSON.parse(text));
        const saved = "limit" in body ? await setWikiPartLimit(owner, body.limit) : await setWikiTotalLimit(owner, body.total);
        if (saved === null)
            return json({ error: "Your Wiki changed in the same moment. Try again." }, 409);
        return json({ ...saved, ...body });
    }
    catch (error) {
        return json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Could not change the limit." }, 400);
    }
}
