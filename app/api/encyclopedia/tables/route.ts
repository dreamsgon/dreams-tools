import { z } from "zod";
import { getBucket } from "@/lib/storage";
import { EncyclopediaStore } from "@/lib/encyclopedia/store";
import { librarySchema, LIBRARY_LIMIT } from "@/lib/encyclopedia/tables";
import { json, ownerFrom, sameOrigin } from "@/lib/encyclopedia/workspace-server";
export const dynamic = "force-dynamic";
/** The signed-in person's random tables. Private: never shown to players or other accounts. */
export async function GET(request: Request) {
  const owner = await ownerFrom(request);
  if (!owner) return json({ error: "Sign in to open your tables." }, 401);
  try { const { data, revision } = await new EncyclopediaStore(getBucket()).readTables(owner); return json({ data, revision }); }
  catch { return json({ error: "Could not read your tables. Nothing has been changed." }, 500); }
}
export async function PUT(request: Request) {
  const owner = await ownerFrom(request);
  if (!owner) return json({ error: "Sign in to save your tables." }, 401);
  if (!sameOrigin(request)) return json({ error: "A same-origin request is required." }, 403);
  try {
    const text = await request.text();
    if (text.length > LIBRARY_LIMIT + 100_000) return json({ error: "Your tables are too large to save." }, 413);
    const body = z.object({ data: librarySchema, revision: z.number().int().nonnegative() }).parse(JSON.parse(text));
    const revision = await new EncyclopediaStore(getBucket()).saveTables(owner, body.data, body.revision);
    if (revision === null) return json({ error: "Your tables changed in another tab. Reload to see the latest before editing." }, 409);
    return json({ revision });
  } catch (error) {
    return json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Could not save your tables." }, 400);
  }
}
