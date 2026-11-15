import { defaultCharacter, type Entry, type Workspace } from "./world-model.ts";
import { defaultOrg } from "./org-profile.ts";
import { tieFits, tieGroups, tieTypeById, type Tie, type TieGroup, type TieType } from "./ties.ts";
import { canHoldTie, putTie } from "./tie-edit.ts";
import { seeded } from "./world-generator.ts";
import type { FamilyLink } from "./family-tree.ts";

/*
 * Built-in generators: a family around a character (or a new one), and a set of ties among pages the GM picks. Names,
 * twists and notes come from our own lists, the same seed always gives the same result, and nothing is saved until the
 * GM adds it: generating gives a preview (people, ties, suggestions) and `addFamily` / `addSuggestions` save it.
 */

export type Rng = () => number;
const pick = <T,>(rng: Rng, list: readonly T[]): T => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
const between = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const chance = (rng: Rng, p: number) => rng() < p;

// Names: given names, and family names made of a start and an end, in a few styles.
export const nameStyles = ["harbour", "highborn", "northern", "southern"] as const;
export type NameStyle = typeof nameStyles[number];
export const nameStyleNames: Record<NameStyle, string> = { harbour: "Harbour town", highborn: "Highborn", northern: "Northern hills", southern: "Southern cities" };
const names: Record<NameStyle, { given: string[]; start: string[]; end: string[] }> = {
  harbour: {
    given: ["Ada", "Bram", "Corra", "Dell", "Ebbe", "Fenn", "Gull", "Hesk", "Ivo", "Jory", "Kit", "Lark", "Merrow", "Nell", "Osk", "Pell", "Quill", "Rook", "Sable", "Tam", "Ulla", "Vane", "Wren", "Yanni", "Zeb", "Moss", "Tansy", "Brine", "Hollis", "Cade", "Mira", "Oren"],
    start: ["Tal", "Salt", "Gull", "Brack", "Drift", "Kel", "Marr", "Sound", "Wick", "Heron", "Cray", "Dun", "Lugg", "Tarr"],
    end: ["water", "wick", "ey", "low", "by", "sett", "ings", "mere", "hull", "ford", "ow", "en"],
  },
  highborn: {
    given: ["Aldric", "Belisande", "Corwin", "Damaris", "Edda", "Florian", "Gisella", "Hadrian", "Isolde", "Jessamy", "Leopold", "Maelis", "Ottoline", "Percival", "Rhosyn", "Seraphine", "Tiberius", "Ursuline", "Valerian", "Wilhelmine", "Ysolde", "Amaury", "Clemence", "Lucan", "Odalys", "Theodric"],
    start: ["Var", "Ash", "Mont", "Haver", "Cal", "Dela", "Ros", "Vaun", "Grey", "Lis", "Ormond", "Stav", "Aubr", "Penn"],
    end: ["row", "court", "ville", "ingham", "mere", "ford", "ley", "crest", "mont", "aine", "ister", "holt"],
  },
  northern: {
    given: ["Arn", "Bera", "Dagny", "Eirik", "Frida", "Geir", "Hild", "Ingvar", "Jorun", "Ketil", "Liv", "Magnhild", "Njal", "Orm", "Ragna", "Sigrun", "Torvald", "Ulf", "Vigdis", "Yrsa", "Halla", "Brand", "Asta", "Gunnar", "Sten", "Tove"],
    start: ["Stor", "Hvit", "Fjell", "Brann", "Grim", "Kald", "Elg", "Ravn", "Isen", "Mos", "Skog", "Ulv"],
    end: ["dal", "berg", "vik", "stad", "holm", "lund", "by", "ness", "fell", "rud", "mark", "sund"],
  },
  southern: {
    given: ["Amaro", "Benedetta", "Cosimo", "Dalia", "Emre", "Fiora", "Gael", "Hadia", "Ilario", "Jasmin", "Kasim", "Lucia", "Marek", "Nadira", "Orsino", "Paloma", "Rafi", "Salome", "Tariq", "Valeria", "Zahir", "Alba", "Dario", "Ines", "Leon", "Soraya"],
    start: ["Del", "Mar", "Sol", "Cas", "Ver", "Alt", "Bel", "Cor", "Ros", "Tor", "Sar", "Lun"],
    end: ["ano", "essi", "ara", "ino", "ena", "eto", "aris", "ova", "ani", "edo", "ita", "uzzi"],
  },
};
export function givenName(rng: Rng, style: NameStyle, not: ReadonlySet<string> = new Set()) {
  const list = names[style].given.filter(n => !not.has(n));
  return pick(rng, list.length ? list : names[style].given);
}
export function familyName(rng: Rng, style: NameStyle) {
  const n = names[style], s = pick(rng, n.start), e = pick(rng, n.end);
  const joined = s.toLowerCase().endsWith(e[0]) ? s + e.slice(1) : s + e;
  return joined.charAt(0).toUpperCase() + joined.slice(1).toLowerCase();
}

