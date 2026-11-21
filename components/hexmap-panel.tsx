"use client";
import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { ArrowUp, Dices, X } from "lucide-react";
import { biomeIds, biomes, type BiomeId } from "@/lib/hexmap/biomes";
import { defaultHexLook, defaultHexOptions, generateHexMap, HEX_LIMITS, hexLands, MIX_WEIGHT, mixLayouts, normalizeHexOptions, randomHexSeed, readMix, writeMix, type HexBlend, type HexLayer, type HexLook, type HexMapOptions, type HexMode, type HexRelief, type MixEntry, type MixLayout, type Side } from "@/lib/hexmap/generate";
import { paintTerrains, regenerateHexLayer, type HexPaint, type PaintTerrain } from "@/lib/hexmap/paint";
import { applyHexPreset, hexPresets, matchingHexPreset } from "@/lib/hexmap/presets";
import { hexSettingsCode, readHexSettingsCode } from "@/lib/hexmap/code";
import type { GeneratedMap } from "@/lib/map-generator";
import { DrawingBackground } from "./drawing-shape";
import "./hexmap-panel.css";
import { Actions, Check, Choice, Field, GenDialog, Generator, Hint, Picture, Range, Section, Seed, Summary } from "./generator/generator";

/** The ground around a hex map with a round or six-sided outline. */
const HEX_BACKGROUND = "#cfc8b4";
const word = (v: number) => v < 0.06 ? "None" : v < 0.3 ? "Low" : v < 0.45 ? "Some" : v < 0.56 ? "Default" : v < 0.78 ? "More" : "Lots";
const tempWord = (v: number) => ["Freezing", "Cold", "Cool", "Mild", "Warm", "Hot", "Scorching"][Math.round((v + 1) * 3)];
const rainWord = (v: number) => ["Arid", "Dry", "Dryish", "Average", "Damp", "Wet", "Soaked"][Math.round((v + 1) * 3)];
const varietyWord = (v: number) => v < 0.2 ? "Narrow" : v < 0.45 ? "Some" : v < 0.75 ? "Wide" : "Every climate";
const SIDES: [Side, string][] = [["n", "North"], ["s", "South"], ["w", "West"], ["e", "East"]];
const BiomeIcon = ({ id }: { id: BiomeId }) => <svg viewBox="-11 -10 22 20" aria-hidden="true"><path d="M10 0L5 8.7L-5 8.7L-10 0L-5 -8.7L5 -8.7Z" fill={biomes[id].flat}/><path d="M0 -6L4 2L-4 2Z" fill={biomes[id].tree}/></svg>;

const lookOf = (l: HexLook): HexLook => ({ look: l.look, lines: l.lines, numbers: l.numbers, legend: l.legend, labels: l.labels });
export type Regenerated = ReturnType<typeof regenerateHexLayer>;

/**
 * Makes a hex map from a seed: the Hex map tab of Start a new map. With `from`, it starts from an
 * existing map's settings and Regenerate replaces that map, keeping the hexes painted by hand.
 */
