import { z } from "zod";
import { barFieldSchema, beliefSchema, blockBase, defaultOrg, emblemSymbols, emptyBlock, layOutBar, layOutBlocks, maxBarFields, maxBlocks, maxMembers, oid, text, unique, visibility, type EmblemSymbol, type OrgBarField, type OrgBelief, type Standing } from "./org-profile.ts";
import type { Entry, Workspace, World } from "./world-model.ts";

/*
 * Character profiles: the Profile tab of a character page. Traits sit at the top as chips; below them is a two-column board
 * of blocks (beliefs, organizations, people, text, linked pages) and a "Right now" bar. It reuses the organization profile's
 * board, Arrange mode, beliefs and bar (lib/encyclopedia/org-profile.ts). The Organizations block stores nothing: it is
 * worked out from the organizations that list the character, and its edits (join, change standing or role, leave) write to
 * the organization's own profile. Everything here is pure.
 */

export const maxTraits = 12, maxTies = 40;
export const traitSchema = z.object({ id: oid, label: text(30), symbol: z.enum(emblemSymbols).optional(), gm: z.boolean().optional() });
export const tieSchema = z.object({ id: oid, entryId: oid, note: text(200).optional(), gm: z.boolean().optional() });

export const profileBlockKinds = ["beliefs", "organizations", "ties", "text", "linked"] as const;
export type ProfileBlockKind = typeof profileBlockKinds[number];
export const profileBlockInfo: Record<ProfileBlockKind, { name: string; title: string; blurb: string }> = {
  beliefs: { name: "Beliefs", title: "Beliefs", blurb: "A topic, a stance and a sentence of detail." },
  organizations: { name: "Organizations", title: "Organizations", blurb: "Every organization they are in, worked out from the organizations’ own pages." },
  ties: { name: "People", title: "People", blurb: "Ties to other characters and organizations, each with a short note." },
  text: { name: "Text", title: "Notes", blurb: "A paragraph of your own." },
  linked: { name: "Linked pages", title: "Linked pages", blurb: "Pages that mention this character." },
};
/** Block kinds that can appear only once on a profile. */
export const singleProfileKinds: ProfileBlockKind[] = ["organizations", "linked"];

export const profileBlockSchema = z.discriminatedUnion("kind", [
  z.object({ ...blockBase, kind: z.literal("beliefs"), beliefs: z.array(beliefSchema).max(20) }),
  z.object({ ...blockBase, kind: z.literal("organizations") }),
  z.object({ ...blockBase, kind: z.literal("ties"), ties: z.array(tieSchema).max(maxTies) }),
  z.object({ ...blockBase, kind: z.literal("text"), text: text(4000) }),
  z.object({ ...blockBase, kind: z.literal("linked") }),
]);
export const profileSchema = z.object({
  /** Whether players get the Profile tab (the tab's own visibility). */
  visibility,
  traits: z.array(traitSchema).max(maxTraits),
  blocks: z.array(profileBlockSchema).max(maxBlocks),
  bar: z.object({ title: text(40), hidden: z.boolean().optional(), fields: z.array(barFieldSchema).max(maxBarFields) }),
}).superRefine((p, ctx) => {
  const bad = (message: string) => ctx.addIssue({ code: "custom", message });
  if (!unique(p.blocks.map(b => b.id))) bad("Block ids must be unique");
  if (!unique(p.bar.fields.map(f => f.id))) bad("Bar field ids must be unique");
  if (!unique(p.traits.map(t => t.id))) bad("Trait ids must be unique");
  for (const b of p.blocks) {
    if (b.kind === "beliefs" && !unique(b.beliefs.map(x => x.id))) bad("Belief ids must be unique");
    if (b.kind === "ties" && !unique(b.ties.map(x => x.id))) bad("Tie ids must be unique");
  }
  if (p.blocks.filter(b => b.kind === "organizations").length > 1 || p.blocks.filter(b => b.kind === "linked").length > 1) bad("A profile has one Organizations block and one Linked pages block");
});
export type Profile = z.infer<typeof profileSchema>;
export type ProfileBlock = z.infer<typeof profileBlockSchema>;
export type ProfileTrait = z.infer<typeof traitSchema>;
export type ProfileTie = z.infer<typeof tieSchema>;
export type ProfileBlockOf<K extends ProfileBlockKind> = Extract<ProfileBlock, { kind: K }>;

