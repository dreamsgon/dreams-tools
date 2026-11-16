/*
 * Starter layouts for a campaign's sheet, one for each common way of rolling. They are empty structures: generic stat
 * names, groups and rolls with no values and no rulebook text, for the GM to rename and fill in. Adding a layout only
 * adds stats; a stat whose name is already on the sheet is left as it is. Notes never name another stat, since renaming
 * one updates the rolls that name it but not free text.
 */
import type { StatField } from './world-model.ts';
import type { StatRoll } from './stat-rolls.ts';

type Stat = { label: string; section: string; type: StatField['type']; note?: string; derived?: string; rolls: StatRoll[] };
export type StatLayout = { id: string; name: string; about: string; example: string; stats: Stat[] };

const mod = 'floor(({value}-10)/2)';
const ability = (label: string): Stat => ({ label, section: 'Abilities', type: 'number', derived: mod, rolls: [{ name: 'Check', formula: `1d20+{${label} mod}` }] });
const skill20 = (label: string, from: string): Stat => ({ label, section: 'Skills', type: 'checkbox', note: 'Tick when trained', rolls: [{ name: 'Check', formula: `1d20+{${from} mod+Training bonus*value}` }] });
const pool = (label: string, section: string, from?: string): Stat => ({ label, section, type: 'number', rolls: [{ name: 'Pool', formula: from ? `{value+${from}}d6>=5` : '{value}d6>=5' }] });
const under = (label: string, section: string): Stat => ({ label, section, type: 'number', rolls: [{ name: 'Roll', formula: '1d100', success: { op: 'atMost', against: '{value}' } }, { name: 'Hard', formula: '1d100', success: { op: 'atMost', against: '{floor(value/2)}' } }] });
const stat2d6 = (label: string): Stat => ({ label, section: 'Stats', type: 'number', rolls: [{ name: 'Roll', formula: '2d6+{value}' }] });
const move = (label: string, from: string): Stat => ({ label, section: 'Moves', type: 'none', rolls: [{ name: 'Roll', formula: `2d6+{${from}}` }] });

export const STAT_LAYOUTS: StatLayout[] = [
  {
    id: 'd20', name: 'd20 + modifier', about: 'Roll a d20, add a modifier worked out from a score, and beat a number.', example: '1d20+3',
    stats: [ability('Might'), ability('Agility'), ability('Wits'), ability('Presence'),
      { label: 'Training bonus', section: 'Training', type: 'number', rolls: [] },
      skill20('Climbing', 'Might'), skill20('Sneaking', 'Agility'), skill20('Noticing', 'Wits'), skill20('Persuading', 'Presence'),
      { label: 'Defence', section: 'Combat', type: 'number', rolls: [] },
      { label: 'Initiative', section: 'Combat', type: 'none', rolls: [{ name: 'Roll', formula: '1d20+{Agility mod}' }] }],
  },
  {
    id: 'pool', name: 'Dice pool', about: 'Roll a handful of d6, one for each point. Every 5 or 6 counts as a success.', example: '5d6>=5',
    stats: [pool('Body', 'Attributes'), pool('Mind', 'Attributes'), pool('Spirit', 'Attributes'),
      pool('Fighting', 'Skills', 'Body'), pool('Sneaking', 'Skills', 'Body'), pool('Knowing', 'Skills', 'Mind'), pool('Talking', 'Skills', 'Spirit')],
  },
  {
    id: 'd100', name: 'Roll under d100', about: 'Roll percentile dice. At or under the number succeeds; under half of it is a hard success.', example: '1d100 ≤ 45',
    stats: [under('Body', 'Characteristics'), under('Agility', 'Characteristics'), under('Mind', 'Characteristics'), under('Will', 'Characteristics'),
      under('Searching', 'Skills'), under('Persuading', 'Skills'), under('Dodging', 'Skills'), under('First aid', 'Skills')],
  },
  {
    id: '2d6', name: '2d6 + stat', about: 'Roll 2d6 and add a small stat, usually −1 to +3. Moves roll with the stat they name.', example: '2d6+2',
    stats: [stat2d6('Force'), stat2d6('Finesse'), stat2d6('Insight'), stat2d6('Charm'), move('Push through', 'Force'), move('Read the room', 'Insight')],
  },
];

/** The layout's stats added after the sheet's own, skipping names already on it (case aside). */
export function addLayout(fields: StatField[], layout: StatLayout, newId: () => string): { fields: StatField[]; added: number; skipped: string[] } {
  const taken = new Set(fields.filter(f => !f.archived).map(f => f.label.trim().toLowerCase())), skipped: string[] = [], add: StatField[] = [];
  for (const s of layout.stats) {
    if (taken.has(s.label.toLowerCase())) { skipped.push(s.label); continue; }
    taken.add(s.label.toLowerCase());
    add.push({ id: newId(), label: s.label, section: s.section, type: s.type, options: [], visibility: 'players', archived: false, ...(s.note ? { note: s.note } : {}), ...(s.derived ? { derived: s.derived } : {}), rolls: s.rolls.map(r => ({ ...r })) });
  }
  return { fields: [...fields, ...add], added: add.length, skipped };
}
