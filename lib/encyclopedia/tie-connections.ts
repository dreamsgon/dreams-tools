import type { Entry, Workspace } from "./world-model.ts";
import { tieLabel, tieTypeById, tieTypesOf, type Tie, type TieType } from "./ties.ts";
import { vehicleRefs, vehicleRolesOf, vehicleTypeOf } from "./vehicles.ts";

/*
 * A page's ties, worked out from the whole workspace. A tie is stored on the page it starts from, so a page's own list
 * holds only half of them: the rest are found on the pages that point at it. The People block on character profiles
 * holds older ties (a page and a note); they count as ties too, of the kind the GM gave them or Knows.
 *
 * Worked-out ties are not stored as ties at all: organization members, a vehicle's owner, commander, crew and place,
 * quests that name the page, and siblings found through shared parents. They are changed where they live.
 */

export type TieSource = "tie" | "profile";
export type PageTie = {
  /** Unique within the page: where it is stored and its id there. */
  key: string; source: TieSource;
  /** The page that stores it (where it starts). */
  ownerId: string; fromId: string; toId: string;
  /** The page at the other end from the page asked about. */
  otherId: string;
  tie: Tie; type: TieType;
  /** Its name read from the page asked about. */
  label: string;
};
export type WorkedOutTie = { otherId: string; label: string; detail?: string; source: "organization" | "vehicle" | "quest" | "family" };

/**
 * The pages a page can be tied to: its world, and its own campaign or shared lore. A shared lore page read inside a
 * campaign (`campaignId`) also sees that campaign's pages, which may tie to it.
 */
export function tiePages(s: Workspace, entry: Entry, campaignId: string | null = entry.campaignId): Entry[] {
  const c = entry.campaignId ?? campaignId;
  return s.entries.filter(e => e.id !== entry.id && e.kind !== "folder" && e.kind !== "tasks" && e.worldId === entry.worldId && (e.campaignId === null || e.campaignId === c));
}

/** Every tie stored in a world, read as starting from its owner. Profile People ties count, as Knows unless typed. */
export function worldTies(s: Workspace, worldId: string, types: TieType[]): PageTie[] {
  const out: PageTie[] = [];
  for (const e of s.entries) {
    if (e.worldId !== worldId) continue;
    for (const x of e.ties ?? []) out.push({ key: `tie:${e.id}:${x.id}`, source: "tie", ownerId: e.id, fromId: e.id, toId: x.toId, otherId: x.toId, tie: x, type: tieTypeById(types, x.typeId), label: "" });
    if (e.kind === "character" && e.profile) for (const b of e.profile.blocks) if (b.kind === "ties") for (const p of b.ties) {
      const tie: Tie = { id: p.id, toId: p.entryId, typeId: p.typeId ?? "knows", ...(p.note ? { note: p.note } : {}), ...(b.gm || p.gm ? { gm: true } : {}) };
      out.push({ key: `profile:${e.id}:${p.id}`, source: "profile", ownerId: e.id, fromId: e.id, toId: p.entryId, otherId: p.entryId, tie, type: tieTypeById(types, tie.typeId), label: "" });
    }
  }
  return out;
}

/** This page's ties in both directions, each named from this page, people first then by name. */
export function pageTies(s: Workspace, entry: Entry, types = tieTypesOf(s.worlds.find(w => w.id === entry.worldId)), campaignId: string | null = entry.campaignId): PageTie[] {
  const titles = new Map(s.entries.map(e => [e.id, e.title]));
  const scope = new Set(tiePages(s, entry, campaignId).map(e => e.id));
  return worldTies(s, entry.worldId, types)
    .filter(x => (x.fromId === entry.id && scope.has(x.toId)) || (x.toId === entry.id && scope.has(x.fromId)))
    .map(x => { const start = x.fromId === entry.id; return { ...x, otherId: start ? x.toId : x.fromId, label: tieLabel(x.type, start) }; })
    .sort((a, b) => (titles.get(a.otherId) ?? "").localeCompare(titles.get(b.otherId) ?? "") || a.label.localeCompare(b.label));
}

