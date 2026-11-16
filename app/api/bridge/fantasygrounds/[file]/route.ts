import { FG_EXTENSION, fantasyGroundsExtension } from "@/lib/bridge/fantasy-grounds";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ file: string }> };
/* The RPG Tools extension for Fantasy Grounds Unity: a public file holding no campaign data. */
export async function GET(_request: Request, { params }: Params) {
  const { file } = await params, headers = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" };
  if (file === FG_EXTENSION) return new Response(Buffer.from(await fantasyGroundsExtension()), { headers: { ...headers, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${FG_EXTENSION}"` } });
  return Response.json({ error: "Not found" }, { status: 404, headers });
}
