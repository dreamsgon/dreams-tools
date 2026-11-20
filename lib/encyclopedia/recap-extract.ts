/*
 * What it pulls out: the campaign's settings for what the AI takes from a session (when it writes a recap,
 * or checks one the GM wrote) and how much. Kinds turned off are left out of what the AI is asked for, and
 * dropped from what it sends. Saved with the campaign's AI writing settings (ai-styles.ts). Pure.
 */
import { z } from "zod";
import type { RecapRequest, recapParts } from "./recap-schema.ts";

export const extractKinds = ["timeline", "quotes", "people", "places", "orgs", "lore", "codex", "quests", "rumours", "gmNotes", "moments", "spotlights", "encounters", "next", "threads"] as const;
/** Kinds that start off: turned on with `on`. Every other kind starts on, and is turned off with `off`. */
export const offAtFirst: readonly ExtractKind[] = ["spotlights", "encounters"];
export type ExtractKind = typeof extractKinds[number];
export const extractDepths = ["main", "balanced", "everything"] as const;

/** Each kind's name and a line on what it is. */
export const extractNames: Record<ExtractKind, [string, string]> = {
  timeline: ["Timeline", "The session's beats, on a Timeline tab. Write it again works from it."],
  quotes: ["Quotes", "Memorable lines, word for word, on a Quotes tab."],
  people: ["People", "New characters, and what changed for ones you have."],
  places: ["Places", "Where the party went, new and changed."],
  orgs: ["Organizations", "Guilds, houses and factions."],
  lore: ["Lore and notes", "History, legends and secrets the party learned."],
  codex: ["Codex finds", "Codex pages the party found."],
  quests: ["Quest moves", "Log lines, and objectives that are done."],
  rumours: ["New quests", "Quests you don't have yet, as rumours."],
  gmNotes: ["GM notes", "Hooks, secrets and rules calls, for you only."],
  moments: ["Key moments", "Reveals, betrayals and turning points, on a Key moments tab."],
  spotlights: ["Character spotlights", "A line on what each player character did best."],
  encounters: ["Encounters", "Fights and tense meetings, and how they went."],
  next: ["Party status and next steps", "Where the party stands and what they plan, for your prep."],
  threads: ["Loose threads", "Open questions and hooks nobody has followed yet."],
};
/** How the kinds are grouped in the settings. */
export const extractGroups: [string, ExtractKind[]][] = [
  ["On the session page", ["timeline", "quotes", "gmNotes"]],
  ["Highlights", ["moments", "spotlights", "encounters"]],
  ["For next time (GM only)", ["next", "threads"]],
  ["Pages", ["people", "places", "orgs", "lore", "codex"]],
  ["Quests", ["quests", "rumours"]],
];
export const depthNames: Record<typeof extractDepths[number], [string, string]> = {
  main: ["Only the main ones", "Only the people, places and quests that matter most."],
  balanced: ["Balanced", "The people, places, quests and finds that matter."],
  everything: ["Everything", "Every named person, place, quest and find."],
};

export const extractSchema = z.object({
  /** How much to pull out when nothing else is asked. Left out: balanced. */
  depth: z.enum(extractDepths).optional(),
  /** Kinds turned off. Everything else is pulled out. */
  off: z.array(z.enum(extractKinds)).max(extractKinds.length).optional(),
  /** Kinds that start off (`offAtFirst`) and were turned on. */
  on: z.array(z.enum(extractKinds)).max(extractKinds.length).optional(),
});
export type ExtractSettings = z.infer<typeof extractSchema>;

export const isOn = (x: ExtractSettings | undefined, k: ExtractKind) => offAtFirst.includes(k) ? !!x?.on?.includes(k) && !x?.off?.includes(k) : !x?.off?.includes(k);
/** Turns one kind on or off, keeping only what differs from how it starts. */
export function turnKind(x: ExtractSettings, k: ExtractKind, on: boolean): ExtractSettings {
  const off = (x.off ?? []).filter(y => y !== k), onList = (x.on ?? []).filter(y => y !== k), first = !offAtFirst.includes(k);
  return { ...x, off: on || !first ? off : [...off, k], on: on && !first ? [...onList, k] : onList };
}

/** Saves the settings: the usual depth and kinds that are on are left out, so a fresh campaign stores nothing. */
export function cleanExtract(x: ExtractSettings): ExtractSettings | undefined {
  const parsed = extractSchema.parse(x);
  const off = extractKinds.filter(k => !offAtFirst.includes(k) && !isOn(parsed, k)), on = extractKinds.filter(k => offAtFirst.includes(k) && isOn(parsed, k));
  const out: ExtractSettings = { ...(parsed.depth && parsed.depth !== "balanced" ? { depth: parsed.depth } : {}), ...(off.length ? { off } : {}), ...(on.length ? { on } : {}) };
  return Object.keys(out).length ? out : undefined;
}

