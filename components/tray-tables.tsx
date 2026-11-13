"use client";
/*
 * The Tables and Oracle tabs of the Maptable dice tray: the random tables this campaign uses (from the
 * GM's Encyclopedia library, starred first) and its yes or no oracle with odds and tension.
 */
import { useEffect, useState } from "react";
import { Dices, RotateCcw, Search, Star } from "lucide-react";
import { askOracle, campaignTables, DEFAULT_ODDS, rollLabel, rollTable, type RandomTable, type TableLibrary } from "@/lib/encyclopedia/tables";
import type { TableResult } from "@/lib/encyclopedia/discord-table";
import { recordLocalRoll } from "@/lib/local-roll-log";
import { loadEncyclopedia } from "./encyclopedia-tokens";
import { categoryName, postTableResult, saveTables, tableResult, useTables } from "./encyclopedia/table-library";

export type TrayScene = { sceneId: string; campaignId: string | null; name?: string };
type Shown = { title: string; roll: string; text: string; steps: string[]; twist?: string; result: TableResult; again: () => void };
const autoKey = "maptable-discord-always";
const always = () => { try { return localStorage.getItem(autoKey) === "true"; } catch { return false; } };

/** The Encyclopedia campaign paired with the scene's Maptable campaign, so the tray lists its tables and tension. */
function usePaired(maptableCampaignId: string | null | undefined) {
  const [paired, setPaired] = useState<{ for: string; id: string | null; name?: string } | null>(null);
  useEffect(() => {
    if (!maptableCampaignId) return;
    let live = true;
    loadEncyclopedia().then(raw => {
      const c = (raw.campaigns as { id: string; name: string; maptableCampaignId?: string }[] | undefined)?.find(x => x.maptableCampaignId === maptableCampaignId);
      if (live) setPaired({ for: maptableCampaignId, id: c?.id ?? null, name: c?.name });
    }).catch(() => { if (live) setPaired({ for: maptableCampaignId, id: null }); });
    return () => { live = false; };
  }, [maptableCampaignId]);
  return paired && paired.for === maptableCampaignId ? paired : { for: "", id: null as string | null, name: undefined as string | undefined };
}

/** Whether the tray offers Tables and Oracle: only the GM, who can read the library. */
export function useTrayTables() { const { lib } = useTables(); return !!lib; }

function Result({ shown, scene, onAgain }: { shown: Shown; scene: TrayScene | null | undefined; onAgain: () => void }) {
  const [status, setStatus] = useState<{ key: Shown; text: string } | null>(null), [busy, setBusy] = useState(false);
  const post = async () => {
    if (!scene?.campaignId) return;
    setBusy(true);
    try { await postTableResult({ maptableCampaignId: scene.campaignId }, shown.result); setStatus({ key: shown, text: "Posted to Discord." }); }
    catch (e) { setStatus({ key: shown, text: e instanceof Error ? e.message : "Could not post to Discord." }); }
    finally { setBusy(false); }
  };
  return <div className="tray-table-result" role="status" aria-live="polite">
    <small>{[shown.title, shown.roll].filter(Boolean).join(" · ")}</small>
    {shown.steps.length > 0 && <small className="tray-table-steps">{shown.steps.join(" · ")}</small>}
    <strong>{shown.text}</strong>
    {shown.twist && <p className="tray-table-twist"><span>Twist</span> {shown.twist}</p>}
    <div className="tray-table-actions">
      {scene?.campaignId && <button type="button" disabled={busy} onClick={() => void post()}>{busy ? "Posting…" : "Post to Discord"}</button>}
      <button type="button" onClick={onAgain}><RotateCcw size={13}/> {shown.result.oracle ? "Ask again" : "Roll again"}</button>
    </div>
    {status?.key === shown && <p className="tray-table-status">{status.text}</p>}
  </div>;
}

/** Shows a result, records it in the roll log and, with Always on, posts it. */
function useShow(scene: TrayScene | null | undefined) {
  const [shown, setShown] = useState<Shown | null>(null);
  const show = (s: Shown, total: number) => {
    setShown(s);
    recordLocalRoll({ label: s.title, total, breakdown: s.roll, outcome: s.text + (s.twist ? ` · Twist: ${s.twist}` : "") });
    if (always() && scene?.campaignId) void postTableResult({ maptableCampaignId: scene.campaignId }, s.result).catch(() => { /* Post by hand from the result. */ });
  };
  return { shown, show };
}
const firstNumber = (roll: string, fallback = 0) => Number(roll.match(/=\s*(-?\d+)/)?.[1] ?? roll.match(/^(\d+) of/)?.[1] ?? fallback);

