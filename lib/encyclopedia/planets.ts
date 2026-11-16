import { z } from "zod";
import { starClasses, type StarClass } from "./sectors.ts";
import { airs, findWorld, lifeLevels, parentOf, resourceLevels, settlements, sizes, waters, worldKinds, zoneOf, zones, type StarSystem, type World } from "./star-systems.ts";

/**
 * Planet pages: a world (or moon) from a star system's survey chart that the GM charted as its own place page.
 * The survey chart stays the source of a world's fields; the planet page keeps a copy (`profile`), refreshed on every
 * save from either page, so other tools (the world map generator's "Develop as world map") can read a planet page alone.
 * Kept to zod and the star system basics: the workspace schema imports it.
 */
const id = z.string().min(1).max(120);
export const planetProfileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(worldKinds), type: z.string().trim().max(40), size: z.enum(sizes),
  gravity: z.number().finite().min(0).max(50), temp: z.number().int().min(-273).max(10000),
  air: z.enum(airs), water: z.enum(waters), resources: z.enum(resourceLevels), hazard: z.string().trim().max(40),
  life: z.enum(lifeLevels), settled: z.enum(settlements), day: z.string().trim().max(60),
  au: z.number().finite().min(0.005).max(100000),
  zone: z.enum(["Scorch", "Green", "Cold", "Frost", "Dark"]),
  /** The planet a moon orbits. */
  orbits: z.string().trim().max(80).optional(),
  rings: z.boolean().optional(),
});
export type PlanetProfile = z.infer<typeof planetProfileSchema>;
export const planetSchema = z.object({
  /** The star system page whose survey chart holds this world. */
  systemPageId: id,
  /** The world's id in that system. */
  bodyId: z.string().regex(/^[A-Za-z0-9_-]{1,60}$/),
  star: z.enum(starClasses),
  profile: planetProfileSchema,
  /** A world map page developed from this planet. */
  worldMapId: id.optional(),
});
export type Planet = z.infer<typeof planetSchema>;

/** The copy of a world's fields that its planet page keeps. */
export function profileOf(s: StarSystem, w: World): PlanetProfile {
  const parent = parentOf(s, w.id);
  return { name: w.name, kind: w.kind, type: w.type, size: w.size, gravity: w.gravity, temp: w.temp, air: w.air, water: w.water, resources: w.resources, hazard: w.hazard, life: w.life, settled: w.settled, day: w.day, au: w.au, zone: zoneOf(w.au, zones(s)), ...(parent ? { orbits: parent.name } : {}), ...("rings" in w && w.rings ? { rings: true } : {}) };
}
export const planetOf = (systemPageId: string, s: StarSystem, w: World, worldMapId?: string): Planet => ({ systemPageId, bodyId: w.id, star: s.star, profile: profileOf(s, w), ...(worldMapId ? { worldMapId } : {}) });

type Page = { id: string; kind: string; title: string; starSystem?: StarSystem; planet?: Planet; updatedAt: string };
/**
 * After a system page changes: each charted world's page gets a fresh copy of its fields (and its name as the title),
 * and a planet page whose world is gone from the chart keeps its last copy. Pages that did not change are returned as they were.
 */
export function mirrorPlanets<E extends Page>(entries: E[], systemPageId: string, now = new Date().toISOString()): E[] {
  const system = entries.find(e => e.id === systemPageId)?.starSystem;
  if (!system) return entries;
  return entries.map(e => {
    if (e.planet?.systemPageId !== systemPageId) return e;
    const w = findWorld(system, e.planet.bodyId);
    if (!w || w.pageId !== e.id) return e;
    const next = planetOf(systemPageId, system, w, e.planet.worldMapId);
    if (JSON.stringify(next) === JSON.stringify(e.planet) && e.title === w.name) return e;
    return { ...e, planet: next, title: w.name, updatedAt: now };
  });
}

/**
 * What the world map generator needs to develop a planet page into a world map. Reads the planet page alone.
 * `band` is the system zone the world sits in; `seed` stays the same for the same world.
 */
export function planetForWorldMap(e: { id: string; title: string; planet?: Planet }) {
  const p = e.planet;
  if (!p) return null;
  const f = p.profile;
  return { name: e.title || f.name, category: f.kind, type: f.type, size: f.size, gravity: f.gravity, temperature: f.temp, atmosphere: f.air, water: f.water, life: f.life, hazard: f.hazard, settled: f.settled, band: f.zone, star: p.star as StarClass, moonOf: f.orbits ?? null, seed: `${p.systemPageId}:${p.bodyId}` };
}
export type PlanetForWorldMap = NonNullable<ReturnType<typeof planetForWorldMap>>;
/** Gas and ice giants have no surface to map. */
export const hasSurface = (p: Pick<PlanetProfile, "kind">) => p.kind !== "gas" && p.kind !== "ice-giant";