/** The layout a world shares for every character: the blocks (without content), the bar's name and its field labels. */
export const characterLayoutSchema = z.object({
  blocks: z.array(z.object({ id: oid, kind: z.enum(profileBlockKinds), title: text(80), gm: z.boolean().optional(), column: z.enum(["left", "right"]), full: z.boolean().optional() })).max(maxBlocks),
  bar: z.object({ title: text(40), hidden: z.boolean().optional(), fields: z.array(z.object({ id: oid, label: text(40), gm: z.boolean().optional() })).max(maxBarFields) }),
}).superRefine((l, ctx) => {
  if (!unique(l.blocks.map(b => b.id)) || !unique(l.bar.fields.map(f => f.id))) ctx.addIssue({ code: "custom", message: "Layout ids must be unique" });
});
export type CharacterLayout = z.infer<typeof characterLayoutSchema>;

/** A block of this kind with nothing in it. */
export function emptyProfileBlock(kind: ProfileBlockKind, id: string, title: string, column: "left" | "right", extra: { gm?: boolean; full?: boolean } = {}): ProfileBlock {
  const head = { id, title, column, ...(extra.gm ? { gm: true } : {}), ...(extra.full ? { full: true } : {}) };
  switch (kind) {
    case "beliefs": return { ...head, kind, beliefs: [] };
    case "ties": return { ...head, kind, ties: [] };
    case "text": return { ...head, kind, text: "" };
    case "organizations": return { ...head, kind };
    default: return { ...head, kind: "linked" };
  }
}
/** A new block for Arrange mode's Add a block menu. */
export const newProfileBlock = (kind: ProfileBlockKind, id = crypto.randomUUID()): ProfileBlock => emptyProfileBlock(kind, id, profileBlockInfo[kind].title, "left");

/** Beliefs on the left; Organizations then People on the right. Right now has Wants, How and Trouble (GM only). */
export const defaultCharacterLayout = (): CharacterLayout => ({
  blocks: [
    { id: "beliefs", kind: "beliefs", title: "Beliefs", column: "left" },
    { id: "organizations", kind: "organizations", title: "Organizations", column: "right" },
    { id: "people", kind: "ties", title: "People", column: "right" },
  ],
  bar: { title: "Right now", fields: [{ id: "wants", label: "Wants" }, { id: "how", label: "How" }, { id: "trouble", label: "Trouble", gm: true }] },
});

/** A profile with the layout's blocks, empty. */
export function profileFromLayout(layout: CharacterLayout): Profile {
  return {
    visibility: "gm", traits: [],
    blocks: layout.blocks.map(b => emptyProfileBlock(b.kind, b.id, b.title, b.column, b)),
    bar: { title: layout.bar.title, ...(layout.bar.hidden ? { hidden: true } : {}), fields: layout.bar.fields.map(f => ({ id: f.id, label: f.label, value: "", ...(f.gm ? { gm: true } : {}) })) },
  };
}
/** The profile a new character starts with: the world's shared layout if it has one, else the default. Older pages show this too. */
export const defaultProfile = (world?: Pick<World, "characterLayout"> | null): Profile => profileFromLayout(world?.characterLayout ?? defaultCharacterLayout());
/** What a character's Profile tab shows: its own profile, or the world's default for an older page. */
export const profileOf = (entry: Pick<Entry, "profile">, world?: Pick<World, "characterLayout"> | null): Profile => entry.profile ?? defaultProfile(world);

/** A profile's structure as a shareable layout. */
export const profileLayoutOf = (p: Profile): CharacterLayout => ({
  blocks: p.blocks.map(b => ({ id: b.id, kind: b.kind, title: b.title, column: b.column, ...(b.gm ? { gm: true } : {}), ...(b.full ? { full: true } : {}) })),
  bar: { title: p.bar.title, ...(p.bar.hidden ? { hidden: true } : {}), fields: p.bar.fields.map(f => ({ id: f.id, label: f.label, ...(f.gm ? { gm: true } : {}) })) },
});

