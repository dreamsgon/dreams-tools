"use client";
import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { ArrowUp, Dices, X } from "lucide-react";
import { biomeIds, biomes, type BiomeId } from "@/lib/hexmap/biomes";
import { defaultHexOptions, generateHexMap, HEX_LIMITS, hexLands, MIX_WEIGHT, mixLayouts, randomHexSeed, readMix, writeMix, type HexBlend, type HexMapOptions, type HexMode, type HexRelief, type MixEntry, type MixLayout, type Side } from "@/lib/hexmap/generate";
import { applyHexPreset, hexPresets, matchingHexPreset } from "@/lib/hexmap/presets";
import type { GeneratedMap } from "@/lib/map-generator";
import { DrawingBackground } from "./drawing-shape";
import "./hexmap-panel.css";

/** The ground around a hex map with a round or six-sided outline. */
const HEX_BACKGROUND = "#cfc8b4";
const word = (v: number) => v < 0.06 ? "None" : v < 0.3 ? "Low" : v < 0.45 ? "Some" : v < 0.56 ? "Default" : v < 0.78 ? "More" : "Lots";
const tempWord = (v: number) => ["Freezing", "Cold", "Cool", "Mild", "Warm", "Hot", "Scorching"][Math.round((v + 1) * 3)];
const rainWord = (v: number) => ["Arid", "Dry", "Dryish", "Average", "Damp", "Wet", "Soaked"][Math.round((v + 1) * 3)];
const varietyWord = (v: number) => v < 0.2 ? "Narrow" : v < 0.45 ? "Some" : v < 0.75 ? "Wide" : "Every climate";
const SIDES: [Side, string][] = [["n", "North"], ["s", "South"], ["w", "West"], ["e", "East"]];
const BiomeIcon = ({ id }: { id: BiomeId }) => <svg viewBox="-11 -10 22 20" aria-hidden="true"><path d="M10 0L5 8.7L-5 8.7L-10 0L-5 -8.7L5 -8.7Z" fill={biomes[id].flat}/><path d="M0 -6L4 2L-4 2Z" fill={biomes[id].tree}/></svg>;

