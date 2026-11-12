'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Download, Map as MapIcon } from 'lucide-react';
import type { MapData } from '@/lib/encyclopedia/map-model';
import type { Entry, Workspace } from '@/lib/encyclopedia/world-model';
import { sceneForMap, tableImageSize, tablePicture } from '@/lib/encyclopedia/map-to-maptable';
import { cellDistance } from '@/lib/encyclopedia/hex-crawl';
import { uid, type Asset, type Workspace as TableWorkspace } from '@/lib/model';
import { api, canvasBlob, download, uploadAsset } from '@/lib/api';
import { ToolDialog } from './character-tools';
import { MapCanvas } from './map-canvas';
import { maptableHref } from './article-body';

const fileName = (s: string) => (s.replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'map') + '.png';
const loaded = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('The map picture could not be drawn.'));
  img.src = src;
});

/** Draw the map's SVG (and its uploaded image, if it has one) onto a canvas at table size. */
async function renderMap(svg: SVGSVGElement, map: MapData, imageUrl: string | undefined): Promise<Blob> {
  const { width, height } = tableImageSize(map);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the map picture.');
  if (map.source === 'image') {
    if (!imageUrl) throw new Error('The map image is still loading. Try again in a moment.');
    ctx.drawImage(await loaded(imageUrl), 0, 0, width, height);
  }
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width)); clone.setAttribute('height', String(height));
  clone.removeAttribute('style');
  // Images inside an SVG drawn as a picture don't load, so the uploaded image is drawn first, above.
  clone.querySelectorAll('image').forEach(i => i.remove());
  if (map.source === 'image') clone.querySelector('rect')?.remove();
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  try { ctx.drawImage(await loaded(url), 0, 0, width, height); } finally { URL.revokeObjectURL(url); }
  return canvasBlob(canvas);
}

