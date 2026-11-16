import { defaultPlanetOptions, planetPresets, withPreset, type PlanetLife, type PlanetOptions, type PlanetSize } from "./planet-generator.ts";
import type { PlanetForWorldMap } from "./planets.ts";

/**
 * Develop as world map: the planet generator's settings for a world charted from a star system's survey chart.
 * Its kind picks the closest planet preset, then its temperature, water, air, gravity, day, life, size and how settled it
 * is set the sliders, so the first map already looks like the survey. The seed is the world's own, so the same world
 * starts from the same map. Loaded in the browser only, with the Generate dialog.
 */
export type SurveyWorld = PlanetForWorldMap & {
  /** The survey's day, such as "26 hours" or "Locked: one side faces the star". */
  day?: string;
};
export type SurveyStart = { options: PlanetOptions; preset: string; notes: string[] };

const presetFor: Record<string, string> = { rocky: "earthlike", water: "ocean", ice: "ice", desert: "desert", magma: "volcanic", jungle: "jungle", toxic: "desert" };
const waterShare: Record<string, number> = { none: 2, trace: 8, some: 35, abundant: 62, ocean: 72, "under-ice": 88 };
const rainFor: Record<string, number> = { none: 4, trace: 12, some: 32, abundant: 55, ocean: 72, "under-ice": 20 };
const lifeFor: Record<string, PlanetLife> = { none: "none", microbial: "simple", simple: "simple", complex: "complex", sapient: "complex" };
const sizeFor: Record<string, PlanetSize> = { tiny: "tiny", small: "small", medium: "medium", large: "large", massive: "large" };
const townsFor: Record<string, number> = { nobody: 0, outpost: 2, colony: 6, homeworld: 14 };

/** The generator's -3 to 3 temperature for a world's average in °C (Earth's 15 °C is temperate). */
export function tempStep(c: number) {
  return c < -60 ? -3 : c < -20 ? -2 : c < 4 ? -1 : c < 24 ? 0 : c < 40 ? 1 : c < 70 ? 2 : 3;
}
/** A planet spins unless its day says it keeps one face to its star. A moon locked to its planet still has days and nights. */
export const lockedToStar = (w: Pick<SurveyWorld, "day" | "moonOf">) => !w.moonOf && !!w.day && /tidal|locked|faces the star/i.test(w.day);

/** Generator settings for a surveyed world, the preset they start from, and what was set from the survey, in words. */
export function surveyStart(w: SurveyWorld): SurveyStart {
  // A water world with complex or sapient life (Earth on the survey chart) keeps continents; without, it is open ocean.
  const landLife = w.life === "complex" || w.life === "sapient";
  const preset = w.category === "water" && landLife ? "earthlike" : presetFor[w.category] ?? "earthlike";
  const o = withPreset(defaultPlanetOptions(w.seed), preset), notes: string[] = [];
  const name = planetPresets.find(x => x.id === preset)!.name;
  notes.push(`${name} to start`);
  const temp = w.water === "under-ice" ? Math.min(-2, tempStep(w.temperature)) : tempStep(w.temperature);
  o.temp = temp; notes.push(`${w.temperature} °C`);
  o.water = preset === "ocean" && w.water === "ocean" ? 93 : waterShare[w.water] ?? o.water; notes.push(`${w.water === "under-ice" ? "seas under ice" : `${w.water} water`}`);
  let rain = rainFor[w.water] ?? o.rain;
  if (w.atmosphere === "none") rain = Math.min(rain, 3);
  else if (w.atmosphere === "thin") rain = Math.round(rain * 0.6);
  else if (w.atmosphere === "dense") rain = Math.min(100, rain + 10);
  o.rain = rain; notes.push(`${w.atmosphere} air`);
  // Mountains stand taller where gravity is weak and slump where it is strong.
  o.mountains = Math.round(Math.max(15, Math.min(85, o.mountains * (w.gravity > 0 ? Math.pow(1 / w.gravity, 0.5) : 1))));
  if (w.gravity < 0.7 || w.gravity > 1.4) notes.push(`${w.gravity} g`);
  if (w.category === "magma" || /volcan|lava|erupt/i.test(w.hazard)) o.volcanism = Math.max(o.volcanism, w.category === "magma" ? 95 : 70);
  if (lockedToStar(w)) { o.rotation = "locked"; o.tilt = 0; notes.push("tidally locked"); }
  o.life = lifeFor[w.life] ?? o.life; notes.push(`${w.life} life`);
  o.size = sizeFor[w.size] ?? o.size;
  const towns = townsFor[w.settled] ?? 0;
  o.places = towns; o.roads = towns > 2; o.landmarks = true;
  if (w.settled !== "nobody") notes.push(w.settled);
  o.biomesOff = [];
  return { options: o, preset, notes };
}
