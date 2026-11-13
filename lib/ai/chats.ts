/*
 * Saved AI chats: every conversation in the AI panel is kept with its campaign, so the GM can come back
 * to it on any device, rename or delete it, and export it as Markdown, a session page or a Discord recap.
 * One small index per campaign lists the newest chats; older chats move to a second list instead of being
 * deleted. Each chat is its own file holding its latest turns; older turns move to numbered part files, so
 * nothing the GM said is ever dropped while each save stays small. Server only.
 */
import type { S3Bucket } from "../storage.ts";
import { encyclopediaPrefix } from "../encyclopedia/store.ts";
import type { Step } from "./chat.ts";

import { chatTitle, type ChatMeta, type SavedChat, type SavedTurn } from "./chat-text.ts";
export * from "./chat-text.ts";

/** CHAT_LIMIT chats stay in the quick index; TURN_LIMIT turns stay in the chat file, the rest move to parts of PART_SIZE. */
export const CHAT_LIMIT = 200, TURN_LIMIT = 400, PART_SIZE = 200, TITLE_MAX = 80;

const dir = (owner: string, campaignId: string) => encyclopediaPrefix(owner) + `ai-chats/${encodeURIComponent(campaignId)}/`;
const indexPath = (owner: string, campaignId: string) => dir(owner, campaignId) + "index.json";
const olderPath = (owner: string, campaignId: string) => dir(owner, campaignId) + "older.json";
const chatPath = (owner: string, campaignId: string, id: string) => dir(owner, campaignId) + `${encodeURIComponent(id)}.json`;
const partPath = (owner: string, campaignId: string, id: string, n: number) => dir(owner, campaignId) + `${encodeURIComponent(id)}.part-${n}.json`;
export const isChatId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9-]{8,64}$/.test(v);
const json = { httpMetadata: { contentType: "application/json" } };

export function cleanTitle(v: unknown) {
  if (typeof v !== "string" || !v.trim()) throw Error("Give the chat a name.");
  return v.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
}

async function readList(bucket: S3Bucket, path: string) {
  const object = await bucket.get(path);
  if (!object) return { chats: [] as ChatMeta[], etag: null as string | null };
  const saved = await object.json<{ chats?: ChatMeta[] }>();
  return { chats: Array.isArray(saved.chats) ? saved.chats : [], etag: object.etag };
}
const ifSame = (etag: string | null) => ({ onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: "*" }, ...json });
const newest = (chats: ChatMeta[]) => chats.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

/** Changes the older-chats list with a compare-and-swap. Chats still in the index are left out of it. */
async function updateOlder(bucket: S3Bucket, owner: string, campaignId: string, edit: (chats: ChatMeta[]) => ChatMeta[]) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { chats, etag } = await readList(bucket, olderPath(owner, campaignId));
    const next = edit(chats);
    if (next.length === chats.length && next.every((c, i) => c === chats[i])) return;
    if (await bucket.put(olderPath(owner, campaignId), JSON.stringify({ chats: newest(next) }), ifSame(etag))) return;
  }
  throw Error("Your saved chats are busy. Try again.");
}
/**
 * Changes the index with a compare-and-swap. Chats pushed past the limit move to the older-chats list first,
 * so a chat is never lost, even if the index save has to be retried.
 */
async function updateIndex(bucket: S3Bucket, owner: string, campaignId: string, edit: (chats: ChatMeta[]) => ChatMeta[]) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { chats, etag } = await readList(bucket, indexPath(owner, campaignId));
    const next = newest(edit(chats));
    const kept = next.slice(0, CHAT_LIMIT), moved = next.slice(CHAT_LIMIT), keptIds = new Set(kept.map(c => c.id));
    if (moved.length) {
      const movedIds = new Set(moved.map(c => c.id));
      await updateOlder(bucket, owner, campaignId, older => [...moved, ...older.filter(c => !movedIds.has(c.id) && !keptIds.has(c.id))]);
    }
    if (await bucket.put(indexPath(owner, campaignId), JSON.stringify({ chats: kept }), ifSame(etag))) return kept;
  }
  throw Error("Your saved chats are busy. Try again.");
}

