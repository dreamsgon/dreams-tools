import { z } from "zod";
import { parseDice } from "../rolls.ts";
import { statRollDice, statRolls, type StatRoll } from "./stat-rolls.ts";

/*
 * Inventories and spell lists on characters, for any game. The campaign's item settings (`campaign.items`) name the
 * coins and what each is worth, how a load is counted, the item categories, what the game calls its spells and how
 * they are grouped, and what players may change. A character keeps its money and items (`character.inventory`) and its
 * spells, powers or prayers (`character.spells`). Every item and spell has its own eye, and an item can carry a GM
 * note that players never get. Rolls on items and spells are dice the roller reads (lib/rolls.ts).
 *
 * The same actions (applyInventoryAction) run in the GM's browser and on the server for a player, so a player's change
 * is checked against the same rules: they never see or touch GM-only lines, and the campaign decides whether they may
 * change items and coins at all. Everything here is pure.
 */

const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const text = (max: number) => z.string().trim().max(max);
const label = (max: number) => z.string().trim().min(1).max(max);
export const MAX_ITEMS = 300, MAX_SPELLS = 200, MAX_ROLLS = 8, MAX_COINS = 1e12, MAX_QTY = 1_000_000, MAX_PRICE = 1e10, MAX_WEIGHT = 100_000;

// ---- Rolls -------------------------------------------------------------------------------------

/** Dice the roller understands, with at least one die: 2d6+1, 1d20+5, 4d6kh3, 2d6!, 6d10>=8, 4dF. */
export function validRoll(formula: string) {
  const f = formula.replace(/\s+/g, "");
  if (!f || f.length > 100 || !/d/i.test(f)) return false;
  try { parseDice(f); return true; } catch { return false; }
}
export const rollSchema = z.object({ name: label(40), formula: z.string().trim().max(100).transform(f => f.replace(/\s+/g, "")).refine(validRoll, "Use dice the roller reads, such as 2d6+1 or 1d20+5") });
export type ItemRoll = z.infer<typeof rollSchema>;
const rolls = z.array(rollSchema).max(MAX_ROLLS).optional();

// ---- Campaign settings -------------------------------------------------------------------------

export const carryUnits = ["none", "lb", "kg", "slots", "bulk"] as const;
export type CarryUnit = typeof carryUnits[number];
export const carryUnitNames: Record<CarryUnit, string> = { none: "Don’t count weight", lb: "Pounds (lb)", kg: "Kilograms (kg)", slots: "Slots", bulk: "Bulk" };
export const coinSchema = z.object({ name: label(30), abbr: label(10), rate: z.number().int().min(1).max(1e9) });
export type Coin = z.infer<typeof coinSchema>;
const ask = z.enum(["yes", "ask", "no"]);
export const itemSettingsSchema = z.object({
  /** At least one coin; the smallest is worth 1 and every amount is kept in it. */
  coins: z.array(coinSchema).min(1).max(6).refine(c => c.some(x => x.rate === 1), "One coin must be worth 1, the smallest").refine(c => new Set(c.map(x => x.abbr.toLowerCase())).size === c.length, "Give each coin its own short name"),
  carry: z.enum(carryUnits),
  categories: z.array(label(40)).max(20).refine(c => new Set(c.map(x => x.toLowerCase())).size === c.length, "Category names must be different"),
  show: z.object({ weight: z.boolean(), value: z.boolean(), uses: z.boolean(), equipped: z.boolean() }),
  spells: z.object({
    /** Characters have this tab at all. */
    on: z.boolean(),
    /** The tab's name and what one entry is: Spells and spell, Psi powers and power, Prayers and prayer. */
    tab: label(30), one: label(30),
    /** What the button that spends a cost says: Cast, Use, Invoke. */
    verb: label(20),
    groups: z.array(label(40)).max(20),
    /** What each entry lists, such as Range or Duration. */
    columns: z.array(label(30)).max(6),
    /** The word for the ready ones (Prepared, Memorised). Empty: no such thing in this game. */
    ready: text(20),
  }),
  players: z.object({ items: z.boolean(), coins: z.boolean(), values: z.boolean(), give: z.boolean(), containers: ask, shops: ask }),
  /** The campaign's item list: items written once and handed out again and again. */
  catalog: z.lazy(() => z.array(itemSchema).max(200)).optional(),
});
export type ItemSettings = z.infer<typeof itemSettingsSchema>;
export const defaultItemSettings = (): ItemSettings => ({
  coins: [{ name: "Coins", abbr: "coins", rate: 1 }], carry: "none",
  categories: ["Weapons", "Armour", "Gear", "Consumables", "Treasure"],
  show: { weight: true, value: true, uses: true, equipped: true },
  spells: { on: true, tab: "Spells", one: "spell", verb: "Cast", groups: [], columns: [], ready: "" },
  players: { items: true, coins: true, values: true, give: true, containers: "yes", shops: "ask" },
});
/** A campaign's settings, or the defaults when it has none yet. */
export const itemSettingsOf = (c?: { items?: ItemSettings } | null): ItemSettings => c?.items ?? defaultItemSettings();

