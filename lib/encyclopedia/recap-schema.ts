/*
 * A session recap: the structured part of a session page that an AI drafted from a transcript or notes.
 * The recap text players read is the page's Overview (its body); this holds the rest. Kept in its own
 * file so world-model.ts only has to add one optional field.
 */
import { z } from "zod";

const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export const recapPageKinds = ["character", "place", "faction", "lore", "note"] as const;

/** One thing the AI found that waits for the GM: a new page, a line for an existing page, or a quest change. */
export const recapItemSchema = z.object({
  id,
  kind: z.enum(["newPage", "update", "questLog", "newQuest", "codex"]),
  /** The page or quest's name as the AI gave it. */
  name: z.string().trim().min(1).max(160),
  /** The existing page or quest it was matched to. */
  pageId: id.optional(),
  /** For a new page: what kind of page. */
  pageKind: z.enum(recapPageKinds).optional(),
  /** The page's starting text, the line to add, or the quest log entry. */
  text: z.string().max(4000),
  /** A quest objective to tick, by its text. */
  tick: z.string().max(300).optional(),
  playersSee: z.boolean().optional(),
  state: z.enum(["open", "done", "skipped"]),
});
export const beatSchema = z.object({ id, title: z.string().trim().min(1).max(200), big: z.boolean(), steps: z.array(z.string().trim().min(1).max(300)).max(12) });
export const quoteSchema = z.object({ id, text: z.string().trim().min(1).max(500), who: z.string().trim().max(120), checked: z.boolean().optional() });

/** What the GM asked for in the New session recap dialog. The AI reads it with the transcript. */
export const recapParts = ["recap", "timeline", "quotes", "found", "quests", "gmNotes"] as const;
export const requestSchema = z.object({
  length: z.enum(["short", "standard", "detailed"]),
  depth: z.enum(["main", "balanced", "everything"]),
  steer: z.string().max(500).optional(),
  /** Parts to leave out. Everything else is made. */
  skip: z.array(z.enum(recapParts)).max(6).optional(),
  /** Who each speaker in the transcript is: the GM, a character page, or just a player. */
  cast: z.array(z.object({ speaker: z.string().trim().min(1).max(80), as: z.union([z.literal("gm"), z.literal(""), id]), name: z.string().max(160).optional() })).max(30).optional(),
  /** A link the AI reads with its own access (Notion, Google Drive, GitHub). */
  link: z.string().url().max(500).optional(),
  /** When the GM handed it over (ISO). */
  at: z.string().max(40),
});
export type RecapRequest = z.infer<typeof requestSchema>;

export const recapSchema = z.object({
  /** A draft never reaches players, whatever its tabs say. */
  status: z.enum(["draft", "published"]),
  /** Who wrote it, such as the AI connection's name. */
  by: z.string().max(80).optional(),
  /** Where it came from, in a few words, such as "Notion page: Session 13". */
  source: z.string().max(200).optional(),
  playedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timeline: z.array(beatSchema).max(60),
  quotes: z.array(quoteSchema).max(20),
  gmNotes: z.string().max(20000),
  shareTimeline: z.boolean().optional(),
  shareQuotes: z.boolean().optional(),
  review: z.array(recapItemSchema).max(80),
  /** Words in the stored transcript, when there is one. */
  transcriptWords: z.number().int().min(0).max(10_000_000).optional(),
  request: requestSchema.optional(),
});
export type Recap = z.infer<typeof recapSchema>;
export type RecapItem = z.infer<typeof recapItemSchema>;
export type Beat = z.infer<typeof beatSchema>;
export type Quote = z.infer<typeof quoteSchema>;

export const emptyRecap = (): Recap => ({ status: "draft", timeline: [], quotes: [], gmNotes: "", review: [] });

/** The timeline as Markdown: big beats as headings with their steps, small beats as bullets with theirs. */
export function timelineMarkdown(beats: Beat[]) {
  return beats.map(b => b.big
    ? [`### ${b.title}`, ...b.steps.map(s => `- ${s}`)].join("\n")
    : [`- **${b.title}**`, ...b.steps.map(s => `    - ${s}`)].join("\n")).join("\n\n");
}
export const quotesMarkdown = (quotes: Quote[]) => quotes.map(q => `> “${q.text.replace(/^["“]|["”]$/g, "")}”${q.who ? `\n> — ${q.who}` : ""}`).join("\n\n");

/** The extra tabs players get on a published recap, when the GM shared them. A draft gets none. */
export function playerRecapTabs(r: Recap | undefined, clean: (s: string) => string) {
  if (!r || r.status !== "published") return [];
  return [
    ...(r.shareTimeline && r.timeline.length ? [{ id: "recap-timeline", title: "Timeline", body: clean(timelineMarkdown(r.timeline)) }] : []),
    ...(r.shareQuotes && r.quotes.length ? [{ id: "recap-quotes", title: "Quotes", body: clean(quotesMarkdown(r.quotes)) }] : []),
  ];
}
