/*
 * A character's own arrangement of the campaign's stats: the order they appear in on this character's Stats tab, and the
 * ones switched off there. The campaign's stat form stays the source of the stats; this only reorders and hides them.
 * A stat the arrangement doesn't list (added to the form later) keeps its place after the form's stat before it.
 * Everything here is pure.
 */

export type StatArrangement = { order?: string[]; off?: string[] };
type Field = { id: string; section: string };

/** The fields in this character's order. */
export function arrangeStats<T extends { id: string }>(fields: readonly T[], a?: StatArrangement | null): T[] {
  if (!a?.order?.length) return [...fields];
  const rank = new Map(a.order.map((id, i) => [id, i]));
  const out = fields.filter(f => rank.has(f.id)).sort((x, y) => rank.get(x.id)! - rank.get(y.id)!);
  fields.forEach((f, i) => {
    if (rank.has(f.id)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) { const k = out.indexOf(fields[j]); if (k >= 0) { at = k + 1; break; } }
    out.splice(at, 0, f);
  });
  return out;
}

/** Whether this character has the stat switched off. */
export const statOff = (a: StatArrangement | null | undefined, id: string) => !!a?.off?.includes(id);

/** The fields this character's sheet shows, in their order: switched-off stats left out. */
export const shownStats = <T extends { id: string }>(fields: readonly T[], a?: StatArrangement | null): T[] => arrangeStats(fields, a).filter(f => !statOff(a, f.id));

/** The stats in their groups, each group where its first stat is. */
export function statGroups<T extends Field>(fields: readonly T[]): { name: string; fields: T[] }[] {
  const out: { name: string; fields: T[] }[] = [];
  for (const f of fields) { const g = out.find(x => x.name === f.section); if (g) g.fields.push(f); else out.push({ name: f.section, fields: [f] }); }
  return out;
}
const flat = <T extends Field>(groups: { fields: T[] }[]) => groups.flatMap(g => g.fields.map(f => f.id));

/** The order after moving a stat one place up (-1) or down (1) inside its group. Unchanged at either end. */
export function moveStat(fields: readonly Field[], id: string, dir: -1 | 1): string[] {
  const groups = statGroups(fields), g = groups.find(x => x.fields.some(f => f.id === id));
  if (g) {
    const at = g.fields.findIndex(f => f.id === id), to = at + dir;
    if (to >= 0 && to < g.fields.length) [g.fields[at], g.fields[to]] = [g.fields[to], g.fields[at]];
  }
  return flat(groups);
}

/** The order after moving a whole group one place up or down. */
export function moveStatGroup(fields: readonly Field[], name: string, dir: -1 | 1): string[] {
  const groups = statGroups(fields), at = groups.findIndex(g => g.name === name), to = at + dir;
  if (at >= 0 && to >= 0 && to < groups.length) [groups[at], groups[to]] = [groups[to], groups[at]];
  return flat(groups);
}

/** The arrangement with the stat switched on or off. An empty arrangement is undefined, so the page stores nothing. */
export function toggleStat(a: StatArrangement | null | undefined, id: string): StatArrangement | undefined {
  const off = statOff(a, id) ? (a?.off ?? []).filter(x => x !== id) : [...(a?.off ?? []), id];
  return tidy({ ...a, off });
}

/** Drops empty lists, and ids the campaign's form no longer has when `known` is given. */
export function tidy(a: StatArrangement | null | undefined, known?: ReadonlySet<string>): StatArrangement | undefined {
  const keep = (l?: string[]) => { const x = known ? (l ?? []).filter(id => known.has(id)) : l ?? []; return x.length ? [...new Set(x)] : undefined; };
  const order = keep(a?.order), off = keep(a?.off);
  return order || off ? { ...(order ? { order } : {}), ...(off ? { off } : {}) } : undefined;
}

/**
 * The campaign's form arranged like this character's sheet, for every character: the shown stats in this order, the
 * switched-off ones archived (Stat form can bring them back), and stats already archived kept at the end.
 */
export function formFromArrangement<T extends { id: string; archived?: boolean }>(all: readonly T[], a?: StatArrangement | null): T[] {
  const live = all.filter(f => !f.archived), gone = all.filter(f => f.archived);
  return [...arrangeStats(live, a).map(f => statOff(a, f.id) ? { ...f, archived: true } : f), ...gone];
}
