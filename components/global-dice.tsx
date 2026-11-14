"use client";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Dices, ScrollText } from "lucide-react";
import type { DicePanel } from "./standard-dice-tray";
import "./global-dice.css";

// The tray (three.js dice, tables, roll log) is only fetched the first time someone opens it.
const StandardDiceTray = dynamic(() => import("./standard-dice-tray"), { ssr: false });

/** Pages that already carry their own dice tray or have no tools to roll with. */
export function hasOwnDice(pathname: string | null) {
  return !!pathname && (pathname === "/maptable" || pathname.startsWith("/maptable/") || pathname.startsWith("/auth"));
}

/**
 * The Maptable dice tray, reachable from every other page: two small buttons at the bottom right open the same tray and
 * the same per-browser roll log. Rolls stay on this device; posting to Discord stays in Maptable, which knows the open scene.
 */
export default function GlobalDice() {
  const pathname = usePathname();
  const [panel, setPanel] = useState<DicePanel>(null);
  const [used, setUsed] = useState(false);
  if (hasOwnDice(pathname)) return null;
  const toggle = (next: Exclude<DicePanel, null>) => { setUsed(true); setPanel(p => p === next ? null : next); };
  return <>
    <div className="global-dice" role="group" aria-label="Dice">
      <button type="button" aria-expanded={panel === "dice"} aria-controls="standard-dice-tray" title="Dice tray" onClick={() => toggle("dice")}><Dices size={18} aria-hidden="true" /><span>Dice</span></button>
      <button type="button" aria-expanded={panel === "log"} aria-controls="local-roll-log" title="Roll log" aria-label="Roll log" onClick={() => toggle("log")}><ScrollText size={18} aria-hidden="true" /></button>
    </div>
    {used && <StandardDiceTray panel={panel} onPanelChange={setPanel} scene={null} />}
  </>;
}
