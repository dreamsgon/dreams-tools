import { readFile } from "node:fs/promises";
import path from "node:path";
import { DICE_LINK_FOLDER, diceLinkZip } from "@/lib/bridge/dice-link";
import { originOf } from "@/lib/bridge/origin";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ file: string }> };
const ROLL20_SCRIPT = "rpg-tools-roll20.js";
/*
 * Public files for Roll20, holding no campaign data: the RPG Tools Mod script to paste into a game's Mod (API)
 * Scripts, and the RPG Tools Dice Link browser extension, made for this site.
 */
export async function GET(request: Request, { params }: Params) {
  const { file } = await params, headers = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" };
  if (file === ROLL20_SCRIPT) {
    const text = await readFile(path.join(process.cwd(), "integrations", "roll20", ROLL20_SCRIPT), "utf8");
    return new Response(text, { headers: { ...headers, "Content-Type": "text/javascript; charset=utf-8", "X-Content-Type-Options": "nosniff" } });
  }
  if (file === `${DICE_LINK_FOLDER}.zip`) return new Response(Buffer.from(await diceLinkZip(originOf(request))), { headers: { ...headers, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${DICE_LINK_FOLDER}.zip"` } });
  return Response.json({ error: "Not found" }, { status: 404, headers });
}
