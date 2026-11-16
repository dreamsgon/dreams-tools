'use client';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Dices, ImageUp } from 'lucide-react';
import { terrainIndex, terrains, type MapData } from '@/lib/encyclopedia/map-model';
import { defaultWorldOptions, generateWorld, worldAcross, worldClimates, worldKinds, type WorldAcross, type WorldOptions } from '@/lib/encyclopedia/world-generator';
import { defaultPictureOptions, landIsNames, pictureArea, picturePlanet, pictureReadSize, readPicture, sampleSketch, type LandIs, type PictureOptions } from '@/lib/encyclopedia/picture-map';
import { buildPlanet, defaultPlanetOptions, generatePlanet, handPlanet, planetBiomes, planetChecks, planetMapSize, planetPixels, planetPresets, planetSizes, planetStats, rainWord, temperatureWords, withPreset, type PlanetLife, type PlanetOptions, type PlanetSize } from '@/lib/encyclopedia/planet-generator';
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

type PictureFile = { px: Uint8ClampedArray; w: number; h: number; name: string };
type PictureScale = 'planet' | WorldAcross;

/** Read a picture file in the browser at a size that keeps thin pen lines. It is never uploaded. */
async function readPictureFile(file: File): Promise<PictureFile> {
  const bitmap = await createImageBitmap(file), { w, h } = pictureReadSize(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bitmap, 0, 0, w, h); bitmap.close();
  return { px: g.getImageData(0, 0, w, h).data, w, h, name: file.name };
}

/** The picture a map is made from, small, with the land it found tinted. */
function PictureThumb({ pic, land }: { pic: PictureFile; land: Uint8Array | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current, g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const px = new Uint8ClampedArray(pic.px);
    if (land) for (let i = 0; i < land.length; i++) if (land[i]) { px[i * 4] = px[i * 4] * 0.6 + 40; px[i * 4 + 1] = px[i * 4 + 1] * 0.6 + 90; px[i * 4 + 2] = px[i * 4 + 2] * 0.6 + 30; }
    canvas.width = pic.w; canvas.height = pic.h;
    g.putImageData(new ImageData(px, pic.w, pic.h), 0, 0);
  }, [pic, land]);
  return <canvas ref={ref} role="img" aria-label="The picture, with the land found in it tinted green"/>;
}

