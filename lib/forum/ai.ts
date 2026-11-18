/*
 * The forum's AI help, run with one of the campaign's API-key connections (Connect an AI, in the Encyclopedia):
 * Summarize or Catch me up on a topic, Check my post before posting, and Draft with AI for the moderating team.
 * Only forum text the asker can read goes to the AI, with the players' view of characters, so a player never gets
 * GM-only pages through it. Nothing here is saved; a post drafted with AI is posted by a person and marked. Pure.
 */
import { z } from "zod";
import { withRollResults, type Roll } from "./rolls.ts";

/** Who may use each feature: everyone who can reply, the moderating team, or nobody. */
export const aiUseSchema = z.enum(["all", "staff", "off"]);
export const forumAiSchema = z.object({
  /** The campaign's API-key connection the forum uses. */
  connectionId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/),
  catchUp: aiUseSchema,
  check: aiUseSchema,
  /** Draft with AI: posts written by the AI and posted, after a read, by a moderator. */
  draft: z.enum(["staff", "off"]),
});
export type ForumAi = z.infer<typeof forumAiSchema>;
export type AiUse = z.infer<typeof aiUseSchema>;
export const AI_OFF: Omit<ForumAi, "connectionId"> = { catchUp: "off", check: "off", draft: "off" };

/** What the viewer may use, given their rights. */
export function aiFor(ai: ForumAi | undefined, rights: { reply: boolean; moderate: boolean }) {
  const may = (u: AiUse | "staff") => u === "all" ? rights.reply || rights.moderate : u === "staff" ? rights.moderate : false;
  return { catchUp: !!ai && may(ai.catchUp), check: !!ai && may(ai.check), draft: !!ai && ai.draft === "staff" && rights.moderate };
}

export type AiPost = { name: string; player?: string; body: string; rolls?: readonly (Roll | null)[]; at: string };
const MAX_CHARS = 24_000, MAX_POSTS = 60;
/** The topic's posts as plain text for the AI, newest kept when it is long. */
export function postsText(posts: readonly AiPost[]) {
  const lines: string[] = [];
  let size = 0;
  for (const p of [...posts].reverse().slice(0, MAX_POSTS)) {
    const text = withRollResults(p.body, p.rolls).replace(/\[\/?collapse[^\]]*\]/gi, "").replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_m, t: string, l?: string) => l || t).trim();
    const line = `### ${p.name}${p.player && p.player !== p.name ? ` (played by ${p.player})` : ""}, ${p.at.slice(0, 16).replace("T", " ")}\n${text}`;
    if (size + line.length > MAX_CHARS && lines.length) break;
    lines.unshift(line.slice(0, MAX_CHARS)); size += line.length;
  }
  return { text: lines.join("\n\n"), shown: lines.length, of: posts.length };
}

const STYLE = "Write plain prose in the forum's own language. Never invent events that aren't in the posts. Keep names as written.";
export const SUMMARY_SYSTEM = `You summarize roleplay forum topics for the people playing in them. ${STYLE}`;
export const summaryTool = {
  name: "summary", description: "The summary of the topic.",
  inputSchema: { type: "object", properties: {
    summary: { type: "string", description: "What happened, in a short paragraph or two (at most 1200 characters)." },
    points: { type: "array", items: { type: "string" }, description: "Up to 6 short points: open threads, who is waiting on whom, promises, clues." },
  }, required: ["summary", "points"] },
};
export function summaryPrompt(t: { title: string; board: string }, posts: readonly AiPost[], since: string | null) {
  const p = postsText(posts);
  return [`Topic: "${t.title}" on the board "${t.board}".`,
    since ? `Catch the reader up: summarize only the posts after ${since.slice(0, 16).replace("T", " ")} (the reader read everything before), in light of the earlier ones.` : "Summarize the whole topic so far.",
    p.shown < p.of ? `Only the latest ${p.shown} of ${p.of} posts are below.` : "", "", p.text].join("\n");
}
export function readSummary(input: Record<string, unknown> | undefined) {
  const s = z.object({ summary: z.string().min(1), points: z.array(z.string()).optional() }).safeParse(input);
  if (!s.success) return null;
  return { summary: s.data.summary.trim().slice(0, 1500), points: (s.data.points ?? []).map(x => x.trim()).filter(Boolean).slice(0, 6).map(x => x.slice(0, 240)) };
}

