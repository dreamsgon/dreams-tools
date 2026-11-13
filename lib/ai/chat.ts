/*
 * Talks to the GM's chosen AI with their own API key, from the server: lists the models a key can use,
 * and runs one turn of the AI panel's chat, calling RPG Tools' tools (the same ones the hosted MCP
 * server offers) until the AI answers. Anthropic goes through its SDK; every other provider through
 * the OpenAI-style chat API, so any compatible service works.
 */
import Anthropic from "@anthropic-ai/sdk";
import { baseUrlFor, providerOf, type ProviderId } from "./providers.ts";

export type ChatTurn = { role: "user" | "assistant"; text: string };
export type ToolDef = { name: string; title: string; description: string; inputSchema: Record<string, unknown>; readOnly: boolean };
export type ToolOutcome = { text: string; image?: { data: string; mimeType: string }; isError: boolean };
export type Step = { tool: string; title: string; ok: boolean; waiting?: string; summary?: string };
export type ChatResult = { reply: string; steps: Step[]; tokens: number; toolsOff?: boolean };
type Target = { provider: ProviderId; baseUrl?: string; key: string; model: string };
type Fetch = typeof fetch;

const MAX_STEPS = 8, RESULT_CHARS = 30_000;

export class ProviderError extends Error {}

/** What the provider's error means for the GM, without echoing anything that could hold the key. */
function explain(status: number, message: string) {
  if (status === 401 || status === 403) return "The provider refused the API key. Check it, or paste it again under Replace key.";
  if (status === 402) return "The provider says the account is out of credit.";
  if (status === 404) return `The provider doesn't know that model or address${message ? `: ${message}` : "."}`;
  if (status === 429) return "The provider says you've hit its rate or spending limit. Try again in a moment.";
  return `The provider answered with an error (${status})${message ? `: ${message}` : "."}`;
}
const clip = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 240);

async function failed(res: Response): Promise<never> {
  let message = "";
  try { const body = await res.json() as { error?: { message?: string } | string; message?: string }; message = typeof body.error === "string" ? body.error : body.error?.message ?? body.message ?? ""; } catch { /* not JSON */ }
  throw new ProviderError(explain(res.status, clip(message)));
}

function anthropicClient(t: Pick<Target, "key">, fetchImpl: Fetch) {
  return new Anthropic({ apiKey: t.key, maxRetries: 1, timeout: 55_000, fetch: fetchImpl });
}
function anthropicError(e: unknown): never {
  if (e instanceof Anthropic.APIError && typeof e.status === "number") throw new ProviderError(explain(e.status, clip(e.message)));
  if (e instanceof Anthropic.APIConnectionError) throw new ProviderError("Couldn't reach Anthropic. Try again in a moment.");
  throw e;
}

