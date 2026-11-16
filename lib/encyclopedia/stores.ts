import { z } from "zod";
import { itemSchema, MAX_COINS, MAX_ITEMS, MAX_QTY, type Item } from "./items.ts";

/*
 * Stores and containers: a page of kind "store" holds one (`entry.store`). Four kinds, after Foundry's Item Piles:
 * - shop: stock with prices (some can never run out), a purse, buy and sell rates, haggling, opening status, and a GM OK
 *   for each sale when the GM wants one. A shop a player runs from their own character is a stall.
 * - container: a chest, a bag, a safe. Closed or locked; opened by anyone, with a key the character carries, or a roll.
 * - loot: what was left behind. Take what you want, take everything, or split the coins between the party.
 * - stash: the party's shared stash, everyone puts in and takes out.
 * The GM chooses what players may do with each. Players never get GM-only lines, GM notes, other characters' deals or
 * the GM's log of a shop; a closed or locked container shows them nothing inside until it is opened.
 */

const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const pct = z.number().int().min(0).max(1000);
export const storeTypes = ["shop", "container", "loot", "stash"] as const;
export type StoreType = typeof storeTypes[number];
export const storeTypeNames: Record<StoreType, string> = { shop: "Shop", container: "Container", loot: "Loot", stash: "Party stash" };
export const storeTypeHints: Record<StoreType, string> = {
  shop: "Stock with prices. Players buy, and sell if the shop buys.",
  container: "A chest, bag or safe. Can be closed or locked.",
  loot: "What was left behind. Take things or split the coins.",
  stash: "Shared by the party. Everyone puts in and takes out.",
};
export const LOG_MAX = 60, PENDING_MAX = 30, HAGGLE_HOURS = 2;

export const storeItemSchema = itemSchema.extend({
  /** How many there are; null when it never runs out (a shop's bread, a service). */
  qty: z.number().int().min(0).max(MAX_QTY).nullable(),
  /** A service (a room for the night, a healing): bought, never carried away as an item. */
  service: z.boolean().optional(),
});
export type StoreItem = z.infer<typeof storeItemSchema>;
export const shopSchema = z.object({
  open: z.boolean(),
  /** "Dawn to dusk", "Closed on holy days". */
  hours: z.string().trim().max(120).optional(),
  /** What players pay, as a % of an item's value (100 is its value). */
  sell: pct,
  /** What the shop pays for what players sell, as a % of its value. */
  buy: pct,
  buys: z.boolean(),
  /** The categories the shop buys; empty is any. */
  buyCategories: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  /** A % on top for a category, or for one character (a friend of the house, a known thief). 100 changes nothing. */
  categoryPct: z.record(z.string().max(40), pct).optional(),
  characterPct: z.record(id, pct).optional(),
  /** The shop's purse never runs out when it buys. */
  bottomless: z.boolean().optional(),
  /** Sold-out lines are hidden from players. */
  hideSoldOut: z.boolean().optional(),
  /** A character may haggle once every few hours: the roll (a roll on their sheet, a stat or dice) and what it must reach. */
  haggle: z.object({ roll: z.string().trim().min(1).max(100), target: z.number().int().min(-1000).max(10000), pct: z.number().int().min(1).max(90) }).optional(),
  /** Each sale waits for the GM's OK. */
  approve: z.boolean().optional(),
});
export type Shop = z.infer<typeof shopSchema>;
export const lockSchema = z.object({
  state: z.enum(["open", "closed", "locked"]),
  /** The name of an item that opens it. */
  key: z.string().trim().max(80).optional(),
  /** A roll that opens it (a roll on the sheet, a stat or dice), and what it must reach. */
  roll: z.string().trim().max(100).optional(), target: z.number().int().min(-1000).max(10000).optional(),
});
export const shareSchema = z.object({ take: z.boolean(), put: z.boolean(), takeAll: z.boolean(), split: z.boolean() });
export const storeLogSchema = z.object({ at: z.string().datetime(), who: z.string().trim().min(1).max(80), what: z.string().trim().min(1).max(300), charId: id.optional() });
export const pendingSchema = z.object({ id, at: z.string().datetime(), charId: id, who: z.string().trim().min(1).max(80), action: z.enum(["buy", "sell"]), itemId: id, qty: z.number().int().min(1).max(MAX_QTY) });
export type Pending = z.infer<typeof pendingSchema>;
export const storeSchema = z.object({
  type: z.enum(storeTypes),
  /** Players see it at all. A store a character runs is always seen by its owner. */
  visibility: z.enum(["gm", "players"]),
  /** The character who runs it (a stall) or set it up. Their player manages it. */
  ownerId: id.optional(),
  /** Made by a player and waiting for the GM's OK before others see it. */
  awaiting: z.boolean().optional(),
  /** Money in it, in the smallest coin: a shop's purse, a chest's coins. */
  coins: z.number().int().min(0).max(MAX_COINS),
  items: z.array(storeItemSchema).max(MAX_ITEMS).refine(l => new Set(l.map(x => x.id)).size === l.length, "Item ids must be unique"),
  shop: shopSchema.optional(),
  lock: lockSchema.optional(),
  share: shareSchema.optional(),
  /** Only these characters may use it. Left out, the whole party. */
  who: z.array(id).max(50).optional(),
  log: z.array(storeLogSchema).max(LOG_MAX).optional(),
  pending: z.array(pendingSchema).max(PENDING_MAX).optional(),
  /** Each character's last haggle here: the % it got (0 when it failed) and when. */
  haggles: z.record(id, z.object({ pct: z.number().int().min(0).max(90), at: z.string().datetime() })).optional(),
});
export type Store = z.infer<typeof storeSchema>;