export default function HexMapPanel({ close, start, from, regenerate, kinds }: { close: () => void; start?: (map: GeneratedMap) => void; from?: HexLayer; regenerate?: (made: Regenerated) => void; kinds?: ReactNode }) {
  const [o, setO] = useState<HexMapOptions>(() => from ? normalizeHexOptions(from.options) : ({ ...defaultHexOptions, seed: randomHexSeed() }));
  const [big, setBig] = useState(() => !!from && (from.cols > 60 || from.rows > 45));
  const [look, setLook] = useState<HexLook>(() => from ? lookOf(from) : defaultHexLook);
  const [keep, setKeep] = useState(true);
  const [pasted, setPasted] = useState(""), [copied, setCopied] = useState(false);
  const code = hexSettingsCode(o, look);
  const paste = (text: string) => {
    setPasted(text);
    const read = readHexSettingsCode(text);
    if (read) { setO(read.options); setLook(read.look); setBig(read.options.cols > 60 || read.options.rows > 45); setPasted(""); }
  };
  const shown = useDeferredValue(o);
  const map = useMemo(() => from ? regenerateHexLayer(from, shown, defaultHexLook, keep) : generateHexMap(shown), [from, shown, keep]);
  const set = <K extends keyof HexMapOptions>(key: K, value: HexMapOptions[K]) => setO(prev => ({ ...prev, [key]: value }));
  const drawing = { background: HEX_BACKGROUND, style: null, hexes: { ...map.layer, ...look, x: 0, y: 0 } };
  const use = () => {
    if (from) { regenerate?.(regenerateHexLayer(from, o, look, keep)); return; }
    const made = generateHexMap(o);
    start?.({ name: `Hex map (${o.seed.trim() || "map"})`, width: made.width, height: made.height, drawing: { background: HEX_BACKGROUND, style: null, shapes: [], folders: [], layerOrder: [], hexes: { ...made.layer, ...look } } });
  };
  const maxCols = big ? HEX_LIMITS.cols[1] : 60, maxRows = big ? HEX_LIMITS.rows[1] : 45;
  const across = o.orient === "flat" ? (o.cols - 1) * 0.75 * 2 / Math.sqrt(3) + 1 : o.cols + 0.5;
  const down = o.orient === "flat" ? o.rows + 0.5 : (o.rows - 1) * 0.75 * 2 / Math.sqrt(3) + 1;
  const shares = Object.entries(map.landShare).sort((a, b) => b[1] - a[1]) as [BiomeId, number][];
  const preset = matchingHexPreset(o), mix = readMix(o.mix), mixTotal = mix.reduce((a, m) => a + m.w, 0) || 1;
  const setMix = (next: MixEntry[]) => set("mix", writeMix(next));
  const biomeSummary = o.mode === "single" ? biomes[o.biome].name : o.mode === "climate" ? `Climate, ${varietyWord(o.variety).toLowerCase()}` : mix.map(m => biomes[m.id].name).join(", ");

  const slider = (key: "temp" | "rain" | "variety" | "water" | "mountains" | "forest" | "lakes" | "wetlands" | "rivers" | "cols" | "rows" | "settlements" | "sites", label: string, min: number, max: number, step: number, say: (v: number) => string, hint?: string) =>
    <Range label={label} value={o[key]} min={min} max={max} step={step} shown={say(o[key])} onChange={v => set(key, v)} hint={hint}/>;
  const choice = <V extends string | number>(label: string, value: V, options: [V, string][], pick: (v: V) => void, hint?: string) =>
    <Choice label={label} value={value} options={options} onChange={pick} hint={hint}/>;
  const miles = `about ${Math.round(across * o.miles).toLocaleString()} × ${Math.round(down * o.miles).toLocaleString()} miles`;
  const summary = `${o.cols} × ${o.rows} hexes, ${miles}.${shares.length ? ` Mostly ${shares.slice(0, 3).map(([id, n]) => `${biomes[id].name.toLowerCase()} ${Math.round(n * 100)}%`).join(", ")}.` : ""}`;

  return <Generator
    kinds={kinds}
    settings={<>
      <Section title="Presets" summary={preset?.name ?? "Your own"} open>
        <Choice label="Presets" hideLabel look="chips" value={preset?.id ?? ""} options={hexPresets.map(p => [p.id, p.name, p.hint] as const)} onChange={id => setO(applyHexPreset(o, hexPresets.find(p => p.id === id)!))}
          hint="Fills in every setting except the size. Change anything to make it your own."/>
      </Section>
      <Section title="Biomes" summary={biomeSummary} open>
        {choice<HexMode>("How biomes are chosen", o.mode, [["single", "One biome"], ["climate", "Climate"], ["mix", "Custom mix"]], v => set("mode", v))}
        {o.mode === "single" && <Choice label="Biome" hideLabel look="tiles" value={o.biome} options={biomeIds.map(id => [id, <><BiomeIcon id={id}/>{biomes[id].name}</>, biomes[id].hint] as const)} onChange={v => set("biome", v)}/>}
        {o.mode === "climate" && <>
          <Hint>Hidden temperature and rainfall maps pick each hex&apos;s biome, so cold forest turns to tundra and wet lowland to swamp.</Hint>
          {slider("temp", "Temperature", -1, 1, 1 / 3, tempWord)}
          {slider("rain", "Rainfall", -1, 1, 1 / 3, rainWord)}
          {slider("variety", "Variety", 0, 1, 0.05, varietyWord)}
          <Check label="Colder to the north, warmer to the south" checked={o.latitude} onChange={v => set("latitude", v)}/>
        </>}
        {o.mode === "mix" && <>
          <div className="hexmap-mix" role="group" aria-label="Biomes in the mix">
            {mix.map((m, k) => <div key={m.id} className="hexmap-mix-row">
              <BiomeIcon id={m.id}/>
              <span>{biomes[m.id].name}<small>{Math.round(m.w / mixTotal * 100)}%</small></span>
              <input type="range" min={MIX_WEIGHT[0]} max={MIX_WEIGHT[1]} step={1} value={m.w} aria-label={`${biomes[m.id].name} share`} aria-valuetext={`${Math.round(m.w / mixTotal * 100)}%`} onChange={e => setMix(mix.map((x, j) => j === k ? { ...x, w: Number(e.target.value) } : x))}/>
              <button type="button" aria-label={`Move ${biomes[m.id].name} up`} title="Move up" disabled={k === 0} onClick={() => setMix([...mix.slice(0, k - 1), m, mix[k - 1], ...mix.slice(k + 1)])}><ArrowUp size={14}/></button>
              <button type="button" aria-label={`Remove ${biomes[m.id].name}`} title="Remove" disabled={mix.length < 2} onClick={() => setMix(mix.filter((_, j) => j !== k))}><X size={14}/></button>
            </div>)}
          </div>
          {mix.length < biomeIds.length && <Field label="Add a biome"><select value="" onChange={e => e.target.value && setMix([...mix, { id: e.target.value as BiomeId, w: 2 }])}>
            <option value="">Choose…</option>
            {biomeIds.filter(id => !mix.some(m => m.id === id)).map(id => <option key={id} value={id}>{biomes[id].name}</option>)}</select></Field>}
          {choice<MixLayout>("Arrange them", o.mixLayout, mixLayouts.map(l => [l.id, l.name]), v => set("mixLayout", v), mixLayouts.find(l => l.id === o.mixLayout)!.hint)}
        </>}
        {o.mode !== "single" && <>
          {choice("Biome size", o.biomeSize, [[0, "Small"], [1, "Normal"], [2, "Large"], [3, "Huge"]], v => set("biomeSize", v))}
          {choice<HexBlend>("Borders", o.blend, [["sharp", "Sharp"], ["soft", "Blended"], ["wide", "Wide blend"]], v => set("blend", v))}
          <Check label="Smooth harsh borders" hint="No desert next to ice." checked={o.smart} onChange={v => set("smart", v)}/>
          {choice("Rare wonders", o.wonders, [[0, "None"], [1, "Few"], [2, "Some"], [3, "Many"]], v => set("wonders", v), "Small patches of volcanic, blighted or fey land.")}
        </>}
      </Section>
      <Section title="Land" summary={hexLands.find(l => l.id === o.land)!.name}>
        <Field label="Kind of land" hint={hexLands.find(l => l.id === o.land)!.hint}><select value={o.land} onChange={e => set("land", e.target.value as HexMapOptions["land"])}>
          {hexLands.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        {o.land === "mainland" && <div className="gen-field"><span className="gen-label" id="hexmap-sides">Sea on these sides</span><div className="hexmap-sides" role="group" aria-labelledby="hexmap-sides">
          {SIDES.map(([side, name]) => <button key={side} type="button" title={name} aria-label={name} aria-pressed={o.coast.includes(side)} onClick={() => set("coast", o.coast.includes(side) ? o.coast.replace(side, "") : o.coast + side)}>{side.toUpperCase()}</button>)}</div></div>}
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
      <Section title="Places" summary={o.settlements || o.sites ? `${o.settlements} ${o.settlements === 1 ? "settlement" : "settlements"}, ${o.sites} wild` : "None"}>
        {slider("settlements", "Settlements", 0, HEX_LIMITS.settlements[1], 1, v => v ? String(v) : "None", "The first is a city, the next two towns, the rest villages.")}
        <Check label="Roads between settlements" checked={o.roads} onChange={v => set("roads", v)}/>
        {slider("sites", "Ruins & lairs", 0, HEX_LIMITS.sites[1], 1, v => v ? String(v) : "None", "Ruins, towers, caves, shrines and lairs show only to you, never on the map players see.")}
        <Check label="Make up names" checked={o.names} onChange={v => set("names", v)}/>
        <Hint>In Maptable every place can become a GM-only marker.</Hint>
      </Section>
      <Section title="Size" summary={`${o.cols} × ${o.rows} hexes`}>
        {choice("Outline", o.outline, [["rect", "Rectangle"], ["hex", "Hexagon"], ["circle", "Circle"]], v => set("outline", v))}
        {slider("cols", "Width", HEX_LIMITS.cols[0], maxCols, 1, v => `${v} hexes`)}
        {slider("rows", "Height", HEX_LIMITS.rows[0], maxRows, 1, v => `${v} hexes`)}
        <Check label="Allow larger maps" hint="Slower on phones." checked={big} onChange={v => { setBig(v); if (!v) setO(p => ({ ...p, cols: Math.min(p.cols, 60), rows: Math.min(p.rows, 45) })); }}/>
        <Field label="Each hex is" hint={`${miles[0].toUpperCase()}${miles.slice(1)}. A day on foot crosses ${+(24 / o.miles).toFixed(o.miles > 6 ? 1 : 0)} hexes.`}><select value={o.miles} onChange={e => set("miles", Number(e.target.value))}>
          {[1, 3, 6, 12, 24].map(m => <option key={m} value={m}>{m} {m === 1 ? "mile" : "miles"} across</option>)}</select></Field>
        {choice("Hexes", o.orient, [["flat", "Flat top"], ["pointy", "Pointed top"]], v => set("orient", v))}
      </Section>
      <Section title="Look" summary={lookSummary(look)}>
        <HexLookFields look={look} change={part => setLook(prev => ({ ...prev, ...part }))}/>
      </Section>
      <Section title="Settings code">
        <div className="gen-field"><span className="gen-label">This map&apos;s code</span><div className="gen-seed-row"><input readOnly aria-label="Settings code" value={code} className="hexmap-code" onFocus={e => e.target.select()}/>
          <button type="button" className="gen-btn" onClick={() => { navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {}); }}>{copied ? "Copied" : "Copy"}</button></div></div>
        <Field label="Paste a code to load it"><input className="hexmap-code" placeholder="HEX1-…" value={pasted} onChange={e => paste(e.target.value)}/></Field>
        {pasted.trim() && <Hint alert>That isn&apos;t a hex map settings code. Codes start with HEX1-.</Hint>}
        <Hint>The code holds the seed and every setting, so a friend who pastes it gets the same map.</Hint>
      </Section>
    </>}
    seed={<Seed value={o.seed} maxLength={40} onChange={v => set("seed", v)} rerolls={[{ label: "Reroll", onClick: () => set("seed", randomHexSeed()) },
      ...(o.settlements > 0 || o.sites > 0 ? [{ label: "Reroll places", title: "Move the places and keep the land", onClick: () => set("placesRoll", (o.placesRoll + 1) % 10000) }] : [])]}/>}
    picture={<Picture busy={shown !== o} className="hexmap-picture"><svg viewBox={`0 0 ${map.width} ${map.height}`} role="img" aria-label={`Preview of the hex map: ${summary}`}>
      <DrawingBackground drawing={drawing} width={map.width} height={map.height} secrets/>
    </svg></Picture>}
    summary={<Summary text={summary}/>}
    extras={shares.length > 0 && <div className="hexmap-share" aria-label="Biomes on this map">
      <div className="hexmap-share-bar" aria-hidden="true">{shares.map(([id, n]) => <span key={id} style={{ flex: n, background: biomes[id].flat }}/>)}</div>
      {shares.slice(0, 6).map(([id, n]) => <span key={id}><i style={{ background: biomes[id].flat }}/>{biomes[id].name} {Math.round(n * 100)}%</span>)}
      {shares.length > 6 && <span>+{shares.length - 6} more</span>}
    </div>}
    actions={<Actions start={<>
      <button type="button" className="gen-btn" onClick={() => { setO({ ...defaultHexOptions, seed: o.seed }); setBig(false); setLook(defaultHexLook); }}>Defaults</button>
      {!!from?.painted.length && <Check label={`Keep ${from.painted.length === 1 ? "the hex" : `the ${from.painted.length} hexes`} you painted`} checked={keep} onChange={setKeep}/>}
    </>}>
      <button type="button" className="gen-btn" onClick={close}>Cancel</button>
      <button type="button" className="gen-btn primary" onClick={use}>{from ? "Regenerate" : "Use this map"}</button>
    </Actions>}
  />;
}

