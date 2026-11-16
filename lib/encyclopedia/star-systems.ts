import { z } from "zod";
import { galaxyRandom, type Drive } from "./galaxies.ts";
import { backdrops, starClasses, type StarClass } from "./sectors.ts";

/**
 * Star system pages: a star (with up to two companions), its worlds and their moons, belts, and story hooks.
 * The science follows real rules of thumb unless the system is set to Pulp:
 * - the habitable (green) zone runs from 0.95 to 1.37 × √L AU, the frost line is at 2.7 × √L and "dark" past 27 × √L;
 * - a world's temperature is 278 × L^¼ / √AU − 273 °C, plus a greenhouse term for its air;
 * - a year is √(AU³ / M) Earth years.
 * L, M and R are the star's luminosity, mass and radius in Suns. Worlds are generated, then the GM edits any of them.
 * Kept free of other modules except the sector and galaxy basics: the workspace schema imports it.
 */
export const starPhysics: Record<StarClass, { L: number; M: number; R: number; heat: string; temp: string; life: string; note: string }> = {
  O: { L: 50000, M: 40, R: 10, heat: "Extremely hot", temp: "30,000 K and up", life: "A few million years", note: "Huge and short-lived. Fierce radiation scours the inner worlds, and the star dies before complex life can start." },
  B: { L: 800, M: 6, R: 5, heat: "Very hot", temp: "10,000 to 30,000 K", life: "10 to 300 million years", note: "Bright and young. The habitable zone sits far out, and strong ultraviolet light strips thin air." },
  A: { L: 20, M: 2, R: 1.8, heat: "Hot", temp: "7,500 to 10,000 K", life: "About 1 billion years", note: "Brilliant white stars. Temperate worlds orbit well beyond where Earth would be." },
  F: { L: 3, M: 1.3, R: 1.3, heat: "Warm", temp: "6,000 to 7,500 K", life: "2 to 4 billion years", note: "A little hotter than the Sun. Time enough for life, with a wide temperate zone." },
  G: { L: 1, M: 1, R: 1, heat: "Moderate", temp: "5,200 to 6,000 K", life: "About 10 billion years", note: "Sun-like and steady. The most familiar home for Earth-like worlds." },
  K: { L: 0.3, M: 0.7, R: 0.8, heat: "Cool", temp: "3,700 to 5,200 K", life: "15 to 45 billion years", note: "Calm and very long-lived. Habitable worlds orbit closer in, with plenty of time to evolve." },
  M: { L: 0.03, M: 0.3, R: 0.4, heat: "Very cool", temp: "2,400 to 3,700 K", life: "Trillions of years", note: "Small, dim and common. Habitable worlds hug the star, often with one side always facing it, under frequent flares." },
};

export const worldKinds = ["rocky", "water", "ice", "desert", "magma", "jungle", "toxic", "gas", "ice-giant"] as const;
export type WorldKind = typeof worldKinds[number];
export const worldKindNames: Record<WorldKind, string> = { rocky: "Rocky", water: "Water", ice: "Ice", desert: "Desert", magma: "Magma", jungle: "Jungle", toxic: "Toxic", gas: "Gas giant", "ice-giant": "Ice giant" };
export const worldTypes: Record<WorldKind, string[]> = { rocky: ["Barren", "Scarred", "Cratered", "Mesa"], water: ["Ocean", "Reef", "Archipelago"], ice: ["Glacial", "Frost-crust", "Tundra"], desert: ["Dune", "Salt flat", "Canyon"], magma: ["Lava", "Volcanic", "Molten"], jungle: ["Rainforest", "Fungal", "Swamp"], toxic: ["Acid", "Smog", "Sulfur"], gas: ["Banded", "Storm", "Pale"], "ice-giant": ["Azure", "Cyan"] };
export const isGiant = (k: WorldKind) => k === "gas" || k === "ice-giant";
export const sizes = ["tiny", "small", "medium", "large", "massive"] as const;
export const airs = ["none", "thin", "standard", "dense", "crushing", "toxic"] as const;
export const waters = ["none", "trace", "some", "abundant", "ocean", "under-ice"] as const;
export const resourceLevels = ["scarce", "poor", "moderate", "rich", "abundant"] as const;
export const lifeLevels = ["none", "microbial", "simple", "complex", "sapient"] as const;
export const settlements = ["nobody", "outpost", "colony", "homeworld"] as const;
export const hazards = ["None", "Radiation", "Flares", "Seismic", "Storms", "Toxic air", "Extreme cold", "Extreme heat", "Tidal quakes"];
export const amounts = ["auto", "none", "some", "many"] as const;
export const eras = ["untouched", "frontier", "settled", "fallen"] as const;
export const words: Record<string, string> = {
  tiny: "Tiny", small: "Small", medium: "Medium", large: "Large", massive: "Massive",
  none: "None", thin: "Thin", standard: "Standard", dense: "Dense", crushing: "Crushing", toxic: "Toxic",
  trace: "Trace", some: "Some", abundant: "Abundant", ocean: "Ocean", "under-ice": "Under ice",
  scarce: "Scarce", poor: "Poor", moderate: "Moderate", rich: "Rich",
  microbial: "Microbial", simple: "Simple", complex: "Complex", sapient: "Sapient",
  nobody: "Nobody", outpost: "Outpost", colony: "Colony", homeworld: "Homeworld",
  auto: "Auto", many: "Many", untouched: "Untouched", frontier: "Frontier", settled: "Settled", fallen: "Fallen",
};
export const word = (k: string) => words[k] ?? k;