export function TrayTables({ scene }: { scene: TrayScene | null | undefined }) {
  const { lib, error } = useTables(), paired = usePaired(scene?.campaignId), [query, setQuery] = useState(""), [category, setCategory] = useState("");
  const { shown, show } = useShow(scene), [saveError, setSaveError] = useState("");
  if (!lib) return <p className="tray-table-empty">{error || "Loading your tables…"}</p>;
  const { tables } = campaignTables(lib, paired.id), cats = [...new Set(tables.map(t => t.category))];
  const q = query.trim().toLowerCase(), list = tables.filter(t => (!category || t.category === category) && (!q || t.name.toLowerCase().includes(q)));
  const footer = [paired.name, scene?.name].filter(Boolean).join(" · ") || undefined;
  const roll = (t: RandomTable, from: TableLibrary = lib) => {
    const r = rollTable(from, t.id);
    show({ title: t.name, roll: r.roll, text: r.text, steps: r.steps.map(s => `${s.table}: ${s.text}`), result: tableResult(r, footer), again: () => roll(t) }, firstNumber(r.roll));
  };
  const star = (t: RandomTable) => { setSaveError(""); void saveTables(l => ({ ...l, tables: l.tables.map(x => x.id === t.id ? { ...x, starred: !x.starred || undefined } : x) })).catch(e => setSaveError(e instanceof Error ? e.message : "Could not save the star.")); };
  return <div className="tray-tables">
    <label className="tray-table-find"><Search size={14}/><input aria-label="Find a table" placeholder="Find a table" value={query} onChange={e => setQuery(e.target.value)}/></label>
    {cats.length > 1 && <div className="tray-table-cats" role="group" aria-label="Kind of table">
      <button type="button" aria-pressed={!category} className={!category ? "on" : ""} onClick={() => setCategory("")}>All</button>
      {cats.map(c => <button type="button" key={c} aria-pressed={category === c} className={category === c ? "on" : ""} onClick={() => setCategory(c)}>{categoryName(c)}</button>)}
    </div>}
    {!tables.length ? <p className="tray-table-empty">{paired.id ? "This campaign has no random tables yet." : "No tables yet."} Add them on the Random tables page in the Encyclopedia.</p>
      : <ul className="tray-table-list">{list.map(t => <li key={t.id}>
        <button type="button" className={`tray-star${t.starred ? " on" : ""}`} aria-pressed={!!t.starred} aria-label={t.starred ? `Unstar ${t.name}` : `Star ${t.name}`} title={t.starred ? "Starred: kept at the top" : "Star to keep it at the top"} onClick={() => star(t)}><Star size={14}/></button>
        <button type="button" className="tray-table-roll" onClick={() => roll(t)}><span>{t.name}</span><small>{rollLabel(t)}</small></button>
      </li>)}{!list.length && <li className="tray-table-none">No tables match.</li>}</ul>}
    {saveError && <p role="alert" className="tray-table-status">{saveError}</p>}
    {shown && <Result shown={shown} scene={scene} onAgain={shown.again}/>}
  </div>;
}

export function TrayOracle({ scene }: { scene: TrayScene | null | undefined }) {
  const { lib, error } = useTables(), paired = usePaired(scene?.campaignId), [question, setQuestion] = useState(""), [pick, setPick] = useState(""), [oracleId, setOracleId] = useState("");
  const { shown, show } = useShow(scene), [saveError, setSaveError] = useState("");
  if (!lib) return <p className="tray-table-empty">{error || "Loading your oracle…"}</p>;
  const { oracles } = campaignTables(lib, paired.id), oracle = oracles.find(o => o.id === oracleId) ?? oracles[0];
  if (!oracle) return <p className="tray-table-empty">This campaign has no yes or no oracle. Add one on the Random tables page in the Encyclopedia.</p>;
  const odds = oracle.odds ?? DEFAULT_ODDS, chosen = odds.find(o => o.label === pick) ?? odds[Math.floor((odds.length - 1) / 2)]!;
  const key = paired.id ?? "", tension = lib.tension?.[key] ?? 5;
  const setTension = (n: number) => { setSaveError(""); void saveTables(l => ({ ...l, tension: { ...l.tension, [key]: Math.max(1, Math.min(9, n)) } })).catch(e => setSaveError(e instanceof Error ? e.message : "Could not save the tension.")); };
  const footer = [paired.name, scene?.name].filter(Boolean).join(" · ") || undefined;
  const ask = () => {
    const a = askOracle(oracle, chosen.label, tension, Math.random, question.trim());
    let twist: string | undefined;
    if (a.twist) { twist = "Something changes"; if (oracle.twistTableId) try { twist = rollTable(lib, oracle.twistTableId).text; } catch { /* The twist table was deleted. */ } }
    show({ title: a.question || oracle.name, roll: `${a.odds} (${a.chance}%) · d100 = ${a.d100}`, text: a.answer, steps: [], ...(twist ? { twist } : {}),
      result: { title: oracle.name, text: a.answer, oracle: { ...(a.question ? { question: a.question } : {}), answer: a.answer, odds: a.odds, chance: a.chance, d100: a.d100, tension, ...(twist ? { twist } : {}) }, ...(footer ? { footer } : {}) }, again: ask }, a.d100);
  };
  return <form className="tray-oracle" onSubmit={e => { e.preventDefault(); ask(); }}>
    {oracles.length > 1 && <label>Oracle<select value={oracle.id} onChange={e => setOracleId(e.target.value)}>{oracles.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
    <label>Your question<input value={question} maxLength={300} placeholder="Is the ferryman still waiting?" onChange={e => setQuestion(e.target.value)}/></label>
    <span className="tray-oracle-caption">Odds</span>
    <div className="tray-oracle-odds" role="radiogroup" aria-label="Odds">{odds.map(o => <button type="button" key={o.label} role="radio" aria-checked={chosen.label === o.label} className={chosen.label === o.label ? "on" : ""} onClick={() => setPick(o.label)}>{o.label}</button>)}</div>
    <div className="tray-oracle-tension"><span className="tray-oracle-caption">Tension <small>twists on doubles up to it</small></span>
      <button type="button" aria-label="Lower tension" disabled={tension <= 1} onClick={() => setTension(tension - 1)}>−</button><b aria-live="polite">{tension}</b><button type="button" aria-label="Raise tension" disabled={tension >= 9} onClick={() => setTension(tension + 1)}>+</button></div>
    <button className="tray-roll" type="submit"><Dices size={15}/> Ask the oracle</button>
    {saveError && <p role="alert" className="tray-table-status">{saveError}</p>}
    {shown && <Result shown={shown} scene={scene} onAgain={shown.again}/>}
  </form>;
}
