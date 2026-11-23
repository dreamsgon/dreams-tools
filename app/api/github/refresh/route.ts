import { context, failure, privateHeaders } from "@/lib/server";
import { appConfig, exchange } from "@/lib/github-app";

/** Renews a "Sign in with GitHub" key that ran out: { refresh } in, { token, refresh, expires } out. Nothing is stored. */
export async function POST(request: Request) {
  try {
    await context(request);
    const cfg = appConfig();
    if (!cfg) return Response.json({ error: "Sign in with GitHub isn't set up on this site." }, { status: 503, headers: privateHeaders });
    const body = await request.json().catch(() => null) as { refresh?: unknown } | null;
    const refresh = typeof body?.refresh === "string" && /^[\x21-\x7e]{8,400}$/.test(body.refresh) ? body.refresh : null;
    if (!refresh) return Response.json({ error: "Sign in with GitHub again." }, { status: 400, headers: privateHeaders });
    return Response.json(await exchange(cfg, { refresh }, (u, i) => fetch(u, i)), { headers: privateHeaders });
  } catch (e) { return failure(e); }
}
