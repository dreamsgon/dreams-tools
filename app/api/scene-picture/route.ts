import { readPictureRequest } from "@/lib/mcp/scene-picture";
import { renderScenePicture } from "@/lib/mcp/scene-render";
export const dynamic = "force-dynamic";
// view_scene's picture. Only requests this server signed in the last minute are served; this is the one function that bundles sharp for scenes.
export async function POST(request: Request) {
  const r = readPictureRequest(await request.text(), request.headers.get("x-scene-signature"));
  if (!r) return new Response("Not found", { status: 404 });
  try {
    return Response.json(await renderScenePicture(r), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "The scene picture couldn't be drawn." }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
