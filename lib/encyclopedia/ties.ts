import { z } from "zod";
import { oid, standings, standingNames, text, type Standing } from "./org-profile.ts";

/*
 * Ties: a typed relationship from one page to another (Parent of, Rival of, Owes a debt to, Sails from…). A tie is
 * stored once, on the page it starts from (`entry.ties`), and shows on both pages. Any two pages can be tied: people,
 * organizations, places, lore, vehicles, quests. The kinds of tie come built in, in eight groups; a world can rename
 * them and add its own (`world.tieTypes`). Everything here is pure: the schemas, the built-in kinds, and labels.
 * Working out a page's ties from the whole workspace is in tie-connections.ts.
 */

const label = (max: number) => z.string().trim().min(1).max(max);

/** Kinds of page a tie can join. Folders, maps of tasks and the like are left out. */
export const tiePageKinds = ["character", "faction", "place", "lore", "vehicle", "quest", "note", "session", "map"] as const;
export type TiePageKind = typeof tiePageKinds[number];
export const tiePageKindNames: Record<TiePageKind, string> = { character: "Character", faction: "Organization", place: "Place", lore: "Lore", vehicle: "Vehicle", quest: "Quest", note: "Note", session: "Session", map: "Map" };
export const isTiePageKind = (k: string): k is TiePageKind => (tiePageKinds as readonly string[]).includes(k);

export const tieGroups = ["family", "heart", "conflict", "allegiance", "guidance", "dealings", "belonging", "other"] as const;
export type TieGroup = typeof tieGroups[number];
export const tieGroupInfo: Record<TieGroup, { name: string; about: string }> = {
  family: { name: "Family", about: "Blood, marriage and wards" },
  heart: { name: "Heart", about: "Love, longing and old flames" },
  conflict: { name: "Conflict", about: "Rivals, enemies and grudges" },
  allegiance: { name: "Allegiance", about: "Who serves, rules or belongs" },
  guidance: { name: "Guidance", about: "Teachers and patrons" },
  dealings: { name: "Dealings", about: "Debts, work and leverage" },
  belonging: { name: "Belonging", about: "Owning, carrying, being based somewhere" },
  other: { name: "Other", about: "Anything else" },
};
/** How a kind of tie draws on a family tree. */
export const treeRoles = ["parent", "partner", "sibling", "ward"] as const;
export type TreeRole = typeof treeRoles[number];
export const treeRoleNames: Record<TreeRole, string> = { parent: "As a parent and child", partner: "As partners", sibling: "As siblings", ward: "As a guardian and ward" };

export const tieTypeSchema = z.object({
  id: oid, name: label(40),
  /** What it is called from the other page (Child of for Parent of). Left out when it reads the same both ways. */
  reverse: text(40).optional(), both: z.boolean().optional(),
  group: z.enum(tieGroups),
  /** Kinds of page it can start from and go to. */
  from: z.array(z.enum(tiePageKinds)).min(1).max(tiePageKinds.length), to: z.array(z.enum(tiePageKinds)).min(1).max(tiePageKinds.length),
  tree: z.enum(treeRoles).optional(),
  /** Made by the GM. A built-in kind the GM renamed is stored under its own id without this. */
  custom: z.boolean().optional(),
});
export type TieType = z.infer<typeof tieTypeSchema>;
export const maxTieTypes = 60;
export const tieTypesSchema = z.array(tieTypeSchema).max(maxTieTypes).refine(list => new Set(list.map(t => t.id)).size === list.length, "Kind of tie ids must be unique");

const C: TiePageKind[] = ["character"], CF: TiePageKind[] = ["character", "faction"], ANY: TiePageKind[] = [...tiePageKinds];
const t = (id: string, group: TieGroup, name: string, reverse: string | null, from: TiePageKind[], to: TiePageKind[], tree?: TreeRole): TieType =>
  ({ id, name, ...(reverse ? { reverse } : { both: true }), group, from, to, ...(tree ? { tree } : {}) });
/** The kinds of tie every world starts with, in the order they are offered. */
export const builtInTieTypes: readonly TieType[] = [
  t("parent", "family", "Parent of", "Child of", C, C, "parent"),
  t("partner", "family", "Married to", null, C, C, "partner"),
  t("sibling", "family", "Sibling of", null, C, C, "sibling"),
  t("ward", "family", "Guardian of", "Ward of", C, C, "ward"),
  t("lover", "heart", "In love with", "Loved by", C, C),
  t("betrothed", "heart", "Betrothed to", null, C, C),
  t("former", "heart", "Former lover of", null, C, C),
  t("rival", "conflict", "Rival of", null, CF, CF),
  t("enemy", "conflict", "Sworn enemy of", null, CF, CF),
  t("wronged", "conflict", "Wronged", "Wronged by", CF, CF),
  t("rules", "allegiance", "Rules", "Ruled by", CF, ["place", "faction"]),
  t("serves", "allegiance", "Serves", "Served by", CF, ["character", "faction", "place"]),
  t("ally", "allegiance", "Allied with", null, CF, CF),
  t("mentor", "guidance", "Mentor of", "Student of", C, C),
  t("patron", "guidance", "Patron of", "Protégé of", CF, CF),
  t("debt", "dealings", "Owes a debt to", "Is owed by", CF, CF),
  t("employs", "dealings", "Employs", "Works for", CF, C),
  t("blackmail", "dealings", "Blackmails", "Blackmailed by", CF, CF),
  t("trade", "dealings", "Trades with", null, CF, CF),
  t("owns", "belonging", "Owns", "Owned by", CF, ["lore", "vehicle", "place"]),
  t("carries", "belonging", "Carries", "Carried by", C, ["lore"]),
  t("based", "belonging", "Based at", "Base of", ["character", "faction", "vehicle"], ["place"]),
  t("made", "belonging", "Made", "Made by", CF, ["lore", "vehicle", "place"]),
  t("knows", "other", "Knows", null, CF, CF),
  t("linked", "other", "Connected to", null, ANY, ANY),
];
const builtInIds = new Set(builtInTieTypes.map(x => x.id));
export const isBuiltInTieType = (id: string) => builtInIds.has(id);

