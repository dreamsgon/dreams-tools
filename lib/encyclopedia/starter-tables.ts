import { DEFAULT_ODDS, type RandomTable, type TableLibrary, type TableRow } from './tables.ts';

/**
 * Starter tables written for RPG Tools. They are short, generic and original:
 * people paste or import tables from books they own into their own library.
 */
const ACTIONS = 'Abandon Bargain Betray Build Chase Conceal Corrupt Defend Defy Deliver Destroy Discover Divide Echo Escape Expose Follow Forgive Gather Guard Heal Hunt Imitate Inherit Investigate Journey Kindle Lead Linger Mend Mislead Mourn Negotiate Oppose Persuade Protect Pursue Reclaim Release Remember Repay Rescue Return Reveal Seize Separate Steal Summon Test Trade Transform Trust Unite Wake Warn Wither'.split(' ');
const SUBJECTS = ['a promise', 'an old debt', 'the road', 'a stranger', 'a rival', 'power', 'a secret', 'the dead', 'home', 'a weapon', 'faith', 'a map', 'the weather', 'an animal', 'wealth', 'a child', 'the law', 'a letter', 'a ruin', 'an illness', 'the past', 'a feast', 'a border', 'a bridge', 'hunger', 'a song', 'a crown', 'a door', 'the river', 'a mistake', 'a name', 'an heir', 'fire', 'a bargain', 'a ghost', 'a festival', 'a key', 'a reputation', 'a tower', 'an ally', 'the harvest', 'a curse', 'a portrait', 'the night', 'a ship', 'a tomb', 'a vow', 'the wild', 'a voice', 'a wound'];
const DESCRIPTORS = 'Abandoned Ancient Bitter Bright Broken Careful Cold Crowded Dark Delicate Dusty Elegant Empty Faded Fragile Gentle Gilded Grim Hidden Hollow Hungry Icy Loud Lonely Lost Lush Muddy Narrow Noisy Odd Ornate Overgrown Pale Peaceful Quiet Ragged Rotten Rough Rusty Sacred Shabby Sharp Silent Smoky Strange Sunken Tangled Tense Warm Watchful'.split(' ');
const THINGS = ['machinery', 'a garden', 'a statue', 'tools', 'a shrine', 'banners', 'a cellar', 'bones', 'books', 'a market', 'a well', 'armour', 'a cart', 'a camp', 'a mill', 'candles', 'a cage', 'coins', 'a forge', 'a gate', 'glass', 'a hall', 'an inn', 'jewellery', 'a kitchen', 'a lantern', 'a mask', 'nets', 'an orchard', 'paintings', 'a pool', 'rope', 'a sign', 'a stair', 'a tent', 'a throne', 'a tunnel', 'an altar', 'a wagon', 'a wall', 'weapons', 'wine', 'a workshop', 'a bell', 'a boat', 'a clock', 'a fountain', 'a grave', 'a mirror', 'a nest'];
const NAMES = 'Aldo Brenna Cassel Dagny Edrin Fenna Garet Hesk Ilse Joran Kessa Lorn Maeve Nils Orla Pell Quill Rhosyn Sefa Tamsin Ulric Vesna Wynn Yara Zev Bram Corra Doran Elsabet Fintan'.split(' ');

