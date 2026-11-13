"use client";
/*
 * Random tables outside the Random tables page: the library loaded once and shared, chips and whole
 * tables on Encyclopedia pages ([[table:Name]]), the Write-mode picker, and posting results to Discord.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { Dices, ListOrdered, Search } from "lucide-react";
import { playerInline } from "@/lib/encyclopedia/inline";
import { askOracle, campaignTables, findTable, librarySchema, rangeLabel, rollLabel, rollTable, TABLE_CATEGORIES, type RandomTable, type TableLibrary, type TableRoll } from "@/lib/encyclopedia/tables";
import type { TableResult } from "@/lib/encyclopedia/discord-table";
import { showTableRoll, TABLE_ROLL_EVENT, type TableRollShown } from "./rolls";
export { postTableResult } from "./rolls";
import { ToolDialog } from "./tool-dialog";

type State = { lib: TableLibrary | null; revision: number; error: string; loaded: boolean };
let state: State = { lib: null, revision: 0, error: "", loaded: false }, loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => { state = { ...state, ...next }; listeners.forEach(l => l()); };

/** Loads the signed-in GM's tables. Players and signed-out visitors get an error, and see no tables. */
export function loadTables(force = false) {
  if (loading && !force) return loading;
  loading = (async () => {
    try {
      const res = await fetch("/api/encyclopedia/tables", { cache: "no-store" }), body = await res.json() as { data?: unknown; revision?: number; error?: string };
      if (!res.ok) throw Error(body.error ?? "Could not load your tables.");
      set({ lib: librarySchema.parse(body.data), revision: body.revision ?? 0, error: "", loaded: true });
    } catch (e) { set({ error: e instanceof Error ? e.message : "Could not load your tables.", loaded: true }); }
  })();
  return loading;
}
/** The Random tables page tells the shared copy about its saves, so chips roll the latest rows. */
export function tablesSaved(lib: TableLibrary, revision: number) { set({ lib, revision, error: "", loaded: true }); }
const subscribe = (l: () => void) => { listeners.add(l); if (!state.loaded && !loading) void loadTables(); return () => { listeners.delete(l); }; };
const SERVER: State = { lib: null, revision: 0, error: "", loaded: false };
export function useTables() { return useSyncExternalStore(subscribe, () => state, () => SERVER); }

/** Saves a change (a star, the tension). A save from elsewhere in between is loaded and the change made again. */
export async function saveTables(edit: (lib: TableLibrary) => TableLibrary) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!state.lib) await loadTables(true);
    if (!state.lib) throw Error(state.error || "Could not load your tables.");
    const data = edit(state.lib);
    set({ lib: data });
    const res = await fetch("/api/encyclopedia/tables", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data, revision: state.revision }) });
    const body = await res.json().catch(() => ({})) as { revision?: number; error?: string };
    if (res.ok) { set({ revision: body.revision ?? state.revision + 1 }); return; }
    if (res.status !== 409) { await loadTables(true); throw Error(body.error ?? "Could not save your tables."); }
    await loadTables(true);
  }
  throw Error("Your tables changed somewhere else. Try again.");
}

export const categoryName = (c: RandomTable["category"]) => TABLE_CATEGORIES.find(x => x[0] === c)?.[1] ?? "Other";

/** The Discord form of a roll: the table's name, what came up, the roll and its nested steps. */
export function tableResult(r: TableRoll, footer?: string): TableResult {
  return { title: r.title, text: r.text, roll: r.roll || undefined, steps: r.steps.map(s => ({ table: s.table, roll: s.roll || undefined, text: s.text })), ...(footer ? { footer } : {}) };
}
/** Rolls a table from a page and shows it in the roll card. An oracle is asked at its middle odds and the campaign's tension. */
export function rollFromPage(lib: TableLibrary, table: RandomTable, page: string, campaignId: string | null) {
  const again = () => rollFromPage(state.lib ?? lib, findTable(state.lib ?? lib, table.id) ?? table, page, campaignId);
  if (table.kind === "oracle") {
    const odds = table.odds?.[Math.floor((table.odds.length - 1) / 2)]?.label ?? "", tension = lib.tension?.[campaignId ?? ""] ?? 5;
    const a = askOracle(table, odds, tension);
    let twist: string | undefined;
    if (a.twist) { twist = "Something changes"; if (table.twistTableId) try { twist = rollTable(lib, table.twistTableId).text; } catch { /* The twist table was deleted. */ } }
    const roll: TableRoll = { tableId: table.id, title: table.name, roll: `${a.roll} · ${a.odds}`, text: a.answer + (twist ? ` · Twist: ${twist}` : ""), steps: [] };
    showTableRoll({ title: `${page} · ${table.name}`, roll, again, result: { title: table.name, text: a.answer, oracle: { answer: a.answer, odds: a.odds, chance: a.chance, d100: a.d100, tension, ...(twist ? { twist } : {}) }, footer: page } });
    return;
  }
  const roll = rollTable(lib, table.id);
  showTableRoll({ title: `${page} · ${table.name}`, roll, again, result: tableResult(roll, page) });
}

