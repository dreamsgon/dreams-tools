import type { EntryKind } from "./entry-kinds.ts";
import { compareEntries, type Entry } from "./world-model.ts";

/*
 * Campaign Notes in the sidebar, grouped by type: the top-level pages sit under Characters, Places, Sessions and so on
 * instead of all in one list. Only the view is grouped; no page moves. A folder goes with the type most of the pages
 * inside it have (Cultists full of characters sits under Characters); an empty folder goes under Folders.
 */

export type TypeGroupId = "characters" | "places" | "orgs" | "quests" | "sessions" | "lore" | "notes" | "folders";
/** A kind whose icon stands for the group. */
export const typeGroupIcon: Record<TypeGroupId, EntryKind> = { characters: "character", places: "place", orgs: "faction", quests: "quest", sessions: "session", lore: "lore", notes: "note", folders: "folder" };
export const typeGroupLabels: Record<TypeGroupId, string> = { characters: "Characters", places: "Places", orgs: "Organizations", quests: "Quests", sessions: "Sessions", lore: "Lore", notes: "Notes", folders: "Folders" };
const order: TypeGroupId[] = ["characters", "places", "orgs", "quests", "sessions", "lore", "notes", "folders"];

const groupOfKind: Record<EntryKind, TypeGroupId> = {
  character: "characters", place: "places", map: "places", galaxy: "places", sector: "places", system: "places",
  faction: "orgs", quest: "quests", session: "sessions", lore: "lore", timeline: "lore",
  note: "notes", page: "notes", tasks: "notes", other: "notes", store: "notes", vehicle: "notes", folder: "folders",
};

/** The group a top-level page sits under. */
export function typeGroupOf(entries: readonly Entry[], entry: Entry): TypeGroupId {
  if (entry.kind !== "folder") return groupOfKind[entry.kind];
  const counts = new Map<TypeGroupId, number>(), seen = new Set([entry.id]), queue = [entry.id];
  while (queue.length) {
    const at = queue.pop()!;
    for (const e of entries) if (e.parentId === at && !seen.has(e.id)) { seen.add(e.id); queue.push(e.id); if (e.kind !== "folder") counts.set(groupOfKind[e.kind], (counts.get(groupOfKind[e.kind]) ?? 0) + 1); }
  }
  let best: TypeGroupId = "folders", most = 0;
  for (const g of order) if ((counts.get(g) ?? 0) > most) { best = g; most = counts.get(g)!; }
  return best;
}

/** The top-level pages of `entries`, by group, in the groups' order; groups with nothing in them are left out. */
export function typeGroups(entries: readonly Entry[]): { id: TypeGroupId; label: string; pages: Entry[] }[] {
  const top = entries.filter(e => e.parentId === null).sort(compareEntries);
  return order.map(id => ({ id, label: typeGroupLabels[id], pages: top.filter(e => typeGroupOf(entries, e) === id) })).filter(g => g.pages.length);
}
