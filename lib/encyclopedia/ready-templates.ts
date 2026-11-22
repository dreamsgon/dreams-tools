/*
 * Ready-made character sheet templates (Templates › Import › Ready-made): one hand-written content file per game, in
 * the format sheet-template.ts describes. Game terms and formulas only, notes in our own words: no rules text.
 *
 * The d20 games with classes (D&D 5E, Pathfinder 2E, D&D 3.5E, Pathfinder 1E) also come as a gestalt character: two
 * class tracks taken side by side at every level. That version names both classes on the Profile, keeps spellcasting
 * for each side, and starts the page with a table of what each side took at each level.
 */

type Roll = { name: string; formula: string; success?: { op: "atLeast" | "atMost"; against: string } };
type Stat = { id: string; label: string; section: string; type: string; options?: string[]; quick?: boolean; look?: "score"; save?: boolean; derived?: string; rolls?: Roll[]; note?: string; description?: string; visibility?: "gm" | "players" };
type Tracker = { label: string; max: number; shape: "bar" | "pips"; colour: "green" | "blue" | "amber" | "purple" | "red"; value?: number };
type Field = { label: string; type: string; options?: string[]; visibility?: "gm" | "players" };
type Template = { name: string; kind: "character"; icon?: string; fields?: Field[]; layout: { facts: string[] }; trackers?: Tracker[]; hiddenTabs?: string[]; tabs?: { title: string; visibility: "gm" | "players" }[]; body: string; overviewVisibility: "players" };
export type ReadyOptions = { gestalt?: boolean };

const pack = (stats: Stat[], template: Template) => ({ format: "rpg-tools-content", version: 1, from: { world: "RPG Tools ready-made templates" }, stats, templates: [template] });
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ---- Shared pieces ---- */

const ABILITIES = [["str", "Strength"], ["dex", "Dexterity"], ["con", "Constitution"], ["int", "Intelligence"], ["wis", "Wisdom"], ["cha", "Charisma"]] as const;
type Ab = typeof ABILITIES[number][0];
const abilityName = (id: Ab) => ABILITIES.find(a => a[0] === id)![1];
const abbr = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);
const ALIGNMENTS = ["Lawful good", "Neutral good", "Chaotic good", "Lawful neutral", "Neutral", "Chaotic neutral", "Lawful evil", "Neutral evil", "Chaotic evil"];

/** Six abilities as d20 score boxes (score and modifier). */
const scoreAbilities = (save: boolean, description?: string): Stat[] => ABILITIES.map(([id, label]) => ({ id, label, section: "Abilities", type: "number", look: "score", derived: "floor(({value}-10)/2)", ...(save ? { save: true } : {}), ...(description ? { description } : {}) }));
/** A 3.5E / PF1E skill: ranks typed in, the ability modifier added, and a Check roll. */
const rankSkill = (label: string, ab: Ab): Stat => ({
  id: slug(label), label, section: "Skills", type: "number", note: abbr(ab),
  derived: `{value}+{${abilityName(ab)} mod}`, rolls: [{ name: "Check", formula: `1d20+{${label} mod}` }],
  description: "Type the ranks and any other bonus (0 when untrained); the ability modifier is added.",
});

/** The table a gestalt character's page starts with: what each side took at each level. */
const gestaltBody = (rule: string) => `## Gestalt\n${rule}\n\n| Level | Side A | Side B |\n|---|---|---|\n${Array.from({ length: 20 }, (_, i) => `| ${i + 1} | | |`).join("\n")}\n\n`;
/** Swaps a single class fact for one per side. */
const gestaltFacts = (facts: string[], swap: string[]) => facts.flatMap(f => swap.includes(f) ? [`${f} (side A)`, `${f} (side B)`] : [f]);
/** Doubles a set of spellcasting stats, one per side. */
const perSide = (stats: Stat[], gestalt: boolean): Stat[] => gestalt ? (["A", "B"] as const).flatMap(side => stats.map(s => ({ ...s, id: `${s.id}-${side.toLowerCase()}`, label: `${s.label} (side ${side})` }))) : stats;

