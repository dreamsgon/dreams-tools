import { context, failure, privateHeaders } from '@/lib/server';
import { archiveMap, bringBackMap } from '@/lib/scene-archive-server';
export const dynamic = 'force-dynamic';
/**
 * POST {sceneId, archive, revision}: archives one of the signed-in GM's Maptable maps (archive: true) or brings one
 * back (false). Only the owner: a co-GM's copy never lists archived maps. 409 when the maps were saved elsewhere since.
 */
export async function POST(request: Request) {
  try {
    const { bucket, prefix } = await context(request);
    const body = await request.json().catch(() => null) as { sceneId?: unknown; archive?: unknown; revision?: unknown } | null;
    if (!body || typeof body.sceneId !== 'string' || !body.sceneId || body.sceneId.length > 120 || typeof body.archive !== 'boolean' || (body.revision !== null && typeof body.revision !== 'string')) throw new Error('Invalid archive request.');
    const done = body.archive ? await archiveMap(bucket, prefix, body.revision, body.sceneId) : await bringBackMap(bucket, prefix, body.revision, body.sceneId);
    if (!done) return Response.json({ error: 'Your maps changed somewhere else. Reload, then try again.' }, { status: 409, headers: privateHeaders });
    return Response.json(done, { headers: privateHeaders });
  } catch (e) { return failure(e); }
}
