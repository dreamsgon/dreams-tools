/*
 * What it pulls out: the campaign's settings for what the AI takes from a session (when it writes a recap,
 * or checks one the GM wrote) and how much. Kinds turned off are left out of what the AI is asked for, and
 * dropped from what it sends. Saved with the campaign's AI writing settings (ai-styles.ts). Pure.
 */
import { z } from "zod";
import type { Recap, RecapItem, RecapRequest, recapParts } from "./recap-schema.ts";
import { formatDate, type Calendar, type CalendarDate } from "./calendar-model.ts";

export const extractKinds = ["timeline", "quotes", "people", "places", "orgs", "lore", "codex", "quests", "rumours", "gmNotes", "moments", "spotlights", "encounters", "next", "threads", "creatures", "items", "ties", "dates"] as const;
/** Kinds that start off: turned on with `on`. Every other kind starts on, and is turned off with `off`. */
export const offAtFirst: readonly ExtractKind[] = ["spotlights", "encounters", "creatures", "dates"];
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
  creatures: ["Creatures", "Monsters and beasts the party met, as creature pages."],
  items: ["Items and loot", "Added to whoever carries it, or a new item page. Plain gear like a torch is left out."],
  ties: ["Relationships", "New ties between people and groups."],
  dates: ["In-world dates", "Moves the campaign calendar on to the session's date."],
};
/** How the kinds are grouped in the settings. */
export const extractGroups: [string, ExtractKind[]][] = [
  ["On the session page", ["timeline", "quotes", "gmNotes"]],
  ["Highlights", ["moments", "spotlights", "encounters"]],
  ["For next time (GM only)", ["next", "threads"]],
  ["Pages", ["people", "creatures", "places", "orgs", "lore", "codex"]],
  ["Items, ties and dates", ["items", "ties", "dates"]],
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
  /** Where each kind goes, when it isn't where it starts (`whereAtFirst`). */
  where: z.record(z.enum(extractKinds), z.enum(["enc", "file", "both"])).optional(),
});
export type ExtractSettings = z.infer<typeof extractSchema>;

/** Where a kind goes: the Encyclopedia (the session page, or the check list), the session file, or both. */
export const wheres = ["enc", "file", "both"] as const;
export type Where = typeof wheres[number];
export const whereNames: Record<Where, string> = { enc: "Encyclopedia", file: "Session file", both: "Both" };
/** Kinds that sit on the session page. They start in both places, as the session file has always held the timeline, quotes and GM notes. */
export const sessionPageKinds: readonly ExtractKind[] = ["timeline", "quotes", "gmNotes", "moments", "spotlights", "encounters", "next", "threads"];
/** Where a kind starts: session page kinds in both, everything else (pages, quests, items, ties, dates) in the Encyclopedia. */
export const whereAtFirst = (k: ExtractKind): Where => sessionPageKinds.includes(k) ? "both" : "enc";
export const whereOf = (x: ExtractSettings | undefined, k: ExtractKind): Where => x?.where?.[k] ?? whereAtFirst(k);
/** Shown in the Encyclopedia: on the session page, or waiting in the check list. */
export const inEncyclopedia = (x: ExtractSettings | undefined, k: ExtractKind) => whereOf(x, k) !== "file";
/** Written in the session file (2-Story/Sessions/ in an export or a GitHub push, or downloaded). */
export const inFile = (x: ExtractSettings | undefined, k: ExtractKind) => whereOf(x, k) !== "enc";
export const setWhere = (x: ExtractSettings, k: ExtractKind, w: Where): ExtractSettings => {
  const rest = { ...(x.where ?? {}) }; delete rest[k];
  return { ...x, where: w === whereAtFirst(k) ? rest : { ...rest, [k]: w } };
};

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
  const where = Object.fromEntries(extractKinds.filter(k => whereOf(parsed, k) !== whereAtFirst(k)).map(k => [k, whereOf(parsed, k)]));
  const out: ExtractSettings = { ...(parsed.depth && parsed.depth !== "balanced" ? { depth: parsed.depth } : {}), ...(off.length ? { off } : {}), ...(on.length ? { on } : {}), ...(Object.keys(where).length ? { where } : {}) };
  return Object.keys(out).length ? out : undefined;
}

/** The parts of the New session recap dialog that start unticked: those with every kind in them turned off. */
export function partsOff(x: ExtractSettings | undefined): typeof recapParts[number][] {
  const off = (...k: ExtractKind[]) => k.every(y => !isOn(x, y));
  return [
    ...(off("timeline") ? ["timeline" as const] : []), ...(off("quotes") ? ["quotes" as const] : []),
    ...(off("people", "creatures", "places", "orgs", "lore", "codex", "items", "ties", "dates") ? ["found" as const] : []), ...(off("quests", "rumours") ? ["quests" as const] : []),
    ...(off("gmNotes") ? ["gmNotes" as const] : []),
  ];
}

