"use client";
import { useMemo, useState, type ReactNode } from "react";
import { Dices, ImageUp, Save, Sparkles, X } from "lucide-react";
import { generateMap, randomSeed, generatorStyle, type GeneratedMap } from "@/lib/map-generator";
import { buildDungeonMap, defaultLookOptions, dungeonLayouts, dungeonSizes, floorPatterns, keyNote, layoutFloor, type DungeonOptions, type DungeonSize, type FloorPattern } from "@/lib/dungeon/drawing";
import { defaultDressOptions, layoutTheme, themeById, themesFor } from "@/lib/dungeon/dressing";
import { defaultLayoutOptions, type LayoutId } from "@/lib/dungeon/layout";
import { mapStylePresets } from "@/lib/map-style";
import { orderedShapes } from "@/lib/map-drawing";
import DrawingShape, { DrawingBackground } from "./drawing-shape";
import HexMapPanel from "./hexmap-panel";

type Tab = "generate" | "trace" | "blank";
/** What the generator makes: one of the dungeon layouts, the older wilderness map, or a hex map. */
type Kind = LayoutId | "wilderness" | "hex";
const kinds: { id: Kind; name: string; hint: string }[] = [
  ...dungeonLayouts,
  { id: "wilderness", name: "Wilderness", hint: "Clearings, paths, a river" },
  { id: "hex", name: "Hex map", hint: "A region of hexes: land, sea, places" },
];
/** The little picture on each layout's card. */
const icons: Record<Kind, ReactNode> = {
  branching: <><rect width="34" height="34" fill="#3a3d40"/><g fill="#e9e4d6" stroke="#2b2b2b"><rect x="12" y="22" width="10" height="8"/><rect x="15.5" y="14" width="3" height="8"/><rect x="11" y="5" width="12" height="9"/><rect x="3" y="7" width="8" height="3"/><rect x="2" y="10" width="6" height="8"/><rect x="23" y="8" width="5" height="3"/></g></>,
  halls: <><rect width="34" height="34" fill="#e2d2a8"/><g fill="#f3e7c9" stroke="#5a3e22"><rect x="9" y="3" width="16" height="8"/><rect x="15" y="11" width="4" height="23"/><rect x="3" y="14" width="10" height="7"/><rect x="21" y="14" width="10" height="7"/><rect x="3" y="24" width="10" height="7"/><rect x="21" y="24" width="10" height="7"/></g></>,
  caves: <><rect width="34" height="34" fill="#2a241d"/><path d="M5 9c4-5 10-2 13-4s10 0 11 6-4 7-3 11-3 9-9 8-7-5-11-6S1 14 5 9z" fill="#b9ab92" stroke="#6e5d48" strokeWidth="1.4"/><ellipse cx="22" cy="21" rx="4" ry="3" fill="#5b88a8"/></>,
  building: <><rect width="34" height="34" fill="#56604a"/><rect x="4" y="5" width="26" height="24" fill="#c79a63" stroke="#3b2a1a" strokeWidth="1.8"/><path d="M16 5v13M4 18h26M22 18v11" stroke="#3b2a1a" strokeWidth="1.1"/></>,
  village: <><rect width="34" height="34" fill="#7d9a5c"/><path d="M0 18c8-2 14 1 34-1M17 0v34" stroke="#c4ab7f" strokeWidth="3.4" fill="none"/><g fill="#c9a978" stroke="#4a3826"><rect x="4" y="6" width="8" height="7"/><rect x="21" y="5" width="9" height="7"/><rect x="5" y="23" width="7" height="6"/><rect x="22" y="22" width="8" height="8"/></g></>,
  wilderness: <><rect width="34" height="34" fill="#7d9a5c"/><path d="M20 0c-6 9 4 16-3 34" stroke="#4f86b0" strokeWidth="3.4" fill="none"/><ellipse cx="9" cy="11" rx="6" ry="5" fill="#a9bf7c" stroke="#6b8a4c"/><g fill="#2f5a2a"><circle cx="27" cy="8" r="3"/><circle cx="8" cy="26" r="3"/><circle cx="28" cy="25" r="3"/></g></>,
  hex: <><rect width="34" height="34" fill="#5f8fb4"/><g stroke="#2b3a2a" strokeWidth=".8"><path d="M10 6l5 3v6l-5 3-5-3V9z" fill="#9fbf6a"/><path d="M20 12l5 3v6l-5 3-5-3v-6z" fill="#7e9f4f"/><path d="M10 18l5 3v6l-5 3-5-3v-6z" fill="#d9c58f"/></g></>,
};
const counts: Record<Exclude<Kind, "hex">, { label: string; min: number; max: number; start: number }> = {
  branching: { label: "Rooms", min: 3, max: 24, start: 9 }, halls: { label: "Rooms", min: 3, max: 24, start: 9 }, caves: { label: "Chambers", min: 2, max: 14, start: 6 },
  building: { label: "Rooms", min: 2, max: 16, start: 6 }, village: { label: "Houses", min: 3, max: 24, start: 10 }, wilderness: { label: "Clearings", min: 2, max: 14, start: 6 },
};
const dungeon = ["branching", "halls"] as const;
const few = (v: number) => v < .2 ? "Few" : v < .45 ? "Some" : v < .75 ? "Many" : "Lots";
const pct = (v: number) => `${Math.round(v * 100)}%`;
const sizeWord = (v: number) => v < .25 ? "Small" : v < .6 ? "Medium" : v < .85 ? "Large" : "Huge";
const familyKind = { branching: "dungeon", halls: "dungeon", caves: "cave", building: "building", village: "village" } as const;
type Settings = Omit<DungeonOptions, "layout" | "grid" | "style" | "floor" | "theme" | "mix">;
/** Saved generator settings, kept on this device. */
type Preset = { name: string; kind: Exclude<Kind, "hex" | "wilderness">; o: Partial<Settings>; count: number; style: string | null; floor: FloorPattern | null; theme: string | null; mix: Record<string, number> | null };
const presetKey = "map-generator-presets";
const builtInPresets: Preset[] = [
  { name: "Crypt, 9 rooms", kind: "branching", o: {}, count: 9, style: "stone", floor: "flag", theme: "crypt", mix: null },
  { name: "Tavern", kind: "building", o: {}, count: 6, style: "timber", floor: "boards", theme: "tavern", mix: null },
];
function loadPresets(): Preset[] { try { const v = JSON.parse(localStorage.getItem(presetKey) ?? "null"); return Array.isArray(v) ? v : builtInPresets; } catch { return builtInPresets; } }
function savePresets(list: Preset[]) { try { localStorage.setItem(presetKey, JSON.stringify(list)); } catch { /* storage may be off */ } }

