"use client";
import { Eye } from "lucide-react";
import { setViewAsPlayer } from "@/lib/view-as-player";
import "./account-menu.css";

/** Shown under the bar while Switch to Player view is on (lib/view-as-player.ts), with the way back. */
export default function PlayerViewBanner({ children }: { children?: React.ReactNode }) {
  return <div className="pv-banner" role="status">
    <Eye size={16} aria-hidden="true" />
    <span><strong>Player view.</strong> {children ?? "You see what your players see."} Your GM tools are hidden until you switch back.</span>
    <button type="button" onClick={() => setViewAsPlayer(false)}>Back to GM view</button>
  </div>;
}
