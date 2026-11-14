import { z } from "zod";
import { hexColour } from "../colour.ts";
import { imageIdSchema } from "./map-model.ts";
import type { Entry, Workspace, World } from "./world-model.ts";

/*
 * Organization profiles: the Profile tab of a faction page (the stored kind is still "faction", the app calls it an
 * Organization). A profile is a banner (emblem, type, motto), a board of blocks in two columns, and a bottom bar of
 * "Right now" fields. Everything here is pure: the schema, the default layout, laying a layout onto every organization
 * of a world, and what players are allowed to see (an explicit allowlist, never the GM object).
 *
 * Kept queryable for later: people in spots and members are lists of `entryId`s (a character's page).
 */

export const oid = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export const visibility = z.enum(["gm", "players"]);
export const text = (max: number) => z.string().trim().max(max);
const label = (max: number) => z.string().trim().min(1).max(max);

export const standings = ["hostile", "wary", "neutral", "friendly", "loyal"] as const;
export type Standing = typeof standings[number];
export const standingNames: Record<Standing, string> = { hostile: "Hostile", wary: "Wary", neutral: "Neutral", friendly: "Friendly", loyal: "Loyal" };
export const emblemShapes = ["shield", "banner", "round", "none"] as const;
export type EmblemShape = typeof emblemShapes[number];
export const shapeNames: Record<EmblemShape, string> = { shield: "Shield", banner: "Banner", round: "Round", none: "None" };
/** The symbols offered for an emblem. Each is a lucide-react icon (see components/encyclopedia/org-icons.tsx). */
export const emblemSymbols = ["anchor", "crown", "swords", "sparkles", "moon", "scale", "castle", "flower", "skull", "sailboat", "key", "eye", "hammer", "flame"] as const;
export type EmblemSymbol = typeof emblemSymbols[number];
export const symbolSwatches = ["#9b6a1f", "#b5483a", "#3b6fb6", "#2f7f6b", "#6b4fa0", "#c07a2c", "#4b5560", "#a23f75"] as const;
export const mapSwatches = ["#3b6fb6", "#2f7f6b", "#b5483a", "#c07a2c", "#6b4fa0", "#8a5a3c", "#4b5560", "#a23f75"] as const;
export const defaultMapColour = "#3b6fb6";

/** Kinds of organization to pick from, in groups. Anyone can also type their own; those are kept on the world. */
export const orgTypeGroups: { group: string; types: string[] }[] = [
  { group: "Trade", types: ["Guild", "Toll guild", "Merchant company", "Smugglers"] },
  { group: "Faith", types: ["Church", "Cult", "Monastic order"] },
  { group: "Power", types: ["Noble house", "Council", "Army", "Knightly order"] },
  { group: "Hidden", types: ["Secret society", "Thieves' guild", "Spy network"] },
];
export const orgTypeList = orgTypeGroups.flatMap(g => g.types);

export const blockKinds = ["spots", "subgroups", "members", "facts", "beliefs", "holdings", "text", "linked"] as const;
export type BlockKind = typeof blockKinds[number];
export const blockKindInfo: Record<BlockKind, { name: string; title: string; blurb: string }> = {
  spots: { name: "People in spots", title: "Leadership", blurb: "Named spots such as Warden-Captains, each holding any number of characters." },
  subgroups: { name: "Subgroups", title: "Subgroups", blurb: "Organization pages inside this one, with a stack of their members." },
  members: { name: "Members", title: "Members", blurb: "Characters with a role and a standing." },
  facts: { name: "Facts", title: "At a glance", blurb: "Short labelled lines, such as Seat of power or Founded." },
  beliefs: { name: "Beliefs", title: "Beliefs", blurb: "A topic, a stance and a sentence of detail." },
  holdings: { name: "Holdings", title: "Holdings", blurb: "Pages they own: places, ships and notes." },
  text: { name: "Text", title: "Notes", blurb: "A paragraph of your own." },
  linked: { name: "Linked pages", title: "Linked pages", blurb: "Pages that mention this organization." },
};
/** Block kinds that can appear only once on a profile. */
export const singleBlockKinds: BlockKind[] = ["subgroups", "linked"];

