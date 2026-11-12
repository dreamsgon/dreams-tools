'use client';
import { useMemo, useState } from 'react';
import { Dices } from 'lucide-react';
import type { MapData } from '@/lib/encyclopedia/map-model';
import { defaultWorldOptions, generateWorld, worldAcross, worldClimates, worldKinds, type WorldAcross, type WorldOptions } from '@/lib/encyclopedia/world-generator';
import { ToolDialog } from './character-tools';
import { MapCanvas } from './map-canvas';

const words = ['amber', 'ash', 'briar', 'cinder', 'dusk', 'ember', 'frost', 'gale', 'harrow', 'iron', 'lantern', 'moss', 'raven', 'salt', 'thorn', 'willow'];
export const randomWorldSeed = () => `${words[Math.floor(Math.random() * words.length)]}-${Math.floor(Math.random() * 900 + 100)}`;

/** Generate a world: pick the kind of land, its size, sea level, mountains and climate, and see it before using it. */
export function WorldGenerateDialog({ map, onClose, onUse }: { map: MapData; onClose: () => void; onUse: (patch: Partial<MapData>) => void }) {
  const [o, setO] = useState<WorldOptions>(() => ({ ...defaultWorldOptions(map.columns, map.rows, randomWorldSeed()), places: map.pins.length === 0 }));
  const set = (patch: Partial<WorldOptions>) => setO(v => ({ ...v, ...patch }));
  const result = useMemo(() => generateWorld({ ...o, seed: o.seed.trim() || 'world' }, map), [o, map]);
  const preview: MapData = { ...map, ...result, source: 'generated', imageId: null, fog: undefined, routes: [], compass: true, scaleBar: true };
  const added = result.pins.filter(p => !map.pins.some(q => q.id === p.id)).length;
  return <ToolDialog title="Generate a world" wide onClose={onClose}>
    <div className="world-generate">
      <div className="world-generate-options">
        <div className="world-kinds" role="group" aria-label="Kind of map">
          {worldKinds.map(k => <button key={k.id} type="button" aria-pressed={o.kind === k.id} onClick={() => set({ kind: k.id })}><strong>{k.name}</strong><span>{k.hint}</span></button>)}
        </div>
        <div className="world-field">Across
          <div className="world-seg" role="group" aria-label="Across">{(Object.keys(worldAcross) as WorldAcross[]).map(a => <button key={a} type="button" aria-pressed={o.across === a} onClick={() => set({ across: a })}>{worldAcross[a].name} {worldAcross[a].miles.toLocaleString()} mi</button>)}</div>
        </div>
        {o.kind !== 'inland' && <label className="world-field">Sea level <output>{Math.round(o.seaLevel * 100)}% sea</output><input type="range" min={20} max={80} value={Math.round(o.seaLevel * 100)} onChange={e => set({ seaLevel: +e.target.value / 100 })}/></label>}
        <label className="world-field">Mountains <output>{o.mountains < 0.25 ? 'Few' : o.mountains < 0.6 ? 'Some' : 'Many'}</output><input type="range" min={0} max={100} value={Math.round(o.mountains * 100)} onChange={e => set({ mountains: +e.target.value / 100 })}/></label>
        <div className="world-field">Climate
          <div className="world-seg" role="group" aria-label="Climate">{worldClimates.map(c => <button key={c.id} type="button" aria-pressed={o.climate === c.id} onClick={() => set({ climate: c.id })}>{c.name}</button>)}</div>
        </div>
        <label className="world-check"><input type="checkbox" checked={o.places} onChange={e => set({ places: e.target.checked })}/><span>Add towns and roads<small>{o.places ? `${added} place${added === 1 ? '' : 's'} with made-up names, GM only until you share them. Places you have written notes for always stay.` : 'Places already on the map stay.'}</small></span></label>
        <div className="world-field">Seed (the same seed always makes the same world)
          <div className="world-seed"><input aria-label="Seed" value={o.seed} maxLength={100} onChange={e => set({ seed: e.target.value })}/><button type="button" className="button" onClick={() => set({ seed: randomWorldSeed() })}><Dices size={15}/> Reroll</button></div>
        </div>
      </div>
      <div className="world-generate-preview">
        <div className="world-generate-map"><MapCanvas map={preview}/></div>
        <p className="aside-hint">The terrain is painted, not tiled, so you can keep shaping coasts and forests with the brush afterwards. Rivers run downhill from the mountains to the sea. This replaces the terrain and the rivers and roads it made before, and sets the map width to {result.scale!.width.toLocaleString()} {result.scale!.unit}.</p>
        <div className="button-row world-generate-actions"><button type="button" className="button" onClick={onClose}>Cancel</button><button type="button" className="button primary" onClick={() => onUse({ ...result, compass: map.compass ?? true, scaleBar: map.scaleBar ?? true })}>Use this world</button></div>
      </div>
    </div>
  </ToolDialog>;
}
