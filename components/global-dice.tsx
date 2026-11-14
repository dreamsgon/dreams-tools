"use client";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { diceTargetStore } from "@/lib/dice-target";
import { Dices, ScrollText } from "lucide-react";
import type { DicePanel } from "./standard-dice-tray";
import "./global-dice.css";

// The tray (three.js dice, tables, roll log) is only fetched the first time someone opens it.
const StandardDiceTray = dynamic(() => import("./standard-dice-tray"), { ssr: false });

/** Pages that already carry their own dice tray or have no tools to roll with. */
export function hasOwnDice(pathname: string | null) {
  return !!pathname && (pathname === "/maptable" || pathname.startsWith("/maptable/") || pathname === "/auth" || pathname.startsWith("/auth/"));
}

/**
 * The Maptable dice tray, reachable from every other page: two small buttons at the bottom right open the same tray and
 * the same per-browser roll log. A page that shows a campaign says where Send to Discord goes (see lib/dice-target.ts); on
 * pages with no campaign rolls stay on this device and the tray says why.
 */
export default function GlobalDice() {
  const pathname = usePathname();
  // The open panel belongs to the route it was opened on; on another route it reads as closed (no effect needed).
  const [open, setOpen] = useState<{ panel: DicePanel; path: string | null }>({ panel: null, path: pathname });
  const panel = open.path === pathname ? open.panel : null;
  const setPanel = (next: DicePanel) => setOpen({ panel: next, path: pathname });
  const [used, setUsed] = useState(false);
  const target = useSyncExternalStore(diceTargetStore.subscribe, diceTargetStore.get, diceTargetStore.getServer);
  if (hasOwnDice(pathname)) return null;
  const toggle = (next: Exclude<DicePanel, null>) => { setUsed(true); setPanel(panel === next ? null : next); };
  return <>
    <div className="global-dice" role="group" aria-label="Dice">
      <button type="button" aria-expanded={panel === "dice"} aria-controls="standard-dice-tray" title="Dice tray" onClick={() => toggle("dice")}><Dices size={18} aria-hidden="true" /><span>Dice</span></button>
      <button type="button" aria-expanded={panel === "log"} aria-controls="local-roll-log" title="Roll log" aria-label="Roll log" onClick={() => toggle("log")}><ScrollText size={18} aria-hidden="true" /></button>
    </div>
    {used && <StandardDiceTray panel={panel} onPanelChange={setPanel} scene={null} discord={target.discord} localNote={target.note} />}
  </>;
}