const sid = z.string().regex(/^[A-Za-z0-9_-]{1,60}$/);
const id = z.string().min(1).max(120);
const bodyFields = {
  id: sid,
  name: z.string().trim().min(1).max(80),
  /** Distance from the star in AU. A moon has its planet's. */
  au: z.number().finite().min(0.005).max(100000),
  kind: z.enum(worldKinds),
  type: z.string().trim().max(40),
  size: z.enum(sizes),
  gravity: z.number().finite().min(0).max(50),
  /** Surface (or cloud-top) temperature in °C. */
  temp: z.number().int().min(-273).max(10000),
  air: z.enum(airs), water: z.enum(waters), resources: z.enum(resourceLevels),
  hazard: z.string().trim().max(40),
  life: z.enum(lifeLevels), settled: z.enum(settlements),
  day: z.string().trim().max(60),
  rings: z.boolean().optional(),
  /** Points of interest: Ruin, Derelict and the like. */
  poi: z.array(z.string().trim().min(1).max(40)).max(6),
  /** An organization page that holds it. */
  holderId: id.optional(),
  /** The GM's notes on it (its journal until it has its own page). */
  note: z.string().max(4000),
  /** Kept when the survey runs again. */
  locked: z.boolean().optional(),
  /** Fields the GM changed, shown as edited. */
  edited: z.array(z.string().max(20)).max(20).optional(),
  /** Real data (Sol). */
  real: z.boolean().optional(),
  /** Where it starts on its orbit in the animation, in radians. */
  phase: z.number().finite().min(0).max(7),
  /** Its own world page, once charted. */
  pageId: id.optional(),
};
export const moonSchema = z.object(bodyFields);
export type Moon = z.infer<typeof moonSchema>;
export const bodySchema = z.object({ ...bodyFields, moons: z.array(moonSchema).max(12) });
export type SystemBody = z.infer<typeof bodySchema>;
export type World = Moon | SystemBody;

export const surveyOptionsSchema = z.object({
  count: z.number().int().min(1).max(12),
  belts: z.enum(amounts), habitable: z.enum(amounts), giants: z.enum(amounts),
  moons: z.enum(["none", "few", "normal", "many"]),
  rings: z.boolean(), naming: z.enum(["roman", "letters"]),
  poi: z.number().int().min(0).max(5),
  era: z.enum(eras),
  /** Pulp bends the rules for adventure: breathable air and jungles where real physics would say no. */
  science: z.enum(["realistic", "pulp"]),
  /** Organization pages with a foothold here. */
  holders: z.array(id).max(4),
});
export type SurveyOptions = z.infer<typeof surveyOptionsSchema>;
export const hookKinds = ["lure", "danger", "secret"] as const;
export const starSystemSchema = z.object({
  star: z.enum(starClasses),
  companions: z.array(z.object({ star: z.enum(starClasses), separation: z.enum(["close", "wide"]) })).max(2),
  /** Sol, from real data. */
  real: z.boolean().optional(),
  /** One line about what this system is for. */
  premise: z.string().trim().max(300),
  options: surveyOptionsSchema,
  backdrop: z.enum(backdrops),
  seed: z.string().trim().min(1).max(80),
  bodies: z.array(bodySchema).max(16),
  belts: z.array(z.object({ id: sid, name: z.string().trim().min(1).max(60), au: z.number().finite().min(0.005).max(100000) })).max(4),
  hooks: z.array(z.object({ id: sid, kind: z.enum(hookKinds), text: z.string().trim().max(400), locked: z.boolean().optional() })).max(6),
  /** The sector hex this system sits in. */
  sector: z.object({ pageId: id, systemId: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/) }).optional(),
}).superRefine((s, ctx) => {
  const all = s.bodies.flatMap(b => [b.id, ...b.moons.map(m => m.id)]);
  if (new Set(all).size !== all.length) ctx.addIssue({ code: "custom", message: "World ids must be unique in a system" });
  const pages = s.bodies.flatMap(b => [b.pageId, ...b.moons.map(m => m.pageId)]).filter(Boolean);
  if (new Set(pages).size !== pages.length) ctx.addIssue({ code: "custom", message: "A world page belongs to one world" });
});
export type StarSystem = z.infer<typeof starSystemSchema>;

