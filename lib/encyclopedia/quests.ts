import { z } from "zod";
import { hexColour } from "../colour.ts";

/*
 * Quests: a page of kind "quest" with a state on the quest board, objectives and a journal log.
 * Players see a quest only when its Overview is shared, and then only the objectives and log
 * entries the GM has not hidden (see `playerQuest`).
 */

export const questStates = ["rumour", "active", "done", "failed"] as const;
export type QuestState = typeof questStates[number];
export const stateNames: Record<QuestState, string> = { rumour: "Rumours", active: "Active", done: "Done", failed: "Failed" };

const qid = z.string().min(1).max(100);

/*
 * Quest categories belong to a campaign. A quest's `type` is the id of one of them. A campaign that
 * never edited its categories has Main, Side and Personal, whose ids are the old fixed quest types,
 * so quests saved before categories existed keep theirs.
 */
export const categoryColors = ["accent", "grey", "purple", "teal", "orange", "gold", "rose"] as const;
/** One of the named colours, or any colour picked with the colour picker (#rrggbb). */
export type CategoryColor = typeof categoryColors[number] | `#${string}`;
export const maxQuestCategories = 20;
export const questCategorySchema = z.object({ id: qid.regex(/^[a-zA-Z0-9_-]+$/), name: z.string().trim().min(1).max(40), color: z.union([z.enum(categoryColors), hexColour]) });
export type QuestCategory = z.infer<typeof questCategorySchema>;
export const questCategoriesSchema = z.array(questCategorySchema).min(1).max(maxQuestCategories)
  .refine(c => new Set(c.map(x => x.id)).size === c.length, "Each quest category needs its own id");
export const defaultQuestCategories = (): QuestCategory[] => [
  { id: "main", name: "Main", color: "accent" }, { id: "side", name: "Side", color: "grey" }, { id: "personal", name: "Personal", color: "purple" },
];
/** A campaign's categories in its order. */
export const questCategories = (campaign?: { questCategories?: QuestCategory[] } | null) =>
  campaign?.questCategories?.length ? campaign.questCategories : defaultQuestCategories();
/** The category a quest is in. A quest whose category is gone shows as "Uncategorised" until it is moved. */
export function categoryOf(categories: QuestCategory[], type: string): QuestCategory {
  return categories.find(c => c.id === type) ?? { id: type, name: "Uncategorised", color: "grey" };
}
/** The category new quests go in: Side when the campaign has it, otherwise the first. */
export const defaultCategory = (categories: QuestCategory[]) => (categories.find(c => c.id === "side") ?? categories[0])?.id ?? "side";
/**
 * A goal (objective). `text` is always a readable sentence, so older code, the AI tools and players can show it as it is.
 * A goal built from parts also has a verb, a target (a page, or just a name) and an optional second part such as
 * "last seen at the Old Mill"; its `text` is rebuilt from those parts whenever they change (see `goalText`).
 * A goal with no verb is written out by hand. `done` stays the source of truth for Done; `status` adds Failed and Dropped.
 */
export const goalStatuses = ["todo", "done", "failed", "dropped"] as const;
export type GoalStatus = typeof goalStatuses[number];
export const goalStatusNames: Record<GoalStatus, string> = { todo: "To do", done: "Done", failed: "Failed", dropped: "Dropped" };
const pageName = z.string().trim().max(160).optional();
export const objectiveSchema = z.object({
  id: qid, text: z.string().trim().min(1).max(300), done: z.boolean(), hidden: z.boolean().optional(),
  /** What the party must do: one of `goalVerbs` or the GM's own word. */
  verb: z.string().trim().min(1).max(40).optional(),
  /** Who or what: a page in the campaign, and its name (kept so the goal still reads if the page goes). */
  targetId: qid.nullable().optional(), target: pageName,
  /** A second part, such as where they were last seen or who it goes to. */
  whereId: qid.nullable().optional(), where: pageName,
  /** The words before the second part when they aren't the verb's own ("last seen at", "to"…). */
  whereLabel: z.string().trim().max(40).optional(),
  /** Failed or Dropped. A goal that is neither is To do, or Done when `done` is set. */
  status: z.enum(["failed", "dropped"]).optional(),
  /** A line on what to do or where to start. */
  note: z.string().trim().max(600).optional(),
});
export const questLogSchema = z.object({
  id: qid,
  /** When it was written (ISO). */
  at: z.string().max(40),
  /** A short label such as "Session 12" or an in-game date. */
  label: z.string().trim().max(80).optional(),
  text: z.string().max(4000),
  /** Players see this entry when the quest is shared. */
  players: z.boolean(),
  /** Who wrote it when it wasn't the GM: a member's name, and a keyed hash that says it was them (see `linkerKey`). */
  author: z.string().trim().min(1).max(80).optional(),
  authorId: z.string().regex(/^[a-f0-9]{32}$/).optional(),
  /** When a member last changed their own entry. */
  editedAt: z.string().max(40).optional(),
});
export const questSchema = z.object({
  state: z.enum(questStates),
  /** The id of one of the campaign’s quest categories. */
  type: qid,
  /** Order of the card inside its board column. */
  rank: z.number().finite().optional(),
  giverId: qid.nullable().optional(),
  placeId: qid.nullable().optional(),
  reward: z.string().trim().max(300).optional(),
  /** Pages the party gets (an item, a deed, a ship), beside the reward's words. */
  rewardIds: z.array(qid).max(20).optional(),
  /** Pages the GM linked to the quest by hand, shown with the ones worked out from it on the Connections tab. */
  linkIds: z.array(qid).max(50).optional(),
  /** Players don't see the reward until the GM shows it. */
  rewardHidden: z.boolean().optional(),
  /** The GM's private preparation: what is really going on. Never sent to players or a players-only AI. */
  prep: z.string().max(20000).optional(),
  objectives: z.array(objectiveSchema).max(50),
  log: z.array(questLogSchema).max(500),
});
export type Quest = z.infer<typeof questSchema>;
export type Objective = z.infer<typeof objectiveSchema>;
export type QuestLog = z.infer<typeof questLogSchema>;

