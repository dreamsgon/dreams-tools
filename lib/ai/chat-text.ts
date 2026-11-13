/*
 * Saved AI chats as text: their titles, and the Markdown, Discord recap and session page made from them.
 * No server code, so the AI panel uses the same text it shows in its previews.
 */
import type { Step } from "./chat.ts";

export type SavedTurn = { role: "user" | "assistant"; text: string; at: string; steps?: Step[] };
export type ChatMeta = { id: string; title: string; connectionId: string; connectionName: string; model?: string; scene?: string; count: number; createdAt: string; updatedAt: string };
/** `turns` are the latest turns; a long chat keeps `earlier` older turns in `parts` part files on the server. */
export type SavedChat = ChatMeta & { turns: SavedTurn[]; parts?: number; earlier?: number };
export type RecapPick = { answers: boolean; questions: boolean; steps: boolean };

/** How many of the latest messages the AI sees each turn. The whole chat is still saved; only these are sent. */
export const CONTEXT_TURNS = 20;

/** A chat's first question, cut to a short title. */
export function chatTitle(text: string) {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 60 ? line.slice(0, 59).trimEnd() + "…" : line || "New chat";
}

const dateLine = (iso: string) => new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
/** What the AI looked up or did for an answer, as Markdown bullets: what it asked to do, or the tool it used. */
const stepLines = (steps: Step[] | undefined) => (steps ?? []).map(s => `- ${s.summary || s.title}${s.ok ? "" : " (didn't work)"}`);

/** The whole chat as Markdown: who said what, and what the AI asked to do. `heading` adds a title and a line about it. */
export function chatMarkdown(chat: SavedChat, opts: { campaign?: string; heading?: boolean } = {}) {
  const lines: string[] = [];
  if (opts.heading !== false) {
    lines.push(`# ${chat.title}`, "", `_${[opts.campaign, chat.scene, `${chat.connectionName}${chat.model ? ` (${chat.model})` : ""}`, dateLine(chat.createdAt)].filter(Boolean).join(" · ")}_`, "");
  }
  for (const t of chat.turns) {
    lines.push(`**${t.role === "user" ? "You" : chat.connectionName}:** ${t.text.trim()}`, "");
    const steps = stepLines(t.steps);
    if (steps.length) lines.push(...steps, "");
  }
  return lines.join("\n").trim() + "\n";
}

/** The text of a Discord recap: the AI's answers, the GM's questions and the steps, as chosen. Up to 4000 characters. */
export function chatRecap(chat: SavedChat, pick: RecapPick) {
  const parts: string[] = [];
  for (const t of chat.turns) {
    const block: string[] = [];
    if (t.role === "user" ? pick.questions : pick.answers) block.push(t.role === "user" ? `> ${t.text.trim().replace(/\n+/g, " ")}` : t.text.trim());
    if (t.role === "assistant" && pick.steps && t.steps?.length) block.push(stepLines(t.steps).map(s => s.replace(/^- /, "• ")).join("\n"));
    if (block.length) parts.push(block.join("\n\n"));
  }
  const text = parts.join("\n\n").trim();
  return text.length > 4000 ? text.slice(0, 3999).trimEnd() + "…" : text;
}

/** A session page body: the chat inside a GM secret block, so nothing reaches players until the GM moves it out. Its first line reopens the chat in the AI panel. */
export function chatSessionBody(chat: SavedChat, campaign?: string) {
  return [`From a chat with ${chat.connectionName} in the AI panel${chat.scene ? ` · ${chat.scene}` : ""} · ${dateLine(chat.createdAt)}`, "", "::: secret", `[[ai-chat:${chat.id}|Open the chat]]`, "", chatMarkdown(chat, { campaign, heading: false }).trim(), ":::", ""].join("\n");
}

/** The event an "Open the chat" link sends to the AI panel. */
export const OPEN_CHAT_EVENT = "rpg-open-ai-chat";
/** A file name for a downloaded chat. */
export const chatFileName = (title: string) => (title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "chat") + ".md";
