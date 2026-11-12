"use client";
import { useRef, useState } from "react";
import { Search, Upload } from "lucide-react";
import { customStampAsset, defaultSquares, findStamps, stampCategories, type Stamp } from "@/lib/map-stamps";
import { uid, type Asset } from "@/lib/model";
import { uploadAsset } from "@/lib/api";

/** A stamp's art on its own, for the library tiles. */
export function StampPicture({ stamp, ink = "#2b2b2b" }: { stamp: Stamp; ink?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (stamp.image) return <img src={stamp.image} alt="" style={{ aspectRatio: `${stamp.w} / ${stamp.h}`, objectFit: "contain" }}/>;
  return <svg viewBox={`0 0 ${stamp.w * 40} ${stamp.h * 40}`} aria-hidden="true">
    {stamp.parts.map((p, i) => <path key={i} d={p.d} fill={p.fill ?? "none"} stroke={p.stroke === "ink" ? ink : p.stroke ?? "none"} strokeWidth={p.width} strokeLinejoin="round" strokeLinecap="round"/>)}
  </svg>;
}

/** The Stamps tool's library: pick one to place with a click, or drag it onto the map. */
export default function StampLibrary({ chosen, choose, ink, custom = [], addStamp, resizeStamp }: {
  chosen: string; choose: (id: string) => void; ink?: string; custom?: Stamp[];
  addStamp?: (asset: Asset) => void; resizeStamp?: (assetId: string, squares: { w: number; h: number }) => void;
}) {
  const [query, setQuery] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const found = findStamps(query, custom);
  const mine = custom.find(c => c.id === chosen);
  const upload = async (picked: File) => {
    setBusy(true); setError("");
    try {
      if (picked.size > 20 * 1024 * 1024) throw new Error("Choose an image smaller than 20 MB.");
      const bitmap = await createImageBitmap(picked); const width = bitmap.width, height = bitmap.height; bitmap.close();
      if (width > 16000 || height > 16000) throw new Error("Image dimensions must be at most 16,000 pixels.");
      const { src } = await uploadAsset(picked, picked.name), id = uid();
      addStamp?.({ id, name: picked.name.slice(0, 120) || "Stamp", src, width, height, kind: "stamp", squares: defaultSquares(width, height) });
      choose(`asset:${id}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); } finally { setBusy(false); }
  };
  const size = (key: "w" | "h", value: number) => {
    if (!mine || !Number.isFinite(value)) return;
    resizeStamp?.(customStampAsset(mine.id)!, { w: mine.w, h: mine.h, [key]: Math.min(10, Math.max(1, Math.round(value))) });
  };
  return <div className="creator-panel creator-stamps">
    <label className="creator-search"><Search size={15} aria-hidden="true"/><input aria-label="Find a stamp" placeholder="Find a stamp" value={query} onChange={e => setQuery(e.target.value)}/></label>
    {addStamp && <div className="creator-stamp-upload">
      <button type="button" disabled={busy} onClick={() => file.current?.click()}><Upload size={15}/> {busy ? "Uploading…" : "Upload your own stamp"}</button>
      <input ref={file} type="file" accept="image/png,image/webp,image/jpeg,image/svg+xml" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }}/>
      <small>A PNG or WebP with a transparent background works best. It is kept in your Maptable assets.</small>
      {error && <p className="creator-error" role="alert">{error}</p>}
    </div>}
    {mine && resizeStamp && <div className="creator-pair creator-stamp-size">
      <label>Width in squares<input type="number" min={1} max={10} value={mine.w} onChange={e => size("w", e.target.valueAsNumber)}/></label>
      <label>Height in squares<input type="number" min={1} max={10} value={mine.h} onChange={e => size("h", e.target.valueAsNumber)}/></label>
    </div>}
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
