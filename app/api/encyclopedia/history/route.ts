import { z } from "zod";
import { getBucket } from "@/lib/storage";
import { EncyclopediaStore } from "@/lib/encyclopedia/store";
import { versionSchema } from "@/lib/encyclopedia/history";
import { json, ownerFrom, sameOrigin } from "@/lib/encyclopedia/workspace-server";
export const dynamic = "force-dynamic";
const entryId = z.string().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/);
// Page history is per user: every read and write goes through the signed-in owner's own prefix.
export async function GET(request: Request) {
    const owner = await ownerFrom(request);
    if (!owner) return json({ error: "Sign in to see page history." }, 401);
    const id = entryId.safeParse(new URL(request.url).searchParams.get("entry"));
    if (!id.success) return json({ error: "Choose an entry." }, 400);
    try { return json(await new EncyclopediaStore(getBucket()).history(owner, id.data)); }
    catch { return json({ error: "Could not read page history." }, 500); }
}
export async function POST(request: Request) {
    const owner = await ownerFrom(request);
    if (!owner) return json({ error: "Sign in to restore a version." }, 401);
    if (!sameOrigin(request)) return json({ error: "A same-origin request is required." }, 403);
    try {
        const text = await request.text();
        if (text.length > 4_100_000) return json({ error: "This page is too large to keep a version of." }, 413);
        const body = z.object({ entryId, snapshot: versionSchema.pick({ title: true, body: true, tabs: true }) }).parse(JSON.parse(text));
        const kept = await new EncyclopediaStore(getBucket()).checkpoint(owner, body.entryId, body.snapshot);
        return json({ kept });
    }
    catch (error) { return json({ error: error instanceof z.ZodError ? error.issues[0]?.message : "Could not keep the current version." }, 400); }
}