/** Whether a block holds anything its owner wrote. */
export function profileBlockHasContent(b: ProfileBlock): boolean {
  switch (b.kind) {
    case "beliefs": return b.beliefs.length > 0;
    case "ties": return b.ties.length > 0;
    case "text": return b.text.trim().length > 0;
    default: return false;
  }
}

/** Lays a layout onto one profile, keeping its content and traits, exactly as layOutOrg does for an organization. */
export function layOutProfile(p: Profile, layout: CharacterLayout): Profile {
  return { ...p, blocks: layOutBlocks<ProfileBlock, CharacterLayout["blocks"][number]>(p.blocks, layout.blocks, lb => emptyProfileBlock(lb.kind, lb.id, lb.title, lb.column, lb), profileBlockHasContent), bar: layOutBar(p.bar, layout.bar) };
}

/**
 * Saves a layout as the world's default for new characters and lays it onto every character in the world that has a profile.
 * Each keeps its own content. Older pages with no profile yet follow the world's layout when they get one.
 */
export function applyCharacterLayout(s: Workspace, worldId: string, layout: CharacterLayout, now = new Date().toISOString()): Workspace {
  const clean = characterLayoutSchema.parse(layout);
  return {
    ...s,
    worlds: s.worlds.map(w => w.id === worldId ? { ...w, characterLayout: clean } : w),
    entries: s.entries.map(e => e.worldId === worldId && e.kind === "character" && e.profile ? { ...e, profile: layOutProfile(e.profile, clean), updatedAt: now } : e),
  };
}

/* ---- References ---- */

/** Every page a profile's ties point at. */
export const profileRefs = (p: Profile): string[] => p.blocks.flatMap(b => b.kind === "ties" ? b.ties.map(t => t.entryId) : []);
/** Points a profile at new page ids (an import gives every page a new id); ties to pages not in the map are dropped. */
export function remapProfile(p: Profile, ids: ReadonlyMap<string, string>): Profile {
  return { ...p, blocks: p.blocks.map(b => b.kind === "ties" ? { ...b, ties: b.ties.filter(t => ids.has(t.entryId)).map(t => ({ ...t, entryId: ids.get(t.entryId)! })) } : b) };
}

/** The text Ctrl K searches: traits, the words of beliefs, ties' notes, text blocks and the bar's values. */
export function profileSearchText(p: Profile | undefined | null): string {
  if (!p) return "";
  const parts: (string | undefined)[] = p.traits.map(t => t.label);
  for (const b of p.blocks) {
    if (b.kind === "beliefs") for (const x of b.beliefs) parts.push(x.topic, x.stance, x.detail);
    else if (b.kind === "ties") for (const t of b.ties) parts.push(t.note);
    else if (b.kind === "text") parts.push(b.title, b.text);
  }
  for (const f of p.bar.fields) parts.push(f.value);
  return parts.filter(Boolean).join(" ");
}

/* ---- Organizations: worked out from the organizations' own profiles ---- */

/** One place a character holds in an organization: a person in a spot, or a member. */
export type OrgPlacement = { via: "spot" | "member"; role: string; standing?: Standing; gm: boolean };
export type CharacterOrg = {
  org: Entry; placements: OrgPlacement[];
  /** The roles together: spot titles and member roles. */
  role: string; standing?: Standing;
  /** True when every place they hold here is GM only. */
  gm: boolean;
};

/**
 * Every organization that lists the character, with the role (the spot's title, or the member's role) and standing. A place
 * is GM only when its block, spot, person or member is. `visibleOnly` drops the GM-only places first, so an organization
 * where all of them are GM only is left out (what players may see).
 */
export function organizationsOf(entries: readonly Entry[], characterId: string, visibleOnly = false): CharacterOrg[] {
  const out: CharacterOrg[] = [];
  for (const org of entries) {
    if (org.kind !== "faction" || !org.org) continue;
    const placements: OrgPlacement[] = [];
    for (const b of org.org.blocks) {
      if (b.kind === "spots") { for (const s of b.spots) for (const p of s.people) if (p.entryId === characterId) placements.push({ via: "spot", role: s.title, standing: p.standing, gm: !!(b.gm || s.gm || p.gm) }); }
      else if (b.kind === "members") for (const m of b.members) if (m.entryId === characterId) placements.push({ via: "member", role: m.role ?? "", standing: m.standing, gm: !!(b.gm || m.gm) });
    }
    const shown = visibleOnly ? placements.filter(p => !p.gm) : placements;
    if (!shown.length) continue;
    const roles = [...new Set(shown.map(p => p.role.trim()).filter(Boolean))];
    out.push({ org, placements: shown, role: roles.join(" · "), standing: shown.find(p => p.standing)?.standing, gm: shown.every(p => p.gm) });
  }
  return out.sort((a, b) => a.org.title.localeCompare(b.org.title));
}

