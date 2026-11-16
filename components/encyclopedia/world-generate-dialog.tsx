'use client';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Dices } from 'lucide-react';
import { terrainIndex, terrains, type MapData } from '@/lib/encyclopedia/map-model';
import { defaultWorldOptions, generateWorld, worldAcross, worldClimates, worldKinds, type WorldAcross, type WorldOptions } from '@/lib/encyclopedia/world-generator';
import { buildPlanet, defaultPlanetOptions, generatePlanet, planetBiomes, planetChecks, planetMapSize, planetPixels, planetPresets, planetSizes, planetStats, rainWord, temperatureWords, withPreset, type PlanetLife, type PlanetOptions, type PlanetSize } from '@/lib/encyclopedia/planet-generator';
import {ToolDialog} from './tool-dialog';
import { MapCanvas } from './map-canvas';
import { PlanetGlobe } from './planet-globe';

const words = ['amber', 'ash', 'briar', 'cinder', 'dusk', 'ember', 'frost', 'gale', 'harrow', 'iron', 'lantern', 'moss', 'raven', 'salt', 'thorn', 'willow'];
export const randomWorldSeed = () => `${words[Math.floor(Math.random() * words.length)]}-${Math.floor(Math.random() * 900 + 100)}`;

const amount = (v: number) => v <= 0 ? 'None' : v < 25 ? 'Few' : v < 60 ? 'Some' : v < 85 ? 'Many' : 'Lots';
const coastWord = (v: number) => v < 25 ? 'Smooth' : v < 60 ? 'Natural' : v < 85 ? 'Ragged' : 'Fjords';
const plateWord = (v: number) => v <= 3 ? 'A few big ones' : v <= 8 ? 'Some' : 'Many small ones';
const lifeNames: Record<PlanetLife, string> = { none: 'None', simple: 'Simple', complex: 'Complex' };
const planetTabs = [{ id: 'planet', name: 'Planet' }, { id: 'land', name: 'Land' }, { id: 'biomes', name: 'Biomes' }, { id: 'places', name: 'Places' }] as const;
type PlanetTab = typeof planetTabs[number]['id'];
type NumberKey = 'water' | 'temp' | 'rain' | 'tilt' | 'plates' | 'mountains' | 'volcanism' | 'coast' | 'islands' | 'places' | 'rivers';
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** A small picture of what a preset makes, drawn once when the dialog opens. */
function PresetThumb({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = ref.current?.getContext('2d');
    if (!g) return;
    const world = buildPlanet(withPreset(defaultPlanetOptions(`thumb-${id}`), id), 84, 42);
    g.putImageData(new ImageData(planetPixels(world) as Uint8ClampedArray<ArrayBuffer>, 84, 42), 0, 0);
  }, [id]);
  return <canvas ref={ref} width={84} height={42} aria-hidden="true"/>;
}

