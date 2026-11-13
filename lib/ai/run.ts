/*
 * The AI panel's chat for a connection made with the GM's own API key: loads the campaign as that
 * connection may see it, gives the AI the same tools (and the same Do it / Ask me / Off choices) as
 * the hosted MCP server, and counts the tokens against the monthly limit.
 */
import type { S3Bucket } from "../storage.ts";
import { addUsage, listConnections, overLimit, publicApi } from "../mcp/connections.ts";
import { loadContext } from "../mcp/load.ts";
import { callTool, listTools, serverInstructions } from "../mcp/tools.ts";
import { runChat, type ChatTurn, type ToolOutcome } from "./chat.ts";
import { unlock } from "./secret.ts";
import { CONTEXT_TURNS, saveExchange } from "./chats.ts";

const MAX_TEXT = 8000;

/** The conversation from the browser: user and assistant lines only, newest last, kept short. */
export function cleanHistory(v: unknown): ChatTurn[] {
  if (!Array.isArray(v)) throw Error("Send the conversation.");
  const turns = v.slice(-CONTEXT_TURNS).map(t => {
    const role = (t as ChatTurn)?.role, text = (t as ChatTurn)?.text;
    if ((role !== "user" && role !== "assistant") || typeof text !== "string" || !text.trim()) throw Error("Each message needs a role and some text.");
    return { role, text: text.slice(0, MAX_TEXT) };
  });
  while (turns.length && turns[0]!.role !== "user") turns.shift();
  if (!turns.length || turns[turns.length - 1]!.role !== "user") throw Error("Ask something first.");
  return turns;
}

/** One turn of the AI panel's chat. The question and answer are saved to chat `chatId` (a new chat when it has none). */
export async function chatTurn(bucket: S3Bucket, owner: string, campaignId: string, connectionId: unknown, history: ChatTurn[], scene?: string, fetchImpl: typeof fetch = fetch, chatId?: unknown) {
  const c = (await listConnections(bucket, owner, campaignId)).find(x => x.id === connectionId);
  if (!c?.api) throw Error("That AI connection was removed.");
  if (overLimit(c.api)) throw Error(`${c.name} has used this month's ${c.api.limit!.toLocaleString("en-US")} tokens. Raise the limit under What it may do.`);
  const grant = { owner, campaignId, connectionId: c.id, level: c.level, ...(c.perms ? { perms: c.perms } : {}) };
  let ctx = await loadContext(bucket, grant);
  const tools = listTools(c.level, c.perms).map(t => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, readOnly: t.annotations.readOnlyHint }));
  const run = async (name: string, args: Record<string, unknown>): Promise<ToolOutcome> => {
    const out = await callTool(ctx, name, args) as { content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[]; isError: boolean };
    // After a change, read the campaign again so the next tool sees it.
    if (!out.isError && tools.find(t => t.name === name)?.readOnly === false) ctx = await loadContext(bucket, grant);
    const image = out.content.find(x => x.type === "image") as { data: string; mimeType: string } | undefined;
    return { text: out.content.flatMap(x => x.type === "text" ? [x.text] : []).join("\n"), ...(image ? { image: { data: image.data, mimeType: image.mimeType } } : {}), isError: out.isError };
  };
  const system = [
    serverInstructions(ctx),
    `You are ${c.name}, talking with the GM in the AI panel inside RPG Tools. Keep replies short and useful at the table: a few sentences, or a short list.`,
    "Look things up with the tools instead of guessing. When something waits for the GM's OK, say so in a few words: the GM approves it right under your reply.",
    ...(scene ? [`The GM has the Maptable scene "${scene.slice(0, 120)}" open.`] : []),
  ].join("\n\n");
  const result = await runChat({ provider: c.api.provider, baseUrl: c.api.baseUrl, key: unlock(c.api.key), model: c.api.model }, system, history, tools, run, fetchImpl);
  const after = await addUsage(bucket, owner, campaignId, c.id, result.tokens);
  const reply = result.reply || "(No answer.)";
  const chat = await saveExchange(bucket, owner, campaignId, { id: chatId, connectionId: c.id, connectionName: c.name, model: c.api.model, scene, question: history[history.length - 1]!.text, answer: reply, steps: result.steps });
  return { ...result, api: after?.api ? publicApi(after.api) : undefined, chat };
}