/** Ready-made money for common kinds of game, to start from. */
export const coinPresets: { name: string; coins: Coin[] }[] = [
  { name: "One coin", coins: [{ name: "Coins", abbr: "coins", rate: 1 }] },
  { name: "Gold, silver, copper", coins: [{ name: "Gold", abbr: "gp", rate: 100 }, { name: "Silver", abbr: "sp", rate: 10 }, { name: "Copper", abbr: "cp", rate: 1 }] },
  { name: "Credits", coins: [{ name: "Credits", abbr: "cr", rate: 1 }] },
  { name: "Dollars and cents", coins: [{ name: "Dollars", abbr: "$", rate: 100 }, { name: "Cents", abbr: "¢", rate: 1 }] },
];

// ---- Money -------------------------------------------------------------------------------------

const byValue = (coins: Coin[]) => [...coins].sort((a, b) => b.rate - a.rate);
/** An amount in the smallest coin as coins, largest first: 4850 with gp, sp, cp is 48 gp, 5 sp, 0 cp. */
export function moneyParts(amount: number, coins: Coin[]) {
  let rest = Math.max(0, Math.round(amount));
  return byValue(coins).map(c => { const n = Math.floor(rest / c.rate); rest -= n * c.rate; return { ...c, n }; });
}
/** "48 gp 5 sp", "1,240 cr", "0 coins". */
export function formatMoney(amount: number, coins: Coin[]) {
  const parts = moneyParts(Math.abs(amount), coins).filter(c => c.n).map(c => `${c.n.toLocaleString("en")} ${c.abbr}`);
  return (amount < 0 ? "−" : "") + (parts.join(" ") || `0 ${byValue(coins)[0].abbr}`);
}
/** Reads "5 gp 3 sp", "12", "1.5 gp" or "300 cr" (a bare number is the largest coin). Null when a coin is unknown. */
export function parseMoney(input: string, coins: Coin[]): number | null {
  const t = input.toLowerCase().replace(/,/g, "").trim();
  let total = 0, any = false, bad = false;
  const rest = t.replace(/(\d+(?:\.\d+)?)\s*([^\d\s.]*)/g, (_, n: string, word: string) => {
    const coin = word ? coins.find(c => c.abbr.toLowerCase() === word || c.name.toLowerCase() === word) : byValue(coins)[0];
    if (coin) total += Number(n) * coin.rate; else bad = true;
    any = true; return "";
  });
  if (bad || !any || rest.trim()) return null;
  return Math.min(MAX_COINS, Math.round(total));
}

// ---- Items -------------------------------------------------------------------------------------

export const itemSchema = z.object({
  id, name: label(80),
  category: text(40).optional(),
  qty: z.number().int().min(0).max(MAX_QTY),
  /** Weight of one, in the campaign's unit. */
  weight: z.number().min(0).max(MAX_WEIGHT).optional(),
  /** What one is worth, in the smallest coin. */
  price: z.number().int().min(0).max(MAX_PRICE).optional(),
  note: text(2000).optional(),
  /** Never sent to players. */
  gmNote: text(2000).optional(),
  uses: z.object({ value: z.number().int().min(0).max(1000), max: z.number().int().min(1).max(1000) }).refine(u => u.value <= u.max, "Uses can’t be above their maximum").optional(),
  rolls,
  equipped: z.boolean().optional(),
  /** Hidden from players, even the character's own player. */
  gm: z.boolean().optional(),
});
export type Item = z.infer<typeof itemSchema>;
const unique = <T extends { id: string }>(l: T[]) => new Set(l.map(x => x.id)).size === l.length;
export const inventorySchema = z.object({
  /** Money, in the smallest coin. */
  coins: z.number().int().min(0).max(MAX_COINS),
  items: z.array(itemSchema).max(MAX_ITEMS).refine(unique, "Item ids must be unique"),
  /** How much this character can carry, in the campaign's unit. */
  capacity: z.number().min(0).max(MAX_WEIGHT).optional(),
  /** Who can see the Inventory tab. The character's own player always can. */
  visibility: z.enum(["gm", "players"]).optional(),
});
export type Inventory = z.infer<typeof inventorySchema>;
export const emptyInventory = (): Inventory => ({ coins: 0, items: [] });