/** The models a key can use, newest first where the provider says so. Also checks the key works. */
export async function listModels(t: Omit<Target, "model">, fetchImpl: Fetch = fetch): Promise<string[]> {
  if (providerOf(t.provider).kind === "anthropic") {
    const ids: string[] = [];
    try { for await (const m of anthropicClient(t, fetchImpl).models.list({ limit: 100 })) { ids.push(m.id); if (ids.length >= 200) break; } }
    catch (e) { anthropicError(e); }
    return ids;
  }
  let res: Response;
  try { res = await fetchImpl(`${baseUrlFor(t.provider, t.baseUrl)}/models`, { headers: { Authorization: `Bearer ${t.key}` }, signal: AbortSignal.timeout(20_000), redirect: "error" }); }
  catch { throw new ProviderError("Couldn't reach the provider at that address."); }
  if (!res.ok) await failed(res);
  const body = await res.json().catch(() => null) as { data?: { id?: unknown }[] } | null;
  const ids = (body?.data ?? []).map(m => typeof m.id === "string" ? m.id.replace(/^models\//, "") : "").filter(id => id && id.length <= 120);
  return [...new Set(ids)].slice(0, 1000);
}

const resultText = (o: ToolOutcome) => o.text.length > RESULT_CHARS ? o.text.slice(0, RESULT_CHARS) + "… [cut short]" : o.text;
/** A suggestion that waits for the GM, read from the tool's reply. */
function waitingOf(o: ToolOutcome): { waiting?: string; summary?: string } {
  try { const v = JSON.parse(o.text) as { waitingForGM?: boolean; suggestion?: string; summary?: string }; return v.waitingForGM ? { waiting: v.suggestion, summary: v.summary } : {}; }
  catch { return {}; }
}

/**
 * One turn: the GM's message (the last of `history`), then tool calls until the AI answers or
 * MAX_STEPS rounds have run. `run` performs a tool exactly as the MCP server would.
 */
export async function runChat(t: Target, system: string, history: ChatTurn[], tools: ToolDef[], run: (name: string, args: Record<string, unknown>) => Promise<ToolOutcome>, fetchImpl: Fetch = fetch): Promise<ChatResult> {
  const steps: Step[] = [], title = (name: string) => tools.find(x => x.name === name)?.title ?? name;
  async function call(name: string, args: unknown): Promise<ToolOutcome> {
    const input = args && typeof args === "object" && !Array.isArray(args) ? args as Record<string, unknown> : null;
    const out = input ? await run(name, input) : { text: "The arguments weren't a JSON object.", isError: true };
    steps.push({ tool: name, title: title(name), ok: !out.isError, ...waitingOf(out) });
    return out;
  }
  return providerOf(t.provider).kind === "anthropic" ? anthropicTurn(t, system, history, tools, call, steps, fetchImpl) : openaiTurn(t, system, history, tools, call, steps, fetchImpl);
}

async function anthropicTurn(t: Target, system: string, history: ChatTurn[], tools: ToolDef[], call: (n: string, a: unknown) => Promise<ToolOutcome>, steps: Step[], fetchImpl: Fetch): Promise<ChatResult> {
  const client = anthropicClient(t, fetchImpl), messages: Anthropic.Beta.BetaMessageParam[] = history.map(h => ({ role: h.role, content: h.text }));
  const defs: Anthropic.Beta.BetaTool[] = tools.map(x => ({ name: x.name, description: x.description, input_schema: x.inputSchema as Anthropic.Beta.BetaTool.InputSchema }));
  let tokens = 0;
  for (let round = 0; round < MAX_STEPS; round++) {
    let res: Anthropic.Beta.BetaMessage;
    try {
      // If the model declines for safety reasons, Anthropic retries on its default fallback model.
      res = await client.beta.messages.create({ model: t.model, max_tokens: 16000, system, messages, ...(defs.length ? { tools: defs } : {}), betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    } catch (e) { anthropicError(e); }
    tokens += res.usage.input_tokens + res.usage.output_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0);
    const said = res.content.flatMap(b => b.type === "text" ? [b.text] : []).join("\n").trim();
    if (res.stop_reason === "refusal") return { reply: said || "The AI declined to answer that.", steps, tokens };
    const calls = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !calls.length) return { reply: said || (res.stop_reason === "max_tokens" ? "(The answer was too long and was cut off.)" : ""), steps, tokens };
    messages.push({ role: "assistant", content: res.content as Anthropic.Beta.BetaContentBlockParam[] });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const block of calls) {
      const out = await call(block.name, block.input);
      results.push({ type: "tool_result", tool_use_id: block.id, is_error: out.isError, content: [
        ...(out.image ? [{ type: "image" as const, source: { type: "base64" as const, media_type: out.image.mimeType as "image/jpeg", data: out.image.data } }] : []),
        { type: "text" as const, text: resultText(out) || "(empty)" },
      ] });
    }
    messages.push({ role: "user", content: results });
  }
  return { reply: "I stopped after several steps. Ask me to carry on if there's more to do.", steps, tokens };
}

type OaMessage = { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_calls?: OaCall[]; tool_call_id?: string };
type OaCall = { id: string; type: "function"; function: { name: string; arguments: string } };

async function openaiTurn(t: Target, system: string, history: ChatTurn[], tools: ToolDef[], call: (n: string, a: unknown) => Promise<ToolOutcome>, steps: Step[], fetchImpl: Fetch): Promise<ChatResult> {
  const url = `${baseUrlFor(t.provider, t.baseUrl)}/chat/completions`;
  const messages: OaMessage[] = [{ role: "system", content: system }, ...history.map(h => ({ role: h.role, content: h.text }))];
  const defs = tools.map(x => ({ type: "function", function: { name: x.name, description: x.description, parameters: x.inputSchema } }));
  let tokens = 0, withTools = defs.length > 0, toolsOff = false;
  for (let round = 0; round < MAX_STEPS; round++) {
    let res: Response;
    try {
      res = await fetchImpl(url, { method: "POST", headers: { Authorization: `Bearer ${t.key}`, "Content-Type": "application/json" }, redirect: "error", signal: AbortSignal.timeout(55_000),
        body: JSON.stringify({ model: t.model, messages, ...(withTools ? { tools: defs, tool_choice: "auto" } : {}) }) });
    } catch { throw new ProviderError("Couldn't reach the provider. Try again in a moment."); }
    if (!res.ok) {
      // Some models can't use tools at all: answer without them rather than failing.
      if (withTools && round === 0 && (res.status === 400 || res.status === 404 || res.status === 422)) {
        const body = await res.clone().text().catch(() => "");
        if (/tool|function/i.test(body)) { withTools = false; toolsOff = true; round--; continue; }
      }
      await failed(res);
    }
    const body = await res.json() as { choices?: { message?: { content?: string | null; tool_calls?: OaCall[] }; finish_reason?: string }[]; usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number } };
    tokens += body.usage?.total_tokens ?? (body.usage?.prompt_tokens ?? 0) + (body.usage?.completion_tokens ?? 0);
    const choice = body.choices?.[0], said = (choice?.message?.content ?? "").trim(), calls = (choice?.message?.tool_calls ?? []).filter(c => c?.function?.name);
    if (!calls.length) return { reply: said || (choice?.finish_reason === "length" ? "(The answer was too long and was cut off.)" : ""), steps, tokens, ...(toolsOff ? { toolsOff } : {}) };
    // Only what the API needs back: some providers refuse their own reasoning fields in the history.
    messages.push({ role: "assistant", content: choice?.message?.content ?? null, tool_calls: calls.map((c, i) => ({ id: c.id || `call_${round}_${i}`, type: "function", function: { name: c.function.name, arguments: c.function.arguments ?? "{}" } })) });
    for (const [i, one] of calls.entries()) {
      let args: unknown;
      try { args = JSON.parse(one.function.arguments || "{}"); } catch { args = null; }
      const out = await call(one.function.name, args);
      messages.push({ role: "tool", tool_call_id: one.id || `call_${round}_${i}`, content: (out.image ? "(A picture of the scene was made, but this provider can only take text back from tools. Use read_scene for positions.)\n" : "") + (resultText(out) || "(empty)") });
    }
  }
  return { reply: "I stopped after several steps. Ask me to carry on if there's more to do.", steps, tokens, ...(toolsOff ? { toolsOff } : {}) };
}
