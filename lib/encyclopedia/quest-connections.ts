/*
 * The pages a quest is connected to, worked out from the quest itself: who gave it, the reward, where it happens,
 * each goal's target and place, pages linked from its text, log and GM prep, pages that mention it, and pages the GM
 * linked by hand (`quest.linkIds`). One row per page, with every reason it is there.
 */
import { resolveLink, type Entry, type Workspace } from './world-model.ts';
import { mentionsOf } from './page-tree.ts';

export type ConnectionReason = { kind: 'giver' | 'reward' | 'place' | 'goal' | 'journal' | 'log' | 'prep' | 'mention' | 'added'; label: string };
export type ConnectionGroup = 'people' | 'places' | 'quests' | 'things';
export type Connection = { entry: Entry; group: ConnectionGroup; reasons: ConnectionReason[] };
export const connectionGroups: { id: ConnectionGroup; name: string }[] = [
  { id: 'people', name: 'People and organizations' }, { id: 'places', name: 'Places' }, { id: 'quests', name: 'Quests' }, { id: 'things', name: 'Things and pages' },
];
export const groupOf = (e: Entry): ConnectionGroup =>
  e.kind === 'character' || e.kind === 'faction' ? 'people' : e.kind === 'place' || e.kind === 'map' ? 'places' : e.kind === 'quest' ? 'quests' : 'things';

const LINK = /\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/g;
const order: ConnectionReason['kind'][] = ['giver', 'goal', 'place', 'reward', 'added', 'journal', 'log', 'mention', 'prep'];

/** Everything this quest page is connected to, people first, each group in the order the reasons matter. */
export function questConnections(s: Workspace, quest: Entry): Connection[] {
  const q = quest.quest;
  const found = new Map<string, ConnectionReason[]>();
  // Only pages the quest could link to: its campaign and the world's shared lore, never itself or a folder.
  const pages = new Map(s.entries.filter(e => e.id !== quest.id && e.kind !== 'folder' && e.worldId === quest.worldId && (e.campaignId === null || e.campaignId === quest.campaignId)).map(e => [e.id, e]));
  const add = (id: string | null | undefined, reason: ConnectionReason) => {
    if (!id || !pages.has(id)) return;
    const list = found.get(id) ?? [];
    if (!list.some(r => r.kind === reason.kind && r.label === reason.label)) list.push(reason);
    found.set(id, list);
  };
  const linksIn = (text: string | undefined, reason: ConnectionReason) => {
    for (const m of (text ?? '').matchAll(LINK)) if (!m[1].startsWith('maptable:')) add(resolveLink(s, quest, m[1].trim())?.id, reason);
  };
  if (q) {
    add(q.giverId, { kind: 'giver', label: 'Gave it' });
    q.objectives.forEach((o, i) => { add(o.targetId, { kind: 'goal', label: `Goal ${i + 1}` }); add(o.whereId, { kind: 'goal', label: `Goal ${i + 1}` }); });
    add(q.placeId, { kind: 'place', label: 'Where' });
    for (const id of q.rewardIds ?? []) add(id, { kind: 'reward', label: 'Reward' });
    for (const id of q.linkIds ?? []) add(id, { kind: 'added', label: 'Linked' });
    for (const l of q.log) linksIn(l.text, { kind: 'log', label: 'In the log' });
    linksIn(q.prep, { kind: 'prep', label: 'In GM prep' });
  }
  for (const text of [quest.body, ...(quest.tabs ?? []).map(t => t.body)]) linksIn(text, { kind: 'journal', label: 'In the journal' });
  for (const m of mentionsOf(s, quest)) add(m.entry.id, { kind: 'mention', label: 'Mentions it' });
  const groupRank = (g: ConnectionGroup) => connectionGroups.findIndex(x => x.id === g);
  const first = (c: Connection) => order.indexOf(c.reasons[0].kind);
  return [...found].map(([id, reasons]) => {
    const entry = pages.get(id)!;
    return { entry, group: groupOf(entry), reasons: reasons.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.label.localeCompare(b.label, undefined, { numeric: true })) };
  }).sort((a, b) => groupRank(a.group) - groupRank(b.group) || first(a) - first(b) || a.entry.title.localeCompare(b.entry.title));
}
