"use client";
import { useEffect, useState } from "react";

export default function TokenColor({ label, value, onChange }: {
  label: string; value: string; onChange: (color: string) => void;
}) {
  const [hex, setHex] = useState(value);
  useEffect(() => setHex(value), [value]);
  return <span className="token-color-control">
    <input type="color" aria-label={label} value={value} onChange={e => { setHex(e.target.value); onChange(e.target.value); }} />
    <input type="text" aria-label={`${label} hex`} value={hex} spellCheck={false} placeholder="#388565"
      onChange={e => {
        const next = e.target.value.trim();
        setHex(next);
        if (/^#?[0-9a-f]{6}$/i.test(next)) onChange(`#${next.replace(/^#/, "")}`);
      }}
      onBlur={() => {
        if (/^#?[0-9a-f]{3}$/i.test(hex)) {
          const full = `#${hex.replace(/^#/, "").split("").map(c => c + c).join("")}`;
          setHex(full); onChange(full);
        } else setHex(value);
      }} />
  </span>;
}
