/**
 * "Roll a hook": short, seeded story starters for places, hexes, dungeon rooms and star-system rumours.
 * A place gets a lure, some trouble and someone to meet (how they come across, what they want and what they
 * hide); a hex gets what is there and a twist; a room gets something to find and a twist; a system gets a
 * rumour and the truth behind it. The tables are this project's own. The same seed always gives the same hook.
 * Hooks are written into GM notes, so they are plain text, one idea per line.
 */
import { seeded } from "./encyclopedia/world-generator.ts";
import { givenName, nameStyles } from "./encyclopedia/relationship-generators.ts";

type Rng = () => number;
const pick = <T,>(r: Rng, list: readonly T[]): T => list[Math.floor(r() * list.length)];

export const hookPlaceKinds = ["city", "town", "village", "castle", "dungeon", "ruin", "landmark", "camp"] as const;
export type HookPlace = typeof hookPlaceKinds[number];
const settled = new Set<HookPlace>(["city", "town", "village", "castle"]);

const townLures = [
  "A reward is posted for whoever clears the road to the next town.",
  "Someone is buying old coins at twice their worth, no questions asked.",
  "A traveller left a locked chest at the inn and never came back for it.",
  "The well water turned red overnight, and the elders can't agree why.",
  "A wealthy family is hiring guards for a short, well-paid journey.",
  "A child swears there are lights in the hills where no one lives.",
  "A market stall sells maps of places nobody has heard of.",
  "A bell rings at midnight from a tower that has no bell.",
  "A famous duellist is in town, looking for a second.",
  "The harvest failed in one field only, and the owner wants to know why, quietly.",
  "A letter arrives addressed to one of the party, from someone long dead.",
  "The guild is paying well for a rare herb that only grows somewhere dangerous.",
] as const;
const townTroubles = [
  "Smugglers pay the watch to look the other way.",
  "Two families are one insult away from a feud.",
  "A sickness is spreading from the poorer streets.",
  "A new tax has people talking about rebellion.",
  "Someone is digging up graves at night.",
  "A beast has taken livestock three nights running.",
  "A preacher is stirring up fear of outsiders.",
  "The only bridge is failing, and no one will pay to fix it.",
  "Strangers in grey cloaks are asking about the party by name.",
  "Last week's fire was no accident.",
  "The ruler's heir has vanished, and the official story doesn't add up.",
  "Food is being hoarded, and prices rise every day.",
] as const;
const wildLures = [
  "Fresh tracks lead in, and none lead out.",
  "A carved door bears the crest of a family thought to be extinct.",
  "Locals say whoever spends a night here wakes with a gift.",
  "A half-burned journal describes a treasure room deeper in.",
  "Smoke rises from a place that should be empty.",
  "Old coins wash out of the ground after every rain.",
  "At dusk the same few notes of a song drift out of it.",
  "A missing scout's banner hangs at the entrance.",
  "The stones are warm to the touch, even in winter.",
  "A map in the nearest town marks this spot with a crown.",
  "A trader will pay for proof that anyone came back from it.",
  "Pilgrims leave offerings at its edge and never go further.",
] as const;
const wildDangers = [
  "The floor is weak, and the drop below is long.",
  "Something nests here and hunts at night.",
  "Rival treasure hunters got here a day earlier.",
  "A ward goes off when anyone speaks above a whisper.",
  "Bad air pools in the low places.",
  "The way in floods when it rains.",
  "The dead here do not rest easy.",
  "A guardian still follows orders given long ago.",
  "Bandits hide out here and pay the locals to keep quiet.",
  "Spores make sleepers dream of staying forever.",
  "It shifts: the way out is not where the way in was.",
  "A curse marks anyone who takes something without leaving something.",
] as const;
const townRoles = ["innkeeper", "ferry keeper", "tax collector", "midwife", "smith", "priest", "watch captain", "merchant", "street child", "retired adventurer", "herbalist", "magistrate", "scribe", "stable hand"] as const;
const castleRoles = ["steward", "knight", "chaplain", "jailer", "heir", "cook", "spymaster", "falconer", "herald", "master of arms"] as const;
const wildRoles = ["hermit", "scavenger", "lost pilgrim", "wounded scout", "cultist", "guide", "treasure hunter", "warden", "runaway", "trapper"] as const;
const manners = ["wary", "cheerful", "grieving", "ambitious", "nervous", "proud", "kindly", "bitter", "curious", "worn out", "sly", "devout", "blunt", "charming"] as const;
const wants = [
  "protect their family", "pay off a debt before it is called in", "get back a stolen heirloom", "learn the truth about a death",
  "clear their good name", "find a forbidden book", "see a lost love again", "follow an old map to its end", "buy their freedom",
  "expose a rival's secret", "get home safely", "keep the deed to their land", "avenge a friend", "leave this place for good",
  "prove they were right all along", "sell something they should not have",
] as const;
const secrets = [
  "is paid by a rival to watch strangers",
  "knows where the bodies are buried, and means it literally",
  "is not who they claim to be",
  "owes money to dangerous people",
  "once served the thing everyone here fears",
  "has the key everyone is looking for",
  "is ill and has told no one",
  "started the trouble by accident",
  "is writing to someone powerful about the party",
  "saw what really happened and is too scared to say",
] as const;