/** Organizations a character may join: the same world, and an organization that may list them (the schema's rule). */
export const joinable = (s: Workspace, characterId: string): Entry[] => {
  const c = s.entries.find(e => e.id === characterId);
  if (!c || c.kind !== "character") return [];
  return s.entries.filter(e => e.kind === "faction" && e.worldId === c.worldId && (c.campaignId === null || e.campaignId === c.campaignId));
};

const orgEntry = (s: Workspace, characterId: string, orgId: string) => {
  const c = s.entries.find(e => e.id === characterId), org = s.entries.find(e => e.id === orgId);
  return c && org && c.kind === "character" && org.kind === "faction" && joinable(s, characterId).some(e => e.id === orgId) ? org : undefined;
};
const cutRole = (r?: string) => (r ?? "").slice(0, 80);
/** The members block a new member goes into: a shared one with room, else a new Members block, else any with room. */
function membersTarget(o: NonNullable<Entry["org"]>): { id: string } | "new" | null {
  const open = o.blocks.filter(b => b.kind === "members" && b.members.length < maxMembers);
  const shared = open.find(b => !b.gm);
  if (shared) return { id: shared.id };
  if (o.blocks.length < maxBlocks) return "new";
  return open[0] ? { id: open[0].id } : null;
}

/** Why the character can't join the organization, or null when they can. */
export function joinRefusal(s: Workspace, characterId: string, orgId: string): string | null {
  const org = orgEntry(s, characterId, orgId);
  if (!org) return "That organization isn’t in this character’s world and campaign.";
  if (organizationsOf([org], characterId).length) return "They are already in that organization.";
  const o = org.org ?? defaultOrg(s.worlds.find(w => w.id === org.worldId));
  return membersTarget(o) ? null : "That organization has no room for another member.";
}

const touch = (s: Workspace, orgId: string, now: string, f: (o: NonNullable<Entry["org"]>) => NonNullable<Entry["org"]>): Workspace => ({
  ...s, entries: s.entries.map(e => e.id === orgId && e.kind === "faction" ? { ...e, org: f(e.org ?? defaultOrg(s.worlds.find(w => w.id === e.worldId))), editedBy: undefined, updatedAt: now } : e),
});

/**
 * Adds the character to the organization's Members block with a role and standing, making that block if the organization has
 * none. The edit is written to the organization's own profile: the character stores nothing. Returns the workspace unchanged
 * when the character can't join (see joinRefusal).
 */
export function joinOrg(s: Workspace, characterId: string, orgId: string, place: { role?: string; standing?: Standing }, now = new Date().toISOString(), newId: () => string = () => crypto.randomUUID()): Workspace {
  if (joinRefusal(s, characterId, orgId)) return s;
  const role = cutRole(place.role).trim(), member = { id: newId(), entryId: characterId, ...(role ? { role } : {}), ...(place.standing ? { standing: place.standing } : {}) };
  return touch(s, orgId, now, o => {
    const target = membersTarget(o)!;
    if (target === "new") {
      const left = o.blocks.filter(b => b.column === "left" && !b.full).length, right = o.blocks.filter(b => b.column === "right" && !b.full).length;
      return { ...o, blocks: [...o.blocks, { ...emptyBlock("members", newId(), "Members", left > right ? "right" : "left"), kind: "members" as const, members: [member] }] };
    }
    return { ...o, blocks: o.blocks.map(b => b.id === target.id && b.kind === "members" ? { ...b, members: [...b.members, member] } : b) };
  });
}

/**
 * Changes the character's standing (everywhere they appear in the organization) and, for a member, their role. A person in a
 * spot has the spot's title as their role, so only the organization's own page changes that.
 */