export type Zones = { hzIn: number; hzOut: number; frost: number; dark: number; L: number };
/** The star's zones in AU. Companions in a close pair add their light. */
export function zones(s: Pick<StarSystem, "star" | "companions">): Zones {
  const L = starPhysics[s.star].L + s.companions.filter(c => c.separation === "close").reduce((t, c) => t + starPhysics[c.star].L, 0), r = Math.sqrt(L);
  return { hzIn: 0.95 * r, hzOut: 1.37 * r, frost: 2.7 * r, dark: 27 * r, L };
}
export type ZoneName = "Scorch" | "Green" | "Cold" | "Frost" | "Dark";
export const zoneOf = (au: number, z: Zones): ZoneName => au < z.hzIn ? "Scorch" : au <= z.hzOut ? "Green" : au < z.frost ? "Cold" : au < z.dark ? "Frost" : "Dark";
export const zoneNotes: Record<ZoneName, string> = { Scorch: "Too close: water boils away", Green: "Liquid water can last on the surface", Cold: "Past the green zone, before ice can hold", Frost: "Past the frost line: giants and ice worlds", Dark: "Faint sunlight, long years" };
const GREENHOUSE: Record<typeof airs[number], number> = { none: 0, thin: 8, standard: 33, dense: 80, crushing: 420, toxic: 70 };
/** Surface temperature in °C for a world this far out with this air. */
export const temperatureAt = (L: number, au: number, air: typeof airs[number]) => Math.round(278 * Math.pow(L, 0.25) / Math.sqrt(au) - 273 + GREENHOUSE[air]);
export const temperatureWord = (c: number) => c < -100 ? "Frozen" : c < -20 ? "Cold" : c < 35 ? "Temperate" : c < 80 ? "Warm" : c < 300 ? "Hot" : "Scorching";
/** A year at this distance, in words. */
export function yearLength(au: number, star: StarClass) {
  const y = Math.sqrt(au ** 3 / starPhysics[star].M);
  return y < 2 ? `${Math.round(y * 365)} days` : y < 100 ? `${y.toFixed(1)} years` : `${Math.round(y).toLocaleString("en-US")} years`;
}
/** How big the star looks from a world, against the Sun from Earth. */
export const starSizeFrom = (au: number, star: StarClass) => starPhysics[star].R / au;
export const formatAU = (a: number) => a < 0.1 ? a.toFixed(3) : a < 10 ? a.toFixed(2) : a < 100 ? a.toFixed(1) : Math.round(a).toLocaleString("en-US");
export function formatDuration(seconds: number) {
  const m = seconds / 60, h = m / 60, d = h / 24, y = d / 365.25;
  return m < 1 ? `${Math.max(1, Math.round(seconds))} s` : h < 1 ? `${Math.round(m)} min` : d < 2 ? `${h < 10 ? h.toFixed(1) : Math.round(h)} hours` : y < 1 ? `${d < 10 ? d.toFixed(1) : Math.round(d)} days` : `${y < 10 ? y.toFixed(1) : Math.round(y).toLocaleString("en-US")} years`;
}

// ---------------------------------------------------------------- travel
export { driveSchema, newDrive, ftlModes, ftlStarts, ftlModeNames, ftlStartNames, type Drive } from "./galaxies.ts";
const C = 2.998e8, AU = 1.496e11, G0 = 9.81;
export type InSystemDrive = "light" | "torch" | "transfer" | `ftl:${string}`;
/** Time between two orbits in a system. */
export function travelInSystem(a1: number, a2: number, how: InSystemDrive, star: StarClass, drives: Drive[] = []): { time: string; how: string } {
  const d = Math.abs(a2 - a1) * AU;
  if (how === "torch") return { time: formatDuration(2 * Math.sqrt(d / G0)), how: "accelerating at 1 g half way, braking half way" };
  if (how === "transfer") { const y = 0.5 * Math.pow((a1 + a2) / 2, 1.5) / Math.sqrt(starPhysics[star].M); return { time: formatDuration(y * 365.25 * 86400), how: "the cheapest orbit between them" }; }
  if (how.startsWith("ftl:")) {
    const drive = drives.find(x => `ftl:${x.id}` === how);
    if (drive?.mode === "speed" && drive.start === "anywhere") return { time: formatDuration(d / (C * drive.speed)), how: `${drive.speed.toLocaleString("en-US")} times light speed` };
    return { time: formatDuration(d / C), how: `${drive?.name ?? "This drive"} needs open space, so this is at light speed` };
  }
  return { time: formatDuration(d / C), how: "at light speed, as a signal would travel" };
}
/** Time between two stars for each way of travelling: light speed, then each FTL drive. */
export function travelBetweenStars(ly: number, drives: Drive[], lane: { hexes: number } | null): { name: string; time: string }[] {
  const rows = [{ name: "Light speed", time: ly <= 0 ? "Here" : formatDuration(ly * 365.25 * 86400) }];
  for (const d of drives) {
    if (d.mode === "speed") rows.push({ name: d.name, time: formatDuration(ly / d.speed * 365.25 * 86400) });
    else if (d.mode === "jump") { const n = Math.max(1, Math.ceil(ly / d.range)), hours = n * d.jumpHours + (n - 1) * d.recharge; rows.push({ name: d.name, time: `${n} jump${n === 1 ? "" : "s"} · ${formatDuration(hours * 3600)}` }); }
    else rows.push({ name: d.name, time: lane ? formatDuration(lane.hexes * d.laneDays * 86400) : "No lane" });
  }
  return rows;
}

