import { getAppUser } from "@/lib/app-user";
import { getBucket } from "@/lib/storage";
import { MemberStore } from "@/lib/members-server";
export const dynamic = "force-dynamic";

// The bell in the site header: who asked to join or joined your campaigns.
const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  const user = await getAppUser();
  if (!user) return Response.json({ items: [], unread: 0 }, { headers });
  try { return Response.json(await new MemberStore(getBucket()).notifications(user.userId), { headers }); }
  catch { return Response.json({ error: "Could not load notifications." }, { status: 500, headers }); }
}
export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401, headers });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Same-origin request required" }, { status: 403, headers });
  try { await new MemberStore(getBucket()).markRead(user.userId); return Response.json({ ok: true }, { headers }); }
  catch { return Response.json({ error: "Could not mark them read." }, { status: 500, headers }); }
}
