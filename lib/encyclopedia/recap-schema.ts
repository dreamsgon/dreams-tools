/*
 * A session recap: the structured part of a session page that an AI drafted from a transcript or notes.
 * The recap text players read is the page's Overview (its body); this holds the rest. Kept in its own
 * file so world-model.ts only has to add one optional field.
 */
import { z } from "zod";
import { recapIn, type ExtractSettings } from "./recap-extract.ts";

const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export const recapPageKinds = ["character", "creature", "place", "faction", "lore", "note"] as const;

/** One thing the AI found that waits for the GM: a new page, a line for an existing page, or a quest change. */
export const recapItemSchema = z.object({
  id,
  kind: z.enum(["newPage", "update", "questLog", "newQuest", "codex", "loot", "tie", "date"]),
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
  /** Loot: how many. The character who carries it is `pageId`, and `name` is the item. */
  qty: z.number().int().min(1).max(1_000_000).optional(),
  /** A tie: `name` (and `pageId`) is where it starts, `to` (and `toId`) where it goes, `typeId` its kind of tie, `reversed` when it is stored on `to`. */
  to: z.string().trim().min(1).max(160).optional(),
  toId: id.optional(),
  typeId: id.optional(),
  reversed: z.boolean().optional(),
  /** An in-world date: the calendar and the day to move it on to. `name` is the date as written. */
  calendarId: id.optional(),
  date: z.object({ year: z.number().int().min(1).max(99999), periodId: id, day: z.number().int().min(1).max(130) }).optional(),
  /** Filed: set to go only to the session file (What it pulls out), so it never waits in the check list. */
  state: z.enum(["open", "done", "skipped", "filed"]),
});
export const beatSchema = z.object({ id, title: z.string().trim().min(1).max(200), big: z.boolean(), steps: z.array(z.string().trim().min(1).max(300)).max(12) });
export const quoteSchema = z.object({ id, text: z.string().trim().min(1).max(500), who: z.string().trim().max(120), checked: z.boolean().optional() });

/** What the GM asked for in the New session recap dialog. The AI reads it with the transcript. */
export const recapParts = ["recap", "timeline", "quotes", "found", "quests", "gmNotes"] as const;
export const requestSchema = z.object({
  length: z.enum(["short", "standard", "detailed"]),
  depth: z.enum(["main", "balanced", "everything"]),
  steer: z.string().max(500).optional(),
  /** The writing style picked for this recap (ai-styles.ts). Left out: the campaign's recap style. */
  style: id.optional(),
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
  /** The GM wrote the recap text themselves (Write it myself). An AI draft saved over it clears this. */
  mine: z.boolean().optional(),
  /** Where it came from, in a few words, such as "Notion page: Session 13". */
  source: z.string().max(200).optional(),
  playedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timeline: z.array(beatSchema).max(60),
  quotes: z.array(quoteSchema).max(20),
  gmNotes: z.string().max(20000),
  shareTimeline: z.boolean().optional(),
  shareQuotes: z.boolean().optional(),
  review: z.array(recapItemSchema).max(80),
  /** Highlights: reveals and turning points, a line on each player character, and how the fights went. Shared with the Key moments tab. */
  moments: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
  spotlights: z.array(z.object({ who: z.string().trim().min(1).max(120), text: z.string().trim().min(1).max(300) })).max(12).optional(),
  encounters: z.array(z.object({ name: z.string().trim().min(1).max(160), outcome: z.string().trim().max(300) })).max(20).optional(),
  shareMoments: z.boolean().optional(),
  /** For next time, GM only: where the party stands, what they plan, and open questions. */
  partyStatus: z.string().max(2000).optional(),
  next: z.array(z.string().trim().min(1).max(300)).max(12).optional(),
  threads: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
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
export const hasMoments = (r: Recap) => !!(r.moments?.length || r.spotlights?.length || r.encounters?.length);
export const hasNext = (r: Recap) => !!(r.partyStatus?.trim() || r.next?.length || r.threads?.length);
/** The Key moments tab as Markdown: key moments, character spotlights and encounters, each under a heading when there is more than one. */
export function momentsMarkdown(r: Recap) {
  const parts: [string, string[]][] = [
    ["Key moments", (r.moments ?? []).map(m => `- ${m}`)],
    ["Character spotlights", (r.spotlights ?? []).map(s => `- **${s.who}:** ${s.text}`)],
    ["Encounters", (r.encounters ?? []).map(e => `- **${e.name}**${e.outcome ? `: ${e.outcome}` : ""}`)],
  ].filter((p): p is [string, string[]] => p[1].length > 0);
  return parts.map(([h, lines]) => parts.length > 1 ? [`### ${h}`, ...lines].join("\n") : lines.join("\n")).join("\n\n");
}
/** The Next time tab as Markdown: party status, next steps and loose threads. */
export function nextMarkdown(r: Recap) {
  return [
    ...(r.partyStatus?.trim() ? [`### Party status\n${r.partyStatus.trim()}`] : []),
    ...(r.next?.length ? [`### Next steps\n${r.next.map(n => `- ${n}`).join("\n")}`] : []),
    ...(r.threads?.length ? [`### Loose threads\n${r.threads.map(t => `- ${t}`).join("\n")}`] : []),
  ].join("\n\n");
}
export const quotesMarkdown = (quotes: Quote[]) => quotes.map(q => `> “${q.text.replace(/^["“]|["”]$/g, "")}”${q.who ? `\n> — ${q.who}` : ""}`).join("\n\n");

/** The extra tabs players get on a published recap, when the GM shared them. A draft gets none. `x` is the campaign's What it pulls out. */
export function playerRecapTabs(recap: Recap | undefined, clean: (s: string) => string, x?: ExtractSettings) {
  if (!recap || recap.status !== "published") return [];
  // Parts set to go only to the session file (What it pulls out) aren't on the page, so players don't get them either.
  const r = recapIn(recap, x, "enc");
  return [
    ...(r.shareTimeline && r.timeline.length ? [{ id: "recap-timeline", title: "Timeline", body: clean(timelineMarkdown(r.timeline)) }] : []),
    ...(r.shareQuotes && r.quotes.length ? [{ id: "recap-quotes", title: "Quotes", body: clean(quotesMarkdown(r.quotes)) }] : []),
    ...(r.shareMoments && hasMoments(r) ? [{ id: "recap-moments", title: "Key moments", body: clean(momentsMarkdown(r)) }] : []),
  ];
}