export const CHECK_SYSTEM = `You check a roleplay forum post before it is posted, as a kind editor. Point out continuity slips against the earlier posts and the character's card (names, places, what someone already said or did, what they carry), and plain spelling or grammar mistakes. Don't rewrite the post, judge the writing style, or suggest plot. Say so when there is nothing to fix. ${STYLE}`;
export const checkTool = {
  name: "check", description: "Notes on the draft post.",
  inputSchema: { type: "object", properties: {
    notes: { type: "array", items: { type: "object", properties: {
      kind: { type: "string", enum: ["continuity", "spelling", "unclear"] },
      quote: { type: "string", description: "The words in the draft the note is about, copied exactly (short)." },
      note: { type: "string", description: "What to look at, in one or two sentences." },
    }, required: ["kind", "note"] }, description: "At most 8 notes; none when the post is fine." },
  }, required: ["notes"] },
};
export type Card = { name: string; role: string; traits: string[]; fields: { label: string; value: string }[] };
const cardText = (c: Card) => `${c.name} (${c.role})${c.traits.length ? `. Traits: ${c.traits.join(", ")}` : ""}${c.fields.length ? `. ${c.fields.map(f => `${f.label}: ${f.value}`).join("; ")}` : ""}`;
export function checkPrompt(t: { title: string; board: string } | null, posts: readonly AiPost[], draft: { body: string; as: Card | null; narration: boolean }) {
  const p = postsText(posts);
  return [t ? `Topic: "${t.title}" on the board "${t.board}".` : "A new topic.",
    draft.as ? `The draft is written as ${cardText(draft.as)}.` : draft.narration ? "The draft is the Game Master's narration." : "The draft is written out of character.",
    ...(p.shown ? ["", "Earlier posts:", p.text] : []), "", "The draft:", withRollResults(draft.body, undefined)].join("\n");
}
export function readCheck(input: Record<string, unknown> | undefined) {
  const s = z.object({ notes: z.array(z.object({ kind: z.string(), quote: z.string().optional(), note: z.string() })) }).safeParse(input);
  if (!s.success) return null;
  return s.data.notes.slice(0, 8).map(n => ({ kind: (["continuity", "spelling", "unclear"].includes(n.kind) ? n.kind : "unclear") as "continuity" | "spelling" | "unclear", ...(n.quote?.trim() ? { quote: n.quote.trim().slice(0, 160) } : {}), note: n.note.trim().slice(0, 400) })).filter(n => n.note);
}

export const DRAFT_SYSTEM = `You write roleplay forum posts for the Game Master to read, change and post. Write one post, in the voice the GM asks for, continuing from the latest posts. Leave the player characters' actions, words and feelings to their players: describe the world, the NPCs and what happens around them. Don't use headings. ${STYLE}`;
export const draftTool = {
  name: "post", description: "The drafted post.",
  inputSchema: { type: "object", properties: { body: { type: "string", description: "The post, in paragraphs separated by blank lines; “speech” in curly quotes." } }, required: ["body"] },
};
export function draftPrompt(t: { title: string; board: string; about: string }, posts: readonly AiPost[], as: Card | null, hint: string, kind: "ic" | "ooc") {
  const p = postsText(posts);
  return [`Topic: "${t.title}" on the board "${t.board}"${t.about ? ` (${t.about})` : ""}.`,
    kind === "ooc" ? "Write out of character, as the GM talking to the players." : as ? `Write as the NPC ${cardText(as)}.` : "Write as the Game Master's narration.",
    hint ? `What the GM wants: ${hint}` : "Move the scene on a little, in about two paragraphs.",
    ...(p.shown ? ["", "The posts so far:", p.text] : ["", "This is the topic's first post: open the scene."])].join("\n");
}
export function readDraft(input: Record<string, unknown> | undefined) {
  const s = z.object({ body: z.string().min(1) }).safeParse(input);
  return s.success ? s.data.body.trim().slice(0, 20_000) : null;
}
