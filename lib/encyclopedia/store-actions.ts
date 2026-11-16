/*
 * Changes to inventories and stores across a whole workspace: a character giving to another, buying, selling, taking,
 * putting in, opening a container, haggling, running a stall, and a player setting up a store. The GM's browser and the
 * server (POST /api/encyclopedia/player-tracker?items) both run these, so a player's request is held to the same rules: who they
 * act as must be a character they may edit, the store must be one they can see and use, prices are worked out here and
 * never read from the browser, and rolls (a lock, a haggle) are made here. Every change is checked against the
 * workspace schema before it is returned.
 */
import { z } from "zod";
import { applyInventoryAction, characterRoll, emptyInventory, formatMoney, ItemError, itemSettingsOf, no, putItem, takeItem, MAX_COINS, MAX_ITEMS, MAX_QTY, type InventoryAction, type Item } from "./items.ts";
import { buyPrice, buysCategory, HAGGLE_HOURS, LOG_MAX, newStore, PENDING_MAX, sellPrice, shareOf, type Store, type StoreItem, type StoreType } from "./stores.ts";
import { rollWithMode } from "./roll-mode.ts";
import { defaultCharacter, playerCampaign, visibleEntries, workspaceSchema, type Entry, type Workspace } from "./world-model.ts";

const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const qty = z.number().int().min(1).max(MAX_QTY), amount = z.number().int().min(1).max(MAX_COINS);
export const storeActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("buy"), storeId: id, as: id, itemId: id, qty }),
  z.object({ action: z.literal("sell"), storeId: id, as: id, itemId: id, qty }),
  z.object({ action: z.literal("take"), storeId: id, as: id, itemId: id, qty }),
  z.object({ action: z.literal("take-coins"), storeId: id, as: id, amount }),
  z.object({ action: z.literal("take-all"), storeId: id, as: id }),
  z.object({ action: z.literal("split"), storeId: id, as: id }),
  z.object({ action: z.literal("put"), storeId: id, as: id, itemId: id, qty }),
  z.object({ action: z.literal("put-coins"), storeId: id, as: id, amount }),
  z.object({ action: z.literal("open"), storeId: id, as: id }),
  z.object({ action: z.literal("key"), storeId: id, as: id }),
  z.object({ action: z.literal("pick"), storeId: id, as: id }),
  z.object({ action: z.literal("haggle"), storeId: id, as: id }),
  z.object({ action: z.literal("cancel"), storeId: id, as: id, pendingId: id }),
  // The character who runs a stall or set up a container.
  z.object({ action: z.literal("stock"), storeId: id, as: id, itemId: id, qty, price: z.number().int().min(0).max(1e10) }),
  z.object({ action: z.literal("price"), storeId: id, as: id, itemId: id, price: z.number().int().min(0).max(1e10) }),
  z.object({ action: z.literal("collect"), storeId: id, as: id }),
  z.object({ action: z.literal("status"), storeId: id, as: id, open: z.boolean() }),
]);
export type StoreAction = z.infer<typeof storeActionSchema>;
export const giveSchema = z.object({ from: id, to: id, itemId: id.nullable(), qty: z.number().int().min(0).max(MAX_QTY), coins: z.number().int().min(0).max(MAX_COINS) });
export type Give = z.infer<typeof giveSchema>;

/** The GM, or a player acting through the characters they may edit. */
export type Actor = { gm: true; name: string } | { gm: false; name: string; mine: ReadonlySet<string> };
export type Ctx = { newId: () => string; now?: number; random?: () => number };
export type Rolled = { title: string; formula: string; total: number; detail: string; target: number; ok: boolean };
export type Done = { data: Workspace; said: string; roll?: Rolled };