export const maxBarFields = 6, maxBlocks = 20, maxOrgTypes = 60, maxSpots = 20, maxPeople = 30, maxMembers = 60;
const personSchema = z.object({ id: oid, entryId: oid, note: text(200).optional(), standing: z.enum(standings).optional(), gm: z.boolean().optional() });
const spotSchema = z.object({ id: oid, title: text(80), gm: z.boolean().optional(), people: z.array(personSchema).max(maxPeople) });
const memberSchema = z.object({ id: oid, entryId: oid, role: text(80).optional(), standing: z.enum(standings).optional(), gm: z.boolean().optional() });
const factSchema = z.object({ id: oid, label: text(60), value: text(200), entryId: oid.optional(), gm: z.boolean().optional() });
export const beliefSchema = z.object({ id: oid, topic: text(60), stance: text(100), detail: text(400), gm: z.boolean().optional() });
const holdingSchema = z.object({ id: oid, entryId: oid, gm: z.boolean().optional() });
export const blockBase = { id: oid, title: text(80), gm: z.boolean().optional(), column: z.enum(["left", "right"]), full: z.boolean().optional() };
export const blockSchema = z.discriminatedUnion("kind", [
  z.object({ ...blockBase, kind: z.literal("spots"), spots: z.array(spotSchema).max(maxSpots) }),
  z.object({ ...blockBase, kind: z.literal("subgroups") }),
  z.object({ ...blockBase, kind: z.literal("members"), members: z.array(memberSchema).max(maxMembers) }),
  z.object({ ...blockBase, kind: z.literal("facts"), facts: z.array(factSchema).max(30) }),
  z.object({ ...blockBase, kind: z.literal("beliefs"), beliefs: z.array(beliefSchema).max(20) }),
  z.object({ ...blockBase, kind: z.literal("holdings"), holdings: z.array(holdingSchema).max(40) }),
  z.object({ ...blockBase, kind: z.literal("text"), text: text(4000) }),
  z.object({ ...blockBase, kind: z.literal("linked") }),
]);
export const barFieldSchema = z.object({ id: oid, label: text(40), value: text(300), gm: z.boolean().optional() });
export const emblemSchema = z.object({
  shape: z.enum(emblemShapes), symbol: z.enum(emblemSymbols).optional(), imageId: imageIdSchema.optional(), colour: hexColour.optional(), mapColour: hexColour.optional(),
});
export const unique = (ids: string[]) => new Set(ids).size === ids.length;
export const orgSchema = z.object({
  /** Whether players get the Profile tab (the tab's own visibility). */
  visibility,
  type: text(60).optional(), motto: text(200).optional(),
  emblem: emblemSchema,
  banner: z.object({ imageId: imageIdSchema }).optional(),
  blocks: z.array(blockSchema).max(maxBlocks),
  bar: z.object({ title: text(40), hidden: z.boolean().optional(), fields: z.array(barFieldSchema).max(maxBarFields) }),
}).superRefine((o, ctx) => {
  const bad = (message: string) => ctx.addIssue({ code: "custom", message });
  if (!unique(o.blocks.map(b => b.id))) bad("Block ids must be unique");
  if (!unique(o.bar.fields.map(f => f.id))) bad("Bar field ids must be unique");
  for (const b of o.blocks) {
    if (b.kind === "spots") { if (!unique(b.spots.map(s => s.id)) || b.spots.some(s => !unique(s.people.map(p => p.id)))) bad("Spot and person ids must be unique"); }
    else if (b.kind === "members") { if (!unique(b.members.map(m => m.id))) bad("Member ids must be unique"); }
    else if (b.kind === "facts") { if (!unique(b.facts.map(f => f.id))) bad("Fact ids must be unique"); }
    else if (b.kind === "beliefs") { if (!unique(b.beliefs.map(x => x.id))) bad("Belief ids must be unique"); }
    else if (b.kind === "holdings") { if (!unique(b.holdings.map(h => h.id))) bad("Holding ids must be unique"); }
  }
  if (o.blocks.filter(b => b.kind === "subgroups").length > 1 || o.blocks.filter(b => b.kind === "linked").length > 1) bad("A profile has one Subgroups block and one Linked pages block");
});
export type Org = z.infer<typeof orgSchema>;
export type OrgBlock = z.infer<typeof blockSchema>;
export type OrgBarField = z.infer<typeof barFieldSchema>;
export type OrgEmblem = z.infer<typeof emblemSchema>;
export type OrgPerson = z.infer<typeof personSchema>;
export type OrgSpot = z.infer<typeof spotSchema>;
export type OrgMember = z.infer<typeof memberSchema>;
export type OrgFact = z.infer<typeof factSchema>;
export type OrgBelief = z.infer<typeof beliefSchema>;
export type OrgHolding = z.infer<typeof holdingSchema>;
export type BlockOf<K extends BlockKind> = Extract<OrgBlock, { kind: K }>;

