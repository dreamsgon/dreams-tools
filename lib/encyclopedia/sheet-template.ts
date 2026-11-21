import { readPack, type ContentPack } from "./content-pack.ts";

/**
 * Character sheet templates: a character template and the stats it uses, in one content file (rpg-tools-content,
 * the same format Export & import uses). The GM imports a ready-made one (D&D 5E below), a file someone shared, or one
 * an AI app wrote from templatePrompt(). authored-pack.ts fills in what a hand-written or AI-written file leaves out.
 * The guide page content/guide/Character-Sheet-Templates.md describes the same format for people and AI apps.
 */

export type TemplateRead = { ok: true; pack: ContentPack } | { ok: false; error: string };

/** Reads a pasted AI reply or a file's text: the JSON in it (chat and code fences around it are ignored), as a content pack with a template or stats. */
export function readTemplateText(reply: string): TemplateRead {
  const text = reply.trim();
  if (!text) return { ok: false, error: "Paste the reply from your AI app first, or choose a .json file." };
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { ok: false, error: "There’s no JSON in that. Ask the AI to reply with the JSON only, and copy all of it." };
  let raw: unknown;
  try { raw = JSON.parse(text.slice(start, end + 1)); }
  catch { return { ok: false, error: "That isn’t complete JSON. Copy the whole reply, including the last }, or ask the AI to reply with the JSON only." }; }
  if (raw && typeof raw === "object" && (raw as { format?: unknown }).format === "rpgtools-sheet") return { ok: false, error: "That’s one character’s sheet, not a template. Import it with Characters › Import sheet." };
  try {
    const pack = readPack(raw);
    if (!pack.templates?.length && !pack.stats?.length) return { ok: false, error: "That file has no template or stats in it." };
    return { ok: true, pack };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "That file could not be read." };
  }
}

/** The prompt to paste into an AI app, with the game it should make a sheet for. */
export function templatePrompt(system: string): string {
  const game = system.trim() || "the game I describe below";
  return `Make a character sheet template for RPG Tools (an online wiki and virtual tabletop) for this game: ${game}.

Reply with ONE JSON object and nothing else. Use only game terms and formulas: do not copy rules text or descriptions from any book; keep any "note" or "description" short and in your own words.

The JSON has two parts: "stats" (the numbers and boxes on the sheet, shared by every character in the campaign) and "templates" (one character template that uses them).

{
  "format": "rpg-tools-content", "version": 1,
  "stats": [ ...stats, in the order they appear on the sheet... ],
  "templates": [ { "name": "", "kind": "character", ... } ]
}

STATS. Each stat:
  "id": short, unique, lowercase letters, digits and - only (like "str" or "athletics")
  "label": the name on the sheet (unique; formulas use it)
  "section": the group it shows under, like "Abilities", "Skills", "Combat"
  "type": "number" | "text" | "checkbox" | "select" (give "options": [...]) | "textarea" | "none" (no value, only rolls)
  "visibility": "players" (default) or "gm"
Optional:
  "look": "score" shows a number as an ability score box (score and modifier), like D&D abilities. Use with "derived".
  "derived": a worked-out number shown beside the value, like "floor(({value}-10)/2)". For a score box it is the modifier.
  "save": true on a score box adds a saving throw under it.
  "quick": true puts the stat in the quick strip at the top of the sheet (AC, initiative, speed, proficiency).
  "rolls": up to 6 named rolls, like [{ "name": "Check", "formula": "1d20+{Athletics mod}" }].
  "note": a few words under the name (max 120 characters). "description": a short tooltip (max 2000).
Formulas: dice like 1d20, 2d6+3, 4d6kh3, 2d20kh1, 1d10! (exploding), 5d10>=8 (count successes), 4dF. Arithmetic + - * / ( ) and floor, ceil, round, min, max, abs.
  {value} is this stat's own value. {Label} is another stat's value. {Label mod} is the worked-out value of a stat that has "derived" (or a score box's modifier).
  A checkbox is 1 when ticked and 0 when not, so a skill can be a checkbox (proficient) with "derived": "{Strength mod}+{Proficiency bonus}*{value}" and a roll "1d20+{Athletics mod}".
  Only name stats that are in this file. Names in braces must match labels exactly.
Up to 100 stats.

TEMPLATE. One object:
  "name": like "D&D 5E character", "kind": "character"
  "fields": the info box beside the page, up to 30: [{ "label": "Alignment", "type": "choice", "options": ["Lawful good", "..."] }]
     field types: "text", "number", "textarea", "choice" (with options), "multi" (several choices, with options), "check" (yes/no),
     "score" (a score with its modifier), "track" (current / max, like 12/20), "url" (a web link). "visibility": "players" or "gm".
  "layout": { "facts": ["Player", "Class", "Level"] } short facts at the top of the character's Profile (up to 12).
  "trackers": gauges the player moves with - and +, up to 8: [{ "label": "Hit points", "max": 10, "shape": "bar", "colour": "red" }]
     shape "bar" or "pips" (pips up to 20). colour: green, blue, amber, purple or red. "value": where a new character starts
     (leave it out to start full; 0 for things like death saves). Each character sets their own max.
  "hiddenTabs": ready-made tabs this kind of character doesn't need, from "statblock", "stats", "features", "inventory", "spells".
  "tabs": extra page tabs, like [{ "title": "Backstory", "visibility": "players" }]
  "body": starting text for the page, in Markdown, like "## Background\\n\\n## Goals\\n"
  "stats": { "order": [stat ids in the order the sheet shows them] } (leave it out to use every stat in file order)

Characters, attacks, spells, items and features are NOT part of the template: each character adds their own on the sheet.
Leave out anything you aren't sure of rather than guessing a format.

A small example (a real sheet has more):
{
  "format": "rpg-tools-content", "version": 1,
  "stats": [
    { "id": "prof", "label": "Proficiency bonus", "section": "Core", "type": "number", "quick": true },
    { "id": "str", "label": "Strength", "section": "Abilities", "type": "number", "look": "score", "derived": "floor(({value}-10)/2)", "save": true },
    { "id": "athletics", "label": "Athletics", "section": "Skills", "type": "checkbox", "note": "Str", "derived": "{Strength mod}+{Proficiency bonus}*{value}", "rolls": [{ "name": "Check", "formula": "1d20+{Athletics mod}" }] }
  ],
  "templates": [
    { "name": "Hero", "kind": "character", "layout": { "facts": ["Player", "Class", "Level"] },
      "trackers": [{ "label": "Hit points", "max": 10, "shape": "bar", "colour": "red" }],
      "hiddenTabs": ["statblock"], "body": "## Background\\n" }
  ]
}`;
}

