"use client";
import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowDownUp } from "lucide-react";
import { readLastExport, readLastPush, shortDate, type LastPush } from "@/lib/encyclopedia/rp-last";
import "./rp-backups.css";

// The sheet (ZIP export and import, GitHub push and restore) is a large chunk: it loads when the button is
// pointed at or focused, so the campaign page itself stays light.
const loadSheet = () => import("./rp-backups").then(m => ({ default: m.BackupsSheet }));
const BackupsSheet = dynamic(loadSheet);

/** The "GitHub & backups" button (with the last export under it) and the sheet it opens. */
export function BackupsButton({ campaignId, campaignName }: { campaignId: string; campaignName: string }) {
  const [open, setOpen] = useState(false), [last, setLast] = useState<string | null>(() => readLastExport(campaignId)), [pushed, setPushed] = useState<LastPush | null>(() => readLastPush(campaignId));
  const button = useRef<HTMLButtonElement>(null);
  const when = last ? shortDate(last) : "", pushedWhen = pushed ? shortDate(pushed.at) : "";
  const warm = () => { void loadSheet().catch(() => {}); };
  return <div className="rpb-entry">
    <button type="button" ref={button} className="hub-button rpb-open" onPointerEnter={warm} onFocus={warm} onClick={() => setOpen(true)} aria-haspopup="dialog"><ArrowDownUp size={15} aria-hidden="true" />GitHub &amp; backups</button>
    {when && <small className="rpb-last">Last exported {when}</small>}
    {pushedWhen && pushed && <small className="rpb-last">Last pushed to {pushed.repository} · {pushedWhen}</small>}
    {open && <BackupsSheet campaignId={campaignId} campaignName={campaignName} close={() => setOpen(false)} returnFocus={button} onExported={iso => setLast(iso)} onPushed={p => setPushed(p)} />}
  </div>;
}