export const carried = (items: Pick<Item, "qty" | "weight">[]) => Math.round(items.reduce((n, i) => n + i.qty * (i.weight ?? 0), 0) * 100) / 100;
export const worth = (items: Pick<Item, "qty" | "price">[]) => items.reduce((n, i) => n + i.qty * (i.price ?? 0), 0);

/** Things that are the same item stack: same name, same note and rolls, both shown or both hidden. */
const sameStack = (a: Item, b: Omit<Item, "id" | "qty">) => a.name.toLowerCase() === b.name.toLowerCase() && !!a.gm === !!b.gm && (a.note ?? "") === (b.note ?? "") && (a.price ?? 0) === (b.price ?? 0) && !a.uses && !b.uses;
/** Adds `qty` of an item to a list, onto a matching stack when there is one. */
export function putItem(list: Item[], item: Omit<Item, "id" | "qty">, qty: number, newId: () => string): Item[] {
  if (qty <= 0) return list;
  const at = list.findIndex(x => sameStack(x, item));
  if (at >= 0) return list.map((x, i) => i === at ? { ...x, qty: Math.min(MAX_QTY, x.qty + qty) } : x);
  if (list.length >= MAX_ITEMS) throw new ItemError(`A list can hold up to ${MAX_ITEMS} different items.`);
  const { equipped: _e, ...rest } = item as Item;
  void _e;
  return [...list, { ...rest, id: newId(), qty }];
}
/** Takes `qty` of an item off a list; the line goes when none are left. */
export function takeItem(list: Item[], itemId: string, qty: number): Item[] {
  const x = list.find(i => i.id === itemId) ?? no("That item is gone.", 404);
  if (qty > x.qty) no(`There ${x.qty === 1 ? "is" : "are"} only ${x.qty}.`);
  return x.qty - qty <= 0 ? list.filter(i => i.id !== itemId) : list.map(i => i.id === itemId ? { ...i, qty: i.qty - qty } : i);
}

// ---- Spells ------------------------------------------------------------------------------------

export const spellSchema = z.object({
  id, name: label(80),
  group: text(40).optional(),
  /** Values for the campaign's columns, by column name. */
  details: z.record(z.string().max(30), text(80)).optional(),
  tags: z.array(label(30)).max(8).optional(),
  text: text(4000).optional(),
  rolls,
  /** What using it spends: a number from one of the character's trackers. */
  cost: z.object({ trackerId: id, n: z.number().int().min(1).max(1000) }).optional(),
  ready: z.boolean().optional(),
  gm: z.boolean().optional(),
});
export type Spell = z.infer<typeof spellSchema>;
export const spellsSchema = z.array(spellSchema).max(MAX_SPELLS).refine(unique, "Spell ids must be unique");

// ---- Errors ------------------------------------------------------------------------------------

export class ItemError extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status = status; } }
export const no = (message: string, status = 400): never => { throw new ItemError(message, status); };

// ---- What players get --------------------------------------------------------------------------

export type PlayerItem = Omit<Item, "gm" | "gmNote">;
export type PlayerSpell = Omit<Spell, "gm">;
const clean = (i: Item, values: boolean): PlayerItem => { const { gm: _g, gmNote: _n, price, ...rest } = i; void _g; void _n; return values && price !== undefined ? { ...rest, price } : rest; };
/** The shown lines of an inventory, without GM notes, and without values when the campaign keeps them from players. */
export function playerInventory(inv: Inventory | undefined, settings: ItemSettings) {
  const i = inv ?? emptyInventory();
  return { coins: i.coins, ...(i.capacity !== undefined ? { capacity: i.capacity } : {}), items: i.items.filter(x => !x.gm).map(x => clean(x, settings.players.values)) };
}
export type PlayerInventory = ReturnType<typeof playerInventory>;
export const playerSpells = (spells: Spell[] | undefined): PlayerSpell[] => (spells ?? []).filter(s => !s.gm).map(({ gm: _g, ...rest }) => { void _g; return rest; });
/** What the player pages need from the campaign's settings (the catalog stays with the GM). */
export const playerItemSettings = (s: ItemSettings) => { const { catalog: _c, ...rest } = s; void _c; return rest; };
export type PlayerItemSettings = ReturnType<typeof playerItemSettings>;

// ---- Changes (the GM's browser and the server for players) -------------------------------------

