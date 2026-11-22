/*
 * AI connections: named keys for the hosted MCP server, one or more per Encyclopedia campaign.
 * A key reaches that campaign and the Maptable campaign it is paired with, at one level.
 * Only a hash of each key is stored. The key is shown once, inside the connector URL.
 */
import type { S3Bucket } from "../storage.ts";
import { encyclopediaPrefix, hashToken } from "../encyclopedia/store.ts";
import { levels, type Level } from "./tools.ts";
import { cleanPerms, fillPerms, fromLevel, isMode, levelFor, modeOf, presets, type Perms } from "./permissions.ts";
import { cleanBaseUrl, cleanLimit, cleanModel, isProvider, providerOf, thisMonth, type ProviderId } from "../ai/providers.ts";
import { cleanApiKey, unlock } from "../ai/secret.ts";

/**
 * A connection made with the GM's own AI API key: RPG Tools calls the AI itself, from the AI panel.
 * The key itself is never saved here: it lives only in the browsers the GM pasted it into (lib/ai/device-keys.ts) and
 * comes with each request that uses it. `last4` is shown so the GM can tell keys apart; `used` counts tokens in `month`
 * (YYYY-MM). `key` is only in connections saved before keys moved to devices: the GM's next visit takes it out
 * (claimStoredKeys), and no AI request ever reads it.
 */
export type ApiSettings = { provider: ProviderId; baseUrl?: string; model: string; key?: string; last4: string; limit: number | null; month: string; used: number };
/**
 * `perms` is what the GM chose action by action; older connections only have `level`. An API connection has no rpg_ key, so
 * `hash` is empty. `chatDefault` marks the API connection the AI panel asks first in a new chat (else the first one).
 */
export type Connection = { id: string; name: string; level: Level; perms?: Perms; hash: string; createdAt: string; lastUsedAt?: string; api?: ApiSettings; chatDefault?: true };
export type PublicApi = Omit<ApiSettings, "key" | "month">;
export type PublicConnection = Omit<Connection, "hash" | "api"> & { perms: Perms; mode: ReturnType<typeof modeOf>; api?: PublicApi };
/** One request with an API-key connection: which one, and its key from the asking browser (used for the request, never saved). */
export type KeyUse = { connectionId: string; apiKey: string };
export type KeyGrant = { owner: string; campaignId: string; connectionId: string | null; level: Level; perms?: Perms; legacy?: "encyclopedia" | "maptable" };

export const permsOf = (c: Pick<Connection, "level" | "perms">): Perms => c.perms ? fillPerms(c.perms) : fromLevel(c.level);
/** "helper", "gm" or "read" (what the dialog offers), or an older level name. */
function chosen(v: unknown): { level: Level; perms?: Perms } {
  if (isLevel(v)) return { level: v }; // "read" is both: the same actions either way.
  if (isMode(v)) return { level: levelFor(presets[v]), perms: presets[v] };
  throw Error("Choose Help me run the game, Run the game or Read only.");
}

export const MAX_CONNECTIONS = 10;
export const KEY = /^rpg_([a-f0-9]{64})$/;
const listPath = (owner: string, campaignId: string) => encyclopediaPrefix(owner) + `ai-connections/${encodeURIComponent(campaignId)}.json`;
const keyPath = (hash: string) => `mcp-keys/${hash}.json`;

export const isLevel = (v: unknown): v is Level => typeof v === "string" && (levels as string[]).includes(v);
export function cleanName(v: unknown) {
  if (typeof v !== "string") throw Error("Give the connection a name.");
  const name = v.replace(/\s+/g, " ").trim().slice(0, 60);
  if (!name) throw Error("Give the connection a name.");
  return name;
}
export const usedNow = (a: ApiSettings, now = new Date()) => a.month === thisMonth(now) ? a.used : 0;
export const publicApi = (a: ApiSettings, now = new Date()): PublicApi => ({ provider: a.provider, ...(a.baseUrl ? { baseUrl: a.baseUrl } : {}), model: a.model, last4: a.last4, limit: a.limit, used: usedNow(a, now) });
export const publicConnection = (c: Connection): PublicConnection => ({ id: c.id, name: c.name, level: c.level, perms: permsOf(c), mode: modeOf(permsOf(c)), createdAt: c.createdAt, ...(c.lastUsedAt ? { lastUsedAt: c.lastUsedAt } : {}), ...(c.api ? { api: publicApi(c.api) } : {}), ...(c.chatDefault ? { chatDefault: true as const } : {}) });