/** The people an organization's Profile names: everyone in its spots (with the spot's title) and its members (with their role). */
export function orgPeople(org: Entry): { id: string; detail?: string; gm?: boolean }[] {
  const people: { id: string; detail?: string; gm?: boolean }[] = [];
  for (const b of org.org?.blocks ?? []) {
    if (b.kind === "spots") for (const sp of b.spots) for (const p of sp.people) people.push({ id: p.entryId, detail: sp.title || undefined, ...(b.gm || sp.gm || p.gm ? { gm: true } : {}) });
    else if (b.kind === "members") for (const m of b.members) people.push({ id: m.entryId, detail: m.role || undefined, ...(b.gm || m.gm ? { gm: true } : {}) });
  }
  return people;
}

/** Ties worked out from other parts of the workspace: organizations, vehicles, quests and shared parents. */
export function workedOutTies(s: Workspace, entry: Entry, types = tieTypesOf(s.worlds.find(w => w.id === entry.worldId)), campaignId: string | null = entry.campaignId): WorkedOutTie[] {
  const out: WorkedOutTie[] = [];
  const pages = tiePages(s, entry, campaignId), scope = new Set(pages.map(e => e.id)), world = s.worlds.find(w => w.id === entry.worldId);
  const add = (x: WorkedOutTie) => { if (scope.has(x.otherId) && !out.some(o => o.otherId === x.otherId && o.label === x.label && o.detail === x.detail)) out.push(x); };
  // Organizations: the people in its spots and members, and the organizations a character is in.
  const membersOf = orgPeople;
  if (entry.kind === "faction") for (const p of membersOf(entry)) add({ otherId: p.id, label: "Has member", detail: p.detail, source: "organization" });
  if (entry.kind === "character") for (const org of pages) if (org.kind === "faction") for (const p of membersOf(org)) if (p.id === entry.id) add({ otherId: org.id, label: "Member of", detail: p.detail, source: "organization" });
  // Vehicles: owner, commander, seats, crew and where it is.
  if (entry.kind === "vehicle" && entry.vehicle) {
    const v = entry.vehicle, vt = vehicleTypeOf(v, world);
    for (const id of new Set(vehicleRefs(v))) {
      if (id === v.locationId) add({ otherId: id, label: "Is at", source: "vehicle" });
      const roles = vehicleRolesOf(v, vt, id);
      if (roles.length) add({ otherId: id, label: roles.join(" · "), source: "vehicle" });
    }
  }
  for (const veh of pages) if (veh.kind === "vehicle" && veh.vehicle) {
    const v = veh.vehicle, roles = vehicleRolesOf(v, vehicleTypeOf(v, world), entry.id);
    if (roles.length) add({ otherId: veh.id, label: roles.join(" · "), source: "vehicle" });
    if (v.locationId === entry.id) add({ otherId: veh.id, label: "Vehicle here", source: "vehicle" });
  }
  // Quests that name this page (a quest's own Connections tab lists the other way round).
  if (entry.kind !== "quest") for (const qe of pages) if (qe.kind === "quest" && qe.quest) {
    const q = qe.quest;
    if (q.giverId === entry.id) add({ otherId: qe.id, label: "Gave this quest", source: "quest" });
    if (q.placeId === entry.id) add({ otherId: qe.id, label: "Quest happens here", source: "quest" });
    if (q.rewardIds?.includes(entry.id)) add({ otherId: qe.id, label: "Quest reward", source: "quest" });
    if (q.objectives.some(o => o.targetId === entry.id || o.whereId === entry.id)) add({ otherId: qe.id, label: "In a quest goal", source: "quest" });
    if (q.linkIds?.includes(entry.id)) add({ otherId: qe.id, label: "Linked to a quest", source: "quest" });
  }
  // Siblings: other children of this page's parents, unless a sibling tie already says so.
  if (entry.kind === "character") {
    const all = worldTies(s, entry.worldId, types).filter(x => scope.has(x.fromId) || scope.has(x.toId) || x.fromId === entry.id || x.toId === entry.id);
    const parentsOf = (id: string) => new Set(all.filter(x => x.type.tree === "parent" && x.toId === id).map(x => x.fromId));
    const mine = parentsOf(entry.id);
    const told = new Set(all.filter(x => x.type.tree === "sibling" && (x.fromId === entry.id || x.toId === entry.id)).map(x => x.fromId === entry.id ? x.toId : x.fromId));
    const kids = new Set(all.filter(x => x.type.tree === "parent" && mine.has(x.fromId) && x.toId !== entry.id).map(x => x.toId));
    for (const k of kids) {
      if (told.has(k)) continue;
      const theirs = parentsOf(k), shared = [...mine].filter(p => theirs.has(p)).length;
      const full = shared === mine.size && shared === theirs.size;
      add({ otherId: k, label: full ? "Sibling of" : "Half-sibling of", detail: full ? "Same parents" : "One parent in common", source: "family" });
    }
  }
  return out;
}