/** Someone to meet: a name, how they come across, their place in things, what they want and what they hide. */
function someone(r: Rng, roles: readonly string[]) {
  const name = givenName(r, pick(r, nameStyles)), manner = pick(r, manners);
  return `${name}, ${/^[aeiou]/.test(manner) ? "an" : "a"} ${manner} ${pick(r, roles)}, wants to ${pick(r, wants)}. Secretly ${pick(r, secrets)}.`;
}

/** A hook for a place on a world or area map, by its kind of place. Numbered pins with no kind are treated as towns. */
export function placeHook(kind: HookPlace | null | undefined, seed: string): string {
  const r = seeded(`place|${kind ?? "town"}|${seed}`), town = !kind || settled.has(kind);
  const roles = kind === "castle" ? castleRoles : town ? townRoles : wildRoles;
  return [
    `Lure: ${pick(r, town ? townLures : wildLures)}`,
    `Trouble: ${pick(r, town ? townTroubles : wildDangers)}`,
    `Someone: ${someone(r, roles)}`,
  ].join("\n");
}

const finds: Record<string, readonly string[]> = {
  forest: ["a ring of standing stones swallowed by roots", "a woodcutter's camp, left in the middle of a meal", "a hunting lodge with fresh blood on the steps", "a huge hollow tree that someone lives in", "trail marks carved in a script no one uses", "a clearing where no birds sing"],
  hills: ["a barrow with its capstone pushed aside", "a shepherd's hut that looks over the whole valley", "an old watchtower, its signal fire laid but never lit", "a mine boarded up from the inside", "a giant figure cut into the hillside", "a spring that is said to heal"],
  mountains: ["a shrine on the pass, with fresh offerings", "a frozen traveller holding a sealed letter", "the nest of something with a huge wingspan", "a stair cut into the cliff, climbing into cloud", "a small, collapsed door in the rock", "a caravan buried by an avalanche"],
  marsh: ["a village on stilts that trades in eels and secrets", "a sunken chapel whose bell rings by itself", "a drowned road of stone slabs", "pale lights that gather over one spot", "a hut built on a raft", "a half-sunk boat with its cargo still aboard"],
  dry: ["a dry well with something glinting at the bottom", "a nomad camp whose chief has fallen ill", "the bones of something enormous", "an oasis that isn't on any map", "a statue half buried in sand, pointing somewhere", "a caravan's tracks that simply stop"],
  cold: ["a hunter's cache dug into the snow", "a ship frozen into the ice", "a cave of blue ice with something inside", "a hot spring ringed by bones", "a stone cairn that someone keeps rebuilding", "a sled and its dogs, but no driver"],
  open: ["a burned farmstead", "a travelling market camped for the night", "an old battlefield, rusted weapons in the grass", "a gallows at a crossroads", "a lone inn with too many horses outside", "a circle of flattened grass that wasn't there yesterday"],
  water: ["a wreck just under the surface", "an island that isn't always there", "a fishing boat drifting with no one aboard", "a lighthouse that shines the wrong colour", "a reef where singing can be heard", "a floating chest, tied shut"],
};
const twists = [
  "but it is a trap",
  "but someone got here first",
  "and it is being watched",
  "and it is not what it seems",
  "and someone here needs help",
  "and it ties back to a place the party already knows",
  "and it is only there at night",
  "and it is different every time anyone comes back",
  "and a local will pay to keep it secret",
  "and it is worth more to someone else than to the party",
] as const;
const terrainGroup: Record<string, keyof typeof finds> = {
  forest: "forest", boreal: "forest", jungle: "forest", hills: "hills", mountains: "mountains", volcanic: "mountains", barren: "mountains",
  marsh: "marsh", desert: "dry", savanna: "dry", steppe: "dry", snow: "cold", tundra: "cold", glacier: "cold", seaice: "cold",
  grassland: "open", sea: "water", deep: "water",
};

