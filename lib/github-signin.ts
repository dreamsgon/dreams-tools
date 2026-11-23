/* The browser side of "Sign in with GitHub" (see lib/github-app.ts): opening the window, and renewing the key before it runs out. */
import { forgetSignIn, readSignIn, saveSignIn, type SignIn } from "./github-key.ts";

export const SIGNIN_SLUG = (process.env.NEXT_PUBLIC_GITHUB_APP_SLUG ?? "").trim();
export const signInOn = () => /^[a-z0-9][a-z0-9-]{0,99}$/.test(SIGNIN_SLUG);
export const addRepoUrl = () => `https://github.com/apps/${SIGNIN_SLUG}/installations/new`;

/** The sign-in, renewed first when it runs out within two minutes. Null when there is none or it could not be renewed. */
export async function freshSignIn(now = Date.now()): Promise<SignIn | null> {
  const s = readSignIn();
  if (!s || !s.expires || s.expires - now > 120_000) return s;
  if (!s.refresh) { forgetSignIn(); return null; }
  try {
    const res = await fetch("/api/github/refresh", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh: s.refresh }) });
    const data = await res.json().catch(() => null) as { token?: unknown; refresh?: unknown; expires?: unknown } | null;
    if (!res.ok || typeof data?.token !== "string") { if (res.status === 400) forgetSignIn(); return null; }
    const next: SignIn = { ...s, token: data.token, refresh: typeof data.refresh === "string" ? data.refresh : s.refresh, expires: typeof data.expires === "number" ? data.expires : undefined };
    saveSignIn(next); return next;
  } catch { return null; }
}

/** Opens GitHub in a small window. Resolves when that window reports back (or is closed). */
export function openGithubWindow(url: string): Promise<{ ok: boolean; installed?: boolean; error?: string }> {
  return new Promise(resolve => {
    const w = window.open(url, "rpg-tools-github", "width=720,height=780");
    if (!w) { resolve({ ok: false, error: "Your browser blocked the GitHub window. Allow pop-ups for this site and try again." }); return; }
    let done = false;
    const finish = (r: { ok: boolean; installed?: boolean; error?: string }) => { if (done) return; done = true; window.removeEventListener("message", onMsg); clearInterval(timer); resolve(r); };
    const onMsg = (e: MessageEvent) => { if (e.origin === location.origin && e.data?.type === "rpg-tools-github") finish({ ok: !!e.data.ok, installed: !!e.data.installed, error: typeof e.data.error === "string" ? e.data.error : undefined }); };
    window.addEventListener("message", onMsg);
    // Closed by hand, or GitHub's own page (another origin) when adding the app: count it as back, and check again.
    const timer = setInterval(() => { if (w.closed) finish({ ok: !!readSignIn(), installed: true }); }, 500);
  });
}