/** Generate a world: a whole planet, or a continent, coast, islands or inland region, and see it before using it. */
export function WorldGenerateDialog({ map, onClose, onUse }: { map: MapData; onClose: () => void; onUse: (patch: Partial<MapData>, hand: boolean) => void }) {
  const [mode, setMode] = useState<'area' | 'planet' | 'hand' | 'picture'>('area'), hand = mode === 'hand';
  const [pic, setPic] = useState<PictureFile | null>(null), [picError, setPicError] = useState(''), [po, setPo] = useState<PictureOptions>(defaultPictureOptions);
  const [picScale, setPicScale] = useState<PictureScale>('continent'), fromPicture = mode === 'picture';
  /** Whether the result is a whole planet; generated ones also get the Land tab, presets and checks. */
  const planet = mode === 'planet' || hand || (fromPicture && picScale === 'planet'), own = hand || fromPicture;
  const [preset, setPreset] = useState('earthlike'), [tab, setTab] = useState<PlanetTab>('planet'), [globe, setGlobe] = useState(false);
  const [o, setO] = useState<WorldOptions>(() => ({ ...defaultWorldOptions(map.columns, map.rows, randomWorldSeed()), places: map.pins.length === 0 }));
  const [p, setP] = useState<PlanetOptions>(() => ({ ...defaultPlanetOptions(o.seed), places: map.pins.length === 0 ? 12 : 0, roads: map.pins.length === 0, landmarks: map.pins.length === 0 }));
  const set = (patch: Partial<WorldOptions>) => setO(v => ({ ...v, ...patch }));
  const setPlanetOption = (patch: Partial<PlanetOptions>, keepPreset = false) => { setP(v => ({ ...v, ...patch })); if (!keepPreset) setPreset(''); };
  const setSeed = (seed: string) => { set({ seed }); setPlanetOption({ seed }, true); };
  // Whole planets take a moment to build, so the sliders stay responsive while the preview catches up.
  const planetOptions = useDeferredValue(p);
  const options = useMemo(() => ({ ...planetOptions, seed: planetOptions.seed.trim() || 'world' }), [planetOptions]);
  // Reading a picture works through every pixel, so it also follows the settings a moment behind.
  const pictureOptions = useDeferredValue(po);
  const picture = useMemo(() => fromPicture && pic ? readPicture(pic.px, pic.w, pic.h, { landIs: pictureOptions.landIs, threshold: pictureOptions.threshold }) : null, [fromPicture, pic, pictureOptions.landIs, pictureOptions.threshold]);
  const world = useMemo(() => {
    if (mode === 'planet') { const { w, h } = planetMapSize(); return buildPlanet(options, w, h); }
    return picture && picScale === 'planet' ? picturePlanet(picture, pictureOptions, options) : null;
  }, [mode, options, picture, picScale, pictureOptions]);
  const stats = useMemo(() => world && planetStats(world), [world]);
  const pixels = useMemo(() => world && globe ? planetPixels(world) : null, [world, globe]);
  const result = useMemo(() => {
    if (hand) return handPlanet(options, map);
    if (world) return generatePlanet(options, map, world);
    const area = { ...o, seed: o.seed.trim() || 'world' };
    if (fromPicture) return picture && picScale !== 'planet' ? { ...pictureArea(picture, pictureOptions, { ...area, across: picScale }, map), planet: undefined } : null;
    return { ...generateWorld(area, map), planet: undefined };
  }, [hand, world, options, o, map, fromPicture, picture, picScale, pictureOptions]);
  const preview: MapData | null = result && { ...map, ...result, source: 'generated', imageId: null, fog: undefined, routes: [], compass: true, scaleBar: true };
  const added = result?.pins.filter(p => !map.pins.some(q => q.id === p.id)).length ?? 0;
  const checks = mode === 'planet' ? planetChecks(options, stats ?? undefined) : [], notes = checks.filter(c => c.kind === 'note').length;
  const towns = result?.pins.filter(p => p.id.startsWith('place-') && p.kind !== 'landmark').length ?? 0, rivers = result?.paths?.filter(p => p.kind === 'river').length ?? 0;
  const openPicture = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 40 * 1024 * 1024) { setPicError('That picture is over 40 MB. Try a smaller copy of it.'); return; }
    try { setPic(await readPictureFile(file)); setPicError(''); } catch { setPicError('That file couldn\'t be read as a picture. Try a PNG, JPEG or WebP.'); }
  };
  const trySample = () => { const s = sampleSketch(); setPic({ ...s, name: 'Sample sketch' }); setPicError(''); setPo(defaultPictureOptions()); };
  const setMountains = (v: number) => { set({ mountains: v / 100 }); setPlanetOption({ mountains: v }, true); };
  const range = (label: string, key: NumberKey, min: number, max: number, show: (v: number) => string, keepPreset = false) =>
    <label className="world-field">{label} <output>{show(p[key])}</output><input type="range" min={min} max={max} value={p[key]} onChange={e => setPlanetOption({ [key]: +e.target.value }, keepPreset)}/></label>;
  const toggleBiome = (id: typeof planetBiomes[number]) => setPlanetOption({ biomesOff: p.biomesOff.includes(id) ? p.biomesOff.filter(b => b !== id) : [...p.biomesOff, id] });
  return <ToolDialog title="Generate a world" wide onClose={onClose}>
    <div className="world-generate">
      <div className="world-generate-options">
        <div className="world-kinds" role="group" aria-label="Kind of map">
          <button type="button" className="world-kind-planet" aria-pressed={mode === 'planet'} onClick={() => setMode('planet')}><strong>Whole planet</strong><span>Every continent and ocean, with climate from the poles to the equator</span></button>
          <button type="button" aria-pressed={hand} onClick={() => { setMode('hand'); if (tab === 'land' || tab === 'places') setTab('planet'); }}><strong>Draw by hand</strong><span>A planet of empty sea to draw your own continents on</span></button>
          <button type="button" aria-pressed={fromPicture} onClick={() => { setMode('picture'); if (tab === 'land') setTab('planet'); }}><strong>From a picture</strong><span>A sketch, a photo of a hand-drawn map, or a map from another tool</span></button>
          {worldKinds.map(k => <button key={k.id} type="button" aria-pressed={mode === 'area' && o.kind === k.id} onClick={() => { setMode('area'); set({ kind: k.id }); }}><strong>{k.name}</strong><span>{k.hint}</span></button>)}
        </div>
        {fromPicture && <div className="world-picture">
          <div className="world-picture-thumb">{pic ? <PictureThumb pic={pic} land={picture?.land ?? null}/> : <span>No picture yet</span>}</div>
          <div className="button-row">
            <label className="button"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" hidden onChange={e => { void openPicture(e.target.files?.[0]); e.target.value = ''; }}/><ImageUp size={15}/> {pic ? 'Another picture' : 'Upload a picture'}</label>
            <button type="button" className="button" onClick={trySample}>Try a sample sketch</button>
          </div>
          {picError && <p className="form-error" role="alert">{picError}</p>}
          <p className="aside-hint">The picture is read on this device and never uploaded or saved: only the map made from it is kept.{pic ? ` Land found in it is tinted green.` : ''}</p>
          <div className="world-field">Land is{picture && po.landIs === 'auto' ? <output>{landIsNames[picture.found]}</output> : null}
            <div className="world-seg" role="group" aria-label="Land is">{(Object.keys(landIsNames) as LandIs[]).map(k => <button key={k} type="button" aria-pressed={po.landIs === k} onClick={() => setPo(v => ({ ...v, landIs: k }))}>{landIsNames[k]}</button>)}</div>
            <small className="aside-hint">{(picture?.found ?? po.landIs) === 'blue' ? 'Anything that isn\'t blue water is land.' : (picture?.found ?? po.landIs) === 'light' ? 'Light land on a dark sea.' : 'Dark lines on paper. A coast drawn as an outline is enough: anything enclosed by a line is land.'}</small>
          </div>
          {(picture?.found ?? po.landIs) !== 'blue' && <label className="world-field">{(picture?.found ?? po.landIs) === 'light' ? 'Land is lighter than' : 'Ink is darker than'} <output>{po.threshold}%</output><input type="range" min={20} max={90} value={po.threshold} onChange={e => setPo(v => ({ ...v, threshold: +e.target.value }))}/></label>}
          <label className="world-field">Follow the picture <output>{po.follow >= 90 ? 'Exactly' : po.follow >= 60 ? 'Closely' : po.follow >= 30 ? 'Loosely' : 'Freely'}</output><input type="range" min={0} max={100} value={po.follow} onChange={e => setPo(v => ({ ...v, follow: +e.target.value }))}/></label>
          <label className="world-field">Mountains <output>{amount(p.mountains)}</output><input type="range" min={0} max={100} value={p.mountains} onChange={e => setMountains(+e.target.value)}/></label>
          <label className="world-check"><input type="checkbox" checked={po.shading} onChange={e => setPo(v => ({ ...v, shading: e.target.checked }))}/><span>Darker land is higher ground<small>Mountains drawn as little peaks, or a shaded map: darker parts of the land become hills and mountains.</small></span></label>
          <div className="world-field">How much of it
            <div className="world-seg" role="group" aria-label="How much of it"><button type="button" aria-pressed={picScale === 'planet'} onClick={() => setPicScale('planet')}>Whole planet</button>{(Object.keys(worldAcross) as WorldAcross[]).slice().reverse().map(a => <button key={a} type="button" aria-pressed={picScale === a} onClick={() => setPicScale(a)}>{worldAcross[a].name}</button>)}</div>
          </div>
        </div>}
        {planet ? <>
          <div className="planet-tabs" role="tablist" aria-label="Planet settings">
            {planetTabs.filter(t => mode === 'planet' || t.id === 'planet' || t.id === 'biomes' || (fromPicture && t.id === 'places')).map(t => <button key={t.id} type="button" role="tab" id={`planet-tab-${t.id}`} aria-controls="planet-panel" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.name}</button>)}
          </div>
          <div className="planet-panel" id="planet-panel" role="tabpanel" aria-labelledby={`planet-tab-${tab}`}>
            {tab === 'planet' && <>
              {!own && <div className="world-field">Start from
                <div className="planet-presets" role="group" aria-label="Kind of planet">{planetPresets.map(x => <button key={x.id} type="button" aria-pressed={preset === x.id} onClick={() => { setP(v => withPreset(v, x.id)); setPreset(x.id); }}><PresetThumb id={x.id}/>{x.name}</button>)}</div>
              </div>}
              {!own && range('Water', 'water', 0, 100, v => `${v}% sea`)}
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
        {!fromPicture && <div className="world-field">Across
          <div className="world-seg" role="group" aria-label="Across">{(Object.keys(worldAcross) as WorldAcross[]).map(a => <button key={a} type="button" aria-pressed={o.across === a} onClick={() => set({ across: a })}>{worldAcross[a].name} {worldAcross[a].miles.toLocaleString()} mi</button>)}</div>
        </div>}
        {!fromPicture && o.kind !== 'inland' && <label className="world-field">Sea level <output>{Math.round(o.seaLevel * 100)}% sea</output><input type="range" min={20} max={80} value={Math.round(o.seaLevel * 100)} onChange={e => set({ seaLevel: +e.target.value / 100 })}/></label>}
        {!fromPicture && <label className="world-field">Mountains <output>{o.mountains < 0.25 ? 'Few' : o.mountains < 0.6 ? 'Some' : 'Many'}</output><input type="range" min={0} max={100} value={Math.round(o.mountains * 100)} onChange={e => set({ mountains: +e.target.value / 100 })}/></label>}
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
        {world && <div className="world-seg planet-view" role="group" aria-label="View"><button type="button" aria-pressed={!globe} onClick={() => setGlobe(false)}>Flat map</button><button type="button" aria-pressed={globe} onClick={() => setGlobe(true)}>Globe</button></div>}
        <div className={`world-generate-map${globe && world ? ' is-globe' : ''}`} aria-busy={(planet && planetOptions !== p) || (fromPicture && pictureOptions !== po)}>
          {globe && pixels && world ? <PlanetGlobe pixels={pixels} width={world.w} height={world.h} locked={options.rotation === 'locked'} label="The planet as a globe"/> : preview ? <MapCanvas map={preview}/> : <p className="world-generate-empty">Upload a picture, or try the sample sketch, to see the map it makes.</p>}
        </div>
        {stats && <p className="planet-stats"><span>Land <b>{pct(stats.land)}</b></span><span>Ice <b>{pct(stats.ice)}</b></span><span>Livable land <b>{pct(stats.livable)}</b></span><span>Towns <b>{towns}</b></span><span>Rivers <b>{rivers}</b></span></p>}
        {mode === 'planet' && <section className="planet-checks" aria-label="Built-in checks">
          <h3>Built-in checks <span className={notes ? 'is-note' : 'is-ok'}>{notes ? `${notes} to look at` : 'Looks plausible'}</span></h3>
          <ul>{checks.map((c, i) => <li key={i} className={`check-${c.kind}`}>{c.text}</li>)}</ul>
        </section>}
        {result && <p className="aside-hint">{fromPicture
          ? `${picScale === 'planet' ? 'The picture is fitted over the whole planet, which wraps east to west like a globe.' : `The picture is fitted to the map, ${result.scale!.width.toLocaleString()} ${result.scale!.unit} across.`} Anything outside the picture is sea. Climate, biomes, rivers and towns are worked out as for a generated map, and you can keep shaping it afterwards. This replaces the terrain and the rivers and roads it made before.`
          : hand
          ? `You start with a planet of empty sea, with sea ice where it is cold enough. Draw land with Shape land, then raise hills and mountains; ice, deserts and forests follow these settings. This replaces the terrain and the rivers and roads it made before, and sets the map width to ${result.scale!.width.toLocaleString()} ${result.scale!.unit} around the equator.`
          : planet
          ? `The map wraps east to west like a globe. ${added ? `${added} new place${added === 1 ? '' : 's'}, GM only until you share them. ` : ''}This replaces the terrain and the rivers and roads it made before, and sets the map width to ${result.scale!.width.toLocaleString()} ${result.scale!.unit} around the equator.`
          : `The terrain is painted, not tiled, so you can keep shaping coasts and forests with the brush afterwards. Rivers run downhill from the mountains to the sea. This replaces the terrain and the rivers and roads it made before, and sets the map width to ${result.scale!.width.toLocaleString()} ${result.scale!.unit}.`}</p>}
        <div className="button-row world-generate-actions"><button type="button" className="button" onClick={onClose}>Cancel</button><button type="button" className="button primary" disabled={!result} onClick={() => result && onUse({ ...result, compass: map.compass ?? true, scaleBar: map.scaleBar ?? true }, hand)}>{hand ? 'Start drawing' : fromPicture ? 'Use this map' : 'Use this world'}</button></div>
      </div>
    </div>
  </ToolDialog>;
}