/** The layout a world shares: the blocks (without content), the bar's name and its field labels. */
export const orgLayoutSchema = z.object({
  blocks: z.array(z.object({ id: oid, kind: z.enum(blockKinds), title: text(80), gm: z.boolean().optional(), column: z.enum(["left", "right"]), full: z.boolean().optional() })).max(maxBlocks),
  bar: z.object({ title: text(40), hidden: z.boolean().optional(), fields: z.array(z.object({ id: oid, label: text(40), gm: z.boolean().optional() })).max(maxBarFields) }),
}).superRefine((l, ctx) => {
  if (!unique(l.blocks.map(b => b.id)) || !unique(l.bar.fields.map(f => f.id))) ctx.addIssue({ code: "custom", message: "Layout ids must be unique" });
});
export type OrgLayout = z.infer<typeof orgLayoutSchema>;
export const orgTypesSchema = z.array(label(60)).max(maxOrgTypes);

const newOrgId = () => crypto.randomUUID();

/** A block of this kind with nothing in it. */
export function emptyBlock(kind: BlockKind, id: string, title: string, column: "left" | "right", extra: { gm?: boolean; full?: boolean } = {}): OrgBlock {
  const head = { id, title, column, ...(extra.gm ? { gm: true } : {}), ...(extra.full ? { full: true } : {}) };
  switch (kind) {
    case "spots": return { ...head, kind, spots: [] };
    case "members": return { ...head, kind, members: [] };
    case "facts": return { ...head, kind, facts: [] };
    case "beliefs": return { ...head, kind, beliefs: [] };
    case "holdings": return { ...head, kind, holdings: [] };
    case "text": return { ...head, kind, text: "" };
    case "subgroups": return { ...head, kind };
    default: return { ...head, kind: "linked" };
  }
}
/** A new block for Arrange mode's Add a block menu. */
export const newBlock = (kind: BlockKind, id = newOrgId()): OrgBlock => emptyBlock(kind, id, blockKindInfo[kind].title, "left");

export const defaultLayout = (): OrgLayout => ({
  blocks: [
    { id: "leadership", kind: "spots", title: "Leadership", column: "left" },
    { id: "subgroups", kind: "subgroups", title: "Subgroups", column: "left" },
    { id: "members", kind: "members", title: "Members", column: "left" },
    { id: "glance", kind: "facts", title: "At a glance", column: "right" },
    { id: "beliefs", kind: "beliefs", title: "Beliefs", column: "right" },
    { id: "holdings", kind: "holdings", title: "Holdings", column: "right" },
  ],
  bar: { title: "Right now", fields: [{ id: "wants", label: "Wants" }, { id: "plan", label: "Plan", gm: true }, { id: "trouble", label: "Trouble", gm: true }, { id: "rumour", label: "Rumour" }] },
});

const blankEmblem = (): OrgEmblem => ({ shape: "shield" });
/** A profile with the layout's blocks, empty. */
export function orgFromLayout(layout: OrgLayout): Org {
  return {
    visibility: "gm", emblem: blankEmblem(),
    blocks: layout.blocks.map(b => emptyBlock(b.kind, b.id, b.title, b.column, b)),
    bar: { title: layout.bar.title, ...(layout.bar.hidden ? { hidden: true } : {}), fields: layout.bar.fields.map(f => ({ id: f.id, label: f.label, value: "", ...(f.gm ? { gm: true } : {}) })) },
  };
}
/**
 * The profile a new organization starts with: the world's shared layout if it has one, else the default (whose
 * "At a glance" block comes with Seat of power, Founded and Motto). Pages made before profiles show this too.
 */
