import { context, failure, privateHeaders } from "@/lib/server";
import { loadWorkspace } from "@/lib/workspace-storage";
import { collectionPath } from "@/lib/model";
export const dynamic = "force-dynamic";
// Read-only list of the signed-in user's own Maptable scenes, so an article can link to one. Nothing is written.
export async function GET() {
    try {
        const { bucket, prefix } = await context();
        const stored = await loadWorkspace(bucket, prefix);
        const scenes = (stored?.workspace.scenes ?? []).map(s => ({ id: s.id, name: s.name, mapType: s.mapType, path: s.containerId ? collectionPath(stored!.workspace.collections, s.containerId) : "" }));
        return Response.json({ scenes }, { headers: privateHeaders });
    }
    catch (e) { return failure(e); }
}
