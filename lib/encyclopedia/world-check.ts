import { z } from "zod";

/**
 * Check with your AI: what a world map is sent to the GM's own AI to check, for scientific plausibility and for how
 * well it fits the campaign's pages (a galaxy, a star system, lore). The same words go to an API-key connection
 * (through RPG Tools' server, which reads the pages as that connection may see them) or into a prompt the GM copies
 * into their AI app. The answer comes back as findings, each with at most one change to a setting the GM can apply.
 */
export type WorldSettingId = "temp" | "rain" | "tilt" | "rotation" | "life" | "size" | "water" | "mountains" | "volcanism" | "climate" | "seaLevel";
type Info = { label: string; scale: string } & ({ min: number; max: number } | { choices: readonly string[] });
export const worldSettings: Record<WorldSettingId, Info> = {
  temp: { label: "Temperature", scale: "-3 frozen, -2 cold, -1 cool, 0 temperate, 1 warm, 2 hot, 3 scorching", min: -3, max: 3 },
  rain: { label: "Rain", scale: "0 arid to 100 soaked", min: 0, max: 100 },
  tilt: { label: "Axial tilt", scale: "degrees, 0 to 80", min: 0, max: 80 },
  rotation: { label: "Day and night", scale: "spin (days and nights) or locked (one face always to the star)", choices: ["spin", "locked"] },
  life: { label: "Life", scale: "none, simple (microbes, mats) or complex (plants and animals)", choices: ["none", "simple", "complex"] },
  size: { label: "Size", scale: "tiny 6,800 mi around, small 13,000, medium 24,900 (Earth), large 37,000", choices: ["tiny", "small", "medium", "large"] },
  water: { label: "Water", scale: "percent of the surface under sea, 0 to 100", min: 0, max: 100 },
  mountains: { label: "Mountains", scale: "0 none to 100 lots", min: 0, max: 100 },
  volcanism: { label: "Volcanoes", scale: "0 none to 100 lots", min: 0, max: 100 },
  climate: { label: "Climate", scale: "cold, temperate, warm, or mixed (cold north to warm south)", choices: ["cold", "temperate", "warm", "mixed"] },
  seaLevel: { label: "Sea level", scale: "percent of the map under sea, 20 to 80", min: 20, max: 80 },
};
const settingIds = Object.keys(worldSettings) as [WorldSettingId, ...WorldSettingId[]];
const id = z.string().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/);

export const worldCheckSchema = z.object({
  name: z.string().trim().min(1).max(160),
  /** What the map is: a whole planet, or a part of one such as a continent or kingdom (with its width). */
  what: z.string().max(200),
  settings: z.array(z.object({ id: z.enum(settingIds), value: z.union([z.number().finite(), z.string().max(20)]), words: z.string().max(60) })).max(12),
  /** A few lines about the map as made: land, ice, biomes, rivers and towns. */
  summary: z.array(z.string().max(240)).max(12),
  /** Campaign pages to check against, by id. */
  pages: z.array(id).max(8),
  /** What the GM wants the AI to keep in mind. */
  note: z.string().max(500).optional(),
});
export type WorldCheckRequest = z.infer<typeof worldCheckSchema>;
export type WorldCheckPage = { title: string; kind: string; text: string };
export type Fit = "fits" | "stretch" | "doesnt";
export type WorldChange = { setting: WorldSettingId; value: number | string };
export type WorldFinding = { title: string; fit: Fit; text: string; quote?: string; page?: string; change?: WorldChange };
export type WorldCheck = { verdict: Fit; findings: WorldFinding[] };

export const fitWords: Record<Fit, string> = { fits: "Fits", stretch: "A stretch", doesnt: "Doesn't fit" };

export const WORLD_SYSTEM = [
  "You check world maps for a tabletop roleplaying game master, for two things: whether the world is scientifically plausible, and whether it fits the campaign's own pages (a galaxy, a star system, a planet, lore).",
  "Think about climate bands, rain and how much sea feeds it, axial tilt and seasons, tidally locked worlds, the star, size and gravity, mountains and volcanoes, and whether the life fits all of that.",
  "Compare the world with what the pages say. When a page supports a point, quote a short line from it, word for word.",
  "Give 3 to 8 findings, most important first, and include what fits as well as what doesn't. Say Fits, A stretch or Doesn't fit for each, in plain words for a GM, not a physicist, in one to three sentences.",
  "A stretch can be a story hook: say so when it could be. Suggest a change only with the settings given and their allowed values; leave it out when a story reason is the better answer.",
].join(" ");

/** The value of a setting the AI suggested, made to fit that setting, or null when it doesn't. */
export function cleanChange(setting: unknown, value: unknown): WorldChange | null {
  if (typeof setting !== "string" || !(setting in worldSettings)) return null;
  const info = worldSettings[setting as WorldSettingId];
  if ("choices" in info) return typeof value === "string" && info.choices.includes(value.trim().toLowerCase()) ? { setting: setting as WorldSettingId, value: value.trim().toLowerCase() } : null;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[%°\s]/g, "")) : NaN;
  return Number.isFinite(n) ? { setting: setting as WorldSettingId, value: Math.round(Math.max(info.min, Math.min(info.max, n))) } : null;
}