const LOOKS: [HexLook["look"], string][] = [["painted", "Painted"], ["flat", "Flat colours"], ["ink", "Ink"]];
const LEGENDS: [HexLook["legend"], string][] = [["none", "No legend"], ["nw", "Top left"], ["ne", "Top right"], ["sw", "Bottom left"], ["se", "Bottom right"]];
const lookSummary = (look: HexLook) => [LOOKS.find(l => l[0] === look.look)![1], look.numbers && "numbers", look.legend !== "none" && "legend"].filter(Boolean).join(", ");

/** How a hex map is drawn: here before it is made, and in the Map Creator's Map tab afterwards. */
export function HexLookFields({ look, change }: { look: HexLook; change: (part: Partial<HexLook>) => void }) {
  return <>
    <Choice label="Art" value={look.look} options={LOOKS} onChange={v => change({ look: v })} hint={look.look === "painted" ? "Colour with trees, peaks and dunes drawn on." : look.look === "flat" ? "Plain colours, easy to read at a glance." : "Black and white, for printing."}/>
    <Check label="Hex outlines" checked={look.lines} onChange={v => change({ lines: v })}/>
    <Check label="Hex numbers (column, then row)" checked={look.numbers} onChange={v => change({ numbers: v })}/>
    <Check label="Place names on the map" checked={look.labels} onChange={v => change({ labels: v })}/>
    <Field label="Legend"><select value={look.legend} onChange={e => change({ legend: e.target.value as HexLook["legend"] })}>
      {LEGENDS.map(([v, name]) => <option key={v} value={v}>{name}</option>)}</select></Field>
  </>;
}