export const newQuest = (state: QuestState = "active", type = "side"): Quest => ({ state, type, objectives: [], log: [] });

/** The verbs offered for a goal, with the words that lead into its second part. */
export const goalVerbs = [
  { name: "Find", where: "last seen at" }, { name: "Rescue", where: "held at" }, { name: "Recover", where: "from" },
  { name: "Deliver", where: "to" }, { name: "Investigate", where: "at" }, { name: "Defeat", where: "at" },
  { name: "Escort", where: "to" }, { name: "Reach", where: "by way of" }, { name: "Protect", where: "from" },
  { name: "Persuade", where: "to" }, { name: "Learn", where: "from" }, { name: "Meet", where: "at" },
] as const;
/** The words before a goal's second part: its own, or its verb's, or "at" for a verb of the GM's own. */
export const whereLabel = (o: Pick<Objective, "verb" | "whereLabel">) =>
  o.whereLabel || goalVerbs.find(v => v.name.toLowerCase() === o.verb?.toLowerCase())?.where || "at";

export const goalStatus = (o: Pick<Objective, "done" | "status">): GoalStatus => o.done ? "done" : o.status ?? "todo";
/** A goal with a new status. Done sets `done`; the others clear it. */
export function withGoalStatus<O extends Objective>(o: O, status: GoalStatus): O {
  const next = { ...o, done: status === "done" };
  if (status === "failed" || status === "dropped") next.status = status; else delete next.status;
  return next;
}

/**
 * The sentence a goal reads as, from its parts: "Find Arin Vale, last seen at the Old Mill". `title` gives a linked
 * page's current name, so a renamed page reads right. A goal written by hand reads as its text.
 */
export function goalText(o: Objective, title: (id: string) => string | undefined = () => undefined): string {
  if (!o.verb) return o.text;
  const target = (o.targetId && title(o.targetId)) || o.target || "";
  const where = (o.whereId && title(o.whereId)) || o.where || "";
  return `${o.verb}${target ? ` ${target}` : ""}${where ? `, ${whereLabel(o)} ${where}` : ""}`.slice(0, 300);
}
/** A goal with its parts changed and its text rebuilt to match. */
export function setGoalParts(o: Objective, patch: Partial<Pick<Objective, "verb" | "targetId" | "target" | "whereId" | "where" | "whereLabel">>, title?: (id: string) => string | undefined): Objective {
  const next = { ...o, ...patch };
  for (const k of ["targetId", "target", "whereId", "where", "whereLabel"] as const) if (next[k] === undefined || next[k] === null || next[k] === "") delete next[k];
  return { ...next, text: goalText(next, title) || next.verb || o.text };
}

/** Goals done and in total. Dropped goals don't count; failed ones do. */
export function questProgress(q: Quest) {
  const counted = q.objectives.filter(o => goalStatus(o) !== "dropped");
  return { done: counted.filter(o => o.done).length, total: counted.length };
}
/** The first goal still to do. */
export const nextStep = (q: Quest) => q.objectives.find(o => goalStatus(o) === "todo")?.text ?? null;

type QuestEntry = { id: string; worldId: string; campaignId: string | null; kind: string; title: string; quest?: Quest; updatedAt: string };
type HasEntries<E> = { entries: E[] };

/** The quests in one campaign (and shared lore), with their data filled in. */
export function questsIn<E extends QuestEntry>(s: HasEntries<E>, worldId: string, campaignId: string | null) {
  return s.entries.filter(e => e.kind === "quest" && e.worldId === worldId && (e.campaignId === null || e.campaignId === campaignId))
    .map(e => ({ entry: e, quest: e.quest ?? newQuest() }));
}

/** A column of the board, top first. */
export function column<E extends QuestEntry>(s: HasEntries<E>, worldId: string, campaignId: string | null, state: QuestState) {
  return questsIn(s, worldId, campaignId).filter(q => q.quest.state === state)
    .sort((a, b) => (a.quest.rank ?? 1e9) - (b.quest.rank ?? 1e9) || b.entry.updatedAt.localeCompare(a.entry.updatedAt));
}

