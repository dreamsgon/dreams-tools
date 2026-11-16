/* What a bridge key syncs and which way, without the server: shared by lib/bridge/keys.ts and the Other tables dialog. */
export const syncKinds = ["characters", "pages", "quests", "recaps", "scenes", "tokens", "markers", "tables", "calendar", "initiative", "rolls"] as const;
export type SyncKind = (typeof syncKinds)[number];
/** "to": RPG Tools → the other table. "from": the other table → RPG Tools. */
export const directions = ["both", "to", "from", "off"] as const;
export type Direction = (typeof directions)[number];
export type Sync = Record<SyncKind, Direction>;
export const bridgeClients = ["foundry", "unreal", "other"] as const;
export type BridgeClient = (typeof bridgeClients)[number];
export const clientNames: Record<BridgeClient, string> = { foundry: "Foundry VTT", unreal: "Unreal Engine VTT", other: "Another app" };

/** What each kind is, for the dialog and for /api/bridge. `ready` kinds have endpoints now; the rest come with the Foundry module. */
export const syncInfo: Record<SyncKind, { name: string; there: string; ready: boolean }> = {
  characters: { name: "Characters", there: "Actors, as RPG Tools sheets", ready: true },
  pages: { name: "Places, lore, organizations, notes", there: "Journal pages in matching folders", ready: true },
  quests: { name: "Quests and the quest log", there: "A journal per quest", ready: true },
  recaps: { name: "Session recaps", there: "Journals in a Sessions folder", ready: true },
  scenes: { name: "Maptable scenes", there: "Scenes with grid, walls, doors and fog", ready: false },
  tokens: { name: "Tokens, HP and conditions", there: "Tokens linked to actors", ready: false },
  markers: { name: "Map markers and world map places", there: "Map notes", ready: false },
  tables: { name: "Random tables", there: "Rollable tables", ready: false },
  calendar: { name: "Calendar date and weather", there: "World time", ready: false },
  initiative: { name: "Initiative", there: "Combat tracker", ready: false },
  rolls: { name: "Roll log", there: "Chat rolls, to the campaign’s Discord", ready: true },
};
/** Lore starts one way, from RPG Tools, so another table can't overwrite the Encyclopedia by accident. */
export const defaultSync: Sync = { characters: "both", pages: "to", quests: "both", recaps: "to", scenes: "both", tokens: "both", markers: "to", tables: "both", calendar: "to", initiative: "both", rolls: "from" };
/** Whether the bridge may read (`to`) or write (`from`) this kind. */
export const allows = (sync: Sync, kind: SyncKind, way: "to" | "from") => sync[kind] === "both" || sync[kind] === way;

export const isClient = (v: unknown): v is BridgeClient => typeof v === "string" && (bridgeClients as readonly string[]).includes(v);
/** A full sync setting from what was sent: unknown kinds and directions are dropped, missing kinds keep `base`. */
export function cleanSync(v: unknown, base: Sync = defaultSync): Sync {
  const out = { ...base };
  if (v && typeof v === "object") for (const k of syncKinds) {
    const d = (v as Record<string, unknown>)[k];
    if (typeof d === "string" && (directions as readonly string[]).includes(d)) out[k] = d as Direction;
  }
  return out;
}