export type PlayerTie = { id: string; label: string; note?: string };
/**
 * The ties players see on a page: shared ties and the cover story of a GM-only tie, only where players can read the
 * page at the other end. Ties from a character's People block count only when that Profile is shared.
 */
export function playerTies(s: Workspace, entry: Entry, campaignId: string, readable: (id: string) => boolean, clean: (t: string) => string): PlayerTie[] {
  const types = tieTypesOf(s.worlds.find(w => w.id === entry.worldId)), byId = new Map(s.entries.map(e => [e.id, e]));
  const out: PlayerTie[] = [];
  for (const x of pageTies(s, entry, types, campaignId)) {
    if (!readable(x.otherId)) continue;
    if (x.source === "profile" && byId.get(x.ownerId)?.profile?.visibility !== "players") continue;
    let label = x.label, note = x.tie.note;
    if (x.tie.gm) {
      if (!x.tie.cover) continue;
      const start = (x.fromId === entry.id) !== !!x.tie.cover.reversed;
      label = tieLabel(tieTypeById(types, x.tie.cover.typeId), start); note = x.tie.cover.note;
    }
    const text = note ? clean(note).trim() : "";
    out.push({ id: x.otherId, label, ...(text ? { note: text } : {}) });
  }
  return out;
}

/** How many ties use each kind, across a world. */
export function tieTypeUse(s: Workspace, worldId: string): Map<string, number> {
  const types = tieTypesOf(s.worlds.find(w => w.id === worldId)), use = new Map<string, number>();
  for (const x of worldTies(s, worldId, types)) { use.set(x.tie.typeId, (use.get(x.tie.typeId) ?? 0) + 1); if (x.tie.cover) use.set(x.tie.cover.typeId, (use.get(x.tie.cover.typeId) ?? 0) + 1); }
  return use;
}

/** A line per tie for an AI reading a page. */
export function tiesText(s: Workspace, entry: Entry, campaignId: string | null, title: (id: string) => string) {
  const types = tieTypesOf(s.worlds.find(w => w.id === entry.worldId));
  return pageTies(s, entry, types, campaignId).map(x => {
    const cover = x.tie.cover ? tieLabel(tieTypeById(types, x.tie.cover.typeId), (x.fromId === entry.id) !== !!x.tie.cover.reversed) : "";
    return { page: title(x.otherId), tie: x.label, note: x.tie.note || undefined, since: x.tie.since || undefined, until: x.tie.until || undefined, playersSee: !x.tie.gm, playersBelieve: x.tie.gm && cover ? `${cover}${x.tie.cover?.note ? `: ${x.tie.cover.note}` : ""}` : undefined };
  });
}