export function defaultOrg(world?: Pick<World, "orgLayout"> | null): Org {
  if (world?.orgLayout) return orgFromLayout(world.orgLayout);
  const org = orgFromLayout(defaultLayout());
  return { ...org, blocks: org.blocks.map(b => b.kind === "facts" && b.id === "glance" ? { ...b, facts: [{ id: "seat", label: "Seat of power", value: "" }, { id: "founded", label: "Founded", value: "" }, { id: "motto", label: "Motto", value: "" }] } : b) };
}
/** What a page's Profile tab shows: its own profile, or the world's default for an older page. */
export const orgOf = (entry: Pick<Entry, "org">, world?: Pick<World, "orgLayout"> | null): Org => entry.org ?? defaultOrg(world);

/** A profile's structure as a shareable layout. */
export const layoutOf = (org: Org): OrgLayout => ({
  blocks: org.blocks.map(b => ({ id: b.id, kind: b.kind, title: b.title, column: b.column, ...(b.gm ? { gm: true } : {}), ...(b.full ? { full: true } : {}) })),
  bar: { title: org.bar.title, ...(org.bar.hidden ? { hidden: true } : {}), fields: org.bar.fields.map(f => ({ id: f.id, label: f.label, ...(f.gm ? { gm: true } : {}) })) },
});

/** Whether a block holds anything its owner wrote. */
export function blockHasContent(b: OrgBlock): boolean {
  switch (b.kind) {
    case "spots": return b.spots.length > 0;
    case "members": return b.members.length > 0;
    case "facts": return b.facts.some(f => f.value || f.entryId);
    case "beliefs": return b.beliefs.length > 0;
    case "holdings": return b.holdings.length > 0;
    case "text": return b.text.trim().length > 0;
    default: return false;
  }
}

/**
 * Lays a layout onto one profile. Blocks are matched by id, then by kind; a matched block keeps its content and takes the
 * layout's title, visibility, column and width. Blocks the layout doesn't have go, unless they hold something: those stay
 * at the end so nothing anyone wrote is lost. The bar is matched by field id, then by label, and keeps its values.
 */
export function layOutOrg(org: Org, layout: OrgLayout): Org {
  return { ...org, blocks: layOutBlocks(org.blocks, layout.blocks, lb => emptyBlock(lb.kind, lb.id, lb.title, lb.column, lb), blockHasContent), bar: layOutBar(org.bar, layout.bar) };
}

