/*
 * "Sign in with GitHub" through the RPG Tools GitHub App, so people don't have to make a key by hand.
 *
 * Off unless the server has GITHUB_APP_CLIENT_ID and GITHUB_APP_CLIENT_SECRET and the build has NEXT_PUBLIC_GITHUB_APP_SLUG
 * (setup: docs/GITHUB_APP.md). The server only swaps GitHub's one-time code (or a refresh key) for a user key with the client
 * secret and hands it straight back to the browser. It never stores or logs a key. The key then works exactly like a pasted one:
 * the browser keeps it and sends it only to api.github.com. It reaches only the repositories the person added the app to.
 *
 * Pure apart from the injected fetch, so it is tested with a fake GitHub.
 */
import type { FetchLike } from "./github-push.ts";

export type AppConfig = { clientId: string; clientSecret: string };
export function appConfig(env: Record<string, string | undefined> = process.env): AppConfig | null {
  const clientId = env.GITHUB_APP_CLIENT_ID?.trim(), clientSecret = env.GITHUB_APP_CLIENT_SECRET?.trim();
  return clientId && clientSecret && /^[\w.-]{4,100}$/.test(clientId) ? { clientId, clientSecret } : null;
}
/** The app's public name on github.com/apps/<slug>, for the "add a repository" link. Empty when sign-in is off. */
export const APP_SLUG = (process.env.NEXT_PUBLIC_GITHUB_APP_SLUG ?? "").trim();
export const appSlugOk = (slug: string) => /^[a-z0-9][a-z0-9-]{0,99}$/.test(slug);
export const installUrl = (slug: string) => `https://github.com/apps/${slug}/installations/new`;

export const STATE_COOKIE = "rpg_github_state";
export const authorizeUrl = (cfg: AppConfig, state: string, redirectUri: string) =>
  `https://github.com/login/oauth/authorize?${new URLSearchParams({ client_id: cfg.clientId, state, redirect_uri: redirectUri, allow_signup: "true" })}`;

export type Tokens = { token: string; refresh?: string; expires?: number };
/** Swaps a code or a refresh key at github.com/login/oauth/access_token. Throws a plain message (never GitHub's raw reply, never a key). */
export async function exchange(cfg: AppConfig, grant: { code: string; redirectUri: string } | { refresh: string }, fetch: FetchLike, now = Date.now()): Promise<Tokens> {
  const body = new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...("code" in grant ? { code: grant.code, redirect_uri: grant.redirectUri } : { grant_type: "refresh_token", refresh_token: grant.refresh }) });
  let data: Record<string, unknown> = {};
  try {
    const res = await fetch("https://github.com/login/oauth/access_token", { method: "POST", cache: "no-store", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
    data = await res.json().catch(() => ({}));
  } catch { throw new Error("Could not reach GitHub. Try again."); }
  const token = data.access_token;
  if (typeof token !== "string" || !/^[\x21-\x7e]{8,400}$/.test(token)) {
    throw new Error(data.error === "bad_verification_code" || data.error === "bad_refresh_token" ? "GitHub sign-in ran out. Sign in with GitHub again." : "GitHub did not sign you in. Try again.");
  }
  const refresh = typeof data.refresh_token === "string" ? data.refresh_token : undefined, secs = Number(data.expires_in);
  return { token, ...(refresh ? { refresh } : {}), ...(Number.isFinite(secs) && secs > 0 ? { expires: now + secs * 1000 } : {}) };
}

/** The little page the sign-in window ends on: it hands the key to RPG Tools in this browser and closes. */
export function finishPage(result: { ok: true; tokens: Tokens; login?: string } | { ok: false; error: string } | { ok: true; installed: true }, storageKey: string): string {
  const payload = JSON.stringify(result).replace(/</g, "\\u003c");
  const text = !result.ok ? result.error : "installed" in result ? "RPG Tools was added on GitHub. You can close this window." : "Signed in with GitHub. You can close this window.";
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>GitHub</title>
<body style="font:16px system-ui,sans-serif;padding:24px;background:#111;color:#eee"><p id="m"></p><script>
(function(){var r=${payload},m=document.getElementById("m");m.textContent=${JSON.stringify(text).replace(/</g, "\\u003c")};
try{if(r.ok&&r.tokens){var s={token:r.tokens.token};if(r.tokens.refresh)s.refresh=r.tokens.refresh;if(r.tokens.expires)s.expires=r.tokens.expires;if(r.login)s.login=r.login;localStorage.setItem(${JSON.stringify(storageKey)},JSON.stringify(s));}}catch(e){}
try{if(window.opener&&window.opener.location.origin===location.origin){window.opener.postMessage({type:"rpg-tools-github",ok:r.ok,installed:!!r.installed,error:r.ok?undefined:r.error},location.origin);setTimeout(function(){window.close();},300);}}catch(e){}
})();</script></body>`;
}
