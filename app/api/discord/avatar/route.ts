import { readAvatarLink } from "@/lib/discord/avatar";
import { avatarPng } from "@/lib/discord/avatar-image";
export const dynamic = "force-dynamic";
// The roll-card picture Discord fetches. Only links this server signed are served; images are immutable by id.
export async function GET(request: Request) {
  const source = readAvatarLink(new URL(request.url).searchParams.get("a"));
  if (!source) return new Response("Not found", { status: 404 });
  try {
    const png = await avatarPng(source);
    if (!png) return new Response("Not found", { status: 404 });
    return new Response(png as BodyInit, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch { return new Response("Not found", { status: 404 }); }
}
