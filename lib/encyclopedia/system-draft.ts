import { z } from "zod";
import { galaxyRandom } from "./galaxies.ts";
import { starClasses, type StarClass } from "./sectors.ts";
import { airs, hookKinds, isGiant, lifeLevels, resourceLevels, settlements, sizes, starSystemSchema, temperatureAt, waters, worldKinds, worldTypes, zones, type Moon, type StarSystem, type SystemBody, type WorldKind } from "./star-systems.ts";
import { pageText } from "./world-check.ts";

/**
 * From a setting (AI): the GM names a setting and a system in it, and their own AI builds the survey chart from what it
 * knows, at runtime, for that GM's campaign. RPG Tools ships no setting's content: only these instructions and the
 * reader that turns the AI's answer into a survey chart (with sensible values where the answer leaves something out).
 * Same two ways as Check with your AI: an API-key connection through RPG Tools' server, or a prompt the GM copies into
 * their AI app and whose answer (JSON) they paste back.
 */
export const systemDraftSchema = z.object({
  /** The setting: a book, game, film or the GM's own. */
  setting: z.string().trim().min(1).max(160),
  /** The system in it, or empty for one the AI picks or invents in that setting's style. */
  system: z.string().trim().max(160),
  science: z.enum(["realistic", "pulp"]),
  note: z.string().max(500).optional(),
});
export type SystemDraftRequest = z.infer<typeof systemDraftSchema>;

export const DRAFT_SYSTEM = [
  "You build star systems for a tabletop roleplaying game master's private campaign, from a setting they name.",
  "When the setting describes the system, follow it: its star, its worlds and moons in order out from the star, their names, what they are like, who lives there and the setting's own conflicts. Fill gaps plausibly in the setting's style, and say in a world's note when something is your invention.",
  "When no system is named, pick a fitting one from the setting or invent one in its style.",
  "Use your own words: short notes and hooks, never quoted passages from the source.",
  "Distances are in AU from the main star, temperatures in °C at the surface (cloud tops for giants). Up to 12 worlds, up to 6 moons each.",
].join(" ");

const props = {
  name: { type: "string" }, kind: { type: "string", enum: [...worldKinds], description: "rocky, water (ocean world), ice, desert, magma, jungle, toxic, gas (gas giant) or ice-giant" },
  type: { type: "string", description: "One or two words, such as Ocean, Ecumenopolis or Banded." },
  size: { type: "string", enum: [...sizes] }, au: { type: "number" }, temp: { type: "number" }, gravity: { type: "number", description: "In g, Earth = 1." },
  air: { type: "string", enum: [...airs] }, water: { type: "string", enum: [...waters] }, life: { type: "string", enum: [...lifeLevels] },
  resources: { type: "string", enum: [...resourceLevels] }, settled: { type: "string", enum: [...settlements] },
  hazard: { type: "string", description: "A word or two, or None." }, day: { type: "string", description: "Its day, such as 26 hours, or Locked to its planet." },
  note: { type: "string", description: "Two or three sentences for the GM." },
};
/** The AI's answer as a tool. */
export function systemDraftTool() {
  return {
    name: "send_system", description: "Send the star system.",
    inputSchema: { type: "object", additionalProperties: false, required: ["star", "premise", "worlds"], properties: {
      name: { type: "string", description: "The system's name." },
      star: { type: "string", enum: [...starClasses], description: "The main star's class." },
      companions: { type: "array", items: { type: "object", additionalProperties: false, required: ["star"], properties: { star: { type: "string", enum: [...starClasses] }, close: { type: "boolean", description: "true for a close pair, false for one far out." } } } },
      premise: { type: "string", description: "One line: what this system is in the setting." },
      worlds: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "kind", "au"], properties: { ...props, rings: { type: "boolean" },
        moons: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "kind"], properties: props } } } } },
      belts: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "au"], properties: { name: { type: "string" }, au: { type: "number" } } } },
      lure: { type: "string", description: "Why the party would come here." }, danger: { type: "string", description: "What threatens them here." }, secret: { type: "string", description: "What only the GM knows." },
    } },
  };
}