/* ---- D&D 5th edition ---- */

const SKILLS_5E: [string, string, Ab][] = [
  ["acrobatics", "Acrobatics", "dex"], ["animal-handling", "Animal Handling", "wis"], ["arcana", "Arcana", "int"], ["athletics", "Athletics", "str"],
  ["deception", "Deception", "cha"], ["history", "History", "int"], ["insight", "Insight", "wis"], ["intimidation", "Intimidation", "cha"],
  ["investigation", "Investigation", "int"], ["medicine", "Medicine", "wis"], ["nature", "Nature", "int"], ["perception", "Perception", "wis"],
  ["performance", "Performance", "cha"], ["persuasion", "Persuasion", "cha"], ["religion", "Religion", "int"], ["sleight-of-hand", "Sleight of Hand", "dex"],
  ["stealth", "Stealth", "dex"], ["survival", "Survival", "wis"],
];

/** D&D 5th edition (2014 and 2024). */
export function dnd5eFile(o: ReadyOptions = {}) {
  const g = !!o.gestalt;
  return pack([
    { id: "prof", label: "Proficiency bonus", section: "Core", type: "number", quick: true, note: "+2 at levels 1 to 4" },
    { id: "ac", label: "Armor Class", section: "Core", type: "number", quick: true },
    { id: "init", label: "Initiative", section: "Core", type: "none", quick: true, derived: "{Dexterity mod}", rolls: [{ name: "Roll", formula: "1d20+{Initiative mod}" }] },
    { id: "speed", label: "Speed", section: "Core", type: "text", quick: true },
    { id: "passive-perception", label: "Passive Perception", section: "Core", type: "none", quick: true, derived: "10+{Perception mod}" },
    ...scoreAbilities(true, g ? "Type a save bonus beside Save when either side gives proficiency, or the modifier is used." : "Type a save bonus beside Save when proficient, or the modifier is used."),
    ...SKILLS_5E.map(([id, label, ab]) => ({ id, label, section: "Skills", type: "checkbox", note: abbr(ab), derived: `{${abilityName(ab)} mod}+{Proficiency bonus}*{value}`, rolls: [{ name: "Check", formula: `1d20+{${label} mod}` }], description: "Tick when proficient." })),
    ...perSide([
      { id: "spell-dc", label: "Spell save DC", section: "Spellcasting", type: "number" },
      { id: "spell-attack", label: "Spell attack bonus", section: "Spellcasting", type: "number", rolls: [{ name: "Attack", formula: "1d20+{value}" }] },
    ], g),
  ], {
    name: g ? "D&D 5E gestalt character" : "D&D 5E character", kind: "character", icon: "shield",
    fields: [
      { label: "Alignment", type: "choice", options: [...ALIGNMENTS, "Unaligned"] },
      { label: "Size", type: "choice", options: ["Tiny", "Small", "Medium", "Large"] },
      { label: "Experience points", type: "number" },
    ],
    layout: { facts: g ? gestaltFacts(["Player", "Species", "Class", "Subclass", "Level", "Background"], ["Class", "Subclass"]) : ["Player", "Species", "Class", "Subclass", "Level", "Background"] },
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
    body: (g ? gestaltBody("Every level is a level in both classes. Use the bigger hit die of the two, every saving throw and proficiency either side gives, and the features of both.") : "") + "## Appearance\n\n## Personality\n\n## Goals\n",
    overviewVisibility: "players",
  });
}

/* ---- Pathfinder 2nd edition ---- */

