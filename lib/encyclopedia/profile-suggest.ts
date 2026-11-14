import { orgTypeList } from "./org-profile.ts";

/*
 * Suggest buttons on profiles: a random fitting choice from our own short lists (never published text). A button only fills
 * what is empty, or what an earlier press filled and the GM hasn't touched, so it never overwrites anything they typed, and
 * pressing it again gives another choice. Everything here is pure; `rng` makes it testable.
 */

export type Rng = () => number;

/** A trait is a word or two; each fits within the 30 characters a trait label allows. */
export const traitSuggestions = [
  "Shrewd", "Proud", "Warm-hearted", "Suspicious", "Patient", "Reckless", "Soft-spoken", "Stubborn", "Generous", "Superstitious",
  "Quick-witted", "Weary", "Loyal to a fault", "Sharp-tongued", "Curious", "Haunted", "Cheerful", "Cautious", "Ambitious", "Gentle",
  "Hot-tempered", "Frugal", "Dreamy", "Dutiful", "Restless", "Vain", "Honest", "Secretive", "Fond of a wager", "Slow to trust",
];

/** Topics for a belief with stances that fit each. Short phrases of our own, written to suit any setting. */
export const beliefSuggestions: { topic: string; stances: string[] }[] = [
  { topic: "Authority", stances: ["Earned by service", "Comes from the old families", "Only the people may grant it", "A burden, not a prize"] },
  { topic: "Outsiders", stances: ["Welcome, once they have paid their way", "Watched closely", "Welcome at the table, never at the helm", "Bringers of change, for better or worse"] },
  { topic: "Coin", stances: ["Honest trade keeps the peace", "A tool, never a master", "Never enough", "Owed to the community first"] },
  { topic: "Tradition", stances: ["Kept to the letter", "Kept in spirit, bent in practice", "Dead weight", "The only thing that has never failed us"] },
  { topic: "The law", stances: ["Binding on everyone, even the strong", "Bends for those who can afford it", "A suggestion on the far road", "Written by the winners"] },
  { topic: "Magic", stances: ["A craft like any other", "Dangerous and best left alone", "A gift owed to others", "Feared, and quietly used"] },
  { topic: "Loyalty", stances: ["Given once and kept", "To the crew before the crown", "Bought and sold", "Owed to whoever feeds you"] },
  { topic: "The past", stances: ["A debt to repay", "Best buried", "A map to follow", "Told differently by every family"] },
  { topic: "Faith", stances: ["Practised in private", "The glue of the community", "A comfort for the weak", "Proved by deeds, not prayers"] },
  { topic: "Secrets", stances: ["Kept for the good of all", "A currency", "Always come out in the end", "Nobody’s business"] },
];
const genericStances = ["Keeps it close", "Open about it", "Divided on it", "Changing its mind"];

/** What a Suggest button last filled in, so a second press may replace it. */
export type Last = { topic?: string; stance?: string; label?: string; type?: string };

const norm = (t: string | undefined) => (t ?? "").trim().toLowerCase();
const same = (a: string | undefined, b: string | undefined) => !!b && norm(a) === norm(b);

/** A random item, avoiding `not` (so pressing again changes it) when there is any other choice. */
export function pickAnother<T extends string>(list: readonly T[], not: readonly string[] = [], rng: Rng = Math.random): T | undefined {
  const avoid = new Set(not.map(norm));
  const fresh = list.filter(x => !avoid.has(norm(x)));
  const from = fresh.length ? fresh : list;
  return from.length ? from[Math.min(from.length - 1, Math.floor(rng() * from.length))] : undefined;
}

/** Whether a value may be filled: empty, or still exactly what the last press put there. */
export const fillable = (value: string | undefined, last: string | undefined) => !norm(value) || same(value, last);

/** An organization type for an empty Type: one of the offered kinds, plus the world's own. */
export function suggestOrgType(current: string | undefined, last: Last | undefined, own: readonly string[] = [], rng: Rng = Math.random): string | null {
  if (!fillable(current, last?.type)) return null;
  return pickAnother([...orgTypeList, ...own], [current ?? "", last?.type ?? ""], rng) ?? null;
}

/** A trait for an empty label, not one the character already has. */
export function suggestTrait(current: string | undefined, last: Last | undefined, have: readonly string[] = [], rng: Rng = Math.random): string | null {
  if (!fillable(current, last?.label)) return null;
  return pickAnother(traitSuggestions, [...have, current ?? "", last?.label ?? ""], rng) ?? null;
}

/**
 * What a belief's empty fields may take: an empty topic gets a topic (not one already used) and, if the stance is empty too,
 * a stance that fits it; a topic with an empty stance gets a stance that fits that topic (any generic one for a topic of
 * their own). Returns the fields to set, or null when nothing is fillable.
 */
export function suggestBelief(belief: { topic: string; stance: string }, last: Last | undefined, used: readonly string[] = [], rng: Rng = Math.random): { topic?: string; stance?: string } | null {
  const topicFree = fillable(belief.topic, last?.topic), stanceFree = fillable(belief.stance, last?.stance);
  if (!topicFree && !stanceFree) return null;
  const out: { topic?: string; stance?: string } = {};
  let topic = belief.topic;
  if (topicFree) {
    const t = pickAnother(beliefSuggestions.map(x => x.topic), [...used, belief.topic, last?.topic ?? ""], rng);
    if (!t) return null;
    out.topic = topic = t;
  }
  if (stanceFree) {
    const stances = beliefSuggestions.find(x => same(x.topic, topic))?.stances ?? genericStances;
    const s = pickAnother(stances, [belief.stance, last?.stance ?? ""], rng);
    if (s) out.stance = s;
  }
  return out.topic !== undefined || out.stance !== undefined ? out : null;
}
