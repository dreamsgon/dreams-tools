import { cookies } from "next/headers";
import { getAppUser } from "@/lib/app-user";
import { appConfig, authorizeUrl, finishPage, STATE_COOKIE } from "@/lib/github-app";
import { SIGNIN_KEY } from "@/lib/github-key";

/** Opens GitHub's "Authorize RPG Tools" page in the sign-in window. Only for a signed-in RPG Tools account. */
export async function GET(request: Request) {
  const html = (error: string, status: number) => new Response(finishPage({ ok: false, error }, SIGNIN_KEY), { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  const cfg = appConfig();
  if (!cfg) return html("Sign in with GitHub isn't set up on this site yet.", 503);
  if (!(await getAppUser())) return html("Sign in to RPG Tools first.", 401);
  const state = crypto.randomUUID(), origin = new URL(request.url).origin;
  (await cookies()).set(STATE_COOKIE, state, { httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax", path: "/api/github", maxAge: 600 });
  return new Response(null, { status: 302, headers: { Location: authorizeUrl(cfg, state, `${origin}/api/github/callback`), "Cache-Control": "no-store" } });
}