const campaignOf = (s: Workspace, campaignId: string) => s.campaigns.find(c => c.id === campaignId) ?? no("This campaign is gone.", 404);
const pages = (s: Workspace, campaignId: string) => { const c = campaignOf(s, campaignId); return visibleEntries(s, c.worldId, c.id); };
function characterIn(s: Workspace, campaignId: string, charId: string): Entry {
  const e = pages(s, campaignId).find(x => x.id === charId) ?? no("That character is gone.", 404);
  return e.kind === "character" ? e : no("Only a character can carry things.");
}
/** The character a player acts as: one they may edit. The GM may act as any character. */
function actingAs(s: Workspace, campaignId: string, actor: Actor, charId: string) {
  if (!actor.gm && !actor.mine.has(charId)) no("You can only act as your own character.", 403);
  return characterIn(s, campaignId, charId);
}
/** The PCs of the campaign: who shares a split. */
export const partyOf = (s: Workspace, campaignId: string) => pages(s, campaignId).filter(e => e.kind === "character" && e.character?.role === "pc" && e.character.status !== "deceased");

const invOf = (e: Entry) => e.character?.inventory ?? emptyInventory();
const withInv = (e: Entry, inventory: ReturnType<typeof invOf>, at: string): Entry => ({ ...e, character: { ...(e.character ?? defaultCharacter()), inventory }, updatedAt: at });
const replace = (s: Workspace, ...changed: Entry[]): Workspace => { const by = new Map(changed.map(e => [e.id, e])); return { ...s, entries: s.entries.map(e => by.get(e.id) ?? e) }; };
function checked(s: Workspace): Workspace {
  const r = workspaceSchema.safeParse(s);
  return r.success ? r.data : no(r.error.issues[0]?.message ?? "That change would break the page.");
}
const stamp = (now: number) => new Date(now).toISOString();
const qtyText = (n: number, name: string) => n === 1 ? name : `${n} × ${name}`;

/** A character's own inventory or spells change (the server, for a player). */
export function changeOwnInventory(s: Workspace, campaignId: string, actor: Actor, charId: string, action: InventoryAction, ctx: Ctx): Done {
  const e = actingAs(s, campaignId, actor, charId), c = e.character ?? defaultCharacter(), settings = itemSettingsOf(campaignOf(s, campaignId));
  const r = applyInventoryAction({ inventory: c.inventory, spells: c.spells, trackers: c.trackers }, action, { gm: actor.gm, settings, newId: ctx.newId });
  const next: Entry = { ...e, character: { ...c, ...(r.parts.inventory ? { inventory: r.parts.inventory } : {}), ...(r.parts.spells ? { spells: r.parts.spells } : {}), ...(r.parts.trackers ? { trackers: r.parts.trackers } : {}) }, updatedAt: stamp(ctx.now ?? Date.now()) };
  return { data: checked(replace(s, next)), said: r.said };
}

/** Pages a member can read in the campaign (for whom they may give to). */
const readableBy = (s: Workspace, campaignId: string, mine: ReadonlySet<string>) => new Set(playerCampaign(s, campaignId, mine).entries.map(e => e.id));
/** Characters a character can give to: for the GM, any in the campaign; for a player, the ones they can read. */
export function giveTargets(s: Workspace, campaignId: string, actor: Actor, from: string) {
  const readable = actor.gm ? null : readableBy(s, campaignId, actor.mine);
  return pages(s, campaignId).filter(e => e.kind === "character" && e.id !== from && (!readable || readable.has(e.id))).map(e => ({ id: e.id, title: e.title }));
}
/** Moves an item (some or all of a stack) and/or coins from one character to another. */
export function give(s: Workspace, campaignId: string, actor: Actor, g: Give, ctx: Ctx): Done {
  const settings = itemSettingsOf(campaignOf(s, campaignId));
  if (!actor.gm && !settings.players.give) no("Your GM hands things over. Ask them.", 403);
  const from = actingAs(s, campaignId, actor, g.from), to = characterIn(s, campaignId, g.to);
  if (from.id === to.id) no("Choose someone else.");
  if (!actor.gm && !readableBy(s, campaignId, actor.mine).has(to.id)) no("You can only give to characters you know.", 403);
  if (!g.itemId && !g.coins) no("Choose something to give.");
  let a = invOf(from), b = invOf(to);
  const said: string[] = [];
  if (g.itemId) {
    const item = a.items.find(i => i.id === g.itemId && (actor.gm || !i.gm)) ?? no("That item is gone.", 404), n = g.qty || item.qty;
    a = { ...a, items: takeItem(a.items, item.id, n) };
    const { id: _i, qty: _q, equipped: _e, ...rest } = item; void _i; void _q; void _e;
    b = { ...b, items: putItem(b.items, rest, n, ctx.newId) };
    said.push(qtyText(n, item.name));
  }
  if (g.coins) {
    if (g.coins > a.coins) no("That is more than they have.");
    a = { ...a, coins: a.coins - g.coins }; b = { ...b, coins: Math.min(MAX_COINS, b.coins + g.coins) };
    said.push(formatMoney(g.coins, settings.coins));
  }
  const at = stamp(ctx.now ?? Date.now());
  return { data: checked(replace(s, withInv(from, a, at), withInv(to, b, at))), said: `Gave ${said.join(" and ")} to ${to.title}.` };
}

