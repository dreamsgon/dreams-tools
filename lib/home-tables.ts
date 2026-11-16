import type { Session } from "./campaigns-server.ts";
import { findTable, rollLabel, type RandomTable, type TableLibrary } from "./encyclopedia/tables.ts";

/*
 * The starred random tables a Quick roll widget lists, with just enough of the library to roll the rollable ones in the browser.
 * Used by the home page (every starred table) and the campaign dashboard (the starred tables that campaign uses).
 */

export type HomeTable = { id: string; name: string; roll: string; kind: string; rollable: boolean };
export type StarredTables = { tables: HomeTable[]; library: TableLibrary };

const TABLE_REF = /\[\[table:([^\]|\n]{1,160})(?:\|[^\]\n]*)?\]\]/gi;
/** Tables a table rolls on, so the copy sent to the browser can roll it. */
function needed(lib: TableLibrary, start: RandomTable) {
  const out = new Map<string, RandomTable>(), todo = [start];
  while (todo.length && out.size < 40) {
    const t = todo.pop()!;
    if (out.has(t.id)) continue;
    out.set(t.id, t);
    const ids = [...(t.pair ?? []), ...(t.twistTableId ? [t.twistTableId] : []), ...[...(t.parts ?? []), ...(t.extras ?? [])].map(p => p.tableId)];
    for (const row of t.rows ?? []) for (const m of row.text.matchAll(TABLE_REF)) { const f = findTable(lib, m[1]); if (f) ids.push(f.id); }
    for (const id of ids) { const f = lib.tables.find(x => x.id === id); if (f && !out.has(f.id)) todo.push(f); }
  }
  return [...out.values()];
}

/** Starred tables, by name. `keep` narrows them (for example to one campaign's tables). */
export async function starredTables(s: Session, keep: (t: RandomTable) => boolean = () => true): Promise<StarredTables> {
  const { data } = await s.book.readTables(s.owner);
  const starred = data.tables.filter(t => t.starred && keep(t)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 12);
  const kept = new Map<string, RandomTable>(), tables: HomeTable[] = [];
  let size = 0;
  for (const t of starred) {
    const rollable = t.kind === "table" || t.kind === "pair";
    const deps = rollable ? needed(data, t) : [];
    const add = deps.filter(d => !kept.has(d.id)), bytes = add.reduce((n, d) => n + JSON.stringify(d).length, 0);
    const ok = rollable && deps.length < 40 && size + bytes <= 120_000;
    if (ok) { for (const d of add) kept.set(d.id, d); size += bytes; }
    tables.push({ id: t.id, name: t.name, roll: rollLabel(t), kind: t.kind, rollable: ok });
  }
  return { tables, library: { schemaVersion: 1, tables: [...kept.values()] } };
}