// ---------------------------------------------------------------- generation
export const defaultOptions = (): SurveyOptions => ({ count: 6, belts: "auto", habitable: "some", giants: "auto", moons: "normal", rings: true, naming: "roman", poi: 2, era: "frontier", science: "realistic", holders: [] });
const pick = <T>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const HOOKS: Record<typeof hookKinds[number], string[]> = {
  lure: ["A derelict ark drifts above {w}, still broadcasting a docking code from three centuries ago.", "Prospectors swear {w} hides a seam of pure exotic ice worth a fleet.", "A distress beacon on {w} repeats the party's own ship name.", "{f} pays triple for anyone who can map the storms of {w}.", "Something under {w}'s crust answers radio pings with prime numbers."],
  danger: ["Flares from {s} cook unshielded ships in the inner zone every few days.", "{w}'s moons are mined with old proximity charges nobody charted.", "{f} patrols stop every ship and keep what they like.", "A slow plague of hull-eating spores drifts in orbit around {w}.", "The belt is crowded with wreckage that drifts into the lanes."],
  secret: ["{f} already mined {w} hollow and sealed the records.", "The colony on {w} was founded by people who never left {w2}.", "The star is dimming, and only one surveyor has noticed.", "{w2} is hollow, and not by nature.", "The beacon on {w} was set by the party's patron."],
};
export const pointsOfInterest = ["Ruin", "Derelict", "Anomaly", "Outpost", "Wreck field", "Vault"];

type MakeWorld = { name: string; kind: WorldKind; au: number; star: StarClass; z: Zones; o: SurveyOptions; parent?: SystemBody; index: number };
function makeWorld(r: () => number, { name, kind, au, star, z, o, parent, index }: MakeWorld): SystemBody {
  const giant = isGiant(kind), zone = zoneOf(au, z);
  const wetKind = kind === "water" || kind === "jungle";
  const size: SystemBody["size"] = giant ? pick(r, ["large", "massive", "massive"] as const) : parent ? (wetKind ? "small" : pick(r, ["tiny", "tiny", "small"] as const)) : pick(r, wetKind ? ["small", "medium", "medium", "large"] as const : ["tiny", "small", "medium", "medium", "large"] as const);
  const band = { tiny: [0.08, 0.3], small: [0.3, 0.7], medium: [0.8, 1.2], large: [1.3, 1.9], massive: [2, 2.8] }[size];
  const gravity = giant ? +(0.9 + r() * 1.6).toFixed(1) : +(band[0] + r() * (band[1] - band[0])).toFixed(2);
  const air: SystemBody["air"] = giant ? "crushing" : size === "tiny" ? pick(r, ["none", "none", "thin"] as const) : kind === "magma" ? pick(r, ["toxic", "crushing", "thin"] as const) : kind === "toxic" ? pick(r, ["toxic", "dense"] as const) : kind === "water" || kind === "jungle" ? pick(r, ["standard", "standard", "dense"] as const) : pick(r, ["none", "thin", "thin", "standard"] as const);
  const temp = temperatureAt(z.L, au, giant ? "none" : air), tw = temperatureWord(temp);
  let water: SystemBody["water"] = giant ? "none" : kind === "water" ? pick(r, ["ocean", "abundant"] as const) : kind === "jungle" ? "abundant" : kind === "ice" ? (r() < 0.4 ? "under-ice" : "trace") : kind === "desert" ? pick(r, ["none", "trace"] as const) : kind === "magma" ? "none" : pick(r, ["none", "trace", "some"] as const);
  const pulp = o.science === "pulp";
  if ((water === "ocean" || water === "abundant") && (tw === "Frozen" || tw === "Cold") && !pulp) water = "under-ice";
  if ((tw === "Hot" || tw === "Scorching") && !giant && !pulp) water = "none";
  if (air === "none" && !pulp && (water === "ocean" || water === "abundant" || water === "some")) water = tw === "Temperate" || tw === "Warm" ? "trace" : "under-ice";
  // Real rules: complex life needs surface water, air and mild heat; cold seas under ice only manage simple life. Pulp is generous.
  let life: SystemBody["life"] = "none";
  const surface = ["some", "abundant", "ocean"].includes(water) && air !== "none", mild = tw === "Temperate" || tw === "Warm";
  const young = star === "O" || star === "B", roll = r();
  const full = () => roll < 0.2 ? "microbial" : roll < 0.5 ? "simple" : roll < 0.88 ? "complex" : "sapient";
  if (pulp && (surface || water === "under-ice") && tw !== "Scorching") life = young ? (roll < 0.5 ? "simple" : "complex") : full();
  else if (surface && mild) life = young ? (roll < 0.5 ? "microbial" : "none") : star === "A" ? (roll < 0.6 ? "microbial" : "simple") : full();
  else if ((surface && tw === "Cold") || water === "under-ice") life = young ? "none" : roll < 0.3 ? "microbial" : roll < 0.45 ? "simple" : "none";
  const hazard = young ? (zone === "Scorch" ? "Radiation" : pick(r, ["Radiation", "None", "Storms"])) : star === "M" && zone !== "Dark" ? pick(r, ["Flares", "Flares", "None"]) : kind === "magma" ? "Seismic" : giant ? "Storms" : kind === "toxic" ? "Toxic air" : tw === "Frozen" ? "Extreme cold" : tw === "Scorching" ? "Extreme heat" : pick(r, ["None", "None", "Seismic", "Storms"]);
  const tideLocked = parent ? `Locked to ${parent.name}` : star === "M" && au < z.hzOut * 1.3 ? "Locked: one side faces the star" : null;
  const day = tideLocked ?? (giant ? `${Math.round(9 + r() * 8)} hours` : `${Math.round(14 + r() * 40)} hours`);
  const wid = `${parent ? `${parent.id}m` : "w"}${index}${Math.floor(r() * 46656).toString(36)}`;
  const w: SystemBody = { id: wid, name, au, kind, type: pick(r, worldTypes[kind]), size, gravity, temp, air, water, resources: pick(r, resourceLevels), hazard, life, settled: "nobody", day, poi: [], note: "", phase: +(r() * 6.28).toFixed(3), moons: [] };
  if (!parent) {
    const mult = o.moons === "none" ? 0 : o.moons === "few" ? 0.5 : o.moons === "many" ? 2 : 1;
    const n = Math.min(giant ? Math.round((2 + r() * 4) * mult) : Math.round(r() * 1.6 * mult + (size === "large" || size === "massive" ? mult * 0.6 : 0)), 6);
    if (o.rings && giant && r() < 0.55) w.rings = true;
    for (let m = 0; m < n; m++) {
      const mr = galaxyRandom(`${wid}|moon${m}`);
      let mk: WorldKind = au > z.frost ? pick(mr, ["ice", "ice", "rocky"] as const) : pick(mr, ["rocky", "rocky", "desert"] as const);
      if (giant && m === 0 && au > z.frost && mr() < 0.5) mk = "water";
      const { moons: _none, ...moon } = makeWorld(mr, { name: `${name}-${"abcdefgh"[m]}`, kind: mk, au, star, z, o, parent: w, index: m });
      void _none;
      if (giant && mr() < 0.4) moon.hazard = "Tidal quakes";
      w.moons.push(moon);
    }
  }
  return w;
}
const allOf = (bodies: SystemBody[]): World[] => bodies.flatMap(b => [b, ...b.moons]);