/** Every saved chat for the campaign, newest first: the index, then the older chats. */
export async function listChats(bucket: S3Bucket, owner: string, campaignId: string) {
  const [index, older] = await Promise.all([readList(bucket, indexPath(owner, campaignId)), readList(bucket, olderPath(owner, campaignId))]);
  const ids = new Set(index.chats.map(c => c.id));
  return [...index.chats, ...newest(older.chats.filter(c => !ids.has(c.id)))];
}

/**
 * A saved chat. By default only its latest turns (what the AI panel shows); `earlier` counts the turns kept in
 * its parts. `full` reads the parts too and returns every turn, oldest first, for exports.
 */
export async function readChat(bucket: S3Bucket, owner: string, campaignId: string, id: unknown, opts: { full?: boolean } = {}): Promise<SavedChat> {
  if (!isChatId(id)) throw Error("That chat is gone.");
  const object = await bucket.get(chatPath(owner, campaignId, id));
  if (!object) throw Error("That chat is gone.");
  const chat = await object.json<SavedChat>();
  if (!opts.full || !chat.parts) return chat;
  const parts = await Promise.all(Array.from({ length: chat.parts }, async (_, i) => {
    const part = await bucket.get(partPath(owner, campaignId, id, i + 1));
    return part ? (await part.json<{ turns?: SavedTurn[] }>()).turns ?? [] : [];
  }));
  return { ...chat, turns: [...parts.flat(), ...chat.turns], earlier: 0 };
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
  let turns = [...(chat?.turns ?? []), asked, answered], parts = chat?.parts ?? 0, earlier = chat?.earlier ?? 0;
  const id = chat?.id ?? (input.newId ?? (() => crypto.randomUUID()))();
  // A long chat moves its oldest turns to the next part file before the chat file is shortened.
  while (turns.length > TURN_LIMIT) {
    const part = turns.slice(0, PART_SIZE);
    await bucket.put(partPath(owner, campaignId, id, parts + 1), JSON.stringify({ turns: part }), json);
    parts++; earlier += part.length; turns = turns.slice(PART_SIZE);
  }
  const meta: ChatMeta = {
    id, title: chat?.title ?? chatTitle(input.question),
    connectionId: input.connectionId, connectionName: input.connectionName, ...(input.model ? { model: input.model } : {}),
    ...(input.scene ? { scene: input.scene.slice(0, 120) } : chat?.scene ? { scene: chat.scene } : {}),
    count: earlier + turns.length, createdAt: chat?.createdAt ?? now, updatedAt: now,
  };
  await bucket.put(chatPath(owner, campaignId, meta.id), JSON.stringify({ ...meta, ...(parts ? { parts, earlier } : {}), turns }), json);
  await updateIndex(bucket, owner, campaignId, chats => [meta, ...chats.filter(c => c.id !== meta.id)]);
  return meta;
}

export async function renameChat(bucket: S3Bucket, owner: string, campaignId: string, id: unknown, title: unknown) {
  const name = cleanTitle(title), chat = await readChat(bucket, owner, campaignId, id);
  await bucket.put(chatPath(owner, campaignId, chat.id), JSON.stringify({ ...chat, title: name }), json);
  const named = (chats: ChatMeta[]) => chats.map(c => c.id === chat.id ? { ...c, title: name } : c);
  await updateIndex(bucket, owner, campaignId, named);
  await updateOlder(bucket, owner, campaignId, named);
}

export async function deleteChat(bucket: S3Bucket, owner: string, campaignId: string, id: unknown) {
  if (!isChatId(id)) throw Error("That chat is gone.");
  const object = await bucket.get(chatPath(owner, campaignId, id));
  const parts = object ? (await object.json<SavedChat>()).parts ?? 0 : 0;
  await updateIndex(bucket, owner, campaignId, chats => chats.filter(c => c.id !== id));
  await updateOlder(bucket, owner, campaignId, chats => chats.filter(c => c.id !== id));
  await Promise.all([chatPath(owner, campaignId, id), ...Array.from({ length: parts }, (_, i) => partPath(owner, campaignId, id, i + 1))].map(k => bucket.delete(k).catch(() => {})));
}