// Generating a family.
export const familySizes = ["few", "some", "many"] as const;
export type FamilySize = typeof familySizes[number];
export const twistLevels = ["quiet", "some", "scandalous"] as const;
export type TwistLevel = typeof twistLevels[number];
export type FamilyOptions = {
  seed: string;
  /** 0: none, 1: parents (and the person's siblings), 2: grandparents too. */
  above: 0 | 1 | 2;
  /** A partner and children for the person. */
  below: boolean;
  children: FamilySize;
  twists: TwistLevel;
  names: NameStyle;
  /** Whether people who marry in take the family name. */
  takeName: boolean;
  /** Also make an organization page for the family, with everyone born to it as members. */
  house: boolean;
};
export const defaultFamilyOptions = (seed = "A family"): FamilyOptions => ({ seed, above: 1, below: true, children: "some", twists: "some", names: "harbour", takeName: false, house: false });

/** A person in a generated family: a new character, or the page it started from (`existingId`). */
export type GenPerson = { key: string; name: string; existingId?: string; dead?: boolean; born?: boolean; note?: string };
export type GenTie = { key: string; from: string; to: string; typeId: string; gm?: boolean; cover?: { typeId: string; reversed?: boolean }; note?: string };
export type GeneratedFamily = { surname: string; people: GenPerson[]; ties: GenTie[]; house?: string };

const kidCount: Record<FamilySize, [number, number]> = { few: [1, 2], some: [2, 3], many: [3, 5] };
const twistCount: Record<TwistLevel, [number, number]> = { quiet: [0, 0], some: [1, 1], scandalous: [2, 3] };

