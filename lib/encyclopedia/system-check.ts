import { z } from "zod";
import { starInfo } from "./sectors.ts";
import { airs, allWorlds, formatAU, lifeLevels, parentOf, resourceLevels, settlements, sizes, starPhysics, waters, word, worldKindNames, yearLength, zoneOf, zones, type StarSystem, type World } from "./star-systems.ts";
import { pageText, type Fit, type WorldCheckPage } from "./world-check.ts";

/**
 * Check with your AI for star systems: the survey chart in words, sent to the GM's own AI to check for scientific
 * plausibility and for how well it fits the campaign's pages (the galaxy, the sector, organizations, lore). Same shape
 * as the world map check in `world-check.ts`: an API-key connection checks it through RPG Tools' server, or the GM
 * copies the prompt into their AI app. Each finding can carry one change to one field of one world, which the GM applies.
 */
export type SystemField = "temp" | "gravity" | "size" | "air" | "water" | "life" | "resources" | "settled";
type Info = { label: string; scale: string } & ({ min: number; max: number; step: number } | { choices: readonly string[] });
export const systemFields: Record<SystemField, Info> = {
  temp: { label: "Temperature", scale: "°C at the surface (cloud tops for giants), -273 to 3000", min: -273, max: 3000, step: 1 },
  gravity: { label: "Gravity", scale: "in g, Earth = 1, 0 to 50", min: 0, max: 50, step: 0.01 },
  size: { label: "Size", scale: sizes.join(", "), choices: sizes },
  air: { label: "Air", scale: airs.join(", "), choices: airs },
  water: { label: "Water", scale: waters.join(", "), choices: waters },
  life: { label: "Life", scale: lifeLevels.join(", "), choices: lifeLevels },
  resources: { label: "Resources", scale: resourceLevels.join(", "), choices: resourceLevels },
  settled: { label: "Settled", scale: settlements.join(", "), choices: settlements },
};
const fieldIds = Object.keys(systemFields) as [SystemField, ...SystemField[]];
const id = z.string().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/);
const worldId = z.string().regex(/^[A-Za-z0-9_-]{1,60}$/);

export const systemCheckSchema = z.object({
  name: z.string().trim().min(1).max(160),
  /** The star, its companions and its zones, in words. */
  star: z.string().max(400),
  science: z.enum(["realistic", "pulp"]),
  era: z.string().max(40),
  premise: z.string().max(300),
  /** One line per world and moon, out from the star. */
  worlds: z.array(z.object({ id: worldId, line: z.string().max(700) })).max(220),
  belts: z.array(z.string().max(120)).max(4),
  /** The lure and the danger. The GM-only secret is never sent. */
  hooks: z.array(z.string().max(420)).max(2),
  /** Campaign pages to check against, by id. */
  pages: z.array(id).max(8),
  note: z.string().max(500).optional(),
});
export type SystemCheckRequest = z.infer<typeof systemCheckSchema>;
export type SystemChange = { world: string; field: SystemField; value: number | string };
export type SystemFinding = { title: string; fit: Fit; text: string; quote?: string; page?: string; change?: SystemChange };
export type SystemCheck = { verdict: Fit; findings: SystemFinding[] };

