/*
 * How the AI writes, per campaign: writing styles for session recaps, The story so far and generator writing.
 * A style says how long, in what tone, who tells it, story or bullet points, the tense, the language and the GM's
 * own instructions. Five built-in styles live here; a campaign keeps only its own styles and which one each kind
 * of writing uses (optional `aiWriting` on a campaign). The lines a style adds to a prompt never replace the
 * lines that keep GM secrets from players. Pure.
 */
import { z } from "zod";

export const styleTones = ["Warm", "Grim", "Funny", "Epic", "Mysterious", "Plain"] as const;
export const writingKinds = ["recap", "story", "gen"] as const;
export type WritingKind = typeof writingKinds[number];

const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export const writingStyleSchema = z.object({
  id, name: z.string().trim().min(1).max(60),
  length: z.enum(["short", "standard", "detailed"]),
  tone: z.array(z.enum(styleTones)).max(2),
  /** Who tells it: about the party, the party as "we", or one character in their own words. */
  voice: z.enum(["party", "we", "character"]),
  /** The character who tells it, for voice "character". */
  who: z.string().trim().max(120).optional(),
  shape: z.enum(["story", "bullets", "both"]),
  tense: z.enum(["past", "present"]),
  /** Left out: English. */
  language: z.string().trim().max(40).optional(),
  /** The GM's own instructions, added every time. */
  instructions: z.string().max(1000).optional(),
});
export type WritingStyle = z.infer<typeof writingStyleSchema>;

export const aiWritingSchema = z.object({
  /** The GM's own styles. Built-in styles are not stored. */
  styles: z.array(writingStyleSchema).max(30).optional(),
  /** The style each kind of writing uses. Left out: Warm storyteller. */
  use: z.object({ recap: id.optional(), story: id.optional(), gen: id.optional() }).optional(),
});
export type AiWriting = z.infer<typeof aiWritingSchema>;

const base: Omit<WritingStyle, "id" | "name"> = { length: "standard", tone: ["Warm"], voice: "party", shape: "story", tense: "past" };
export const DEFAULT_STYLE = "builtin-warm";
/** The built-in styles. Warm storyteller is how RPG Tools always wrote. */
export const builtInStyles: WritingStyle[] = [
  { id: DEFAULT_STYLE, name: "Warm storyteller", ...base, tone: ["Warm"] },
  { id: "builtin-plain", name: "Plain and brief", ...base, length: "short", tone: ["Plain"] },
  { id: "builtin-drama", name: "Dramatic chronicle", ...base, length: "detailed", tone: ["Epic", "Mysterious"] },
  { id: "builtin-journal", name: "A character’s journal", ...base, voice: "character" },
  { id: "builtin-bullets", name: "Bullet points", ...base, length: "short", tone: ["Plain"], shape: "bullets" },
];
export const isBuiltIn = (styleId: string) => styleId.startsWith("builtin-");

export const allStyles = (w?: AiWriting) => [...builtInStyles, ...(w?.styles ?? [])];
/** The style to write with: the one asked for, else the one this kind of writing uses, else Warm storyteller. */
export function styleFor(w: AiWriting | undefined, kind: WritingKind, styleId?: string) {
  const all = allStyles(w);
  return all.find(s => s.id === styleId) ?? all.find(s => s.id === w?.use?.[kind]) ?? builtInStyles[0];
}

export const kindNames: Record<WritingKind, string> = { recap: "Session recaps", story: "The story so far", gen: "Generator writing" };
export const lengthNames: Record<WritingKind, Record<WritingStyle["length"], [string, string]>> = {
  recap: { short: ["Short", "about 150 to 300 words"], standard: ["Standard", "about 250 to 600 words"], detailed: ["Detailed", "about 600 to 1,200 words"] },
  story: { short: ["Short", "about 80 to 150 words"], standard: ["Standard", "about 150 to 300 words"], detailed: ["Detailed", "about 300 to 500 words"] },
  gen: { short: ["Short", "a sentence or two"], standard: ["Standard", "a paragraph"], detailed: ["Detailed", "a few paragraphs"] },
};