/** Use in Maptable: put a world or area map on the table, with places as markers, or update the scene made before. */
export function WorldUseDialog({ entry, map, data, imageUrl, setMap, onClose }: {
  entry: Entry; map: MapData; data: Workspace; imageUrl?: string; setMap: (patch: Partial<MapData>) => void; onClose: () => void;
}) {
  const [table, setTable] = useState<{ workspace: TableWorkspace | null; revision: string | null } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [markers, setMarkers] = useState(true), [fog, setFog] = useState(!!map.fog?.enabled), [grid, setGrid] = useState(map.grid !== 'none');
  const [destination, setDestination] = useState(''), [busy, setBusy] = useState(''), [error, setError] = useState(''), [done, setDone] = useState<string | null>(null);
  const picture = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    api<{ workspace: TableWorkspace | null; revision: string | null }>('/api/workspace').then(t => { if (live) setTable(t); }).catch(e => { if (live) setLoadError(e instanceof Error ? e.message : 'Maptable could not be reached.'); });
    return () => { live = false; };
  }, []);
  const existing = table?.workspace?.scenes.find(s => s.id === map.maptableSceneId);
  const campaigns = table?.workspace?.collections.filter(c => c.kind === 'campaign') ?? [];
  const areaScenes = Object.fromEntries(data.entries.filter(e => e.mapData?.maptableSceneId && table?.workspace?.scenes.some(s => s.id === e.mapData!.maptableSceneId)).map(e => [e.id, e.mapData!.maptableSceneId!]));
  const linked = map.pins.filter(p => p.areaMapId && areaScenes[p.areaMapId]).length;
  const size = tableImageSize(map), each = cellDistance(map);
  const svg = () => { const s = picture.current?.querySelector('svg'); if (!s) throw new Error('The map picture is not ready yet.'); return s; };
  const run = async (label: string, job: () => Promise<void>) => {
    setBusy(label); setError('');
    try { await job(); } catch (e) { setError(e instanceof Error ? e.message : 'That did not work. Try again.'); } finally { setBusy(''); }
  };
  const use = () => run('use', async () => {
    if (!table?.workspace) throw new Error('Open Maptable once to set it up, then try again.');
    const blob = await renderMap(svg(), map, imageUrl);
    const { src } = await uploadAsset(blob, fileName(entry.title));
    const asset: Asset = { id: uid(), kind: 'image', name: entry.title.slice(0, 120), src, width: size.width, height: size.height };
    const scene = sceneForMap(map, entry.title, asset, { markers, fog, grid }, areaScenes, existing, existing ? existing.containerId : destination || campaigns[0]?.id || null);
    const assets = [...table.workspace.assets, asset];
    const saved = await api<{ revision: string }>('/api/workspace', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: table.revision, patch: { assets, scenes: { upsert: [scene], remove: [] } } }) });
    // Keep our copy current so a second Use updates this scene instead of clashing with our own save.
    setTable({ revision: saved.revision, workspace: { ...table.workspace, assets, scenes: existing ? table.workspace.scenes.map(s => s.id === scene.id ? scene : s) : [...table.workspace.scenes, scene] } });
    setMap({ maptableSceneId: scene.id });
    setDone(scene.id);
  });

  return <ToolDialog title="Use in Maptable" wide onClose={onClose}>
    <div className="world-use">
      <div className="world-use-preview" ref={picture}><MapCanvas map={tablePicture(map)} imageUrl={imageUrl}/></div>
      <div className="world-use-options">
        <p className="world-use-size"><strong>{entry.title}</strong><span>{size.width.toLocaleString()} × {size.height.toLocaleString()} px{map.scale ? ` · ${map.scale.width.toLocaleString()} ${map.scale.unit} across` : ''}</span></p>
        {loadError ? <p className="form-error" role="alert">{loadError}</p> : !table ? <p className="aside-hint">Looking for your Maptable scenes…</p>
          : !table.workspace ? <p className="aside-hint">Open Maptable once to set it up, then come back to put this map on the table.</p>
          : existing ? <p className="aside-hint">Updates the scene “{existing.name}” with the map as it is now. Its tokens, drawings and other markers stay as they are.</p>
          : campaigns.length > 1 && <label className="world-field">Put the scene in<select value={destination || campaigns[0].id} onChange={e => setDestination(e.target.value)}>{campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        <label className="world-check"><input type="checkbox" checked={markers} onChange={e => setMarkers(e.target.checked)}/><span>Places become markers<small>{map.pins.length} place{map.pins.length === 1 ? '' : 's'}; GM-only places stay hidden on the table.{linked ? ` Double-clicking ${linked === 1 ? 'the place' : `the ${linked} places`} with an area map on the table opens that scene.` : ' Put a place’s area map on the table first, and double-clicking the place opens it.'}</small></span></label>
        <label className="world-check"><input type="checkbox" checked={fog} disabled={!map.fog?.enabled} onChange={e => setFog(e.target.checked)}/><span>Copy the fog<small>{map.fog?.enabled ? `The table starts with the ${map.fog.revealed.length} explored cell${map.fog.revealed.length === 1 ? '' : 's'} revealed.${existing ? ' This replaces the fog on the table.' : ''}` : 'This map has no fog.'}</small></span></label>
        <label className="world-check"><input type="checkbox" checked={grid} disabled={map.grid === 'none'} onChange={e => setGrid(e.target.checked)}/><span>{map.grid === 'square' ? 'Square' : 'Hex'} grid on the table<small>{map.grid === 'none' ? 'This map has no grid.' : `Lined up with the map${each ? `, ${Math.round(each * 10) / 10} ${map.scale!.unit} each` : ''}.`}</small></span></label>
        <p className="aside-hint">The picture leaves out GM-only lines and names. Use in Maptable again after you change the map to update the scene.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        {done && <p className="info-note" role="status">The map is on the table. <a href={maptableHref(done)} target="_blank" rel="noreferrer">Open in Maptable <ArrowUpRight size={13}/></a></p>}
        <div className="button-row world-generate-actions">
          <button type="button" className="button" disabled={!!busy} onClick={() => run('png', async () => download(await renderMap(svg(), map, imageUrl), fileName(entry.title)))}><Download size={15}/> {busy === 'png' ? 'Exporting…' : 'Export image'}</button>
          <button type="button" className="button primary" disabled={!!busy || !table?.workspace} onClick={use}><MapIcon size={15}/> {busy === 'use' ? 'Putting it on the table…' : existing ? 'Update the scene' : 'Use in Maptable'}</button>
        </div>
      </div>
    </div>
  </ToolDialog>;
}
