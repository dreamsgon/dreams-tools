'use client';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ImageUp } from 'lucide-react';
import { decodePaint, isWater, terrainIndex, terrains, type MapData } from '@/lib/encyclopedia/map-model';
import type { Entry } from '@/lib/encyclopedia/world-model';
import type { WorldChange, WorldCheckRequest } from '@/lib/encyclopedia/world-check';
import { defaultWorldOptions, generateWorld, worldAcross, worldClimates, worldKinds, type WorldAcross, type WorldOptions } from '@/lib/encyclopedia/world-generator';
import { defaultPictureOptions, landIsNames, pictureArea, picturePlanet, pictureReadSize, readPicture, sampleSketch, type LandIs, type PictureOptions } from '@/lib/encyclopedia/picture-map';
import { buildPlanet, defaultPlanetOptions, generatePlanet, handPlanet, planetBiomes, planetChecks, planetMapSize, planetPixels, planetPresets, planetSizes, planetStats, rainWord, temperatureWords, withPreset, type PlanetLife, type PlanetOptions, type PlanetSize } from '@/lib/encyclopedia/planet-generator';
import { Actions, Cards, Check, Choice, GenDialog, Generator, Hint, Picture, Range, Section, Seed, Summary, type Card } from '../generator/generator';
import { MapCanvas } from './map-canvas';
import { PlanetGlobe } from './planet-globe';
import { WorldAiCheck } from './world-ai-check';
import { surveyStart, type SurveyWorld } from '@/lib/encyclopedia/planet-from-system';

const words = ['amber', 'ash', 'briar', 'cinder', 'dusk', 'ember', 'frost', 'gale', 'harrow', 'iron', 'lantern', 'moss', 'raven', 'salt', 'thorn', 'willow'];
export const randomWorldSeed = () => `${words[Math.floor(Math.random() * words.length)]}-${Math.floor(Math.random() * 900 + 100)}`;

const amount = (v: number) => v <= 0 ? 'None' : v < 25 ? 'Few' : v < 60 ? 'Some' : v < 85 ? 'Many' : 'Lots';
const coastWord = (v: number) => v < 25 ? 'Smooth' : v < 60 ? 'Natural' : v < 85 ? 'Ragged' : 'Fjords';
const plateWord = (v: number) => v <= 3 ? 'A few big ones' : v <= 8 ? 'Some' : 'Many small ones';
const lifeNames: Record<PlanetLife, string> = { none: 'None', simple: 'Simple', complex: 'Complex' };
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

/** What Check with your AI needs: the map page's name, its campaign, and the pages it can check against. */
export type WorldAiContext = { title: string; campaignId: string | null; campaign: { name: string; description?: string }; pages: Entry[]; suggested: string[] };

/** The map's land by terrain, biggest first, as "Forest 31%", from its paint squares. */
function landShares(paint: MapData['paint']) {
  if (!paint) return { land: 0, kinds: [] as string[] };
  const cells = decodePaint(paint.columns, paint.rows, paint.cells) ?? new Uint8Array(0), count = new Array(terrains.length).fill(0);
  let land = 0;
  for (const t of cells) if (!isWater(t)) { land++; count[t]++; }
  return { land: land / cells.length, kinds: count.map((n, t) => [n, t]).filter(([n]) => n > 0).sort((a, b) => b[0] - a[0]).slice(0, 7).map(([n, t]) => `${terrains[t].name} ${pct(n / land)}`) };
}