export function setOrgPlace(s: Workspace, characterId: string, orgId: string, patch: { role?: string; standing?: Standing | null }, now = new Date().toISOString()): Workspace {
  if (!organizationsOf(s.entries.filter(e => e.id === orgId), characterId).length) return s;
  const set = <T extends { standing?: Standing }>(x: T): T => { if (patch.standing === undefined) return x; const rest: Record<string, unknown> = { ...x }; delete rest.standing; return (patch.standing ? { ...rest, standing: patch.standing } : rest) as T; };
  return touch(s, orgId, now, o => ({ ...o, blocks: o.blocks.map(b => {
    if (b.kind === "spots") return { ...b, spots: b.spots.map(sp => ({ ...sp, people: sp.people.map(p => p.entryId === characterId ? set(p) : p) })) };
    if (b.kind === "members") return { ...b, members: b.members.map(m => {
      if (m.entryId !== characterId) return m;
      const next = set(m);
      if (patch.role === undefined) return next;
      const role = cutRole(patch.role), rest: Record<string, unknown> = { ...next }; delete rest.role;
      // Kept as typed (a trailing space is part of the next word); an empty or blank role is no role.
      return (role.trim() ? { ...rest, role } : rest) as typeof next;
    }) };
    return b;
  }) }));
}

/** Takes the character out of the organization: every spot and member entry of theirs. */
export function leaveOrg(s: Workspace, characterId: string, orgId: string, now = new Date().toISOString()): Workspace {
  if (!organizationsOf(s.entries.filter(e => e.id === orgId), characterId).length) return s;
  return touch(s, orgId, now, o => ({ ...o, blocks: o.blocks.map(b => {
    if (b.kind === "spots") return { ...b, spots: b.spots.map(sp => ({ ...sp, people: sp.people.filter(p => p.entryId !== characterId) })) };
    if (b.kind === "members") return { ...b, members: b.members.filter(m => m.entryId !== characterId) };
    return b;
  }) }));
}

/* ---- The AI connection ---- */

/** A compact text form of a character's profile (GM reads): traits, one line per block, their organizations and the bar. */
export function characterProfileText(p: Profile | undefined | null, title: (entryId: string) => string, orgs: CharacterOrg[]): string | undefined {
  const who = (id: string) => title(id) || "(missing page)", tag = (gm?: boolean) => (gm ? " [GM only]" : "");
  const lines: string[] = [];
  if (p?.traits.length) lines.push(`Traits: ${p.traits.map(t => `${t.label}${tag(t.gm)}`).join(", ")}`);
  for (const b of p?.blocks ?? []) {
    const name = `${b.title || profileBlockInfo[b.kind].name}${tag(b.gm)}`;
    if (b.kind === "beliefs" && b.beliefs.length) lines.push(`${name}: ${b.beliefs.map(x => `${x.topic}: ${x.stance}${x.detail ? ` – ${x.detail}` : ""}${tag(x.gm)}`).join("; ")}`);
    else if (b.kind === "ties" && b.ties.length) lines.push(`${name}: ${b.ties.map(t => `${who(t.entryId)}${t.note ? ` – ${t.note}` : ""}${tag(t.gm)}`).join("; ")}`);
    else if (b.kind === "text" && b.text.trim()) lines.push(`${name}: ${b.text.trim()}`);
  }
  if (orgs.length) lines.push(`Organizations: ${orgs.map(o => `${o.org.title}${o.role ? `, ${o.role}` : ""}${o.standing ? ` (${o.standing})` : ""}${tag(o.gm)}`).join("; ")}`);
  if (p && !p.bar.hidden) { const set = p.bar.fields.filter(f => f.value); if (set.length) lines.push(`${p.bar.title || "Right now"}: ${set.map(f => `${f.label}: ${f.value}${tag(f.gm)}`).join("; ")}`); }
  if (!lines.length) return undefined;
  if (p) lines.splice(p.traits.length ? 1 : 0, 0, `Profile tab: ${p.visibility === "players" ? "players can see it" : "GM only"}`);
  const out = lines.join("\n");
  return out.length > 4000 ? out.slice(0, 3990) + "…" : out;
}

