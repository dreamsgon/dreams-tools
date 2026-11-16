'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Check, CloudFog, Dices, Eye, EyeOff, Map as MapIcon, MapPin as PinIcon, Mountain, ChevronRight, ZoomIn, MousePointer2, Paintbrush, Redo2, Route, Shield, Stamp, Type, Undo2, Waves } from 'lucide-react';
import { iconKind, mapIcon, settlementGroups, stampGroups } from '@/lib/encyclopedia/map-icons';
import { IconPicker, IconPreview } from './icon-picker';
import { MAX_ICON_BYTES, decodePaint, encodePaint, fogBrush, isWater, terrainIndex, type TerrainId, mapKinds, mapPaint, paintScale, playerMap, pointCell, pointRevealed, terrains, tilesFromPaint, pathKinds, placeKinds, type MapData, type MapLabel, type MapPaint, type MapPath, type MapPin } from '@/lib/encyclopedia/map-model';
import { newId, playerCampaign, visibleEntries, type Campaign, type Entry, type Workspace } from '@/lib/encyclopedia/world-model';
import { holdersByPlace, pinTints, playerHoldersByPlace } from '@/lib/encyclopedia/org-holdings';
import { paintStroke, thinLine } from '@/lib/encyclopedia/terrain-art';
import { crawlPlan, type Pace } from '@/lib/encyclopedia/hex-crawl';
import type { Calendar } from '@/lib/encyclopedia/calendar-model';
import type { TableLibrary } from '@/lib/encyclopedia/tables';
import { HexInspector } from './hex-inspector';
import { WorldUseDialog } from './world-use-dialog';
import { mapLooks, nameFonts, type MapLookId } from '@/lib/encyclopedia/map-looks';
import { MapCanvas, useIconUrls, useMapImage } from './map-canvas';
import { uploadMapImage } from './map-transfer';
import { MapViewport } from './map-viewport';
import { PinDialog, openMapEditorNext } from './map-editor';
// The generators run only in the browser, so they stay out of the server bundle.
const WorldGenerateDialog = dynamic(() => import('./world-generate-dialog').then(m => m.WorldGenerateDialog), { ssr: false });
import { confirmDialog } from '../confirm-dialog';
import type { ShapeMode, ShapeStroke } from '@/lib/encyclopedia/land-shaping';
import type { ZoomFrame, ZoomSize } from '@/lib/encyclopedia/zoom-maps';
import type { MapTools } from './map-tools-loader';
// Shaping land and zooming in load in the browser only, when one of those tools is first picked, so no server bundle carries them.
const MapToolsLoader = dynamic(() => import('./map-tools-loader').then(m => m.MapToolsLoader), { ssr: false });

type Tool = 'select' | 'terrain' | 'shape' | 'zoom' | 'river' | 'road' | 'border' | 'place' | 'stamp' | 'label' | 'fog';
type Snapshot = Pick<MapData, 'paint' | 'tiles' | 'pins' | 'scale' | 'seed' | 'paths' | 'labels' | 'columns' | 'rows' | 'fog' | 'hexes' | 'party' | 'icons'>;
/** Brush colours grouped as water, open land, wet and wooded land, then high and cold ground. */
const brushOrder = ['sea', 'deep', 'seaice', 'grassland', 'steppe', 'savanna', 'desert', 'barren', 'marsh', 'forest', 'boreal', 'jungle', 'hills', 'mountains', 'volcanic', 'snow', 'tundra', 'glacier'].map(id => terrainIndex[id as TerrainId]);
const tools: { id: Tool; name: string; key: string; icon: typeof Paintbrush }[] = [
  { id: 'select', name: 'Select', key: 'V', icon: MousePointer2 },
  { id: 'terrain', name: 'Terrain', key: 'B', icon: Paintbrush },
  { id: 'shape', name: 'Shape land', key: 'L', icon: Mountain },
  { id: 'river', name: 'River', key: 'I', icon: Waves },
  { id: 'road', name: 'Road', key: 'O', icon: Route },
  { id: 'border', name: 'Border', key: 'K', icon: Shield },
  { id: 'place', name: 'Place', key: 'P', icon: PinIcon },
  { id: 'stamp', name: 'Stamp', key: 'S', icon: Stamp },
  { id: 'label', name: 'Label', key: 'T', icon: Type },
  { id: 'fog', name: 'Fog', key: 'F', icon: CloudFog },
  { id: 'zoom', name: 'Zoom in', key: 'Z', icon: ZoomIn },
];
const shapeModes: { id: ShapeMode; name: string }[] = [{ id: 'land', name: 'Draw land' }, { id: 'sea', name: 'Draw sea' }, { id: 'raise', name: 'Raise' }, { id: 'lower', name: 'Lower' }, { id: 'flatten', name: 'Flatten' }];
/** Terrain, Shape land and Zoom in work on painted maps only. */
const paintTool = (t: Tool) => t === 'terrain' || t === 'shape' || t === 'zoom';