/** What the party finds in a hex or square of an area map, from its terrain id (world map terrain ids). */
export function hexHook(terrainId: string | null | undefined, seed: string): string {
  const r = seeded(`hex|${terrainId ?? ""}|${seed}`), group = finds[terrainGroup[terrainId ?? ""] ?? "open"];
  const find = pick(r, group);
  return `Here: ${find[0].toUpperCase()}${find.slice(1)}, ${pick(r, twists)}.`;
}

const roomFinds = [
  "a prisoner who claims to be a guard",
  "a message scratched into the wall",
  "a hidden compartment under a loose stone",
  "a guard asleep at their post",
  "a trap that has already caught someone else",
  "a map of this place with one room missing",
  "a small creature that starts following the party",
  "the signs of a fight that ended minutes ago",
  "a locked box that ticks",
  "a mural that seems to show the party",
  "a voice calling from behind a wall",
  "fresh food laid out for someone expected soon",
] as const;
const roomTwists = [
  "The way they came in is now shut.",
  "Someone is watching through a spyhole.",
  "Moving anything here wakes something nearby.",
  "It is the key to a room further in.",
  "It is bait, and the owner is close.",
  "Nothing here is quite as old as it looks.",
  "The next room can hear everything said here.",
  "It was left here for the party on purpose.",
] as const;

/** Something to find in a dungeon room, and a twist. */
export function roomHook(seed: string): string {
  const r = seeded(`room|${seed}`), find = pick(r, roomFinds);
  return `Here: ${find[0].toUpperCase()}${find.slice(1)}. ${pick(r, roomTwists)}`;
}

const rumours = [
  "A derelict drifts here, still sending a distress call fifty years old.",
  "A cartel refuels here, off the books.",
  "The star flickers in a pattern, as if signalling.",
  "A colony here went silent last year.",
  "Survey drones sent here never come back.",
  "An ancient gate stands on the outermost moon.",
  "A fleet is hiding in the asteroid belt.",
  "It was taken off the official charts on purpose.",
  "Pirates pay a toll to someone here.",
  "A scientist fled here with stolen research.",
  "A world here is worth a fortune in rare ore, and someone has claimed it.",
  "Ships that jump in arrive a few hours late, every time.",
] as const;
const truths = [
  "It's true, but smaller than people say.",
  "It's true, and worse than people say.",
  "It's false, spread on purpose to keep people away.",
  "It's half true: the real story is stranger.",
  "It was true once; what's there now is something else.",
  "It's true, and someone the party knows is involved.",
] as const;

/** A rumour about a star system, and the truth behind it (GM only). */
export function rumourHook(seed: string): string {
  const r = seeded(`rumour|${seed}`);
  return `They say: ${pick(r, rumours)}\nTruth: ${pick(r, truths)}`;
}

/** Notes with a hook added on its own lines, or null when it would not fit in `max` characters. */
export function withHook(notes: string, hook: string, max: number): string | null {
  const before = notes.trimEnd(), next = before ? `${before}\n\n${hook}` : hook;
  return next.length > max ? null : next;
}
