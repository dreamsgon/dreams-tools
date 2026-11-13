import {readTransfer} from "@/lib/transfers";
import {loadWorkspace} from "@/lib/workspace-storage";
import { context, failure } from "@/lib/server";
import { shareMap } from "@/lib/discord/map-posts";
// Shares a map picture from Maptable to the campaign's channel for that kind of map.
export async function POST(request: Request) {
  try {
    const { bucket, prefix } = await context(request);
    const data = await request.formData();
    const saved = await loadWorkspace(bucket, prefix);
    if (!saved) throw new Error("Save this scene in a campaign before sending to Discord.");
    const stagedId = data.get("transferId");
    const transfer = stagedId ? await readTransfer(bucket, prefix, "discord", stagedId) : null;
    const file = transfer ? { type: transfer.type, bytes: new Uint8Array(transfer.bytes) } : data.get("file");
    let upload: { type: string; bytes: Uint8Array };
    if (file instanceof File) upload = { type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) };
    else if (file && typeof file === "object" && "bytes" in file) upload = file;
    else throw new Error("Export must be a WebP, PNG or JPG under 9 MB. Try a smaller export.");
    await shareMap({ bucket, prefix, workspace: saved.workspace }, { sceneId: data.get("sceneId"), campaignId: data.get("campaignId"), route: data.get("route"), caption: data.get("caption"), file: upload });
    if (transfer) await bucket.delete(transfer.key).catch(() => {});
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
