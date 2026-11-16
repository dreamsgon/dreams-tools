import { foundryManifest, foundryZip } from "@/lib/bridge/foundry-module";
import { originOf } from "@/lib/bridge/origin";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ file: string }> };
// The RPG Tools Bridge module for Foundry VTT. Public: it holds no campaign data, only the module's own files.
export async function GET(request: Request, { params }: Params) {
  const { file } = await params, origin = originOf(request);
  const headers = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" };
  if (file === "module.json") return Response.json(await foundryManifest(origin), { headers });
  if (file === "rpg-tools-bridge.zip") return new Response(Buffer.from(await foundryZip(origin)), { headers: { ...headers, "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="rpg-tools-bridge.zip"' } });
  return Response.json({ error: "Not found" }, { status: 404, headers });
}