/** A block as the board and the layout see it: any profile's blocks have these. */
export type BoardBlock = { id: string; kind: string; title: string; gm?: boolean; column: "left" | "right"; full?: boolean };
/** The block half of layOutOrg, for any profile's blocks (organizations and characters share it). */
export function layOutBlocks<B extends BoardBlock, L extends BoardBlock>(have: readonly B[], layout: readonly L[], empty: (lb: L) => B, hasContent: (b: B) => boolean): B[] {
  const used = new Set<string>(), blocks: B[] = [];
  const take = (pick: (b: B) => boolean) => { const found = have.find(b => !used.has(b.id) && pick(b)); if (found) used.add(found.id); return found; };
  // Every exact id match is taken first, so a block matched only by kind can never steal the page of a later layout block.
  const layoutIds = new Set(layout.map(b => b.id));
  const matched = layout.map(lb => take(b => b.id === lb.id && b.kind === lb.kind));
  layout.forEach((lb, i) => { matched[i] ??= take(b => b.kind === lb.kind); });
  layout.forEach((lb, i) => {
    const found = matched[i], { id, title, column, gm, full } = lb;
    if (!found) { blocks.push(empty(lb)); return; }
    // A block keeps its own id unless that is another layout block's id (then it takes this one's), so ids stay unique.
    const rest: Record<string, unknown> = { ...found, id: found.id === id || !layoutIds.has(found.id) ? found.id : id, title, column };
    delete rest.gm; delete rest.full;
    blocks.push({ ...rest, ...(gm ? { gm: true } : {}), ...(full ? { full: true } : {}) } as B);
  });
  const leftovers = have.filter(b => !used.has(b.id) && hasContent(b));
  const ids = new Set(blocks.map(b => b.id));
  for (const b of leftovers) if (blocks.length < maxBlocks && !ids.has(b.id)) blocks.push(b);
  return blocks;
}
type BarOf = { title: string; hidden?: boolean; fields: OrgBarField[] };
/** The bar half of layOutOrg: matched by field id, then by label, keeping the values. */
export function layOutBar(bar: BarOf, layout: OrgLayout["bar"]): BarOf {
  const usedField = new Set<string>(), fields: OrgBarField[] = [];
  const takeField = (pick: (f: OrgBarField) => boolean) => { const f = bar.fields.find(x => !usedField.has(x.id) && pick(x)); if (f) usedField.add(f.id); return f; };
  const byId = layout.fields.map(lf => takeField(x => x.id === lf.id));
  layout.fields.forEach((lf, i) => { byId[i] ??= takeField(x => x.label.trim().toLowerCase() === lf.label.trim().toLowerCase()); });
  layout.fields.forEach((lf, i) => { fields.push({ id: lf.id, label: lf.label, value: byId[i]?.value ?? "", ...(lf.gm ? { gm: true } : {}) }); });
  for (const f of bar.fields) if (!usedField.has(f.id) && f.value.trim() && fields.length < maxBarFields && !fields.some(x => x.id === f.id)) fields.push(f);
  return { title: layout.title, ...(layout.hidden ? { hidden: true } : {}), fields };
}

/**
 * Saves a layout as the world's default for new organizations and lays it onto every organization in the world that has a
 * profile. Each keeps its own content. Older pages with no profile yet follow the world's layout when they get one.
 */
export function applyOrgLayout(s: Workspace, worldId: string, layout: OrgLayout, now = new Date().toISOString()): Workspace {
  const clean = orgLayoutSchema.parse(layout);
  return {
    ...s,
    worlds: s.worlds.map(w => w.id === worldId ? { ...w, orgLayout: clean } : w),
    entries: s.entries.map(e => e.worldId === worldId && e.kind === "faction" && e.org ? { ...e, org: layOutOrg(e.org, clean), updatedAt: now } : e),
  };
}

/** A custom organization type, kept for the world's other organizations (not for ones already offered). */
export function addOrgType(s: Workspace, worldId: string, type: string): Workspace {
  const name = type.trim().slice(0, 60);
  if (!name || orgTypeList.some(t => t.toLowerCase() === name.toLowerCase())) return s;
  return { ...s, worlds: s.worlds.map(w => {
    if (w.id !== worldId) return w;
    const have = w.orgTypes ?? [];
    return have.some(t => t.toLowerCase() === name.toLowerCase()) || have.length >= maxOrgTypes ? w : { ...w, orgTypes: [...have, name] };
  }) };
}

/* ---- The board: blocks laid out in rows, and moving blocks around ---- */

