import { foundryManifest, foundryZip } from "@/lib/bridge/foundry-module";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ file: string }> };
/** This site's address as the browser (or Foundry) asked for it: the forwarded host on Vercel, the Host header otherwise. */
function originOf(request: Request) {
  const url = new URL(request.url), host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host).split(",")[0].trim();
  const proto = (request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")).split(",")[0].trim();
  return /^[a-z0-9.-]+(?::\d+)?$/i.test(host) && /^https?$/.test(proto) ? `${proto}://${host}` : url.origin;
}
// The RPG Tools Bridge module for Foundry VTT. Public: it holds no campaign data, only the module's own files.
export async function GET(request: Request, { params }: Params) {
  const { file } = await params, origin = originOf(request);
  const headers = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" };
  if (file === "module.json") return Response.json(await foundryManifest(origin), { headers });
  if (file === "rpg-tools-bridge.zip") return new Response(Buffer.from(await foundryZip(origin)), { headers: { ...headers, "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="rpg-tools-bridge.zip"' } });
  return Response.json({ error: "Not found" }, { status: 404, headers });
}
