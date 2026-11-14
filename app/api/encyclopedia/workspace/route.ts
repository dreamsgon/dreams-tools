import { z } from "zod";
import { workspaceSchema } from "@/lib/encyclopedia/world-model";
import { json, ownerFrom, readWorkspace, sameOrigin, saveWorkspace, workspaceTag } from "@/lib/encyclopedia/workspace-server";
import { coGmGone, coGmGrant, coGmReadOnly, coGmWorkspace } from "@/lib/encyclopedia/member-workspace-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
    const owner = await ownerFrom(request);
    if (!owner)
        return json({ error: "Sign in to open your worlds." }, 401);
    // ?member=<ref>: a co-GM opening one campaign someone else runs (lib/members-server.ts).
    const member = new URL(request.url).searchParams.get("member");
    if (member !== null) try {
        const grant = await coGmGrant(owner, member);
        if (!grant)
            return json({ error: coGmGone }, 404);
        const known = request.headers.get("If-None-Match")?.replace(/^W\//, "").replace(/"/g, "");
        if (known && known === await workspaceTag(grant.owner))
            return new Response(null, { status: 304, headers: { "Cache-Control": "private, no-store" } });
        const scoped = await coGmWorkspace(grant);
        if (!scoped)
            return json({ error: coGmGone }, 404);
        return json({ ...scoped, member: { ownerName: grant.ownerName, role: grant.role, campaignId: grant.campaignId } });
    }
    catch {
        return json({ error: "Could not open this campaign." }, 500);
    }
    try {
        // The app asks every few seconds whether anything changed (an AI connection, another tab): answer that cheaply.
        const known = request.headers.get("If-None-Match")?.replace(/^W\//, "").replace(/"/g, "");
        if (known && known === await workspaceTag(owner))
            return new Response(null, { status: 304, headers: { "Cache-Control": "private, no-store" } });
        return json(await readWorkspace(owner));
    }
    catch {
        return json({ error: "Could not read the workspace. Your existing data has not been changed." }, 500);
    }
}
export async function PUT(request: Request) {
    const owner = await ownerFrom(request);
    if (!owner)
        return json({ error: "Sign in to save your worlds." }, 401);
    if (!sameOrigin(request))
        return json({ error: "A same-origin request is required." }, 403);
    if (new URL(request.url).searchParams.has("member"))
        return json({ error: coGmReadOnly }, 403);
    try {
        const text = await request.text();
        if (text.length > 2100000)
            return json({ error: "Workspace is too large." }, 413);
        const body = z.object({ data: workspaceSchema, revision: z.number().int().nonnegative() }).parse(JSON.parse(text));
        const saved = await saveWorkspace(owner, body.data, body.revision);
        if (saved === null)
            return json({ error: "This workspace changed somewhere else. Export your unsaved draft, then reload before continuing." }, 409);
        return json(saved);
    }
    catch (error) {
        return json({ error: error instanceof z.ZodError ? error.issues[0]?.message : "Could not save. Keep this tab open and export a backup of your draft." }, 400);
    }
}
