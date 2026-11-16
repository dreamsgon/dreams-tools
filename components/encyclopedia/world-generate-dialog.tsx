'use client';
import { useDeferredValue, useMemo, useState } from 'react';
import { Dices } from 'lucide-react';
import type { MapData } from '@/lib/encyclopedia/map-model';
import { defaultWorldOptions, generateWorld, worldAcross, worldClimates, worldKinds, type WorldAcross, type WorldOptions } from '@/lib/encyclopedia/world-generator';
import { defaultPlanetOptions, generatePlanet, planetPresets, planetSizes, rainWord, temperatureWords, withPreset, type PlanetLife, type PlanetOptions, type PlanetSize } from '@/lib/encyclopedia/planet-generator';
import {ToolDialog} from './tool-dialog';
import { MapCanvas } from './map-canvas';

const words = ['amber', 'ash', 'briar', 'cinder', 'dusk', 'ember', 'frost', 'gale', 'harrow', 'iron', 'lantern', 'moss', 'raven', 'salt', 'thorn', 'willow'];
export const randomWorldSeed = () => `${words[Math.floor(Math.random() * words.length)]}-${Math.floor(Math.random() * 900 + 100)}`;

const amount = (v: number) => v <= 0 ? 'None' : v < 25 ? 'Few' : v < 60 ? 'Some' : v < 85 ? 'Many' : 'Lots';
const lifeNames: Record<PlanetLife, string> = { none: 'None', simple: 'Simple', complex: 'Complex' };