/** A family around `start` (an existing character) or around a new one. The same options always give the same family. */
export function generateFamily(o: FamilyOptions, start?: { id: string; title: string }): GeneratedFamily {
  const rng = seeded(`${o.seed}|${o.above}|${o.below}|${o.children}|${o.twists}|${o.names}|${o.takeName}`);
  const used = new Set<string>(), people: GenPerson[] = [], ties: GenTie[] = [];
  const words = start?.title.trim().split(/\s+/) ?? [];
  const surname = words.length > 1 ? words[words.length - 1] : familyName(rng, o.names);
  const person = (name: string, extra: Partial<GenPerson> = {}) => { const p: GenPerson = { key: `p${people.length}`, name, ...extra }; people.push(p); used.add(name.split(" ")[0]); return p.key; };
  const born = (extra: Partial<GenPerson> = {}) => person(`${givenName(rng, o.names, used)} ${surname}`, { born: true, ...extra });
  const married = (extra: Partial<GenPerson> = {}) => { const own = familyName(rng, o.names), g = givenName(rng, o.names, used); return person(o.takeName ? `${g} ${surname}` : `${g} ${own}`, { ...(o.takeName ? { note: `Born a ${own}` } : {}), ...extra }); };
  const tie = (from: string, to: string, typeId: string, extra: Partial<GenTie> = {}) => { ties.push({ key: `t${ties.length}`, from, to, typeId, ...extra }); };
  const children = (a: string, b: string | null, n: number, extra: (i: number) => Partial<GenPerson> = () => ({})) => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) { const k = born(extra(i)); tie(a, k, "parent"); if (b) tie(b, k, "parent"); out.push(k); }
    return out;
  };
  const me = start ? person(start.title, { existingId: start.id, born: true }) : born();
  const [lo, hi] = kidCount[o.children];
  let mother: string | null = null, father: string | null = null, siblings: string[] = [];
  if (o.above >= 1) {
    // The parent born to the family, and the one who married in.
    father = born(); mother = married();
    tie(father, mother, "partner");
    tie(father, me, "parent"); tie(mother, me, "parent");
    siblings = children(father, mother, Math.max(0, between(rng, lo, hi) - 1));
  }
  if (o.above >= 2 && father && mother) {
    const gf = born({ dead: chance(rng, 0.7) }), gm = married({ dead: chance(rng, 0.6) });
    tie(gf, gm, "partner"); tie(gf, father, "parent"); tie(gm, father, "parent");
    // The other side: the married-in parent's own parents, under their own name.
    const own = people.find(p => p.key === mother)!.name.split(" ").slice(1).join(" ");
    if (!o.takeName) {
      const a = person(`${givenName(rng, o.names, used)} ${own}`, { dead: chance(rng, 0.6) }), b = person(`${givenName(rng, o.names, used)} ${familyName(rng, o.names)}`, { dead: chance(rng, 0.6) });
      tie(a, b, "partner"); tie(a, mother, "parent"); tie(b, mother, "parent");
    }
    if (chance(rng, 0.6)) { const aunt = born(); tie(gf, aunt, "parent"); tie(gm, aunt, "parent"); }
  }
  let kids: string[] = [], partner: string | null = null;
  if (o.below) {
    partner = married(); tie(me, partner, "partner");
    kids = children(me, partner, between(rng, lo, hi));
  }
  // Twists, GM only unless they are open feuds.
  const twists = between(rng, ...twistCount[o.twists]);
  const pool = ["secret child", "rivals", "old flame", "estranged", "wronged"];
  for (let i = 0; i < twists && pool.length; i++) {
    const t = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    const parents = [me, father, partner].filter((x): x is string => !!x);
    const brood = [...siblings, me, ...kids].filter((x, j, a) => a.indexOf(x) === j);
    if (t === "secret child" && parents.length) {
      const p = pick(rng, parents), k = born({});
      tie(p, k, "parent", { gm: true, cover: { typeId: "ward" }, note: pick(rng, ["Raised in the house as a ward. The truth was never told.", "Born before the marriage, and passed off as a cousin's orphan.", "The child of an affair, taken in to keep the peace."]) });
    } else if (t === "rivals" && brood.length >= 2) {
      const a = pick(rng, brood), b = pick(rng, brood.filter(x => x !== a));
      tie(a, b, "rival", { note: pick(rng, ["Both want to inherit, and both know it.", "Their quarrel over a marriage never healed.", "Each blames the other for a death in the family."]) });
    } else if (t === "old flame" && parents.length) {
      const p = pick(rng, parents), flame = person(`${givenName(rng, o.names, used)} ${familyName(rng, o.names)}`);
      tie(p, flame, "former", { gm: true, note: pick(rng, ["They still write to each other.", "The family doesn't know they ever met.", "It ended badly, and in public."]) });
    } else if (t === "estranged" && brood.length) {
      const k = pick(rng, brood.filter(x => x !== me).length ? brood.filter(x => x !== me) : brood);
      const pk = people.find(x => x.key === k)!; pk.note = [pk.note, "Estranged: hasn't been home in years"].filter(Boolean).join(". ");
    } else if (t === "wronged" && brood.length >= 2) {
      const a = pick(rng, brood), b = pick(rng, brood.filter(x => x !== a));
      tie(a, b, "wronged", { gm: true, cover: { typeId: "sibling" }, note: pick(rng, ["Forged a letter that cost the other an inheritance.", "Sold the other's secret to a rival house.", "Let the other take the blame for a theft."]) });
    }
  }
  const highborn = o.names === "highborn";
  return { surname, people, ties, ...(o.house ? { house: highborn ? `House ${surname}` : `The ${surname} family` } : {}) };
}