const RANK = "Proficiency bonus from rank: 0 untrained, 2 trained, 4 expert, 6 master, 8 legendary. Your level is added once trained.";
/** A PF2E proficiency: the rank bonus typed in, the attribute modifier and (once trained) the level added. */
const ranked = (id: string, label: string, section: string, attr: string | null, extra: Partial<Stat> = {}): Stat => ({
  id, label, section, type: "number", ...(attr ? { note: attr.slice(0, 3) } : {}),
  derived: `${attr ? `{${attr}}+` : ""}{value}+min(1,{value})*{Level}`, rolls: [{ name: "Check", formula: `1d20+{${label} mod}` }], description: RANK, ...extra,
});
const SKILLS_PF2E: [string, string][] = [
  ["Acrobatics", "Dexterity"], ["Arcana", "Intelligence"], ["Athletics", "Strength"], ["Crafting", "Intelligence"], ["Deception", "Charisma"],
  ["Diplomacy", "Charisma"], ["Intimidation", "Charisma"], ["Lore 1", "Intelligence"], ["Lore 2", "Intelligence"], ["Medicine", "Wisdom"],
  ["Nature", "Wisdom"], ["Occultism", "Intelligence"], ["Performance", "Charisma"], ["Religion", "Wisdom"], ["Society", "Intelligence"],
  ["Stealth", "Dexterity"], ["Survival", "Wisdom"], ["Thievery", "Dexterity"],
];

/** Pathfinder 2nd edition (the remaster's attribute modifiers; works for the original rules too). */
export function pf2eFile(o: ReadyOptions = {}) {
  const g = !!o.gestalt;
  const facts = ["Player", "Ancestry", "Heritage", "Background", "Class", "Key attribute"];
  return pack([
    { id: "level", label: "Level", section: "Core", type: "number", quick: true },
    { id: "ac", label: "Armor Class", section: "Core", type: "number", quick: true },
    ranked("perception", "Perception", "Core", "Wisdom", { quick: true }),
    { id: "init", label: "Initiative", section: "Core", type: "none", quick: true, derived: "{Perception mod}", rolls: [{ name: "Roll", formula: "1d20+{Initiative mod}" }], description: "Rolls Perception unless you use a skill instead." },
    { id: "speed", label: "Speed", section: "Core", type: "text", quick: true },
    { id: "class-dc", label: "Class DC", section: "Core", type: "number", quick: true },
    ...ABILITIES.map(([id, label]) => ({ id, label, section: "Attributes", type: "number", note: "modifier", rolls: [{ name: "Check", formula: "1d20+{value}" }], description: "The attribute modifier, like +4." })),
    ranked("fortitude", "Fortitude", "Saves", "Constitution"),
    ranked("reflex", "Reflex", "Saves", "Dexterity"),
    ranked("will", "Will", "Saves", "Wisdom"),
    ...SKILLS_PF2E.map(([label, attr]) => ranked(slug(label), label, "Skills", attr, label.startsWith("Lore") ? { description: `${RANK} Name the Lore in your notes.` } : {})),
    ranked("melee", "Melee strikes", "Strikes", "Strength", { rolls: [{ name: "Attack", formula: "1d20+{Melee strikes mod}" }] }),
    ranked("ranged", "Ranged strikes", "Strikes", "Dexterity", { rolls: [{ name: "Attack", formula: "1d20+{Ranged strikes mod}" }] }),
    ...perSide([
      { id: "spell-attack", label: "Spell attack", section: "Spellcasting", type: "number", rolls: [{ name: "Attack", formula: "1d20+{value}" }], description: "The whole bonus: attribute, rank and level." },
      { id: "spell-dc", label: "Spell DC", section: "Spellcasting", type: "number" },
      { id: "tradition", label: "Tradition", section: "Spellcasting", type: "select", options: ["Arcane", "Divine", "Occult", "Primal"] },
    ], g),
  ], {
    name: g ? "Pathfinder 2E gestalt character" : "Pathfinder 2E character", kind: "character", icon: "swords",
    fields: [
      { label: "Size", type: "choice", options: ["Tiny", "Small", "Medium", "Large"] },
      { label: "Deity", type: "text" },
      { label: "Languages", type: "text" },
      { label: "Experience points", type: "number" },
    ],
    layout: { facts: g ? gestaltFacts(facts, ["Class", "Key attribute"]) : facts },
    trackers: [
      { label: "Hit points", max: 20, shape: "bar", colour: "red" },
      { label: "Temporary HP", max: 10, shape: "bar", colour: "blue", value: 0 },
      { label: "Hero points", max: 3, shape: "pips", colour: "purple", value: 1 },
      { label: "Focus points", max: 1, shape: "pips", colour: "blue" },
      { label: "Dying", max: 4, shape: "pips", colour: "red", value: 0 },
      { label: "Wounded", max: 3, shape: "pips", colour: "amber", value: 0 },
    ],
    hiddenTabs: ["statblock"],
    tabs: [{ title: "Backstory", visibility: "players" }],
    body: (g ? gestaltBody("Every level is a level in both classes. Use the higher hit points per level of the two, the better proficiency rank either side gives, and the feats and features of both.") : "") + "## Appearance\n\n## Personality\n\n## Edicts and anathema\n",
    overviewVisibility: "players",
  });
}

