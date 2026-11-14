"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { isHexColour } from "@/lib/colour";
import "./custom-colour-swatch.css";

/**
 * A round "any colour" choice to sit at the end of a row of colour swatches. It opens the browser's own
 * colour picker. It shows a rainbow until the current value is a colour that is not one of the swatches,
 * then it shows that colour and is marked as the chosen one. The new colour is saved when the picker closes,
 * so dragging around in it does not save over and over.
 */
export function CustomColourSwatch({ value, presets, onChange, label = "Pick any colour", className }: {
  value: string | undefined; presets: readonly string[]; onChange: (colour: string) => void; label?: string; className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string>();
  const current = draft ?? value;
  const custom = isHexColour(current) && !presets.some(p => p.toLowerCase() === current.toLowerCase());
  const commit = (colour: string) => { setDraft(undefined); if (colour !== value) onChange(colour); };
  // The browser's "change" event means the picker was closed; React's onChange fires while it is still open.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const done = () => commit(el.value);
    el.addEventListener("change", done);
    return () => el.removeEventListener("change", done);
  });
  return <label className={`custom-colour${custom ? " is-chosen" : ""}${className ? ` ${className}` : ""}`} title={label} style={custom ? { "--custom": current } as CSSProperties : undefined}>
    <input ref={input} type="color" aria-label={custom ? `${label} (chosen: ${current})` : label} value={isHexColour(current) ? current.toLowerCase() : "#808080"}
      onChange={e => setDraft(e.target.value)} onBlur={e => { if (draft) commit(e.target.value); }} />
  </label>;
}