/** The parts of the New session recap dialog that start unticked: those with every kind in them turned off. */
export function partsOff(x: ExtractSettings | undefined): typeof recapParts[number][] {
  const off = (...k: ExtractKind[]) => k.every(y => !isOn(x, y));
  return [
    ...(off("timeline") ? ["timeline" as const] : []), ...(off("quotes") ? ["quotes" as const] : []),
    ...(off("people", "places", "orgs", "lore", "codex") ? ["found" as const] : []), ...(off("quests", "rumours") ? ["quests" as const] : []),
    ...(off("gmNotes") ? ["gmNotes" as const] : []),
  ];
}

const askNames: Record<ExtractKind, string> = {
  timeline: "the timeline", quotes: "quotes", people: "people (characters)", places: "places", orgs: "organizations (factions)", lore: "lore and notes",
  codex: "codex finds", quests: "moves on quests the campaign has", rumours: "new quests", gmNotes: "GM notes",
  moments: "key moments", spotlights: "character spotlights", encounters: "encounters", next: "party status and next steps", threads: "loose threads",
};
/** A line for the AI on what the GM turned off, if anything. The timeline is still asked for when the recap is written from it. */
export function extractNotes(x: ExtractSettings | undefined, opts: { keepTimeline?: boolean } = {}) {
  const off = extractKinds.filter(k => !offAtFirst.includes(k) && !isOn(x, k) && !(k === "timeline" && opts.keepTimeline));
  return off.length ? [`The GM turned these off in What it pulls out, so leave them out and send them empty: ${off.map(k => askNames[k]).join(", ")}.`] : [];
}

/** What to ask the AI for of the highlights and For next time kinds that are on, one line each, as in the notes prompt. */
export function highlightAsks(x: ExtractSettings | undefined) {
  return [
    isOn(x, "moments") ? "- moments: up to 8 key moments: reveals, betrayals, deaths, deals and turning points, one line each." : "",
    isOn(x, "spotlights") ? "- spotlights: one line for each player character on what they did best this session, with who (the character's name)." : "",
    isOn(x, "encounters") ? "- encounters: fights and tense meetings, each with name and outcome (how it went)." : "",
    isOn(x, "next") ? "- partyStatus: a few sentences on where the party stands at the end (where they are, hurt or not, what they carry that matters). next: what they said they'll do next, one line each." : "",
    isOn(x, "threads") ? "- threads: loose threads: open questions and hooks nobody followed yet, one line each." : "",
  ].filter(Boolean);
}

/** The depth to use: what this recap asked for, or the campaign's setting. */
export const depthFor = (x: ExtractSettings | undefined, r?: Pick<RecapRequest, "depth">) => r?.depth ?? x?.depth ?? "balanced";

const kindOfFind = (kind: string | undefined): ExtractKind => kind === "character" ? "people" : kind === "place" ? "places" : kind === "faction" ? "orgs" : "lore";
type Finds = { found?: { kind?: string }[]; codex?: unknown[] };
type Highlights = { moments?: unknown[]; spotlights?: unknown[]; encounters?: unknown[]; threads?: unknown[]; next?: unknown[]; partyStatus?: string };
/** Drops what the AI sent of kinds the GM turned off. Quest moves and new quests are told apart once matched (see recaps.ts). */
export function honourExtract<T extends Finds & Highlights & { timeline?: unknown[]; quotes?: unknown[]; gmNotes?: string }>(input: T, x: ExtractSettings | undefined): T {
  const later = {
    ...(input.moments && !isOn(x, "moments") ? { moments: [] } : {}), ...(input.spotlights && !isOn(x, "spotlights") ? { spotlights: [] } : {}),
    ...(input.encounters && !isOn(x, "encounters") ? { encounters: [] } : {}), ...(input.threads && !isOn(x, "threads") ? { threads: [] } : {}),
    ...(!isOn(x, "next") ? { ...(input.next ? { next: [] } : {}), ...(input.partyStatus !== undefined ? { partyStatus: "" } : {}) } : {}),
  };
  if (!x?.off?.length) return { ...input, ...later };
  return {
    ...input, ...later,
    ...(input.found ? { found: input.found.filter(f => isOn(x, kindOfFind(f.kind))) } : {}),
    ...(input.codex && !isOn(x, "codex") ? { codex: [] } : {}),
    ...(input.timeline && !isOn(x, "timeline") ? { timeline: [] } : {}),
    ...(input.quotes && !isOn(x, "quotes") ? { quotes: [] } : {}),
    ...(input.gmNotes !== undefined && !isOn(x, "gmNotes") ? { gmNotes: "" } : {}),
  };
}
