'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, CloudFog, Dices, EyeOff, MapPin as PinIcon, MousePointer2, Paintbrush, Redo2, Route, Shield, Type, Undo2, Waves } from 'lucide-react';
import { decodePaint, encodePaint, fogBrush, mapKinds, mapPaint, paintScale, pointCell, pointRevealed, terrains, tilesFromPaint, pathKinds, placeKinds, type MapData, type MapLabel, type MapPaint, type MapPath, type MapPin } from '@/lib/encyclopedia/map-model';
import { newId, visibleEntries, type Campaign, type Entry, type Workspace } from '@/lib/encyclopedia/world-model';
import { paintStroke, thinLine } from '@/lib/encyclopedia/terrain-art';
import { crawlPlan, type Pace } from '@/lib/encyclopedia/hex-crawl';
import type { Calendar } from '@/lib/encyclopedia/calendar-model';
import type { TableLibrary } from '@/lib/encyclopedia/tables';
import { HexInspector } from './hex-inspector';
import { MapCanvas, useMapImage } from './map-canvas';
import { MapViewport } from './map-viewport';
import { PinDialog } from './map-editor';
import { WorldGenerateDialog } from './world-generate-dialog';

type Tool = 'select' | 'terrain' | 'river' | 'road' | 'border' | 'place' | 'label' | 'fog';
type Snapshot = Pick<MapData, 'paint' | 'tiles' | 'pins' | 'scale' | 'seed' | 'paths' | 'labels'>;
const tools: { id: Tool; name: string; key: string; icon: typeof Paintbrush }[] = [
  { id: 'select', name: 'Select', key: 'V', icon: MousePointer2 },
  { id: 'terrain', name: 'Terrain', key: 'B', icon: Paintbrush },
  { id: 'river', name: 'River', key: 'I', icon: Waves },
  { id: 'road', name: 'Road', key: 'O', icon: Route },
  { id: 'border', name: 'Border', key: 'K', icon: Shield },
  { id: 'place', name: 'Place', key: 'P', icon: PinIcon },
  { id: 'label', name: 'Label', key: 'T', icon: Type },
  { id: 'fog', name: 'Fog', key: 'F', icon: CloudFog },
];