/* ---- AD&D 2nd edition ---- */

/** Advanced Dungeons & Dragons 2nd edition. */
export function add2eFile() {
  const check: Roll = { name: "Check", formula: "1d20", success: { op: "atMost", against: "{value}" } };
  return pack([
    { id: "thac0", label: "THAC0", section: "Combat", type: "number", quick: true, rolls: [{ name: "Attack", formula: "1d20" }], description: "Hits an armor class of THAC0 minus the roll, or better." },
    { id: "ac", label: "Armor Class", section: "Combat", type: "number", quick: true, note: "lower is better" },
    { id: "movement", label: "Movement rate", section: "Combat", type: "number", quick: true },
    { id: "init", label: "Initiative modifier", section: "Combat", type: "number", quick: true, rolls: [{ name: "Initiative", formula: "1d10+{value}" }], note: "lowest acts first" },
    ...ABILITIES.map(([id, label]) => ({ id, label, section: "Abilities", type: "number", rolls: [check], description: "An ability check succeeds on the score or under." })),
    { id: "exceptional-str", label: "Exceptional strength", section: "Abilities", type: "text", note: "warriors with 18, like 18/76" },
    ...[["Paralyzation, poison or death magic", "ppd"], ["Rod, staff or wand", "rsw"], ["Petrification or polymorph", "pp"], ["Breath weapon", "bw"], ["Spell", "spell"]].map(([label, id]) => ({ id: `save-${id}`, label, section: "Saving throws", type: "number", rolls: [{ name: "Save", formula: "1d20", success: { op: "atLeast" as const, against: "{value}" } }], description: "Saves on this number or more." })),
    ...["Pick Pockets", "Open Locks", "Find/Remove Traps", "Move Silently", "Hide in Shadows", "Detect Noise", "Climb Walls", "Read Languages"].map(label => ({ id: slug(label), label, section: "Thief skills", type: "number", note: "%", rolls: [{ name: "Roll", formula: "1d100", success: { op: "atMost" as const, against: "{value}" } }] })),
    { id: "weapon-profs", label: "Weapon proficiencies", section: "Proficiencies", type: "textarea" },
    { id: "nonweapon-profs", label: "Nonweapon proficiencies", section: "Proficiencies", type: "textarea", description: "One per line, with the ability and modifier it checks against." },
  ], {
    name: "AD&D 2E character", kind: "character", icon: "scroll",
    fields: [
      { label: "Alignment", type: "choice", options: ALIGNMENTS },
      { label: "Experience points", type: "number" },
      { label: "Patron deity", type: "text" },
      { label: "Languages", type: "text" },
    ],
    layout: { facts: ["Player", "Race", "Class", "Level", "Kit"] },
    trackers: [{ label: "Hit points", max: 10, shape: "bar", colour: "red" }],
    hiddenTabs: ["statblock"],
    tabs: [{ title: "Backstory", visibility: "players" }],
    body: "## Appearance\n\n## Personality\n\n## Henchmen and followers\n",
    overviewVisibility: "players",
  });
}

/* ---- D&D 3.5 and Pathfinder 1E ---- */

