/*
 * GitHub keys live only in this browser's localStorage. They are never put in the workspace.
 *  - One key per repository (the older layout, still read).
 *  - "Your GitHub key": one key for every campaign, saved the first time a pasted key works. A key made for all repositories,
 *    or for several, then connects the next campaign without pasting again.
 *  - "Sign in with GitHub": the RPG Tools GitHub App's user key and its refresh key, with when it runs out.
 * Storage can be missing or blocked, so every call is guarded.
 */
const PREFIX = "rpg-tools:github-key:";
const keyName = (repo: string) => `${PREFIX}${repo.trim().toLowerCase()}`;
const ACCOUNT = `${PREFIX}*`, SIGNIN = "rpg-tools:github-signin";
const store = (): Storage | null => { try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; } };
const put = (name: string, value: string) => { try { const s = store(); if (!s) return false; s.setItem(name, value); return s.getItem(name) === value; } catch { return false; } };
const get = (name: string) => { try { return store()?.getItem(name) || null; } catch { return null; } };
const drop = (name: string) => { try { store()?.removeItem(name); } catch { /* Nothing to forget. */ } };

/** A repository connected through "Sign in with GitHub" points at the sign-in instead of a copy, since that key is renewed. */
const VIA_SIGNIN = "@signin";
export function readKey(repo: string): string | null { const v = get(keyName(repo)); return v === VIA_SIGNIN ? readSignIn()?.token ?? null : v; }
/** True when the key was kept. False when this browser would not store it (the check still worked, but the key is not remembered). */
export function saveKey(repo: string, token: string): boolean { return put(keyName(repo), token === readSignIn()?.token ? VIA_SIGNIN : token); }
export function forgetKey(repo: string): void { drop(keyName(repo)); }

/** The key saved for every campaign, if any. */
export const readAccountKey = () => get(ACCOUNT);
export const saveAccountKey = (token: string) => put(ACCOUNT, token);
export const forgetAccountKey = () => drop(ACCOUNT);

export type SignIn = { token: string; refresh?: string; expires?: number; login?: string };
export function readSignIn(): SignIn | null {
  try { const v = JSON.parse(get(SIGNIN) ?? "null"); return v && typeof v.token === "string" ? v : null; } catch { return null; }
}
export const saveSignIn = (s: SignIn) => put(SIGNIN, JSON.stringify(s));
export const forgetSignIn = () => drop(SIGNIN);
export const SIGNIN_KEY = SIGNIN;

/** Every saved key worth trying for a repository, best first: its own, the sign-in, the account key, then keys saved for other repositories. */
export function keysFor(repo: string): string[] {
  const out = [readKey(repo), readSignIn()?.token ?? null, readAccountKey()];
  try {
    const s = store();
    for (let i = 0; s && i < s.length; i++) { const name = s.key(i); if (name?.startsWith(PREFIX) && name !== ACCOUNT && get(name) !== VIA_SIGNIN) out.push(get(name)); }
  } catch { /* Only the keys above. */ }
  return [...new Set(out.filter((k): k is string => !!k))];
}
/** Is any key saved on this device? */
export const hasAnyKey = () => keysFor("").length > 0;