/** The request as the AI reads it. For an AI app (`forApp`), it asks for the answer as JSON to paste back. */
export function systemDraftPrompt(r: SystemDraftRequest, campaign: { name: string; description?: string }, forApp = false): string {
  return [
    ...(forApp ? [DRAFT_SYSTEM, ""] : []),
    `Campaign: ${campaign.name}${campaign.description ? `. ${pageText(campaign.description, 400)}` : ""}`,
    `Setting: ${r.setting.trim()}`,
    r.system.trim() ? `Build this system: ${r.system.trim()}` : "Pick a fitting system from the setting, or invent one in its style.",
    `Science: ${r.science === "pulp" ? "Pulp: follow the setting even where real physics would say no" : "Realistic: follow the setting, but keep temperatures, air and water believable where it doesn't say"}.`,
    ...(r.note?.trim() ? [`What the GM wants: ${r.note.trim()}`] : []),
    ...(forApp ? ["", "Answer with JSON only, in one code block, in this shape (leave out what you don't know; the app fills it in):",
      '{"name":"","star":"G","companions":[{"star":"M","close":false}],"premise":"","worlds":[{"name":"","kind":"rocky","type":"","size":"medium","au":1,"temp":15,"gravity":1,"air":"standard","water":"some","life":"complex","resources":"moderate","settled":"colony","hazard":"None","day":"24 hours","note":"","rings":false,"moons":[{"name":"","kind":"rocky"}]}],"belts":[{"name":"","au":2.8}],"lure":"","danger":"","secret":""}',
      `kind: ${worldKinds.join(", ")}. size: ${sizes.join(", ")}. air: ${airs.join(", ")}. water: ${waters.join(", ")}. life: ${lifeLevels.join(", ")}. resources: ${resourceLevels.join(", ")}. settled: ${settlements.join(", ")}. star: ${starClasses.join(", ")}.`] : []),
  ].join("\n");
}

/** The first JSON object in a pasted answer (it may sit in a code block, with words around it). */
export function parsePastedDraft(text: string): Record<string, unknown> {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw Error("Paste the AI's answer: it should have a { … } block in it.");
  try { const v = JSON.parse(text.slice(start, end + 1)); if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>; } catch { /* below */ }
  throw Error("That answer isn't JSON RPG Tools can read. Ask your AI for the JSON only, and paste it again.");
}

const str = (v: unknown, max: number) => typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null;
const oneOf = <T extends string>(xs: readonly T[], v: unknown): T | null => { const s = typeof v === "string" ? v.trim().toLowerCase().replace(/\s+/g, "-") : ""; return (xs as readonly string[]).includes(s) ? s as T : null; };
const kindOf = (v: unknown): WorldKind | null => oneOf(worldKinds, v) ?? ({ "gas-giant": "gas", ocean: "water", "ice-world": "ice", lava: "magma", volcanic: "magma", terrestrial: "rocky", barren: "rocky" } as Record<string, WorldKind>)[str(v, 20).toLowerCase().replace(/\s+/g, "-")] ?? null;
const BANDS = { tiny: 0.15, small: 0.5, medium: 1, large: 1.6, massive: 2.4 } as const;

type Base = Pick<StarSystem, "options" | "backdrop" | "seed"> & Partial<Pick<StarSystem, "sector" | "bodies">>;
/**
 * Turns the AI's answer into a survey chart: unknown or missing fields get values that fit the world's kind and orbit,
 * names and text are cut to size, and ids and orbit phases are made here. Locked worlds and worlds with their own page
 * in `base` stay (replacing a drafted world of the same name). Throws when the answer has no worlds.
 */