/** `[[table:Name]]` in a sentence: a chip that rolls the table. */
export function TableChip({ name, label, page, campaignId }: { name: string; label: string | null; page: string; campaignId: string | null }) {
  const { lib, loaded } = useTables(), table = lib ? findTable(lib, name) : undefined;
  if (loaded && !table) return <span className="broken-link" title="No table with this name in your Random tables">{label ?? name}</span>;
  return <button type="button" className="roll-chip table-chip" title={`Roll ${table?.name ?? name}`} disabled={!table} onClick={() => table && lib && rollFromPage(lib, table, page, campaignId)}><ListOrdered size={12} aria-hidden="true"/>{label ?? table?.name ?? name}</button>;
}

const SHOWN_ROWS = 12;
/** `[[table:Name]]` on a line of its own: the whole table with Roll. The row that came up last is marked. */
export function TableEmbed({ name, page, campaignId }: { name: string; page: string; campaignId: string | null }) {
  const { lib, loaded, error } = useTables(), table = lib ? findTable(lib, name) : undefined;
  const [rolled, setRolled] = useState<{ tableId: string; rowId?: string; roll: string } | null>(null), [all, setAll] = useState(false);
  useEffect(() => {
    const on = (e: Event) => { const r = (e as CustomEvent<TableRollShown>).detail; if (r.roll.tableId === table?.id) setRolled({ tableId: r.roll.tableId, rowId: r.roll.rowId, roll: r.roll.roll }); };
    window.addEventListener(TABLE_ROLL_EVENT, on);
    return () => window.removeEventListener(TABLE_ROLL_EVENT, on);
  }, [table?.id]);
  if (!loaded) return <div className="table-embed loading"><ListOrdered size={16}/> {name}</div>;
  if (!table || !lib) return <div className="table-embed missing"><ListOrdered size={16}/><span><strong>{name}</strong><small>{error || "No table with this name in your Random tables."}</small></span></div>;
  const rows = table.kind === "table" ? table.rows ?? [] : [], shown = all ? rows : rows.slice(0, SHOWN_ROWS), mark = rolled?.tableId === table.id ? rolled : null;
  const number = mark?.roll.match(/=\s*(-?\d+)/)?.[1];
  return <div className="table-embed">
    <div className="table-embed-head"><ListOrdered size={16} aria-hidden="true"/><span><strong>{table.name}</strong><small>{[rollLabel(table), categoryName(table.category)].filter(Boolean).join(" · ")}</small></span>
      <button type="button" className="button small primary" onClick={() => rollFromPage(lib, table, page, campaignId)}><Dices size={14}/> Roll</button></div>
    {table.description && <p className="table-embed-desc">{table.description}</p>}
    {rows.length > 0 && <ol className="table-embed-rows">{shown.map((r, i) => <li key={r.id} className={mark?.rowId === r.id ? "rolled" : ""}>
      <span className="table-embed-range">{rangeLabel(r) || i + 1}</span><span className="table-embed-text">{playerInline(r.text)}</span>
      {mark?.rowId === r.id && <span className="table-embed-mark">{number ? `Rolled ${number}` : "Came up"}</span>}
    </li>)}</ol>}
    {rows.length > SHOWN_ROWS && <button type="button" className="text-button table-embed-more" onClick={() => setAll(!all)}>{all ? "Show fewer rows" : `Show all ${rows.length} rows`}</button>}
  </div>;
}

/** Write mode's Table button: picks a table from this campaign's library to put on the page. */
export function TablePicker({ campaignId, onPick, onClose }: { campaignId: string | null; onPick: (t: RandomTable) => void; onClose: () => void }) {
  const { lib, error } = useTables(), [query, setQuery] = useState("");
  const list = lib ? (() => { const c = campaignTables(lib, campaignId); return [...c.tables, ...c.oracles]; })() : [];
  const q = query.trim().toLowerCase(), shown = list.filter(t => !q || `${t.name} ${categoryName(t.category)}`.toLowerCase().includes(q));
  return <ToolDialog title="Put a random table on this page" onClose={onClose}>
    <p className="modal-intro">On a line of its own it shows the whole table with Roll; in a sentence it becomes a chip. Players only see the table’s name.</p>
    <label className="search-box picker-search"><Search size={15}/><input autoFocus aria-label="Find a table" placeholder="Find a table…" value={query} onChange={e => setQuery(e.target.value)}/></label>
    <div className="scene-pick-list">
      {error ? <p className="info-note" role="alert">{error}</p> : !lib ? <p className="muted">Loading your tables…</p> : !shown.length ? <p className="muted">{list.length ? "No tables match." : "This campaign has no random tables yet. Add some on the Random tables page."}</p>
        : shown.map(t => <button key={t.id} className="scene-pick" onClick={() => onPick(t)}><ListOrdered size={16}/><span><strong>{t.name}</strong><small>{[rollLabel(t), categoryName(t.category)].filter(Boolean).join(" · ")}</small></span></button>)}
    </div>
  </ToolDialog>;
}