/** Regenerate in the Map Creator: the generator with this map's settings, replacing the map. */
export function HexRegenerateDialog({ layer, close, regenerate }: { layer: HexLayer; close: () => void; regenerate: (made: Regenerated) => void }) {
  return <GenDialog title="Regenerate the hex map" onClose={close}><HexMapPanel close={close} from={layer} regenerate={regenerate}/></GenDialog>;
}

/** The Paint hexes tool's settings: the biome and terrain to paint, or restoring hexes as they were made. */
export function HexPaintPanel({ paint, setPaint, restore, setRestore, painted, clear, regenerate }: {
  paint: HexPaint; setPaint: (p: HexPaint) => void; restore: boolean; setRestore: (on: boolean) => void;
  painted: number; clear: () => void; regenerate: () => void;
}) {
  return <div className="creator-panel hexmap-paint">
    <h3>Paint hexes</h3>
    <div className="creator-seg" role="group" aria-label="Paint or restore">
      <button type="button" aria-pressed={!restore} onClick={() => setRestore(false)}>Paint</button>
      <button type="button" aria-pressed={restore} onClick={() => setRestore(true)}>Restore</button>
    </div>
    {restore ? <p className="creator-measure">Click or drag across painted hexes to put them back as the generator made them.</p> : <>
      <div className="hexmap-biomes" role="group" aria-label="Biome to paint">
        {biomeIds.map(id => <button key={id} type="button" aria-pressed={paint.biome === id} title={biomes[id].hint} onClick={() => setPaint({ ...paint, biome: id })}>
          <BiomeIcon id={id}/>{biomes[id].name}</button>)}
      </div>
      <label className="hexmap-select">Terrain<select value={paint.terrain} onChange={e => setPaint({ ...paint, terrain: e.target.value as PaintTerrain })}>
        {paintTerrains.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <p className="creator-measure">Click or drag across hexes. Water becomes shallows beside the sea and a lake anywhere else. Alt-click a hex to pick up its biome and terrain.</p>
    </>}
    <p className="creator-measure">{painted ? `${painted} ${painted === 1 ? "hex" : "hexes"} painted, shown with a dashed outline. They stay when you regenerate the map.` : "Painted hexes get a dashed outline and stay when you regenerate the map."}</p>
    <div className="creator-actions">
      <button type="button" onClick={regenerate}><Dices size={15}/> Regenerate…</button>
      {painted > 0 && <button type="button" onClick={clear}>Restore all</button>}
    </div>
  </div>;
}