export function readSystemDraft(input: Record<string, unknown> | undefined, base: Base, science: "realistic" | "pulp"): { system: StarSystem; name: string } {
  const classOf = (v: unknown) => { const c = str(v, 12).charAt(0).toUpperCase(); return (starClasses as readonly string[]).includes(c) ? c as StarClass : null; };
  const star: StarClass = classOf(input?.star) ?? "G";
  const companions = (Array.isArray(input?.companions) ? input.companions : []).flatMap(c => { const x = c as { star?: unknown; close?: unknown }, s = classOf(x?.star); return s ? [{ star: s, separation: x.close === true ? "close" as const : "wide" as const }] : []; }).slice(0, 2);
  const zs = zones({ star, companions }), seed = base.seed || "draft";
  const raw = (Array.isArray(input?.worlds) ? input.worlds : []).slice(0, 16) as Record<string, unknown>[];
  const kept = (base.bodies ?? []).filter(b => b.locked || b.pageId || b.moons.some(m => m.pageId));
  const used = new Set<string>(kept.flatMap(b => [b.id, ...b.moons.map(m => m.id)]));
  const make = (w: Record<string, unknown>, i: number, parent?: { id: string; name: string; au: number }): Moon | null => {
    const kind = kindOf(w?.kind), name = str(w?.name, 80);
    if (!kind || !name) return null;
    const r = galaxyRandom(`${seed}|${parent?.id ?? ""}|${name}|${i}`), giant = isGiant(kind);
    let id = `${parent ? `${parent.id}m` : "w"}${i}${Math.floor(r() * 46656).toString(36)}`;
    while (used.has(id)) id += "x";
    used.add(id);
    const au = parent ? parent.au : Math.min(100000, Math.max(0.005, num(w.au) ?? 0.4 * Math.sqrt(zs.L) * 1.7 ** i));
    const size = oneOf(sizes, w.size) ?? (giant ? "massive" : parent ? "small" : "medium");
    const air = oneOf(airs, w.air) ?? (giant ? "crushing" : kind === "water" || kind === "jungle" ? "standard" : kind === "toxic" ? "toxic" : size === "tiny" ? "none" : "thin");
    const t = num(w.temp), g = num(w.gravity);
    return {
      id, name, au: +au.toFixed(4), kind, type: str(w.type, 40) || worldTypes[kind][0], size,
      gravity: g !== null ? Math.round(Math.max(0, Math.min(50, g)) * 100) / 100 : giant ? 1.3 : BANDS[size],
      temp: t !== null ? Math.round(Math.max(-273, Math.min(10000, t))) : temperatureAt(zs.L, au, giant ? "none" : air),
      air, water: oneOf(waters, w.water) ?? (giant || kind === "magma" ? "none" : kind === "water" ? "ocean" : kind === "jungle" ? "abundant" : kind === "ice" ? "under-ice" : "trace"),
      resources: oneOf(resourceLevels, w.resources) ?? "moderate", hazard: str(w.hazard, 40) || "None",
      life: oneOf(lifeLevels, w.life) ?? "none", settled: oneOf(settlements, w.settled) ?? "nobody",
      day: str(w.day, 60) || (parent ? `Locked to ${parent.name}` : giant ? "10 hours" : "24 hours"),
      ...(w.rings === true && !parent ? { rings: true } : {}), poi: [], note: str(w.note, 4000), phase: +(r() * 6.28).toFixed(3),
    };
  };
  let bodies: SystemBody[] = raw.flatMap((w, i) => {
    const b = make(w, i);
    if (!b) return [];
    const moons = (Array.isArray(w.moons) ? w.moons : []).slice(0, 6).flatMap((m, k) => { const x = make(m as Record<string, unknown>, k, b); return x ? [x] : []; });
    return [{ ...b, moons }];
  });
  if (!bodies.length) throw Error("The AI sent no worlds. Try again, or name the system more plainly.");
  const keptNames = new Set(kept.map(b => b.name.toLowerCase()));
  bodies = [...bodies.filter(b => !keptNames.has(b.name.toLowerCase())), ...kept].sort((a, b) => a.au - b.au).slice(0, 16);
  const belts = (Array.isArray(input?.belts) ? input.belts : []).slice(0, 4).flatMap((b, i) => { const x = b as Record<string, unknown>, name = str(x?.name, 60), au = num(x?.au); return name && au !== null && au >= 0.005 ? [{ id: `belt${i}`, name, au: Math.min(100000, au) }] : []; });
  const hooks = hookKinds.flatMap(k => { const text = str(input?.[k], 400); return text ? [{ id: k, kind: k, text }] : []; });
  const name = str(input?.name, 160);
  const system: StarSystem = {
    star, companions, premise: str(input?.premise, 300), options: { ...base.options, science, count: Math.max(1, Math.min(12, bodies.length)) },
    backdrop: base.backdrop, seed, bodies, belts, hooks, ...(base.sector ? { sector: base.sector } : {}),
  };
  const checked = starSystemSchema.safeParse(system);
  if (!checked.success) throw Error("The AI's system didn't fit the survey chart. Try again.");
  return { system: checked.data, name };
}