/** Hooks: a lure, a danger and a secret, filled in with this system's worlds and the first organization's name. */
function makeHooks(r: () => number, name: string, bodies: SystemBody[], holder: string, keep: StarSystem["hooks"] = []): StarSystem["hooks"] {
  const w = (bodies.find(b => b.life !== "none" || b.settled !== "nobody") ?? bodies[0])?.name ?? name;
  const w2 = (allOf(bodies).find(x => !("moons" in x)) ?? bodies[bodies.length - 1])?.name ?? name;
  const fill = (t: string) => t.replace(/\{w\}/g, w).replace(/\{w2\}/g, w2).replace(/\{f\}/g, holder).replace(/\{s\}/g, name);
  return hookKinds.map(k => keep.find(h => h.kind === k && h.locked) ?? { id: k, kind: k, text: fill(pick(r, HOOKS[k])) });
}
/** A new hook of this kind, different from the one it replaces when it can be. */
export function rerollHook(s: StarSystem, hookId: string, systemName: string, holder: string, seed = `${Date.now()}`): StarSystem {
  const r = galaxyRandom(`${seed}|${hookId}`), h = s.hooks.find(x => x.id === hookId);
  if (!h) return s;
  let next = makeHooks(r, systemName, s.bodies, holder).find(x => x.kind === h.kind)!.text;
  for (let i = 0; next === h.text && i < 8; i++) next = makeHooks(r, systemName, s.bodies, holder).find(x => x.kind === h.kind)!.text;
  return { ...s, hooks: s.hooks.map(x => x.id === hookId ? { ...x, text: next } : x) };
}

export type SurveyInput = { name: string; star: StarClass; companions: StarSystem["companions"]; premise: string; options: SurveyOptions; backdrop: StarSystem["backdrop"]; seed: string; holderNames?: string[] };
/**
 * Runs a survey: orbits spaced outwards by 1.4 to 1.9 times, a green-zone world nudged into place when asked,
 * worlds by zone (giants and ice past the frost line, hot rocks inside the green zone), moons, belts, settlements by era,
 * points of interest and hooks. Locked worlds and hooks in `keep` stay as they are. The same input always gives the same system.
 */