const oneLine = (s: string, max: number) => { const t = s.replace(/\s+/g, " ").trim(); return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t; };
/** A world as one line for the AI. */
export function worldCheckLine(s: StarSystem, w: World, holder?: string, notes = true): string {
  const parent = parentOf(s, w.id), zone = zoneOf(w.au, zones(s));
  const bits = [
    `${w.type} ${worldKindNames[w.kind].toLowerCase()}${parent ? `, a moon of ${parent.name}` : ""}`,
    `${word(w.size).toLowerCase()} size`, `${formatAU(w.au)} AU (${zone} zone, year ${yearLength(w.au, s.star)})`, `${w.temp} °C`, `${w.gravity} g`,
    `air ${w.air}`, `water ${w.water}`, `life ${w.life}`, `resources ${w.resources}`, `settled ${w.settled}`,
    ...(w.day ? [`day ${w.day}`] : []), ...(w.hazard ? [`hazard ${w.hazard}`] : []), ...("rings" in w && w.rings ? ["rings"] : []),
    ...(holder ? [`held by ${holder}`] : []), ...(w.real ? ["real data"] : []),
  ];
  return oneLine(`${w.name} [${w.id}]: ${bits.join(", ")}.${notes && w.note.trim() ? ` Notes: ${pageText(w.note, 240)}` : ""}`, 700);
}
/** Every world and moon as a line, out from the star; notes are left out when they would make the request too long. */
function worldLines(s: StarSystem, holderName: (id?: string) => string | undefined) {
  const all = allWorlds(s).sort((a, b) => a.au - b.au), lines = (notes: boolean) => all.map(w => ({ id: w.id, line: worldCheckLine(s, w, holderName(w.holderId), notes) }));
  const size = (l: { line: string }[]) => l.reduce((n, x) => n + x.line.length, 0);
  const full = lines(true);
  if (size(full) <= 24_000) return full;
  const out: { id: string; line: string }[] = [];
  let n = 0;
  for (const x of lines(false)) { if (n + x.line.length > 40_000) break; out.push(x); n += x.line.length; }
  return out;
}
/** The survey chart as a request, without the pages and note the GM picks. */
export function systemCheckRequest(s: StarSystem, name: string, holderName: (id?: string) => string | undefined = () => undefined): Omit<SystemCheckRequest, "pages" | "note"> {
  const z = zones(s), p = starPhysics[s.star];
  const companions = s.companions.map(c => `a class ${c.star} ${starInfo[c.star].colour.toLowerCase()} companion ${c.separation === "close" ? "in a close pair" : "far out"}`);
  const star = `Class ${s.star} ${starInfo[s.star].colour.toLowerCase()} star, ${p.L} times the Sun's light and ${p.M} times its mass${companions.length ? `, with ${companions.join(" and ")}` : ""}. Green zone ${formatAU(z.hzIn)} to ${formatAU(z.hzOut)} AU, frost line ${formatAU(z.frost)} AU.`;
  return {
    name: name.trim().slice(0, 160) || "Star system", star, science: s.options.science, era: s.options.era, premise: s.premise,
    worlds: worldLines(s, holderName),
    belts: s.belts.map(b => oneLine(`${b.name}, ${formatAU(b.au)} AU`, 120)),
    hooks: s.hooks.filter(h => h.kind !== "secret" && h.text.trim()).map(h => oneLine(`${h.kind === "lure" ? "Lure" : "Danger"}: ${h.text}`, 420)),
  };
}

export const SYSTEM_SYSTEM = [
  "You check star systems for a tabletop roleplaying game master, for two things: whether the system is scientifically plausible, and whether it fits the campaign's own pages (a galaxy, a sector, organizations, lore).",
  "Think about the star's light and the green zone, where giants and ice worlds form past the frost line, temperatures for each world's distance and air, gravity for its size and kind, whether water and air can last, tidal locking close in, moons, and whether the life fits all of that.",
  "When the system uses Pulp science, the GM wants adventure over realism: point out only what breaks the setting's own logic, and say what is a fun stretch.",
  "Compare the system with what the pages say. When a page supports a point, quote a short line from it, word for word.",
  "Give 3 to 8 findings, most important first, and include what fits as well as what doesn't. Say Fits, A stretch or Doesn't fit for each, in plain words for a GM, not a physicist, in one to three sentences.",
  "A stretch can be a story hook: say so when it could be. Suggest a change only to one field of one world, by the world's id in brackets, with the allowed values; leave it out when a story reason is the better answer.",
].join(" ");

/** The request as the AI reads it. For an AI app (`forApp`), it also says how to answer. */
export function systemCheckPrompt(r: SystemCheckRequest, campaign: { name: string; description?: string }, pages: WorldCheckPage[], forApp = false): string {
  return [
    ...(forApp ? ["Check this star system from my tabletop RPG campaign for scientific plausibility and for how well it fits my campaign's pages. Give 3 to 8 points, most important first, including what fits. For each, say Fits, A stretch or Doesn't fit, why in plain words, a short quote from a page if one backs it up, and one change to one world's field (from the fields below, with its new value) if a change would fix it.", ""] : []),
    `Campaign: ${campaign.name}${campaign.description ? `. ${pageText(campaign.description, 400)}` : ""}`,
    `Star system: ${r.name}. ${r.star}`,
    `Science: ${r.science === "pulp" ? "Pulp (adventure first, rules bend)" : "Realistic"}. Era: ${word(r.era)}.${r.premise.trim() ? ` Premise: ${r.premise.trim()}` : ""}`,
    "", "Worlds and moons, out from the star (id in brackets):", ...(r.worlds.length ? r.worlds.map(w => `- ${w.line}`) : ["- None yet."]),
    ...(r.belts.length ? ["Belts:", ...r.belts.map(b => `- ${b}`)] : []),
    ...(r.hooks.length ? ["Hooks:", ...r.hooks.map(h => `- ${h}`)] : []),
    "", "Fields a change can set:", ...fieldIds.map(f => `- ${f}: ${systemFields[f].scale}`),
    ...(r.note?.trim() ? ["", `What the GM wants: ${r.note.trim()}`] : []),
    ...(pages.length ? ["", "Campaign pages to check against:", ...pages.map(p => `### ${p.title} (${p.kind})\n${p.text || "(no text yet)"}`)] : ["", "No campaign pages were picked, so check plausibility only."]),
    ...(forApp && pages.length ? ["", `If you're connected to RPG Tools, you can read the whole of these pages with the read_page tool: ${pages.map(p => p.title).join(", ")}.`] : []),
  ].join("\n");
}

