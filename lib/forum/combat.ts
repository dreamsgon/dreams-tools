/*
 * Combat in a topic, for any game system: an order of turns (characters, NPCs or groups, each with an optional
 * initiative number), the round and whose turn it is. A post written as a character whose turn it is ends their
 * part of it; a turn with no characters (NPCs the GM runs as a group or by narration) ends with the GM's post. A
 * group turn ends once every character in it has posted, in any order. The GM can also move the turn on or back,
 * change the order, or end the fight. The order can start from a Maptable scene's initiative tracker. Pure.
 */
import { z } from "zod";
import { NARRATION } from "./reader.ts";
import { getInitiativeEntries, getInitiativeRound, isInitiativeEntryActive } from "../initiative-tracker.ts";
import type { Scene } from "../model.ts";

const id = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
export const COMBAT_LIMITS = { slots: 40, perSlot: 12, rounds: 9999 } as const;
export const slotSchema = z.object({
  name: z.string().trim().min(1).max(80),
  init: z.number().finite().min(-1000000).max(1000000).nullable(),
  /** The characters who act in this turn (a group turn when more than one); none: the GM's NPCs. */
  as: z.array(id).max(COMBAT_LIMITS.perSlot),
});
export const combatSchema = z.object({
  round: z.number().int().min(1).max(COMBAT_LIMITS.rounds),
  /** Index of the current turn in `order`. */
  turn: z.number().int().min(0).max(COMBAT_LIMITS.slots - 1),
  order: z.array(slotSchema).min(1).max(COMBAT_LIMITS.slots),
  /** Who has posted in the current turn: characters, or "*" for the GM. */
  done: z.array(z.string().min(1).max(100)).max(COMBAT_LIMITS.perSlot),
  /** The Maptable scene the order came from. */
  source: z.object({ sceneId: z.string().min(1).max(160), name: z.string().max(120) }).optional(),
  at: z.string().datetime(),
});
/** Where a post fell in the fight. */
export const turnMetaSchema = z.object({ round: z.number().int().min(1), n: z.number().int().min(1), of: z.number().int().min(1), name: z.string().max(80) });
export type Slot = z.infer<typeof slotSchema>;
export type Combat = z.infer<typeof combatSchema>;
export type TurnMeta = z.infer<typeof turnMetaSchema>;

export const slotOf = (c: Combat) => c.order[Math.min(c.turn, c.order.length - 1)]!;
export const turnMeta = (c: Combat): TurnMeta => ({ round: c.round, n: Math.min(c.turn, c.order.length - 1) + 1, of: c.order.length, name: slotOf(c).name });

/** Who a post counts for in the current turn: the character, "*" for the GM in a turn without characters, or null. */
export function countsFor(c: Combat, as: string | null, gm: boolean): string | null {
  const slot = slotOf(c);
  if (as && slot.as.includes(as)) return as;
  // An NPC turn: the GM's narration, or the GM writing as a character who has no turn of their own.
  if (!slot.as.length && gm && (as === null || !c.order.some(s => s.as.includes(as)))) return NARRATION;
  return null;
}
/** Moves on by one turn, into the next round after the last. */
export function step(c: Combat, by: 1 | -1): Combat {
  let turn = c.turn + by, round = c.round;
  if (turn >= c.order.length) { turn = 0; round = Math.min(round + 1, COMBAT_LIMITS.rounds); }
  if (turn < 0) { if (round === 1) return { ...c, done: [] }; turn = c.order.length - 1; round--; }
  return { ...c, turn, round, done: [] };
}
/** Notes a post in the current turn; the turn ends once everyone in it has posted. */
export function afterPost(c: Combat, as: string | null, gm: boolean): Combat {
  const who = countsFor(c, as, gm);
  if (!who) return c;
  const done = c.done.includes(who) ? c.done : [...c.done, who], slot = slotOf(c);
  const finished = slot.as.length ? slot.as.every(a => done.includes(a)) : true;
  return finished ? step({ ...c, done }, 1) : { ...c, done };
}

/** An order from the GM: kept as given (the browser sorts it), names tidied, characters only once each. */
export function cleanOrder(order: readonly Slot[], known: ReadonlySet<string>): Slot[] {
  const seen = new Set<string>();
  return order.slice(0, COMBAT_LIMITS.slots).map(s => ({
    name: s.name.trim().slice(0, 80), init: s.init,
    as: s.as.filter(a => known.has(a) && !seen.has(a) && (seen.add(a), true)).slice(0, COMBAT_LIMITS.perSlot),
  })).filter(s => s.name);
}

/**
 * A Maptable scene's initiative as an order: one turn per tracker entry (a token, or a group of tokens) that is in
 * the fight, with the Encyclopedia characters its tokens are linked to. Tokens hidden on the map are left out.
 */
export function orderFromScene(scene: Scene, known: ReadonlySet<string>) {
  const entries = getInitiativeEntries(scene).filter(isInitiativeEntryActive)
    .map(e => ({ ...e, tokens: e.tokens.filter(t => !t.hidden && !t.skipInitiative) })).filter(e => e.tokens.length);
  if (!entries.length) return null;
  const order: Slot[] = entries.slice(0, COMBAT_LIMITS.slots).map(e => ({
    name: (e.tokens.length > 1 && !e.label.includes("×") && e.tokens.every(t => t.name === e.tokens[0]!.name) ? `${e.label} ×${e.tokens.length}` : e.label).slice(0, 80),
    init: e.initiative,
    as: [...new Set(e.tokens.flatMap(t => t.encyclopediaEntryId && known.has(t.encyclopediaEntryId) ? [t.encyclopediaEntryId] : []))].slice(0, COMBAT_LIMITS.perSlot),
  }));
  const current = entries.findIndex(e => e.id === scene.initiativeState?.currentId);
  return { sceneId: scene.id, name: scene.name, round: getInitiativeRound(scene), turn: Math.max(0, Math.min(current, order.length - 1)), order };
}
