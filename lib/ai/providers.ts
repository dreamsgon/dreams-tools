/*
 * The AI services a GM can connect with their own API key. Anthropic has its own API; the rest speak the
 * OpenAI-style chat API, so "Other" covers any service or self-hosted model that does too.
 * Shared by the browser (the provider buttons) and the server (where requests go).
 */
export type ProviderId = "anthropic" | "openai" | "xai" | "deepseek" | "openrouter" | "venice" | "google" | "other";
/** `ai` names the connection when the GM doesn't. */
export type Provider = { id: ProviderId; name: string; sub: string; ai: string; kind: "anthropic" | "openai"; baseUrl?: string; keyFrom: string; suggested?: string };

export const providers: Provider[] = [
  { id: "anthropic", ai: "Claude", name: "Anthropic", sub: "Claude", kind: "anthropic", keyFrom: "console.anthropic.com › API keys", suggested: "claude-opus-5-5" },
  { id: "openai", ai: "GPT", name: "OpenAI", sub: "GPT", kind: "openai", baseUrl: "https://api.openai.com/v1", keyFrom: "platform.openai.com › API keys" },
  { id: "xai", ai: "Grok", name: "xAI", sub: "Grok", kind: "openai", baseUrl: "https://api.x.ai/v1", keyFrom: "the xAI console › API keys" },
  { id: "google", ai: "Gemini", name: "Google AI Studio", sub: "Gemini", kind: "openai", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", keyFrom: "aistudio.google.com › Get API key" },
  { id: "deepseek", ai: "DeepSeek", name: "DeepSeek", sub: "DeepSeek", kind: "openai", baseUrl: "https://api.deepseek.com/v1", keyFrom: "platform.deepseek.com › API keys" },
  { id: "openrouter", ai: "OpenRouter", name: "OpenRouter", sub: "Hundreds of models", kind: "openai", baseUrl: "https://openrouter.ai/api/v1", keyFrom: "openrouter.ai › Keys" },
  { id: "venice", ai: "Venice", name: "Venice", sub: "Private AI", kind: "openai", baseUrl: "https://api.venice.ai/api/v1", keyFrom: "venice.ai › Settings › API" },
  { id: "other", ai: "AI", name: "Other", sub: "Any OpenAI-style API", kind: "openai", keyFrom: "your service's settings" },
];

export const isProvider = (v: unknown): v is ProviderId => providers.some(p => p.id === v);
export const providerOf = (id: ProviderId) => providers.find(p => p.id === id)!;

/**
 * The address for "Other". The server sends your key there, so it must be https on a public name:
 * no passwords in the address, and no localhost or private network addresses.
 */
export function cleanBaseUrl(v: unknown): string {
  if (typeof v !== "string" || !v.trim()) throw Error("Give the address of the API, such as https://example.com/v1.");
  let url: URL;
  try { url = new URL(v.trim()); } catch { throw Error("That address isn't a web address."); }
  if (url.protocol !== "https:") throw Error("The address must start with https://.");
  if (url.username || url.password) throw Error("Leave the key out of the address: paste it in the key box.");
  if (url.search || url.hash) throw Error("Leave ?… and #… off the address.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const privateHost = host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".") && !host.includes(":")
    || /^(0|10|127)\./.test(host) || /^169\.254\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)
    || host.includes(":") && (host === "::1" || host === "::" || /^(fc|fd|fe8|fe9|fea|feb)/.test(host) || host.startsWith("::ffff:"));
  if (privateHost) throw Error("The address must be reachable on the internet: RPG Tools' server can't reach localhost or a private network.");
  const out = url.toString().replace(/\/+$/, "");
  if (out.length > 300) throw Error("That address is too long.");
  return out;
}

/** Where requests go for a provider ("Other" uses the GM's address). */
export function baseUrlFor(provider: ProviderId, custom?: string): string {
  const p = providerOf(provider);
  if (p.kind === "anthropic") return "https://api.anthropic.com";
  return p.baseUrl ?? cleanBaseUrl(custom);
}

export function cleanModel(v: unknown): string {
  if (typeof v !== "string" || !/^[\w.:/@+-]{1,120}$/.test(v.trim())) throw Error("Choose a model.");
  return v.trim();
}

/** A monthly token limit: a whole number from 10,000 to 1,000,000,000, or none. */
export function cleanLimit(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s_]/g, ""));
  if (!Number.isFinite(n) || n < 10_000 || n > 1_000_000_000) throw Error("Set the monthly limit between 10,000 and 1,000,000,000 tokens, or leave it empty.");
  return Math.round(n);
}

export const thisMonth = (now = new Date()) => now.toISOString().slice(0, 7);