/** Generate a world: a whole planet, or a continent, coast, islands or inland region, and see it before using it. */
export function WorldGenerateDialog({ map, onClose, onUse }: { map: MapData; onClose: () => void; onUse: (patch: Partial<MapData>) => void }) {
  const [planet, setPlanet] = useState(false), [preset, setPreset] = useState('earthlike');
  const [o, setO] = useState<WorldOptions>(() => ({ ...defaultWorldOptions(map.columns, map.rows, randomWorldSeed()), places: map.pins.length === 0 }));
  const [p, setP] = useState<PlanetOptions>(() => ({ ...defaultPlanetOptions(o.seed), places: map.pins.length === 0 ? 12 : 0, roads: map.pins.length === 0, landmarks: map.pins.length === 0 }));
  const set = (patch: Partial<WorldOptions>) => setO(v => ({ ...v, ...patch }));
  const setPlanetOption = (patch: Partial<PlanetOptions>, keepPreset = false) => { setP(v => ({ ...v, ...patch })); if (!keepPreset) setPreset(''); };
  const setSeed = (seed: string) => { set({ seed }); setPlanetOption({ seed }, true); };
  // Whole planets take a moment to build, so the sliders stay responsive while the preview catches up.
  const planetOptions = useDeferredValue(p);
  const result = useMemo(() => planet ? generatePlanet({ ...planetOptions, seed: planetOptions.seed.trim() || 'world' }, map) : generateWorld({ ...o, seed: o.seed.trim() || 'world' }, map), [planet, planetOptions, o, map]);
  const preview: MapData = { ...map, ...result, source: 'generated', imageId: null, fog: undefined, routes: [], compass: true, scaleBar: true };
  const added = result.pins.filter(p => !map.pins.some(q => q.id === p.id)).length;
  const range = (label: string, key: 'water' | 'temp' | 'rain' | 'tilt' | 'mountains' | 'volcanism' | 'places' | 'rivers', min: number, max: number, show: (v: number) => string) =>
    <label className="world-field">{label} <output>{show(p[key])}</output><input type="range" min={min} max={max} value={p[key]} onChange={e => setPlanetOption({ [key]: +e.target.value }, key === 'places' || key === 'rivers')}/></label>;
  return <ToolDialog title="Generate a world" wide onClose={onClose}>
    <div className="world-generate">
      <div className="world-generate-options">
        <div className="world-kinds" role="group" aria-label="Kind of map">
          <button type="button" className="world-kind-planet" aria-pressed={planet} onClick={() => setPlanet(true)}><strong>Whole planet</strong><span>Every continent and ocean, with climate from the poles to the equator</span></button>
          {worldKinds.map(k => <button key={k.id} type="button" aria-pressed={!planet && o.kind === k.id} onClick={() => { setPlanet(false); set({ kind: k.id }); }}><strong>{k.name}</strong><span>{k.hint}</span></button>)}
        </div>
        {planet ? <>
          <div className="world-field">Start from
            <div className="world-chips" role="group" aria-label="Kind of planet">{planetPresets.map(x => <button key={x.id} type="button" aria-pressed={preset === x.id} onClick={() => { setP(v => withPreset(v, x.id)); setPreset(x.id); }}>{x.name}</button>)}</div>
          </div>
          {range('Water', 'water', 0, 100, v => `${v}% sea`)}
          {range('Temperature', 'temp', -3, 3, v => temperatureWords[String(v)])}
          {range('Rain', 'rain', 0, 100, rainWord)}
          <div className="world-field">Day and night
            <div className="world-seg" role="group" aria-label="Day and night"><button type="button" aria-pressed={p.rotation === 'spin'} onClick={() => setPlanetOption({ rotation: 'spin' })}>Spins</button><button type="button" aria-pressed={p.rotation === 'locked'} onClick={() => setPlanetOption({ rotation: 'locked' })}>Tidally locked</button></div>
          </div>
          {p.rotation === 'spin' && range('Axial tilt', 'tilt', 0, 80, v => `${v}°`)}
          {range('Mountains', 'mountains', 0, 100, amount)}
          {range('Volcanoes', 'volcanism', 0, 100, amount)}
          <label className="world-check"><input type="checkbox" checked={p.pangaea} onChange={e => setPlanetOption({ pangaea: e.target.checked })}/><span>One supercontinent<small>Pulls the land together into one great landmass.</small></span></label>
          <div className="world-field">Life
            <div className="world-seg" role="group" aria-label="Life">{(Object.keys(lifeNames) as PlanetLife[]).map(l => <button key={l} type="button" aria-pressed={p.life === l} onClick={() => setPlanetOption({ life: l })}>{lifeNames[l]}</button>)}</div>
          </div>
          <div className="world-field">Size
            <div className="world-seg" role="group" aria-label="Size">{(Object.keys(planetSizes) as PlanetSize[]).map(z => <button key={z} type="button" aria-pressed={p.size === z} onClick={() => setPlanetOption({ size: z }, true)}>{planetSizes[z].name}</button>)}</div>
          </div>
          {range('Towns', 'places', 0, 30, v => v ? String(v) : 'None')}
          {range('Rivers', 'rivers', 0, 20, v => v ? String(v) : 'None')}
          <label className="world-check"><input type="checkbox" checked={p.roads} disabled={!p.places} onChange={e => setPlanetOption({ roads: e.target.checked }, true)}/><span>Roads between towns</span></label>
          <label className="world-check"><input type="checkbox" checked={p.landmarks} onChange={e => setPlanetOption({ landmarks: e.target.checked }, true)}/><span>Suggest landmarks<small>A volcano, ruins, an ancient tree and more, where this world has room for them.</small></span></label>
        </> : <>
        <div className="world-field">Across
          <div className="world-seg" role="group" aria-label="Across">{(Object.keys(worldAcross) as WorldAcross[]).map(a => <button key={a} type="button" aria-pressed={o.across === a} onClick={() => set({ across: a })}>{worldAcross[a].name} {worldAcross[a].miles.toLocaleString()} mi</button>)}</div>
        </div>
        {o.kind !== 'inland' && <label className="world-field">Sea level <output>{Math.round(o.seaLevel * 100)}% sea</output><input type="range" min={20} max={80} value={Math.round(o.seaLevel * 100)} onChange={e => set({ seaLevel: +e.target.value / 100 })}/></label>}
        <label className="world-field">Mountains <output>{o.mountains < 0.25 ? 'Few' : o.mountains < 0.6 ? 'Some' : 'Many'}</output><input type="range" min={0} max={100} value={Math.round(o.mountains * 100)} onChange={e => set({ mountains: +e.target.value / 100 })}/></label>
        <div className="world-field">Climate
          <div className="world-seg" role="group" aria-label="Climate">{worldClimates.map(c => <button key={c.id} type="button" aria-pressed={o.climate === c.id} onClick={() => set({ climate: c.id })}>{c.name}</button>)}</div>
        </div>
        <label className="world-check"><input type="checkbox" checked={o.places} onChange={e => set({ places: e.target.checked })}/><span>Add towns and roads<small>{o.places ? `${added} place${added === 1 ? '' : 's'} with made-up names, GM only until you share them. Places you have written notes for always stay.` : 'Places already on the map stay.'}</small></span></label>
        </>}
        <div className="world-field">Seed (the same seed always makes the same world)
          <div className="world-seed"><input aria-label="Seed" value={o.seed} maxLength={100} onChange={e => setSeed(e.target.value)}/><button type="button" className="button" onClick={() => setSeed(randomWorldSeed())}><Dices size={15}/> Reroll</button></div>
        </div>
      </div>
      <div className="world-generate-preview">
        <div className="world-generate-map" aria-busy={planet && planetOptions !== p}><MapCanvas map={preview}/></div>
        <p className="aside-hint">{planet
          ? `The map wraps east to west like a globe. ${added ? `${added} new place${added === 1 ? '' : 's'}, GM only until you share them. ` : ''}Warmth follows latitude and height, and rain falls on the windward side of mountains. This replaces the terrain and the rivers and roads it made before, and sets the map width to ${result.scale!.width.toLocaleString()} ${result.scale!.unit} around the equator.`
          : `The terrain is painted, not tiled, so you can keep shaping coasts and forests with the brush afterwards. Rivers run downhill from the mountains to the sea. This replaces the terrain and the rivers and roads it made before, and sets the map width to ${result.scale!.width.toLocaleString()} ${result.scale!.unit}.`}</p>
        <div className="button-row world-generate-actions"><button type="button" className="button" onClick={onClose}>Cancel</button><button type="button" className="button primary" onClick={() => onUse({ ...result, compass: map.compass ?? true, scaleBar: map.scaleBar ?? true })}>Use this world</button></div>
      </div>
    </div>
  </ToolDialog>;
}
