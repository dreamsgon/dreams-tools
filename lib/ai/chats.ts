/*
 * Saved AI chats: every conversation in the AI panel is kept with its campaign, so the GM can come back
 * to it on any device, rename or delete it, and export it as Markdown, a session page or a Discord recap.
 * One small index per campaign lists the chats; each chat is its own file. Server only.
 */
import type { S3Bucket } from "../storage.ts";
import { encyclopediaPrefix } from "../encyclopedia/store.ts";
import type { Step } from "./chat.ts";

import { chatTitle, type ChatMeta, type SavedChat, type SavedTurn } from "./chat-text.ts";
export * from "./chat-text.ts";

export const CHAT_LIMIT = 200, TURN_LIMIT = 400, TITLE_MAX = 80;

const dir = (owner: string, campaignId: string) => encyclopediaPrefix(owner) + `ai-chats/${encodeURIComponent(campaignId)}/`;
const indexPath = (owner: string, campaignId: string) => dir(owner, campaignId) + "index.json";
const chatPath = (owner: string, campaignId: string, id: string) => dir(owner, campaignId) + `${encodeURIComponent(id)}.json`;
export const isChatId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9-]{8,64}$/.test(v);
const json = { httpMetadata: { contentType: "application/json" } };

export function cleanTitle(v: unknown) {
  if (typeof v !== "string" || !v.trim()) throw Error("Give the chat a name.");
  return v.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
}

async function readIndex(bucket: S3Bucket, owner: string, campaignId: string) {
  const object = await bucket.get(indexPath(owner, campaignId));
  if (!object) return { chats: [] as ChatMeta[], etag: null as string | null };
  const saved = await object.json<{ chats?: ChatMeta[] }>();
  return { chats: Array.isArray(saved.chats) ? saved.chats : [], etag: object.etag };
}
/** Changes the index with a compare-and-swap. Chats pushed past the limit are deleted. */
async function updateIndex(bucket: S3Bucket, owner: string, campaignId: string, edit: (chats: ChatMeta[]) => ChatMeta[]) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { chats, etag } = await readIndex(bucket, owner, campaignId);
    const next = edit(chats).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const kept = next.slice(0, CHAT_LIMIT), dropped = next.slice(CHAT_LIMIT);
    const saved = await bucket.put(indexPath(owner, campaignId), JSON.stringify({ chats: kept }), { onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: "*" }, ...json });
    if (saved) {
      await Promise.all(dropped.map(c => bucket.delete(chatPath(owner, campaignId, c.id)).catch(() => {})));
      return kept;
    }
  }
  throw Error("Your saved chats are busy. Try again.");
}

export const listChats = async (bucket: S3Bucket, owner: string, campaignId: string) => (await readIndex(bucket, owner, campaignId)).chats;

export async function readChat(bucket: S3Bucket, owner: string, campaignId: string, id: unknown): Promise<SavedChat> {
  if (!isChatId(id)) throw Error("That chat is gone.");
  const object = await bucket.get(chatPath(owner, campaignId, id));
  if (!object) throw Error("That chat is gone.");
  return object.json<SavedChat>();
}

/**
 * Adds the GM's question and the AI's answer to a chat, starting a new chat when `id` is missing or gone.
 * Returns the chat's summary for the list.
 */
export async function saveExchange(bucket: S3Bucket, owner: string, campaignId: string, input: {
  id?: unknown; connectionId: string; connectionName: string; model?: string; scene?: string;
  question: string; answer: string; steps: Step[]; now?: Date; newId?: () => string;
}): Promise<ChatMeta> {
  const now = (input.now ?? new Date()).toISOString();
  let chat: SavedChat | null = null;
  if (isChatId(input.id)) chat = await readChat(bucket, owner, campaignId, input.id).catch(() => null);
  const asked: SavedTurn = { role: "user", text: input.question, at: now };
  const answered: SavedTurn = { role: "assistant", text: input.answer, at: now, ...(input.steps.length ? { steps: input.steps } : {}) };
  const turns = [...(chat?.turns ?? []), asked, answered].slice(-TURN_LIMIT);
  const meta: ChatMeta = {
    id: chat?.id ?? (input.newId ?? (() => crypto.randomUUID()))(), title: chat?.title ?? chatTitle(input.question),
    connectionId: input.connectionId, connectionName: input.connectionName, ...(input.model ? { model: input.model } : {}),
    ...(input.scene ? { scene: input.scene.slice(0, 120) } : chat?.scene ? { scene: chat.scene } : {}),
    count: turns.length, createdAt: chat?.createdAt ?? now, updatedAt: now,
  };
  await bucket.put(chatPath(owner, campaignId, meta.id), JSON.stringify({ ...meta, turns }), json);
  await updateIndex(bucket, owner, campaignId, chats => [meta, ...chats.filter(c => c.id !== meta.id)]);
  return meta;
}

export async function renameChat(bucket: S3Bucket, owner: string, campaignId: string, id: unknown, title: unknown) {
  const name = cleanTitle(title), chat = await readChat(bucket, owner, campaignId, id);
  await bucket.put(chatPath(owner, campaignId, chat.id), JSON.stringify({ ...chat, title: name }), json);
  await updateIndex(bucket, owner, campaignId, chats => chats.map(c => c.id === chat.id ? { ...c, title: name } : c));
}

export async function deleteChat(bucket: S3Bucket, owner: string, campaignId: string, id: unknown) {
  if (!isChatId(id)) throw Error("That chat is gone.");
  await updateIndex(bucket, owner, campaignId, chats => chats.filter(c => c.id !== id));
  await bucket.delete(chatPath(owner, campaignId, id)).catch(() => {});
}
