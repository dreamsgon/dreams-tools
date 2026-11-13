"use client";
import "./save-chip.css";
import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Circle, CloudOff, Loader2, Save } from "lucide-react";
import { savePhase, type SavePhase } from "@/lib/save-phase";
import { unsavedLabel } from "@/lib/autosave";

/*
 * The one save status, in the header of Maptable and the Encyclopedia. Changes save on their own a moment
 * after each edit unless Save automatically is off; the chip says where that stands, and clicking it saves
 * now, retries a failed save, or jumps to the conflict notice. Its arrow opens Save now and the switch.
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
export type AutosaveControl = { on: boolean; set: (on: boolean) => void; changes: number; lastSaved: Date | null };
const time = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export default function SaveChip({ status, error, conflict, onSave, hints: own, autosave }: { status: string; error: string; conflict: boolean; onSave: () => void; hints?: Partial<Record<SavePhase, string>>; autosave?: AutosaveControl }) {
  const phase = savePhase(status, error, conflict), manual = autosave ? !autosave.on : false;
  const [open, setOpen] = useState(false), box = useRef<HTMLSpanElement>(null), id = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); box.current?.querySelector<HTMLElement>(".save-chip-more")?.focus(); } };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key, true); };
  }, [open]);
  const Icon = phase === "saved" ? Check : phase === "unsaved" ? Circle : phase === "saving" || phase === "loading" ? Loader2 : phase === "offline" ? CloudOff : AlertTriangle;
  const label = manual && phase === "unsaved" ? unsavedLabel(autosave!.changes) : manual && phase === "saved" ? "Saved · autosave off" : labels[phase];
  const hint = phase === "failed" && error ? `${error} Click to try again.`
    : manual && phase === "unsaved" ? "Save automatically is off. Click Save or press Ctrl/Cmd+S."
    : manual && phase === "saved" ? "Save automatically is off. Ctrl/Cmd+S saves." : own?.[phase] ?? hints[phase];
  function click() {
    if (phase === "conflict") {
      const notice = document.querySelector<HTMLElement>(".save-conflict-notice");
      notice?.scrollIntoView({ block: "center", behavior: "smooth" });
      notice?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
      return;
    }
    if (phase === "unsaved" || phase === "failed" || phase === "saved") onSave();
  }
  const chip = <button type="button" className={`save-chip ${phase}${manual ? " manual" : ""}`} title={hint} aria-label={`${label}. ${hint}`} data-short={manual && phase === "unsaved" && autosave!.changes > 0 ? String(autosave!.changes) : undefined} onClick={click} disabled={phase === "loading" || phase === "offline"}>
    <Icon size={phase === "unsaved" ? 9 : 14} aria-hidden="true" className={phase === "saving" || phase === "loading" ? "save-chip-spin" : undefined} fill={phase === "unsaved" ? "currentColor" : "none"} />
    <span aria-live="polite">{label}</span>
  </button>;
  if (!autosave) return chip;
  const canSave = phase === "unsaved" || phase === "failed" || phase === "saved";
  return <span className={`save-chip-group ${phase}${manual ? " manual" : ""}`} ref={box}>
    {chip}
    <button type="button" className="save-chip-more" aria-label="Save options" title="Save options" aria-haspopup="true" aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}><ChevronDown size={14} aria-hidden="true" /></button>
    {manual && phase === "unsaved" && <button type="button" className="save-chip-save" onClick={onSave}><Save size={14} aria-hidden="true" /><span>Save</span></button>}
    {open && <div className="save-chip-menu" id={id} role="group" aria-label="Save options">
      <button type="button" className="save-chip-now" disabled={!canSave} onClick={() => { setOpen(false); onSave(); }}><Save size={15} aria-hidden="true" />Save now<kbd>Ctrl+S</kbd></button>
      <hr />
      <label className="save-chip-switch"><input type="checkbox" role="switch" checked={autosave.on} onChange={e => autosave.set(e.target.checked)} /><span aria-hidden="true" />Save automatically</label>
      <p>{autosave.on ? "Changes save a moment after each edit." : "Nothing saves until you press Save or Ctrl+S. Leaving the page with unsaved changes asks first."}</p>
      <hr />
      {(autosave.lastSaved || (manual && autosave.changes > 0)) && <p className="save-chip-when">{autosave.lastSaved ? `Last saved ${time(autosave.lastSaved)}` : "Not saved yet this visit"}{phase === "unsaved" && autosave.changes > 0 ? ` · ${autosave.changes} change${autosave.changes === 1 ? "" : "s"} since` : ""}</p>}
      <p className="save-chip-note">This choice is kept on this device, for Maptable and the Encyclopedia.</p>
    </div>}
  </span>;
}
