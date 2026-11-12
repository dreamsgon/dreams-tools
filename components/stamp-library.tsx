"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import { findStamps, stampCategories, type Stamp } from "@/lib/map-stamps";

/** A stamp's art on its own, for the library tiles. */
export function StampPicture({ stamp, ink = "#2b2b2b" }: { stamp: Stamp; ink?: string }) {
  return <svg viewBox={`0 0 ${stamp.w * 40} ${stamp.h * 40}`} aria-hidden="true">
    {stamp.parts.map((p, i) => <path key={i} d={p.d} fill={p.fill ?? "none"} stroke={p.stroke === "ink" ? ink : p.stroke ?? "none"} strokeWidth={p.width} strokeLinejoin="round" strokeLinecap="round"/>)}
  </svg>;
}

/** The Stamps tool's library: pick one to place with a click, or drag it onto the map. */
export default function StampLibrary({ chosen, choose, ink }: { chosen: string; choose: (id: string) => void; ink?: string }) {
  const [query, setQuery] = useState("");
  const found = findStamps(query);
  return <div className="creator-panel creator-stamps">
    <label className="creator-search"><Search size={15} aria-hidden="true"/><input aria-label="Find a stamp" placeholder="Find a stamp" value={query} onChange={e => setQuery(e.target.value)}/></label>
    {stampCategories.map(category => {
      const list = found.filter(s => s.category === category);
      if (!list.length) return null;
      return <section key={category} aria-label={category}>
        <h3>{category}</h3>
        <div className="creator-stamp-grid">{list.map(s => <button key={s.id} type="button" draggable aria-pressed={chosen === s.id} className={chosen === s.id ? "active" : ""}
          title={`${s.name}, ${s.w} × ${s.h} square${s.w * s.h > 1 ? "s" : ""}`}
          onClick={() => choose(s.id)}
          onDragStart={e => { choose(s.id); e.dataTransfer.setData("application/x-map-stamp", s.id); e.dataTransfer.effectAllowed = "copy"; }}>
          <StampPicture stamp={s} ink={ink}/>{s.name}
        </button>)}</div>
      </section>;
    })}
    {!found.length && <p className="creator-measure">No stamps match “{query}”.</p>}
    <p className="creator-measure">Click the map to place the chosen stamp, or drag one onto it. Stamps snap to the grid; hold Alt to place freely.</p>
  </div>;
}