/** A generated family's ties, as family-tree links, to draw a preview with the same layout as the tree. */
export function generatedLinks(f: GeneratedFamily, types: TieType[]): FamilyLink[] {
  return f.ties.flatMap((t, index): FamilyLink[] => {
    const type = tieTypeById(types, t.typeId);
    return type.tree ? [{ key: t.key, role: type.tree, fromId: t.from, toId: t.to, gm: !!t.gm, name: type.name, reverse: type.reverse ?? type.name, index }] : [];
  });
}

/**
 * Saves a generated family: new characters (where `start` is: its campaign or the shared lore), their ties, and a family
 * organization when asked. Returns the new workspace and the id given to each person, or why it can't be saved.
 */
export function addFamily(s: Workspace, f: GeneratedFamily, where: { worldId: string; campaignId: string | null }, types: TieType[], now: string, newId: () => string): { s: Workspace; ids: Map<string, string>; houseId?: string } | { error: string } {
  const ids = new Map<string, string>(), entries: Entry[] = [];
  for (const p of f.people) {
    if (p.existingId) { if (!s.entries.some(e => e.id === p.existingId)) return { error: "The character it started from is gone." }; ids.set(p.key, p.existingId); continue; }
    const id = newId(); ids.set(p.key, id);
    entries.push({ id, worldId: where.worldId, campaignId: where.campaignId, parentId: null, title: p.name.slice(0, 160), kind: "character", body: p.note ? (/[.!?…]$/.test(p.note) ? p.note : `${p.note}.`) : "", overviewVisibility: "gm", tabs: [], character: { ...defaultCharacter(), ...(p.dead ? { status: "deceased" as const } : {}) }, updatedAt: now });
  }
  let next: Workspace = { ...s, entries: [...s.entries, ...entries] };
  let houseId: string | undefined;
  if (f.house) {
    houseId = newId();
    const org = defaultOrg(s.worlds.find(w => w.id === where.worldId));
    org.type = "Family";
    org.blocks = org.blocks.map(b => b.kind === "members" ? { ...b, members: f.people.filter(p => p.born).slice(0, 40).map(p => ({ id: newId(), entryId: ids.get(p.key)! })) } : b);
    next = { ...next, entries: [...next.entries, { id: houseId, worldId: where.worldId, campaignId: where.campaignId, parentId: null, title: f.house.slice(0, 160), kind: "faction", body: "", overviewVisibility: "gm", tabs: [], org, updatedAt: now }] };
  }
  for (const t of f.ties) {
    const type = tieTypeById(types, t.typeId);
    let owner = next.entries.find(e => e.id === ids.get(t.from)), to = next.entries.find(e => e.id === ids.get(t.to));
    if (!owner || !to) continue;
    if (type.both && !canHoldTie(owner, to)) [owner, to] = [to, owner];
    if (!canHoldTie(owner, to) || !tieFits(type, owner.kind, to.kind)) continue;
    const tie: Tie = { id: newId(), toId: to.id, typeId: type.id, ...(t.note ? { note: t.note } : {}), ...(t.gm ? { gm: true } : {}), ...(t.gm && t.cover ? { cover: { typeId: t.cover.typeId, ...(t.cover.reversed ? { reversed: true } : {}) } } : {}) };
    const put = putTie(next, owner.id, tie, now);
    if (!put) return { error: `${owner.title} already holds as many ties as a page can.` };
    next = put;
  }
  return { s: next, ids, ...(houseId ? { houseId } : {}) };
}