export const itemInputSchema = z.object({
  name: label(80), category: text(40).optional(), qty: z.number().int().min(0).max(MAX_QTY).optional(),
  weight: z.number().min(0).max(MAX_WEIGHT).optional(), price: z.number().int().min(0).max(MAX_PRICE).optional(),
  note: text(2000).optional(), gmNote: text(2000).optional(),
  uses: z.object({ value: z.number().int().min(0).max(1000), max: z.number().int().min(1).max(1000) }).nullable().optional(),
  rolls, equipped: z.boolean().optional(), gm: z.boolean().optional(),
});
export type ItemInput = z.infer<typeof itemInputSchema>;
export const spellInputSchema = z.object({
  name: label(80), group: text(40).optional(), details: z.record(z.string().max(30), text(80)).optional(),
  tags: z.array(label(30)).max(8).optional(), text: text(4000).optional(), rolls,
  cost: z.object({ trackerId: id, n: z.number().int().min(1).max(1000) }).nullable().optional(),
  ready: z.boolean().optional(), gm: z.boolean().optional(),
});
export type SpellInput = z.infer<typeof spellInputSchema>;

export const inventoryActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("coins"), delta: z.number().int().min(-MAX_COINS).max(MAX_COINS) }),
  z.object({ action: z.literal("add"), item: itemInputSchema }),
  z.object({ action: z.literal("edit"), itemId: id, item: itemInputSchema.partial() }),
  z.object({ action: z.literal("remove"), itemId: id }),
  z.object({ action: z.literal("capacity"), value: z.number().min(0).max(MAX_WEIGHT).nullable() }),
  z.object({ action: z.literal("spell-add"), spell: spellInputSchema }),
  z.object({ action: z.literal("spell-edit"), spellId: id, spell: spellInputSchema.partial() }),
  z.object({ action: z.literal("spell-remove"), spellId: id }),
  z.object({ action: z.literal("cast"), spellId: id }),
]);
export type InventoryAction = z.infer<typeof inventoryActionSchema>;

type Tracker = { id: string; label: string; value: number; max: number; gm?: boolean };
export type CharacterParts<T extends Tracker = Tracker> = { inventory?: Inventory; spells?: Spell[]; trackers?: T[] };
type Who = { gm: boolean; settings: ItemSettings; newId: () => string };

/** Fills an item from what was typed: no empty notes, uses only when asked for. Players can't set GM things. */
function itemFrom(input: Partial<ItemInput>, base: Partial<Item>, gm: boolean): Omit<Item, "id"> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(input)) {
    if (!gm && (k === "gm" || k === "gmNote")) continue;
    if (k === "uses") { if (v) out.uses = { max: (v as { max: number }).max, value: Math.min((v as { value: number }).value, (v as { max: number }).max) }; else delete out.uses; continue; }
    if (v === undefined || v === "" || (Array.isArray(v) && !v.length)) delete out[k]; else out[k] = v;
  }
  if (out.qty === undefined) out.qty = 1;
  return out as Omit<Item, "id">;
}
function spellFrom(input: Partial<SpellInput>, base: Partial<Spell>, gm: boolean): Omit<Spell, "id"> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(input)) {
    if (!gm && k === "gm") continue;
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length) || (k === "details" && !Object.values(v as object).some(Boolean))) delete out[k];
    else out[k] = k === "details" ? Object.fromEntries(Object.entries(v as Record<string, string>).filter(([, x]) => x)) : v;
  }
  return out as Omit<Spell, "id">;
}

/**
 * One change to a character's inventory or spells. `who.gm` is the GM (anything); otherwise a player changing their
 * own character: GM-only lines are out of reach, and the campaign's settings say whether items and coins may change.
 * Returns the changed parts and a short line saying what happened.
 */
