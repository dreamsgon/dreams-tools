"use client";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { centredCrop, clampCrop, cropSource, zoomCrop, type Crop } from "@/lib/avatar-crop";

/** The frame on screen, in CSS pixels. The saved picture is OUT px square. */
const FRAME = 260, OUT = 256, MAX_ZOOM = 5;

/**
 * Fit a new profile picture into its round frame: drag to move it, zoom with the slider, the wheel or a pinch,
 * or the arrow keys and +/-. Saves the square inside the frame at 256 px (WebP where the browser can, else JPEG).
 */
export default function AvatarCrop({ file, onCancel, onSave }: { file: File; onCancel: () => void; onSave: (blob: Blob) => Promise<void> }) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null), [url, setUrl] = useState(""), [error, setError] = useState("");
  const [crop, setCrop] = useState<Crop>({ zoom: 1, x: 0, y: 0 }), [busy, setBusy] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null), pointers = useRef(new Map<number, { x: number; y: number }>()), pinch = useRef<number | null>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true, made: ImageBitmap | null = null;
    const link = URL.createObjectURL(file);
    setUrl(link); // eslint-disable-line react-hooks/set-state-in-effect -- the preview's address lives as long as the file
    createImageBitmap(file).then(b => { made = b; if (live) { setBitmap(b); setCrop(centredCrop(b.width, b.height, FRAME)); } else b.close(); })
      .catch(() => { if (live) setError("That file could not be read as a picture."); });
    return () => { live = false; URL.revokeObjectURL(link); made?.close(); };
  }, [file]);
  useEffect(() => { dialog.current?.querySelector<HTMLElement>(".avatar-crop-frame")?.focus(); }, [bitmap]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const w = bitmap?.width ?? 1, h = bitmap?.height ?? 1;
  const set = (next: Crop) => setCrop(clampCrop(next, w, h, FRAME));
  const zoomTo = (zoom: number, at?: { x: number; y: number }) => setCrop(zoomCrop(crop, Math.min(MAX_ZOOM, Math.max(1, zoom)), w, h, FRAME, at));

  const local = (e: { clientX: number; clientY: number; currentTarget: HTMLElement }) => { const r = e.currentTarget.getBoundingClientRect(); return { x: (e.clientX - r.left) * FRAME / r.width, y: (e.clientY - r.top) * FRAME / r.height }; };
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    else { drag.current = null; const [a, b] = [...pointers.current.values()]; pinch.current = Math.hypot(a.x - b.x, a.y - b.y); }
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = e.currentTarget.getBoundingClientRect(), k = FRAME / r.width;
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current > 0) zoomTo(crop.zoom * d / pinch.current, { x: ((a.x + b.x) / 2 - r.left) * k, y: ((a.y + b.y) / 2 - r.top) * k });
      pinch.current = d;
    } else if (drag.current?.id === e.pointerId) {
      set({ ...crop, x: crop.x + (e.clientX - drag.current.x) * k, y: crop.y + (e.clientY - drag.current.y) * k });
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => { pointers.current.delete(e.pointerId); if (pointers.current.size < 2) pinch.current = null; if (drag.current?.id === e.pointerId) drag.current = null; };
  const key = (e: ReactKeyboardEvent) => {
    const step = e.shiftKey ? 30 : 8;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) { e.preventDefault(); set({ ...crop, x: crop.x + moves[e.key][0], y: crop.y + moves[e.key][1] }); }
    else if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomTo(crop.zoom + .2); }
    else if (e.key === "-") { e.preventDefault(); zoomTo(crop.zoom - .2); }
  };

  async function save() {
    if (!bitmap) return;
    setBusy(true); setError("");
    try {
      const src = cropSource(crop, w, h, FRAME), size = Math.min(OUT, Math.round(src.side)) || OUT;
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = Math.max(32, size);
      const g = canvas.getContext("2d")!; g.imageSmoothingQuality = "high";
      g.drawImage(bitmap, src.x, src.y, src.side, src.side, 0, 0, canvas.width, canvas.height);
      const encode = (type: string, q: number) => new Promise<Blob | null>(done => canvas.toBlob(done, type, q));
      let blob = await encode("image/webp", .86); if (!blob || blob.type !== "image/webp") blob = await encode("image/jpeg", .88);
      if (!blob) throw Error("That picture could not be resized.");
      await onSave(blob);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  const scale = FRAME / Math.min(w, h) * crop.zoom;
  return <div className="avatar-crop-backdrop" onPointerDown={e => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
    <div className="avatar-crop" role="dialog" aria-modal="true" aria-labelledby="avatar-crop-h" ref={dialog}>
      <h2 id="avatar-crop-h">Fit your picture</h2>
      <p className="avatar-crop-hint">Drag to move it. Zoom to fill the circle. What&apos;s inside the circle is what people see.</p>
      <div className="avatar-crop-frame" tabIndex={0} role="application" aria-label="Picture position. Arrow keys move it, plus and minus zoom." aria-describedby="avatar-crop-h"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onWheel={e => { if (!bitmap) return; zoomTo(crop.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), local(e)); }} onKeyDown={key}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file */}
        {bitmap && url && <img src={url} alt="" draggable={false} style={{ width: w * scale, height: h * scale, transform: `translate(${crop.x}px, ${crop.y}px)` }} />}
        {!bitmap && !error && <span className="avatar-crop-wait">Opening…</span>}
        <span className="avatar-crop-ring" aria-hidden="true" />
      </div>
      <div className="avatar-crop-zoom">
        <button type="button" aria-label="Zoom out" disabled={!bitmap || crop.zoom <= 1} onClick={() => zoomTo(crop.zoom - .25)}><Minus size={15} aria-hidden="true" /></button>
        <input type="range" aria-label="Zoom" min={1} max={MAX_ZOOM} step={.01} value={crop.zoom} disabled={!bitmap} onChange={e => zoomTo(Number(e.target.value))} />
        <button type="button" aria-label="Zoom in" disabled={!bitmap || crop.zoom >= MAX_ZOOM} onClick={() => zoomTo(crop.zoom + .25)}><Plus size={15} aria-hidden="true" /></button>
        <button type="button" aria-label="Reset" title="Reset" disabled={!bitmap} onClick={() => setCrop(centredCrop(w, h, FRAME))}><RotateCcw size={15} aria-hidden="true" /></button>
      </div>
      {error && <p className="account-status account-status-error" role="alert">{error}</p>}
      <div className="account-row-end">
        <button type="button" className="account-ghost" disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="button" className="account-primary" disabled={busy || !bitmap} onClick={() => void save()}>{busy ? "Saving…" : "Save picture"}</button>
      </div>
    </div>
  </div>;
}
