/*
 * AI API keys live only in the browser they were pasted into. RPG Tools' server never saves them: each request that uses
 * an AI sends the key along, and the server uses it for that request and forgets it. Connections themselves (name, model,
 * limit, what the AI may do) still sync through the server; the key does not, so a GM pastes it once on each device.
 *
 * Two kinds of key are kept here: the key for each of a GM's API-key connections, by connection id, and "your own AI",
 * which anyone can set in Account settings for the forum's AI help. Signing out of this browser forgets both.
 * Browser only.
 */
import type { ProviderId } from "./providers.ts";

/** Someone's own AI on this device: used for the forum's Catch me up and Check my post. */
export type OwnAi = { provider: ProviderId; baseUrl?: string; model: string; apiKey: string };
type Saved = { keys: Record<string, string>; own?: OwnAi };

const STORE = "rpg-tools:ai-keys", EVENT = "rpg-tools:ai-keys";

function read(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "null") as Partial<Saved> | null;
    const keys = v?.keys && typeof v.keys === "object" ? Object.fromEntries(Object.entries(v.keys).filter(([k, x]) => typeof k === "string" && typeof x === "string")) : {};
    const own = v?.own && typeof v.own.apiKey === "string" && typeof v.own.model === "string" && typeof v.own.provider === "string" ? v.own : undefined;
    return { keys, ...(own ? { own } : {}) };
  } catch { return { keys: {} }; }
}
function write(s: Saved) {
  try {
    if (!Object.keys(s.keys).length && !s.own) localStorage.removeItem(STORE);
    else localStorage.setItem(STORE, JSON.stringify(s));
  } catch { /* Private windows and blocked storage: the key works until the page closes. */ }
  try { window.dispatchEvent(new Event(EVENT)); } catch { /* Not in a browser. */ }
}

/** The key this browser holds for a GM's API-key connection, if any. */
export const deviceKey = (connectionId: string): string | null => read().keys[connectionId] ?? null;
export function saveDeviceKey(connectionId: string, key: string) {
  const s = read();
  write({ ...s, keys: { ...s.keys, [connectionId]: key.trim() } });
}
export function forgetDeviceKey(connectionId: string) {
  const s = read();
  if (!(connectionId in s.keys)) return;
  const { [connectionId]: _gone, ...keys } = s.keys;
  write({ ...s, keys });
}

/** How many connection keys this browser holds. */
export const deviceKeyCount = () => Object.keys(read().keys).length;
export const ownAi = (): OwnAi | null => read().own ?? null;
export function saveOwnAi(own: OwnAi) { write({ ...read(), own: { ...own, apiKey: own.apiKey.trim() } }); }
export function forgetOwnAi() { const { keys } = read(); write({ keys }); }

/** Everything this browser holds: every connection's key and your own AI. Signing out calls this. */
export function forgetDeviceAi() { write({ keys: {} }); }

/** Calls `on` whenever this browser's AI keys change, here or in another tab. Returns the unsubscribe. */
export function onDeviceAi(on: () => void) {
  const storage = (e: StorageEvent) => { if (e.key === STORE || e.key === null) on(); };
  window.addEventListener(EVENT, on); window.addEventListener("storage", storage);
  return () => { window.removeEventListener(EVENT, on); window.removeEventListener("storage", storage); };
}

/**
 * The body fields a request needs to use a connection with this browser's key. With no key here the key is empty, and
 * the server answers that this device needs the key, and where to paste it.
 */
export const keyFields = (connectionId: string) => ({ connectionId, apiKey: deviceKey(connectionId) ?? "" });

/**
 * The campaign's AI connections, from the server. Any key an older version saved on the server comes back once (and is
 * deleted there), and is kept in this browser from then on.
 */
export async function fetchConnections<T>(campaignId: string): Promise<T[]> {
  const r = await fetch(`/api/encyclopedia/ai-connections?campaignId=${encodeURIComponent(campaignId)}`, { cache: "no-store" });
  const body = await r.json().catch(() => ({})) as { connections?: T[]; moved?: { id: string; key: string }[]; error?: string };
  if (!r.ok) throw Error(body.error ?? "Could not load the AI connections.");
  keepMoved(body.moved);
  return body.connections ?? [];
}
/** Keeps keys the server handed back from older versions (see fetchConnections). */
export function keepMoved(moved: { id: string; key: string }[] | undefined) {
  if (!Array.isArray(moved) || !moved.length) return;
  const s = read();
  write({ ...s, keys: { ...s.keys, ...Object.fromEntries(moved.filter(m => typeof m?.id === "string" && typeof m.key === "string").map(m => [m.id, m.key])) } });
}
