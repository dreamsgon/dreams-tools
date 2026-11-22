import { z } from "zod";
import { getBucket } from "@/lib/storage";
import { EncyclopediaStore } from "@/lib/encyclopedia/store";
import { librarySchema } from "@/lib/encyclopedia/tables";
import { json, ownerFrom, sameOrigin, transferPrefix } from "@/lib/encyclopedia/workspace-server";
import { storedJson, workspaceBody } from "@/lib/transfers";
export const dynamic = "force-dynamic";
/** The signed-in person's random tables. Private: never shown to players or other accounts. Over 3 MB, both ways go through storage (lib/transfers.ts). */
export async function GET(request: Request) {
  const owner = await ownerFrom(request);
  if (!owner) return json({ error: "Sign in to open your tables." }, 401);
  try { const bucket = getBucket(), { data, revision } = await new EncyclopediaStore(bucket).readTables(owner); return await storedJson(bucket, transferPrefix(owner), { data, revision }); }
  catch { return json({ error: "Could not read your tables. Nothing has been changed." }, 500); }
}
export async function PUT(request: Request) {
  const owner = await ownerFrom(request);
  if (!owner) return json({ error: "Sign in to save your tables." }, 401);
  if (!sameOrigin(request)) return json({ error: "A same-origin request is required." }, 403);
  try {
    const bucket = getBucket();
    const body = z.object({ data: librarySchema, revision: z.number().int().nonnegative() }).parse(await workspaceBody(request, bucket, transferPrefix(owner)));
    const revision = await new EncyclopediaStore(bucket).saveTables(owner, body.data, body.revision);
    if (revision === null) return json({ error: "Your tables changed in another tab. Reload to see the latest before editing." }, 409);
    return json({ revision });
  } catch (error) {
    return json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Could not save your tables." }, 400);
  }
}
