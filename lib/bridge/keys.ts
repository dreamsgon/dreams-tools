/*
 * Bridge keys: how another table (the Foundry module now, the owner's Unreal Engine VTT later) reaches one
 * Encyclopedia campaign through /api/bridge. They are separate from AI connection keys (lib/mcp/connections.ts):
 * a bridge acts for the GM's own table, never for an AI, and each kind of thing has its own direction.
 *
 * Only a hash of each key is stored. The key is shown once. Revoking takes effect at once, because every call
 * checks that the key is still listed with the same hash.
 */
import type { S3Bucket } from "../storage.ts";
import { encyclopediaPrefix, hashToken } from "../encyclopedia/store.ts";

import { allows, bridgeClients, clientNames, cleanSync, defaultSync, directions, isClient, syncInfo, syncKinds, type BridgeClient, type Direction, type Sync, type SyncKind } from "./sync.ts";
export { allows, bridgeClients, clientNames, cleanSync, defaultSync, directions, isClient, syncInfo, syncKinds, type BridgeClient, type Direction, type Sync, type SyncKind };

export type BridgeKey = { id: string; name: string; client: BridgeClient; hash: string; createdAt: string; lastUsedAt?: string; sync: Sync };
export type PublicBridgeKey = Omit<BridgeKey, "hash">;
export type BridgeGrant = { owner: string; campaignId: string; keyId: string; name: string; client: BridgeClient; sync: Sync };

export const MAX_BRIDGE_KEYS = 5;
export const BRIDGE_KEY = /^rpgb_([a-f0-9]{64})$/;
const listPath = (owner: string, campaignId: string) => encyclopediaPrefix(owner) + `bridge-keys/${encodeURIComponent(campaignId)}.json`;
const keyPath = (hash: string) => `bridge-keys/${hash}.json`;
const json = { httpMetadata: { contentType: "application/json" } };

export function cleanKeyName(v: unknown, client: BridgeClient) {
  const name = typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  return name || clientNames[client];
}
export const publicKey = (k: BridgeKey): PublicBridgeKey => ({ id: k.id, name: k.name, client: k.client, createdAt: k.createdAt, ...(k.lastUsedAt ? { lastUsedAt: k.lastUsedAt } : {}), sync: k.sync });

export async function listBridgeKeys(bucket: S3Bucket, owner: string, campaignId: string): Promise<BridgeKey[]> {
  const object = await bucket.get(listPath(owner, campaignId));
  if (!object) return [];
  const saved = await object.json<{ keys?: BridgeKey[] }>();
  return Array.isArray(saved.keys) ? saved.keys.filter(k => k && typeof k.id === "string" && typeof k.hash === "string" && isClient(k.client)).map(k => ({ ...k, sync: cleanSync(k.sync) })) : [];
}
const writeKeys = (bucket: S3Bucket, owner: string, campaignId: string, keys: BridgeKey[]) => bucket.put(listPath(owner, campaignId), JSON.stringify({ keys }), json);

export async function createBridgeKey(bucket: S3Bucket, owner: string, campaignId: string, input: { name?: unknown; client?: unknown; sync?: unknown }, now = new Date()) {
  const client = isClient(input.client) ? input.client : "other", list = await listBridgeKeys(bucket, owner, campaignId);
  if (list.length >= MAX_BRIDGE_KEYS) throw Error(`A campaign can have ${MAX_BRIDGE_KEYS} bridge keys. Revoke one first.`);
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
  const hash = await hashToken(token);
  const key: BridgeKey = { id: crypto.randomUUID(), name: cleanKeyName(input.name, client), client, hash, createdAt: now.toISOString(), sync: cleanSync(input.sync) };
  await bucket.put(keyPath(hash), JSON.stringify({ owner, campaignId, keyId: key.id }), json);
  await writeKeys(bucket, owner, campaignId, [...list, key]);
  return { key: `rpgb_${token}`, bridge: publicKey(key) };
}

export async function updateBridgeKey(bucket: S3Bucket, owner: string, campaignId: string, id: unknown, changes: { name?: unknown; sync?: unknown }) {
  const list = await listBridgeKeys(bucket, owner, campaignId), k = list.find(x => x.id === id);
  if (!k) throw Error("That bridge key was already revoked.");
  const next = { ...k, ...(changes.name !== undefined ? { name: cleanKeyName(changes.name, k.client) } : {}), ...(changes.sync !== undefined ? { sync: cleanSync(changes.sync, k.sync) } : {}) };
  await writeKeys(bucket, owner, campaignId, list.map(x => x === k ? next : x));
  return publicKey(next);
}

export async function revokeBridgeKey(bucket: S3Bucket, owner: string, campaignId: string, id: unknown) {
  const list = await listBridgeKeys(bucket, owner, campaignId), gone = list.find(k => k.id === id);
  if (!gone) return false;
  await writeKeys(bucket, owner, campaignId, list.filter(k => k !== gone));
  await bucket.delete(keyPath(gone.hash)).catch(() => {});
  return true;
}

/** What a key reaches, or null when it is wrong or revoked. "Last used" is written at most once a minute and never fails a call. */
export async function bridgeGrant(bucket: S3Bucket, key: string, now = new Date()): Promise<BridgeGrant | null> {
  const token = BRIDGE_KEY.exec(key)?.[1];
  if (!token) return null;
  const hash = await hashToken(token), object = await bucket.get(keyPath(hash));
  if (!object) return null;
  const ref = await object.json<{ owner: string; campaignId: string; keyId: string }>();
  if (typeof ref?.owner !== "string" || typeof ref.campaignId !== "string") return null;
  const list = await listBridgeKeys(bucket, ref.owner, ref.campaignId), k = list.find(x => x.id === ref.keyId);
  if (!k || k.hash !== hash) return null;
  if (!k.lastUsedAt || now.getTime() - Date.parse(k.lastUsedAt) > 60_000)
    await writeKeys(bucket, ref.owner, ref.campaignId, list.map(x => x === k ? { ...x, lastUsedAt: now.toISOString() } : x)).catch(() => {});
  return { owner: ref.owner, campaignId: ref.campaignId, keyId: k.id, name: k.name, client: k.client, sync: k.sync };
}