const KNOWLEDGE_35 = ["Arcana", "Architecture and Engineering", "Dungeoneering", "Geography", "History", "Local", "Nature", "Nobility and Royalty", "Religion", "The Planes"];
const SKILLS_35: [string, Ab][] = [
  ["Appraise", "int"], ["Balance", "dex"], ["Bluff", "cha"], ["Climb", "str"], ["Concentration", "con"], ["Craft", "int"], ["Decipher Script", "int"],
  ["Diplomacy", "cha"], ["Disable Device", "int"], ["Disguise", "cha"], ["Escape Artist", "dex"], ["Forgery", "int"], ["Gather Information", "cha"],
  ["Handle Animal", "cha"], ["Heal", "wis"], ["Hide", "dex"], ["Intimidate", "cha"], ["Jump", "str"], ...KNOWLEDGE_35.map(k => [`Knowledge (${k})`, "int"] as [string, Ab]),
  ["Listen", "wis"], ["Move Silently", "dex"], ["Open Lock", "dex"], ["Perform", "cha"], ["Profession", "wis"], ["Ride", "dex"], ["Search", "int"],
  ["Sense Motive", "wis"], ["Sleight of Hand", "dex"], ["Spellcraft", "int"], ["Spot", "wis"], ["Survival", "wis"], ["Swim", "str"], ["Tumble", "dex"],
  ["Use Magic Device", "cha"], ["Use Rope", "dex"],
];
const KNOWLEDGE_PF1 = ["Arcana", "Dungeoneering", "Engineering", "Geography", "History", "Local", "Nature", "Nobility", "Planes", "Religion"];
const SKILLS_PF1: [string, Ab][] = [
  ["Acrobatics", "dex"], ["Appraise", "int"], ["Bluff", "cha"], ["Climb", "str"], ["Craft", "int"], ["Diplomacy", "cha"], ["Disable Device", "dex"],
  ["Disguise", "cha"], ["Escape Artist", "dex"], ["Fly", "dex"], ["Handle Animal", "cha"], ["Heal", "wis"], ["Intimidate", "cha"],
  ...KNOWLEDGE_PF1.map(k => [`Knowledge (${k})`, "int"] as [string, Ab]), ["Linguistics", "int"], ["Perception", "wis"], ["Perform", "cha"],
  ["Profession", "wis"], ["Ride", "dex"], ["Sense Motive", "wis"], ["Sleight of Hand", "dex"], ["Spellcraft", "int"], ["Stealth", "dex"],
  ["Survival", "wis"], ["Swim", "str"], ["Use Magic Device", "cha"],
];
const SAVES: [string, string][] = [["Fortitude", "Constitution"], ["Reflex", "Dexterity"], ["Will", "Wisdom"]];

