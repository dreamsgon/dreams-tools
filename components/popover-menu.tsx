"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** A button that opens a small panel below it. Closes on outside click or Escape. */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => { if (!wrapper.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return { open, setOpen, wrapper };
}

export type MenuItem = { icon: ReactNode; label: string; hint: string; onClick: () => void; disabled?: boolean; divider?: boolean };

/** A menu of actions, each with a one-line hint. */
export function ActionMenu({ label, trigger, items, className = "" }: { label: string; trigger: ReactNode; items: MenuItem[]; className?: string }) {
  const { open, setOpen, wrapper } = usePopover();
  return <div className={`action-menu ${className}`.trim()} ref={wrapper}>
    <button type="button" className="primary action-menu-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(v => !v)}>{trigger}</button>
    {open && <div className="action-menu-panel" role="menu" aria-label={label}>
      {items.map((item, i) => <div key={item.label}>
        {item.divider && i > 0 && <hr />}
        <button type="button" role="menuitem" disabled={item.disabled} onClick={() => { setOpen(false); item.onClick(); }}>
          <span className="action-menu-icon" aria-hidden="true">{item.icon}</span>
          <span><strong>{item.label}</strong><small>{item.hint}</small></span>
        </button>
      </div>)}
    </div>}
  </div>;
}
