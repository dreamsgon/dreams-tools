"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { MapDrawing, MapShape, MapStyle } from "@/lib/model";
import { mapStylePresets, unstyledColours, type MapStylePreset } from "@/lib/map-style";
import DrawingShape, { DrawingBackground } from "./drawing-shape";

const SAVED = "map-creator:styles";
/** The plain look the Map Creator had before styles: kept as the first choice. */
export const plainBackground = "#8b9b75";
function readSaved(): MapStylePreset[] {
  try { const value = JSON.parse(localStorage.getItem(SAVED) ?? "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
}
function writeSaved(list: MapStylePreset[]) { try { localStorage.setItem(SAVED, JSON.stringify(list)); } catch { /* Saving styles is a convenience. */ } }

/** A small sample map drawn in a style, for the preset cards. */
function Sample({ style, background }: { style: MapStyle | null; background: string }) {
  const floor = style?.floor ?? unstyledColours.floor, wall = style?.wall ?? unstyledColours.wall;
  const room = (id: string, a: [number, number], b: [number, number]): MapShape => ({ id, name: "", folderId: null, smooth: false, hidden: false, locked: false, type: "rect", roomParts: [], stamp: null, rotation: 0, flip: false, points: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }], fill: floor, stroke: wall, thickness: 5, closed: true });
  const drawing: Pick<MapDrawing, "background" | "style"> = { background, style: style && { ...style, gridSize: 20 } };
  const shapes: MapShape[] = [room("a", [16, 16], [100, 84]), room("b", [100, 40], [184, 104]),
    { ...room("d", [100, 52], [100, 72]), type: "door", stroke: wall, closed: false }];
  const prefix = `sample-${style?.preset ?? "plain"}`;
  return <svg viewBox="0 0 200 120" aria-hidden="true">
    <DrawingBackground drawing={drawing} width={200} height={120}/>
    {shapes.map(s => <DrawingShape key={s.id} shape={s} drawing={drawing} prefix={prefix}/>)}
  </svg>;
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="creator-field"><span>{label}</span>
    <div className="creator-seg" role="group" aria-label={label}>{options.map(([v, name]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{name}</button>)}</div>
  </div>;
}

/** The Style tab: preset looks for the whole map, then fine-tuning. */
export default function MapStylePanel({ drawing, gridSize, setStyle }: {
  drawing: MapDrawing; gridSize: number; setStyle: (style: MapStyle | null, background: string | null) => void;
}) {
  const [saved, setSaved] = useState<MapStylePreset[]>(readSaved);
  const style = drawing.style;
  const pick = (p: MapStylePreset) => setStyle({ ...p.style, gridSize }, p.background);
  const tune = (patch: Partial<MapStyle>) => { if (style) setStyle({ ...style, ...patch, gridSize }, null); };
  const card = (key: string, name: string, cardStyle: MapStyle | null, background: string, onClick: () => void, active: boolean, remove?: () => void) =>
    <div key={key} className={`creator-style-card${active ? " active" : ""}`}>
      <button type="button" aria-pressed={active} onClick={onClick}><Sample style={cardStyle} background={background}/>{name}</button>
      {remove && <button type="button" className="creator-style-remove" aria-label={`Remove ${name}`} title="Remove this style" onClick={remove}><X size={12}/></button>}
    </div>;
  const saveCurrent = () => {
    if (!style) return;
    const name = window.prompt("Name this style", "My style")?.trim();
    if (!name) return;
    const id = `saved-${Date.now().toString(36)}`;
    const next = [...saved, { id, name: name.slice(0, 40), background: drawing.background, style: { ...style, preset: id } }];
    setSaved(next); writeSaved(next); setStyle({ ...style, preset: id }, null);
  };
  return <div className="creator-panel creator-style-panel">
    <h3>Map style</h3>
    <div className="creator-style-grid">
      {card("plain", "Plain", null, plainBackground, () => setStyle(null, plainBackground), !style)}
      {mapStylePresets.map(p => card(p.id, p.name, p.style, p.background, () => pick(p), style?.preset === p.id))}
      {saved.map(p => card(p.id, p.name, p.style, p.background, () => pick(p), style?.preset === p.id, () => { const next = saved.filter(s => s.id !== p.id); setSaved(next); writeSaved(next); }))}
      <div className="creator-style-card add"><button type="button" disabled={!style} onClick={saveCurrent} title={style ? "Keep this look to use on other maps" : "Pick a style first"}><Plus size={18}/>Save current as a style</button></div>
    </div>
    {style ? <>
      <h3>Fine-tune</h3>
      <Seg label="Walls" value={style.walls} options={[["solid", "Solid"], ["double", "Double line"], ["rough", "Rough stone"]]} onChange={walls => tune({ walls })}/>
      <Seg label="Outside the rooms" value={style.outside} options={[["hatched", "Hatched"], ["solid", "Solid"], ["clear", "See-through"]]} onChange={outside => tune({ outside })}/>
      <Seg label="Grid lines on the floor" value={style.grid} options={[["on", "On"], ["faint", "Faint"], ["off", "Off"]]} onChange={grid => tune({ grid })}/>
      <label className="creator-check"><input type="checkbox" checked={style.shadow} onChange={e => tune({ shadow: e.target.checked })}/>Soft shadow inside walls</label>
      <div className="creator-pair">
        <label>Floor<input type="color" value={style.floor} onChange={e => tune({ floor: e.target.value })}/></label>
        <label>Walls<input type="color" value={style.wall} onChange={e => tune({ wall: e.target.value })}/></label>
      </div>
      <div className="creator-pair">
        <label>Outside<input type="color" value={drawing.background} onChange={e => setStyle({ ...style, gridSize }, e.target.value)}/></label>
        <label>Hatching<input type="color" value={style.hatch} disabled={style.outside !== "hatched"} onChange={e => tune({ hatch: e.target.value })}/></label>
      </div>
      <p className="creator-measure">A room with its own floor (water, grass) keeps it when you switch styles. Ctrl+Z puts the old style back.</p>
    </> : <p className="creator-measure">Pick a style to give the whole map a look, then fine-tune its walls, outside, grid and shadow.</p>}
  </div>;
}