/** Makes a hex map from a seed: the Hex map tab of Start a new map. */
export default function HexMapPanel({ close, start }: { close: () => void; start: (map: GeneratedMap) => void }) {
  const [o, setO] = useState<HexMapOptions>(() => ({ ...defaultHexOptions, seed: randomHexSeed() }));
  const [big, setBig] = useState(false);
  const shown = useDeferredValue(o);
  const map = useMemo(() => generateHexMap(shown), [shown]);
  const set = <K extends keyof HexMapOptions>(key: K, value: HexMapOptions[K]) => setO(prev => ({ ...prev, [key]: value }));
  const drawing = { background: HEX_BACKGROUND, style: null, hexes: map.layer };
  const use = () => {
    const made = generateHexMap(o);
    start({ name: `Hex map (${o.seed.trim() || "map"})`, width: made.width, height: made.height, drawing: { background: HEX_BACKGROUND, style: null, shapes: [], folders: [], layerOrder: [], hexes: made.layer } });
  };
  const maxCols = big ? HEX_LIMITS.cols[1] : 60, maxRows = big ? HEX_LIMITS.rows[1] : 45;
  const across = o.orient === "flat" ? (o.cols - 1) * 0.75 * 2 / Math.sqrt(3) + 1 : o.cols + 0.5;
  const down = o.orient === "flat" ? o.rows + 0.5 : (o.rows - 1) * 0.75 * 2 / Math.sqrt(3) + 1;
  const shares = Object.entries(map.landShare).sort((a, b) => b[1] - a[1]) as [BiomeId, number][];
  const preset = matchingHexPreset(o), mix = readMix(o.mix), mixTotal = mix.reduce((a, m) => a + m.w, 0) || 1;
  const setMix = (next: MixEntry[]) => set("mix", writeMix(next));
  const biomeSummary = o.mode === "single" ? biomes[o.biome].name : o.mode === "climate" ? `Climate, ${varietyWord(o.variety).toLowerCase()}` : mix.map(m => biomes[m.id].name).join(", ");

  const slider = (key: "temp" | "rain" | "variety" | "water" | "mountains" | "forest" | "lakes" | "wetlands" | "rivers" | "cols" | "rows", label: string, min: number, max: number, step: number, say: (v: number) => string) =>
    <div className="hexmap-row"><label htmlFor={`hexmap-${key}`}>{label}</label>
      <input id={`hexmap-${key}`} type="range" min={min} max={max} step={step} value={o[key]} onChange={e => set(key, Number(e.target.value))}/>
      <output htmlFor={`hexmap-${key}`}>{say(o[key])}</output></div>;
  const choice = <V extends string | number>(label: string, value: V, options: [V, string][], pick: (v: V) => void) =>
    <div className="creator-field"><span>{label}</span><div className="creator-seg" role="group" aria-label={label}>
      {options.map(([v, name]) => <button key={String(v)} type="button" aria-pressed={value === v} onClick={() => pick(v)}>{name}</button>)}</div></div>;

  return <>
    <div className="creator-dialog-body hexmap-body">
      <div className="hexmap-settings">
        <Section title="Presets" summary={preset?.name ?? "Your own"} open>
          <div className="hexmap-presets" role="group" aria-label="Presets">
            {hexPresets.map(p => <button key={p.id} type="button" title={p.hint} aria-pressed={preset?.id === p.id} onClick={() => setO(applyHexPreset(o, p))}>{p.name}</button>)}
          </div>
          <p className="creator-measure">A preset fills in every setting below except the size. Change anything and it becomes your own.</p>
        </Section>
        <Section title="Biomes" summary={biomeSummary} open>
          {choice<HexMode>("How biomes are chosen", o.mode, [["single", "One biome"], ["climate", "Climate"], ["mix", "Custom mix"]], v => set("mode", v))}
          {o.mode === "single" && <div className="hexmap-biomes" role="group" aria-label="Biome">
            {biomeIds.map(id => <button key={id} type="button" aria-pressed={o.biome === id} title={biomes[id].hint} onClick={() => set("biome", id)}>
              <BiomeIcon id={id}/>{biomes[id].name}</button>)}
          </div>}
          {o.mode === "climate" && <>
            <p className="creator-measure">Hidden temperature and rainfall maps pick each hex&apos;s biome, so cold forest turns to tundra and wet lowland to swamp.</p>
            {slider("temp", "Temperature", -1, 1, 1 / 3, tempWord)}
            {slider("rain", "Rainfall", -1, 1, 1 / 3, rainWord)}
            {slider("variety", "Variety", 0, 1, 0.05, varietyWord)}
            <label className="creator-check"><input type="checkbox" checked={o.latitude} onChange={e => set("latitude", e.target.checked)}/>Colder to the north, warmer to the south</label>
          </>}
          {o.mode === "mix" && <>
            <div className="hexmap-mix" role="group" aria-label="Biomes in the mix">
              {mix.map((m, k) => <div key={m.id} className="hexmap-mix-row">
                <BiomeIcon id={m.id}/>
                <span>{biomes[m.id].name}<small>{Math.round(m.w / mixTotal * 100)}%</small></span>
                <input type="range" min={MIX_WEIGHT[0]} max={MIX_WEIGHT[1]} step={1} value={m.w} aria-label={`${biomes[m.id].name} share`} onChange={e => setMix(mix.map((x, j) => j === k ? { ...x, w: Number(e.target.value) } : x))}/>
                <button type="button" aria-label={`Move ${biomes[m.id].name} up`} title="Move up" disabled={k === 0} onClick={() => setMix([...mix.slice(0, k - 1), m, mix[k - 1], ...mix.slice(k + 1)])}><ArrowUp size={14}/></button>
                <button type="button" aria-label={`Remove ${biomes[m.id].name}`} title="Remove" disabled={mix.length < 2} onClick={() => setMix(mix.filter((_, j) => j !== k))}><X size={14}/></button>
              </div>)}
            </div>
            {mix.length < biomeIds.length && <label className="hexmap-select"><select aria-label="Add a biome" value="" onChange={e => e.target.value && setMix([...mix, { id: e.target.value as BiomeId, w: 2 }])}>
              <option value="">+ Add a biome</option>
              {biomeIds.filter(id => !mix.some(m => m.id === id)).map(id => <option key={id} value={id}>{biomes[id].name}</option>)}</select></label>}
            {choice<MixLayout>("Arrange them", o.mixLayout, mixLayouts.map(l => [l.id, l.name]), v => set("mixLayout", v))}
            <p className="creator-measure">{mixLayouts.find(l => l.id === o.mixLayout)!.hint}</p>
          </>}
          {o.mode !== "single" && <>
            {choice("Biome size", o.biomeSize, [[0, "Small"], [1, "Normal"], [2, "Large"], [3, "Huge"]], v => set("biomeSize", v))}
            {choice<HexBlend>("Borders", o.blend, [["sharp", "Sharp"], ["soft", "Blended"], ["wide", "Wide blend"]], v => set("blend", v))}
            <label className="creator-check"><input type="checkbox" checked={o.smart} onChange={e => set("smart", e.target.checked)}/>Smooth harsh borders (no desert next to ice)</label>
            {choice("Rare wonders", o.wonders, [[0, "None"], [1, "Few"], [2, "Some"], [3, "Many"]], v => set("wonders", v))}
            <p className="creator-measure">Wonders are small patches of volcanic, blighted or fey land.</p>
          </>}
        </Section>
        <Section title="Land" summary={hexLands.find(l => l.id === o.land)!.name} open>
          <label className="hexmap-select">Kind of land<select value={o.land} onChange={e => set("land", e.target.value as HexMapOptions["land"])}>
            {hexLands.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select><small>{hexLands.find(l => l.id === o.land)!.hint}</small></label>
          {o.land === "mainland" && <div className="creator-field"><span>Sea on these sides</span><div className="hexmap-sides" role="group" aria-label="Sea on these sides">
            {SIDES.map(([s, name]) => <button key={s} type="button" title={name} aria-label={name} aria-pressed={o.coast.includes(s)} onClick={() => set("coast", o.coast.includes(s) ? o.coast.replace(s, "") : o.coast + s)}>{s.toUpperCase()}</button>)}</div></div>}
          {o.land === "peninsula" && choice("Joins the mainland on", o.joins, SIDES, v => set("joins", v))}
          {slider("water", "Water", 0, 1, 0.05, word)}
          {choice("Shallows along the coast", o.shallows, [[-1, "Auto"], [0, "None"], [1, "1 hex"], [2, "2"], [3, "3"]], v => set("shallows", v))}
        </Section>
        <Section title="Terrain" summary={`${o.rivers} ${o.rivers === 1 ? "river" : "rivers"}`}>
          {slider("mountains", "Mountains", 0, 1, 0.05, word)}
          {choice<HexRelief>("Relief", o.relief, [["flat", "Flat"], ["rolling", "Rolling"], ["rugged", "Rugged"], ["towering", "Towering"]], v => set("relief", v))}
          {slider("forest", "Forest", 0, 1, 0.05, word)}
          {slider("rivers", "Rivers", 0, HEX_LIMITS.rivers[1], 1, v => v ? String(v) : "None")}
          {slider("lakes", "Lakes", 0, 1, 0.05, word)}
          {slider("wetlands", "Wetlands", 0, 1, 0.05, word)}
        </Section>
        <Section title="Size" summary={`${o.cols} × ${o.rows} hexes`}>
          {choice("Outline", o.outline, [["rect", "Rectangle"], ["hex", "Hexagon"], ["circle", "Circle"]], v => set("outline", v))}
          {slider("cols", "Width", HEX_LIMITS.cols[0], maxCols, 1, v => `${v} hexes`)}
          {slider("rows", "Height", HEX_LIMITS.rows[0], maxRows, 1, v => `${v} hexes`)}
          <label className="creator-check"><input type="checkbox" checked={big} onChange={e => { setBig(e.target.checked); if (!e.target.checked) setO(p => ({ ...p, cols: Math.min(p.cols, 60), rows: Math.min(p.rows, 45) })); }}/>Allow larger maps (slower on phones)</label>
          <label className="hexmap-select">Each hex is<select value={o.miles} onChange={e => set("miles", Number(e.target.value))}>
            {[1, 3, 6, 12, 24].map(m => <option key={m} value={m}>{m} {m === 1 ? "mile" : "miles"} across</option>)}</select></label>
          {choice("Hexes", o.orient, [["flat", "Flat top"], ["pointy", "Pointed top"]], v => set("orient", v))}
          <p className="creator-measure">About {Math.round(across * o.miles).toLocaleString()} × {Math.round(down * o.miles).toLocaleString()} miles. A day on foot crosses {+(24 / o.miles).toFixed(o.miles > 6 ? 1 : 0)} hexes.</p>
        </Section>
      </div>
      <div className="creator-preview hexmap-preview">
        <div className="creator-field"><span>Seed (the same seed always makes the same map)</span>
          <div className="creator-seed"><input aria-label="Seed" value={o.seed} maxLength={40} spellCheck={false} onChange={e => set("seed", e.target.value)}/>
            <button type="button" onClick={() => set("seed", randomHexSeed())}><Dices size={15}/> Reroll</button></div></div>
        <svg viewBox={`0 0 ${map.width} ${map.height}`} role="img" aria-label="Preview of the generated hex map" data-stale={shown !== o || undefined}>
          <DrawingBackground drawing={drawing} width={map.width} height={map.height}/>
        </svg>
        {shares.length > 0 && <div className="hexmap-share" aria-label="Biomes on this map">
          <div className="hexmap-share-bar">{shares.map(([id, n]) => <span key={id} style={{ flex: n, background: biomes[id].flat }} title={biomes[id].name}/>)}</div>
          {shares.slice(0, 6).map(([id, n]) => <span key={id}><i style={{ background: biomes[id].flat }}/>{biomes[id].name} {Math.round(n * 100)}%</span>)}
          {shares.length > 6 && <span>+{shares.length - 6} more</span>}
        </div>}
      </div>
    </div>
    <footer>
      <button type="button" onClick={() => { setO({ ...defaultHexOptions, seed: o.seed }); setBig(false); }}>Defaults</button>
      <span className="creator-spacer"/>
      <button type="button" onClick={close}>Cancel</button>
      <button type="button" className="primary" onClick={use}>Use this map</button>
    </footer>
  </>;
}

function Section({ title, summary, open, children }: { title: string; summary: string; open?: boolean; children: ReactNode }) {
  return <details className="hexmap-section" open={open}>
    <summary><span>{title}</span><span className="hexmap-summary">{summary}</span></summary>
    <div className="creator-panel">{children}</div>
  </details>;
}
