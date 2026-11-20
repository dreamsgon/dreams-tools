/*
 * Which of a provider's models can hold a conversation, in a useful order. Providers list everything their key can use,
 * text-to-speech, transcription, image and embedding models included, and some (OpenAI) in no particular order, so the
 * first model listed can be one that can't chat at all. Shared by the browser (the model pickers) and the server.
 */
import type { ProviderId } from "./providers.ts";

/** Words in a model id that mean it makes or hears sound, draws, embeds, ranks or moderates instead of chatting. */
const NOT_CHAT = /(?:^|[-_/.:])(?:tts|whisper|dall-e|dalle|davinci|babbage|curie|embed|embedding|embeddings|moderation|transcribe|realtime|audio|image|images|imagen|imagine|sora|veo|lyria|aqa|flux|sd3|sd35|sdxl|stable-diffusion|upscaler|upscale|kokoro|rerank|speech|vision-preview|computer-use)(?=$|[-_/.:\d])/i;

export const isChatModel = (id: string) => !NOT_CHAT.test(id);

/** A dated snapshot, like gpt-4-1106-preview, model-2024-08-06 or claude-x@20250101: listed after the plain names. */
const dated = (id: string) => /(?:^|[-_@])(?:20\d{2}-?\d{2}-?\d{2}|0[1-9]\d{2}|1[0-2]\d{2})(?=$|[-_])/.test(id);

/**
 * The models to offer for chat, and the rest. Anthropic and OpenRouter already list newest first, so their order is
 * kept; other providers' lists are sorted with plain names before dated snapshots, higher versions first.
 * `suggested` goes first when the key can use it.
 */
export function chatModels(ids: string[], provider: ProviderId, suggested?: string): { chat: string[]; other: string[] } {
  const unique = [...new Set(ids.filter(id => typeof id === "string" && id))];
  let chat = unique.filter(isChatModel);
  const other = unique.filter(id => !isChatModel(id)).sort((a, b) => a.localeCompare(b));
  if (provider !== "anthropic" && provider !== "openrouter") {
    chat = chat.sort((a, b) => Number(dated(a)) - Number(dated(b)) || b.localeCompare(a, "en", { numeric: true }));
  }
  if (suggested && chat.includes(suggested)) chat = [suggested, ...chat.filter(m => m !== suggested)];
  return { chat, other };
}