export function starterTables(makeId: () => string, now = new Date().toISOString()): RandomTable[] {
  const id = { oracle: makeId(), scene: makeId(), actions: makeId(), subjects: makeId(), descriptors: makeId(), things: makeId(), action: makeId(), describe: makeId(), complications: makeId(), weather: makeId(), names: makeId() };
  const list = (items: string[]): TableRow[] => items.map(text => ({ id: makeId(), text }));
  const ranges = (items: [number, number, string][]): TableRow[] => items.map(([min, max, text]) => ({ id: makeId(), text, min, ...(max !== min ? { max } : {}) }));
  const base = { campaignIds: null, updatedAt: now };
  return [
    { ...base, id: id.oracle, name: 'Yes or no oracle', category: 'oracle', kind: 'oracle', odds: DEFAULT_ODDS, twistTableId: id.action, description: 'Ask a yes or no question, pick the odds, and get Yes, No, and the “and” or “but” versions. Doubles at or under the tension bring a twist.' },
    { ...base, id: id.scene, name: 'Scene check', category: 'oracle', kind: 'table', mode: 'ranges', formula: 'd10', description: 'Does the next scene start the way you expect?',
      rows: ranges([[1, 6, 'As expected'], [7, 8, 'Altered: something is different. [[table:Descriptor and thing]]'], [9, 10, 'Interrupted: something else happens first. [[table:Action and subject]]']]) },
    { ...base, id: id.actions, name: 'Actions', category: 'meaning', kind: 'table', mode: 'weighted', rows: list(ACTIONS) },
    { ...base, id: id.subjects, name: 'Subjects', category: 'meaning', kind: 'table', mode: 'weighted', rows: list(SUBJECTS) },
    { ...base, id: id.descriptors, name: 'Descriptors', category: 'meaning', kind: 'table', mode: 'weighted', rows: list(DESCRIPTORS) },
    { ...base, id: id.things, name: 'Things', category: 'meaning', kind: 'table', mode: 'weighted', rows: list(THINGS) },
    { ...base, id: id.action, name: 'Action and subject', category: 'meaning', kind: 'pair', pair: [id.actions, id.subjects], description: 'Two words to spark an idea: what happens, and to what.' },
    { ...base, id: id.describe, name: 'Descriptor and thing', category: 'meaning', kind: 'pair', pair: [id.descriptors, id.things], description: 'Two words to describe a place, an object or a scene.' },
    { ...base, id: id.complications, name: 'Complications', category: 'complication', kind: 'table', mode: 'ranges', formula: 'd12',
      rows: ranges([[1, 1, 'An ally turns up at the worst moment'], [2, 2, 'Something important breaks'], [3, 3, 'Someone was watching'], [4, 4, 'The weather turns'], [5, 5, 'A rival gets there first'], [6, 6, 'It costs more than expected'], [7, 7, 'Someone is hurt or missing'], [8, 8, 'A rumour spreads'], [9, 9, 'The way back is cut off'], [10, 10, 'An old promise is called in'], [11, 11, 'A clue points the wrong way'], [12, 12, 'Roll twice: [[table:Complications]] and [[table:Complications]]']]) },
    { ...base, id: id.weather, name: 'Weather, temperate', category: 'weather', kind: 'table', mode: 'ranges', formula: '2d4',
      rows: ranges([[2, 2, 'Storm: travel is slow and dangerous'], [3, 3, 'Steady rain'], [4, 4, 'Overcast and cool'], [5, 5, 'Clear and mild'], [6, 6, 'Fog until midday, then clear'], [7, 7, 'Windy'], [8, 8, 'Unusually hot or cold for the season']]) },
    { ...base, id: id.names, name: 'Quick names', category: 'names', kind: 'table', mode: 'weighted', rows: list(NAMES) },
  ];
}

const DEMEANOURS = ['Guarded, with a dry sense of humour', 'Warm and talkative', 'Nervous, glancing at the door', 'Blunt and impatient', 'Polite but cold', 'Cheerful, a little too loud', 'Tired and distracted', 'Curious, asks a lot of questions', 'Proud and easily offended', 'Gentle and soft-spoken', 'Suspicious of strangers', 'Flattering, wants something', 'Grim and quiet', 'Playful, likes a joke', 'Formal and careful with words', 'Anxious to please', 'Bored, barely listening', 'Dreamy and absent-minded', 'Fierce and protective', 'Calm and hard to read'];
const WANT_VERBS = 'protect find escape repay prove win hide earn avenge forget reach keep rebuild expose leave serve undo learn defeat honour'.split(' ');
const WANT_NOUNS = ['a reputation', 'a lost sibling', 'an old debt', 'their family', 'a secret', 'a rival', 'their home', 'a fortune', 'a promise', 'the truth', 'a mentor', 'a crime', 'their freedom', 'a sacred place', 'a love', 'a title', 'the past', 'a stolen thing', 'their faith', 'a quiet life'];
const FOCUS = ['An old debt', 'A sick relative', 'A rival nearby', 'Tonight\u2019s work', 'A rumour they heard', 'A letter they can\u2019t read', 'Money, always money', 'Someone they are hiding', 'A festival coming up', 'A job that went wrong', 'The weather and the harvest', 'A strange dream'];
const QUIRKS = ['Counts coins when nervous', 'Hums the same tune', 'Never sits with their back to a door', 'Collects small bones', 'Speaks of themselves by name', 'Always eating something', 'Quotes a saint or a poet', 'Laughs at the wrong moments', 'Keeps a pet in a pocket', 'Taps a ring on every surface', 'Smells of smoke', 'Mispronounces names on purpose', 'Never finishes a sentence', 'Writes everything down', 'Swears by an odd god', 'Wears too many layers', 'Keeps glancing at the sky', 'Remembers every face', 'Whistles through a missing tooth', 'Cannot stand silence'];
const TOPICS = ['Their work and its troubles', 'A local scandal', 'The road and its dangers', 'Old wars and old heroes', 'Prices, taxes and thieves', 'Someone they miss', 'A warning about a place', 'The party\u2019s gear or looks', 'Gods, omens and luck', 'A favour they need'];