/**
 * Start a new map: generate one (dungeon layouts, a building, a village, wilderness or a hex map),
 * trace over an image, or start blank. Generated maps are ordinary shapes, so everything can be edited afterwards.
 */
export default function NewMapDialog({ grid, close, start, trace }: {
  grid: number; close: () => void;
  start: (map: GeneratedMap) => void;
  trace: (file: File, squares: { cols: number; rows: number }) => void;
}) {
  const [tab, setTab] = useState<Tab>("generate");
  const [kind, setKind] = useState<Kind>("branching");
  const [o, setO] = useState<Settings>(() => { const { theme: _t, mix: _m, ...dress } = defaultDressOptions; const { floor: _f, ...look } = defaultLookOptions; void _t; void _m; void _f; return { ...defaultLayoutOptions, ...look, ...dress, size: "m", seed: randomSeed(), dressing: 0, numbers: true }; });
  const [floor, setFloor] = useState<FloorPattern | null>(null), [theme, setTheme] = useState<string | null>(null);
  const [mixes, setMixes] = useState<Record<string, Record<string, number>>>({});
  const [presets, setPresets] = useState<Preset[]>(() => typeof window === "undefined" ? builtInPresets : loadPresets());
  const [count, setCount] = useState<Record<string, number>>(() => Object.fromEntries(Object.entries(counts).map(([k, c]) => [k, c.start])));
  const [style, setStyle] = useState<string | null>(null);
  const [cols, setCols] = useState(30), [rows, setRows] = useState(20);
  const [file, setFile] = useState<File | null>(null);
  const set = <K extends keyof typeof o>(k: K, v: (typeof o)[K]) => setO(prev => ({ ...prev, [k]: v }));
  const suggested = kind === "wilderness" || kind === "hex" ? "outdoor" : dungeonLayouts.find(l => l.id === kind)!.style;
  const chosenStyle = style ?? suggested;
  const n = kind === "hex" ? 0 : count[kind];
  const layoutKind = kind === "hex" || kind === "wilderness" ? null : kind;
  const chosenFloor = floor ?? (layoutKind ? layoutFloor[layoutKind] : "plain");
  const themes = layoutKind ? themesFor(familyKind[layoutKind]) : [];
  const chosenTheme = theme && themes.some(t => t.id === theme) ? theme : layoutKind ? layoutTheme[layoutKind] : "crypt";
  const mix = mixes[chosenTheme] ?? themeById(chosenTheme).mix;
  const map = useMemo(() => {
    if (kind === "hex") return null;
    const seed = o.seed.trim() || "map";
    if (kind === "wilderness") return generateMap({ kind: "wilderness", size: o.size === "s" ? "small" : o.size === "m" ? "medium" : "large", rooms: n, style: chosenStyle, seed: o.dressing ? `${seed}~${o.dressing}` : seed, grid });
    return buildDungeonMap({ ...o, layout: kind, rooms: n, houses: n, style: chosenStyle, grid, floor: chosenFloor, theme: chosenTheme, mix });
  }, [kind, o, n, chosenStyle, grid, chosenFloor, chosenTheme, mix]);
  const styles: [string, string][] = [["outdoor", "Outdoor"], ...mapStylePresets.map(p => [p.id, p.name] as [string, string])];
  const blank = (): GeneratedMap => {
    const look = style ? generatorStyle(style, grid) : null;
    return { name: "New drawn map", width: cols * grid, height: rows * grid, drawing: { background: look?.background ?? "#8b9b75", style: look?.style ?? null, shapes: [], folders: [], layerOrder: [] } };
  };
  const squares = (value: number, change: (n: number) => void, label: string) => <label>{label}<input type="number" min={3} max={Math.floor(8000 / grid)} value={value} onChange={e => { const v = Math.round(+e.target.value); if (v >= 3 && v <= 8000 / grid) change(v); }}/></label>;
  const range = (label: string, value: number, change: (v: number) => void, shown: string, hint?: string) => <label>{label} <output>{shown}</output><input type="range" min={0} max={1} step={.05} value={value} onChange={e => change(+e.target.value)}/>{hint && <small className="muted">{hint}</small>}</label>;
  const seg = <T extends string | number>(label: string, value: T, options: [T, string][], change: (v: T) => void) => <div className="creator-field"><span>{label}</span><div className="creator-seg" role="group" aria-label={label}>{options.map(([v, name]) => <button key={String(v)} type="button" aria-pressed={value === v} onClick={() => change(v)}>{name}</button>)}</div></div>;
  const check = (label: string, value: boolean, change: (v: boolean) => void, hint?: string) => <label className="creator-check"><input type="checkbox" checked={value} onChange={e => change(e.target.checked)}/><span>{label}{hint && <small>{hint}</small>}</span></label>;
  const is = (...ids: Kind[]) => ids.includes(kind);
  const c = kind !== "hex" ? counts[kind] : null;
  const pickKind = (k: Kind) => { setKind(k); setStyle(null); setFloor(null); setTheme(null); };
  const usePreset = (p: Preset) => { setKind(p.kind); setO(prev => ({ ...prev, ...p.o })); setCount(prev => ({ ...prev, [p.kind]: p.count })); setStyle(p.style); setFloor(p.floor); setTheme(p.theme); if (p.mix && p.theme) setMixes(prev => ({ ...prev, [p.theme!]: p.mix! })); };
  const savePreset = () => {
    if (!layoutKind) return;
    const { seed: _s, dressing: _d, ...rest } = o; void _s; void _d;
    const p: Preset = { name: `${themeById(chosenTheme).name}, ${dungeonLayouts.find(l => l.id === layoutKind)!.name.toLowerCase()}`, kind: layoutKind, o: rest, count: n, style: chosenStyle, floor: chosenFloor, theme: chosenTheme, mix: mixes[chosenTheme] ?? null };
    const list = [...presets, p].slice(-8); setPresets(list); savePresets(list);
  };
  const dropPreset = (i: number) => { const list = presets.filter((_, k) => k !== i); setPresets(list); savePresets(list); };
  const section = (title: string, body: ReactNode, open = false) => <details className="creator-gen-section" open={open}><summary>{title}</summary><div>{body}</div></details>;
  const isDungeon = is("branching", "halls", "caves"), lit = o.lights, furnished = o.populate;
  return <div className="creator-dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <div className="creator-dialog creator-new-map" role="dialog" aria-modal="true" aria-labelledby="new-map-title" onKeyDown={e => { if (e.key === "Escape") close(); }}>
      <header><h2 id="new-map-title">Start a new map</h2><button className="creator-icon" aria-label="Close" onClick={close}><X size={18}/></button></header>
      <div className="creator-tabs" role="tablist" aria-label="How to start">
        {([["generate", "Generate"], ["trace", "Trace an image"], ["blank", "Blank map"]] as [Tab, string][]).map(([id, name]) =>
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{name}</button>)}
      </div>
      {tab === "generate" && <div className="creator-layouts" role="group" aria-label="What to generate">
        {kinds.map(k => <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => pickKind(k.id)}><svg viewBox="0 0 34 34" aria-hidden="true">{icons[k.id]}</svg><span><b>{k.name}</b><small>{k.hint}</small></span></button>)}
      </div>}
      {tab === "generate" && kind !== "hex" && map && c && <div className="creator-dialog-body">
        <div className="creator-panel">
          {section("Layout", <>
          {seg<DungeonSize>("Map size", o.size, (Object.keys(dungeonSizes) as DungeonSize[]).map(s => [s, `${dungeonSizes[s].name} ${dungeonSizes[s].cols}×${dungeonSizes[s].rows}`]), v => set("size", v))}
          <label>{c.label} <output>{Math.min(c.max, n)}</output><input type="range" min={c.min} max={c.max} value={Math.min(c.max, n)} onChange={e => setCount({ ...count, [kind]: +e.target.value })}/></label>
          {is(...dungeon) && range("Room size", o.roomSize, v => set("roomSize", v), sizeWord(o.roomSize))}
          {is("building") && range("Building size", o.roomSize, v => set("roomSize", v), sizeWord(o.roomSize))}
          {is("branching") && range("Branching", o.branching, v => set("branching", v), pct(o.branching), "Low follows one main route. High grows side passages.")}
          {is("branching") && range("Loops", o.loops, v => set("loops", v), few(o.loops))}
          {is("halls") && range("Cross halls", o.loops, v => set("loops", v), o.loops > .6 ? "Two" : o.loops > .2 ? "One" : "None")}
          {is("building") && range("Extra doors", o.loops, v => set("loops", v), few(o.loops))}
          {is(...dungeon) && seg<1 | 2>("Passages", o.corridor, [[1, "1 square wide"], [2, "2 squares wide"]], v => set("corridor", v))}
          {is("caves") && <>{range("Openness", o.openness, v => set("openness", v), pct(o.openness))}{range("Rough walls", o.rough, v => set("rough", v), pct(o.rough))}{range("Pools", o.pools, v => set("pools", v), few(o.pools))}</>}
          {is("building") && <>{seg("Shape", o.bshape, [["rect", "Rectangle"], ["L", "L-shape"]], v => set("bshape", v))}{check("Windows", o.windows, v => set("windows", v))}</>}
          {is("village") && <>{seg("Roads", o.roads, [["one", "Main street"], ["cross", "Crossroads"], ["ring", "Ring road"]], v => set("roads", v))}{check("Palisade", o.palisade, v => set("palisade", v), "A wooden wall round the houses, with gates on the roads.")}{check("Fields", o.fields, v => set("fields", v))}</>}
          {is("branching", "halls", "caves") && seg("Symmetry", o.symmetry, [["off", "Off"], ["lr", "Left–right"], ["tb", "Top–bottom"]], v => set("symmetry", v))}
          {is(...dungeon) && range("Curved rooms", o.curved, v => set("curved", v), pct(o.curved))}
          {is("branching", "halls", "caves", "building") && seg("Entrance", o.entry, [["any", "Any"], ["N", "N"], ["S", "S"], ["E", "E"], ["W", "W"]], v => set("entry", v))}
          </>, true)}
          {section("Look", <>
          <label>Style<select value={chosenStyle} onChange={e => setStyle(e.target.value)}>{styles.map(([id, name]) => <option key={id} value={id}>{name}{id === suggested ? " (suggested)" : ""}</option>)}</select></label>
          {layoutKind && <>
            <label>Floor<select value={chosenFloor} onChange={e => setFloor(e.target.value as FloorPattern)}>{floorPatterns.map(f => <option key={f.id} value={f.id}>{f.name}{f.id === layoutFloor[layoutKind] ? " (suggested)" : ""}</option>)}</select></label>
            {seg("Walls", o.walls, [["thin", "Thin"], ["medium", "Medium"], ["thick", "Thick"]], v => set("walls", v))}
            {isDungeon && seg("Outside", o.outside, [["hatched", "Hatched"], ["solid", "Solid"]], v => set("outside", v))}
            {seg("Doors", o.doors, [["wood", "Wood"], ["iron", "Iron"], ["arch", "Open arch"], ["mixed", "Mixed"]], v => set("doors", v))}
            {is("branching", "halls", "building") && range("Secret doors", o.secret, v => set("secret", v), pct(o.secret), "A secret door looks like wall. The Map Creator marks it with an S.")}
            {check("Grid on the floor", o.gridLines, v => set("gridLines", v))}
          </>}
          </>)}
          {layoutKind && section("Dressing", <>
            {check("Furnish rooms", o.populate, v => set("populate", v))}
            {furnished && <>
              <label>Theme<select value={chosenTheme} onChange={e => setTheme(e.target.value)}>{themes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
              <div className="creator-field"><span>Room mix</span><div className="creator-mix">{Object.entries(themeById(chosenTheme).rooms).map(([id, p]) =>
                <label key={id}><span>{p.name}</span><input type="number" min={0} max={9} value={mix[id] ?? 0} onChange={e => { const v = Math.max(0, Math.min(9, Math.round(+e.target.value) || 0)); setMixes(prev => ({ ...prev, [chosenTheme]: { ...mix, [id]: v } })); }}/></label>)}</div>
                <small className="muted">How many rooms of each kind, as a share. {isDungeon ? "The entrance and the last room have their own." : "Bigger rooms get the grander purposes."}</small></div>
              {range("Clutter", o.clutter, v => set("clutter", v), few(o.clutter))}
            </>}
            {is("branching", "halls", "building") && check("Columns", o.columns, v => set("columns", v))}
            {is("branching", "halls", "building") && o.columns && range("Column density", o.columnDensity, v => set("columnDensity", v), few(o.columnDensity))}
            {check("Number the rooms", o.numbers, v => set("numbers", v), "Numbers become GM-only markers in Maptable, named from the room key.")}
          </>)}
          {layoutKind && section("Lighting", <>
            {check("Add lights", o.lights, v => set("lights", v), "Lights show in the Map Creator and Maptable.")}
            {lit && <>
              {range("How many", o.lightDensity, v => set("lightDensity", v), few(o.lightDensity))}
              <div className="creator-field"><span>Kinds</span><div className="creator-kinds-row">
                {check("Torches", o.torches, v => set("torches", v))}{check("Braziers", o.braziers, v => set("braziers", v))}{check("Candles", o.candles, v => set("candles", v))}{check("Magic", o.magic, v => set("magic", v))}
              </div></div>
              {range("Rooms left dark", o.darkRooms, v => set("darkRooms", v), pct(o.darkRooms), "Dark rooms keep their lamps, unlit. The room key says which.")}
            </>}
          </>)}
          <div className="creator-field"><span>Seed (the same seed and settings always make the same map)</span>
            <div className="creator-seed"><input aria-label="Seed" value={o.seed} maxLength={40} onChange={e => set("seed", e.target.value)}/></div>
            <div className="creator-seed"><button type="button" onClick={() => setO(p => ({ ...p, seed: randomSeed(), dressing: 0 }))} title="A new seed: new rooms and new dressing"><Dices size={15}/> Reroll layout</button>{kind !== "wilderness" && <button type="button" onClick={() => set("dressing", o.dressing + 1)} title="The same rooms, with new things in them"><Sparkles size={15}/> Reroll dressing</button>}</div>
          </div>
          {layoutKind && <div className="creator-field"><span>Your presets</span>
            <div className="creator-presets">{presets.map((p, i) => <span key={i} className="creator-preset"><button type="button" onClick={() => usePreset(p)}>{p.name}</button><button type="button" aria-label={`Delete preset ${p.name}`} onClick={() => dropPreset(i)}><X size={13}/></button></span>)}
              <button type="button" onClick={savePreset}><Save size={14}/> Save these settings</button></div>
          </div>}
        </div>
        <div className="creator-preview">
          <svg viewBox={`0 0 ${map.width} ${map.height}`} role="img" aria-label="Preview of the generated map">
            <DrawingBackground drawing={map.drawing} width={map.width} height={map.height}/>
            {orderedShapes(map.drawing).map(s => <DrawingShape key={s.id} shape={s} drawing={map.drawing} prefix="preview"/>)}
          </svg>
          {"key" in map && Array.isArray(map.key) && map.key.length > 0 && <details className="creator-room-key" open><summary>Room key <small>GM only</small></summary><ol>
            {map.key.map(k => <li key={k.number}><b>{k.name}</b> {keyNote(k)}</li>)}
          </ol></details>}
          <p className="creator-measure">Every room, door and stamp is an ordinary shape, so you can move, restyle or delete any of it afterwards.{o.symmetry !== "off" && is("branching", "halls") && (o.entry === "any" || (o.symmetry === "lr") === (o.entry === "E" || o.entry === "W")) ? " A mirrored map is entered on its mirror line, so the entrance may move." : ""}</p>
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
      {tab === "generate" && kind === "hex" ? <HexMapPanel close={close} start={start}/> : <footer>
        <button onClick={close}>Cancel</button>
        {tab === "generate" && map && <button className="primary" onClick={() => start({ name: map.name, width: map.width, height: map.height, drawing: map.drawing })}>Use this map</button>}
        {tab === "trace" && <button className="primary" disabled={!file} onClick={() => file && trace(file, { cols, rows })}>Start tracing</button>}
        {tab === "blank" && <button className="primary" onClick={() => start(blank())}>Start drawing</button>}
      </footer>}
    </div>
  </div>;
}
