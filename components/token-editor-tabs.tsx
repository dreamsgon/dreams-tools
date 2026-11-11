"use client";
import { useId, useRef, useState, type ReactNode } from "react";
import "./token-editor-tabs.css";

export default function TokenEditorTabs({ sections }: { sections: { id: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(sections[0].id);
  const prefix = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return <div className="token-editor-tabs">
    <div role="tablist" aria-label="Token options" className="token-editor-tablist">
      {sections.map((section, index) => <button key={section.id} type="button" role="tab" id={`${prefix}-${section.id}-tab`} aria-controls={`${prefix}-${section.id}-panel`} aria-selected={active === section.id} tabIndex={active === section.id ? 0 : -1} ref={node => { buttons.current[index] = node; }} onClick={() => setActive(section.id)} onKeyDown={event => {
        let next = index;
        if (event.key === "ArrowRight") next = (index + 1) % sections.length;
        else if (event.key === "ArrowLeft") next = (index + sections.length - 1) % sections.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = sections.length - 1;
        else return;
        event.preventDefault(); setActive(sections[next].id); buttons.current[next]?.focus();
      }}>{section.label}</button>)}
    </div>
    {sections.map(section => <div key={section.id} hidden={section.id !== active} role="tabpanel" id={`${prefix}-${section.id}-panel`} aria-labelledby={`${prefix}-${section.id}-tab`} tabIndex={0} className="token-editor-panel">{section.content}</div>)}
  </div>;
}