const plain = (s: string) => s.replace(/\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/g, (_, page: string, label?: string) => (label || page).trim()).replace(/[#*_>`]/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
/** A page's text for the AI, cut to a length. */
export const pageText = (body: string, max = 2000) => { const t = plain(body ?? ""); return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t; };

/**
 * The request as the AI reads it. For an AI app (`forApp`), it also says how to answer, and that the app can read
 * the full pages itself when it is connected to RPG Tools.
 */
export function worldCheckPrompt(r: WorldCheckRequest, campaign: { name: string; description?: string }, pages: WorldCheckPage[], forApp = false): string {
  const settings = r.settings.map(s => `- ${worldSettings[s.id].label}: ${s.words} (${s.id} = ${s.value}; ${worldSettings[s.id].scale})`);
  return [
    ...(forApp ? ["Check this world map from my tabletop RPG campaign for scientific plausibility and for how well it fits my campaign's pages. Give 3 to 8 points, most important first, including what fits. For each, say Fits, A stretch or Doesn't fit, why in plain words, a short quote from a page if one backs it up, and one change to a setting below (with its new value) if a change would fix it.", ""] : []),
    `Campaign: ${campaign.name}${campaign.description ? `. ${pageText(campaign.description, 400)}` : ""}`,
    `World: ${r.name}, ${r.what}.`,
    "Settings:", ...settings,
    ...(r.summary.length ? ["The map as made:", ...r.summary.map(s => `- ${s}`)] : []),
    ...(r.note?.trim() ? [`What the GM wants: ${r.note.trim()}`] : []),
    ...(pages.length ? ["", "Campaign pages to check against:", ...pages.map(p => `### ${p.title} (${p.kind})\n${p.text || "(no text yet)"}`)] : ["", "No campaign pages were picked, so check plausibility only."]),
    ...(forApp && pages.length ? ["", `If you're connected to RPG Tools, you can read the whole of these pages with the read_page tool: ${pages.map(p => p.title).join(", ")}.`] : []),
  ].join("\n");
}

/** The AI's answer as a tool, so it comes back in a shape RPG Tools can show with Apply buttons. */
export function worldCheckTool(r: WorldCheckRequest) {
  const allowed = r.settings.map(s => s.id);
  return {
    name: "send_check", description: "Send the check: an overall verdict and the findings.",
    inputSchema: { type: "object", additionalProperties: false, required: ["verdict", "findings"], properties: {
      verdict: { type: "string", enum: ["fits", "stretch", "doesnt"], description: "fits: it all hangs together; stretch: mostly fits with things to look at; doesnt: something important doesn't fit." },
      findings: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "fit", "text"], properties: {
        title: { type: "string", description: "A few words, such as Climate bands or The Veiled Reach." },
        fit: { type: "string", enum: ["fits", "stretch", "doesnt"] },
        text: { type: "string", description: "One to three plain sentences." },
        quote: { type: "string", description: "A short line quoted word for word from a page, when one backs this up." },
        page: { type: "string", description: "The title of the page quoted." },
        ...(allowed.length ? { change: { type: "object", additionalProperties: false, required: ["setting", "value"], description: "One change that would fix it, if a change is the better answer.", properties: {
          setting: { type: "string", enum: allowed }, value: { type: ["number", "string"] },
        } } } : {}),
      } } },
    } },
  };
}

const fits = (v: unknown): Fit | null => v === "fits" || v === "stretch" || v === "doesnt" ? v : null;
const cut = (v: unknown, max: number) => typeof v === "string" && v.trim() ? plain(v).replace(/\s+/g, " ").slice(0, max) : undefined;
/** The findings the AI sent, cut to size, with changes only to the settings that were sent and only to allowed values. */
export function readWorldCheck(input: Record<string, unknown> | undefined, r: WorldCheckRequest): WorldCheck {
  const allowed = new Set(r.settings.map(s => s.id)), findings: WorldFinding[] = [];
  if (Array.isArray(input?.findings)) for (const x of input.findings.slice(0, 10)) {
    const f = x as Record<string, unknown>, title = cut(f?.title, 80), text = cut(f?.text, 600), fit = fits(f?.fit);
    if (!title || !text || !fit) continue;
    const c = f.change as Record<string, unknown> | undefined, change = c ? cleanChange(c.setting, c.value) : null;
    const quote = cut(f.quote, 240), page = cut(f.page, 160);
    findings.push({ title, fit, text, ...(quote ? { quote } : {}), ...(quote && page ? { page } : {}), ...(change && allowed.has(change.setting) && fit !== "fits" ? { change } : {}) });
  }
  const worst: Fit = findings.some(f => f.fit === "doesnt") ? "doesnt" : findings.some(f => f.fit === "stretch") ? "stretch" : "fits";
  return { verdict: fits(input?.verdict) ?? worst, findings };
}