// ---- Stores ------------------------------------------------------------------------------------

function storeIn(s: Workspace, campaignId: string, storeId: string): Entry & { store: Store } {
  const e = pages(s, campaignId).find(x => x.id === storeId);
  return e?.kind === "store" && e.store ? e as Entry & { store: Store } : no("That store is gone.", 404);
}
/** A player may use a store the GM shares (for their character), or one their character runs. */
function mayUse(st: Store, actor: Actor, charId: string) {
  if (actor.gm || st.ownerId === charId) return;
  if (st.visibility !== "players" || st.awaiting) no("That store is gone.", 404);
  if (st.who && !st.who.includes(charId)) no("This one isn’t for that character.", 403);
}
const shutFor = (st: Store, actor: Actor, charId: string) => !actor.gm && st.ownerId !== charId && !!st.lock && st.lock.state !== "open";
const log = (st: Store, who: string, what: string, at: string, charId?: string): Store => ({ ...st, log: [...(st.log ?? []), { at, who: who.slice(0, 80), what: what.slice(0, 300), ...(charId ? { charId } : {}) }].slice(-LOG_MAX) });
/** Puts `n` of an item into a store's list, onto a matching counted stack when there is one. */
function intoStore(items: StoreItem[], item: Omit<Item, "id" | "qty">, n: number, newId: () => string, price?: number): StoreItem[] {
  const { equipped: _e, ...rest } = item as Item; void _e;
  const line = { ...rest, ...(price !== undefined ? { price } : {}) };
  const at = items.findIndex(x => x.qty !== null && !x.service && x.name.toLowerCase() === line.name.toLowerCase() && (x.price ?? 0) === (line.price ?? 0) && (x.note ?? "") === (line.note ?? "") && !!x.gm === !!line.gm && !x.uses && !line.uses);
  if (at >= 0) return items.map((x, i) => i === at ? { ...x, qty: Math.min(MAX_QTY, (x.qty ?? 0) + n) } : x);
  if (items.length >= MAX_ITEMS) no(`A store can hold up to ${MAX_ITEMS} different items.`);
  return [...items, { ...line, id: newId(), qty: n }];
}
/** Takes `n` off a store line; a line that never runs out stays as it is. Empty counted lines stay in a shop (sold out) and go elsewhere. */
function outOfStore(st: Store, itemId: string, n: number): StoreItem[] {
  const x = st.items.find(i => i.id === itemId)!;
  if (x.qty === null) return st.items;
  if (n > x.qty) no(x.qty ? `There ${x.qty === 1 ? "is" : "are"} only ${x.qty}.` : "Sold out.");
  const left = x.qty - n;
  return left > 0 || st.type === "shop" ? st.items.map(i => i.id === itemId ? { ...i, qty: left } : i) : st.items.filter(i => i.id !== itemId);
}
/** An item from a store as the character carries it. */
const carriedCopy = (x: StoreItem): Omit<Item, "id" | "qty"> => { const { id: _i, qty: _q, service: _s, gm: _g, ...rest } = x; void _i; void _q; void _s; void _g; return rest; };

