import { defaultOrg, maxMembers, maxPeople, type Org } from "./org-profile.ts";
import { defaultProfile, maxTies, type Profile } from "./character-profile.ts";
import type { Entry, Workspace } from "./world-model.ts";

/*
 * Dropping a page from the sidebar onto a profile: a character on a spot or Members adds them, any page on Holdings adds a
 * holding, a character or organization on People adds a tie. The rules are the ones the pickers follow (same world, the
 * organization's own campaign or shared lore, no duplicates, the block's limits). Everything here is pure: `dropRefusal`
 * says why a drop can't land (null when it can) and `applyDrop` makes the edit, returning the workspace unchanged on a refusal.
 */

/** The data type the sidebar puts on a dragged page (its value is the page id). */
export const PAGE_DRAG = "application/x-encyclopedia-page";
export const maxHoldings = 40;

export type DropTarget =
  | { kind: "spot"; orgId: string; blockId: string; spotId: string }
  | { kind: "members"; orgId: string; blockId: string }
  | { kind: "holdings"; orgId: string; blockId: string }
  | { kind: "ties"; characterId: string; blockId: string };

const find = (s: Workspace, id: string) => s.entries.find(e => e.id === id);
const hostId = (t: DropTarget) => t.kind === "ties" ? t.characterId : t.orgId;
const orgOfEntry = (s: Workspace, e: Entry): Org => e.org ?? defaultOrg(s.worlds.find(w => w.id === e.worldId));
const profileOfEntry = (s: Workspace, e: Entry): Profile => e.profile ?? defaultProfile(s.worlds.find(w => w.id === e.worldId));
const kindName = (e: Entry) => e.kind === "faction" ? "an organization" : `a ${e.kind}`;

/** Why the page can't be dropped on the target, or null when it can. */
export function dropRefusal(s: Workspace, target: DropTarget, pageId: string): string | null {
  const host = find(s, hostId(target)), page = find(s, pageId);
  if (!page) return "That page is gone.";
  if (!host) return "This page is gone.";
  if (page.id === host.id) return "A page can’t be added to itself.";
  if (page.worldId !== host.worldId) return "That page is in another world.";
  if (page.campaignId !== null && page.campaignId !== host.campaignId) return "That page belongs to another campaign.";
  if (page.kind === "folder") return "Folders can’t go here. Drop a page instead.";
  if (target.kind === "ties") {
    if (host.kind !== "character") return "Only a character’s People can take this.";
    if (page.kind !== "character" && page.kind !== "faction") return `People holds characters and organizations, not ${kindName(page)}.`;
    const b = profileOfEntry(s, host).blocks.find(x => x.id === target.blockId);
    if (!b || b.kind !== "ties") return "That block is gone.";
    if (b.ties.some(t => t.entryId === page.id)) return `${page.title} is already in People.`;
    if (b.ties.length >= maxTies) return `People is full (up to ${maxTies}).`;
    return null;
  }
  if (host.kind !== "faction") return "Only an organization’s profile can take this.";
  const b = orgOfEntry(s, host).blocks.find(x => x.id === target.blockId);
  if (target.kind === "spot") {
    if (!b || b.kind !== "spots") return "That block is gone.";
    const spot = b.spots.find(x => x.id === target.spotId);
    if (!spot) return "That spot is gone.";
    if (page.kind !== "character") return `A spot holds characters, not ${kindName(page)}.`;
    if (spot.people.some(p => p.entryId === page.id)) return `${page.title} is already in ${spot.title || "this spot"}.`;
    if (spot.people.length >= maxPeople) return `${spot.title || "This spot"} is full (up to ${maxPeople}).`;
    return null;
  }
  if (target.kind === "members") {
    if (!b || b.kind !== "members") return "That block is gone.";
    if (page.kind !== "character") return `Members holds characters, not ${kindName(page)}.`;
    if (b.members.some(m => m.entryId === page.id)) return `${page.title} is already a member.`;
    if (b.members.length >= maxMembers) return `Members is full (up to ${maxMembers}).`;
    return null;
  }
  if (!b || b.kind !== "holdings") return "That block is gone.";
  if (b.holdings.some(h => h.entryId === page.id)) return `${page.title} is already a holding.`;
  if (b.holdings.length >= maxHoldings) return `Holdings is full (up to ${maxHoldings}).`;
  return null;
}

/** Makes the drop: a spot or member with neutral standing (no role), a holding, or a tie with no note. Unchanged when refused. */
export function applyDrop(s: Workspace, target: DropTarget, pageId: string, now = new Date().toISOString(), newId: () => string = () => crypto.randomUUID()): Workspace {
  if (dropRefusal(s, target, pageId)) return s;
  const id = newId();
  return { ...s, entries: s.entries.map(e => {
    if (e.id !== hostId(target)) return e;
    if (target.kind === "ties") {
      const p = profileOfEntry(s, e);
      return { ...e, profile: { ...p, blocks: p.blocks.map(b => b.id === target.blockId && b.kind === "ties" ? { ...b, ties: [...b.ties, { id, entryId: pageId }] } : b) }, editedBy: undefined, updatedAt: now };
    }
    const o = orgOfEntry(s, e);
    return { ...e, org: { ...o, blocks: o.blocks.map(b => {
      if (b.id !== target.blockId) return b;
      if (target.kind === "spot" && b.kind === "spots") return { ...b, spots: b.spots.map(x => x.id === target.spotId ? { ...x, people: [...x.people, { id, entryId: pageId, standing: "neutral" as const }] } : x) };
      if (target.kind === "members" && b.kind === "members") return { ...b, members: [...b.members, { id, entryId: pageId, standing: "neutral" as const }] };
      if (target.kind === "holdings" && b.kind === "holdings") return { ...b, holdings: [...b.holdings, { id, entryId: pageId }] };
      return b;
    }) }, editedBy: undefined, updatedAt: now };
  }) };
}
