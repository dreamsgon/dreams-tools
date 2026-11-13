/*
 * AI connections: named keys for the hosted MCP server, one or more per Encyclopedia campaign.
 * A key reaches that campaign and the Maptable campaign it is paired with, at one level.
 * Only a hash of each key is stored. The key is shown once, inside the connector URL.
 */
import type { S3Bucket } from "../storage.ts";
import { encyclopediaPrefix, hashToken } from "../encyclopedia/store.ts";
import { levels, type Level } from "./tools.ts";
import { cleanPerms, fromLevel, isMode, levelFor, modeOf, presets, type Perms } from "./permissions.ts";

/** `perms` is what the GM chose action by action; older connections only have `level`. */
export type Connection = { id: string; name: string; level: Level; perms?: Perms; hash: string; createdAt: string; lastUsedAt?: string };
export type PublicConnection = Omit<Connection, "hash"> & { perms: Perms; mode: ReturnType<typeof modeOf> };
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
export const publicConnection = (c: Connection): PublicConnection => ({ id: c.id, name: c.name, level: c.level, perms: permsOf(c), mode: modeOf(permsOf(c)), createdAt: c.createdAt, ...(c.lastUsedAt ? { lastUsedAt: c.lastUsedAt } : {}) });

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
  await bucket.delete(keyPath(gone.hash)).catch(() => {});
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
