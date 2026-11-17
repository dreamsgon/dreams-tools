"use client";
import { useEffect, useRef, useState } from "react";
import { Dices, X } from "lucide-react";
import { BONUS_MAX, NOTE_MAX, addBonus, asksBeforeRolls, cleanBonus, modeNames, plainChoice, setAsksBeforeRolls, setRollDialogHost, watchShift, type RollAsk, type RollChoice } from "@/lib/roll-dialog";
import { ownDice3D, setOwnDice3D } from "@/lib/dice-throw";
import { isSingleD20, withKeepMode, type RollMode } from "@/lib/rolls";
import "./roll-dialog.css";

type Open = { ask: RollAsk; resolve: (c: RollChoice | null) => void; id: number };
const quick = ["+1d4", "+1d6", "+1", "+2", "-1", "-1d4"];
let sequence = 0;

/**
 * The roll dialog (lib/roll-dialog.ts), mounted once on every page: a situational bonus, Advantage / Normal /
 * Disadvantage, and a note that goes on the roll's label (roll log, Discord, Roll20). Enter rolls; Escape cancels.
 */
export default function RollDialogHost() {
  const [open, setOpen] = useState<Open | null>(null);
  useEffect(() => { watchShift(); }, []);
  useEffect(() => setRollDialogHost(p => setOpen(old => { old?.resolve(null); return { ...p, id: ++sequence }; })), []);
  if (!open) return null;
  const close = (c: RollChoice | null) => { open.resolve(c); setOpen(o => o?.id === open.id ? null : o); };
  return <RollDialog key={open.id} ask={open.ask} onDone={close} />;
}

function RollDialog({ ask, onDone }: { ask: RollAsk; onDone: (c: RollChoice | null) => void }) {
  const box = useRef<HTMLDialogElement>(null), bonusInput = useRef<HTMLInputElement>(null);
  const start = plainChoice(ask), names = modeNames(ask.formula, ask.twice);
  const [bonus, setBonus] = useState(""), [mode, setMode] = useState<RollMode>(names ? start.mode : "normal"), [note, setNote] = useState(start.note);
  const [threeD, setThreeD] = useState(ownDice3D), [asks, setAsks] = useState(asksBeforeRolls);
  useEffect(() => { const d = box.current; if (d && !d.open) { try { d.showModal(); } catch { d.setAttribute("open", ""); } } bonusInput.current?.focus(); }, []);
  let base = ask.formula, error = "";
  try { base = addBonus(ask.formula, bonus); } catch (e) { error = e instanceof Error ? e.message : "That bonus can’t be added."; }
  const d20 = isSingleD20(ask.formula), shown = names && mode !== "normal" && d20 ? withKeepMode(base, mode) : base;
  const twiceNote = names && mode !== "normal" && !d20 ? `rolled twice, ${names[mode].toLowerCase()}` : "";
  const go = () => { if (error) return; onDone({ bonus: cleanBonus(bonus), mode, note: note.trim().slice(0, NOTE_MAX) }); };
  const addQuick = (q: string) => { setBonus(`${cleanBonus(bonus)}${q}`); bonusInput.current?.focus(); };
  return <dialog ref={box} className="roll-dialog" aria-labelledby="roll-dialog-title"
    onCancel={e => { e.preventDefault(); onDone(null); }}
    onKeyDown={e => { e.stopPropagation(); }}
    onClick={e => { if (e.target === box.current) onDone(null); }}>
    <form method="dialog" onSubmit={e => { e.preventDefault(); go(); }}>
      <header><Dices size={16} aria-hidden="true" /><strong id="roll-dialog-title">{ask.title}</strong>
        <button type="button" className="roll-dialog-x" aria-label="Cancel roll" onClick={() => onDone(null)}><X size={16} /></button></header>
      <p className="roll-dialog-formula" aria-live="polite"><code>{shown}</code>{twiceNote && <small>{twiceNote}</small>}</p>
      {names && <div className="roll-dialog-modes" role="radiogroup" aria-label="Roll mode">
        {(["high", "normal", "low"] as RollMode[]).map(m => <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>{names[m]}</button>)}
      </div>}
      <label className="roll-dialog-field">Situational bonus
        <input ref={bonusInput} value={bonus} maxLength={BONUS_MAX} placeholder="Like +1d4 (Bless) or -2" inputMode="text" autoComplete="off" spellCheck={false} onChange={e => setBonus(e.target.value)} aria-invalid={!!error} />
      </label>
      <div className="roll-dialog-quick" aria-label="Add to the bonus">{quick.map(q => <button key={q} type="button" onClick={() => addQuick(q)}>{q.replace("-", "−")}</button>)}
        {bonus && <button type="button" className="clear" onClick={() => setBonus("")}>Clear</button>}</div>
      {error && <p className="roll-dialog-error" role="alert">{error}</p>}
      <label className="roll-dialog-field">Note
        <input value={note} maxLength={NOTE_MAX} placeholder="What it’s for, like Attack on the goblin" autoComplete="off" onChange={e => setNote(e.target.value)} />
        <small>Goes on the roll’s name in the roll log, on Discord and in Roll20.</small>
      </label>
      <div className="roll-dialog-options">
        <label><input type="checkbox" checked={threeD} onChange={e => { setThreeD(e.target.checked); setOwnDice3D(e.target.checked); }} /> 3D dice</label>
        <label title="Off: rolls go straight ahead, and Shift-click opens this dialog."><input type="checkbox" checked={asks} onChange={e => { setAsks(e.target.checked); setAsksBeforeRolls(e.target.checked); }} /> Ask before each roll</label>
      </div>
      <p className="roll-dialog-hint">{asks ? "Shift-click a roll to skip this." : "Rolls go straight ahead. Shift-click a roll to open this."}</p>
      <footer><button type="button" className="roll-dialog-cancel" onClick={() => onDone(null)}>Cancel</button>
        <button type="submit" className="roll-dialog-go" disabled={!!error}><Dices size={15} aria-hidden="true" /> Roll</button></footer>
    </form>
  </dialog>;
}
