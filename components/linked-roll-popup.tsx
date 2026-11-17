"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { externalRollEvent, linkedRollDice, readExternalRoll, type ExternalRoll } from "@/lib/roll-link";
import "./linked-roll-popup.css";

const diceKey = "rpg-linked-roll-3d";
type Shown = ExternalRoll & { id: number };
let sequence = 0;
// This component only renders in the browser (next/dynamic with ssr off), so it can read storage as it starts.
const readThreeD = () => { try { return localStorage.getItem(diceKey) === "1"; } catch { return false; } };
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduced";

/**
 * Rolls from Roll20 (through the RPG Tools dice link) pop up on whatever page is open, and with "3D dice" on the dice
 * that came up roll across the screen. The roll log records them separately (lib/roll-link.ts).
 */
export default function LinkedRollPopup() {
  const [rolls, setRolls] = useState<Shown[]>([]), [threeD, setThreeD] = useState(readThreeD), [throwing, setThrowing] = useState<{ sides: number; value: number }[] | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null), live3D = useRef(threeD);
  useEffect(() => { live3D.current = threeD; }, [threeD]);
  useEffect(() => {
    const on = (event: Event) => {
      const roll = readExternalRoll((event as CustomEvent).detail);
      if (!roll) return;
      const shown = { ...roll, id: ++sequence };
      setRolls(old => [shown, ...old].slice(0, 3));
      setTimeout(() => setRolls(old => old.filter(r => r.id !== shown.id)), 9000);
      const dice = live3D.current && !reducedMotion() ? linkedRollDice(roll) : null;
      if (dice) setThrowing(dice);
    };
    window.addEventListener(externalRollEvent, on);
    return () => window.removeEventListener(externalRollEvent, on);
  }, []);
  useEffect(() => {
    if (!throwing) return;
    let active = true, dispose: (() => void) | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    void Promise.all([import("@/lib/dice-physics"), import("@/lib/dice-three")]).then(([{ simulateDice }, { startThreeDice }]) => {
      if (!active || !canvas.current) return;
      // simulateDice draws each die's face first, then lands it there; the first draws pick Roll20's faces, the rest throw.
      const targets = [...throwing], aspect = innerHeight ? innerWidth / innerHeight : 1.7;
      let n = 0;
      const dice = simulateDice(targets.map(d => d.sides), () => { const d = targets[n++]; return d ? (d.value - 0.5) / d.sides : Math.random(); }, aspect);
      const css = getComputedStyle(document.documentElement), dark = document.documentElement.dataset.theme === "dark";
      dispose = startThreeDice(canvas.current, dice, { enabled: true, color: css.getPropertyValue("--accent").trim() || "#246c58", font: "serif", textColor: dark ? "#0c1214" : "#ffffff", borderColor: dark ? "#ffffff" : "#0c1214", muted: true }, false);
      timer = setTimeout(() => setThrowing(null), Math.max(0, ...dice.map(d => d.motion?.duration || 1900)) + 1500);
    }).catch(() => setThrowing(null));
    return () => { active = false; clearTimeout(timer); dispose?.(); };
  }, [throwing]);
  const toggle3D = (on: boolean) => { setThreeD(on); try { localStorage.setItem(diceKey, on ? "1" : "0"); } catch { /* optional */ } };
  return <>
    {throwing && <div className="linked-roll-dice" aria-hidden="true"><canvas ref={canvas} /></div>}
    {rolls.length > 0 && <div className="linked-roll-popup" role="status" aria-live="polite">
      {rolls.map((r, i) => <div className="linked-roll" key={r.id}>
        <div className="linked-roll-head"><span>{r.who ? `${r.who} · ${r.title}` : r.title}</span>
          <button type="button" className="icon-button" aria-label="Close" onClick={() => setRolls(old => old.filter(o => o.id !== r.id))}><X size={13} /></button></div>
        <div className="linked-roll-total"><strong>{r.total}</strong>{r.formula && <span>{r.formula}</span>}</div>
        {r.detail && <div className="linked-roll-detail">{r.detail}</div>}
        {i === 0 && <div className="linked-roll-foot"><span>From Roll20</span>
          <label title="Roll the dice from Roll20 across the screen"><input type="checkbox" checked={threeD} onChange={e => toggle3D(e.target.checked)} /> 3D dice</label></div>}
      </div>)}
    </div>}
  </>;
}
