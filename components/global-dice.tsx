"use client";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { diceTargetStore } from "@/lib/dice-target";
import { diceSlotStore, rollsHere } from "@/lib/dice-slot";
import { diceDockBelow } from "@/lib/dice-dock";
import { uiZoom } from "@/lib/appearance";
import { onOpenDiceTray } from "@/lib/dice-open";
import { listenForLinkedRolls } from "@/lib/roll-link";
import { Bot, Dices, ScrollText } from "lucide-react";
import { OPEN_CHAT_EVENT } from "@/lib/ai/chat-text";
import type { DicePanel } from "./standard-dice-tray";
import "./global-dice.css";

// The tray (three.js dice, tables, roll log) is only fetched the first time someone opens it.
const StandardDiceTray = dynamic(() => import("./standard-dice-tray"), { ssr: false });
const LinkedRollPopup = dynamic(() => import("./linked-roll-popup"), { ssr: false });
// The roll dialog and the 3D dice for your own rolls, on every page (Maptable too).
const RollDialogHost = dynamic(() => import("./roll-dialog"), { ssr: false });
const DiceThrower = dynamic(() => import("./dice-thrower"), { ssr: false });
// The AI panel, on pages without their own (the campaign dashboard): fetched the first time the AI button is pressed.
const AiActivity = dynamic(() => import("./encyclopedia/ai-activity").then(m => ({ default: m.AiActivity })), { ssr: false });

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
  // Other parts of a page (the Encyclopedia's phone bar) can ask for the tray without these buttons.
  useEffect(() => onOpenDiceTray(next => { setUsed(true); setOpen({ panel: next, path: pathname }); }), [pathname]);
  // Rolls from Roll20 (through the RPG Tools dice link extension) go into the roll log on every page, Maptable included.
  useEffect(() => listenForLinkedRolls(), []);
  // The AI button: on a page with its own AI panel (the Encyclopedia) it opens that one; elsewhere it opens one here.
  const ai = target.ai, aiKey = ai ? ai.campaignId ?? `m:${ai.maptableCampaignId}` : "";
  const [aiOpen, setAiOpen] = useState<{ key: string; n: number }>({ key: "", n: 0 });
  const openAi = () => { if (ai?.here) window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT)); else if (ai) setAiOpen(o => ({ key: aiKey, n: o.key === aiKey ? o.n + 1 : 1 })); };
  // "Ask" on the dashboard's AI widget asks for the chat the same way.
  useEffect(() => {
    if (!ai || ai.here) return;
    // Once the panel is made it hears the event itself, so this only makes it the first time.
    const on = () => setAiOpen(o => o.key === aiKey && o.n > 0 ? o : { key: aiKey, n: 1 });
    window.addEventListener(OPEN_CHAT_EVENT, on);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, on);
  }, [ai, aiKey]);
  // In a campaign bar the buttons sit in its slot, and the tray opens just below them.
  const slot = useSyncExternalStore(diceSlotStore.subscribe, diceSlotStore.get, diceSlotStore.getServer);
  const [dock, setDock] = useState<CSSProperties>();
  useLayoutEffect(() => {
    if (!slot || !panel) return;
    const place = () => { const z = uiZoom(), r = slot.getBoundingClientRect(); if (r.width) setDock(diceDockBelow({ bottom: r.bottom / z, right: r.right / z }, window.innerWidth / z, window.innerHeight / z)); };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [slot, panel]);
  const shared = <><LinkedRollPopup /><RollDialogHost /><DiceThrower /></>;
  if (hasOwnDice(pathname)) return shared;
  const toggle = (next: Exclude<DicePanel, null>) => { setUsed(true); setPanel(panel === next ? null : next); };
  const buttons = <div className={`global-dice${slot ? " global-dice--bar" : ""}`} role="group" aria-label="Dice and AI">
      {ai && <button type="button" title="Ask your AI about this campaign" aria-label="Ask AI" onClick={openAi}><Bot size={18} aria-hidden="true" /><span>AI</span></button>}
      <button type="button" aria-expanded={panel === "dice"} aria-controls="standard-dice-tray" title="Dice tray" aria-label="Dice tray" onClick={() => toggle("dice")}><Dices size={18} aria-hidden="true" /><span>Dice</span></button>
      <button type="button" className="global-dice-icon" aria-expanded={panel === "log"} aria-controls="local-roll-log" title="Roll log" aria-label="Roll log" onClick={() => toggle("log")}><ScrollText size={18} aria-hidden="true" /></button>
    </div>;
  return <>
    {shared}
    {slot ? createPortal(buttons, slot) : rollsHere(pathname) ? buttons : null}
    {ai && !ai.here && aiOpen.key === aiKey && aiOpen.n > 0 && <AiActivity key={aiKey} floating openSignal={aiOpen.n} campaignId={ai.campaignId} maptableCampaignId={ai.campaignId ? undefined : ai.maptableCampaignId} onChanged={() => window.dispatchEvent(new Event("focus"))} />}
    {used && <StandardDiceTray panel={panel} onPanelChange={setPanel} placement={slot ? "below" : "above"} style={slot ? dock : undefined} scene={null} discord={target.discord} localNote={target.note} />}
  </>;
}
