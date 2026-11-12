"use client";
import { useMemo, useState } from "react";
import { Dices, ImageUp, X } from "lucide-react";
import { generateMap, generatorKinds, generatorSizes, randomSeed, suggestedStyle, generatorStyle, type GeneratedMap, type GeneratorKind, type GeneratorSize } from "@/lib/map-generator";
import { mapStylePresets } from "@/lib/map-style";
import { orderedShapes } from "@/lib/map-drawing";
import DrawingShape, { DrawingBackground } from "./drawing-shape";

type Tab = "generate" | "trace" | "blank";
/**
 * Start a new map: generate one from a seed, trace over an image, or start blank.
 * Generated maps are ordinary shapes, so everything can be edited afterwards.
 */
export default function NewMapDialog({ grid, close, start, trace }: {
  grid: number; close: () => void;
  start: (map: GeneratedMap) => void;
  trace: (file: File, squares: { cols: number; rows: number }) => void;
}) {
  const [tab, setTab] = useState<Tab>("generate");
  const [kind, setKind] = useState<GeneratorKind>("dungeon");
  const [size, setSize] = useState<GeneratorSize>("medium");
  const [rooms, setRooms] = useState(8);
  const [style, setStyle] = useState<string | null>(null);
  const [seed, setSeed] = useState(() => randomSeed());
  const [cols, setCols] = useState(30), [rows, setRows] = useState(20);
  const [file, setFile] = useState<File | null>(null);
  const chosenStyle = style ?? suggestedStyle[kind];
  const map = useMemo(() => generateMap({ kind, size, rooms, style: chosenStyle, seed: seed.trim() || "map", grid }), [kind, size, rooms, chosenStyle, seed, grid]);
  const styles: [string, string][] = [["outdoor", "Outdoor"], ...mapStylePresets.map(p => [p.id, p.name] as [string, string])];
  const blank = (): GeneratedMap => {
    const look = style ? generatorStyle(style, grid) : null;
    return { name: "New drawn map", width: cols * grid, height: rows * grid, drawing: { background: look?.background ?? "#8b9b75", style: look?.style ?? null, shapes: [], folders: [], layerOrder: [] } };
  };
  const squares = (value: number, set: (n: number) => void, label: string) => <label>{label}<input type="number" min={3} max={Math.floor(8000 / grid)} value={value} onChange={e => { const n = Math.round(+e.target.value); if (n >= 3 && n <= 8000 / grid) set(n); }}/></label>;
  return <div className="creator-dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <div className="creator-dialog" role="dialog" aria-modal="true" aria-labelledby="new-map-title" onKeyDown={e => { if (e.key === "Escape") close(); }}>
      <header><h2 id="new-map-title">Start a new map</h2><button className="creator-icon" aria-label="Close" onClick={close}><X size={18}/></button></header>
      <div className="creator-tabs" role="tablist" aria-label="How to start">
        {([["generate", "Generate"], ["trace", "Trace an image"], ["blank", "Blank map"]] as [Tab, string][]).map(([id, name]) =>
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{name}</button>)}
      </div>
      {tab === "generate" && <div className="creator-dialog-body">
        <div className="creator-panel">
          <div className="creator-kinds">{generatorKinds.map(k => <button key={k.id} type="button" aria-pressed={kind === k.id} className={kind === k.id ? "active" : ""} onClick={() => { setKind(k.id); setStyle(null); }}>{k.name}<span>{k.hint}</span></button>)}</div>
          <div className="creator-field"><span>Size</span><div className="creator-seg" role="group" aria-label="Size">{(Object.keys(generatorSizes) as GeneratorSize[]).map(s => <button key={s} type="button" aria-pressed={size === s} onClick={() => setSize(s)}>{generatorSizes[s].name} {generatorSizes[s].cols}×{generatorSizes[s].rows}</button>)}</div></div>
          <label>How many {kind === "village" ? "houses" : kind === "cave" ? "caverns" : kind === "wilderness" ? "clearings" : "rooms"} <output>{rooms}</output><input type="range" min={2} max={size === "small" ? 10 : size === "medium" ? 14 : 20} value={rooms} onChange={e => setRooms(+e.target.value)}/></label>
          <label>Style<select value={chosenStyle} onChange={e => setStyle(e.target.value)}>{styles.map(([id, name]) => <option key={id} value={id}>{name}{id === suggestedStyle[kind] ? " (suggested)" : ""}</option>)}</select></label>
          <div className="creator-field"><span>Seed (the same seed always makes the same map)</span>
            <div className="creator-seed"><input aria-label="Seed" value={seed} maxLength={40} onChange={e => setSeed(e.target.value)}/><button type="button" onClick={() => setSeed(randomSeed())}><Dices size={15}/> Reroll</button></div>
          </div>
        </div>
        <div className="creator-preview">
          <svg viewBox={`0 0 ${map.width} ${map.height}`} role="img" aria-label="Preview of the generated map">
            <DrawingBackground drawing={map.drawing} width={map.width} height={map.height}/>
            {orderedShapes(map.drawing).map(s => <DrawingShape key={s.id} shape={s} drawing={map.drawing} prefix="preview"/>)}
          </svg>
          <p className="creator-measure">Every room, door and stamp is an ordinary shape, so you can move, restyle or delete any of it afterwards. Rooms are numbered for you.</p>
        </div>
      </div>}
      {tab === "trace" && <div className="creator-dialog-body single">
        <div className="creator-panel">
          <p className="creator-measure">Put a sketch, a scanned module map or a screenshot under the drawing at half strength, line it up with the grid, and draw over it. The image stays on this device and is left out when you save.</p>
          <label className="creator-file"><ImageUp size={18}/>{file ? file.name : "Choose an image"}<input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>
          <div className="creator-pair">{squares(cols, setCols, "Map width (squares)")}{squares(rows, setRows, "Map length (squares)")}</div>
          <p className="creator-measure">Count the squares on your image if it has a grid. You can change the size and line the image up after.</p>
        </div>
      </div>}
      {tab === "blank" && <div className="creator-dialog-body single">
        <div className="creator-panel">
          <div className="creator-pair">{squares(cols, setCols, "Width (squares)")}{squares(rows, setRows, "Length (squares)")}</div>
          <label>Style<select value={style ?? ""} onChange={e => setStyle(e.target.value || null)}><option value="">Plain</option>{styles.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        </div>
      </div>}
      <footer>
        <button onClick={close}>Cancel</button>
        {tab === "generate" && <button className="primary" onClick={() => start(map)}>Use this map</button>}
        {tab === "trace" && <button className="primary" disabled={!file} onClick={() => file && trace(file, { cols, rows })}>Start tracing</button>}
        {tab === "blank" && <button className="primary" onClick={() => start(blank())}>Start drawing</button>}
      </footer>
    </div>
  </div>;
}