/** One thing done at a store. */
export function storeAction(s: Workspace, campaignId: string, actor: Actor, a: StoreAction, ctx: Ctx, opts: { skipApproval?: boolean } = {}): Done {
  const now = ctx.now ?? Date.now(), at = stamp(now), settings = itemSettingsOf(campaignOf(s, campaignId)), money = (n: number) => formatMoney(n, settings.coins);
  const page = storeIn(s, campaignId, a.storeId), char = actingAs(s, campaignId, actor, a.as), st = page.store;
  mayUse(st, actor, char.id);
  const owner = st.ownerId === char.id, who = actor.gm && !opts.skipApproval ? `GM for ${char.title}` : char.title;
  const share = shareOf(st), inv = invOf(char);
  const done = (store: Store, said: string, inventory = inv, roll?: Rolled): Done =>
    ({ data: checked(replace(s, { ...page, store: log(store, who, said, at, char.id), updatedAt: at }, ...(inventory !== inv ? [withInv(char, inventory, at)] : []))), said, ...(roll ? { roll } : {}) });
  const line = (itemId: string) => st.items.find(i => i.id === itemId && (actor.gm || owner || !i.gm)) ?? no("That item is gone.", 404);
  const needOpen = () => { if (shutFor(st, actor, char.id)) no(st.lock?.state === "locked" ? "It’s locked." : "Open it first."); };
  const ownerOnly = () => { if (!owner && !actor.gm) no("Only whoever runs it can do that.", 403); };
  const pend = (kind: "buy" | "sell", itemId: string, n: number, what: string): Done => {
    if ((st.pending ?? []).length >= PENDING_MAX) no("The shop has too many sales waiting. Try again later.");
    const p = { id: ctx.newId(), at, charId: char.id, who: char.title.slice(0, 80), action: kind, itemId, qty: n };
    return done({ ...st, pending: [...(st.pending ?? []), p] }, `${what}: waiting for the GM’s OK.`);
  };
  switch (a.action) {
    case "buy": {
      const shop = st.type === "shop" && st.shop ? st.shop : no("Nothing is for sale here.");
      if (owner) no("That is your own stall.");
      if (!shop.open && !actor.gm) no("The shop is closed.");
      const x = line(a.itemId), unit = buyPrice(st, x, char.id, now), cost = unit * a.qty;
      if (x.qty !== null && a.qty > x.qty) no(x.qty ? `There ${x.qty === 1 ? "is" : "are"} only ${x.qty}.` : "Sold out.");
      if (cost > inv.coins) no(`That costs ${money(cost)}. ${char.title} has ${money(inv.coins)}.`);
      if (shop.approve && !actor.gm && !opts.skipApproval) return pend("buy", x.id, a.qty, `Asked to buy ${qtyText(a.qty, x.name)} for ${money(cost)}`);
      const items = x.service ? inv.items : putItem(inv.items, carriedCopy(x), a.qty, ctx.newId);
      return done({ ...st, items: outOfStore(st, x.id, a.qty), coins: Math.min(MAX_COINS, st.coins + cost) }, `Bought ${qtyText(a.qty, x.name)} for ${money(cost)}.`, { ...inv, items, coins: inv.coins - cost });
    }
    case "sell": {
      const shop = st.type === "shop" && st.shop ? st.shop : no("This isn’t a shop.");
      if (owner) no("That is your own stall. Stock it instead.");
      if (!shop.open && !actor.gm) no("The shop is closed.");
      const x = inv.items.find(i => i.id === a.itemId && (actor.gm || !i.gm)) ?? no("That item is gone.", 404);
      if (!buysCategory(st, x.category)) no(shop.buys ? "The shop doesn’t buy that kind of thing." : "The shop doesn’t buy anything.");
      if (a.qty > x.qty) no(`${char.title} has only ${x.qty}.`);
      const pay = sellPrice(st, x, char.id, now) * a.qty;
      if (!shop.bottomless && pay > st.coins) no(`The shop can’t pay ${money(pay)} right now.`);
      if (shop.approve && !actor.gm && !opts.skipApproval) return pend("sell", x.id, a.qty, `Offered ${qtyText(a.qty, x.name)} for ${money(pay)}`);
      const { id: _i, qty: _q, ...rest } = x; void _i; void _q;
      return done({ ...st, items: intoStore(st.items, rest, a.qty, ctx.newId), coins: shop.bottomless ? st.coins : st.coins - pay }, `Sold ${qtyText(a.qty, x.name)} for ${money(pay)}.`, { ...inv, items: takeItem(inv.items, x.id, a.qty), coins: Math.min(MAX_COINS, inv.coins + pay) });
    }
    case "take": {
      if (st.type === "shop" && !owner && !actor.gm) no("Buy it instead.");
      if (!share.take && !owner && !actor.gm) no("You can’t take from this.", 403);
      needOpen();
      const x = line(a.itemId);
      return done({ ...st, items: outOfStore(st, x.id, a.qty) }, `Took ${qtyText(a.qty, x.name)}.`, { ...inv, items: putItem(inv.items, carriedCopy(x), a.qty, ctx.newId) });
    }
    case "take-coins": {
      if (st.type === "shop") ownerOnly();
      else if (!share.take && !owner && !actor.gm) no("You can’t take from this.", 403);
      needOpen();
      if (a.amount > st.coins) no(`There is only ${money(st.coins)}.`);
      return done({ ...st, coins: st.coins - a.amount }, `Took ${money(a.amount)}.`, { ...inv, coins: Math.min(MAX_COINS, inv.coins + a.amount) });
    }
    case "take-all": {
      if (st.type === "shop") no("Buy things instead.");
      if (!share.takeAll && !owner && !actor.gm) no("Take things one at a time here.", 403);
      needOpen();
      const mine = st.items.filter(i => actor.gm || owner || !i.gm), counted = mine.filter(i => i.qty !== null && i.qty > 0);
      if (!counted.length && !st.coins) no("There is nothing left.");
      let items = inv.items;
      for (const x of counted) items = putItem(items, carriedCopy(x), x.qty!, ctx.newId);
      const left = st.items.filter(i => !counted.includes(i));
      return done({ ...st, items: left, coins: 0 }, `Took everything${st.coins ? `, with ${money(st.coins)}` : ""}.`, { ...inv, items, coins: Math.min(MAX_COINS, inv.coins + st.coins) });
    }
    case "split": {
      if (!share.split && !actor.gm) no("The coins here aren’t split.", 403);
      needOpen();
      const party = (st.who ? st.who.flatMap(id => { const e = pages(s, campaignId).find(x => x.id === id && x.kind === "character"); return e ? [e] : []; }) : partyOf(s, campaignId));
      if (!party.length) no("There is no party to split between. Mark the player characters as PCs.");
      const each = Math.floor(st.coins / party.length);
      if (!each) no("There isn’t enough to go round.");
      const rest = st.coins - each * party.length, said = `Split ${money(each * party.length)}: ${money(each)} each for ${party.map(p => p.title).join(", ")}.`;
      return { data: checked(replace(s, { ...page, store: log({ ...st, coins: rest }, who, said, at, char.id), updatedAt: at }, ...party.map(p => withInv(p, { ...invOf(p), coins: Math.min(MAX_COINS, invOf(p).coins + each) }, at)))), said };
    }
    case "put": {
      if (st.type === "shop") no(owner ? "Stock it with a price instead." : "Sell it instead.");
      if (!share.put && !owner && !actor.gm) no("You can’t put things in this.", 403);
      needOpen();
      const x = inv.items.find(i => i.id === a.itemId && (actor.gm || !i.gm)) ?? no("That item is gone.", 404);
      if (a.qty > x.qty) no(`${char.title} has only ${x.qty}.`);
      const { id: _i, qty: _q, ...rest } = x; void _i; void _q;
      return done({ ...st, items: intoStore(st.items, rest, a.qty, ctx.newId) }, `Put in ${qtyText(a.qty, x.name)}.`, { ...inv, items: takeItem(inv.items, x.id, a.qty) });
    }
    case "put-coins": {
      if (st.type === "shop") no("Buy something instead.");
      if (!share.put && !owner && !actor.gm) no("You can’t put things in this.", 403);
      needOpen();
      if (a.amount > inv.coins) no(`${char.title} has ${money(inv.coins)}.`);
      return done({ ...st, coins: Math.min(MAX_COINS, st.coins + a.amount) }, `Put in ${money(a.amount)}.`, { ...inv, coins: inv.coins - a.amount });
    }
    case "open": {
      const lock = st.lock && st.lock.state !== "open" ? st.lock : no("It’s already open.");
      if (lock.state === "locked" && !actor.gm && !owner) no("It’s locked.");
      return done({ ...st, lock: { ...lock, state: "open" } }, "Opened it.");
    }
    case "key": {
      const lock = st.lock?.state === "locked" && st.lock.key ? st.lock : no("No key opens this."), key = (lock.key ?? "").toLowerCase();
      if (!inv.items.some(i => !i.gm && i.qty > 0 && i.name.toLowerCase() === key)) no(`${char.title} has no key that fits.`);
      return done({ ...st, lock: { ...lock, state: "open" } }, "Unlocked it with a key.");
    }
    case "pick": {
      const lock = st.lock?.state === "locked" && st.lock.roll && st.lock.target !== undefined ? st.lock : no("There is no roll to open this."), name = lock.roll ?? "", target = lock.target ?? 0;
      const c = campaignOf(s, campaignId), formula = characterRoll(char.character, c.statFields ?? [], c.id, name) ?? no(`${char.title} has no roll called ${name}. Add it to their sheet or ask your GM.`);
      const r = rollWithMode(formula, "normal", ctx.random), ok = r.total >= target;
      const roll: Rolled = { title: `${char.title} · ${name}`, formula: r.formula, total: r.total, detail: r.detail, target, ok };
      return done(ok ? { ...st, lock: { ...lock, state: "open" } } : st, ok ? `Opened it: ${name} ${r.total}.` : `Couldn’t open it: ${name} ${r.total}.`, inv, roll);
    }
    case "haggle": {
      const h = st.shop?.haggle ?? no("No haggling here.");
      if (owner) no("That is your own stall.");
      const last = st.haggles?.[char.id];
      if (last && now - Date.parse(last.at) < HAGGLE_HOURS * 3_600_000 && !actor.gm) no(`${char.title} haggled here not long ago.`);
      const c = campaignOf(s, campaignId), formula = characterRoll(char.character, c.statFields ?? [], c.id, h.roll) ?? no(`${char.title} has no roll called ${h.roll}. Add it to their sheet or ask your GM.`);
      const r = rollWithMode(formula, "normal", ctx.random), ok = r.total >= h.target;
      const roll: Rolled = { title: `${char.title} · ${h.roll}`, formula: r.formula, total: r.total, detail: r.detail, target: h.target, ok };
      return done({ ...st, haggles: { ...st.haggles, [char.id]: { pct: ok ? h.pct : 0, at } } }, ok ? `Haggled ${h.pct}% off (${h.roll} ${r.total}).` : `Haggled and got nowhere (${h.roll} ${r.total}).`, inv, roll);
    }
    case "cancel": {
      const p = (st.pending ?? []).find(x => x.id === a.pendingId && (actor.gm || owner || x.charId === char.id)) ?? no("That sale is gone.", 404);
      return done({ ...st, pending: (st.pending ?? []).filter(x => x.id !== p.id) }, "Called off a sale.");
    }
    case "stock": {
      ownerOnly();
      const x = inv.items.find(i => i.id === a.itemId && !i.gm) ?? no("That item is gone.", 404);
      if (a.qty > x.qty) no(`${char.title} has only ${x.qty}.`);
      const { id: _i, qty: _q, ...rest } = x; void _i; void _q;
      return done({ ...st, items: intoStore(st.items, rest, a.qty, ctx.newId, st.type === "shop" ? a.price : undefined) }, `Put out ${qtyText(a.qty, x.name)}${st.type === "shop" ? ` at ${money(a.price)}` : ""}.`, { ...inv, items: takeItem(inv.items, x.id, a.qty) });
    }
    case "price": {
      ownerOnly();
      const x = line(a.itemId);
      return done({ ...st, items: st.items.map(i => i.id === x.id ? { ...i, price: a.price } : i) }, `${x.name} now costs ${money(a.price)}.`);
    }
    case "collect": {
      ownerOnly();
      if (!st.coins) no("There is nothing to collect.");
      return done({ ...st, coins: 0 }, `Collected ${money(st.coins)}.`, { ...inv, coins: Math.min(MAX_COINS, inv.coins + st.coins) });
    }
    case "status": {
      ownerOnly();
      const shop = st.shop ?? no("This isn’t a shop.");
      return done({ ...st, shop: { ...shop, open: a.open } }, a.open ? "Opened for business." : "Closed up.");
    }
  }
}