/** Generate a world: a whole planet, or a continent, coast, islands or inland region, and see it before using it. */
export function WorldGenerateDialog({ map, onClose, onUse }: { map: MapData; onClose: () => void; onUse: (patch: Partial<MapData>) => void }) {
  const [planet, setPlanet] = useState(false), [preset, setPreset] = useState('earthlike'), [tab, setTab] = useState<PlanetTab>('planet'), [globe, setGlobe] = useState(false);
  const [o, setO] = useState<WorldOptions>(() => ({ ...defaultWorldOptions(map.columns, map.rows, randomWorldSeed()), places: map.pins.length === 0 }));
  const [p, setP] = useState<PlanetOptions>(() => ({ ...defaultPlanetOptions(o.seed), places: map.pins.length === 0 ? 12 : 0, roads: map.pins.length === 0, landmarks: map.pins.length === 0 }));
  const set = (patch: Partial<WorldOptions>) => setO(v => ({ ...v, ...patch }));
  const setPlanetOption = (patch: Partial<PlanetOptions>, keepPreset = false) => { setP(v => ({ ...v, ...patch })); if (!keepPreset) setPreset(''); };
  const setSeed = (seed: string) => { set({ seed }); setPlanetOption({ seed }, true); };
  // Whole planets take a moment to build, so the sliders stay responsive while the preview catches up.
  const planetOptions = useDeferredValue(p);
  const options = useMemo(() => ({ ...planetOptions, seed: planetOptions.seed.trim() || 'world' }), [planetOptions]);
  const world = useMemo(() => { if (!planet) return null; const { w, h } = planetMapSize(); return buildPlanet(options, w, h); }, [planet, options]);
  const stats = useMemo(() => world && planetStats(world), [world]);
  const pixels = useMemo(() => world && globe ? planetPixels(world) : null, [world, globe]);
  const result = useMemo(() => world ? generatePlanet(options, map, world) : generateWorld({ ...o, seed: o.seed.trim() || 'world' }, map), [world, options, o, map]);
  const preview: MapData = { ...map, ...result, source: 'generated', imageId: null, fog: undefined, routes: [], compass: true, scaleBar: true };
  const added = result.pins.filter(p => !map.pins.some(q => q.id === p.id)).length;
  const checks = planet ? planetChecks(options, stats ?? undefined) : [], notes = checks.filter(c => c.kind === 'note').length;
  const towns = result.pins.filter(p => p.id.startsWith('place-') && p.kind !== 'landmark').length, rivers = result.paths?.filter(p => p.kind === 'river').length ?? 0;
  const range = (label: string, key: NumberKey, min: number, max: number, show: (v: number) => string, keepPreset = false) =>
    <label className="world-field">{label} <output>{show(p[key])}</output><input type="range" min={min} max={max} value={p[key]} onChange={e => setPlanetOption({ [key]: +e.target.value }, keepPreset)}/></label>;
  const toggleBiome = (id: typeof planetBiomes[number]) => setPlanetOption({ biomesOff: p.biomesOff.includes(id) ? p.biomesOff.filter(b => b !== id) : [...p.biomesOff, id] });
  return <ToolDialog title="Generate a world" wide onClose={onClose}>
    <div className="world-generate">
      <div className="world-generate-options">
        <div className="world-kinds" role="group" aria-label="Kind of map">
          <button type="button" className="world-kind-planet" aria-pressed={planet} onClick={() => setPlanet(true)}><strong>Whole planet</strong><span>Every continent and ocean, with climate from the poles to the equator</span></button>
          {worldKinds.map(k => <button key={k.id} type="button" aria-pressed={!planet && o.kind === k.id} onClick={() => { setPlanet(false); set({ kind: k.id }); }}><strong>{k.name}</strong><span>{k.hint}</span></button>)}
        </div>
        {planet ? <>
          <div className="planet-tabs" role="tablist" aria-label="Planet settings">
            {planetTabs.map(t => <button key={t.id} type="button" role="tab" id={`planet-tab-${t.id}`} aria-controls="planet-panel" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.name}</button>)}
          </div>
          <div className="planet-panel" id="planet-panel" role="tabpanel" aria-labelledby={`planet-tab-${tab}`}>
            {tab === 'planet' && <>
              <div className="world-field">Start from
                <div className="planet-presets" role="group" aria-label="Kind of planet">{planetPresets.map(x => <button key={x.id} type="button" aria-pressed={preset === x.id} onClick={() => { setP(v => withPreset(v, x.id)); setPreset(x.id); }}><PresetThumb id={x.id}/>{x.name}</button>)}</div>
              </div>
              {range('Water', 'water', 0, 100, v => `${v}% sea`)}
              {range('Temperature', 'temp', -3, 3, v => temperatureWords[String(v)])}
              {range('Rain', 'rain', 0, 100, rainWord)}
              <div className="world-field">Day and night
                <div className="world-seg" role="group" aria-label="Day and night"><button type="button" aria-pressed={p.rotation === 'spin'} onClick={() => setPlanetOption({ rotation: 'spin' })}>Spins</button><button type="button" aria-pressed={p.rotation === 'locked'} onClick={() => setPlanetOption({ rotation: 'locked' })}>Tidally locked</button></div>
              </div>
              {p.rotation === 'spin' && range('Axial tilt', 'tilt', 0, 80, v => `${v}°`)}
              <div className="world-field">Life
                <div className="world-seg" role="group" aria-label="Life">{(Object.keys(lifeNames) as PlanetLife[]).map(l => <button key={l} type="button" aria-pressed={p.life === l} onClick={() => setPlanetOption({ life: l })}>{lifeNames[l]}</button>)}</div>
              </div>
              <div className="world-field">Size
                <div className="world-seg" role="group" aria-label="Size">{(Object.keys(planetSizes) as PlanetSize[]).map(z => <button key={z} type="button" aria-pressed={p.size === z} onClick={() => setPlanetOption({ size: z }, true)}>{planetSizes[z].name}</button>)}</div>
              </div>
            </>}
            {tab === 'land' && <>
              {range('Continents', 'plates', 1, 12, plateWord)}
              <label className="world-check"><input type="checkbox" checked={p.pangaea} onChange={e => setPlanetOption({ pangaea: e.target.checked })}/><span>One supercontinent<small>Pulls the land together into one great landmass.</small></span></label>
              {range('Mountains', 'mountains', 0, 100, amount)}
              {range('Volcanoes', 'volcanism', 0, 100, amount)}
              {range('Coastline', 'coast', 0, 100, coastWord)}
              {range('Islands', 'islands', 0, 100, amount)}
            </>}
            {tab === 'biomes' && <>
              <p className="aside-hint">Turn off what this world doesn&apos;t have. Its land becomes the nearest kind it does have.{p.life !== 'complex' ? ' Without complex life, forests and grassland are already bare rock.' : ''}</p>
              <div className="planet-biomes" role="group" aria-label="Biomes">
                {planetBiomes.map(id => { const t = terrainIndex[id], on = !p.biomesOff.includes(id); return <button key={id} type="button" aria-pressed={on} onClick={() => toggleBiome(id)}><i style={{ background: terrains[t].color }}/>{terrains[t].name}<span>{stats && on && stats.land ? pct(stats.shares[t] / stats.land) : ''}</span></button>; })}
              </div>
            </>}
            {tab === 'places' && <>
              {range('Towns', 'places', 0, 30, v => v ? String(v) : 'None', true)}
              {range('Rivers', 'rivers', 0, 20, v => v ? String(v) : 'None', true)}
              <label className="world-check"><input type="checkbox" checked={p.roads} disabled={!p.places} onChange={e => setPlanetOption({ roads: e.target.checked }, true)}/><span>Roads between towns</span></label>
              <label className="world-check"><input type="checkbox" checked={p.landmarks} onChange={e => setPlanetOption({ landmarks: e.target.checked }, true)}/><span>Suggest landmarks<small>A volcano, ruins, an ancient tree and more, where this world has room for them.</small></span></label>
              <p className="aside-hint">Towns go where the land is mild, on coasts and rivers. Places you have written notes for always stay.</p>
            </>}
          </div>
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
        {planet && <div className="world-seg planet-view" role="group" aria-label="View"><button type="button" aria-pressed={!globe} onClick={() => setGlobe(false)}>Flat map</button><button type="button" aria-pressed={globe} onClick={() => setGlobe(true)}>Globe</button></div>}
        <div className={`world-generate-map${globe && planet ? ' is-globe' : ''}`} aria-busy={planet && planetOptions !== p}>
          {globe && pixels && world ? <PlanetGlobe pixels={pixels} width={world.w} height={world.h} locked={options.rotation === 'locked'} label="The planet as a globe"/> : <MapCanvas map={preview}/>}
        </div>
        {stats && <p className="planet-stats"><span>Land <b>{pct(stats.land)}</b></span><span>Ice <b>{pct(stats.ice)}</b></span><span>Livable land <b>{pct(stats.livable)}</b></span><span>Towns <b>{towns}</b></span><span>Rivers <b>{rivers}</b></span></p>}
        {planet && <section className="planet-checks" aria-label="Built-in checks">
          <h3>Built-in checks <span className={notes ? 'is-note' : 'is-ok'}>{notes ? `${notes} to look at` : 'Looks plausible'}</span></h3>
          <ul>{checks.map((c, i) => <li key={i} className={`check-${c.kind}`}>{c.text}</li>)}</ul>
        </section>}
        <p className="aside-hint">{planet
          ? `The map wraps east to west like a globe. ${added ? `${added} new place${added === 1 ? '' : 's'}, GM only until you share them. ` : ''}This replaces the terrain and the rivers and roads it made before, and sets the map width to ${result.scale!.width.toLocaleString()} ${result.scale!.unit} around the equator.`
          : `The terrain is painted, not tiled, so you can keep shaping coasts and forests with the brush afterwards. Rivers run downhill from the mountains to the sea. This replaces the terrain and the rivers and roads it made before, and sets the map width to ${result.scale!.width.toLocaleString()} ${result.scale!.unit}.`}</p>
        <div className="button-row world-generate-actions"><button type="button" className="button" onClick={onClose}>Cancel</button><button type="button" className="button primary" onClick={() => onUse({ ...result, compass: map.compass ?? true, scaleBar: map.scaleBar ?? true })}>Use this world</button></div>
      </div>
    </div>
  </ToolDialog>;
}
