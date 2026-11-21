/*
 * The kinds of Wiki page (Entry["kind"]) in one place: their names, the groups the New entry picker shows them in,
 * and what changing a page from one kind to another keeps and loses. A GM's own entry types are page templates
 * (templates.ts) with a name and an icon, built on one of these kinds.
 */
export const ENTRY_KINDS = ["folder", "note", "character", "place", "faction", "lore", "session", "tasks", "map", "quest", "vehicle", "store", "galaxy", "sector", "system", "page", "other"] as const;
export type EntryKind = typeof ENTRY_KINDS[number];

export const KIND_LABELS: Record<EntryKind, string> = {
  page: "Page", note: "Note", other: "Other", folder: "Folder", character: "Character", place: "Place", faction: "Organization",
  lore: "Lore", session: "Session", tasks: "Checklist", quest: "Quest", map: "Map", vehicle: "Vehicle", store: "Store",
  galaxy: "Galaxy", sector: "Sector", system: "Star system",
};

/** One line under each kind in the picker. */
export const KIND_HINTS: Record<EntryKind, string> = {
  page: "Plain article", note: "Quick notes", other: "Anything else", folder: "Holds other pages", character: "Person or creature",
  place: "Town, region, dungeon", faction: "Guild, house, army", lore: "History, item, legend", session: "One game's notes",
  tasks: "Tick-box list", quest: "Goals and rewards", map: "Painted or uploaded", vehicle: "Ship, cart, mech", store: "Shop or stash",
  galaxy: "Spiral of stars", sector: "Hex map of systems", system: "Star and its worlds",
};

/** The New entry picker's groups, in order. */
export const KIND_GROUPS: { name: string; kinds: EntryKind[] }[] = [
  { name: "Writing", kinds: ["page", "note", "lore", "other", "folder", "tasks"] },
  { name: "People and places", kinds: ["character", "place", "faction", "map"] },
  { name: "At the table", kinds: ["session", "quest", "store", "vehicle"] },
  { name: "Space", kinds: ["galaxy", "sector", "system"] },
];

/** Kinds that behave like a Note: text and tabs, nothing of their own. */
export const PLAIN_KINDS: readonly EntryKind[] = ["note", "page", "other", "lore", "place", "folder", "tasks"];

/** What only one kind of page carries, and what a reader would call it. */
const OWN: { key: "mapData" | "quest" | "recap" | "org" | "profile" | "character" | "vehicle" | "store" | "galaxy" | "sector" | "starSystem" | "planet" | "hiddenTabs"; kind: EntryKind; name: string }[] = [
  { key: "mapData", kind: "map", name: "the map" }, { key: "quest", kind: "quest", name: "the quest's goals and rewards" },
  { key: "recap", kind: "session", name: "the session recap" }, { key: "org", kind: "faction", name: "the organization profile" },
  { key: "profile", kind: "character", name: "the character Profile" }, { key: "character", kind: "character", name: "the stats, inventory and spells" },
  { key: "hiddenTabs", kind: "character", name: "" },
  { key: "vehicle", kind: "vehicle", name: "the vehicle's stats and crew" }, { key: "store", kind: "store", name: "the store's stock" },
  { key: "galaxy", kind: "galaxy", name: "the galaxy" }, { key: "sector", kind: "sector", name: "the sector hex map" },
  { key: "starSystem", kind: "system", name: "the survey chart" }, { key: "planet", kind: "place", name: "the charted world" },
];

type Changeable = { kind: EntryKind } & Partial<Record<(typeof OWN)[number]["key"], unknown>>;

/** What a page would lose by becoming `to`: names for the confirm, most important first. Text, tabs, tags and links always stay. */
export function kindChangeLoses(e: Changeable, to: EntryKind): string[] {
  if (e.kind === to) return [];
  return [...new Set(OWN.filter(o => o.kind !== to && e[o.key] !== undefined && o.name).map(o => o.name))];
}

/** The page's own parts that don't belong on a `to` page, left out. The caller adds what a new `to` page starts with. */
export function stripForKind<T extends Changeable>(e: T, to: EntryKind): T {
  const out = { ...e, kind: to };
  for (const o of OWN) if (o.kind !== to) delete out[o.key];
  return out;
}