export const defaultShare = (type: StoreType): z.infer<typeof shareSchema> =>
  type === "loot" ? { take: true, put: false, takeAll: true, split: true } : type === "stash" ? { take: true, put: true, takeAll: false, split: false } : { take: true, put: true, takeAll: true, split: false };
export const defaultShop = (): Shop => ({ open: true, sell: 100, buy: 50, buys: true });
export function newStore(type: StoreType, ownerId?: string): Store {
  return { type, visibility: "gm", coins: 0, items: [], ...(ownerId ? { ownerId } : {}), ...(type === "shop" ? { shop: defaultShop() } : { share: defaultShare(type) }), ...(type === "container" ? { lock: { state: "closed" as const } } : {}) };
}
export const shareOf = (s: Store) => s.share ?? defaultShare(s.type);
/** Ids of pages a store points at, for checks and copies. */
export const storeRefs = (s: Store) => [...(s.ownerId ? [s.ownerId] : []), ...(s.who ?? []), ...Object.keys(s.shop?.characterPct ?? {}), ...(s.pending ?? []).map(p => p.charId), ...Object.keys(s.haggles ?? {})];
export function remapStore(s: Store, ref: (id: string) => string | undefined): Store {
  const keep = <T>(r: Record<string, T> | undefined) => r ? Object.fromEntries(Object.entries(r).flatMap(([k, v]) => { const n = ref(k); return n ? [[n, v]] : []; })) : undefined;
  const { ownerId, who, pending, haggles, log, ...rest } = s, owner = ownerId ? ref(ownerId) : undefined;
  void pending; void haggles; void log;
  return { ...rest, ...(owner ? { ownerId: owner } : {}), ...(who ? { who: who.flatMap(x => ref(x) ?? []) } : {}), ...(s.shop ? { shop: { ...s.shop, ...(s.shop.characterPct ? { characterPct: keep(s.shop.characterPct) } : {}) } } : {}) };
}
export const storeSearchText = (s?: Store) => s ? s.items.map(i => `${i.name} ${i.category ?? ""} ${i.note ?? ""}`).join(" ") : "";

// ---- Prices ------------------------------------------------------------------------------------

