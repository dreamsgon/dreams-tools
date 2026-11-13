"use client";
import "./save-chip.css";
import { AlertTriangle, Check, Circle, CloudOff, Loader2 } from "lucide-react";
import { savePhase, type SavePhase } from "@/lib/save-phase";

/*
 * Maptable's one save status, in the header of the board and the campaign list.
 * Changes save on their own a moment after each edit; the chip says where that stands,
 * and clicking it saves now, retries a failed save, or jumps to the conflict notice.
 */
const labels: Record<SavePhase, string> = {
  saved: "Saved", unsaved: "Unsaved changes", saving: "Saving…", failed: "Not saved · Retry",
  conflict: "Conflict", loading: "Loading…", offline: "Offline",
};
const hints: Record<SavePhase, string> = {
  saved: "Changes save automatically. Ctrl/Cmd+S saves now.",
  unsaved: "Saving in a moment. Click or press Ctrl/Cmd+S to save now.",
  saving: "Saving your changes to the cloud.",
  failed: "The last save did not reach the cloud. Click to try again.",
  conflict: "Another device saved changes. Click to see your options.",
  loading: "Loading your maps.",
  offline: "Your maps could not be loaded, so changes cannot be saved.",
};

export default function SaveChip({ status, error, conflict, onSave }: { status: string; error: string; conflict: boolean; onSave: () => void }) {
  const phase = savePhase(status, error, conflict);
  const Icon = phase === "saved" ? Check : phase === "unsaved" ? Circle : phase === "saving" || phase === "loading" ? Loader2 : phase === "offline" ? CloudOff : AlertTriangle;
  const hint = phase === "failed" && error ? `${error} Click to try again.` : hints[phase];
  function click() {
    if (phase === "conflict") {
      const notice = document.querySelector<HTMLElement>(".save-conflict-notice");
      notice?.scrollIntoView({ block: "center", behavior: "smooth" });
      notice?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
      return;
    }
    if (phase === "unsaved" || phase === "failed" || phase === "saved") onSave();
  }
  return <button type="button" className={`save-chip ${phase}`} title={hint} aria-label={`${labels[phase]}. ${hint}`} onClick={click} disabled={phase === "loading" || phase === "offline"}>
    <Icon size={phase === "unsaved" ? 9 : 14} aria-hidden="true" className={phase === "saving" || phase === "loading" ? "save-chip-spin" : undefined} fill={phase === "unsaved" ? "currentColor" : "none"} />
    <span aria-live="polite">{labels[phase]}</span>
  </button>;
}