/** A world's kinds of tie: the built-in ones (as the GM renamed them), then the GM's own. */
export function tieTypesOf(world?: { tieTypes?: TieType[] } | null): TieType[] {
  const saved = new Map((world?.tieTypes ?? []).map(x => [x.id, x]));
  const builtIn = builtInTieTypes.map(b => { const o = saved.get(b.id); return o && !o.custom ? { ...o } : b; });
  return [...builtIn, ...(world?.tieTypes ?? []).filter(x => x.custom && !builtInIds.has(x.id))];
}
/** The kind with this id, or Connected to when it is gone. */
export const tieTypeById = (types: TieType[], id: string): TieType => types.find(x => x.id === id) ?? types.find(x => x.id === "linked") ?? builtInTieTypes[builtInTieTypes.length - 1];
/** Saves one kind of tie on a world's list, keeping only built-in kinds that differ from how they ship. */
export function withTieType(saved: TieType[] | undefined, type: TieType): TieType[] | undefined {
  const rest = (saved ?? []).filter(x => x.id !== type.id), base = builtInTieTypes.find(b => b.id === type.id);
  const same = base && JSON.stringify(clean(base)) === JSON.stringify(clean({ ...type, custom: undefined }));
  const next = same ? rest : [...rest, base ? { ...type, custom: undefined } : { ...type, custom: true }];
  return next.length ? next.map(clean) : undefined;
}
export function withoutTieType(saved: TieType[] | undefined, id: string): TieType[] | undefined {
  const next = (saved ?? []).filter(x => x.id !== id);
  return next.length ? next : undefined;
}
function clean(x: TieType): TieType {
  const out: TieType = { id: x.id, name: x.name, group: x.group, from: [...x.from], to: [...x.to] };
  if (x.both) out.both = true; else if (x.reverse) out.reverse = x.reverse;
  if (x.tree) out.tree = x.tree;
  if (x.custom) out.custom = true;
  return out;
}
/** Whether a kind of tie can go from a page of this kind to a page of that kind. */
export const tieFits = (type: TieType, from: string, to: string) => (type.from as string[]).includes(from) && (type.to as string[]).includes(to);
/** What the tie is called from one end: its name from where it starts, its reverse name from where it goes. */
export const tieLabel = (type: TieType, fromStart: boolean) => type.both || fromStart || !type.reverse ? type.name : type.reverse;

export const tieCoverSchema = z.object({ typeId: oid, reversed: z.boolean().optional(), note: text(300).optional() });
export const tieSchema = z.object({
  id: oid, toId: oid, typeId: oid,
  note: text(300).optional(),
  /** When it began and ended, as written (a year or a date on the campaign calendar). */
  since: text(40).optional(), until: text(40).optional(),
  /** How each side feels about the other, in the standings organizations use. */
  feelFrom: z.enum(standings).optional(), feelTo: z.enum(standings).optional(),
  gm: z.boolean().optional(),
  /** On a GM-only tie: what players believe instead (another kind of tie between the same two pages). */
  cover: tieCoverSchema.optional(),
});
export type Tie = z.infer<typeof tieSchema>;
export type TieCover = z.infer<typeof tieCoverSchema>;
export const maxTies = 100;
export const tiesSchema = z.array(tieSchema).max(maxTies);
export const feelingName = (s?: Standing) => s ? standingNames[s] : "";

/** Every page a page's ties point at. */
export const tieRefs = (ties?: Tie[]) => (ties ?? []).map(x => x.toId);
/** Points ties at new page ids (an import gives every page a new id); ties to pages not in the map are dropped. */
export function remapTies(ties: Tie[] | undefined, ids: ReadonlyMap<string, string>): Tie[] | undefined {
  if (!ties) return undefined;
  const next = ties.filter(x => ids.has(x.toId)).map(x => ({ ...x, toId: ids.get(x.toId)! }));
  return next.length ? next : undefined;
}
/** The words Ctrl K searches. */
export const tieSearchText = (ties?: Tie[]) => (ties ?? []).map(x => [x.note, x.cover?.note].filter(Boolean).join(" ")).join(" ");