function d20File(o: ReadyOptions, game: "3.5" | "pf1") {
  const g = !!o.gestalt, pf = game === "pf1";
  const best = g ? " For gestalt, the better of the two sides." : "";
  const name = pf ? "Pathfinder 1E" : "D&D 3.5E";
  const facts = ["Player", "Race", "Class", "Level"];
  return pack([
    { id: "ac", label: "Armor Class", section: "Core", type: "number", quick: true },
    { id: "touch-ac", label: "Touch AC", section: "Core", type: "number", quick: true },
    { id: "flat-ac", label: "Flat-footed AC", section: "Core", type: "number", quick: true },
    { id: "init", label: "Initiative", section: "Core", type: "none", quick: true, derived: "{Dexterity mod}", rolls: [{ name: "Roll", formula: "1d20+{Initiative mod}" }] },
    { id: "speed", label: "Speed", section: "Core", type: "text", quick: true },
    ...scoreAbilities(false),
    ...SAVES.map(([label, ab]) => ({ id: slug(label), label, section: "Saves", type: "number", note: ab.slice(0, 3), derived: `{value}+{${ab} mod}`, rolls: [{ name: "Save", formula: `1d20+{${label} mod}` }], description: `Type the base save and any other bonus; the ${ab} modifier is added.${best}` })),
    { id: "bab", label: "Base attack bonus", section: "Combat", type: "number", quick: true, description: `The first number, like 6 for +6/+1.${best}` },
    { id: "melee", label: "Melee attack", section: "Combat", type: "none", derived: "{Base attack bonus}+{Strength mod}", rolls: [{ name: "Attack", formula: "1d20+{Melee attack mod}" }] },
    { id: "ranged", label: "Ranged attack", section: "Combat", type: "none", derived: "{Base attack bonus}+{Dexterity mod}", rolls: [{ name: "Attack", formula: "1d20+{Ranged attack mod}" }] },
    ...(pf ? [
      { id: "cmb", label: "CMB", section: "Combat", type: "none", derived: "{Base attack bonus}+{Strength mod}", rolls: [{ name: "Maneuver", formula: "1d20+{CMB mod}" }], description: "Size modifier not included." },
      { id: "cmd", label: "CMD", section: "Combat", type: "none", derived: "10+{Base attack bonus}+{Strength mod}+{Dexterity mod}", description: "Size modifier not included." },
    ] : [
      { id: "grapple", label: "Grapple", section: "Combat", type: "none", derived: "{Base attack bonus}+{Strength mod}", rolls: [{ name: "Grapple", formula: "1d20+{Grapple mod}" }], description: "Size modifier not included." },
    ]),
    ...(pf ? SKILLS_PF1 : SKILLS_35).map(([label, ab]) => rankSkill(label, ab)),
    ...perSide([{ id: "caster-level", label: "Caster level", section: "Spellcasting", type: "number", rolls: [{ name: "Caster level check", formula: "1d20+{value}" }] }], g),
  ], {
    name: `${name} ${g ? "gestalt " : ""}character`, kind: "character", icon: pf ? "crown" : "axe",
    fields: [
      { label: "Alignment", type: "choice", options: ALIGNMENTS },
      { label: "Size", type: "choice", options: ["Tiny", "Small", "Medium", "Large", "Huge"] },
      { label: "Deity", type: "text" },
      { label: "Languages", type: "text" },
      { label: "Experience points", type: "number" },
    ],
    layout: { facts: g ? gestaltFacts(facts, ["Class"]) : facts },
    trackers: [
      { label: "Hit points", max: 10, shape: "bar", colour: "red" },
      { label: "Temporary HP", max: 10, shape: "bar", colour: "blue", value: 0 },
      { label: "Nonlethal damage", max: 10, shape: "bar", colour: "amber", value: 0 },
    ],
    hiddenTabs: ["statblock"],
    tabs: [{ title: "Backstory", visibility: "players" }],
    body: (g ? gestaltBody(`Every level is a level in both classes. Take the better hit die, base attack bonus and each save of the two sides, ${pf ? "skill ranks from the side that gives more, class skills from both" : "skill points from the side that gives more, class skills from both"}, and every class feature of both.`) : "") + "## Appearance\n\n## Personality\n\n## Goals\n",
    overviewVisibility: "players",
  });
}
/** D&D 3.5 edition. */
export const dnd35File = (o: ReadyOptions = {}) => d20File(o, "3.5");
/** Pathfinder 1st edition. */
export const pf1eFile = (o: ReadyOptions = {}) => d20File(o, "pf1");

/* ---- Masks: A New Generation ---- */

/** Masks: labels rolled with 2d6, conditions, Potential. */
export function masksFile() {
  const conditions: [string, string][] = [["Afraid", "−2 to directly engage a threat"], ["Angry", "−2 to comfort or support, or to pierce the mask"], ["Guilty", "−2 to provoke someone or assess the situation"], ["Hopeless", "−2 to unleash your powers"], ["Insecure", "−2 to defend someone or reject influence"]];
  return pack([
    ...["Danger", "Freak", "Savior", "Superior", "Mundane"].map(label => ({ id: slug(label), label, section: "Labels", type: "number", note: "−2 to +3", rolls: [{ name: "Roll", formula: "2d6+{value}" }], description: "10 or more: full hit. 7 to 9: a hit with a cost." })),
    ...conditions.map(([label, note]) => ({ id: slug(label), label, section: "Conditions", type: "checkbox", note })),
  ], {
    name: "Masks character", kind: "character", icon: "mask",
    fields: [
      { label: "Playbook", type: "choice", options: ["The Beacon", "The Bull", "The Delinquent", "The Doomed", "The Janus", "The Legacy", "The Nova", "The Outsider", "The Protégé", "The Transformed", "Other"] },
      { label: "Real name", type: "text" },
      { label: "Hero name", type: "text" },
    ],
    layout: { facts: ["Player", "Playbook", "Hero name", "Real name"] },
    trackers: [{ label: "Potential", max: 5, shape: "pips", colour: "purple", value: 0 }],
    hiddenTabs: ["statblock", "inventory", "spells"],
    tabs: [{ title: "Backstory", visibility: "players" }],
    body: "## Look\n\n## Abilities\n\n## Influence\nWho has Influence over me:\n- \n\n## Relationships\n- \n\n## Moment of Truth\n",
    overviewVisibility: "players",
  });
}