export type BoardPlace = { id: string; column: "left" | "right"; full?: boolean };
export type Segment<B extends BoardPlace = OrgBlock> = { full: B } | { left: B[]; right: B[]; endsBefore: string | null };
/** The blocks in reading order as rows: a full-width block is a row, the others stack in two columns between them. */
export function boardSegments<B extends BoardPlace>(blocks: readonly B[]): Segment<B>[] {
  const out: Segment<B>[] = [];
  let open: { left: B[]; right: B[]; endsBefore: string | null } | null = null;
  for (const b of blocks) {
    if (b.full) { if (open) open.endsBefore = b.id; open = null; out.push({ full: b }); continue; }
    if (!open) { open = { left: [], right: [], endsBefore: null }; out.push(open); }
    open[b.column].push(b);
  }
  return out;
}
/** Takes a block out and puts it before another (or last), in a column. */
export function placeBlock<B extends BoardPlace>(blocks: readonly B[], id: string, beforeId: string | null, column?: "left" | "right"): B[] {
  const moving = blocks.find(b => b.id === id);
  if (!moving || beforeId === id) return [...blocks];
  const rest = blocks.filter(b => b.id !== id), at = beforeId ? rest.findIndex(b => b.id === beforeId) : -1;
  const next = column ? ({ ...moving, column } as B) : moving;
  rest.splice(at < 0 ? rest.length : at, 0, next);
  return rest;
}
/** Moves a block up or down past the next block that shares its column (or a full-width one). */
export function moveBlockBy<B extends BoardPlace>(blocks: readonly B[], id: string, delta: -1 | 1): B[] {
  const at = blocks.findIndex(b => b.id === id);
  if (at < 0) return [...blocks];
  const me = blocks[at];
  let to = at + delta;
  while (to >= 0 && to < blocks.length && !(me.full || blocks[to].full || blocks[to].column === me.column)) to += delta;
  if (to < 0 || to >= blocks.length) return [...blocks];
  const next = [...blocks];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}
export const switchColumn = <B extends BoardPlace>(blocks: readonly B[], id: string): B[] => blocks.map(b => b.id === id ? ({ ...b, column: b.column === "left" ? "right" : "left" } as B) : b);

/* ---- References ---- */

/** Every page a profile points at: characters (people and members) and other pages (holdings, fact links). */
export function orgRefs(org: Org) {
  const characters: string[] = [], pages: string[] = [];
  for (const b of org.blocks) {
    if (b.kind === "spots") for (const s of b.spots) for (const p of s.people) characters.push(p.entryId);
    else if (b.kind === "members") for (const m of b.members) characters.push(m.entryId);
    else if (b.kind === "holdings") for (const h of b.holdings) pages.push(h.entryId);
    else if (b.kind === "facts") for (const f of b.facts) if (f.entryId) pages.push(f.entryId);
  }
  return { characters, pages };
}
/** The characters in an organization (people in spots, then members), once each. `allow` can leave out GM-only entries. */
export function orgMembersOf(org: Org | undefined | null, allow: (entryId: string, gm: boolean) => boolean = () => true): string[] {
  if (!org) return [];
  const out: string[] = [];
  const add = (entryId: string, gm?: boolean) => { if (!out.includes(entryId) && allow(entryId, !!gm)) out.push(entryId); };
  for (const b of org.blocks) {
    if (b.kind === "spots") for (const s of b.spots) for (const p of s.people) add(p.entryId, b.gm || s.gm || p.gm);
    else if (b.kind === "members") for (const m of b.members) add(m.entryId, b.gm || m.gm);
  }
  return out;
}
/** Points a profile at new page ids (an import gives every page a new id); references to pages not in the map are dropped. */
export function remapOrg(org: Org, ids: ReadonlyMap<string, string>): Org {
  const keep = <T extends { entryId: string }>(list: T[]) => list.filter(x => ids.has(x.entryId)).map(x => ({ ...x, entryId: ids.get(x.entryId)! }));
  return { ...org, blocks: org.blocks.map(b => {
    if (b.kind === "spots") return { ...b, spots: b.spots.map(s => ({ ...s, people: keep(s.people) })) };
    if (b.kind === "members") return { ...b, members: keep(b.members) };
    if (b.kind === "holdings") return { ...b, holdings: keep(b.holdings) };
    if (b.kind === "facts") return { ...b, facts: b.facts.map(f => { if (!f.entryId) return f; const { entryId, ...rest } = f; return ids.has(entryId) ? { ...rest, entryId: ids.get(entryId)! } : rest; }) };
    return b;
  }) };
}

/** The text Ctrl K searches: type, motto, and the words of facts, beliefs, spots, members' roles and text blocks. */
export function orgSearchText(org: Org | undefined | null): string {
  if (!org) return "";
  const parts: (string | undefined)[] = [org.type, org.motto];
  for (const b of org.blocks) {
    if (b.kind === "facts") for (const f of b.facts) parts.push(f.label, f.value);
    else if (b.kind === "beliefs") for (const x of b.beliefs) parts.push(x.topic, x.stance, x.detail);
    else if (b.kind === "spots") for (const s of b.spots) { parts.push(s.title); for (const p of s.people) parts.push(p.note); }
    else if (b.kind === "members") for (const m of b.members) parts.push(m.role);
    else if (b.kind === "text") parts.push(b.title, b.text);
  }
  return parts.filter(Boolean).join(" ");
}

