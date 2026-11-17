"use client";
import { useEffect, useRef, useState } from "react";
import { setDiceThrower, type ThrowDie } from "@/lib/dice-throw";
import "./linked-roll-popup.css";

type Throw = { dice: ThrowDie[]; done: () => void; id: number };
let sequence = 0;

/**
 * Draws 3D dice across the whole screen for rolls already made (lib/dice-throw.ts): your own rolls and, with "3D dice"
 * on, rolls from Roll20. Each die lands on the number that came up. A new throw replaces one still rolling.
 */
export default function DiceThrower() {
  const [current, setCurrent] = useState<Throw | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => setDiceThrower((dice, done) => setCurrent(old => { old?.done(); return { dice, done, id: ++sequence }; })), []);
  useEffect(() => {
    if (!current) return;
    let active = true, dispose: (() => void) | undefined, landed: ReturnType<typeof setTimeout> | undefined, gone: ReturnType<typeof setTimeout> | undefined;
    const finish = () => { current.done(); setCurrent(c => c?.id === current.id ? null : c); };
    void Promise.all([import("@/lib/dice-physics"), import("@/lib/dice-three")]).then(([{ simulateDice, showValues }, { startThreeDice }]) => {
      if (!active || !canvas.current) return;
      // The dice are thrown at random, then each die's faces are relabelled so it lands on the number that came up.
      const aspect = innerHeight ? innerWidth / innerHeight : 1.7;
      const dice = showValues(simulateDice(current.dice.map(d => d.sides), Math.random, aspect), current.dice.map(d => d.value));
      const css = getComputedStyle(document.documentElement), dark = document.documentElement.dataset.theme === "dark";
      dispose = startThreeDice(canvas.current, dice, { enabled: true, color: css.getPropertyValue("--accent").trim() || "#246c58", font: "serif", textColor: dark ? "#0c1214" : "#ffffff", borderColor: dark ? "#ffffff" : "#0c1214", muted: true }, false);
      const settle = Math.max(0, ...dice.map(d => d.motion?.duration || 1900));
      // The result shows once the dice have landed; the dice stay a moment longer so the numbers can be read.
      landed = setTimeout(() => current.done(), settle + 200);
      gone = setTimeout(finish, settle + 1500);
    }).catch(finish);
    return () => { active = false; clearTimeout(landed); clearTimeout(gone); dispose?.(); current.done(); };
  }, [current]);
  return current ? <div className="linked-roll-dice" aria-hidden="true"><canvas key={current.id} ref={canvas} /></div> : null;
}