export function applyInventoryAction<T extends Tracker>(parts: CharacterParts<T>, action: InventoryAction, who: Who): { parts: CharacterParts<T>; said: string } {
  const inv = parts.inventory ?? emptyInventory(), spells = parts.spells ?? [], p = who.settings.players, gm = who.gm;
  const item = (itemId: string) => inv.items.find(i => i.id === itemId && (gm || !i.gm)) ?? no("That item is gone.", 404);
  const spell = (spellId: string) => spells.find(s => s.id === spellId && (gm || !s.gm)) ?? no(`That ${who.settings.spells.one} is gone.`, 404);
  const mayItems = () => { if (!gm && !p.items) no("Your GM keeps this list. Ask them to change it.", 403); };
  const withInv = (next: Partial<Inventory>, said: string) => ({ parts: { ...parts, inventory: { ...inv, ...next } }, said });
  const withSpells = (next: Spell[], said: string) => ({ parts: { ...parts, spells: next }, said });
  switch (action.action) {
    case "coins": {
      if (!gm && !p.coins) no("Your GM keeps track of your money. Ask them to change it.", 403);
      const next = inv.coins + action.delta;
      if (next < 0) no("That is more than there is.");
      return withInv({ coins: Math.min(MAX_COINS, next) }, action.delta >= 0 ? `Added ${formatMoney(action.delta, who.settings.coins)}.` : `Spent ${formatMoney(-action.delta, who.settings.coins)}.`);
    }
    case "add": {
      mayItems();
      if (inv.items.length >= MAX_ITEMS) no(`A character can carry up to ${MAX_ITEMS} different items.`);
      const made = itemFrom(action.item, {}, gm);
      return withInv({ items: [...inv.items, { ...made, id: who.newId() } as Item] }, `Added ${made.name}.`);
    }
    case "edit": {
      mayItems();
      const x = item(action.itemId), next = { ...itemFrom(action.item, x, gm), id: x.id } as Item;
      return withInv({ items: inv.items.map(i => i.id === x.id ? next : i) }, "Saved.");
    }
    case "remove": { mayItems(); const x = item(action.itemId); return withInv({ items: inv.items.filter(i => i.id !== x.id) }, `Removed ${x.name}.`); }
    case "capacity": {
      if (!gm) no("Only the GM sets how much a character can carry.", 403);
      const { capacity: _c, ...rest } = inv; void _c;
      return { parts: { ...parts, inventory: action.value === null ? rest : { ...rest, capacity: action.value } }, said: "Saved." };
    }
    case "spell-add": {
      mayItems();
      if (spells.length >= MAX_SPELLS) no(`A character can have up to ${MAX_SPELLS}.`);
      const made = spellFrom(action.spell, {}, gm);
      return withSpells([...spells, { ...made, id: who.newId() } as Spell], `Added ${made.name}.`);
    }
    case "spell-edit": {
      mayItems();
      const s = spell(action.spellId), next = { ...spellFrom(action.spell, s, gm), id: s.id } as Spell;
      return withSpells(spells.map(x => x.id === s.id ? next : x), "Saved.");
    }
    case "spell-remove": { mayItems(); const s = spell(action.spellId); return withSpells(spells.filter(x => x.id !== s.id), `Removed ${s.name}.`); }
    case "cast": {
      const s = spell(action.spellId);
      if (!s.cost) return { parts, said: `${s.name}: nothing to spend.` };
      const trackers = parts.trackers ?? [], t = trackers.find(x => x.id === s.cost!.trackerId && (gm || !x.gm)) ?? no(`${s.name} spends from a tracker this character no longer has.`, 404);
      if (t.value < s.cost.n) no(`Not enough ${t.label} for ${s.name}: ${t.value} left.`);
      const value = t.value - s.cost.n;
      return { parts: { ...parts, trackers: trackers.map(x => x.id === t.id ? { ...x, value } : x) }, said: `${s.name}: ${t.label} ${value} of ${t.max} left.` };
    }
  }
}

// ---- Rolling from a character ------------------------------------------------------------------

type RollSource = { sheet?: { items: { name: string; kind: string; formula?: string; label?: string }[] }; statsByCampaign?: Record<string, Record<string, unknown>> };
type FormField = { id: string; label: string; type: string; roll?: string; rollFormula?: string; rolls?: StatRoll[] };
/**
 * The dice for a roll a store or lock asks for, by name: a roll on the character's sheet, then a stat form field that
 * rolls (its first roll, or "Strength Save" for the field's roll named Save), then the text itself when it is dice (so
 * a GM can write 1d20+2 or 3d6). Null when none of those fit.
 */
export function characterRoll(character: RollSource | undefined, form: FormField[], campaignId: string, name: string): string | null {
  const want = name.trim().toLowerCase();
  if (!want) return null;
  for (const it of character?.sheet?.items ?? []) if (it.formula && (it.name.toLowerCase() === want || it.label?.toLowerCase() === want) && validRoll(it.formula)) return it.formula.replace(/\s+/g, "");
  for (const field of form) {
    const rolls = statRolls(field), label = field.label.toLowerCase();
    const picked = label === want ? rolls : rolls.filter(r => `${label} ${r.name.toLowerCase()}` === want);
    const v = character?.statsByCampaign?.[campaignId]?.[field.id];
    for (const r of picked) { const f = statRollDice(r.formula, v); if (f && validRoll(f)) return f; }
  }
  return validRoll(name) ? name.replace(/\s+/g, "") : null;
}