/** Generate a world: a whole planet, or a continent, coast, islands or inland region, and see it before using it. */
export function WorldGenerateDialog({ map, ai, survey, onClose, onUse }: {
  map: MapData; ai?: WorldAiContext;
  /** The planet page this map was developed from: a whole planet starts from its survey. */
  survey?: SurveyWorld;
  onClose: () => void; onUse: (patch: Partial<MapData>, hand: boolean) => void;
}) {
  const fromSurvey = useMemo(() => survey ? surveyStart(survey) : null, [survey]);
  const [mode, setMode] = useState<'area' | 'planet' | 'hand' | 'picture'>(survey ? 'planet' : 'area'), hand = mode === 'hand';
  const [pic, setPic] = useState<PictureFile | null>(null), [picError, setPicError] = useState(''), [po, setPo] = useState<PictureOptions>(defaultPictureOptions);
  const [picScale, setPicScale] = useState<PictureScale>('continent'), fromPicture = mode === 'picture';
  /** Whether the result is a whole planet; generated ones also get the Land tab, presets and checks. */
  const planet = mode === 'planet' || hand || (fromPicture && picScale === 'planet'), own = hand || fromPicture;
  const [preset, setPreset] = useState(fromSurvey ? 'survey' : 'earthlike'), [globe, setGlobe] = useState(false);
  const [o, setO] = useState<WorldOptions>(() => ({ ...defaultWorldOptions(map.columns, map.rows, randomWorldSeed()), places: map.pins.length === 0 }));
  const [p, setP] = useState<PlanetOptions>(() => fromSurvey ? { ...fromSurvey.options, ...(map.pins.length ? { places: 0, roads: false, landmarks: false } : {}) } : { ...defaultPlanetOptions(o.seed), places: map.pins.length === 0 ? 12 : 0, roads: map.pins.length === 0, landmarks: map.pins.length === 0 });
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
  // What Check with your AI is told: the settings the GM can change here, in numbers and words, and the map as made.
  const aiRequest = useMemo((): Omit<WorldCheckRequest, 'pages' | 'note'> | null => {
    if (!ai || !result) return null;
    const s = (id: WorldCheckRequest['settings'][number]['id'], value: number | string, words: string) => ({ id, value, words });
    const towns = result.pins.filter(x => x.kind !== 'landmark').length, rivers = result.paths?.filter(x => x.kind === 'river').length ?? 0;
    const made = fromPicture ? ', made from a picture' : hand ? ', drawn by hand' : '';
    if (planet) {
      const settings = [
        s('temp', p.temp, temperatureWords[String(p.temp)]), s('rain', p.rain, rainWord(p.rain)), s('rotation', p.rotation, p.rotation === 'spin' ? 'Spins' : 'Tidally locked'),
        ...(p.rotation === 'spin' ? [s('tilt', p.tilt, `${p.tilt}°`)] : []), s('life', p.life, lifeNames[p.life]), s('size', p.size, planetSizes[p.size].name),
        ...(mode === 'planet' ? [s('water', p.water, `${p.water}% sea`), s('volcanism', p.volcanism, amount(p.volcanism))] : []),
        ...(mode === 'planet' || fromPicture ? [s('mountains', p.mountains, amount(p.mountains))] : []),
      ];
      const summary = stats ? [`Land ${pct(stats.land)} of the surface, ice ${pct(stats.ice)}, mild enough to live on ${pct(stats.livable)} of the land.`,
        `Land by biome: ${planetBiomes.concat(['hills', 'mountains', 'snow', 'barren'] as typeof planetBiomes).map(id => [stats.shares[terrainIndex[id]] ?? 0, id] as const).filter(([v]) => v > 0).sort((a, b) => b[0] - a[0]).slice(0, 7).map(([v, id]) => `${terrains[terrainIndex[id]].name} ${pct(v / Math.max(1e-6, stats.land))}`).join(', ')}.`]
        : hand ? ['An empty sea for now: the GM draws the land by hand afterwards, and biomes follow these settings.'] : [];
      const surveyed = survey ? [`On the star system's survey chart: a ${survey.star}-class star, the ${survey.band} zone, ${survey.temperature} °C, ${survey.gravity} g, ${survey.atmosphere} air, ${survey.water} water, ${survey.life} life${survey.hazard && survey.hazard !== 'None' ? `, hazard: ${survey.hazard}` : ''}${survey.moonOf ? `, a moon of ${survey.moonOf}` : ''}.`] : [];
      return { name: ai.title, what: `a whole planet${made}, ${planetSizes[p.size].miles.toLocaleString('en-US')} miles around`, settings, summary: [...surveyed, ...summary, ...(hand ? [] : [`${towns} towns and ${rivers} rivers.`])] };
    }
    const across = fromPicture ? picScale as WorldAcross : o.across, shares = landShares(result.paint);
    const settings = [s('climate', o.climate, worldClimates.find(c => c.id === o.climate)!.name), s('mountains', Math.round(o.mountains * 100), o.mountains < 0.25 ? 'Few' : o.mountains < 0.6 ? 'Some' : 'Many'),
      ...(!fromPicture && o.kind !== 'inland' ? [s('seaLevel', Math.round(o.seaLevel * 100), `${Math.round(o.seaLevel * 100)}% sea`)] : [])];
    return { name: ai.title, what: `${fromPicture ? 'an area made from a picture' : `a ${worldKinds.find(k => k.id === o.kind)!.name.toLowerCase()} map (${worldKinds.find(k => k.id === o.kind)!.hint.toLowerCase()})`}, ${worldAcross[across].miles.toLocaleString('en-US')} miles across, not a whole planet`, settings,
      summary: [`Land ${pct(shares.land)} of the map.`, ...(shares.kinds.length ? [`Land by terrain: ${shares.kinds.join(', ')}.`] : []), `${towns} towns and ${rivers} rivers.`] };
  }, [ai, result, planet, p, mode, fromPicture, hand, stats, o, picScale, survey]);
  /** A change the AI suggested, applied to these settings. */
  const applyChange = (c: WorldChange) => {
    const v = c.value;
    if (c.setting === 'climate') set({ climate: v as WorldOptions['climate'] });
    else if (c.setting === 'seaLevel') set({ seaLevel: Number(v) / 100 });
    else if (c.setting === 'mountains') { set({ mountains: Number(v) / 100 }); setPlanetOption({ mountains: Number(v) }); }
    else setPlanetOption({ [c.setting]: v } as Partial<PlanetOptions>);
  };
  const towns = result?.pins.filter(p => p.id.startsWith('place-') && p.kind !== 'landmark').length ?? 0, rivers = result?.paths?.filter(p => p.kind === 'river').length ?? 0;
  const openPicture = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 40 * 1024 * 1024) { setPicError('That picture is over 40 MB. Try a smaller copy of it.'); return; }
    try { setPic(await readPictureFile(file)); setPicError(''); } catch { setPicError('That file couldn\'t be read as a picture. Try a PNG, JPEG or WebP.'); }
  };
  const trySample = () => { const s = sampleSketch(); setPic({ ...s, name: 'Sample sketch' }); setPicError(''); setPo(defaultPictureOptions()); };
  const setMountains = (v: number) => { set({ mountains: v / 100 }); setPlanetOption({ mountains: v }, true); };
  const range = (label: string, key: NumberKey, min: number, max: number, show: (v: number) => string, keepPreset = false, hint?: string) =>
    <Range label={label} value={p[key]} min={min} max={max} shown={show(p[key])} onChange={v => setPlanetOption({ [key]: v }, keepPreset)} hint={hint}/>;
  const toggleBiome = (id: typeof planetBiomes[number]) => setPlanetOption({ biomesOff: p.biomesOff.includes(id) ? p.biomesOff.filter(b => b !== id) : [...p.biomesOff, id] });
  type Pick = 'planet' | 'hand' | 'picture' | WorldOptions['kind'];
  const picked: Pick = mode === 'area' ? o.kind : mode;
  const pick = (k: Pick) => { if (k === 'planet' || k === 'hand' || k === 'picture') setMode(k); else { setMode('area'); set({ kind: k }); } };
  const cards: Card<Pick>[] = [
    { id: 'planet', name: 'Whole planet', hint: 'Every continent and ocean, poles to equator' },
    { id: 'hand', name: 'Draw by hand', hint: 'Empty sea to draw your own continents on' },
    { id: 'picture', name: 'From a picture', hint: 'A sketch, a photo or a map from another tool' },
    ...worldKinds.map(k => ({ id: k.id, name: k.name, hint: k.hint })),
  ];
  const width = result?.scale ? `${result.scale.width.toLocaleString()} ${result.scale.unit}` : '';
  const summary = !result ? 'Upload a picture, or try the sample sketch, to see the map it makes.'
    : stats ? `Land ${pct(stats.land)}, ice ${pct(stats.ice)}, livable land ${pct(stats.livable)}. ${towns} towns, ${rivers} rivers.`
    : hand ? `An empty sea, ${width} around the equator.`
    : `${towns} towns and ${rivers} rivers, ${width} ${planet ? 'around the equator' : 'across'}.`;
  const note = !result ? '' : fromPicture ? `${picScale === 'planet' ? 'The picture is fitted over the whole planet, which wraps east to west.' : 'The picture is fitted to the map.'} Anything outside it is sea; climate, rivers and towns are worked out as for a generated map.`
    : hand ? 'Draw land with Shape land, then raise hills and mountains. Ice, deserts and forests follow these settings.'
    : planet ? `The map wraps east to west like a globe.${added ? ` ${added} new place${added === 1 ? '' : 's'}, GM only until you share them.` : ''}`
    : 'The terrain is painted, so you can keep shaping coasts and forests with the brush. Rivers run downhill to the sea.';
  return <GenDialog title="Generate a world" onClose={onClose}>
    <Generator
      kinds={<Cards label="Kind of map" value={picked} cards={cards} onChange={pick}/>}
      settings={<>
        {fromPicture && <Section title="Picture" summary={pic?.name ?? 'None yet'} open>
          <div className="world-picture-thumb">{pic ? <PictureThumb pic={pic} land={picture?.land ?? null}/> : <span>No picture yet</span>}</div>
          <div className="gen-row">
            <label className="gen-btn"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" className="gen-sr" onChange={e => { void openPicture(e.target.files?.[0]); e.target.value = ''; }}/><ImageUp size={15}/> {pic ? 'Another picture' : 'Upload a picture'}</label>
            <button type="button" className="gen-btn" onClick={trySample}>Try a sample sketch</button>
          </div>
          {picError && <Hint alert>{picError}</Hint>}
          <Hint>The picture is read on this device and never uploaded or saved.{pic ? ' Land found in it is tinted green.' : ''}</Hint>
          <Choice label={picture && po.landIs === 'auto' ? `Land is (found: ${landIsNames[picture.found].toLowerCase()})` : 'Land is'} value={po.landIs} options={(Object.keys(landIsNames) as LandIs[]).map(k => [k, landIsNames[k]] as const)} onChange={k => setPo(v => ({ ...v, landIs: k }))}
            hint={(picture?.found ?? po.landIs) === 'blue' ? 'Anything that isn\'t blue water is land.' : (picture?.found ?? po.landIs) === 'light' ? 'Light land on a dark sea.' : 'Dark lines on paper. A coast drawn as an outline is enough.'}/>
          {(picture?.found ?? po.landIs) !== 'blue' && <Range label={(picture?.found ?? po.landIs) === 'light' ? 'Land is lighter than' : 'Ink is darker than'} value={po.threshold} min={20} max={90} shown={`${po.threshold}%`} onChange={v => setPo(x => ({ ...x, threshold: v }))}/>}
          <Range label="Follow the picture" value={po.follow} min={0} max={100} shown={po.follow >= 90 ? 'Exactly' : po.follow >= 60 ? 'Closely' : po.follow >= 30 ? 'Loosely' : 'Freely'} onChange={v => setPo(x => ({ ...x, follow: v }))}/>
          <Range label="Mountains" value={p.mountains} min={0} max={100} shown={amount(p.mountains)} onChange={setMountains}/>
          <Check label="Darker land is higher ground" hint="For drawn peaks or a shaded map: darker land becomes hills and mountains." checked={po.shading} onChange={v => setPo(x => ({ ...x, shading: v }))}/>
          <Choice label="How much of it" value={picScale} options={[['planet', 'Whole planet'] as const, ...(Object.keys(worldAcross) as WorldAcross[]).slice().reverse().map(a => [a, worldAcross[a].name] as const)]} onChange={setPicScale}/>
        </Section>}
        {planet ? <>
          <Section title="Planet" summary={`${planetSizes[p.size].name}, ${temperatureWords[String(p.temp)].toLowerCase()}`} open>
            {survey && fromSurvey && <div className="world-survey">
              <span><strong>From the survey of {survey.name}</strong><small>{fromSurvey.notes.join(' · ')}</small></span>
              <button type="button" className="gen-btn small" disabled={preset === 'survey'} onClick={() => { setP(v => ({ ...fromSurvey.options, places: v.places, roads: v.roads, landmarks: v.landmarks })); setPreset('survey'); }}>{preset === 'survey' ? 'Survey settings' : 'Back to the survey'}</button>
            </div>}
            {!own && <Choice label="Start from" look="tiles" value={preset} options={planetPresets.map(x => [x.id, <><PresetThumb id={x.id}/>{x.name}</>] as const)} onChange={id => { setP(v => withPreset(v, id)); setPreset(id); }}/>}
            {!own && range('Water', 'water', 0, 100, v => `${v}% sea`)}
            {range('Temperature', 'temp', -3, 3, v => temperatureWords[String(v)])}
            {range('Rain', 'rain', 0, 100, rainWord)}
            <Choice label="Day and night" value={p.rotation} options={[['spin', 'Spins'], ['locked', 'Tidally locked']]} onChange={v => setPlanetOption({ rotation: v })}/>
            {p.rotation === 'spin' && range('Axial tilt', 'tilt', 0, 80, v => `${v}°`)}
            <Choice label="Life" value={p.life} options={(Object.keys(lifeNames) as PlanetLife[]).map(l => [l, lifeNames[l]] as const)} onChange={v => setPlanetOption({ life: v })}/>
            <Choice label="Size" value={p.size} options={(Object.keys(planetSizes) as PlanetSize[]).map(z => [z, planetSizes[z].name] as const)} onChange={v => setPlanetOption({ size: v }, true)}/>
          </Section>
          {mode === 'planet' && <Section title="Land" summary={plateWord(p.plates)}>
            {range('Continents', 'plates', 1, 12, plateWord)}
            <Check label="One supercontinent" hint="Pulls the land together into one great landmass." checked={p.pangaea} onChange={v => setPlanetOption({ pangaea: v })}/>
            {range('Mountains', 'mountains', 0, 100, amount)}
            {range('Volcanoes', 'volcanism', 0, 100, amount)}
            {range('Coastline', 'coast', 0, 100, coastWord)}
            {range('Islands', 'islands', 0, 100, amount)}
          </Section>}
          <Section title="Biomes" summary={p.biomesOff.length ? `${planetBiomes.length - p.biomesOff.length} of ${planetBiomes.length}` : 'All'}>
            <Hint>Turn off what this world doesn&apos;t have. Its land becomes the nearest kind it does have.{p.life !== 'complex' ? ' Without complex life, forests and grassland are already bare rock.' : ''}</Hint>
            <div className="planet-biomes" role="group" aria-label="Biomes">
              {planetBiomes.map(id => { const t = terrainIndex[id], on = !p.biomesOff.includes(id); return <button key={id} type="button" aria-pressed={on} onClick={() => toggleBiome(id)}><i style={{ background: terrains[t].color }}/>{terrains[t].name}<span>{stats && on && stats.land ? pct(stats.shares[t] / stats.land) : ''}</span></button>; })}
            </div>
          </Section>
          {(mode === 'planet' || fromPicture) && <Section title="Places" summary={p.places ? `${p.places} towns` : 'None'}>
            {range('Towns', 'places', 0, 30, v => v ? String(v) : 'None', true, 'Towns go where the land is mild, on coasts and rivers.')}
            {range('Rivers', 'rivers', 0, 20, v => v ? String(v) : 'None', true)}
            <Check label="Roads between towns" checked={p.roads} disabled={!p.places} onChange={v => setPlanetOption({ roads: v }, true)}/>
            <Check label="Suggest landmarks" hint="A volcano, ruins, an ancient tree and more, where there is room." checked={p.landmarks} onChange={v => setPlanetOption({ landmarks: v }, true)}/>
            <Hint>Places you have written notes for always stay.</Hint>
          </Section>}
        </> : <>
          {!fromPicture && <Section title="Land" summary={`${worldAcross[o.across].name}, ${Math.round(o.seaLevel * 100)}% sea`} open>
            <Choice label="Across" value={o.across} options={(Object.keys(worldAcross) as WorldAcross[]).map(a => [a, `${worldAcross[a].name} ${worldAcross[a].miles.toLocaleString()} mi`] as const)} onChange={a => set({ across: a })}/>
            {o.kind !== 'inland' && <Range label="Sea level" value={Math.round(o.seaLevel * 100)} min={20} max={80} shown={`${Math.round(o.seaLevel * 100)}% sea`} onChange={v => set({ seaLevel: v / 100 })}/>}
            <Range label="Mountains" value={Math.round(o.mountains * 100)} min={0} max={100} shown={o.mountains < 0.25 ? 'Few' : o.mountains < 0.6 ? 'Some' : 'Many'} onChange={v => set({ mountains: v / 100 })}/>
          </Section>}
          <Section title="Climate and places" summary={worldClimates.find(c => c.id === o.climate)!.name} open>
            <Choice label="Climate" value={o.climate} options={worldClimates.map(c => [c.id, c.name] as const)} onChange={v => set({ climate: v })}/>
            <Check label="Add towns and roads" checked={o.places} onChange={v => set({ places: v })} hint={o.places ? `${added} place${added === 1 ? '' : 's'} with made-up names, GM only until you share them. Places you have written notes for always stay.` : 'Places already on the map stay.'}/>
          </Section>
        </>}
      </>}
      seed={<Seed value={o.seed} maxLength={100} onChange={setSeed} rerolls={[{ label: 'Reroll', onClick: () => setSeed(randomWorldSeed()) }]} hint="The same seed and settings always make the same world."/>}
      picture={<>
        {world && <Choice label="View" hideLabel value={globe ? 'globe' : 'flat'} options={[['flat', 'Flat map'], ['globe', 'Globe']]} onChange={v => setGlobe(v === 'globe')}/>}
        <Picture busy={(planet && planetOptions !== p) || (fromPicture && pictureOptions !== po)} className={`world-generate-map${globe && world ? ' is-globe' : ''}`}>
          {globe && pixels && world ? <PlanetGlobe pixels={pixels} width={world.w} height={world.h} locked={options.rotation === 'locked'} label="The planet as a globe"/> : preview ? <MapCanvas map={preview}/> : <p className="world-generate-empty">No picture yet.</p>}
        </Picture>
      </>}
      summary={<Summary text={summary}/>}
      extras={<>
        {mode === 'planet' && <section className="planet-checks" aria-label="Built-in checks">
          <h3>Built-in checks <span className={notes ? 'is-note' : 'is-ok'}>{notes ? `${notes} to look at` : 'Looks plausible'}</span></h3>
          <ul>{checks.map((c, i) => <li key={i} className={`check-${c.kind}`}>{c.text}</li>)}</ul>
        </section>}
        {ai && aiRequest && <WorldAiCheck campaignId={ai.campaignId} campaign={ai.campaign} pages={ai.pages} suggested={ai.suggested} request={aiRequest} onApply={applyChange}/>}
        {note && <Hint>{note} Using it replaces this map&apos;s terrain, rivers and roads.</Hint>}
      </>}
      actions={<Actions why={!result && 'Upload a picture or try the sample sketch first.'}>
        <button type="button" className="gen-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="gen-btn primary" disabled={!result} onClick={() => result && onUse({ ...result, compass: map.compass ?? true, scaleBar: map.scaleBar ?? true }, hand)}>{hand ? 'Start drawing' : fromPicture ? 'Use this map' : 'Use this world'}</button>
      </Actions>}
    />
  </GenDialog>;
}
