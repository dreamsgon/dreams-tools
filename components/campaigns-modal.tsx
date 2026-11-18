"use client";
import { useEffect } from "react";
import "./campaigns.css";

/** A centred dialog with a head, a scrolling body and a footer of buttons. Escape or a tap on the backdrop closes it. */
export function Modal({ title, intro, children, footer, close, wide }: { title: string; intro?: string; children: React.ReactNode; footer: React.ReactNode; close: () => void; wide?: boolean }) {
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [close]);
  return <div className="campaigns-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <div className={`campaigns-modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="campaigns-modal-head"><h2>{title}</h2>{intro && <p>{intro}</p>}</div>
      <div className="campaigns-modal-body">{children}</div>
      <div className="campaigns-modal-foot">{footer}</div>
    </div>
  </div>;
}
