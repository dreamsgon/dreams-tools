'use client';
import { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { iconMarkup, mapIcons, type MapIconGroup } from '@/lib/encyclopedia/map-icons';
import type { MapData } from '@/lib/encyclopedia/map-model';

/** One icon as a small picture: a built-in drawing, or an uploaded picture. */
export function IconPreview({ id, map, urls }: { id: string; map?: Pick<MapData, 'icons'>; urls?: Record<string, string> }) {
  const upload = map?.icons?.find(i => i.id === id);
  if (upload) return urls?.[id] ? <img className="icon-preview" src={urls[id]} alt=""/> : <span className="icon-preview"/>;
  return <svg className="icon-preview" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#2f2b24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: iconMarkup(id, '#fffdf6') }}/>;
}

/**
 * Icons to pick from, in groups, then the icons uploaded to this map.
 * Uploads are PNG, JPEG or WebP pictures up to 1 MB, kept with the map.
 */
export function IconPicker({ groups, value, onPick, map, urls, onUpload, onRemove, label }: {
  groups: MapIconGroup[]; value?: string; onPick: (id: string) => void; map: Pick<MapData, 'icons'>; urls?: Record<string, string>;
  onUpload?: (file: File) => Promise<void>; onRemove?: (id: string) => void; label: string;
}) {
  const file = useRef<HTMLInputElement>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pick = async (f: File | undefined) => {
    if (!f || !onUpload) return;
    setBusy(true); setError('');
    try { await onUpload(f); } catch (e) { setError(e instanceof Error ? e.message : 'The icon could not be uploaded.'); } finally { setBusy(false); if (file.current) file.current.value = ''; }
  };
  return <div className="icon-picker" role="group" aria-label={label}>
    {groups.map(g => <div key={g} className="icon-group">
      <span className="world-label">{g}</span>
      <div className="icon-grid">{mapIcons.filter(i => i.group === g).map(i => <button key={i.id} type="button" title={i.name} aria-label={i.name} aria-pressed={value === i.id} onClick={() => onPick(i.id)}><IconPreview id={i.id}/></button>)}</div>
    </div>)}
    {onUpload && <div className="icon-group">
      <span className="world-label">Your icons</span>
      <div className="icon-grid">
        {(map.icons ?? []).map(i => <span key={i.id} className="icon-upload">
          <button type="button" title={i.name} aria-label={i.name} aria-pressed={value === i.id} onClick={() => onPick(i.id)}><IconPreview id={i.id} map={map} urls={urls}/></button>
          {onRemove && <button type="button" className="icon-remove" aria-label={`Remove ${i.name}`} onClick={() => onRemove(i.id)}><X size={11}/></button>}
        </span>)}
        <button type="button" className="icon-add" title="Upload an icon" aria-label="Upload an icon" disabled={busy || (map.icons?.length ?? 0) >= 40} onClick={() => file.current?.click()}><Upload size={15}/></button>
      </div>
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => void pick(e.target.files?.[0])}/>
      <small className="icon-hint">{busy ? 'Uploading…' : error || 'PNG, JPEG or WebP, up to 1 MB. Square pictures with a clear background look best.'}</small>
    </div>}
  </div>;
}
