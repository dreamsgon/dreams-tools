import { z } from "zod";

/**
 * Galaxy pages: the top of the space pages (galaxy, then sectors, star systems and worlds).
 * A galaxy is either one of a few real ones, with rounded published figures, or one generated from a
 * seed. The art is drawn from the shape, arms and seed (components/encyclopedia/galaxy-art.tsx), so the
 * same galaxy always looks the same. Kept free of other modules: the workspace schema imports it.
 */
export const galaxyShapes = ["spiral", "barred", "elliptical", "irregular", "ring"] as const;
export type GalaxyShape = typeof galaxyShapes[number];
export const galaxySizes = ["dwarf", "medium", "giant"] as const;
export type GalaxySize = typeof galaxySizes[number];
export const shapeNames: Record<GalaxyShape, string> = { spiral: "Spiral", barred: "Barred spiral", elliptical: "Elliptical", irregular: "Irregular", ring: "Ring" };
export const sizeNames: Record<GalaxySize, string> = { dwarf: "Dwarf", medium: "Medium", giant: "Giant" };
/** Shapes that have arms; the rest draw none. */
export const hasArms = (shape: GalaxyShape) => shape === "spiral" || shape === "barred";

const fact = z.string().trim().max(120);
export const galaxyFactsSchema = z.object({ type: fact, across: fact, stars: fact, age: fact, distance: fact });
export type GalaxyFacts = z.infer<typeof galaxyFactsSchema>;
export const factLabels: Record<keyof GalaxyFacts, string> = { type: "Type", across: "Across", stars: "Stars", age: "Age", distance: "Distance" };

type Preset = { name: string; shape: GalaxyShape; arms: number; size: GalaxySize; facts: GalaxyFacts; summary: string };
/** Real galaxies. The figures are rounded published estimates; the art is a schematic, not a star chart. */
export const galaxyPresets = {
  milky: { name: "Milky Way", shape: "barred", arms: 4, size: "medium", facts: { type: "Barred spiral (SBbc)", across: "About 100,000 ly", stars: "100 to 400 billion", age: "About 13.6 billion years", distance: "Home" }, summary: "Our galaxy. The Sun sits in the Orion Spur, about 26,000 ly from the central black hole, Sagittarius A*." },
  andromeda: { name: "Andromeda (M31)", shape: "spiral", arms: 2, size: "giant", facts: { type: "Spiral (SA(s)b)", across: "About 150,000 to 220,000 ly", stars: "About 1 trillion", age: "About 10 billion years", distance: "2.5 million ly" }, summary: "The nearest big galaxy, heading toward ours. The two will merge in about 4 to 5 billion years." },
  triangulum: { name: "Triangulum (M33)", shape: "spiral", arms: 2, size: "medium", facts: { type: "Spiral (SA(s)cd)", across: "About 60,000 ly", stars: "About 40 billion", age: "About 10 billion years", distance: "2.7 million ly" }, summary: "A loose spiral full of star-forming nebulae, the third largest in our Local Group." },
  lmc: { name: "Large Magellanic Cloud", shape: "irregular", arms: 0, size: "dwarf", facts: { type: "Irregular (barred Magellanic spiral)", across: "About 32,000 ly", stars: "About 30 billion", age: "About 13 billion years", distance: "160,000 ly" }, summary: "A satellite of the Milky Way, seen from the southern hemisphere. Home of the Tarantula Nebula." },
  m87: { name: "Messier 87", shape: "elliptical", arms: 0, size: "giant", facts: { type: "Giant elliptical (E0)", across: "About 120,000 ly (halo far larger)", stars: "Several trillion", age: "About 13 billion years", distance: "53 million ly" }, summary: "An old, round swarm of stars around the first black hole ever imaged, with a jet 5,000 ly long." },
} satisfies Record<string, Preset>;
export type GalaxyPresetId = keyof typeof galaxyPresets;
export const galaxyPresetIds = Object.keys(galaxyPresets) as GalaxyPresetId[];

export const galaxySchema = z.object({
  /** A real galaxy this one started from. Its facts can still be edited. */
  preset: z.enum(galaxyPresetIds as [GalaxyPresetId, ...GalaxyPresetId[]]).optional(),
  shape: z.enum(galaxyShapes),
  arms: z.number().int().min(0).max(6),
  size: z.enum(galaxySizes),
  seed: z.string().trim().min(1).max(80),
  facts: galaxyFactsSchema,
  /** One or two lines under the facts. The page's own tabs hold the longer story. */
  summary: z.string().trim().max(600),
});
export type Galaxy = z.infer<typeof galaxySchema>;

