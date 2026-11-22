'use client';
/*
 * The Admin CP's Banner tab: the campaign's banner picture, the same one the Wiki's front page and Look set
 * (campaign.look.banner). It saves at once through the forum's `banner` action (lib/forum/request.ts), so it works from
 * the forum, the Wiki, Maptable or the dashboard, and the page beside it reads the look again (`bannerChanged`).
 */
import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { stageTransfer } from '@/lib/transfer-client';
import { toWebp } from '@/lib/webp-upload';
import type { Look } from '@/lib/encyclopedia/look';
import { usePictureSrc } from '../encyclopedia/character-picture';
import { bannerChanged } from '../campaign-theme-entry';
import { forumCall } from './forum-api';
import { BannerFramer } from '../banner-frame';

type Banner = NonNullable<Look['banner']>;
const TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export function BannerTab({ k, banner, setBanner, owner, onSaved }: { k: string; banner: Banner | null; setBanner: (b: Banner | null) => void; owner: boolean; onSaved: () => void }) {
  const file = useRef<HTMLInputElement>(null), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const { src } = usePictureSrc(banner?.imageId);
  async function send(body: Record<string, unknown>, doing: string) {
    setBusy(doing); setError('');
    try { const out = await forumCall<{ banner: Banner | null }>({ action: 'banner', campaign: k, ...body }); setBanner(out.banner); bannerChanged(); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : 'The banner could not be saved.'); }
    finally { setBusy(''); }
  }
  async function upload(f: File) {
    if (!TYPES.includes(f.type)) { setError('Choose a PNG, JPEG or WebP picture.'); return; }
    if (f.size > (f.type === 'image/webp' ? 1 : 4) * 8 * 1024 * 1024) { setError('Choose a picture up to 8 MB.'); return; }
    setBusy('Uploading…'); setError('');
    let size: { width: number; height: number };
    try { const bitmap = await createImageBitmap(f); size = { width: bitmap.width, height: bitmap.height }; bitmap.close(); }
    catch { setBusy(''); setError('That file could not be opened as a picture.'); return; }
    try {
      const upload = await toWebp(f);
      if (upload.size > 8 * 1024 * 1024) throw new Error('Choose a picture up to 8 MB.');
      const transferId = await stageTransfer(upload, 'image'); await send({ picture: { transferId, ...size }, y: .5 }, 'Uploading…'); }
    catch (e) { setBusy(''); setError(e instanceof Error ? e.message : 'The picture could not be uploaded.'); }
  }
  if (!owner) return <div className="cp-section"><h3>Banner picture</h3><p className="muted small">Only the GM can change the campaign’s banner picture.</p></div>;
  return <div className="cp-section cp-banner">
    <h3>Banner picture</h3>
    <p className="muted small">One picture for the whole campaign: across the top of the Wiki’s front page, the dashboard and the player site, and behind the forum’s title when Forum settings uses it.</p>
    {banner ? <>
      <BannerFramer banner={banner} src={src} aspect={4} busy={busy === 'Saving…'} buttons={{ save: 'f-btn small', plain: 'f-btn ghost small' }}
        onSave={b => void send({ y: b.y, x: b.x ?? .5, zoom: b.zoom ?? 1 }, 'Saving…')} />
      <p className="muted small">Drag the picture to choose what stays in view, and zoom in to show less of it. Each page crops it to its own strip, keeping that part in view.</p>
      <div className="cp-banner-actions">
        <button className="f-btn ghost small" disabled={!!busy} onClick={() => file.current?.click()}><ImagePlus size={14} aria-hidden="true" /> Replace</button>
        <button className="f-btn ghost small danger" disabled={!!busy} onClick={() => void send({ remove: true }, 'Removing…')}><Trash2 size={14} aria-hidden="true" /> Remove</button>
        {busy && <span className="muted small" role="status">{busy}</span>}
      </div>
    </> : <button type="button" className="cp-banner-empty" disabled={!!busy} onClick={() => file.current?.click()}>
      <ImagePlus size={20} aria-hidden="true" />
      <span><b>{busy || 'Upload a banner'}</b><small>A wide picture, at least 1600 pixels across. PNG, JPEG or WebP up to 8 MB.</small></span>
    </button>}
    <input ref={file} type="file" accept={TYPES.join(',')} hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }} />
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
