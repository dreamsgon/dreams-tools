/*
 * The GitHub key (a fine-grained token) lives only in this browser's localStorage, one per repository.
 * It is never sent to RPG Tools' server and never put in the workspace. Storage can be missing or blocked, so every call is guarded.
 */
const keyName = (repo: string) => `rpg-tools:github-key:${repo.trim().toLowerCase()}`;
const store = (): Storage | null => { try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; } };

export function readKey(repo: string): string | null { try { return store()?.getItem(keyName(repo)) || null; } catch { return null; } }
/** True when the key was kept. False when this browser would not store it (the check still worked, but the key is not remembered). */
export function saveKey(repo: string, token: string): boolean { try { const s = store(); if (!s) return false; s.setItem(keyName(repo), token); return s.getItem(keyName(repo)) === token; } catch { return false; } }
export function forgetKey(repo: string): void { try { store()?.removeItem(keyName(repo)); } catch { /* Nothing to forget. */ } }
