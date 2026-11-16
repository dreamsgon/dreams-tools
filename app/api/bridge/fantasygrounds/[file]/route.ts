import { FG_EXTENSION, fantasyGroundsExtension, fantasyGroundsPing } from "@/lib/bridge/fantasy-grounds";
import { originOf } from "@/lib/bridge/origin";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ file: string }> };
/*
 * Public files for Fantasy Grounds, holding no campaign data: the RPG Tools extension made for this site, and the
 * answer /rpgtools test reads to check that Fantasy Grounds can reach this site.
 */
export async function GET(request: Request, { params }: Params) {
  const { file } = await params, headers = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" };
  if (file === FG_EXTENSION) return new Response(Buffer.from(await fantasyGroundsExtension(originOf(request))), { headers: { ...headers, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${FG_EXTENSION}"` } });
  if (file === "ping") return Response.json(fantasyGroundsPing(new URL(request.url)), { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  return Response.json({ error: "Not found" }, { status: 404, headers });
}