/** The GM says yes or no to a sale waiting for their OK. */
export function decidePending(s: Workspace, campaignId: string, storeId: string, pendingId: string, yes: boolean, ctx: Ctx): Done {
  const page = storeIn(s, campaignId, storeId), p = (page.store.pending ?? []).find(x => x.id === pendingId) ?? no("That sale is gone.", 404);
  const without: Workspace = replace(s, { ...page, store: { ...page.store, pending: (page.store.pending ?? []).filter(x => x.id !== pendingId) } });
  if (!yes) { const at = stamp(ctx.now ?? Date.now()), st = storeIn(without, campaignId, storeId); return { data: checked(replace(without, { ...st, store: log(st.store, "GM", `Said no to ${p.who}: ${p.action} ${p.qty}.`, at, p.charId) })), said: "Said no." }; }
  return storeAction(without, campaignId, { gm: true, name: "GM" }, { action: p.action, storeId, as: p.charId, itemId: p.itemId, qty: p.qty }, ctx, { skipApproval: true });
}

export const MAX_OWN_STORES = 5;
/** A player sets up a store from their character: a stall, a container or a stash, as the campaign allows. */
export function createPlayerStore(s: Workspace, campaignId: string, actor: Actor, input: { as: string; type: Exclude<StoreType, "loot">; title: string; shared: boolean }, ctx: Ctx): Done & { id: string } {
  const c = campaignOf(s, campaignId), settings = itemSettingsOf(c), char = actingAs(s, campaignId, actor, input.as);
  const may = input.type === "shop" ? settings.players.shops : settings.players.containers;
  if (!actor.gm && may === "no") no(input.type === "shop" ? "Your GM sets up the shops here." : "Your GM sets up containers here.", 403);
  if (s.entries.filter(e => e.kind === "store" && e.store?.ownerId === char.id).length >= MAX_OWN_STORES) no(`A character can run up to ${MAX_OWN_STORES}.`);
  const title = input.title.trim().slice(0, 160) || no("Give it a name.");
  const shared = input.shared || input.type === "shop", ask = !actor.gm && may === "ask";
  const store: Store = { ...newStore(input.type, char.id), visibility: shared && !ask ? "players" : "gm", ...(ask ? { awaiting: true } : {}), ...(input.type === "container" ? { lock: { state: "open" as const } } : {}) };
  if (store.shop) store.shop = { ...store.shop, buys: false };
  const now = ctx.now ?? Date.now(), at = stamp(now), newId = ctx.newId();
  const page: Entry = { id: newId, worldId: c.worldId, campaignId: c.id, parentId: char.campaignId === c.id ? char.id : null, title, kind: "store", body: "", overviewVisibility: shared && !ask ? "players" : "gm", store: log(store, char.title, ask ? "Set it up, waiting for the GM’s OK." : "Set it up.", at, char.id), updatedAt: at };
  return { data: checked({ ...s, entries: [...s.entries, page] }), said: ask ? `Set up ${title}. Others see it once your GM says yes.` : `Set up ${title}.`, id: newId };
}
/** The GM lets a store a player set up be seen. */
export function approveStore(store: Store, shared = true): Store {
  const { awaiting: _a, ...rest } = store; void _a;
  return { ...rest, visibility: shared ? "players" : rest.visibility };
}

export { ItemError };