export function survey(i: SurveyInput, keep?: StarSystem): StarSystem {
  const o = i.options, star = i.star, z = zones({ star, companions: i.companions }), s = Math.sqrt(z.L);
  const r = galaxyRandom([i.seed, star, o.count, o.habitable, o.giants, o.belts, o.moons, o.science, i.companions.map(c => c.star + c.separation).join("")].join("|"));
  const kept = (keep?.bodies ?? []).filter(b => b.locked || b.pageId || b.moons.some(m => m.pageId));
  let a = 0.32 * s * (0.8 + r() * 0.4);
  const orbits: number[] = [];
  for (let n = 0; n < Math.max(0, o.count - kept.length); n++) { orbits.push(a); a *= 1.4 + r() * 0.5; }
  if ((o.habitable === "some" || o.habitable === "many" || o.habitable === "auto") && orbits.length && !kept.some(b => zoneOf(b.au, z) === "Green")) {
    const mid = Math.sqrt(z.hzIn * z.hzOut);
    let best = 0;
    orbits.forEach((x, n) => { if (Math.abs(Math.log(x / mid)) < Math.abs(Math.log(orbits[best] / mid))) best = n; });
    if (o.habitable !== "auto" || Math.abs(Math.log(orbits[best] / mid)) < 0.5) orbits[best] = mid * (0.97 + r() * 0.06);
    if (o.habitable === "many" && orbits.length > 2) { const j = best + 1 < orbits.length ? best + 1 : best - 1; orbits[j] = j > best ? z.hzOut * 0.96 : z.hzIn * 1.04; }
    orbits.sort((x, y) => x - y);
  }
  // A kept world holds its orbit; a new one too close to it moves out a little.
  const taken = kept.map(b => b.au);
  const free = orbits.map(au => { let x = au; for (let n = 0; n < 6 && taken.some(t => Math.abs(Math.log(t / x)) < 0.12); n++) x *= 1.18; taken.push(x); return x; });
  const fresh = free.map((au, n) => {
    const br = galaxyRandom(`${i.seed}|w${n}|${star}|${au.toFixed(4)}`), zone = zoneOf(au, z);
    const pGiant = o.giants === "none" ? 0 : o.giants === "many" ? 0.85 : o.giants === "some" ? 0.55 : 0.6;
    let kind: WorldKind;
    if (au > z.frost) kind = br() < pGiant ? (br() < 0.7 ? "gas" : "ice-giant") : br() < 0.6 ? "ice" : "rocky";
    else if (o.giants === "many" && br() < 0.25) kind = "gas";
    else if (zone === "Green") kind = o.habitable === "none" ? pick(br, ["desert", "rocky"] as const) : pick(br, ["water", "water", "jungle", "desert", "rocky"] as const);
    else kind = temperatureAt(z.L, au, "none") > 350 ? pick(br, ["magma", "magma", "rocky", "toxic"] as const) : pick(br, ["rocky", "desert", "toxic", "rocky"] as const);
    if (o.science === "pulp" && zone === "Green" && kind === "rocky") kind = "jungle";
    return makeWorld(br, { name: "", kind, au, star, z, o, index: n });
  });
  const bodies = [...kept, ...fresh].sort((x, y) => x.au - y.au);
  // Names in order out from the star; kept worlds keep theirs.
  bodies.forEach((b, n) => { if (kept.includes(b)) return; b.name = o.naming === "letters" ? `${i.name} ${"bcdefghijklmn"[n]}` : `${i.name}-${ROMAN[n] ?? n + 1}`; b.moons.forEach((m, k) => { m.name = `${b.name}-${"abcdefgh"[k]}`; m.day = `Locked to ${b.name}`; }); });
  const nb = o.belts === "none" ? 0 : o.belts === "many" ? 2 : o.belts === "some" ? 1 : r() < 0.6 ? 1 : 0, belts: StarSystem["belts"] = [];
  for (let b = 0; b < nb && bodies.length; b++) { const g = bodies.find(x => isGiant(x.kind)); belts.push({ id: `belt${b}`, name: b === 0 ? "Inner belt" : "Outer belt", au: +(b === 0 ? (g ? g.au * 0.62 : z.frost) : bodies[bodies.length - 1].au * 1.5).toFixed(3) }); }
  // Settlements by era, points of interest and who holds what.
  const rocky = fresh.filter(w => !isGiant(w.kind)).sort((x, y) => Number(zoneOf(y.au, z) === "Green") - Number(zoneOf(x.au, z) === "Green"));
  const settle = o.era === "untouched" ? 0 : o.era === "frontier" ? 1 : o.era === "settled" ? Math.min(3, rocky.length) : 1;
  rocky.slice(0, settle).forEach((w, k) => { w.settled = o.era === "fallen" ? "nobody" : k === 0 && w.life === "sapient" ? "homeworld" : k === 0 ? "colony" : "outpost"; if (o.era === "fallen") w.poi.push("Ruin"); });
  const freshAll = allOf(fresh);
  for (let n = 0; n < o.poi && freshAll.length; n++) { const w = pick(r, freshAll), p = pick(r, pointsOfInterest); if (!w.poi.includes(p) && w.poi.length < 6) w.poi.push(p); }
  o.holders.forEach((h, k) => { const w = rocky[(k * 2) % Math.max(1, rocky.length)] ?? fresh[0]; if (w && !w.holderId) w.holderId = h; });
  const hooks = makeHooks(r, i.name, bodies, i.holderNames?.[0] ?? "A rival house", keep?.hooks);
  return { star, companions: i.companions, premise: i.premise, options: o, backdrop: i.backdrop, seed: i.seed.trim().slice(0, 80) || "system", bodies, belts, hooks, ...(keep?.sector ? { sector: keep.sector } : {}) };
}