/** The full-screen world and area map editor: tools on a rail, the map in the middle, and an inspector. */
export function WorldMapStudio({ entry, data, campaign, setMap, close, start, onOpen, onCalendarChange, onNewAreaMap }: {
  entry: Entry; data: Workspace; campaign?: Campaign; setMap: (patch: Partial<MapData>) => void; close: () => void; start?: 'generate'; onOpen?: (id: string) => void;
  onCalendarChange?: (c: Calendar) => boolean; onNewAreaMap?: (pinId: string) => void;
}) {
  const map = entry.mapData!;
  const painted = map.source === 'generated';
  const [tool, setTool] = useState<Tool>(painted && map.category !== 'hex' ? 'terrain' : 'select');
  const [terrain, setTerrain] = useState(2), [radius, setRadius] = useState(3), [landOnly, setLandOnly] = useState(true);
  const [live, setLive] = useState<MapPaint | null>(null);
  const [undo, setUndo] = useState<Snapshot[]>([]), [redo, setRedo] = useState<Snapshot[]>([]);
  const [selected, setSelected] = useState(''), [editingPin, setEditingPin] = useState<MapPin | null>(null);
  const [fogMode, setFogMode] = useState<'reveal' | 'conceal'>('reveal'), [fogSize, setFogSize] = useState(1);
  const [show, setShow] = useState({ art: true, pins: true, routes: true, paths: true, labels: true });
  const [draft, setDraft] = useState<MapPath | null>(null), [newLabel, setNewLabel] = useState('');
  const [generating, setGenerating] = useState(start === 'generate' && map.source === 'generated');
  const [cell, setCell] = useState(-1), [pace, setPace] = useState<Pace>('normal');
  const [library, setLibrary] = useState<TableLibrary | null | 'error'>(null);
  const gridded = map.grid !== 'none';
  useEffect(() => {
    if (!gridded || library) return;
    let live = true;
    fetch('/api/encyclopedia/tables').then(r => r.ok ? r.json() : Promise.reject(r)).then((body: { data?: TableLibrary }) => { if (live) setLibrary(body.data?.tables ? body.data : { schemaVersion: 1, tables: [] }); }).catch(() => { if (live) setLibrary('error'); });
    return () => { live = false; };
  }, [gridded, library]);
  const select = (id: string) => { setSelected(id); setCell(-1); };
  const plan = cell >= 0 && map.party ? crawlPlan(map, cell, pace) : null;
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = dialog.current; if (d && !d.open) d.showModal(); return () => d?.close(); }, []);
  const stroke = useRef<{ cells: Uint8Array; last: { x: number; y: number }; base: MapPaint; changed: boolean } | null>(null);
  const { url } = useMapImage(map);
  const pin = map.pins.find(p => p.id === selected), path = map.paths?.find(p => p.id === selected), label = map.labels?.find(l => l.id === selected);
  const current = live ?? (painted ? mapPaint(map) : null);
  const areaMaps = visibleEntries(data, entry.worldId, entry.campaignId).filter(e => e.kind === 'map' && e.id !== entry.id);

  const snapshot = (): Snapshot => ({ paint: map.paint, tiles: map.tiles, pins: map.pins, scale: map.scale, seed: map.seed, paths: map.paths, labels: map.labels });
  /** A change that Undo can take back. */
  const edit = (patch: Partial<MapData>) => { setUndo(u => [...u.slice(-29), snapshot()]); setRedo([]); setMap(patch); };
  const setPath = (id: string, patch: Partial<MapPath>) => setMap({ paths: map.paths?.map(p => p.id === id ? { ...p, ...patch } : p) });
  const setLabel = (id: string, patch: Partial<MapLabel>) => setMap({ labels: map.labels?.map(l => l.id === id ? { ...l, ...patch } : l) });
  const removeSelected = () => {
    if (path) edit({ paths: map.paths!.filter(p => p.id !== path.id) });
    else if (label) edit({ labels: map.labels!.filter(l => l.id !== label.id) });
    else if (pin) { if (!confirm('Remove this place and any routes that use it?')) return; edit({ pins: map.pins.filter(p => p.id !== pin.id), routes: map.routes?.filter(r => !r.stops.includes(pin.id)) }); }
    setSelected('');
  };
  const drawing = tool === 'river' || tool === 'road' || tool === 'border';
  const commit = useCallback((paint: MapPaint, before: Snapshot) => {
    setUndo(u => [...u.slice(-29), before]); setRedo([]);
    setMap({ paint, tiles: tilesFromPaint(map, paint) });
  }, [map, setMap]);
  const restore = (from: Snapshot[], to: (s: Snapshot[]) => void, back: (f: (s: Snapshot[]) => Snapshot[]) => void) => {
    const last = from.at(-1); if (!last) return;
    back(s => [...s, snapshot()]); to(from.slice(0, -1));
    setMap(last);
  };
  const doUndo = () => restore(undo, setUndo, setRedo);
  const doRedo = () => restore(redo, setRedo, setUndo);

  const brush = painted && tool === 'terrain' && current ? {
    radius: radius / current.columns,
    onStroke: (x: number, y: number, start: boolean) => {
      if (start || !stroke.current) {
        const base = mapPaint(map)!;
        stroke.current = { cells: decodePaint(base.columns, base.rows, base.cells)!, last: { x, y }, base, changed: false };
      }
      const s = stroke.current;
      if (paintStroke(s.cells, s.base.columns, s.base.rows, s.last, { x, y }, radius, terrain, landOnly)) {
        s.changed = true;
        setLive({ columns: s.base.columns, rows: s.base.rows, cells: encodePaint(s.cells) });
      }
      s.last = { x, y };
    },
    onEnd: () => {
      const s = stroke.current; stroke.current = null;
      if (s?.changed) commit({ columns: s.base.columns, rows: s.base.rows, cells: encodePaint(s.cells) }, snapshot());
      setLive(null);
    },
  } : drawing ? {
    radius: 0,
    onStroke: (x: number, y: number, start: boolean) => {
      setDraft(d => start || !d ? { id: newId(), kind: tool as MapPath['kind'], name: '', points: [{ x, y }, { x, y }], visibility: 'gm' } : { ...d, points: [...d.points.slice(0, 2000), { x, y }] });
    },
    onEnd: () => {
      const d = draft;
      setDraft(null);
      if (!d) return;
      const points = thinLine(d.points, 0.006);
      const long = points.length > 3 || Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y) > 0.01;
      if (points.length >= 2 && long && (map.paths?.length ?? 0) < 300) { edit({ paths: [...(map.paths ?? []), { ...d, points }] }); setSelected(d.id); }
    },
  } : undefined;

  const explore = (i: number) => {
    const values = new Set(map.fog?.revealed ?? []);
    for (const cell of fogBrush(map, i, fogSize)) { if (fogMode === 'reveal') values.add(cell); else values.delete(cell); }
    setMap({ fog: { enabled: true, revealed: [...values].sort((a, b) => a - b) } });
  };
  const addLabel = (x: number, y: number) => {
    if ((map.labels?.length ?? 0) >= 150) return;
    const id = newId();
    edit({ labels: [...(map.labels ?? []), { id, text: 'New name', x, y, size: 'medium', visibility: 'gm' }] });
    setSelected(id); setNewLabel(id); setTool('select');
  };
  const place = (x: number, y: number) => setEditingPin({ id: newId(), title: '', x, y, notes: '', entryId: null, visibility: 'gm' });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.closest('input, textarea, select, [contenteditable="true"]') || editingPin || generating)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = tools.find(x => x.key.toLowerCase() === e.key.toLowerCase());
      if (t && (t.id !== 'terrain' || painted)) { setTool(t.id); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { e.preventDefault(); removeSelected(); return; }
      if (e.key === '[') setRadius(r => Math.max(1, r - 1));
      if (e.key === ']') setRadius(r => Math.min(20, r + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const milesAcross = (squares: number) => map.scale && current ? Math.round(squares / current.columns * map.scale.width) : null;
  const brushMiles = milesAcross(radius * 2);
  const k = paintScale(map.columns, map.rows);

  return <dialog ref={dialog} className="world-studio" aria-label={`Map editor: ${entry.title}`} onCancel={e => { e.preventDefault(); const active = document.activeElement as HTMLElement | null; if (active?.matches('input, textarea, select')) { active.blur(); return; } if (draft) { setDraft(null); return; } if (selected) { setSelected(''); return; } if (cell >= 0) { setCell(-1); return; } if (!editingPin && !generating) close(); }}>
    <header className="world-studio-head">
      <div className="world-studio-title"><strong>{entry.title}</strong><span>{mapKinds[map.category]}</span></div>
      <span className="world-studio-saved"><Check size={13}/> Saved</span>
      {painted && <button className="button" onClick={() => setGenerating(true)}><Dices size={15}/> Generate</button>}
      <button className="icon-button" aria-label="Undo" disabled={!undo.length} onClick={doUndo}><Undo2 size={17}/></button>
      <button className="icon-button" aria-label="Redo" disabled={!redo.length} onClick={doRedo}><Redo2 size={17}/></button>
      <button className="button primary" onClick={close}>Done</button>
    </header>
    <div className="world-studio-body">
      <nav className="world-studio-rail" aria-label="Map tools">
        {tools.filter(t => t.id !== 'terrain' || painted).map(t => <button key={t.id} aria-pressed={tool === t.id} title={`${t.name} (${t.key})`} onClick={() => setTool(t.id)}><t.icon size={19}/><span>{t.name}</span></button>)}
      </nav>
      <section className="world-studio-map">
        <MapViewport map={map} editing={tool !== 'select'}>
          <MapCanvas map={map} paint={live ?? undefined} imageUrl={url} selectedPin={selected} show={show} draft={draft} selectedCell={cell} route={plan?.cells}
            brush={brush} fogEditing={tool === 'fog'} onCell={tool === 'fog' ? explore : undefined}
            selectedItem={selected} onItem={tool === 'select' ? select : undefined}
            onPlace={tool === 'place' ? place : tool === 'label' ? addLabel : tool === 'select' ? (x, y) => { setSelected(''); setCell(gridded ? pointCell(map, x, y) : -1); } : undefined} onPin={id => { select(id); if (tool !== 'select') setTool('select'); }}/>
        </MapViewport>
        <p className="world-studio-tip">{tool === 'terrain' ? 'Drag to paint. [ and ] change the brush size.' : drawing ? `Drag to draw a ${tool}. Name it in the inspector afterwards.` : tool === 'label' ? 'Click the map to write a name, like a sea, a region or a mountain range.' : tool === 'place' ? 'Click the map to add a place.' : tool === 'fog' ? `Click or drag to ${fogMode === 'reveal' ? 'reveal' : 'hide'} areas for players.` : gridded ? `Click a ${map.grid === 'hex' ? 'hex' : 'square'} to write notes, roll encounters or move the party. Click a place to see its notes.` : 'Select a place to see its notes. Drag to move around when zoomed in.'}</p>
      </section>
      <aside className="world-studio-inspector" aria-label="Inspector">
        {tool === 'terrain' && painted && <>
          <h3><Paintbrush size={17}/> Terrain brush</h3>
          <div className="world-swatches" role="group" aria-label="Terrain">
            {terrains.map((t, i) => <button key={t.name} aria-pressed={terrain === i} onClick={() => setTerrain(i)}><span style={{ background: t.color }}/>{t.name}</button>)}
          </div>
          <label className="world-field">Brush size <output>{brushMiles ? `${brushMiles} ${map.scale!.unit} across` : `${radius * 2} squares`}</output>
            <input type="range" min={1} max={20} value={radius} onChange={e => setRadius(+e.target.value)}/></label>
          <label className="world-check"><input type="checkbox" checked={landOnly} disabled={terrain === 0} onChange={e => setLandOnly(e.target.checked)}/><span>Only paint on land<small>The sea and coastline stay put while you paint forests or hills.</small></span></label>
          <p className="aside-hint">Each map cell holds {k} × {k} paint squares, so coasts, forests and mountains can take any shape. Fog and coordinates still use the map cells.</p>
        </>}
        {tool === 'fog' && <>
          <h3><CloudFog size={17}/> Fog of war</h3>
          <label className="world-check"><input type="checkbox" checked={map.fog?.enabled ?? false} onChange={e => setMap({ fog: { enabled: e.target.checked, revealed: map.fog?.revealed ?? [] } })}/><span>Hide unexplored areas from players<small>{map.fog?.enabled ? `${map.fog.revealed.length} of ${map.columns * map.rows} cells explored.` : 'Players see the whole shared map.'}</small></span></label>
          <div className="world-seg" role="group" aria-label="Fog brush">
            <button aria-pressed={fogMode === 'reveal'} onClick={() => setFogMode('reveal')}>Reveal</button>
            <button aria-pressed={fogMode === 'conceal'} onClick={() => setFogMode('conceal')}>Hide</button>
          </div>
          <label className="world-field">Brush<select value={fogSize} onChange={e => setFogSize(+e.target.value)}><option value={0}>1 cell</option><option value={1}>3 cells wide</option><option value={2}>5 cells wide</option></select></label>
          <div className="button-row">
            <button className="button" onClick={() => setMap({ fog: { enabled: true, revealed: Array.from({ length: map.columns * map.rows }, (_, i) => i) } })}>Reveal all</button>
            <button className="button" onClick={() => setMap({ fog: { enabled: true, revealed: [] } })}>Hide all</button>
          </div>
        </>}
        {(tool === 'select' || tool === 'place' || tool === 'label' || drawing) && <>
          {drawing && !path && <><h3>{tool === 'river' ? <Waves size={17}/> : tool === 'road' ? <Route size={17}/> : <Shield size={17}/>} {tool === 'river' ? 'Rivers' : tool === 'road' ? 'Roads' : 'Borders'}</h3><p className="aside-hint">{tool === 'river' ? 'Draw from the source down to the sea or a lake.' : tool === 'road' ? 'Draw roads between places. Travel routes still measure the distances.' : 'Draw the edge of a realm, a province or a wild region.'} Select a line afterwards to name it, change it, or delete it.</p></>}
          {pin ? <div className="world-pin">
            <span className="world-label">Place</span>
            <h3>{pin.title}</h3>
            <div className="world-chips" role="group" aria-label="Kind of place">
              <button aria-pressed={!pin.kind} onClick={() => setMap({ pins: map.pins.map(p => p.id === pin.id ? { ...p, kind: undefined } : p) })}>Numbered pin</button>
              {placeKinds.map(k => <button key={k.id} aria-pressed={pin.kind === k.id} onClick={() => setMap({ pins: map.pins.map(p => p.id === pin.id ? { ...p, kind: k.id } : p) })}>{k.name}</button>)}
            </div>
            <p>{pin.notes || 'No notes yet.'}</p>
            <label className="world-field">Area map<select value={pin.areaMapId ?? ''} onChange={e => setMap({ pins: map.pins.map(p => p.id === pin.id ? { ...p, areaMapId: e.target.value || null } : p) })}><option value="">None</option>{areaMaps.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</select></label>
            <div className="button-row">
              {pin.areaMapId && onOpen && areaMaps.some(m => m.id === pin.areaMapId) && <button className="button primary" onClick={() => { close(); onOpen(pin.areaMapId!); }}>Open area map <ArrowUpRight size={14}/></button>}
              {pin.entryId && onOpen && <button className="button" onClick={() => { close(); onOpen(pin.entryId!); }}>Open article <ArrowUpRight size={14}/></button>}
              {!pin.areaMapId && onNewAreaMap && <button className="button" onClick={() => { close(); onNewAreaMap(pin.id); }}>New area map</button>}
            </div>
            <div className="button-row">
              <button className="button" onClick={() => setEditingPin(pin)}>Edit place</button>
              <button className="text-button" onClick={removeSelected}>Remove</button>
            </div>
          </div> : path ? <div className="world-pin">
            <span className="world-label">{pathKinds.find(k => k.id === path.kind)!.name}</span>
            <label className="world-field">Name<input value={path.name} maxLength={100} placeholder={path.kind === 'river' ? 'The Silverrun' : path.kind === 'road' ? 'The King’s Road' : 'Edge of the Duchy'} onChange={e => setPath(path.id, { name: e.target.value })}/></label>
            <div className="world-seg" role="group" aria-label="Kind of line">{pathKinds.map(k => <button key={k.id} aria-pressed={path.kind === k.id} onClick={() => setPath(path.id, { kind: k.id })}>{k.name}</button>)}</div>
            <label className="world-field">Who can see it<select value={path.visibility} onChange={e => setPath(path.id, { visibility: e.target.value as MapPath['visibility'] })}><option value="gm">GM only</option><option value="players">Players too</option></select></label>
            <button className="text-button" onClick={removeSelected}>Delete {path.kind}</button>
          </div> : label ? <div className="world-pin">
            <span className="world-label">Label</span>
            <label className="world-field">Text<input key={label.id} autoFocus={newLabel === label.id} onFocus={e => { if (newLabel === label.id) { e.currentTarget.select(); setNewLabel(''); } }} value={label.text} maxLength={80} onChange={e => setLabel(label.id, { text: e.target.value })} onBlur={e => { if (!e.target.value.trim()) setLabel(label.id, { text: 'Unnamed' }); }}/></label>
            <div className="world-seg" role="group" aria-label="Size">{(['small', 'medium', 'large'] as const).map(z => <button key={z} aria-pressed={label.size === z} onClick={() => setLabel(label.id, { size: z })}>{z === 'small' ? 'Small' : z === 'medium' ? 'Medium' : 'Large'}</button>)}</div>
            <label className="world-field">Who can see it<select value={label.visibility} onChange={e => setLabel(label.id, { visibility: e.target.value as MapLabel['visibility'] })}><option value="gm">GM only</option><option value="players">Players too</option></select></label>
            <button className="text-button" onClick={removeSelected}>Delete label</button>
          </div> : cell >= 0 && tool === 'select' ? <HexInspector key={cell} map={map} cell={cell} plan={plan} pace={pace} setPace={setPace} campaign={campaign} library={library} setMap={setMap} onCalendarChange={onCalendarChange}/>
          : !drawing && <>
            <h3>Map</h3>
            <label className="world-field">Map type<select value={map.category} onChange={e => setMap({ category: e.target.value as MapData['category'] })}>{Object.entries(mapKinds).map(([key, v]) => <option key={key} value={key}>{v}</option>)}</select></label>
            <div className="world-pair">
              <label className="world-field">Map width<input type="number" min={1} max={10000000} value={map.scale?.width ?? ''} placeholder="Not set" onChange={e => { const n = +e.target.value; setMap({ scale: n > 0 ? { width: n, unit: map.scale?.unit ?? 'mi' } : undefined, scaleBar: n > 0 ? map.scaleBar : false }); }}/></label>
              <label className="world-field">Unit<select value={map.scale?.unit ?? 'mi'} disabled={!map.scale} onChange={e => map.scale && setMap({ scale: { ...map.scale, unit: e.target.value as 'mi' | 'km' } })}><option value="mi">miles</option><option value="km">km</option></select></label>
            </div>
            <label className="world-check"><input type="checkbox" checked={!!map.compass} onChange={e => setMap({ compass: e.target.checked })}/><span>Compass</span></label>
            <label className="world-check"><input type="checkbox" checked={!!map.scaleBar} disabled={!map.scale} onChange={e => setMap({ scaleBar: e.target.checked })}/><span>Scale bar<small>{map.scale ? 'Sized from the map width.' : 'Set the map width first.'}</small></span></label>
            <label className="world-field">Grid<select value={map.grid} disabled={map.fog?.enabled} title={map.fog?.enabled ? 'Turn fog off to change the grid' : undefined} onChange={e => setMap({ grid: e.target.value as MapData['grid'] })}><option value="none">No grid</option><option value="hex">Hex grid</option><option value="square">Square grid</option></select></label>
            <label className="world-check"><input type="checkbox" checked={map.coordinates} onChange={e => setMap({ coordinates: e.target.checked })}/><span>Cell numbers</span></label>
          </>}
          {cell < 0 && <>
          <h3 className="world-sub">Show</h3>
          {painted && <label className="world-check"><input type="checkbox" checked={show.art} onChange={e => setShow({ ...show, art: e.target.checked })}/><span>Mountains, hills and trees</span></label>}
          <label className="world-check"><input type="checkbox" checked={show.pins} onChange={e => setShow({ ...show, pins: e.target.checked })}/><span>Places <small>{map.pins.length} of 100</small></span></label>
          <label className="world-check"><input type="checkbox" checked={show.paths} onChange={e => setShow({ ...show, paths: e.target.checked })}/><span>Rivers, roads and borders</span></label>
          <label className="world-check"><input type="checkbox" checked={show.labels} onChange={e => setShow({ ...show, labels: e.target.checked })}/><span>Names on the map</span></label>
          <label className="world-check"><input type="checkbox" checked={show.routes} onChange={e => setShow({ ...show, routes: e.target.checked })}/><span>Travel routes</span></label>
          <h3 className="world-sub">Places</h3>
          {map.pins.length ? <ul className="world-places">{map.pins.map((p, i) => <li key={p.id}><button aria-pressed={selected === p.id} onClick={() => select(selected === p.id ? '' : p.id)}><span>{i + 1}</span>{p.title}{(p.visibility === 'gm' || !pointRevealed(map, p.x, p.y)) && <EyeOff size={13} aria-label="Hidden from players"/>}</button></li>)}</ul>
            : <p className="aside-hint">Choose Place, then click the map.</p>}
          </>}
        </>}
      </aside>
    </div>
    {generating && <WorldGenerateDialog map={map} onClose={() => setGenerating(false)} onUse={patch => { setUndo(u => [...u.slice(-29), snapshot()]); setRedo([]); setMap(patch); setGenerating(false); setTool('terrain'); }}/>}
    {editingPin && <PinDialog key={editingPin.id} pin={editingPin} campaign={campaign} entries={visibleEntries(data, entry.worldId, entry.campaignId).filter(e => e.id !== entry.id)}
      onClose={() => setEditingPin(null)}
      onSave={p => { if (!map.pins.some(v => v.id === p.id) && map.pins.length >= 100) return; edit({ pins: map.pins.some(v => v.id === p.id) ? map.pins.map(v => v.id === p.id ? p : v) : [...map.pins, p] }); select(p.id); setEditingPin(null); setTool('select'); }}/>}
  </dialog>;
}
