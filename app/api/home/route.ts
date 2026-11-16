import { getAppUser } from "@/lib/app-user";
import { getBucket } from "@/lib/storage";
import { failure, privateHeaders } from "@/lib/server";
import { campaignSession } from "@/lib/campaigns-server";
import { homeData } from "@/lib/home-server";
import { forHomePage, homeAction, readHome } from "@/lib/home-store";
import type { HomeAction } from "@/lib/home-layout";
export const dynamic = "force-dynamic";

// The signed-in home page: its saved layout and the data its sections show. See lib/home-server.ts.
async function user(request?: Request) {
  const u = await getAppUser();
  if (!u) throw new Error("Unauthorized");
  if (request) { const origin = request.headers.get("origin"); if (origin && origin !== new URL(request.url).origin) throw new Error("Forbidden"); }
  return u;
}

/** ?layout=1 returns only the layout (cheap, for pin buttons); ?all=1 computes every section's data (for Customize previews). */
export async function GET(request: Request) {
  try {
    const u = await user(), params = new URL(request.url).searchParams, bucket = getBucket();
    const { layout } = await readHome(bucket, u.userId);
    if (params.get("layout")) return Response.json({ layout: forHomePage(layout) }, { headers: privateHeaders });
    const data = await homeData(campaignSession(bucket, u.userId), layout, params.get("all") === "1");
    return Response.json({ layout: forHomePage(layout), data }, { headers: privateHeaders });
  } catch (e) { return failure(e); }
}

export async function POST(request: Request) {
  try {
    const u = await user(request);
    const text = await request.text();
    if (text.length > 150_000) throw new Error("Request is too large.");
    const layout = await homeAction(getBucket(), u.userId, JSON.parse(text) as HomeAction);
    return Response.json({ layout: forHomePage(layout) }, { headers: privateHeaders });
  } catch (e) { return failure(e); }
}