/** Sol, from real data (rounded). */
export function solSystem(): StarSystem {
  const z = zones({ star: "G", companions: [] });
  type M = [string, WorldKind, string, SystemBody["size"], number, number, SystemBody["air"]?, SystemBody["water"]?, string?];
  const P = (name: string, kind: WorldKind, type: string, au: number, size: SystemBody["size"], gravity: number, temp: number, air: SystemBody["air"], water: SystemBody["water"], life: SystemBody["life"], hazard: string, day: string, moons: M[], rings = false): SystemBody => {
    const pid = `sol-${name.toLowerCase()}`;
    return { id: pid, name, au, kind, type, size, gravity, temp, air, water, resources: "moderate", hazard, life, settled: name === "Earth" ? "homeworld" : "nobody", day, poi: [], note: "", real: true, phase: +((name.length * 1.7) % 6.28).toFixed(3), ...(rings ? { rings } : {}),
      moons: moons.map(m => ({ id: `sol-${m[0].toLowerCase()}`, name: m[0], au, kind: m[1], type: m[2], size: m[3], gravity: m[4], temp: m[5], air: m[6] ?? "none", water: m[7] ?? "none", resources: "moderate", hazard: m[8] ?? "None", life: "none", settled: "nobody", day: `Locked to ${name}`, poi: [], note: "", real: true, phase: 0 })) };
  };
  const bodies = [
    P("Mercury", "rocky", "Cratered", 0.39, "tiny", 0.38, 167, "none", "none", "none", "Extreme heat", "176 days", []),
    P("Venus", "toxic", "Acid", 0.72, "medium", 0.9, 464, "crushing", "none", "none", "Toxic air", "117 days", []),
    P("Earth", "water", "Ocean", 1, "medium", 1, 15, "standard", "ocean", "sapient", "None", "24 hours", [["Moon", "rocky", "Cratered", "small", 0.17, -20]]),
    P("Mars", "desert", "Canyon", 1.52, "small", 0.38, -63, "thin", "under-ice", "none", "Storms", "24.6 hours", [["Phobos", "rocky", "Cratered", "tiny", 0.001, -40], ["Deimos", "rocky", "Cratered", "tiny", 0.0003, -40]]),
    P("Jupiter", "gas", "Storm", 5.2, "massive", 2.53, -110, "crushing", "none", "none", "Radiation", "10 hours", [["Io", "magma", "Volcanic", "small", 0.18, -130, "thin", "none", "Seismic"], ["Europa", "ice", "Frost-crust", "small", 0.13, -160, "thin", "under-ice", "Radiation"], ["Ganymede", "ice", "Glacial", "small", 0.15, -160, "thin", "under-ice"], ["Callisto", "ice", "Cratered", "small", 0.13, -139]]),
    P("Saturn", "gas", "Pale", 9.5, "massive", 1.07, -140, "crushing", "none", "none", "Storms", "10.7 hours", [["Titan", "toxic", "Smog", "small", 0.14, -179, "dense", "trace"], ["Enceladus", "ice", "Frost-crust", "tiny", 0.01, -198, "none", "under-ice"], ["Rhea", "ice", "Cratered", "tiny", 0.03, -174]], true),
    P("Uranus", "ice-giant", "Cyan", 19.2, "large", 0.89, -195, "crushing", "none", "none", "Extreme cold", "17 hours", [["Titania", "ice", "Canyon", "tiny", 0.04, -203], ["Oberon", "ice", "Cratered", "tiny", 0.04, -198]]),
    P("Neptune", "ice-giant", "Azure", 30.1, "large", 1.14, -200, "crushing", "none", "none", "Storms", "16 hours", [["Triton", "ice", "Frost-crust", "small", 0.08, -235, "thin", "trace", "Extreme cold"]]),
  ];
  void z;
  return { star: "G", companions: [], real: true, premise: "", options: { ...defaultOptions(), count: 8, era: "settled" }, backdrop: "deep", seed: "sol", bodies,
    belts: [{ id: "belt0", name: "Asteroid belt", au: 2.7 }, { id: "belt1", name: "Kuiper belt", au: 40 }],
    hooks: [{ id: "lure", kind: "lure", text: "Ceres station is hiring anyone with a ship and no questions." }, { id: "danger", kind: "danger", text: "Jupiter's radiation belts kill an unshielded crew near Io in hours." }, { id: "secret", kind: "secret", text: "Something on Europa's sea floor has been listening." }] };
}

/** What a new system page starts as: a survey seeded by its title. */
export const newStarSystem = (title: string, star: StarClass = "G"): StarSystem =>
  survey({ name: title.trim() || "System", star, companions: [], premise: "", options: defaultOptions(), backdrop: "nebula", seed: title.trim() || "system" });