/** The API-key connections the AI panel can chat with, the default first (else in the order they were added). */
export function chatConnections(list: Connection[]) {
  const api = list.filter(c => c.api), first = api.find(c => c.chatDefault) ?? api[0];
  return first ? [first, ...api.filter(c => c !== first)] : [];
}

/** Makes one API-key connection the AI that new chats ask first, for the whole campaign on every device. */
export async function setChatDefault(bucket: S3Bucket, owner: string, campaignId: string, id: unknown) {
  const list = await listConnections(bucket, owner, campaignId), c = list.find(x => x.id === id);
  if (!c?.api) throw Error("That AI connection was removed.");
  await writeConnections(bucket, owner, campaignId, list.map(x => { const { chatDefault: _was, ...rest } = x; return x === c ? { ...rest, chatDefault: true as const } : rest; }));
  return c.name;
}

export async function listConnections(bucket: S3Bucket, owner: string, campaignId: string): Promise<Connection[]> {
  const object = await bucket.get(listPath(owner, campaignId));
  if (!object) return [];
  const saved = await object.json<{ connections?: Connection[] }>();
  return Array.isArray(saved.connections) ? saved.connections.filter(c => c && typeof c.id === "string" && isLevel(c.level)) : [];
}
/** Every write leaves out any saved API key, so a key saved before keys moved to devices goes with the first change. */
const withoutKey = (c: Connection): Connection => { if (!c.api?.key) return c; const { key: _gone, ...api } = c.api; return { ...c, api }; };
async function writeConnections(bucket: S3Bucket, owner: string, campaignId: string, connections: Connection[]) {
  await bucket.put(listPath(owner, campaignId), JSON.stringify({ connections: connections.map(withoutKey) }), { httpMetadata: { contentType: "application/json" } });
}

/**
 * Takes out the API keys that older versions saved on the server, and hands them to the GM's browser to keep there.
 * Keys that can't be opened any more are dropped too; the GM pastes those again. After this the campaign's
 * connections hold no keys at all.
 */
export async function claimStoredKeys(bucket: S3Bucket, owner: string, campaignId: string): Promise<{ id: string; key: string }[]> {
  const list = await listConnections(bucket, owner, campaignId);
  if (!list.some(c => c.api?.key)) return [];
  const moved = list.flatMap(c => {
    if (!c.api?.key) return [];
    try { return [{ id: c.id, key: unlock(c.api.key) }]; } catch { return []; }
  });
  await writeConnections(bucket, owner, campaignId, list);
  return moved;
}

/** The last four characters of a key, as the browser sends them (the key itself stays on the device). */
export function cleanLast4(v: unknown) {
  if (typeof v !== "string" || !/^[\x21-\x7e]{1,4}$/.test(v)) throw Error("Paste the API key.");
  return v;
}

/**
 * Where one request goes: the connection's provider, address and model, with the key the asking browser sent. The key is
 * used for this request only and never saved.
 */
export function targetFor(c: Connection, apiKey: unknown) {
  if (!c.api) throw Error("That AI connection was removed.");
  if (typeof apiKey !== "string" || !apiKey) throw Error(`This device doesn't have the key for ${c.name}. Paste it in Connect an AI › Edit ${c.name}, and it stays on this device.`);
  return { provider: c.api.provider, baseUrl: c.api.baseUrl, key: cleanApiKey(apiKey), model: c.api.model };
}

/** Someone's own AI, kept on their device and sent with one request (a player's forum help): checked, used once, never saved. */
export function ownTarget(v: unknown) {
  const o = v && typeof v === "object" ? v as Record<string, unknown> : {};
  if (!isProvider(o.provider)) throw Error("Choose your AI's provider again in Account settings › AI on this device.");
  return { provider: o.provider, ...(o.provider === "other" ? { baseUrl: cleanBaseUrl(o.baseUrl) } : {}), key: cleanApiKey(o.apiKey), model: cleanModel(o.model), name: providerOf(o.provider).ai };
}

