/*
 * The AI panel's chat for a connection made with the GM's own API key: loads the campaign as that
 * connection may see it, gives the AI the same tools (and the same Do it / Ask me / Off choices) as
 * the hosted MCP server, and counts the tokens against the monthly limit.
 */
import type { S3Bucket } from "../storage.ts";
import { addUsage, listConnections, overLimit, publicApi, targetFor, type KeyUse } from "../mcp/connections.ts";
import { loadContext } from "../mcp/load.ts";
import { callTool, listTools, serverInstructions } from "../mcp/tools.ts";
import { ProviderError, runChat, type ChatResult, type ChatTurn, type ToolOutcome } from "./chat.ts";
import { cleanAttachments, namesOf, SEND_BUDGET, sizeOf } from "./attachments.ts";
import { chatLines } from "../encyclopedia/ai-styles.ts";
import { CONTEXT_TURNS, saveExchange } from "./chats.ts";
import { cleanModel } from "./providers.ts";

const MAX_TEXT = 8000;

/**
 * The conversation from the browser: user and assistant lines only, newest last, kept short. A user line can carry
 * attached files (`files`), and then needs no text; all the files together stay within SEND_BUDGET.
 */
export function cleanHistory(v: unknown): ChatTurn[] {
  if (!Array.isArray(v)) throw Error("Send the conversation.");
  let budget = SEND_BUDGET;
  const turns = v.slice(-CONTEXT_TURNS).map((t): ChatTurn => {
    const role = (t as ChatTurn)?.role, text = (t as ChatTurn)?.text;
    const files = role === "user" ? cleanAttachments((t as { files?: unknown })?.files) : [];
    if ((role !== "user" && role !== "assistant") || typeof text !== "string" || (!text.trim() && !files.length)) throw Error("Each message needs a role and some text.");
    for (const f of files) budget -= sizeOf(f);
    if (budget < 0) throw Error("The attached files are too big to send together. Attach fewer or smaller ones.");
    return { role, text: text.slice(0, MAX_TEXT), ...(files.length ? { files } : {}) };
  });
  while (turns.length && turns[0]!.role !== "user") turns.shift();
  if (!turns.length || turns[turns.length - 1]!.role !== "user") throw Error("Ask something first.");
  return turns;
}

/**
 * One turn of the AI panel's chat. The question and answer are saved to chat `chatId` (a new chat when it has none).
 * `opts.model` asks with another of the connection's provider's models, for this turn only; `opts.folder` is the folder a
 * new chat starts in.
 */
export async function chatTurn(bucket: S3Bucket, owner: string, campaignId: string, use: KeyUse, history: ChatTurn[], scene?: string, fetchImpl: typeof fetch = fetch, chatId?: unknown, opts: { model?: unknown; folder?: unknown } = {}) {
  const c = (await listConnections(bucket, owner, campaignId)).find(x => x.id === use.connectionId);
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
    [`You are ${c.name}, talking with the GM in the AI panel inside RPG Tools.`, ...chatLines(ctx.campaign.aiWriting?.chat)].join(" "),
    "Look things up with the tools instead of guessing. When something waits for the GM's OK, say so in a few words: the GM approves it right under your reply.",
    ...(scene ? [`The GM has the Maptable scene "${scene.slice(0, 120)}" open.`] : []),
  ].join("\n\n");
  const target = targetFor(c, use.apiKey), model = opts.model === undefined || opts.model === "" ? target.model : cleanModel(opts.model);
  const asked = history[history.length - 1]!, withFiles = history.some(h => h.files?.length);
  let result: ChatResult;
  try { result = await runChat({ ...target, model }, system, history, tools, run, fetchImpl); }
  catch (e) {
    // A model that only reads text refuses pictures and files with a 400 or similar.
    if (withFiles && e instanceof ProviderError && /\((400|415|422)\)|image|vision|multimodal|file|document|pdf/i.test(e.message)) throw new ProviderError(`${e.message} ${model} may not read pictures or files: pick a model that does, such as a recent Claude, GPT or Gemini model.`);
    throw e;
  }
  const after = await addUsage(bucket, owner, campaignId, c.id, result.tokens);
  const reply = result.reply || "(No answer.)";
  const chat = await saveExchange(bucket, owner, campaignId, { id: chatId, connectionId: c.id, connectionName: c.name, model, scene, folder: opts.folder, question: asked.text, files: namesOf(asked.files), answer: reply, steps: result.steps });
  return { ...result, api: after?.api ? publicApi(after.api) : undefined, chat };
}