/* ---- Ready-made templates ---- */

const ABILITIES = [["str", "Strength"], ["dex", "Dexterity"], ["con", "Constitution"], ["int", "Intelligence"], ["wis", "Wisdom"], ["cha", "Charisma"]] as const;
const SKILLS: [string, string, typeof ABILITIES[number][0]][] = [
  ["acrobatics", "Acrobatics", "dex"], ["animal-handling", "Animal Handling", "wis"], ["arcana", "Arcana", "int"], ["athletics", "Athletics", "str"],
  ["deception", "Deception", "cha"], ["history", "History", "int"], ["insight", "Insight", "wis"], ["intimidation", "Intimidation", "cha"],
  ["investigation", "Investigation", "int"], ["medicine", "Medicine", "wis"], ["nature", "Nature", "int"], ["perception", "Perception", "wis"],
  ["performance", "Performance", "cha"], ["persuasion", "Persuasion", "cha"], ["religion", "Religion", "int"], ["sleight-of-hand", "Sleight of Hand", "dex"],
  ["stealth", "Stealth", "dex"], ["survival", "Survival", "wis"],
];
const abbr = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);
const abilityName = (id: string) => ABILITIES.find(a => a[0] === id)![1];

/** D&D 5th edition (2014 and 2024): names and formulas only, as a hand-written content file. */
export function dnd5eFile() {
  return {
    format: "rpg-tools-content", version: 1,
    from: { world: "RPG Tools ready-made templates" },
    stats: [
      { id: "prof", label: "Proficiency bonus", section: "Core", type: "number", quick: true, note: "+2 at levels 1 to 4" },
      { id: "ac", label: "Armor Class", section: "Core", type: "number", quick: true },
      { id: "init", label: "Initiative", section: "Core", type: "none", quick: true, derived: "{Dexterity mod}", rolls: [{ name: "Roll", formula: "1d20+{Initiative mod}" }] },
      { id: "speed", label: "Speed", section: "Core", type: "text", quick: true },
      { id: "passive-perception", label: "Passive Perception", section: "Core", type: "none", quick: true, derived: "10+{Perception mod}" },
      ...ABILITIES.map(([id, label]) => ({ id, label, section: "Abilities", type: "number", look: "score", derived: "floor(({value}-10)/2)", save: true, description: "Type a save bonus beside Save when proficient, or the modifier is used." })),
      ...SKILLS.map(([id, label, ab]) => ({ id, label, section: "Skills", type: "checkbox", note: abbr(ab), derived: `{${abilityName(ab)} mod}+{Proficiency bonus}*{value}`, rolls: [{ name: "Check", formula: `1d20+{${label} mod}` }], description: "Tick when proficient." })),
      { id: "spell-dc", label: "Spell save DC", section: "Spellcasting", type: "number" },
      { id: "spell-attack", label: "Spell attack bonus", section: "Spellcasting", type: "number", rolls: [{ name: "Attack", formula: "1d20+{value}" }] },
    ],
    templates: [{
      name: "D&D 5E character", kind: "character", icon: "shield",
      fields: [
        { label: "Alignment", type: "choice", options: ["Lawful good", "Neutral good", "Chaotic good", "Lawful neutral", "Neutral", "Chaotic neutral", "Lawful evil", "Neutral evil", "Chaotic evil", "Unaligned"] },
        { label: "Size", type: "choice", options: ["Tiny", "Small", "Medium", "Large"] },
        { label: "Experience points", type: "number" },
      ],
      layout: { facts: ["Player", "Species", "Class", "Subclass", "Level", "Background"] },
      trackers: [
        { label: "Hit points", max: 10, shape: "bar", colour: "red" },
        { label: "Temporary HP", max: 10, shape: "bar", colour: "blue", value: 0 },
        { label: "Hit dice", max: 1, shape: "pips", colour: "amber" },
        { label: "Death save successes", max: 3, shape: "pips", colour: "green", value: 0 },
        { label: "Death save failures", max: 3, shape: "pips", colour: "red", value: 0 },
        { label: "Heroic Inspiration", max: 1, shape: "pips", colour: "purple", value: 0 },
      ],
      hiddenTabs: ["statblock"],
      tabs: [{ title: "Backstory", visibility: "players" }],
      body: "## Appearance\n\n## Personality\n\n## Goals\n",
      overviewVisibility: "players",
    }],
  };
}

export type ReadyTemplate = { id: string; name: string; detail: string; file: () => unknown };
export const READY_TEMPLATES: ReadyTemplate[] = [
  { id: "dnd5e", name: "D&D 5E character", detail: "Abilities with saves, 18 skills, AC, initiative, HP, hit dice and death saves. Works for the 2014 and 2024 rules.", file: dnd5eFile },
];