export async function createConnection(bucket: S3Bucket, owner: string, campaignId: string, name: unknown, how: unknown, now = new Date()) {
  const { level, perms } = chosen(how);
  const label = cleanName(name), list = await listConnections(bucket, owner, campaignId);
  if (list.length >= MAX_CONNECTIONS) throw Error(`A campaign can have ${MAX_CONNECTIONS} AI connections. Revoke one first.`);
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
  const hash = await hashToken(token), connection: Connection = { id: crypto.randomUUID(), name: label, level, ...(perms ? { perms } : {}), hash, createdAt: now.toISOString() };
  await bucket.put(keyPath(hash), JSON.stringify({ owner, campaignId, connectionId: connection.id }), { httpMetadata: { contentType: "application/json" } });
  await writeConnections(bucket, owner, campaignId, [...list, connection]);
  return { key: `rpg_${token}`, connection: publicConnection(connection) };
}

/**
 * Checks what the GM typed for an API connection. The key stays in the GM's browser: only its last four characters
 * come here (or, from tests and older callers, the key, of which only the last four are kept).
 */
export function cleanApi(input: { provider: unknown; baseUrl?: unknown; model: unknown; limit?: unknown; last4?: unknown; apiKey?: unknown }, now = new Date()): ApiSettings {
  if (!isProvider(input.provider)) throw Error("Choose a provider.");
  const last4 = input.apiKey !== undefined ? cleanApiKey(input.apiKey).slice(-4) : cleanLast4(input.last4);
  return {
    provider: input.provider, ...(input.provider === "other" ? { baseUrl: cleanBaseUrl(input.baseUrl) } : {}),
    model: cleanModel(input.model), last4, limit: cleanLimit(input.limit), month: thisMonth(now), used: 0,
  };
}

/** A connection that uses the GM's own API key. It has no rpg_ key, so nothing can reach it from outside. */
export async function createApiConnection(bucket: S3Bucket, owner: string, campaignId: string, name: unknown, how: unknown, api: ApiSettings, now = new Date()) {
  const { level, perms } = chosen(how);
  const label = name === undefined || name === "" ? providerOf(api.provider).ai : cleanName(name), list = await listConnections(bucket, owner, campaignId);
  if (list.length >= MAX_CONNECTIONS) throw Error(`A campaign can have ${MAX_CONNECTIONS} AI connections. Remove one first.`);
  const connection: Connection = { id: crypto.randomUUID(), name: label, level, ...(perms ? { perms } : {}), hash: "", createdAt: now.toISOString(), api };
  await writeConnections(bucket, owner, campaignId, [...list, connection]);
  return publicConnection(connection);
}

/** Changes the model or monthly limit of an API connection, or notes a new key's last four characters (the key stays on the device). */
export async function updateApi(bucket: S3Bucket, owner: string, campaignId: string, id: unknown, changes: { model?: unknown; limit?: unknown; apiKey?: unknown; last4?: unknown; baseUrl?: unknown }) {
  const list = await listConnections(bucket, owner, campaignId), c = list.find(x => x.id === id);
  if (!c?.api) throw Error("That connection was already removed.");
  const api = { ...c.api };
  if (changes.model !== undefined) api.model = cleanModel(changes.model);
  if (changes.limit !== undefined) api.limit = cleanLimit(changes.limit);
  if (changes.baseUrl !== undefined && api.provider === "other") api.baseUrl = cleanBaseUrl(changes.baseUrl);
  if (changes.apiKey !== undefined) api.last4 = cleanApiKey(changes.apiKey).slice(-4);
  else if (changes.last4 !== undefined) api.last4 = cleanLast4(changes.last4);
  const next = { ...c, api };
  await writeConnections(bucket, owner, campaignId, list.map(x => x === c ? next : x));
  return publicConnection(next);
}

/** Counts tokens against this month's limit. Returns the connection as it is now. */
export async function addUsage(bucket: S3Bucket, owner: string, campaignId: string, id: string, tokens: number, now = new Date()) {
  const list = await listConnections(bucket, owner, campaignId), c = list.find(x => x.id === id);
  if (!c?.api) return null;
  const month = thisMonth(now), api = { ...c.api, month, used: usedNow(c.api, now) + Math.max(0, Math.round(tokens)) };
  const next = { ...c, api, lastUsedAt: now.toISOString() };
  await writeConnections(bucket, owner, campaignId, list.map(x => x === c ? next : x));
  return next;
}

