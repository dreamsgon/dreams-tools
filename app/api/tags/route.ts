import { getAppUser } from "@/lib/app-user";
import { getBucket } from "@/lib/storage";
import { failure, privateHeaders } from "@/lib/server";
import { campaignSession, readBoth } from "@/lib/campaigns-server";
import { tagActionSchema } from "@/lib/tags";
import { describeTagged, tagAction, tagsWithImport } from "@/lib/tags-server";
export const dynamic = "force-dynamic";

// Tags shared by Maptable and the Encyclopedia. See lib/tags.ts.
async function session(request?: Request) {
  const user = await getAppUser();
  if (!user) throw new Error("Unauthorized");
  if (request) { const origin = request.headers.get("origin"); if (origin && origin !== new URL(request.url).origin) throw new Error("Forbidden"); }
  return campaignSession(getBucket(), user.userId);
}

/** The tags. With ?items=1, also the names and links of everything tagged, across both tools. */
export async function GET(request: Request) {
  try {
    const s = await session();
    const withItems = new URL(request.url).searchParams.get("items") === "1";
    const both = withItems ? await readBoth(s) : null;
    const library = await tagsWithImport(s.bucket, s.owner, async () => both?.book.data ?? (await s.book.read(s.owner)).data);
    return Response.json(both ? { library, items: describeTagged(library, both.map?.workspace ?? null, both.book.data) } : { library }, { headers: privateHeaders });
  } catch (e) { return failure(e); }
}

export async function POST(request: Request) {
  try {
    const s = await session(request);
    const text = await request.text();
    if (text.length > 10_000) throw new Error("Request is too large.");
    const action = tagActionSchema.safeParse(JSON.parse(text));
    if (!action.success) throw new Error("That tag change was not understood.");
    return Response.json({ library: await tagAction(s.bucket, s.owner, action.data) }, { headers: privateHeaders });
  } catch (e) { return failure(e); }
}
