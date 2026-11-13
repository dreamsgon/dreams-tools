/*
 * AI connections: named keys for the hosted MCP server, one or more per Encyclopedia campaign.
 * A key reaches that campaign and the Maptable campaign it is paired with, at one level.
 * Only a hash of each key is stored. The key is shown once, inside the connector URL.
 */
import type { S3Bucket } from "../storage.ts";
import { encyclopediaPrefix, hashToken } from "../encyclopedia/store.ts";
import { levels, type Level } from "./tools.ts";
import { cleanPerms, fromLevel, isMode, levelFor, modeOf, presets, type Perms } from "./permissions.ts";
import { cleanBaseUrl, cleanLimit, cleanModel, isProvider, providerOf, thisMonth, type ProviderId } from "../ai/providers.ts";
import { cleanApiKey, lock } from "../ai/secret.ts";

/**
 * A connection made with the GM's own AI API key: RPG Tools calls the AI itself, from the AI panel.
 * `key` is the API key locked with lib/ai/secret.ts; `used` counts tokens in `month` (YYYY-MM).
 */
export type ApiSettings = { provider: ProviderId; baseUrl?: string; model: string; key: string; last4: string; limit: number | null; month: string; used: number };
/** `perms` is what the GM chose action by action; older connections only have `level`. An API connection has no rpg_ key, so `hash` is empty. */
export type Connection = { id: string; name: string; level: Level; perms?: Perms; hash: string; createdAt: string; lastUsedAt?: string; api?: ApiSettings };
export type PublicApi = Omit<ApiSettings, "key" | "month">;
export type PublicConnection = Omit<Connection, "hash" | "api"> & { perms: Perms; mode: ReturnType<typeof modeOf>; api?: PublicApi };
export type KeyGrant = { owner: string; campaignId: string; connectionId: string | null; level: Level; perms?: Perms; legacy?: "encyclopedia" | "maptable" };

export const permsOf = (c: Pick<Connection, "level" | "perms">): Perms => c.perms ?? fromLevel(c.level);
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
const usedNow = (a: ApiSettings, now = new Date()) => a.month === thisMonth(now) ? a.used : 0;
export const publicApi = (a: ApiSettings, now = new Date()): PublicApi => ({ provider: a.provider, ...(a.baseUrl ? { baseUrl: a.baseUrl } : {}), model: a.model, last4: a.last4, limit: a.limit, used: usedNow(a, now) });
export const publicConnection = (c: Connection): PublicConnection => ({ id: c.id, name: c.name, level: c.level, perms: permsOf(c), mode: modeOf(permsOf(c)), createdAt: c.createdAt, ...(c.lastUsedAt ? { lastUsedAt: c.lastUsedAt } : {}), ...(c.api ? { api: publicApi(c.api) } : {}) });

export async function listConnections(bucket: S3Bucket, owner: string, campaignId: string): Promise<Connection[]> {
  const object = await bucket.get(listPath(owner, campaignId));
  if (!object) return [];
  const saved = await object.json<{ connections?: Connection[] }>();
  return Array.isArray(saved.connections) ? saved.connections.filter(c => c && typeof c.id === "string" && isLevel(c.level)) : [];
}
async function writeConnections(bucket: S3Bucket, owner: string, campaignId: string, connections: Connection[]) {
  await bucket.put(listPath(owner, campaignId), JSON.stringify({ connections }), { httpMetadata: { contentType: "application/json" } });
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

/** Checks what the GM typed for an API connection. The key is checked against the provider by the caller first. */
export function cleanApi(input: { provider: unknown; baseUrl?: unknown; model: unknown; limit?: unknown; apiKey: unknown }, now = new Date()): ApiSettings {
  if (!isProvider(input.provider)) throw Error("Choose a provider.");
  const apiKey = cleanApiKey(input.apiKey);
  return {
    provider: input.provider, ...(input.provider === "other" ? { baseUrl: cleanBaseUrl(input.baseUrl) } : {}),
    model: cleanModel(input.model), key: lock(apiKey), last4: apiKey.slice(-4), limit: cleanLimit(input.limit), month: thisMonth(now), used: 0,
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

/** Changes the model or monthly limit, or replaces the key, of an API connection. */
export async function updateApi(bucket: S3Bucket, owner: string, campaignId: string, id: unknown, changes: { model?: unknown; limit?: unknown; apiKey?: unknown; baseUrl?: unknown }) {
  const list = await listConnections(bucket, owner, campaignId), c = list.find(x => x.id === id);
  if (!c?.api) throw Error("That connection was already removed.");
  const api = { ...c.api };
  if (changes.model !== undefined) api.model = cleanModel(changes.model);
  if (changes.limit !== undefined) api.limit = cleanLimit(changes.limit);
  if (changes.baseUrl !== undefined && api.provider === "other") api.baseUrl = cleanBaseUrl(changes.baseUrl);
  if (changes.apiKey !== undefined) { const key = cleanApiKey(changes.apiKey); api.key = lock(key); api.last4 = key.slice(-4); }
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