/** NPC generator starter: original tables rolled together. Uses an existing names table when given. */
export function npcStarterTables(makeId: () => string, now = new Date().toISOString(), namesTableId?: string): RandomTable[] {
  const id = { names: namesTableId ?? makeId(), demeanour: makeId(), verbs: makeId(), nouns: makeId(), wants: makeId(), power: makeId(), focus: makeId(), quirks: makeId(), reaction: makeId(), topic: makeId(), generator: makeId() };
  const list = (items: string[]): TableRow[] => items.map(text => ({ id: makeId(), text }));
  const ranges = (items: [number, number, string][]): TableRow[] => items.map(([min, max, text]) => ({ id: makeId(), text, min, ...(max !== min ? { max } : {}) }));
  const base = { campaignIds: null, updatedAt: now, category: 'npc' as const };
  const out: RandomTable[] = [
    { ...base, id: id.demeanour, name: 'NPC demeanour', kind: 'table', mode: 'weighted', rows: list(DEMEANOURS) },
    { ...base, id: id.verbs, name: 'NPC wants: verbs', kind: 'table', mode: 'weighted', rows: list(WANT_VERBS.map(v => `to ${v}`)) },
    { ...base, id: id.nouns, name: 'NPC wants: things', kind: 'table', mode: 'weighted', rows: list(WANT_NOUNS) },
    { ...base, id: id.wants, name: 'NPC wants', kind: 'pair', pair: [id.verbs, id.nouns], joiner: ' ' },
    { ...base, id: id.power, name: 'NPC power', kind: 'table', mode: 'ranges', formula: '2d6', description: 'How capable they are compared with the party.',
      rows: ranges([[2, 3, 'Much weaker than the party'], [4, 5, 'A little weaker than the party'], [6, 8, 'About as capable as the party'], [9, 10, 'A little stronger than the party'], [11, 12, 'Much stronger than the party']]) },
    { ...base, id: id.focus, name: 'NPC current focus', kind: 'table', mode: 'weighted', rows: list(FOCUS) },
    { ...base, id: id.quirks, name: 'NPC quirks', kind: 'table', mode: 'weighted', rows: list(QUIRKS) },
    { ...base, id: id.reaction, name: 'NPC reaction', kind: 'table', mode: 'ranges', formula: '2d6', description: 'Roll during a conversation to see how they take what was said.',
      rows: ranges([[2, 2, 'Hostile: they end the talk or turn on the party'], [3, 4, 'Colder: they close up'], [5, 6, 'A little warier'], [7, 7, 'Unchanged'], [8, 9, 'A little warmer'], [10, 11, 'Friendly: they offer something'], [12, 12, 'Won over: they will go out of their way to help']]) },
    { ...base, id: id.topic, name: 'NPC conversation topic', kind: 'table', mode: 'weighted', description: 'What they steer the talk toward.', rows: list(TOPICS) },
    { ...base, id: id.generator, name: 'NPC generator', kind: 'generator', description: 'Rolls a name, demeanour, wants, power, current focus and a quirk. Keep the lines you like and reroll the rest.',
      parts: [['Name', id.names], ['Demeanour', id.demeanour], ['Wants', id.wants], ['Power', id.power], ['Current focus', id.focus], ['Quirk', id.quirks]].map(([label, tableId]) => ({ id: makeId(), label, tableId })),
      extras: [['Reaction', id.reaction], ['Steers the talk toward', id.topic]].map(([label, tableId]) => ({ id: makeId(), label, tableId })) },
  ];
  if (!namesTableId) out.unshift({ ...base, id: id.names, name: 'Quick names', category: 'names', kind: 'table', mode: 'weighted', rows: list(NAMES) });
  return out;
}

/** Adds the starter sets a library doesn't have yet (checked by name), so starters can be added more than once safely. */
export function addMissingStarters(library: TableLibrary, makeId: () => string, now = new Date().toISOString()): { library: TableLibrary; added: number } {
  const has = (name: string) => library.tables.find(t => t.name.toLowerCase() === name.toLowerCase());
  let tables = library.tables;
  if (!has('Action and subject') && !has('Yes or no oracle')) tables = [...tables, ...starterTables(makeId, now).filter(t => !has(t.name))];
  if (!tables.some(t => t.name.toLowerCase() === 'npc generator')) {
    const names = tables.find(t => t.name.toLowerCase() === 'quick names' && t.kind === 'table');
    tables = [...tables, ...npcStarterTables(makeId, now, names?.id).filter(t => !tables.some(x => x.name.toLowerCase() === t.name.toLowerCase()))];
  }
  return { library: { ...library, tables }, added: tables.length - library.tables.length };
}
