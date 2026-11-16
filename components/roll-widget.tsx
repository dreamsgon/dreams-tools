"use client";
import { useState } from "react";
import { ArrowUpRight, ListOrdered } from "lucide-react";
import { rollTable, type TableLibrary } from "@/lib/encyclopedia/tables";
import { openDiceTray } from "@/lib/dice-open";
import type { HomeTable } from "@/lib/home-tables";
import "./roll-widget.css";

const dice = [4, 6, 8, 10, 12, 20, 100];

/** Dice d4 to d100 with the result shown inline, plus a list of starred tables. Shared by the home page and the campaign dashboard. */
export function RollPanel({ tables, library, showTables = true, emptyText }: { tables: HomeTable[]; library?: TableLibrary; showTables?: boolean; emptyText?: string }) {
  const [result, setResult] = useState<{ big: string; small: string } | null>(null);
  const shown = showTables ? tables : [];
  function roll(n: number) {
    const r = 1 + Math.floor(Math.random() * n);
    setResult({ big: String(r), small: `on a d${n}${r === n ? " · max!" : r === 1 ? " · ouch" : ""}` });
  }
  function rollOn(id: string, name: string) {
    try { const r = rollTable((library ?? { schemaVersion: 1, tables: [] }) as TableLibrary, id); setResult({ big: r.text, small: name }); }
    catch (e) { setResult({ big: "That table could not be rolled here.", small: e instanceof Error ? e.message : name }); }
  }
  return <>
    <div className="rw-dice">{dice.map(n => <button key={n} type="button" onClick={() => roll(n)}>d{n}</button>)}</div>
    <div className="rw-rolled" aria-live="polite">{result ? <><b>{result.big}</b> <span className="rw-muted">{result.small}</span></> : <span className="rw-muted">Click a die{shown.length ? ", or a table below" : ""}.</span>}</div>
    <button type="button" className="rw-link" onClick={() => openDiceTray("dice")}>Open the dice tray</button>
    {showTables && <div className="rw-tables"><h3>Your tables</h3>
      {shown.length ? <ul>{shown.map(t => <li key={t.id}>
        <ListOrdered size={15} aria-hidden="true" />
        <span>{t.name}</span>
        {t.rollable ? <button type="button" className="rw-link" onClick={() => rollOn(t.id, t.name)}>Roll</button>
          : <a className="rw-link" href="/encyclopedia?view=tables">Open<ArrowUpRight size={12} aria-hidden="true" /></a>}
      </li>)}</ul> : <p className="rw-muted">{emptyText ?? "Star a random table in the Encyclopedia to add it here."}</p>}
    </div>}
  </>;
}