/** A compact text form of a profile for the AI connection (GM reads): one line per block. */
export function orgProfileText(org: Org | undefined | null, title: (entryId: string) => string): string | undefined {
  if (!org) return undefined;
  const who = (id: string) => title(id) || "(missing page)", tag = (gm?: boolean) => (gm ? " [GM only]" : "");
  const lines: string[] = [];
  const head = [org.type, org.motto ? `“${org.motto}”` : ""].filter(Boolean).join(" · ");
  if (head) lines.push(head);
  lines.push(`Profile tab: ${org.visibility === "players" ? "players can see it" : "GM only"}`);
  for (const b of org.blocks) {
    const name = `${b.title || blockKindInfo[b.kind].name}${tag(b.gm)}`;
    if (b.kind === "spots") lines.push(`${name}: ${b.spots.map(s => `${s.title}${tag(s.gm)} = ${s.people.map(p => `${who(p.entryId)}${p.standing ? ` (${p.standing})` : ""}${p.note ? ` – ${p.note}` : ""}${tag(p.gm)}`).join(", ") || "empty"}`).join("; ") || "empty"}`);
    else if (b.kind === "members") lines.push(`${name}: ${b.members.map(m => `${who(m.entryId)}${m.role ? `, ${m.role}` : ""}${m.standing ? ` (${m.standing})` : ""}${tag(m.gm)}`).join("; ") || "none"}`);
    else if (b.kind === "facts") lines.push(`${name}: ${b.facts.filter(f => f.value || f.entryId).map(f => `${f.label}: ${f.value || (f.entryId ? who(f.entryId) : "")}${tag(f.gm)}`).join("; ") || "empty"}`);
    else if (b.kind === "beliefs") lines.push(`${name}: ${b.beliefs.map(x => `${x.topic}: ${x.stance}${x.detail ? ` – ${x.detail}` : ""}${tag(x.gm)}`).join("; ") || "none"}`);
    else if (b.kind === "holdings") lines.push(`${name}: ${b.holdings.map(h => `${who(h.entryId)}${tag(h.gm)}`).join(", ") || "none"}`);
    else if (b.kind === "text" && b.text.trim()) lines.push(`${name}: ${b.text.trim()}`);
  }
  if (!org.bar.hidden) lines.push(`${org.bar.title || "Right now"}: ${org.bar.fields.filter(f => f.value).map(f => `${f.label}: ${f.value}${tag(f.gm)}`).join("; ") || "empty"}`);
  const out = lines.join("\n");
  return out.length > 4000 ? out.slice(0, 3990) + "…" : out;
}

/* ---- Players ---- */

export type PlayerLink = { id: string; title: string };
export type PlayerSubgroup = { id: string; title: string; members: PlayerLink[] };
/** What the server knows about the page's neighbours, for the blocks that aren't stored in the profile. */
export type PlayerOrgContext = { title?: (entryId: string) => string; subgroups?: PlayerSubgroup[]; linked?: PlayerLink[] };
type PersonOut = { id: string; entryId: string; title: string; note: string; standing?: Standing };
export type PlayerOrgBlock = { id: string; kind: BlockKind; title: string; column: "left" | "right"; full: boolean } & (
  { kind: "spots"; spots: { id: string; title: string; people: PersonOut[] }[] } | { kind: "members"; members: (PersonOut & { role: string })[] }
  | { kind: "facts"; facts: { id: string; label: string; value: string; entryId?: string }[] } | { kind: "beliefs"; beliefs: { id: string; topic: string; stance: string; detail: string }[] }
  | { kind: "holdings"; holdings: { id: string; entryId: string; title: string }[] } | { kind: "text"; text: string }
  | { kind: "subgroups"; subgroups: PlayerSubgroup[] } | { kind: "linked"; linked: PlayerLink[] }
);
export type PlayerOrg = {
  type: string; motto: string; emblem: OrgEmblem; banner?: { imageId: string };
  blocks: PlayerOrgBlock[]; bar?: { title: string; fields: { id: string; label: string; value: string }[] };
};

