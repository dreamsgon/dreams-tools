import { cookies } from "next/headers";
import { appConfig, exchange, finishPage, STATE_COOKIE } from "@/lib/github-app";
import { SIGNIN_KEY } from "@/lib/github-key";

/**
 * Where GitHub sends the sign-in window back. With a code (after "Authorize"), swaps it for the person's key and gives it to the
 * page, which keeps it in this browser. Without one (after adding the app to repositories), just says so. Nothing is stored here.
 */
export async function GET(request: Request) {
  const url = new URL(request.url), headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  const page = (result: Parameters<typeof finishPage>[0], status = 200) => new Response(finishPage(result, SIGNIN_KEY), { status, headers });
  const code = url.searchParams.get("code"), state = url.searchParams.get("state");
  if (!code) return page(url.searchParams.get("setup_action") || url.searchParams.get("installation_id") ? { ok: true, installed: true } : { ok: false, error: url.searchParams.get("error") === "access_denied" ? "GitHub sign-in was cancelled." : "GitHub did not finish signing in. Try again." });
  const cfg = appConfig();
  if (!cfg) return page({ ok: false, error: "Sign in with GitHub isn't set up on this site yet." }, 503);
  const jar = await cookies(), expected = jar.get(STATE_COOKIE)?.value;
  jar.delete({ name: STATE_COOKIE, path: "/api/github" });
  if (!expected || !state || expected !== state) return page({ ok: false, error: "This sign-in link is old or came from somewhere else. Start again from RPG Tools." }, 400);
  try {
    const tokens = await exchange(cfg, { code, redirectUri: `${url.origin}/api/github/callback` }, (u, i) => fetch(u, i));
    let login: string | undefined;
    try {
      const me = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${tokens.token}`, Accept: "application/vnd.github+json" }, cache: "no-store" });
      const data = await me.json().catch(() => null) as { login?: unknown } | null;
      if (typeof data?.login === "string" && /^[A-Za-z0-9-]{1,39}$/.test(data.login)) login = data.login;
    } catch { /* The name is only shown, so go on without it. */ }
    return page({ ok: true, tokens, login });
  } catch (e) { return page({ ok: false, error: e instanceof Error ? e.message : "GitHub did not sign you in." }, 400); }
}