// Suggesting ties among pages.
export const tieAmounts = ["off", "few", "some", "lots"] as const;
export type TieAmount = typeof tieAmounts[number];
export const tieAmountNames: Record<TieAmount, string> = { off: "Off", few: "Few", some: "Some", lots: "Lots" };
export const defaultTieAmounts = (): Record<TieGroup, TieAmount> => ({ family: "off", heart: "few", conflict: "some", allegiance: "few", guidance: "few", dealings: "some", belonging: "few", other: "off" });
const perPage: Record<TieAmount, number> = { off: 0, few: 0.25, some: 0.5, lots: 1 };
const gmChance: Record<TieGroup, number> = { family: 0.15, heart: 0.35, conflict: 0.45, allegiance: 0.2, guidance: 0.15, dealings: 0.4, belonging: 0.15, other: 0.1 };

export type Suggestion = { key: string; fromId: string; toId: string; typeId: string; gm: boolean; note: string; keep?: boolean };

const notes: Record<string, string[]> = {
  parent: ["{a} raised {b} alone after the fever years.", "{b} has {a}'s eyes and none of their patience."],
  partner: ["{a} and {b} married to end a feud between their families.", "{a} and {b} married young and in secret."],
  sibling: ["{a} and {b} grew up sharing one coat between them.", "{a} covers for {b}, and always has."],
  ward: ["{a} took {b} in after a shipwreck.", "{a} keeps {b} close, for reasons of their own."],
  lover: ["{a} writes to {b} every week and never sends the letters.", "{a} would give up everything for {b}, and has said so."],
  betrothed: ["{a} and {b} are promised to each other by their families.", "{a} and {b} will marry at midsummer, if nothing goes wrong."],
  former: ["{a} and {b} parted on a dock and never spoke of it again.", "{a} still keeps a token from {b}."],
  rival: ["{a} and {b} want the same thing, and only one can have it.", "{a} has beaten {b} once, and {b} hasn't forgotten."],
  enemy: ["{a} has sworn to see {b} ruined.", "{a} blames {b} for a death that was never avenged."],
  wronged: ["{a} burned something {b} loved, years ago.", "{a} sold out {b} to save themselves."],
  rules: ["{a} rules {b} with a light hand and a long memory.", "{a} took {b} by force, and holds it by habit."],
  serves: ["{a} serves {b}, and knows more than they let on.", "{a} swore an oath to {b} that they now regret."],
  ally: ["{a} and {b} stand together against a common enemy.", "{a} and {b} are allies for now, and both are counting the days."],
  mentor: ["{a} taught {b} everything, except the one thing that matters.", "{a} sees in {b} the student they used to be."],
  patron: ["{a} pays for {b}'s work and expects to be thanked.", "{a} found {b} in the gutter and made them someone."],
  debt: ["{a} owes {b} a sum that keeps growing.", "{a} owes {b} a life, and {b} intends to collect."],
  employs: ["{a} pays {b} well and asks no questions.", "{a} employs {b} for work that never goes in the ledger."],
  blackmail: ["{a} has letters that would ruin {b}.", "{a} knows what {b} did on the night of the fire."],
  trade: ["{a} and {b} trade every season, and both cheat a little.", "{a} and {b} trade goods that never pass through customs."],
  owns: ["{a} holds the deed to {b}.", "{a} won {b} in a wager."],
  carries: ["{a} never lets {b} out of sight.", "{a} carries {b} to remember someone."],
  based: ["{a} works out of {b}.", "{a} keeps rooms at {b} and pays in favours."],
  made: ["{a} made {b} to settle a debt that was never paid.", "{a} made {b}, and regrets it."],
  knows: ["{a} and {b} have met, and neither will say where.", "{a} knows {b} by reputation, which is worse."],
  linked: ["{a} and {b} turn up together more often than chance allows.", "Something ties {a} to {b}, and nobody can say what."],
};
const groupNotes: Record<TieGroup, string[]> = {
  family: ["{a} and {b} are bound by blood or by oath."], heart: ["{a} and {b} share a history that still stings."],
  conflict: ["{a} and {b} have a grudge older than either will admit."], allegiance: ["{a} and {b} are bound by loyalty, for now."],
  guidance: ["{a} has shaped who {b} became."], dealings: ["{a} and {b} have business that nobody writes down."],
  belonging: ["{a} and {b} belong together, one way or another."], other: ["{a} and {b} are connected."],
};
const fill = (t: string, a: string, b: string) => t.replace(/\{a\}/g, a).replace(/\{b\}/g, b);
export function tieNote(rng: Rng, type: TieType, a: string, b: string) { return fill(pick(rng, notes[type.id] ?? groupNotes[type.group]), a, b); }