const haggleOf = (s: Store, charId: string | undefined, now: number) => {
  const h = charId ? s.haggles?.[charId] : undefined;
  return h && now - Date.parse(h.at) < HAGGLE_HOURS * 3_600_000 ? h : undefined;
};
/** The % a character's price is moved by: their own rate, then a haggle that worked. */
export function characterFactor(s: Store, charId: string | undefined, now: number, selling: boolean) {
  const own = (charId ? s.shop?.characterPct?.[charId] : undefined) ?? 100, h = haggleOf(s, charId, now)?.pct ?? 0;
  return own / 100 * (selling ? 1 + h / 100 : 1 - h / 100);
}
const categoryFactor = (s: Store, category?: string) => (category ? s.shop?.categoryPct?.[category] : undefined) ?? 100;
/** What one costs here, before anything about the buyer. */
export const listPrice = (s: Store, item: Pick<Item, "price" | "category">) => Math.round((item.price ?? 0) * (s.shop?.sell ?? 100) / 100 * categoryFactor(s, item.category) / 100);
/** What one costs a character. */
export const buyPrice = (s: Store, item: Pick<Item, "price" | "category">, charId: string | undefined, now: number) => Math.max(0, Math.round(listPrice(s, item) * characterFactor(s, charId, now, false)));
/** What the shop pays a character for one. */
export const sellPrice = (s: Store, item: Pick<Item, "price" | "category">, charId: string | undefined, now: number) => Math.max(0, Math.round((item.price ?? 0) * (s.shop?.buy ?? 50) / 100 * categoryFactor(s, item.category) / 100 * characterFactor(s, charId, now, true)));
/** The shop takes this kind of item. */
export const buysCategory = (s: Store, category?: string) => !!s.shop?.buys && (!s.shop.buyCategories?.length || (!!category && s.shop.buyCategories.some(c => c.toLowerCase() === category.toLowerCase())));

// ---- What players get --------------------------------------------------------------------------

export type PlayerStoreItem = Omit<StoreItem, "gm" | "gmNote">;
/**
 * A store as one member sees it. `mine` are their characters. Hidden: GM-only lines and notes, the contents of a
 * closed or locked container (unless they own it), other characters' rates, haggles and waiting sales, and the
 * log of a shop they don't run. Prices are the list price; `rate` is what their own characters' prices are moved by.
 */
export function playerStore(s: Store, mine: ReadonlySet<string>, now: number) {
  const owner = !!s.ownerId && mine.has(s.ownerId), shut = !owner && !!s.lock && s.lock.state !== "open";
  const clean = (i: StoreItem): PlayerStoreItem => { const { gm: _g, gmNote: _n, ...rest } = i; void _g; void _n; return s.type === "shop" ? { ...rest, price: listPrice(s, i) } : rest; };
  const items = shut ? [] : s.items.filter(i => !i.gm && (owner || s.type !== "shop" || !s.shop?.hideSoldOut || i.qty !== 0)).map(clean);
  const rate = Object.fromEntries([...mine].flatMap(c => {
    const own = s.shop?.characterPct?.[c], h = haggleOf(s, c, now);
    return own !== undefined || h ? [[c, { buy: characterFactor(s, c, now, false), sell: characterFactor(s, c, now, true), ...(h ? { haggled: h.pct, at: h.at } : {}) }]] : [];
  }));
  const shop = s.shop ? { open: s.shop.open, ...(s.shop.hours ? { hours: s.shop.hours } : {}), buy: s.shop.buy, buys: s.shop.buys, ...(s.shop.buyCategories?.length ? { buyCategories: s.shop.buyCategories } : {}), ...(s.shop.categoryPct ? { categoryPct: s.shop.categoryPct } : {}), ...(s.shop.haggle ? { haggle: { roll: s.shop.haggle.roll } } : {}), ...(s.shop.approve ? { approve: true } : {}), ...(owner ? { sell: s.shop.sell } : {}) } : undefined;
  const lock = s.lock ? { state: s.lock.state, ...(s.lock.key ? { key: true } : {}), ...(s.lock.roll ? { roll: s.lock.roll } : {}) } : undefined;
  const log = (s.log ?? []).filter(l => owner || s.type !== "shop" || (!!l.charId && mine.has(l.charId))).slice(-20);
  return {
    type: s.type, owner, ...(s.ownerId ? { ownerId: s.ownerId } : {}), ...(s.awaiting ? { awaiting: true } : {}),
    coins: shut || (s.type === "shop" && !owner) ? null : s.coins, items, shut,
    ...(shop ? { shop } : {}), ...(lock ? { lock } : {}), ...(s.type !== "shop" ? { share: shareOf(s) } : {}),
    ...(s.who ? { who: s.who.filter(c => mine.has(c)) } : {}), rate, log,
    pending: (s.pending ?? []).filter(p => owner || mine.has(p.charId)),
  };
}
export type PlayerStore = ReturnType<typeof playerStore>;
/** The store tab's name on its page. */
export const storeTabTitle = (type: StoreType) => type === "shop" ? "Stock" : type === "container" ? "Contents" : type === "loot" ? "Loot" : "Stash";