const askNames: Record<ExtractKind, string> = {
  timeline: "the timeline", quotes: "quotes", people: "people (characters)", places: "places", orgs: "organizations (factions)", lore: "lore and notes",
  codex: "codex finds", quests: "moves on quests the campaign has", rumours: "new quests", gmNotes: "GM notes",
  moments: "key moments", spotlights: "character spotlights", encounters: "encounters", next: "party status and next steps", threads: "loose threads",
  creatures: "creatures", items: "items and loot (loot)", ties: "relationships (ties)", dates: "the in-world date (gameDate)",
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

/**
 * What to ask the AI for of creatures, items, relationships and the in-world date, when they are on, one line each. The date
 * needs the campaign's calendar, so the AI names a month it has.
 */
export function findAsks(x: ExtractSettings | undefined, calendar?: Calendar) {
  return [
    isOn(x, "creatures") ? "- found: creatures too: monsters and beasts the party met or fought, with kind: creature." : "",
    isOn(x, "items") ? "- loot: notable items and treasure the party got, each with item, who took it (a character's name, or party), qty when more than one, and a short note. Leave out plain gear like torches, rations or a common sword." : "",
    isOn(x, "ties") ? "- ties: relationships that began or changed, each with from and to (a person or group), kind (such as Ally of, Rival of, Sworn enemy of, Serves, Employs, Owes a debt to, Mentor of, In love with, Knows) and a short note." : "",
    isOn(x, "dates") && calendar ? `- gameDate: the in-world date at the end of the session, if it is said or clear, as day, month and year. Months on the campaign calendar: ${calendar.periods.map(p => p.name).join(", ")}. The calendar is at ${formatDate(calendar, calendar.current)} now.` : "",
  ].filter(Boolean);
}

/** The in-world date the AI sent, on the campaign calendar: a month it has (by name), a day in it, and a year (the calendar's own when left out). */
export function readGameDate(calendar: Calendar | undefined, d: { day?: number; month?: string; year?: number } | undefined): CalendarDate | null {
  if (!calendar || !d?.month?.trim()) return null;
  const m = d.month.trim().toLowerCase(), period = calendar.periods.find(p => p.name.toLowerCase() === m) ?? calendar.periods.find(p => p.name.toLowerCase().startsWith(m) || m.startsWith(p.name.toLowerCase()));
  if (!period) return null;
  const year = Number.isInteger(d.year) && d.year! >= 1 ? d.year! : calendar.current.year, day = Number.isInteger(d.day) && d.day! >= 1 ? d.day! : 1;
  const days = period.days + (period.id === calendar.leap.periodId ? calendar.leap.extraDays : 0);
  return day <= Math.max(1, days) && year <= 99999 ? { year, periodId: period.id, day } : null;
}

/** The depth to use: what this recap asked for, or the campaign's setting. */
export const depthFor = (x: ExtractSettings | undefined, r?: Pick<RecapRequest, "depth">) => r?.depth ?? x?.depth ?? "balanced";

const kindOfFind = (kind: string | undefined): ExtractKind => kind === "character" ? "people" : kind === "creature" ? "creatures" : kind === "place" ? "places" : kind === "faction" ? "orgs" : "lore";
type Finds = { found?: { kind?: string }[]; codex?: unknown[]; loot?: unknown[]; ties?: unknown[]; gameDate?: unknown };
type Highlights = { moments?: unknown[]; spotlights?: unknown[]; encounters?: unknown[]; threads?: unknown[]; next?: unknown[]; partyStatus?: string };
/** Drops what the AI sent of kinds the GM turned off. Quest moves and new quests are told apart once matched (see recaps.ts). */
export function honourExtract<T extends Finds & Highlights & { timeline?: unknown[]; quotes?: unknown[]; gmNotes?: string }>(input: T, x: ExtractSettings | undefined): T {
  const later = {
    ...(input.moments && !isOn(x, "moments") ? { moments: [] } : {}), ...(input.spotlights && !isOn(x, "spotlights") ? { spotlights: [] } : {}),
    ...(input.encounters && !isOn(x, "encounters") ? { encounters: [] } : {}), ...(input.threads && !isOn(x, "threads") ? { threads: [] } : {}),
    ...(!isOn(x, "next") ? { ...(input.next ? { next: [] } : {}), ...(input.partyStatus !== undefined ? { partyStatus: "" } : {}) } : {}),
    ...(input.found && !isOn(x, "creatures") ? { found: input.found.filter(f => f.kind !== "creature") } : {}),
    ...(input.loot && !isOn(x, "items") ? { loot: [] } : {}), ...(input.ties && !isOn(x, "ties") ? { ties: [] } : {}),
    ...(input.gameDate !== undefined && !isOn(x, "dates") ? { gameDate: undefined } : {}),
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

/** Which kind a check list item is. An update takes the kind of the page it changes. */
export function itemKind(i: Pick<RecapItem, "kind" | "pageKind">, page?: { kind: string; character?: { role?: string } }): ExtractKind {
  switch (i.kind) {
    case "newPage": return kindOfFind(i.pageKind);
    case "update": return !page ? "lore" : page.kind === "character" ? (page.character?.role === "creature" ? "creatures" : "people") : page.kind === "place" ? "places" : page.kind === "faction" ? "orgs" : page.kind === "quest" ? "quests" : "lore";
    case "questLog": return "quests";
    case "newQuest": return "rumours";
    case "codex": return "codex";
    case "loot": return "items";
    case "tie": return "ties";
    case "date": return "dates";
  }
}

/**
 * The recap as one place shows it: the session page in the Encyclopedia ("enc"), or the session file ("file"). Parts set
 * to go only to the other place are left out. The recap itself keeps them, so moving a kind back brings them back.
 */
export function recapIn(r: Recap, x: ExtractSettings | undefined, place: "enc" | "file"): Recap {
  const keep = (k: ExtractKind) => place === "enc" ? inEncyclopedia(x, k) : inFile(x, k);
  if (sessionPageKinds.every(keep)) return r;
  return {
    ...r,
    ...(keep("timeline") ? {} : { timeline: [] }), ...(keep("quotes") ? {} : { quotes: [] }), ...(keep("gmNotes") ? {} : { gmNotes: "" }),
    ...(keep("moments") ? {} : { moments: [] }), ...(keep("spotlights") ? {} : { spotlights: [] }), ...(keep("encounters") ? {} : { encounters: [] }),
    ...(keep("next") ? {} : { partyStatus: undefined, next: [] }), ...(keep("threads") ? {} : { threads: [] }),
  };
}