/**
 * Suggested ties among pages: about as many per group as the amount asks for (more pages, more ties), each a kind that
 * fits the two pages, between pairs not already tied, with a note. Suggestions marked `keep` stay, and new ones fill in
 * around them. GM-only is more likely for secrets and grudges. Nobody gets two marriages or betrothals, nor one when
 * they are in `spoken` (already married or promised).
 */
export function suggestTies(pages: Entry[], types: TieType[], amounts: Record<TieGroup, TieAmount>, seed: string, opts: { tied?: ReadonlySet<string>; keep?: Suggestion[]; spoken?: ReadonlySet<string> } = {}): Suggestion[] {
  const rng = seeded(`${seed}|${pages.map(p => p.id).join(",")}`);
  const keep = opts.keep ?? [], pair = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;
  const taken = new Set([...(opts.tied ?? []), ...keep.map(k => pair(k.fromId, k.toId))]);
  const out: Suggestion[] = [...keep];
  if (pages.length < 2) return out;
  // Someone married or promised (`spoken`, or by a suggestion) isn't offered another marriage or betrothal.
  const one = (t: TieType) => t.tree === "partner" || t.id === "betrothed";
  const spoken = new Set(opts.spoken ?? []);
  for (const k of keep) if (one(tieTypeById(types, k.typeId))) { spoken.add(k.fromId); spoken.add(k.toId); }
  for (const g of tieGroups) {
    const want = Math.round(perPage[amounts[g]] * pages.length) - keep.filter(k => tieTypeById(types, k.typeId).group === g).length;
    const kinds = types.filter(t => t.group === g);
    for (let made = 0, tries = 0; made < want && tries < want * 30 + 30; tries++) {
      const a = pick(rng, pages), b = pick(rng, pages);
      if (a.id === b.id || taken.has(pair(a.id, b.id))) continue;
      const fits = kinds.filter(t => tieFits(t, a.kind, b.kind) && canHoldTie(a, b) && !(one(t) && (spoken.has(a.id) || spoken.has(b.id))));
      if (!fits.length) continue;
      const type = pick(rng, fits);
      taken.add(pair(a.id, b.id));
      if (one(type)) { spoken.add(a.id); spoken.add(b.id); }
      out.push({ key: `s:${seed}:${out.length}`, fromId: a.id, toId: b.id, typeId: type.id, gm: chance(rng, gmChance[g]), note: tieNote(rng, type, a.title, b.title) });
      made++;
    }
  }
  return out;
}

/** Saves suggestions as ties on the pages they start from. Returns the new workspace and how many were added. */
export function addSuggestions(s: Workspace, list: Suggestion[], types: TieType[], now: string, newId: () => string): { s: Workspace; added: number } {
  let next = s, added = 0;
  for (const x of list) {
    const type = tieTypeById(types, x.typeId), from = next.entries.find(e => e.id === x.fromId), to = next.entries.find(e => e.id === x.toId);
    if (!from || !to || !tieFits(type, from.kind, to.kind) || !canHoldTie(from, to)) continue;
    const put = putTie(next, from.id, { id: newId(), toId: to.id, typeId: type.id, ...(x.note.trim() ? { note: x.note.trim().slice(0, 300) } : {}), ...(x.gm ? { gm: true } : {}) }, now);
    if (put) { next = put; added++; }
  }
  return { s: next, added };
}
