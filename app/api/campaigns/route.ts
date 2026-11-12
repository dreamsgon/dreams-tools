import { getAppUser } from "@/lib/app-user";
import { getBucket } from "@/lib/storage";
import { failure, privateHeaders } from "@/lib/server";
import { backupFile, campaignAction, campaignSession, readBoth, summaryOf, type CampaignAction } from "@/lib/campaigns-server";
export const dynamic = "force-dynamic";

// One campaign list across Maptable and the Encyclopedia. See lib/campaigns-server.ts.
async function session(request?: Request) {
  const user = await getAppUser();
  if (!user) throw new Error("Unauthorized");
  if (request) { const origin = request.headers.get("origin"); if (origin && origin !== new URL(request.url).origin) throw new Error("Forbidden"); }
  return campaignSession(getBucket(), user.userId);
}

export async function GET(request: Request) {
  try {
    const both = await readBoth(await session());
    if (new URL(request.url).searchParams.get("download") === "backup")
      return new Response(backupFile(both), { headers: { ...privateHeaders, "Content-Type": "application/json", "Content-Disposition": `attachment; filename="rpg-tools-backup-${new Date().toISOString().slice(0, 10)}.json"` } });
    return Response.json(summaryOf(both), { headers: privateHeaders });
  } catch (e) { return failure(e); }
}

export async function POST(request: Request) {
  try {
    const s = await session(request);
    const text = await request.text();
    if (text.length > 100_000) throw new Error("Request is too large.");
    return Response.json(await campaignAction(s, JSON.parse(text) as CampaignAction), { headers: privateHeaders });
  } catch (e) { return failure(e); }
}