const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
/** Where a closer map's frame sits over the map. */
const frameStyle = (f: ZoomFrame) => ({ left: pct(f.x), top: pct(f.y), width: pct(f.w), height: pct(f.h) });

/** The full-screen world and area map editor: tools on a rail, the map in the middle, and an inspector. */
export function WorldMapStudio({ entry, data, campaign, setMap, close, start, onOpen, onCalendarChange, onNewAreaMap, onNewMap, onRevealInParents }: {
  entry: Entry; data: Workspace; campaign?: Campaign; setMap: (patch: Partial<MapData>) => void; close: () => void; start?: 'generate'; onOpen?: (id: string) => void;
  onCalendarChange?: (c: Calendar) => boolean; onNewAreaMap?: (pinId: string) => void; onRevealInParents?: () => void;
  /** Saves a closer map made with Zoom in as a new map page and opens it in the map editor. */
  onNewMap?: (map: MapData, title: string) => void;
}) {
  const map = entry.mapData!;
  const painted = map.source === 'generated';
  const [tool, setTool] = useState<Tool>(painted && map.category !== 'hex' ? 'terrain' : 'select');
  const [placeIcon, setPlaceIcon] = useState('town'), [stampIcon, setStampIcon] = useState('volcano');
  const [terrain, setTerrain] = useState(2), [radius, setRadius] = useState(3), [landOnly, setLandOnly] = useState(true);
  const [live, setLive] = useState<MapPaint | null>(null);
  const [shapeMode, setShapeMode] = useState<ShapeMode>('raise'), [strength, setStrength] = useState(50), [follow, setFollow] = useState(true);
  const [mapTools, setMapTools] = useState<MapTools | null>(null), shaperReady = !!mapTools;
  const [zoomSize, setZoomSize] = useState<ZoomSize>('kingdom'), [zoomAt, setZoomAt] = useState<{ x: number; y: number } | null>(null), [zoomTitle, setZoomTitle] = useState('');
  const shapeStroke = useRef<ShapeStroke | null>(null);
  // Heights from the last stroke, kept while the terrain is unchanged, so gentle raising adds up between strokes.
  const heights = useRef<{ cells: string; e: Float32Array } | null>(null);
  const [undo, setUndo] = useState<Snapshot[]>([]), [redo, setRedo] = useState<Snapshot[]>([]);
  const [selected, setSelected] = useState(''), [editingPin, setEditingPin] = useState<MapPin | null>(null);
  const [fogMode, setFogMode] = useState<'reveal' | 'conceal'>('reveal'), [fogSize, setFogSize] = useState(1);
  const [show, setShow] = useState({ art: true, pins: true, routes: true, paths: true, labels: true, frames: true });
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
  const [playerView, setPlayerView] = useState(false), [using, setUsing] = useState(false);
  const seen = playerView ? playerMap(map) : map;
  const { url } = useMapImage(seen), iconUrls = useIconUrls(map);
  // Pins of places an organization holds are tinted in its map colour; the player preview follows what players may see.
  const tints = useMemo(() => {
    if (!playerView) return pinTints(map.pins, holdersByPlace(data.entries, { worldId: entry.worldId, campaignId: campaign?.id ?? entry.campaignId }));
    try { return campaign ? pinTints(map.pins, playerHoldersByPlace(playerCampaign(data, campaign.id).entries)) : {}; } catch { return {}; }
  }, [playerView, map.pins, data, entry.worldId, entry.campaignId, campaign]);
  const pin = map.pins.find(p => p.id === selected), path = map.paths?.find(p => p.id === selected), label = map.labels?.find(l => l.id === selected);
  const current = live ?? (painted ? mapPaint(map) : null);
  /** A whole planet: it wraps east to west, and its climate follows land shaped by hand. */
  const planet = !!map.planet && !!map.paint && map.paint.columns === map.paint.rows * 2;
  const keptHeights = (paint: MapPaint) => heights.current?.cells === paint.cells ? heights.current.e : null;
  const areaMaps = visibleEntries(data, entry.worldId, entry.campaignId).filter(e => e.kind === 'map' && e.id !== entry.id);
  // Closer maps made from this one, and the maps this one was zoomed in from, nearest last.
  const closer = data.entries.filter(e => e.kind === 'map' && e.id !== entry.id && e.mapData?.zoomOf?.mapId === entry.id);
  const parents: Entry[] = [];
  for (let up = map.zoomOf; up && parents.length < 8;) { const p = data.entries.find(e => e.id === up!.mapId && e.mapData); if (!p || p.id === entry.id || parents.includes(p)) break; parents.unshift(p); up = p.mapData!.zoomOf; }
  const parent = parents.at(-1);
  /** Leave the editor for another map's page, opening that map in the editor too. */
  const openMap = (id: string) => { if (!onOpen) return; close(); openMapEditorNext(id); onOpen(id); };
  const zoomChoices = mapTools ? mapTools.zoom.zoomChoices(map) : [];
  const size = zoomChoices.find(z => z.id === zoomSize) ?? zoomChoices[0];
  const zoomFrame: ZoomFrame | null = mapTools && size && zoomAt ? mapTools.zoom.zoomFrame(map, size.id, zoomAt.x, zoomAt.y) : null;
  const zoomPreview = useMemo(() => mapTools && size && zoomFrame ? mapTools.zoom.zoomMap(map, entry.id, zoomFrame, size.id, 'Preview') : null,
    // The preview depends on the frame and the map's terrain and places, not on every edit to the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mapTools, size?.id, zoomFrame?.x, zoomFrame?.y, zoomFrame?.w, zoomFrame?.h, map.paint, map.pins, map.paths, map.labels, entry.id]);
  const frameAt = (x: number, y: number, id: ZoomSize | undefined = size?.id) => {
    if (!mapTools || !id) return;
    setZoomAt({ x, y }); setZoomTitle(mapTools.zoom.zoomName(map, mapTools.zoom.zoomFrame(map, id, x, y), id));
  };
  const makeCloser = () => {
    if (!zoomPreview || !onNewMap || !zoomTitle.trim()) return;
    const title = zoomTitle.trim().slice(0, 160);
    close(); onNewMap(zoomPreview, title);
  };

  const snapshot = (): Snapshot => ({ paint: map.paint, tiles: map.tiles, pins: map.pins, scale: map.scale, seed: map.seed, paths: map.paths, labels: map.labels, columns: map.columns, rows: map.rows, fog: map.fog, hexes: map.hexes, party: map.party, icons: map.icons });
  /** A change that Undo can take back. */
  const edit = (patch: Partial<MapData>) => { setUndo(u => [...u.slice(-29), snapshot()]); setRedo([]); setMap(patch); };
  const setStyle = (patch: NonNullable<MapData['mapStyle']>) => setMap({ mapStyle: { ...map.mapStyle, ...patch } });
  const setPath = (id: string, patch: Partial<MapPath>) => setMap({ paths: map.paths?.map(p => p.id === id ? { ...p, ...patch } : p) });
  const setLabel = (id: string, patch: Partial<MapLabel>) => setMap({ labels: map.labels?.map(l => l.id === id ? { ...l, ...patch } : l) });
  const removeSelected = async () => {
    if (path) edit({ paths: map.paths!.filter(p => p.id !== path.id) });
    else if (label) edit({ labels: map.labels!.filter(l => l.id !== label.id) });
    else if (pin) { if (!await confirmDialog({ title: `Remove “${pin.title}”?`, message: 'Routes that use this place are removed too.', confirm: 'Remove place', danger: true })) return; edit({ pins: map.pins.filter(p => p.id !== pin.id), routes: map.routes?.filter(r => !r.stops.includes(pin.id)) }); }
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
  } : painted && tool === 'shape' && current && shaperReady ? {
    radius: radius / current.columns,
    onStroke: (x: number, y: number, start: boolean) => {
      const m = mapTools!.shaping;
      if (start || !shapeStroke.current) {
        const base = mapPaint(map)!;
        shapeStroke.current = m.startShape(decodePaint(base.columns, base.rows, base.cells)!, base.columns, base.rows, { wrap: planet, heights: keptHeights(base), bare: !!map.planet && map.planet.life !== 'complex', at: { x, y } });
      }
      const s = shapeStroke.current;
      if (m.shapeStep(s, { x, y }, radius, shapeMode, strength)) setLive({ columns: s.w, rows: s.h, cells: encodePaint(s.cells) });
    },
    onEnd: () => {
      const s = shapeStroke.current, m = mapTools?.shaping; shapeStroke.current = null;
      if (s && m) {
        const out = m.finishShape(s, follow && planet ? m.planetOptionsOf(map) : undefined), cells = encodePaint(out);
        heights.current = { cells, e: s.heights };
        if (out.some((v, i) => v !== s.start[i])) commit({ columns: s.w, rows: s.h, cells }, snapshot());
      }
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
  const place = (x: number, y: number) => setEditingPin({ id: newId(), title: '', x, y, notes: '', entryId: null, visibility: 'gm', icon: placeIcon, kind: kindFor(placeIcon) });
  /** A landmark stamp goes straight onto the map, named after its icon; select it to rename it or write notes. */
  const stamp = (x: number, y: number) => {
    if (map.pins.length >= 100) return;
    edit({ pins: [...map.pins, { id: newId(), title: mapIcon(stampIcon)?.name ?? map.icons?.find(i => i.id === stampIcon)?.name ?? 'Landmark', x, y, notes: '', entryId: null, visibility: 'gm', icon: stampIcon, kind: kindFor(stampIcon) }] });
  };
  /** New rivers, towns and roads for the land as it is now; places anyone has worked on stay. */
  const redoPlaces = () => {
    const m = mapTools?.shaping, base = mapPaint(map), cells = base && decodePaint(base.columns, base.rows, base.cells);
    if (m && base && cells) edit(m.redoPlanetPlaces(map, cells, keptHeights(base)));
  };
  const kindFor = (icon: string) => icon.startsWith('u-') ? 'landmark' as const : iconKind(icon);
  const setPinIcon = (id: string, icon: string | undefined) => setMap({ pins: map.pins.map(p => p.id === id ? { ...p, icon, kind: icon ? (icon.startsWith('u-') ? p.kind ?? 'landmark' : iconKind(icon)) : undefined } : p) });
  /** An uploaded icon is stored like any map picture and kept with this map. */
  const uploadIcon = async (file: File) => {
    if (file.size > MAX_ICON_BYTES) throw new Error('Choose a picture up to 1 MB.');
    if ((map.icons?.length ?? 0) >= 40) throw new Error('A map can keep up to 40 of your own icons.');
    const image = await uploadMapImage(file), id = `u-${newId().replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 12).padEnd(4, '0')}`;
    edit({ icons: [...(map.icons ?? []), { id, name: file.name.replace(/\.[a-z0-9]+$/i, '').trim().slice(0, 60) || 'Icon', imageId: image.imageId }] });
    if (tool === 'stamp') setStampIcon(id); else setPlaceIcon(id);
  };
  /** Removing an uploaded icon puts the places that used it back to their usual symbol. */
  const removeIcon = (id: string) => {
    edit({ icons: map.icons?.filter(i => i.id !== id), pins: map.pins.map(p => p.icon === id ? { ...p, icon: undefined } : p) });
    if (placeIcon === id) setPlaceIcon('town');
    if (stampIcon === id) setStampIcon('volcano');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.closest('input, textarea, select, [contenteditable="true"]') || editingPin || generating || using)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = tools.find(x => x.key.toLowerCase() === e.key.toLowerCase());
      if (t && (!paintTool(t.id) || painted)) { setTool(t.id); setPlayerView(false); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { e.preventDefault(); void removeSelected(); return; }
      if (e.key === '[') setRadius(r => Math.max(1, r - 1));
      if (e.key === ']') setRadius(r => Math.min(20, r + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const milesAcross = (squares: number) => map.scale && current ? Math.round(squares / current.columns * map.scale.width) : null;
  const brushMiles = milesAcross(radius * 2);
  const k = paintScale(map.columns, map.rows);

  return <dialog ref={dialog} className="world-studio" aria-label={`Map editor: ${entry.title}`} onCancel={e => { e.preventDefault(); const active = document.activeElement as HTMLElement | null; if (active?.matches('input, textarea, select')) { active.blur(); return; } if (draft) { setDraft(null); return; } if (selected) { setSelected(''); return; } if (cell >= 0) { setCell(-1); return; } if (playerView) { setPlayerView(false); return; } if (!editingPin && !generating && !using) close(); }}>
    <header className="world-studio-head">
      <div className="world-studio-title">{parents.length > 0 && <nav className="zoom-path" aria-label="Maps this one is part of">{parents.map(p => <span key={p.id}><button type="button" className="text-button" onClick={() => openMap(p.id)}>{p.title}</button><ChevronRight size={13} aria-hidden="true"/></span>)}</nav>}<strong>{entry.title}</strong><span>{mapKinds[map.category]}</span></div>
      <span className="world-studio-saved"><Check size={13}/> Saved</span>
      {painted && <button className="button" onClick={() => setGenerating(true)}><Dices size={15}/> Generate</button>}
      <button className="icon-button" aria-label="Undo" disabled={!undo.length} onClick={doUndo}><Undo2 size={17}/></button>
      <button className="icon-button" aria-label="Redo" disabled={!redo.length} onClick={doRedo}><Redo2 size={17}/></button>
      <button className="button" aria-pressed={playerView} onClick={() => { setPlayerView(!playerView); setSelected(''); setCell(-1); }}><Eye size={15}/> Player view</button>
      <button className="button" onClick={() => { setPlayerView(false); setUsing(true); }}><MapIcon size={15}/> Use in Maptable</button>
      <button className="button primary" onClick={close}>Done</button>
    </header>
    <div className="world-studio-body">
      <nav className="world-studio-rail" aria-label="Map tools">
        {tools.filter(t => !paintTool(t.id) || painted).map(t => <button key={t.id} aria-pressed={!playerView && tool === t.id} title={`${t.name} (${t.key})`} onClick={() => { setTool(t.id); setPlayerView(false); }}><t.icon size={19}/><span>{t.name}</span></button>)}
      </nav>
      <section className="world-studio-map">
        <MapViewport map={map} editing={tool !== 'select' && !playerView}>
          {playerView ? <MapCanvas map={seen} imageUrl={url} fogMode="player" tints={tints}/> : <div className="zoom-host"><MapCanvas map={map} tints={tints} paint={live ?? undefined} imageUrl={url} selectedPin={selected} show={show} draft={draft} selectedCell={cell} route={plan?.cells}
            brush={brush} fogEditing={tool === 'fog'} onCell={tool === 'fog' ? explore : undefined}
            selectedItem={selected} onItem={tool === 'select' ? select : undefined}
            onPlace={tool === 'zoom' ? (x, y) => frameAt(x, y) : tool === 'place' ? place : tool === 'stamp' ? stamp : tool === 'label' ? addLabel : tool === 'select' ? (x, y) => { setSelected(''); setCell(gridded ? pointCell(map, x, y) : -1); } : undefined} onPin={id => { select(id); if (tool !== 'select') setTool('select'); }}/>
            {(show.frames || tool === 'zoom') && (closer.length > 0 || (tool === 'zoom' && zoomFrame)) && <div className="zoom-frames">
              {closer.map(c => { const f = c.mapData!.zoomOf!; return <div key={c.id} className="zoom-frame" style={frameStyle(f)}><button type="button" onClick={() => openMap(c.id)} title={`Open ${c.title}`}>{c.title}</button></div>; })}
              {tool === 'zoom' && zoomFrame && <div className="zoom-frame is-new" style={frameStyle(zoomFrame)}/>}
            </div>}
          </div>}
        </MapViewport>
        <p className="world-studio-tip">{playerView ? 'What players see. Choose a tool to go back to editing.' : tool === 'terrain' ? 'Drag to paint. [ and ] change the brush size.' : tool === 'shape' ? (shaperReady ? 'Drag to shape the land. [ and ] change the brush size.' : 'Getting the land tools ready…') : tool === 'zoom' ? 'Click a spot to frame it, then make a closer map of it. Click a frame’s name to open a map made before.' : drawing ? `Drag to draw a ${tool}. Name it in the inspector afterwards.` : tool === 'label' ? 'Click the map to write a name, like a sea, a region or a mountain range.' : tool === 'place' ? 'Pick an icon, then click the map to add a place.' : tool === 'stamp' ? 'Pick a landmark, then click the map to stamp it. Select a stamp afterwards to rename it.' : tool === 'fog' ? `Click or drag to ${fogMode === 'reveal' ? 'reveal' : 'hide'} areas for players.` : gridded ? `Click a ${map.grid === 'hex' ? 'hex' : 'square'} to write notes, roll encounters or move the party. Click a place to see its notes.` : 'Select a place to see its notes. Drag to move around when zoomed in.'}</p>
      </section>
      <aside className="world-studio-inspector" aria-label="Inspector">
        {playerView ? <>
          <h3><Eye size={17}/> Player view</h3>
          <p className="aside-hint">This is the map as players see it through the campaign’s player link: only shared places, lines and names, and only where they have explored. Unexplored land is a soft fog.</p>
          <label className="world-field">Who can see this map<select value={map.visibility} onChange={e => setMap({ visibility: e.target.value as MapData['visibility'] })}><option value="gm">GM only</option><option value="players">Players too</option></select></label>
          {map.visibility === 'gm' && <p className="aside-hint">Players don’t see this map yet. Choose Players too to share it.</p>}
          <p className="aside-hint">{map.pins.filter(p => p.visibility === 'players').length} of {map.pins.length} places are shared. {map.fog?.enabled ? `${map.fog.revealed.length} of ${map.columns * map.rows} cells explored.` : 'There is no fog on this map.'}</p>
        </> : <>
        {tool === 'terrain' && painted && <>
          <h3><Paintbrush size={17}/> Terrain brush</h3>
          <div className="world-swatches" role="group" aria-label="Terrain">
            {brushOrder.map(i => { const t = terrains[i]; return <button key={t.id} aria-pressed={terrain === i} onClick={() => setTerrain(i)}><span style={{ background: t.color }}/>{t.name}</button>; })}
          </div>
          <label className="world-field">Brush size <output>{brushMiles ? `${brushMiles} ${map.scale!.unit} across` : `${radius * 2} squares`}</output>
            <input type="range" min={1} max={20} value={radius} onChange={e => setRadius(+e.target.value)}/></label>
          <label className="world-check"><input type="checkbox" checked={landOnly} disabled={isWater(terrain)} onChange={e => setLandOnly(e.target.checked)}/><span>Only paint on land<small>The sea and coastline stay put while you paint forests or hills.</small></span></label>
          <p className="aside-hint">Each map cell holds {k} × {k} paint squares, so coasts, forests and mountains can take any shape. Fog and coordinates still use the map cells.</p>
        </>}
        {tool === 'shape' && painted && <>
          <h3><Mountain size={17}/> Shape land</h3>
          <div className="world-seg world-shape-modes" role="group" aria-label="Shape">{shapeModes.map(m => <button key={m.id} aria-pressed={shapeMode === m.id} onClick={() => setShapeMode(m.id)}>{m.name}</button>)}</div>
          <label className="world-field">Brush size <output>{brushMiles ? `${brushMiles} ${map.scale!.unit} across` : `${radius * 2} squares`}</output>
            <input type="range" min={1} max={20} value={radius} onChange={e => setRadius(+e.target.value)}/></label>
          {shapeMode !== 'land' && shapeMode !== 'sea' && <label className="world-field">Strength <output>{strength}%</output><input type="range" min={10} max={100} value={strength} onChange={e => setStrength(+e.target.value)}/></label>}
          <p className="aside-hint">{shapeMode === 'raise' ? 'Raise lowland into hills, then mountains, then snowy peaks.' : shapeMode === 'lower' ? 'Wear mountains down to hills and lowland; keep going and the sea comes in.' : shapeMode === 'flatten' ? 'Evens the ground out toward the height where you start the stroke.' : planet ? 'New land carries on the terrain it is drawn out from. As on Earth, a big continent is dry in the middle; inland seas and mountain ranges bring rain.' : 'New land carries on the terrain it is drawn out from.'}</p>
          {planet ? <>
            <label className="world-check"><input type="checkbox" checked={follow} onChange={e => setFollow(e.target.checked)}/><span>Climate follows the land<small>Raise a range and the far side turns dry; land drawn near the poles freezes. Terrain you painted yourself stays.</small></span></label>
            <button className="button" disabled={!shaperReady} onClick={redoPlaces}>Redo rivers and towns</button>
            <p className="aside-hint">Rivers run down from the hills you raised, and towns settle on mild coasts and rivers. Places you have written notes for, linked or put on a route stay.</p>
          </> : <p className="aside-hint">Generate a whole planet, or draw one by hand, and its climate follows the land you shape.</p>}
        </>}
        {tool === 'zoom' && painted && <>
          <h3><ZoomIn size={17}/> Zoom in</h3>
          {!mapTools ? <p className="aside-hint">Getting ready…</p> : !size ? <p className="aside-hint">{map.scale ? 'This map is already as close as Zoom in goes. Hex areas are about 120 miles across.' : 'Set the map width in the map settings first, so closer maps know how big they are.'}</p> : <>
            <div className="world-seg" role="group" aria-label="Size of the closer map">{zoomChoices.map(z => <button key={z.id} aria-pressed={size.id === z.id} onClick={() => { setZoomSize(z.id); if (zoomAt) frameAt(zoomAt.x, zoomAt.y, z.id); }}>{z.name}</button>)}</div>
            <p className="aside-hint">{size.id === 'hex' ? 'A hex crawl of 20 by 14 six-mile hexes, ready for travel and encounters.' : `A ${size.name.toLowerCase()} map ${(map.scale?.unit === 'km' ? Math.round(size.miles * 1.609) : size.miles).toLocaleString()} ${map.scale?.unit ?? 'mi'} across.`}</p>
            {zoomPreview ? <>
              <div className="zoom-preview"><MapCanvas map={zoomPreview} thumbnail/></div>
              <label className="world-field">Name<input value={zoomTitle} maxLength={160} onChange={e => setZoomTitle(e.target.value)}/></label>
              <p className="aside-hint">The same seas and biomes, with finer coasts, hills and lakes. Places, rivers, roads and names inside come along; after that, each map keeps its own changes.</p>
              <button className="button primary" disabled={!onNewMap || !zoomTitle.trim()} onClick={makeCloser}>Make {size.id === 'hex' ? 'hex area' : size.name.toLowerCase()} map</button>
            </> : <p className="aside-hint">Click the map to frame a spot.</p>}
          </>}
          {closer.length > 0 && <>
            <h3 className="world-sub">Closer maps</h3>
            <ul className="world-places">{closer.map(c => <li key={c.id}><button onClick={() => openMap(c.id)}>{c.title}<ArrowUpRight size={13} aria-hidden="true"/></button></li>)}</ul>
          </>}
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
        {tool === 'place' && !pin && <><h3><PinIcon size={17}/> Places</h3><IconPicker label="Place icon" groups={settlementGroups} value={placeIcon} onPick={setPlaceIcon} map={map} urls={iconUrls} onUpload={uploadIcon} onRemove={removeIcon}/></>}
        {tool === 'stamp' && <><h3><Stamp size={17}/> Landmark stamps</h3><IconPicker label="Stamp" groups={stampGroups} value={stampIcon} onPick={setStampIcon} map={map} urls={iconUrls} onUpload={uploadIcon} onRemove={removeIcon}/></>}
        {(tool === 'select' || (tool === 'place' && pin) || tool === 'label' || drawing) && <>
          {drawing && !path && <><h3>{tool === 'river' ? <Waves size={17}/> : tool === 'road' ? <Route size={17}/> : <Shield size={17}/>} {tool === 'river' ? 'Rivers' : tool === 'road' ? 'Roads' : 'Borders'}</h3><p className="aside-hint">{tool === 'river' ? 'Draw from the source down to the sea or a lake.' : tool === 'road' ? 'Draw roads between places. Travel routes still measure the distances.' : 'Draw the edge of a realm, a province or a wild region.'} Select a line afterwards to name it, change it, or delete it.</p></>}
          {pin ? <div className="world-pin">
            <span className="world-label">Place</span>
            <h3>{pin.title}</h3>
            <details className="world-pin-icon">
              <summary>{pin.icon ? <IconPreview id={pin.icon} map={map} urls={iconUrls}/> : null}<span>{pin.icon ? 'Change icon' : pin.kind ? `${placeKinds.find(k => k.id === pin.kind)?.name ?? 'Place'} symbol · choose an icon` : 'Numbered pin · choose an icon'}</span></summary>
              <IconPicker label="Icon" groups={[...settlementGroups, ...stampGroups]} value={pin.icon} onPick={id => setPinIcon(pin.id, id)} map={map} urls={iconUrls} onUpload={uploadIcon} onRemove={removeIcon}/>
              {(pin.icon || pin.kind) && <button type="button" className="text-button" onClick={() => setPinIcon(pin.id, undefined)}>Use a numbered pin instead</button>}
            </details>
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
          </div> : cell >= 0 && tool === 'select' ? <HexInspector key={cell} map={map} cell={cell} plan={plan} pace={pace} setPace={setPace} campaign={campaign} library={library} setMap={setMap} onCalendarChange={onCalendarChange} onRevealInParents={onRevealInParents}/>
          : !drawing && <>
            {parent && <div className="zoom-locator">
              <span className="world-label">Part of</span>
              <button type="button" onClick={() => openMap(parent.id)} aria-label={`Open ${parent.title}`}>
                <span className="zoom-host"><MapCanvas map={parent.mapData!} thumbnail/>{map.zoomOf && <span className="zoom-frames"><span className="zoom-frame is-here" style={frameStyle(map.zoomOf)}/></span>}</span>
                <span>{parent.title} <ArrowUpRight size={13} aria-hidden="true"/></span>
              </button>
            </div>}
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
            <h3 className="world-sub">Style</h3>
            <div className="world-looks" role="group" aria-label="Look">{(Object.keys(mapLooks) as MapLookId[]).map(id => { const l = mapLooks[id]; return <button key={id} aria-pressed={(map.mapStyle?.look ?? 'painted') === id} onClick={() => setStyle({ look: id })}><span className="world-look-swatch">{[l.sea, l.layers.land ?? terrains[1].color, l.layers.forest ?? terrains[2].color, l.ink].map((c, i) => <i key={i} style={{ background: c }}/>)}</span><strong>{l.name}</strong><small>{l.hint}</small></button>; })}</div>
            <div className="world-field">Place names<div className="world-seg" role="group" aria-label="Place name font">{(Object.keys(nameFonts) as (keyof typeof nameFonts)[]).map(f => <button key={f} aria-pressed={(map.mapStyle?.font ?? 'serif') === f} style={{ fontFamily: nameFonts[f].family }} onClick={() => setStyle({ font: f })}>{nameFonts[f].name}</button>)}</div></div>
            <div className="world-field">Name size<div className="world-seg" role="group" aria-label="Name size">{(['small', 'medium', 'large'] as const).map(z => <button key={z} aria-pressed={(map.mapStyle?.nameSize ?? 'medium') === z} onClick={() => setStyle({ nameSize: z })}>{z === 'small' ? 'Small' : z === 'medium' ? 'Medium' : 'Large'}</button>)}</div></div>
            <label className="world-check"><input type="checkbox" checked={!!map.mapStyle?.legend} onChange={e => setStyle({ legend: e.target.checked })}/><span>Legend<small>Built from the terrains, kinds of place and lines the map uses.</small></span></label>
            <label className="world-check"><input type="checkbox" checked={map.mapStyle?.title !== undefined} onChange={e => setStyle({ title: e.target.checked ? entry.title.slice(0, 100) : undefined })}/><span>Title on the map</span></label>
            {map.mapStyle?.title !== undefined && <label className="world-field">Title<input value={map.mapStyle.title} maxLength={100} onChange={e => setStyle({ title: e.target.value })}/></label>}
          </>}
          {cell < 0 && <>
          <h3 className="world-sub">Show</h3>
          {painted && <label className="world-check"><input type="checkbox" checked={show.art} onChange={e => setShow({ ...show, art: e.target.checked })}/><span>Mountains, hills and trees</span></label>}
          <label className="world-check"><input type="checkbox" checked={show.pins} onChange={e => setShow({ ...show, pins: e.target.checked })}/><span>Places <small>{map.pins.length} of 100</small></span></label>
          <label className="world-check"><input type="checkbox" checked={show.paths} onChange={e => setShow({ ...show, paths: e.target.checked })}/><span>Rivers, roads and borders</span></label>
          <label className="world-check"><input type="checkbox" checked={show.labels} onChange={e => setShow({ ...show, labels: e.target.checked })}/><span>Names on the map</span></label>
          <label className="world-check"><input type="checkbox" checked={show.routes} onChange={e => setShow({ ...show, routes: e.target.checked })}/><span>Travel routes</span></label>
          {closer.length > 0 && <label className="world-check"><input type="checkbox" checked={show.frames} onChange={e => setShow({ ...show, frames: e.target.checked })}/><span>Closer maps <small>{closer.length} made from this map</small></span></label>}
          <h3 className="world-sub">Places</h3>
          {map.pins.length ? <ul className="world-places">{map.pins.map((p, i) => <li key={p.id}><button aria-pressed={selected === p.id} onClick={() => select(selected === p.id ? '' : p.id)}><span>{i + 1}</span>{p.title}{(p.visibility === 'gm' || !pointRevealed(map, p.x, p.y)) && <EyeOff size={13} aria-label="Hidden from players"/>}</button></li>)}</ul>
            : <p className="aside-hint">Choose Place, then click the map.</p>}
          </>}
        </>}
        </>}
      </aside>
    </div>
    {(tool === 'shape' || tool === 'zoom') && !mapTools && <MapToolsLoader onReady={setMapTools}/>}
    {using && <WorldUseDialog entry={entry} map={map} data={data} imageUrl={url} setMap={setMap} onClose={() => setUsing(false)}/>}
    {generating && <WorldGenerateDialog map={map} onClose={() => setGenerating(false)} onUse={(patch, hand) => { setUndo(u => [...u.slice(-29), snapshot()]); setRedo([]); setMap(patch); setGenerating(false); setTool(hand ? 'shape' : 'terrain'); if (hand) { setShapeMode('land'); setRadius(6); } }}/>}
    {editingPin && <PinDialog key={editingPin.id} pin={editingPin} campaign={campaign} entries={visibleEntries(data, entry.worldId, entry.campaignId).filter(e => e.id !== entry.id)}
      onClose={() => setEditingPin(null)}
      onSave={p => { if (!map.pins.some(v => v.id === p.id) && map.pins.length >= 100) return; edit({ pins: map.pins.some(v => v.id === p.id) ? map.pins.map(v => v.id === p.id ? p : v) : [...map.pins, p] }); select(p.id); setEditingPin(null); setTool('select'); }}/>}
  </dialog>;
}