// ---------------------------------------------------------------- reading and editing worlds
export const allWorlds = (s: StarSystem): World[] => allOf(s.bodies);
export const findWorld = (s: StarSystem, wid: string) => allWorlds(s).find(w => w.id === wid);
export const parentOf = (s: StarSystem, wid: string) => s.bodies.find(b => b.moons.some(m => m.id === wid));
/** One line on why a world matters, for the chart. */
export function worldLine(w: World, holderName?: string) {
  if (w.real && w.name === "Earth") return "Home. Oceans, sapient life and eight billion people.";
  const bits: string[] = [];
  if (holderName) bits.push(`${holderName} holds it`);
  if (w.settled !== "nobody") bits.push(`a ${word(w.settled).toLowerCase()}`);
  if (w.poi.length) bits.push(w.poi.join(" and ").toLowerCase());
  if (w.life !== "none") bits.push(`${word(w.life).toLowerCase()} life`);
  if (w.hazard !== "None") bits.push(w.hazard.toLowerCase());
  const s = bits.slice(0, 3).join(", ");
  return s ? `${s[0].toUpperCase()}${s.slice(1)}.` : `${temperatureWord(w.temp)} and ${w.water === "none" ? "dry" : "wet"}. Nothing here yet.`;
}
/** Changes one world (or moon), marking the fields the GM changed. Air changes the temperature with it. */
export function editWorld(s: StarSystem, wid: string, patch: Partial<Moon>): StarSystem {
  const z = zones(s), mark = (w: World): World => {
    const next = { ...w, ...patch } as World, fields = Object.keys(patch).filter(k => k !== "note" && k !== "locked" && k !== "pageId");
    if (patch.air && !("temp" in patch)) next.temp = temperatureAt(z.L, next.au, isGiant(next.kind) ? "none" : patch.air);
    if (fields.length) next.edited = [...new Set([...(w.edited ?? []), ...fields])].slice(0, 20);
    return next;
  };
  return { ...s, bodies: s.bodies.map(b => b.id === wid ? mark(b) as SystemBody : b.moons.some(m => m.id === wid) ? { ...b, moons: b.moons.map(m => m.id === wid ? mark(m) as Moon : m) } : b) };
}
/** Removes a planet (with its moons) or a moon. */
export const removeWorld = (s: StarSystem, wid: string): StarSystem => ({ ...s, bodies: s.bodies.filter(b => b.id !== wid).map(b => ({ ...b, moons: b.moons.filter(m => m.id !== wid) })) });
/** A new world past the last one. */
export function addWorldOutside(s: StarSystem, name: string, seed = `${Date.now()}`): StarSystem {
  const z = zones(s), last = s.bodies[s.bodies.length - 1], au = +((last?.au ?? 0.32 * Math.sqrt(z.L)) * 1.6).toFixed(3), r = galaxyRandom(`${seed}|add`);
  const kind: WorldKind = au > z.frost ? pick(r, ["gas", "ice-giant", "ice"] as const) : pick(r, ["rocky", "desert"] as const);
  const w = makeWorld(r, { name: `${name}-${ROMAN[s.bodies.length] ?? s.bodies.length + 1}`, kind, au, star: s.star, z, o: s.options, index: s.bodies.length });
  return { ...s, bodies: [...s.bodies, { ...w, moons: w.moons.map(m => ({ ...m, day: `Locked to ${w.name}` })) }] };
}
/** Rolls one world again in place, keeping its orbit, name and notes. */
export function rerollWorld(s: StarSystem, wid: string, seed = `${Date.now()}`): StarSystem {
  const z = zones(s), r = galaxyRandom(`${seed}|${wid}`), parent = parentOf(s, wid), w = findWorld(s, wid);
  if (!w) return s;
  const zone = zoneOf(w.au, z);
  const kind: WorldKind = parent ? pick(r, w.au > z.frost ? ["ice", "ice", "rocky", "water"] as const : ["rocky", "desert", "rocky"] as const)
    : w.au > z.frost ? pick(r, ["gas", "ice-giant", "ice", "rocky"] as const) : zone === "Green" ? pick(r, ["water", "jungle", "desert", "rocky"] as const) : pick(r, ["rocky", "desert", "toxic", "magma"] as const);
  const made = makeWorld(r, { name: w.name, kind, au: w.au, star: s.star, z, o: s.options, parent, index: 0 });
  const fresh = { ...made, id: w.id, name: w.name, note: w.note, pageId: w.pageId, locked: w.locked };
  if (parent) { const { moons: _m, ...moon } = fresh; void _m; return { ...s, bodies: s.bodies.map(b => b.id === parent.id ? { ...b, moons: b.moons.map(m => m.id === wid ? { ...moon, day: `Locked to ${b.name}` } : m) } : b) }; }
  return { ...s, bodies: s.bodies.map(b => b.id === wid ? { ...fresh, moons: fresh.moons.map(m => ({ ...m, day: `Locked to ${w.name}` })) } : b) };
}
/** A short description of the world for its journal. */
export function worldSummary(s: StarSystem, w: World, systemName: string) {
  const z = zones(s), moon = !!parentOf(s, w.id);
  return `${w.name} is a ${word(w.size).toLowerCase()} ${worldKindNames[w.kind].toLowerCase()} ${moon ? "moon" : "world"} in the ${zoneOf(w.au, z).toLowerCase()} zone of ${systemName}. ${temperatureWord(w.temp)}, about ${w.temp} °C, with ${w.air === "none" ? "no air to speak of" : `${word(w.air).toLowerCase()} air`} and ${w.water === "none" ? "no water" : `${word(w.water).toLowerCase()} water`}.${w.life !== "none" ? ` Life: ${word(w.life).toLowerCase()}.` : ""}`;
}
/** Search text for a system page. */
export const systemSearchText = (s?: StarSystem) => s ? [s.premise, ...allOf(s.bodies).map(w => `${w.name} ${w.note}`), ...s.hooks.map(h => h.text)].join(" ") : "";
/** Organization pages a system points at. */
export const systemRefs = (s: StarSystem) => [...s.options.holders, ...allOf(s.bodies).flatMap(w => w.holderId ? [w.holderId] : [])];
/** The same system with its page links moved to copied pages (or dropped when the page was not copied). */
export function remapSystem(s: StarSystem, to: (id: string) => string | undefined): StarSystem {
  const w = <T extends World>(x: T): T => { const { holderId, pageId, ...rest } = x, h = holderId && to(holderId), p = pageId && to(pageId); return { ...rest, ...(h ? { holderId: h } : {}), ...(p ? { pageId: p } : {}) } as T; };
  const sp = s.sector && to(s.sector.pageId);
  const { sector: _s, ...rest } = s; void _s;
  return { ...rest, options: { ...s.options, holders: s.options.holders.flatMap(h => to(h) ?? []) }, bodies: s.bodies.map(b => ({ ...w(b), moons: b.moons.map(w) })), ...(sp && s.sector ? { sector: { ...s.sector, pageId: sp } } : {}) };
}
