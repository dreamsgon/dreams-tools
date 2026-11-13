/*
 * The New session recap dialog's side of a recap: reading chat exports, guessing who is who, the session
 * page it makes for the AI to fill, and the short notes that tell the AI what the GM asked for. Pure.
 */
import { newId, type Entry, type Workspace } from "./world-model.ts";
import { emptyRecap, type Recap, type RecapRequest } from "./recap-schema.ts";

// ---- Chat exports ------------------------------------------------------------------------------

type DiscordMessage = { author?: { name?: unknown; nickname?: unknown }; content?: unknown };
/** A Discord chat export in JSON (as DiscordChatExporter writes it) as "Name: text" lines, or null if it isn't one. */
export function discordJsonToText(text: string) {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return null; }
  const messages = (data as { messages?: unknown })?.messages;
  if (!Array.isArray(messages)) return null;
  return (messages as DiscordMessage[]).flatMap(m => {
    const who = typeof m.author?.nickname === "string" && m.author.nickname.trim() ? m.author.nickname : typeof m.author?.name === "string" ? m.author.name : "";
    const says = typeof m.content === "string" ? m.content.replace(/\s*\n\s*/g, " ").trim() : "";
    return says ? [who.trim() ? `${who.trim()}: ${says}` : says] : [];
  }).join("\n");
}

/** Chat lines from a Discord HTML export's message groups, given each group's author and its messages' text. */
export const chatGroupsToText = (groups: { author: string; lines: string[] }[]) =>
  groups.flatMap(g => g.lines.map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean).map(l => g.author.trim() ? `${g.author.trim()}: ${l}` : l)).join("\n");

// ---- Who is who --------------------------------------------------------------------------------

const SPEAKER = /^\s*(?:\[[^\]]{1,20}\]\s*)?([^:\n]{1,60}?):\s+\S/;
/** The names at the start of lines ("Mara: …"), most frequent first. Names said only once are left out. */
export function speakersIn(text: string, max = 30) {
  const counts = new Map<string, number>();
  for (const line of text.split("\n")) {
    const name = SPEAKER.exec(line)?.[1]?.trim();
    if (!name || name.split(/\s+/).length > 5 || /^https?$/i.test(name)) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([name]) => name);
}

const GM = /^(?:gm|dm|game ?master|dungeon ?master|narrator|storyteller)\b/i;
/**
 * A first guess at who each speaker is: "GM" or "DM" is the GM, "Mara (Bram)" plays Bram, and a speaker
 * named like a character is that character. Everyone else is a player without a page.
 */
export function guessCast(speakers: string[], characters: Pick<Entry, "id" | "title">[]) {
  const byName = (n: string) => { const q = n.trim().toLowerCase(); return characters.find(c => c.title.toLowerCase() === q) ?? characters.find(c => c.title.toLowerCase().split(/\s+/)[0] === q); };
  return speakers.map(speaker => {
    if (GM.test(speaker)) return { speaker, as: "gm" as const };
    const plays = /\(([^)]+)\)/.exec(speaker)?.[1], page = (plays && byName(plays)) || byName(speaker.replace(/\s*\([^)]*\)/, ""));
    return page ? { speaker, as: page.id, name: page.title } : { speaker, as: "" as const };
  });
}

// ---- The page the AI fills ---------------------------------------------------------------------

/** A session page's own notes, kept in a GM-only tab when a recap takes over its text. */
export function keepNotes(e: Entry): Pick<Entry, "tabs"> {
  if (e.recap || !e.body.trim() || (e.tabs?.length ?? 0) >= 30) return { tabs: e.tabs };
  return { tabs: [...(e.tabs ?? []), { id: newId(), title: "Notes before the recap", body: e.body, visibility: "gm" }] };
}

/**
 * Makes the session page a recap waits on (or readies an existing one): a draft with what the GM asked for,
 * hidden from players. The AI fills it with save_recap.
 */
export function startRecap(ws: Workspace, input: { campaignId: string; title: string; playedOn?: string; source: string; request: RecapRequest; pageId?: string; folderId?: string | null; transcriptWords?: number }, now = new Date()): { next: Workspace; id: string } {
  const c = ws.campaigns.find(x => x.id === input.campaignId);
  if (!c) throw Error("That campaign is gone.");
  const at = now.toISOString();
  const recap = (before?: Recap): Recap => ({
    ...(before ?? emptyRecap()), status: "draft", source: input.source.slice(0, 200), request: input.request,
    ...(input.playedOn ? { playedOn: input.playedOn } : {}), ...(input.transcriptWords ? { transcriptWords: input.transcriptWords } : {}),
  });
  if (input.pageId) {
    const page = ws.entries.find(e => e.id === input.pageId);
    if (page?.kind !== "session" || page.campaignId !== c.id) throw Error("That session page is gone.");
    return { id: page.id, next: { ...ws, entries: ws.entries.map(e => e.id === page.id ? { ...e, ...keepNotes(e), title: input.title, body: e.recap ? e.body : "", recap: recap(e.recap), overviewVisibility: undefined, updatedAt: at } : e) } };
  }
  const id = newId();
  const page: Entry = { id, worldId: c.worldId, campaignId: c.id, parentId: input.folderId ?? null, title: input.title, kind: "session", body: "", recap: recap(), updatedAt: at };
  return { id, next: { ...ws, entries: [...ws.entries, page] } };
}

/** A recap that was asked for and hasn't come back yet. */
export const waitingForAi = (r: Recap | undefined) => !!r?.request && r.status === "draft" && !r.timeline.length && !r.review.length && !r.quotes.length;

// ---- What the AI reads -------------------------------------------------------------------------

const lengths = { short: "about 150 to 300 words", standard: "about 250 to 600 words", detailed: "about 600 to 1,200 words" };
const depths = { main: "only the main people, places, quests and finds", balanced: "the people, places, quests and finds that matter", everything: "every named person, place, quest and find" };
const partNames = { recap: "the recap", timeline: "the timeline", quotes: "quotes", found: "people, places and things (found)", quests: "quest updates", gmNotes: "GM notes" };

/** What the GM asked for, as short lines for the AI. `steer` is the GM's own words. */
export function requestNotes(r: RecapRequest) {
  const skip = r.skip ?? [];
  return [
    `Recap length: ${lengths[r.length]}.`,
    `Pull out ${depths[r.depth]}.`,
    ...(skip.length ? [`Leave out ${skip.map(k => partNames[k]).join(", ")}: send them empty.`] : []),
    ...(r.cast?.length ? [`Who is who: ${r.cast.map(x => `${x.speaker} is ${x.as === "gm" ? "the GM" : x.as ? `the player of ${x.name ?? "a character"}` : "a player"}`).join("; ")}. Name characters, not players, in the recap.`] : []),
    ...(r.steer?.trim() ? [`The GM asks: ${r.steer.trim()}`] : []),
  ];
}

/** Leaves out what the GM said not to make, whatever the AI sent. */
export function honourSkips<T extends { recap: string; timeline: unknown[]; quotes?: unknown[]; found?: unknown[]; quests?: unknown[]; codex?: unknown[]; gmNotes?: string }>(input: T, r?: RecapRequest): T {
  const skip = new Set(r?.skip ?? []);
  return {
    ...input,
    ...(skip.has("recap") ? { recap: "" } : {}), ...(skip.has("timeline") ? { timeline: [] } : {}), ...(skip.has("quotes") ? { quotes: [] } : {}),
    ...(skip.has("found") ? { found: [], codex: [] } : {}), ...(skip.has("quests") ? { quests: [] } : {}), ...(skip.has("gmNotes") ? { gmNotes: "" } : {}),
  };
}
