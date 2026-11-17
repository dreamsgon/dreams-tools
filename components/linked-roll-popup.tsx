"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { externalRollEvent, linkedRollDice, readExternalRoll, type ExternalRoll } from "@/lib/roll-link";
import { throwDice } from "@/lib/dice-throw";
import "./linked-roll-popup.css";

const diceKey = "rpg-linked-roll-3d";
type Shown = ExternalRoll & { id: number };
let sequence = 0;
// This component only renders in the browser (next/dynamic with ssr off), so it can read storage as it starts.
const readThreeD = () => { try { return localStorage.getItem(diceKey) === "1"; } catch { return false; } };

/**
 * Rolls from Roll20 (through the RPG Tools dice link) pop up on whatever page is open, and with "3D dice" on the dice
 * that came up roll across the screen. The roll log records them separately (lib/roll-link.ts).
 */
export default function LinkedRollPopup() {
  const [rolls, setRolls] = useState<Shown[]>([]), [threeD, setThreeD] = useState(readThreeD);
  const live3D = useRef(threeD);
  useEffect(() => { live3D.current = threeD; }, [threeD]);
  useEffect(() => {
    const on = (event: Event) => {
      const roll = readExternalRoll((event as CustomEvent).detail);
      if (!roll) return;
      const shown = { ...roll, id: ++sequence };
      setRolls(old => [shown, ...old].slice(0, 3));
      setTimeout(() => setRolls(old => old.filter(r => r.id !== shown.id)), 9000);
      const dice = live3D.current ? linkedRollDice(roll) : null;
      if (dice) void throwDice(dice);
    };
    window.addEventListener(externalRollEvent, on);
    return () => window.removeEventListener(externalRollEvent, on);
  }, []);
  const toggle3D = (on: boolean) => { setThreeD(on); try { localStorage.setItem(diceKey, on ? "1" : "0"); } catch { /* optional */ } };
  return <>
    {rolls.length > 0 && <div className="linked-roll-popup" role="status" aria-live="polite">
      {rolls.map((r, i) => <div className="linked-roll" key={r.id}>
        <div className="linked-roll-head"><span>{r.who ? `${r.who} · ${r.title}` : r.title}</span>
          <button type="button" className="icon-button" aria-label="Close" onClick={() => setRolls(old => old.filter(o => o.id !== r.id))}><X size={13} /></button></div>
        <div className="linked-roll-total"><strong>{r.total}</strong>{r.formula && <span>{r.formula}</span>}</div>
        {r.text ? <div className="linked-roll-text">{r.text}</div> : r.detail && <div className="linked-roll-detail">{r.detail}</div>}
        {i === 0 && <div className="linked-roll-foot"><span>From Roll20</span>
          <label title="Roll the dice from Roll20 across the screen"><input type="checkbox" checked={threeD} onChange={e => toggle3D(e.target.checked)} /> 3D dice</label></div>}
      </div>)}
    </div>}
  </>;
}
