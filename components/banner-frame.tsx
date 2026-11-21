"use client";
/*
 * Framing a banner picture: drag it to choose what stays in view, and zoom in or out. `useBannerDrag` makes any box
 * draggable (the Wiki's hero itself, in Reposition); `BannerFramer` is a preview box with the zoom and Save, for the
 * Admin CP, Look and a page's banner. The numbers are in lib/banner-frame.ts.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { Minus, Move, Plus, RotateCcw } from "lucide-react";
import "./banner-frame.css";
import { BANNER_ZOOM_MAX, bannerBackground, bannerMoved, bannerZoomed, cleanFraming, type BannerFraming } from "@/lib/banner-frame";

type Size = { width: number; height: number };

/** An element's size, kept up to date: pass `ref` to the element. */
export function useBoxSize<T extends HTMLElement = HTMLElement>(): [(el: T | null) => void, Size | null] {
  const [size, setSize] = useState<Size | null>(null), observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect(); observer.current = null;
    if (!el) return;
    const measure = () => { const r = el.getBoundingClientRect(); setSize(s => s && Math.abs(s.width - r.width) < .5 && Math.abs(s.height - r.height) < .5 ? s : { width: r.width, height: r.height }); };
    measure();
    if (typeof ResizeObserver !== "undefined") { observer.current = new ResizeObserver(measure); observer.current.observe(el); }
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
  return [ref, size];
}

/** The background style for a banner picture in a box of this size (`url` is the picture's address). */
export function bannerStyle(b: BannerFraming, url: string | undefined, box: Size | null): CSSProperties {
  const bg = bannerBackground(b, box);
  return { backgroundImage: url ? `url("${url}")` : undefined, backgroundPosition: bg.position, backgroundSize: bg.size, backgroundRepeat: "no-repeat" };
}

/**
 * Pointer and keyboard handlers that move the picture in a box: drag it, or use the arrow keys (Shift for bigger
 * steps) and + or − to zoom. `onChange` gets each new framing as it moves.
 */
export function useBannerDrag<B extends BannerFraming>(banner: B | null, box: Size | null, onChange: (b: B) => void) {
  const start = useRef<{ id: number; x: number; y: number; from: B } | null>(null);
  const [dragging, setDragging] = useState(false);
  if (!banner || !box) return { dragging: false, handlers: {} };
  return {
    dragging,
    handlers: {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest("button, input, a, select, textarea, label")) return;
        e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: banner }; setDragging(true);
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        const s = start.current;
        if (!s || s.id !== e.pointerId) return;
        onChange(bannerMoved(s.from, box, e.clientX - s.x, e.clientY - s.y));
      },
      onPointerUp: (e: PointerEvent<HTMLElement>) => { if (start.current?.id === e.pointerId) { start.current = null; setDragging(false); } },
      onPointerCancel: () => { start.current = null; setDragging(false); },
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        if (e.target !== e.currentTarget) return;
        const step = e.shiftKey ? 40 : 10;
        const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
        if (moves[e.key]) { e.preventDefault(); onChange(bannerMoved(banner, box, ...moves[e.key]!)); }
        else if (e.key === "+" || e.key === "=") { e.preventDefault(); onChange(bannerZoomed(banner, (banner.zoom ?? 1) + .1)); }
        else if (e.key === "-" || e.key === "_") { e.preventDefault(); onChange(bannerZoomed(banner, (banner.zoom ?? 1) - .1)); }
      },
    },
  };
}

/** Zoom out, a slider, zoom in. */
export function BannerZoom<B extends BannerFraming>({ banner, onChange, className = "" }: { banner: B; onChange: (b: B) => void; className?: string }) {
  const zoom = banner.zoom ?? 1;
  return <div className={`banner-zoom ${className}`}>
    <button type="button" aria-label="Zoom out" title="Zoom out" disabled={zoom <= 1} onClick={() => onChange(bannerZoomed(banner, zoom - .25))}><Minus size={15} aria-hidden="true" /></button>
    <input type="range" aria-label="Zoom" min={1} max={BANNER_ZOOM_MAX} step={.05} value={zoom} onChange={e => onChange(bannerZoomed(banner, Number(e.target.value)))} />
    <button type="button" aria-label="Zoom in" title="Zoom in" disabled={zoom >= BANNER_ZOOM_MAX} onClick={() => onChange(bannerZoomed(banner, zoom + .25))}><Plus size={15} aria-hidden="true" /></button>
    <output aria-live="off">{Math.round(zoom * 100)}%</output>
  </div>;
}

const same = (a: BannerFraming, b: BannerFraming) => JSON.stringify(cleanFraming(a)) === JSON.stringify(cleanFraming(b));
const centred = <B extends BannerFraming>(b: B): B => cleanFraming({ ...b, x: .5, y: .5, zoom: 1 });

/**
 * A preview of the banner to frame it: drag the picture, zoom it, then Save position (or Undo changes). `aspect` is the
 * preview's width over its height, roughly the shape the banner is shown in.
 */
export function BannerFramer<B extends BannerFraming>({ banner, src, aspect = 4, busy = false, onSave, className = "", buttons = { save: "button small primary", plain: "button small" } }: {
  banner: B; src: string | undefined; aspect?: number; busy?: boolean; onSave: (b: B) => void; className?: string;
  /** The page's own button classes (the forum's differ from the Wiki's). */
  buttons?: { save: string; plain: string };
}) {
  const [draft, setDraft] = useState(banner), [seen, setSeen] = useState(banner);
  // A new picture, or a save from elsewhere, starts the draft again.
  if (seen !== banner) { setSeen(banner); setDraft(banner); }
  const [ref, box] = useBoxSize<HTMLDivElement>();
  const { dragging, handlers } = useBannerDrag(draft, box, setDraft);
  const changed = !same(draft, banner);
  return <div className={`banner-framer ${className}`}>
    <div ref={ref} className={`banner-framer-box${dragging ? " is-dragging" : ""}`} style={{ aspectRatio: String(aspect), ...bannerStyle(draft, src, box) }}
      tabIndex={0} role="application" aria-label="Banner picture: drag to move it, or use the arrow keys; + and − zoom" {...handlers}>
      {!dragging && !changed && <span className="banner-framer-hint" aria-hidden="true"><Move size={14} /> Drag to move</span>}
    </div>
    <div className="banner-framer-row">
      <BannerZoom banner={draft} onChange={setDraft} />
      <button type="button" className="banner-framer-reset" title="Centre the picture with no zoom" disabled={same(draft, centred(draft))} onClick={() => setDraft(centred(draft))}><RotateCcw size={13} aria-hidden="true" /> Reset</button>
    </div>
    {changed && <div className="banner-framer-save">
      <button type="button" className={buttons.save} disabled={busy} onClick={() => onSave(cleanFraming(draft))}>{busy ? "Saving…" : "Save position"}</button>
      <button type="button" className={buttons.plain} disabled={busy} onClick={() => setDraft(banner)}>Undo changes</button>
    </div>}
  </div>;
}
