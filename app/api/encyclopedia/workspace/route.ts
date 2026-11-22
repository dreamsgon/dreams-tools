import { z } from "zod";
import { workspaceSchema } from "@/lib/encyclopedia/world-model";
import { json, ownerFrom, readWorkspace, readWorkspaceScope, sameOrigin, saveWorkspace, saveWorkspacePatch, saveWorkspaceScopedPatch, transferPrefix, workspaceTag } from "@/lib/encyclopedia/workspace-server";
import { DamagedWikiError } from "@/lib/encyclopedia/wiki-parts";
import { getBucket } from "@/lib/storage";
import { storedJson, workspaceBody } from "@/lib/transfers";
import { coGmGone, coGmGrant, coGmReadOnly, coGmSave, coGmWorkspace } from "@/lib/encyclopedia/member-workspace-server";
import { CoGmEditError } from "@/lib/encyclopedia/co-gm-edit";
export const dynamic = "force-dynamic";
const partSchema = z.object({ world: z.unknown().optional(), campaign: z.unknown().optional(), entries: z.array(z.unknown()) }).passthrough();
const patchBody = z.object({ revision: z.number().int().nonnegative(), scope: z.array(z.string().max(200)).max(1000).optional(), patch: z.object({
    layout: z.object({ worlds: z.array(z.string()), campaigns: z.array(z.string()), runs: z.array(z.tuple([z.string(), z.number().int().positive()])) }),
    parts: z.record(z.string(), partSchema.nullable()),
}) }) as unknown as z.ZodType<{ revision: number; scope?: string[]; patch: import("@/lib/encyclopedia/wiki-parts").WikiPatch }>;
/** ?scope: the Wiki app opening one campaign (or world) at a time; ?campaign, ?world and ?entry say where, ?parts which parts exactly. */
function scopeOf(url: URL) {
    if (!url.searchParams.has("scope")) return null;
    const one = (name: string) => url.searchParams.get(name)?.slice(0, 200) || null, parts = url.searchParams.get("parts");
    return { campaignId: one("campaign"), worldId: one("world"), entryId: one("entry"), maptableId: one("maptable"), ...(parts !== null ? { keys: parts.split(",").filter(Boolean).slice(0, 1000) } : {}) };
}
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
        return json({ ...scoped, member: { ownerName: grant.ownerName, role: grant.role, campaignId: grant.campaignId, edit: grant.edit, maps: grant.maps, html: grant.html } });
    }
    catch {
        return json({ error: "Could not open this campaign." }, 500);
    }
    try {
        // The app asks every few seconds whether anything changed (an AI connection, another tab): answer that cheaply.
        const known = request.headers.get("If-None-Match")?.replace(/^W\//, "").replace(/"/g, "");
        if (known && known === await workspaceTag(owner))
            return new Response(null, { status: 304, headers: { "Cache-Control": "private, no-store" } });
        // A Wiki over 3 MB is handed over through storage (lib/transfers.ts), since a response can't carry it.
        const scope = scopeOf(new URL(request.url));
        return storedJson(getBucket(), transferPrefix(owner), scope ? await readWorkspaceScope(owner, scope) : await readWorkspace(owner));
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
    const member = new URL(request.url).searchParams.get("member");
    try {
        // A co-GM saving the campaign they were invited to: checked against the member list now, not when they opened it.
        const grant = member === null ? null : await coGmGrant(owner, member);
        if (member !== null && !grant)
            return json({ error: coGmGone }, 404);
        if (grant && !grant.edit)
            return json({ error: coGmReadOnly }, 403);
        // Over 3 MB, the browser stages the save in storage first and sends its transfer id (lib/transfers.ts).
        const raw = await workspaceBody(request, getBucket(), transferPrefix(owner));
        // The Wiki app sends only the campaigns and worlds that changed (lib/encyclopedia/wiki-parts.ts); anything else sends the whole workspace.
        const patched = !grant && raw && typeof raw === "object" && "patch" in raw ? patchBody.parse(raw) : null;
        const body = patched ? null : z.object({ data: workspaceSchema, revision: z.number().int().nonnegative() }).parse(raw);
        const saved = patched ? (patched.scope ? await saveWorkspaceScopedPatch(owner, patched.patch, patched.revision, patched.scope) : await saveWorkspacePatch(owner, patched.patch, patched.revision)) : grant ? await coGmSave(grant, body!.data, body!.revision) : await saveWorkspace(owner, body!.data, body!.revision);
        if (saved === null)
            return json({ error: "This workspace changed somewhere else. Export your unsaved draft, then reload before continuing." }, 409);
        return json(saved);
    }
    catch (error) {
        if (error instanceof CoGmEditError)
            return json({ error: error.message }, 403);
        if (error instanceof DamagedWikiError)
            return json({ error: error.message }, 422);
        if (error instanceof Error && /over the .* limit|staged transfer|Upload is missing|Invalid uploaded/.test(error.message))
            return json({ error: error.message }, 413);
        return json({ error: error instanceof z.ZodError ? error.issues[0]?.message : "Could not save. Keep this tab open and export a backup of your draft." }, 400);
    }
}