const voiceLine = (s: WritingStyle, kind: WritingKind) => s.voice === "we"
  ? "told by the party as “we”"
  : s.voice === "character" ? `written as ${s.who?.trim() || "one of the player characters"}’s own journal, in their words`
  : kind === "gen" ? "as a description" : "as a story of what the party did";

/** The lines a style adds to a prompt, such as "Length: about 250 to 600 words." */
export function styleLines(s: WritingStyle, kind: WritingKind) {
  const tones = s.tone.length ? s.tone.join(" and ").toLowerCase() : "plain";
  return [
    `Length: ${lengthNames[kind][s.length][1]}.`,
    `${s.tense === "past" ? "Past" : "Present"} tense, ${tones}, ${voiceLine(s, kind)}.`,
    s.shape === "bullets" ? "Use short bullet points, one for each thing that happened." : s.shape === "both" ? "Start with three to five short bullet points, then tell it in paragraphs." : "Write it in paragraphs.",
    ...(s.language?.trim() && s.language.trim().toLowerCase() !== "english" ? [`Write in ${s.language.trim()}.`] : []),
    ...(s.instructions?.trim() ? [`The GM's own instructions: ${s.instructions.trim()}`] : []),
  ];
}

/** A short line for the style menu, such as "Standard · warm · about the party · a story · past tense". */
export function styleSummary(s: WritingStyle, kind: WritingKind) {
  return [
    `${lengthNames[kind][s.length][0]} (${lengthNames[kind][s.length][1].replace(/^about /, "")})`,
    s.tone.length ? s.tone.join(" and ").toLowerCase() : "no set tone",
    s.voice === "party" ? "about the party" : s.voice === "we" ? "told as “we”" : `in ${s.who?.trim() || "a character"}’s words`,
    s.shape === "story" ? "a story" : s.shape === "bullets" ? "bullet points" : "bullets, then a story",
    s.tense === "past" ? "past tense" : "present tense",
    ...(s.language?.trim() && s.language.trim().toLowerCase() !== "english" ? [`in ${s.language.trim()}`] : []),
    ...(s.instructions?.trim() ? ["your instructions"] : []),
  ].join(" · ");
}

/** Saves a style as the campaign's own (a new one, or changes to one it has). Built-in styles can't be changed. */
export function saveStyle(w: AiWriting | undefined, style: WritingStyle): AiWriting {
  if (isBuiltIn(style.id)) throw Error("Built-in styles stay as they are. Save it as a new style.");
  const parsed = writingStyleSchema.parse(style), styles = w?.styles ?? [];
  if (styles.some(s => s.id !== parsed.id && s.name.toLowerCase() === parsed.name.toLowerCase()) || builtInStyles.some(s => s.name.toLowerCase() === parsed.name.toLowerCase())) throw Error(`There’s already a style called “${parsed.name}”.`);
  const exists = styles.some(s => s.id === parsed.id);
  if (!exists && styles.length >= 30) throw Error("A campaign can keep 30 styles of its own. Delete one first.");
  return { ...w, styles: exists ? styles.map(s => s.id === parsed.id ? parsed : s) : [...styles, parsed] };
}

/** Deletes one of the campaign's styles. Writing that used it goes back to Warm storyteller. */
export function deleteStyle(w: AiWriting | undefined, styleId: string): AiWriting {
  const use = Object.fromEntries(Object.entries(w?.use ?? {}).filter(([, v]) => v !== styleId));
  return { ...w, styles: (w?.styles ?? []).filter(s => s.id !== styleId), use };
}

/** Sets the style a kind of writing uses. */
export const chooseStyle = (w: AiWriting | undefined, kind: WritingKind, styleId: string): AiWriting => ({ ...w, use: { ...w?.use, [kind]: styleId } });