/* ---- City of Mist ---- */

const THEMEBOOKS = ["Adaptation", "Bastion", "Divination", "Expression", "Mobility", "Relic", "Subversion", "Defining Event", "Defining Relationship", "Mission", "Personality", "Possessions", "Routine", "Training"];
/** City of Mist: four themes with their tags, Attention and Fade or Crack. */
export function cityOfMistFile() {
  return pack([
    { id: "power", label: "Power", section: "Moves", type: "number", note: "power tags minus weakness tags", rolls: [{ name: "Roll", formula: "2d6+{value}" }], description: "10 or more: full success. 7 to 9: partial success." },
    { id: "build-up", label: "Build-up", section: "Moves", type: "number", note: "moments of evolution" },
    { id: "statuses", label: "Statuses", section: "Moves", type: "textarea", description: "One per line, with its tier, like hurt-2." },
    ...[1, 2, 3, 4].flatMap(n => [
      { id: `theme-${n}`, label: `Theme ${n}`, section: `Theme ${n}`, type: "text", note: "title" },
      { id: `theme-${n}-book`, label: `Theme ${n} themebook`, section: `Theme ${n}`, type: "select", options: THEMEBOOKS, description: "Adaptation to Subversion are Mythos themes; the rest are Logos." },
      { id: `theme-${n}-question`, label: `Theme ${n} mystery or identity`, section: `Theme ${n}`, type: "text" },
      { id: `theme-${n}-power`, label: `Theme ${n} power tags`, section: `Theme ${n}`, type: "textarea" },
      { id: `theme-${n}-weakness`, label: `Theme ${n} weakness tag`, section: `Theme ${n}`, type: "text" },
    ]),
  ], {
    name: "City of Mist character", kind: "character", icon: "building",
    fields: [{ label: "Crew", type: "text" }],
    layout: { facts: ["Player", "Mythos", "Logos"] },
    trackers: [1, 2, 3, 4].flatMap(n => [
      { label: `Theme ${n} Attention`, max: 3, shape: "pips" as const, colour: "green" as const, value: 0 },
      { label: `Theme ${n} Fade or Crack`, max: 3, shape: "pips" as const, colour: "red" as const, value: 0 },
    ]),
    hiddenTabs: ["statblock", "inventory", "spells"],
    tabs: [{ title: "Backstory", visibility: "players" }],
    body: "## Mythos\nThe legend awakened in me.\n\n## Logos\nWho I am in the City.\n\n## Story tags\n- \n\n## Clues and juice\n- \n",
    overviewVisibility: "players",
  });
}

/* ---- Daggerheart ---- */

