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
export const objectiveSchema = z.object({ id: qid, text: z.string().trim().min(1).max(300), done: z.boolean(), hidden: z.boolean().optional() });
export const questLogSchema = z.object({
  id: qid,
  /** When it was written (ISO). */
  at: z.string().max(40),
  /** A short label such as "Session 12" or an in-game date. */
  label: z.string().trim().max(80).optional(),
  text: z.string().max(4000),
  /** Players see this entry when the quest is shared. */
  players: z.boolean(),
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
  objectives: z.array(objectiveSchema).max(50),
  log: z.array(questLogSchema).max(500),
});
export type Quest = z.infer<typeof questSchema>;
export type Objective = z.infer<typeof objectiveSchema>;
export type QuestLog = z.infer<typeof questLogSchema>;

export const newQuest = (state: QuestState = "active", type = "side"): Quest => ({ state, type, objectives: [], log: [] });

/** Steps done and in total, counting every objective the GM wrote. */
export function questProgress(q: Quest) {
  return { done: q.objectives.filter(o => o.done).length, total: q.objectives.length };
}
export const nextStep = (q: Quest) => q.objectives.find(o => !o.done)?.text ?? null;

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
export function playerQuest(q: Quest, readable: (id: string) => boolean, clean: (text: string) => string, categories: QuestCategory[] = defaultQuestCategories()) {
  const category = categoryOf(categories, q.type);
  return {
    state: q.state, type: q.type, category: { name: category.name, color: category.color }, reward: q.reward ?? "",
    giverId: q.giverId && readable(q.giverId) ? q.giverId : null,
    placeId: q.placeId && readable(q.placeId) ? q.placeId : null,
    objectives: q.objectives.filter(o => !o.hidden).map(o => ({ id: o.id, text: o.text, done: o.done })),
    log: q.log.filter(l => l.players).map(l => ({ id: l.id, at: l.at, label: l.label ?? "", text: unlink(clean(l.text)) })),
  };
}
export type PlayerQuest = ReturnType<typeof playerQuest>;