/**
 * The profile as players may read it: an explicit allowlist built field by field, never the GM object. Anything GM-only
 * (blocks, spots, people, members, facts, beliefs, holdings, bar fields) is left out. People, members and holdings whose
 * page players can't read are left out; a fact keeps its words but loses a link to an unreadable page. Text has GM secrets
 * stripped through `clean` (playerText).
 */
export function playerOrg(org: Org, readable: (entryId: string) => boolean, clean: (text: string) => string, context: PlayerOrgContext = {}): PlayerOrg {
  const name = context.title ?? (() => "");
  const person = (p: { id: string; entryId: string; note?: string; standing?: Standing }): PersonOut => ({ id: p.id, entryId: p.entryId, title: name(p.entryId), note: clean(p.note ?? ""), ...(p.standing ? { standing: p.standing } : {}) });
  const blocks: PlayerOrgBlock[] = [];
  for (const b of org.blocks) {
    if (b.gm) continue;
    const head = { id: b.id, title: clean(b.title), column: b.column, full: !!b.full };
    if (b.kind === "spots") blocks.push({ ...head, kind: "spots", spots: b.spots.filter(s => !s.gm).map(s => ({ id: s.id, title: clean(s.title), people: s.people.filter(p => !p.gm && readable(p.entryId)).map(person) })) });
    else if (b.kind === "members") blocks.push({ ...head, kind: "members", members: b.members.filter(m => !m.gm && readable(m.entryId)).map(m => ({ ...person(m), role: clean(m.role ?? "") })) });
    else if (b.kind === "facts") blocks.push({ ...head, kind: "facts", facts: b.facts.filter(f => !f.gm).map(f => ({ id: f.id, label: clean(f.label), value: clean(f.value), ...(f.entryId && readable(f.entryId) ? { entryId: f.entryId } : {}) })).filter(f => f.label && (f.value || f.entryId)) });
    else if (b.kind === "beliefs") blocks.push({ ...head, kind: "beliefs", beliefs: b.beliefs.filter(x => !x.gm).map(x => ({ id: x.id, topic: clean(x.topic), stance: clean(x.stance), detail: clean(x.detail) })) });
    else if (b.kind === "holdings") blocks.push({ ...head, kind: "holdings", holdings: b.holdings.filter(h => !h.gm && readable(h.entryId)).map(h => ({ id: h.id, entryId: h.entryId, title: name(h.entryId) })) });
    else if (b.kind === "text") { const t = clean(b.text); if (t) blocks.push({ ...head, kind: "text", text: t }); }
    else if (b.kind === "subgroups") blocks.push({ ...head, kind: "subgroups", subgroups: (context.subgroups ?? []).filter(g => readable(g.id)).map(g => ({ id: g.id, title: g.title, members: g.members.filter(m => readable(m.id)) })) });
    else blocks.push({ ...head, kind: "linked", linked: (context.linked ?? []).filter(l => readable(l.id)) });
  }
  const fields = org.bar.hidden ? [] : org.bar.fields.filter(f => !f.gm).map(f => ({ id: f.id, label: clean(f.label), value: clean(f.value) })).filter(f => f.label && f.value);
  return {
    type: clean(org.type ?? ""), motto: clean(org.motto ?? ""),
    emblem: { shape: org.emblem.shape, ...(org.emblem.symbol ? { symbol: org.emblem.symbol } : {}), ...(org.emblem.imageId ? { imageId: org.emblem.imageId } : {}), ...(org.emblem.colour ? { colour: org.emblem.colour } : {}), ...(org.emblem.mapColour ? { mapColour: org.emblem.mapColour } : {}) },
    ...(org.banner ? { banner: { imageId: org.banner.imageId } } : {}),
    blocks, ...(org.bar.hidden ? {} : { bar: { title: clean(org.bar.title), fields } }),
  };
}
