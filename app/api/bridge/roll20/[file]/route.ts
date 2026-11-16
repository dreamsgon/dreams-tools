import { readFile } from "node:fs/promises";
import path from "node:path";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ file: string }> };
const ROLL20_SCRIPT = "rpg-tools-roll20.js";
// The RPG Tools Mod script for Roll20, to paste into a game's Mod (API) Scripts. Public: it holds no campaign data.
export async function GET(_request: Request, { params }: Params) {
  const { file } = await params, headers = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" };
  if (file !== ROLL20_SCRIPT) return Response.json({ error: "Not found" }, { status: 404, headers });
  const text = await readFile(path.join(process.cwd(), "integrations", "roll20", ROLL20_SCRIPT), "utf8");
  return new Response(text, { headers: { ...headers, "Content-Type": "text/javascript; charset=utf-8", "X-Content-Type-Options": "nosniff" } });
}
