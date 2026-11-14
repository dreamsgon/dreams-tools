import type { Entry, Workspace } from "./world-model.ts";
import { maxTies, tieFits, tieLabel, withTieType, withoutTieType, type Tie, type TieGroup, type TieType } from "./ties.ts";
import type { TieSource } from "./tie-connections.ts";

/*
 * Changing ties. A tie lives on the page it starts from, so saving one can move it: turning "Parent of" into "Child of"
 * stores it on the other page. Ties in a character's People block stay there; only their kind, note and GM-only
 * switch change. Everything here is pure and returns a new workspace (or the same one when nothing could change).
 */

export type TieRef = { source: TieSource; ownerId: string; id: string };

const touch = (e: Entry, patch: Partial<Entry>, now: string): Entry => ({ ...e, ...patch, editedBy: undefined, updatedAt: now });

/** Takes a tie off its page (or out of a People block). */
export function removeTie(s: Workspace, ref: TieRef, now: string): Workspace {
  return { ...s, entries: s.entries.map(e => {
    if (e.id !== ref.ownerId) return e;
    if (ref.source === "profile") {
      if (!e.profile) return e;
      return touch(e, { profile: { ...e.profile, blocks: e.profile.blocks.map(b => b.kind === "ties" ? { ...b, ties: b.ties.filter(t => t.id !== ref.id) } : b) } }, now);
    }
    const ties = (e.ties ?? []).filter(t => t.id !== ref.id);
    return touch(e, { ties: ties.length ? ties : undefined }, now);
  }) };
}

/** Whether a page may hold a tie to another: shared lore may only point at shared lore. */
export const canHoldTie = (owner: Pick<Entry, "campaignId">, target: Pick<Entry, "campaignId">) => owner.campaignId !== null || target.campaignId === null;

export type TieChoice = { value: string; typeId: string; reversed: boolean; label: string; group: TieGroup };
/**
 * The kinds of tie page `a` can have with page `b`, each named from `a`. A kind that reads differently each way is
 * offered both ways (Parent of, Child of); `reversed` means the tie starts at `b` and is stored there.
 */
export function tieChoices(types: TieType[], a: Pick<Entry, "kind" | "campaignId">, b: Pick<Entry, "kind" | "campaignId">): TieChoice[] {
  const out: TieChoice[] = [];
  for (const t of types) {
    const fwd = tieFits(t, a.kind, b.kind) && canHoldTie(a, b), back = tieFits(t, b.kind, a.kind) && canHoldTie(b, a);
    if (fwd) out.push({ value: t.id, typeId: t.id, reversed: false, label: t.name, group: t.group });
    if (back && (!fwd || !t.both)) out.push({ value: `${t.id}:rev`, typeId: t.id, reversed: true, label: tieLabel(t, false), group: t.group });
  }
  return out;
}

/**
 * Saves a tie on `ownerId`, in place of `replacing` when given (which may be on another page). Returns null when the
 * page already holds as many ties as it can.
 */
export function putTie(s: Workspace, ownerId: string, tie: Tie, now: string, replacing?: TieRef): Workspace | null {
  const sameSpot = replacing?.source === "tie" && replacing.ownerId === ownerId;
  let next = replacing && !sameSpot ? removeTie(s, replacing, now) : s;
  const owner = next.entries.find(e => e.id === ownerId);
  if (!owner) return null;
  const list = owner.ties ?? [], at = sameSpot ? list.findIndex(t => t.id === replacing!.id) : -1;
  if (at < 0 && list.length >= maxTies) return null;
  const ties = at >= 0 ? list.map((t, i) => i === at ? tie : t) : [...list, tie];
  next = { ...next, entries: next.entries.map(e => e.id === ownerId ? touch(e, { ties }, now) : e) };
  return next;
}

/** Changes a People block tie: its kind (Knows when left out), note and GM-only switch. */
export function setProfileTie(s: Workspace, ownerId: string, id: string, patch: { typeId?: string; note?: string; gm?: boolean }, now: string): Workspace {
  return { ...s, entries: s.entries.map(e => {
    if (e.id !== ownerId || !e.profile) return e;
    return touch(e, { profile: { ...e.profile, blocks: e.profile.blocks.map(b => b.kind !== "ties" ? b : { ...b, ties: b.ties.map(t => {
      if (t.id !== id) return t;
      const { typeId: _t, note: _n, gm: _g, ...rest } = t;
      void _t; void _n; void _g;
      return { ...rest, ...(patch.typeId && patch.typeId !== "knows" ? { typeId: patch.typeId } : {}), ...(patch.note ? { note: patch.note } : {}), ...(patch.gm ? { gm: true } : {}) };
    }) }) } }, now);
  }) };
}

/** Saves a kind of tie on a world. */
export const saveTieType = (s: Workspace, worldId: string, type: TieType): Workspace =>
  ({ ...s, worlds: s.worlds.map(w => w.id === worldId ? { ...w, tieTypes: withTieType(w.tieTypes, type) } : w) });
/** Takes a kind off a world: a custom kind is deleted, a built-in one goes back to how it ships. */
export const dropTieType = (s: Workspace, worldId: string, id: string): Workspace =>
  ({ ...s, worlds: s.worlds.map(w => w.id === worldId ? { ...w, tieTypes: withoutTieType(w.tieTypes, id) } : w) });