/** True when the connection has used up this month's tokens. */
export const overLimit = (a: ApiSettings, now = new Date()) => a.limit !== null && usedNow(a, now) >= a.limit;

export async function updateConnection(bucket: S3Bucket, owner: string, campaignId: string, id: unknown, changes: { level?: unknown; name?: unknown; perms?: unknown }) {
  const list = await listConnections(bucket, owner, campaignId), at = list.findIndex(c => c.id === id);
  if (at < 0) throw Error("That connection was already revoked.");
  const next = { ...list[at] };
  if (changes.level !== undefined) { const c = chosen(changes.level); next.level = c.level; if (c.perms) next.perms = c.perms; else delete next.perms; }
  if (changes.perms !== undefined) { next.perms = cleanPerms(changes.perms); next.level = levelFor(next.perms); }
  if (changes.name !== undefined) next.name = cleanName(changes.name);
  await writeConnections(bucket, owner, campaignId, list.map((c, i) => i === at ? next : c));
  return publicConnection(next);
}

/**
 * A new link for an app connection: a fresh key replaces the old one, which stops working at once. Its name, mode and
 * history stay. For a link that was lost, pasted somewhere it shouldn't be, or set up wrong in the AI app.
 */
export async function newKey(bucket: S3Bucket, owner: string, campaignId: string, id: unknown) {
  const list = await listConnections(bucket, owner, campaignId), c = list.find(x => x.id === id);
  if (!c) throw Error("That connection was already revoked.");
  if (c.api) throw Error("This connection uses your own API key, so it has no link.");
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
  const hash = await hashToken(token), next: Connection = { ...c, hash };
  delete next.lastUsedAt;
  await bucket.put(keyPath(hash), JSON.stringify({ owner, campaignId, connectionId: c.id }), { httpMetadata: { contentType: "application/json" } });
  await writeConnections(bucket, owner, campaignId, list.map(x => x === c ? next : x));
  if (c.hash) await bucket.delete(keyPath(c.hash)).catch(() => {});
  return { key: `rpg_${token}`, connection: publicConnection(next) };
}

/** What a connection's key would be granted, for checking it from the GM's side without the key itself. */
export async function grantOf(bucket: S3Bucket, owner: string, campaignId: string, id: unknown): Promise<KeyGrant> {
  const c = (await listConnections(bucket, owner, campaignId)).find(x => x.id === id);
  if (!c) throw Error("That connection was already revoked.");
  return { owner, campaignId, connectionId: c.id, level: c.level, ...(c.perms ? { perms: c.perms } : {}) };
}

export async function revokeConnection(bucket: S3Bucket, owner: string, campaignId: string, id: unknown) {
  const list = await listConnections(bucket, owner, campaignId), gone = list.find(c => c.id === id);
  if (!gone) return false;
  await writeConnections(bucket, owner, campaignId, list.filter(c => c !== gone));
  if (gone.hash) await bucket.delete(keyPath(gone.hash)).catch(() => {});
  return true;
}

/** Checks a new-style key. The connection must still be listed with the same hash, so revoking takes effect at once. */
export async function grantFor(bucket: S3Bucket, key: string, now = new Date()): Promise<KeyGrant | null> {
  const token = KEY.exec(key)?.[1];
  if (!token) return null;
  const hash = await hashToken(token), object = await bucket.get(keyPath(hash));
  if (!object) return null;
  const ref = await object.json<{ owner: string; campaignId: string; connectionId: string }>();
  const list = await listConnections(bucket, ref.owner, ref.campaignId), c = list.find(x => x.id === ref.connectionId);
  if (!c || c.hash !== hash) return null;
  // "Last used" is a hint for the panel, so it is written at most every ten minutes and never fails a call.
  if (!c.lastUsedAt || now.getTime() - Date.parse(c.lastUsedAt) > 10 * 60_000)
    await writeConnections(bucket, ref.owner, ref.campaignId, list.map(x => x === c ? { ...x, lastUsedAt: now.toISOString() } : x)).catch(() => {});
  return { owner: ref.owner, campaignId: ref.campaignId, connectionId: c.id, level: c.level, ...(c.perms ? { perms: c.perms } : {}) };
}
