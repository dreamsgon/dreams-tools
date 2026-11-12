import { DEFAULT_ODDS, type RandomTable, type TableRow } from './tables.ts';

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