/* ---- Players ---- */

export type PlayerLink = { id: string; title: string };
/** An organization as players see it in a character's profile: only its name and type, and the character's role and standing. */
export type PlayerProfileOrg = { id: string; title: string; type: string; role: string; standing?: Standing };
export type PlayerProfileBlock = { id: string; kind: ProfileBlockKind; title: string; column: "left" | "right"; full: boolean } & (
  { kind: "beliefs"; beliefs: { id: string; topic: string; stance: string; detail: string }[] }
  | { kind: "organizations"; organizations: PlayerProfileOrg[] }
  | { kind: "ties"; ties: { id: string; entryId: string; title: string; note: string }[] }
  | { kind: "text"; text: string }
  | { kind: "linked"; linked: PlayerLink[] }
);
export type PlayerProfile = {
  traits: { id: string; label: string; symbol?: EmblemSymbol }[];
  blocks: PlayerProfileBlock[];
  bar?: { title: string; fields: { id: string; label: string; value: string }[] };
};
export type PlayerProfileContext = { title?: (entryId: string) => string; linked?: PlayerLink[] };

/**
 * The organizations players may see for a character: the page is readable, its own Profile is shared, and the character's
 * place in it isn't GM only. Each is only its name and type with the role and standing. `entries` is every page of the world
 * the campaign can see.
 */
export function playerOrganizations(entries: readonly Entry[], characterId: string, readable: (entryId: string) => boolean, clean: (text: string) => string): PlayerProfileOrg[] {
  return organizationsOf(entries, characterId, true)
    .filter(o => readable(o.org.id) && o.org.org?.visibility === "players")
    .map(o => ({ id: o.org.id, title: o.org.title, type: clean(o.org.org?.type ?? ""), role: clean(o.role), ...(o.standing ? { standing: o.standing } : {}) }));
}

/**
 * The profile as players may read it: an explicit allowlist built field by field, never the GM object. GM-only traits, blocks,
 * beliefs, ties and bar fields are left out, as are ties to pages players can't read. Text goes through `clean` (playerText).
 * `organizations` is what playerOrganizations worked out.
 */
export function playerProfile(p: Profile, readable: (entryId: string) => boolean, clean: (text: string) => string, organizations: PlayerProfileOrg[], context: PlayerProfileContext = {}): PlayerProfile {
  const name = context.title ?? (() => "");
  const blocks: PlayerProfileBlock[] = [];
  for (const b of p.blocks) {
    if (b.gm) continue;
    const head = { id: b.id, title: clean(b.title), column: b.column, full: !!b.full };
    if (b.kind === "beliefs") blocks.push({ ...head, kind: "beliefs", beliefs: b.beliefs.filter(x => !x.gm).map((x: OrgBelief) => ({ id: x.id, topic: clean(x.topic), stance: clean(x.stance), detail: clean(x.detail) })) });
    else if (b.kind === "organizations") blocks.push({ ...head, kind: "organizations", organizations: organizations.map(o => ({ id: o.id, title: o.title, type: o.type, role: o.role, ...(o.standing ? { standing: o.standing } : {}) })) });
    else if (b.kind === "ties") blocks.push({ ...head, kind: "ties", ties: b.ties.filter(t => !t.gm && readable(t.entryId)).map(t => ({ id: t.id, entryId: t.entryId, title: name(t.entryId), note: clean(t.note ?? "") })) });
    else if (b.kind === "text") { const t = clean(b.text); if (t) blocks.push({ ...head, kind: "text", text: t }); }
    else blocks.push({ ...head, kind: "linked", linked: (context.linked ?? []).filter(l => readable(l.id)) });
  }
  const fields = p.bar.hidden ? [] : p.bar.fields.filter((f: OrgBarField) => !f.gm).map(f => ({ id: f.id, label: clean(f.label), value: clean(f.value) })).filter(f => f.label && f.value);
  return {
    traits: p.traits.filter(t => !t.gm).map(t => ({ id: t.id, label: clean(t.label), ...(t.symbol ? { symbol: t.symbol } : {}) })).filter(t => t.label),
    blocks, ...(p.bar.hidden ? {} : { bar: { title: clean(p.bar.title), fields } }),
  };
}
