import { getAppUser } from "@/lib/app-user";
import { getBucket } from "@/lib/storage";
import { failure, privateHeaders } from "@/lib/server";
import { storedJson, workspaceBody } from "@/lib/transfers";
import { campaignSession, deleteCampaign, haveImages, imageUrls, importCampaign, importFiles, putImage, readFiles, startBackup } from "@/lib/campaign-backup-server";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// One campaign's backup, import and deletion. See lib/campaign-backup-server.ts for the steps.
export async function POST(request: Request) {
  try {
    const user = await getAppUser();
    if (!user) throw new Error("Unauthorized");
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new Error("Forbidden");
    const bucket = getBucket(), s = campaignSession(bucket, user.userId);
    // A large import arrives as a staged upload (lib/transfer-client.ts); everything else is small JSON.
    const body = await workspaceBody(request, bucket, s.prefix) as Record<string, unknown>;
    const key = String(body.key ?? "");
    switch (body.action) {
      case "start": return storedJson(bucket, s.prefix, await startBackup(s, bucket, key));
      case "files": return storedJson(bucket, s.prefix, await readFiles(s, bucket, key, body.paths));
      case "images": return Response.json(await imageUrls(s, bucket, body.images), { headers: privateHeaders });
      case "have": return Response.json(await haveImages(s, bucket, body.images), { headers: privateHeaders });
      case "putImage": return Response.json(await putImage(s, bucket, body), { headers: privateHeaders });
      case "import": return storedJson(bucket, s.prefix, await importCampaign(s, bucket, body.backup));
      case "importFiles": return Response.json(await importFiles(s, bucket, body.campaignId, body.files), { headers: privateHeaders });
      case "delete": return Response.json(await deleteCampaign(s, bucket, key, body.confirm), { headers: privateHeaders });
      default: throw new Error("Unknown action.");
    }
  } catch (e) { return failure(e); }
}