/** The AI's answer as a tool, so it comes back in a shape RPG Tools can show with Apply buttons. */
export function systemCheckTool(r: SystemCheckRequest) {
  const ids = r.worlds.map(w => w.id);
  return {
    name: "send_check", description: "Send the check: an overall verdict and the findings.",
    inputSchema: { type: "object", additionalProperties: false, required: ["verdict", "findings"], properties: {
      verdict: { type: "string", enum: ["fits", "stretch", "doesnt"], description: "fits: it all hangs together; stretch: mostly fits with things to look at; doesnt: something important doesn't fit." },
      findings: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "fit", "text"], properties: {
        title: { type: "string", description: "A few words, such as The green zone or Kel-III's oceans." },
        fit: { type: "string", enum: ["fits", "stretch", "doesnt"] },
        text: { type: "string", description: "One to three plain sentences." },
        quote: { type: "string", description: "A short line quoted word for word from a page, when one backs this up." },
        page: { type: "string", description: "The title of the page quoted." },
        ...(ids.length ? { change: { type: "object", additionalProperties: false, required: ["world", "field", "value"], description: "One change that would fix it, if a change is the better answer.", properties: {
          world: { type: "string", enum: ids, description: "The world's id from the brackets." },
          field: { type: "string", enum: fieldIds }, value: { type: ["number", "string"] },
        } } } : {}),
      } } },
    } },
  };
}

/** A change the AI suggested, made to fit the field, or null when it doesn't. */
export function cleanSystemChange(world: unknown, field: unknown, value: unknown, worlds: ReadonlySet<string>): SystemChange | null {
  if (typeof world !== "string" || !worlds.has(world) || typeof field !== "string" || !(field in systemFields)) return null;
  const info = systemFields[field as SystemField];
  if ("choices" in info) {
    const v = typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, "-") : "";
    return info.choices.includes(v) ? { world, field: field as SystemField, value: v } : null;
  }
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[°cg\s,]/gi, "")) : NaN;
  if (!Number.isFinite(n)) return null;
  const clamped = Math.max(info.min, Math.min(info.max, n));
  return { world, field: field as SystemField, value: info.step === 1 ? Math.round(clamped) : Math.round(clamped * 100) / 100 };
}

const fits = (v: unknown): Fit | null => v === "fits" || v === "stretch" || v === "doesnt" ? v : null;
const plain = (s: string) => pageText(s, 100_000);
const cut = (v: unknown, max: number) => typeof v === "string" && v.trim() ? plain(v).replace(/\s+/g, " ").slice(0, max) : undefined;
/** The findings the AI sent, cut to size, with changes only to worlds that were sent and only to allowed values. */
export function readSystemCheck(input: Record<string, unknown> | undefined, r: SystemCheckRequest): SystemCheck {
  const worlds = new Set(r.worlds.map(w => w.id)), findings: SystemFinding[] = [];
  if (Array.isArray(input?.findings)) for (const x of input.findings.slice(0, 10)) {
    const f = x as Record<string, unknown>, title = cut(f?.title, 80), text = cut(f?.text, 600), fit = fits(f?.fit);
    if (!title || !text || !fit) continue;
    const c = f.change as Record<string, unknown> | undefined, change = c && typeof c === "object" ? cleanSystemChange(c.world, c.field, c.value, worlds) : null;
    const quote = cut(f.quote, 240), page = cut(f.page, 160);
    findings.push({ title, fit, text, ...(quote ? { quote } : {}), ...(quote && page ? { page } : {}), ...(change && fit !== "fits" ? { change } : {}) });
  }
  const worst: Fit = findings.some(f => f.fit === "doesnt") ? "doesnt" : findings.some(f => f.fit === "stretch") ? "stretch" : "fits";
  return { verdict: fits(input?.verdict) ?? worst, findings };
}