/** A small seeded random number generator (mulberry32 over an FNV-1a hash of the seed). */
export function galaxyRandom(seed: string) {
  let n = 2166136261;
  for (const ch of seed) n = Math.imul(n ^ ch.charCodeAt(0), 16777619);
  let a = (n >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const START = ["Ve", "Ka", "Or", "Tha", "Is", "Mor", "Sel", "Ae", "Qu", "Zan", "Ny", "Cor", "Hal", "Ith", "Ul", "Dra"];
const MID = ["", "", "ra", "le", "yn", "the", "va", "ri", "lo", "sa"];
const END = ["l", "n", "th", "ra", "ris", "x", "ne", "dor", "ya", "s"];
const KINDS = ["Expanse", "Reach", "Spiral", "Wheel", "Crown", "Cloud", "Deep", "Veil", "Drift", "Maelstrom"];
/** A made-up galaxy name such as "The Veyl Expanse". */
export function galaxyName(random: () => number) {
  const pick = <T>(xs: T[]) => xs[Math.floor(random() * xs.length)];
  const word = pick(START) + pick(MID) + pick(END);
  return `The ${word} ${pick(KINDS)}`;
}

const round = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);
const grouped = (n: number) => n.toLocaleString("en-US");
/** Plausible facts for a generated galaxy of this shape and size. */
export function generatedFacts(shape: GalaxyShape, size: GalaxySize, seed: string): GalaxyFacts {
  const r = galaxyRandom(`${seed}:facts:${shape}:${size}`);
  const across = size === "dwarf" ? round(3000 + r() * 12000, 1000) : size === "medium" ? round(50000 + r() * 70000, 5000) : round(150000 + r() * 150000, 10000);
  const stars = size === "dwarf" ? `About ${Math.round(1 + r() * 9)} billion` : size === "medium" ? `About ${round(50 + r() * 350, 10)} billion` : `About ${(0.6 + r() * 4).toFixed(1)} trillion`;
  // Ellipticals are old; spirals and irregulars still make stars.
  const age = shape === "elliptical" ? 11 + r() * 2.5 : 8 + r() * 5.5;
  return { type: shapeNames[shape], across: `About ${grouped(across)} ly`, stars, age: `About ${age.toFixed(1)} billion years`, distance: "Invented" };
}

/** A generated galaxy. Without a seed it uses the name. */
export function generateGalaxy(o: { shape: GalaxyShape; arms: number; size: GalaxySize; seed: string }): Galaxy {
  const arms = hasArms(o.shape) ? Math.min(6, Math.max(2, Math.round(o.arms))) : 0;
  return { shape: o.shape, arms, size: o.size, seed: o.seed.trim().slice(0, 80) || "galaxy", facts: generatedFacts(o.shape, o.size, o.seed), summary: "" };
}

/** A real galaxy from the presets. */
export function presetGalaxy(id: GalaxyPresetId): Galaxy {
  const p = galaxyPresets[id];
  return { preset: id, shape: p.shape, arms: p.arms, size: p.size, seed: id, facts: { ...p.facts }, summary: p.summary };
}

/** What a new galaxy page starts as: a barred spiral seeded by its title. */
export const newGalaxy = (title: string): Galaxy => generateGalaxy({ shape: "barred", arms: 3, size: "medium", seed: title.trim() || "galaxy" });

/** Random settings for the Generate tab's dice. */
export function randomGalaxySettings(random: () => number): { shape: GalaxyShape; arms: number; size: GalaxySize; seed: string; name: string } {
  const shape = (["spiral", "barred", "barred", "spiral", "elliptical", "irregular", "ring"] as GalaxyShape[])[Math.floor(random() * 7)];
  const size = (["dwarf", "medium", "medium", "giant"] as GalaxySize[])[Math.floor(random() * 4)];
  const name = galaxyName(random);
  return { shape, arms: hasArms(shape) ? 2 + Math.floor(random() * 4) : 0, size, seed: name, name };
}

/** The art for a galaxy: what galaxy-art.tsx draws. */
export const galaxyArtSpec = (g: Pick<Galaxy, "seed" | "shape" | "arms">) => ({ seed: g.seed, shape: g.shape, arms: g.arms });
