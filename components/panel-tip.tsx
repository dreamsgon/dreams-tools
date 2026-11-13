"use client";
import { useId, useState, type ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import "./panel-tip.css";

/**
 * One short line of guidance for a side panel. The longer how-to sits behind the "?" button,
 * so the controls stay near the top of the panel.
 */
export default function PanelTip({ children, more }: { children: ReactNode; more?: ReactNode }) {
  const [open, setOpen] = useState(false), id = useId();
  return <div className="panel-tip">
    <p>{children}{more && <button type="button" className="panel-tip-toggle" aria-expanded={open} aria-controls={id} aria-label={open ? "Hide tips" : "More tips"} title={open ? "Hide tips" : "More tips"} onClick={() => setOpen(v => !v)}><CircleHelp size={14} aria-hidden="true" /></button>}</p>
    {more && open && <div className="panel-tip-more" id={id}>{more}</div>}
  </div>;
}