/** Daggerheart: six traits rolled with the Duality dice, Evasion, armor and damage thresholds, HP, Stress and Hope. */
export function daggerheartFile() {
  const traits: [string, string][] = [["Agility", "sprint, leap, maneuver"], ["Strength", "lift, smash, grapple"], ["Finesse", "control, hide, tinker"], ["Instinct", "perceive, sense, navigate"], ["Presence", "charm, perform, deceive"], ["Knowledge", "recall, analyze, comprehend"]];
  return pack([
    { id: "evasion", label: "Evasion", section: "Defense", type: "number", quick: true },
    { id: "armor-score", label: "Armor score", section: "Defense", type: "number", quick: true },
    { id: "major", label: "Major threshold", section: "Defense", type: "number", quick: true, description: "Damage at or above this marks 2 HP." },
    { id: "severe", label: "Severe threshold", section: "Defense", type: "number", quick: true, description: "Damage at or above this marks 3 HP." },
    { id: "proficiency", label: "Proficiency", section: "Defense", type: "number", quick: true, note: "damage dice rolled" },
    ...traits.map(([label, note]) => ({ id: slug(label), label, section: "Traits", type: "number", note, rolls: [{ name: "Duality roll", formula: "1d12+1d12+{value}" }], description: "Roll Hope and Fear (2d12); the higher die says which." })),
    { id: "spellcast", label: "Spellcast trait", section: "Traits", type: "select", options: traits.map(t => t[0]) },
    { id: "experiences", label: "Experiences", section: "Experiences", type: "textarea", description: "One per line, with its bonus, like Sailor +2." },
  ], {
    name: "Daggerheart character", kind: "character", icon: "sparkles",
    fields: [
      { label: "Domains", type: "multi", options: ["Arcana", "Blade", "Bone", "Codex", "Grace", "Midnight", "Sage", "Splendor", "Valor"] },
      { label: "Community", type: "choice", options: ["Highborne", "Loreborne", "Orderborne", "Ridgeborne", "Seaborne", "Slyborne", "Underborne", "Wanderborne", "Wildborne"] },
      { label: "Pronouns", type: "text" },
    ],
    layout: { facts: ["Player", "Class", "Subclass", "Ancestry", "Community", "Level"] },
    trackers: [
      { label: "Hit points", max: 6, shape: "pips", colour: "red" },
      { label: "Stress", max: 6, shape: "pips", colour: "purple", value: 0 },
      { label: "Hope", max: 6, shape: "pips", colour: "amber", value: 2 },
      { label: "Armor slots", max: 3, shape: "pips", colour: "blue" },
    ],
    hiddenTabs: ["statblock"],
    tabs: [{ title: "Backstory", visibility: "players" }],
    body: "## Appearance\n\n## Background questions\n\n## Connections\n",
    overviewVisibility: "players",
  });
}

export type ReadyTemplate = { id: string; name: string; detail: string; file: (o?: ReadyOptions) => unknown; /** Also comes as a gestalt character (two classes side by side). */ gestalt?: boolean };
export const READY_TEMPLATES: ReadyTemplate[] = [
  { id: "dnd5e", name: "D&D 5E character", detail: "Abilities with saves, 18 skills, AC, initiative, HP, hit dice and death saves. Works for the 2014 and 2024 rules.", file: dnd5eFile, gestalt: true },
  { id: "pf2e", name: "Pathfinder 2E character", detail: "Attribute modifiers, proficiency ranks that add your level, saves, 16 skills and two Lores, strikes, spellcasting, HP, Hero Points, dying and wounded.", file: pf2eFile, gestalt: true },
  { id: "add2e", name: "AD&D 2E character", detail: "Abilities rolled under, THAC0, descending AC, five saving throws, thief skills as percentages, proficiencies and HP.", file: add2eFile },
  { id: "dnd35", name: "D&D 3.5E character", detail: "Ability scores, Fortitude, Reflex and Will, base attack, melee, ranged and grapple, 44 skills by ranks, caster level and HP.", file: dnd35File, gestalt: true },
  { id: "pf1e", name: "Pathfinder 1E character", detail: "Ability scores, saves, base attack, CMB and CMD, 35 skills by ranks, caster level, HP and nonlethal damage.", file: pf1eFile, gestalt: true },
  { id: "masks", name: "Masks character", detail: "The five Labels rolled with 2d6, the five Conditions, Potential, playbook, and Influence and Relationships on the page.", file: masksFile },
  { id: "city-of-mist", name: "City of Mist character", detail: "Four themes with themebook, power and weakness tags, Attention and Fade or Crack for each, Power rolls, Build-up and statuses.", file: cityOfMistFile },
  { id: "daggerheart", name: "Daggerheart character", detail: "Six traits with Duality rolls, Evasion, armor and damage thresholds, Proficiency, Experiences, HP, Stress, Hope and armor slots.", file: daggerheartFile },
];