/** Moves a quest to a column, before another card or to the end, and renumbers that column. */
export function moveQuest<E extends QuestEntry, S extends HasEntries<E>>(s: S, worldId: string, campaignId: string | null, id: string, state: QuestState, beforeId: string | null, now = new Date().toISOString()): S {
  const moving = s.entries.find(e => e.id === id);
  if (!moving || moving.kind !== "quest") return s;
  const cards = column(s, worldId, campaignId, state).filter(q => q.entry.id !== id).map(q => q.entry.id);
  const at = beforeId ? cards.indexOf(beforeId) : -1;
  cards.splice(at < 0 ? cards.length : at, 0, id);
  const rank = new Map(cards.map((cid, i) => [cid, i]));
  return { ...s, entries: s.entries.map(e => {
    if (!rank.has(e.id)) return e;
    const q = e.quest ?? newQuest();
    const changed = e.id === id && q.state !== state;
    return { ...e, quest: { ...q, state: e.id === id ? state : q.state, rank: rank.get(e.id) }, ...(changed ? { updatedAt: now } : {}) };
  }) };
}

type HasCampaigns<E> = HasEntries<E> & { campaigns: { id: string; questCategories?: QuestCategory[] }[] };
const withCategories = <E, S extends HasCampaigns<E>>(s: S, campaignId: string, categories: QuestCategory[]): S =>
  ({ ...s, campaigns: s.campaigns.map(c => c.id === campaignId ? { ...c, questCategories: categories } : c) });

/** Saves a campaign's categories (renamed, recoloured, added or reordered). Blank names keep the old name. */
export function setQuestCategories<E, S extends HasCampaigns<E>>(s: S, campaignId: string, categories: QuestCategory[]): S {
  const clean = categories.map(c => ({ ...c, name: c.name.trim().slice(0, 40) })).filter(c => c.name).slice(0, maxQuestCategories);
  return clean.length && new Set(clean.map(c => c.id)).size === clean.length ? withCategories(s, campaignId, clean) : s;
}

/**
 * Removes a category and moves the quests in it (the ones this campaign sees) to another category.
 * A campaign keeps at least one category.
 */
export function removeQuestCategory<E extends QuestEntry, S extends HasCampaigns<E>>(s: S, worldId: string, campaignId: string, id: string, moveTo: string, now = new Date().toISOString()): S {
  const campaign = s.campaigns.find(c => c.id === campaignId);
  if (!campaign) return s;
  const categories = questCategories(campaign), rest = categories.filter(c => c.id !== id);
  if (rest.length === categories.length || !rest.some(c => c.id === moveTo)) return s;
  const moving = new Set(questsIn(s, worldId, campaignId).filter(q => q.quest.type === id).map(q => q.entry.id));
  const next = withCategories(s, campaignId, rest);
  return { ...next, entries: next.entries.map(e => moving.has(e.id) ? { ...e, quest: { ...(e.quest ?? newQuest()), type: moveTo }, updatedAt: now } : e) };
}

/** Links read as their words in the player journal. */
const unlink = (t: string) => t.replace(/\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/g, (_, target: string, label?: string) => label?.trim() || target);

/** What players get: never hidden objectives, GM-only log entries, or links to pages they can’t read. */
export function playerQuest(q: Quest, readable: (id: string) => boolean, clean: (text: string) => string, categories: QuestCategory[] = defaultQuestCategories(), linker?: string) {
  const category = categoryOf(categories, q.type);
  return {
    state: q.state, type: q.type, category: { name: category.name, color: category.color },
    reward: q.rewardHidden ? "" : q.reward ?? "", rewardIds: q.rewardHidden ? [] : (q.rewardIds ?? []).filter(readable), rewardHidden: !!q.rewardHidden,
    giverId: q.giverId && readable(q.giverId) ? q.giverId : null,
    placeId: q.placeId && readable(q.placeId) ? q.placeId : null,
    objectives: q.objectives.filter(o => !o.hidden).map(o => ({
      id: o.id, text: o.text, done: o.done, status: goalStatus(o),
      ...(o.verb ? { verb: o.verb, target: o.target ?? "", targetId: o.targetId && readable(o.targetId) ? o.targetId : null, where: o.where ?? "", whereId: o.whereId && readable(o.whereId) ? o.whereId : null, whereLabel: o.where || o.whereId ? whereLabel(o) : "" } : {}),
      ...(o.note ? { note: clean(o.note) } : {}),
    })),
    // The author's name, never their hash; `mine` marks the asking member's own entries so they can change them.
    log: q.log.filter(l => l.players).map(l => ({ id: l.id, at: l.at, label: l.label ?? "", text: unlink(clean(l.text)), author: l.author ?? "", edited: !!l.editedAt, mine: !!linker && l.authorId === linker })),
  };
}
export type PlayerQuest = ReturnType<typeof playerQuest>;
