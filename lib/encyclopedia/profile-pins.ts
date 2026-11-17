import type { CellSize, ProfilePin } from './character-profile.ts';
import type { PlayerFeature } from './features.ts';
import type { PlayerItem, PlayerSpell } from './items.ts';
import type { StatRow } from './stat-rolls.ts';

/*
 * Quick find on a character's Profile tab: things the GM pins from the Statblock, Stats & Skills, Inventory, Spells and Features tabs, so
 * the profile works as a summary. A pin stores only what it points at; the value is always read from its tab. Players
 * get a pin only when they already get the thing it points at (a shared tab, not marked GM only). Statblock lines are
 * GM only. Everything here is pure.
 */

export type PinKind = ProfilePin['kind'];
export const pinKindNames: Record<PinKind, string> = { stat: 'Stats & Skills', item: 'Inventory', spell: 'Spells', statblock: 'Statblock', feature: 'Features' };

/** The reference a statblock line is pinned by: its text, trimmed, up to 300 characters. */
export const lineRef = (line: string) => line.trim().slice(0, 300);
/** The statblock's lines that can be pinned: every line with text after the name line. */
export const statblockLines = (text: string | undefined): string[] => (text ?? '').replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean).slice(1);
/** The statblock line a pin points at, or undefined when it has been edited away. */
export const pinnedLine = (text: string | undefined, ref: string) => (text ?? '').replace(/\r/g, '').split('\n').find(l => l.trim() && lineRef(l) === ref)?.trim();

export const isPinned = (pins: readonly ProfilePin[] | undefined, kind: PinKind, ref: string) => !!pins?.some(p => p.kind === kind && p.ref === ref);

/** Pins it when it isn't pinned, unpins it when it is. Returns the list unchanged when full. */
export function togglePin(pins: readonly ProfilePin[] | undefined, kind: PinKind, ref: string, max: number, newId: () => string): ProfilePin[] {
  const list = pins ?? [];
  if (isPinned(list, kind, ref)) return list.filter(p => !(p.kind === kind && p.ref === ref));
  return list.length >= max ? [...list] : [...list, { id: newId(), kind, ref }];
}

/** Moves a pin one place earlier (-1) or later (1). */
export function movePin(pins: readonly ProfilePin[], id: string, dir: -1 | 1): ProfilePin[] {
  const out = [...pins], at = out.findIndex(p => p.id === id), to = at + dir;
  if (at < 0 || to < 0 || to >= out.length) return out;
  [out[at], out[to]] = [out[to], out[at]];
  return out;
}

export type PlayerPin = { id: string; size?: CellSize } & ({ kind: 'stat'; stat: StatRow } | { kind: 'item'; item: PlayerItem } | { kind: 'spell'; spell: PlayerSpell } | { kind: 'feature'; feature: PlayerFeature });

/** Sets a pin's width; S is the default and isn't stored. */
export const sizePin = (pins: readonly ProfilePin[], id: string, size: CellSize): ProfilePin[] => pins.map(p => { if (p.id !== id) return p; const { size: _s, ...rest } = p; void _s; return size === 's' ? rest : { ...rest, size }; });

/**
 * The pins players may see, in order, built only from the player copies of the stats, items and spells (already left
 * out when their tab isn't shared or they are GM only). Statblock pins and pins whose target players don't get are dropped.
 */
export function playerPins(pins: readonly ProfilePin[] | undefined, shown: { stats?: readonly StatRow[]; items?: readonly PlayerItem[]; spells?: readonly PlayerSpell[]; features?: readonly PlayerFeature[] }): PlayerPin[] {
  const out: PlayerPin[] = [];
  for (const p of pins ?? []) {
    const head = { id: p.id, ...(p.size ? { size: p.size } : {}) };
    if (p.kind === 'stat') { const stat = shown.stats?.find(x => x.id === p.ref); if (stat) out.push({ ...head, kind: 'stat', stat }); }
    else if (p.kind === 'item') { const item = shown.items?.find(x => x.id === p.ref); if (item) out.push({ ...head, kind: 'item', item }); }
    else if (p.kind === 'spell') { const spell = shown.spells?.find(x => x.id === p.ref); if (spell) out.push({ ...head, kind: 'spell', spell }); }
    else if (p.kind === 'feature') { const feature = shown.features?.find(x => x.id === p.ref); if (feature) out.push({ ...head, kind: 'feature', feature }); }
  }
  return out;
}
