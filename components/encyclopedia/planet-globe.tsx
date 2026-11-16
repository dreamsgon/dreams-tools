'use client';
import { useEffect, useRef } from 'react';

/** A planet's flat map wrapped onto a lit globe. Drag (or use the arrow keys) to turn it; it spins slowly unless motion is reduced. */
export function PlanetGlobe({ pixels, width, height, locked, label }: { pixels: Uint8ClampedArray; width: number; height: number; locked: boolean; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef({ yaw: 0.4, pitch: 0.32, spinning: true, drag: null as null | { x: number; y: number; yaw: number; pitch: number } });
  useEffect(() => {
    const cv = canvas.current, g = cv?.getContext('2d');
    if (!cv || !g) return;
    const N = cv.width, img = g.createImageData(N, N), d = img.data, R = N / 2 - 8;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    const draw = () => {
      const { yaw, pitch } = view.current, cp = Math.cos(pitch), sp = Math.sin(pitch);
      for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
        const dx = (px + 0.5 - N / 2) / R, dy = (py + 0.5 - N / 2) / R, r2 = dx * dx + dy * dy, o = (py * N + px) * 4;
        if (r2 > 1) { // a soft halo of air around the edge
          const a = r2 < 1.1 ? (1.1 - r2) / 0.1 : 0;
          d[o] = 150; d[o + 1] = 200; d[o + 2] = 235; d[o + 3] = 120 * a * a;
          continue;
        }
        const Z = Math.sqrt(1 - r2), X = dx, Y = -dy, Y2 = Y * cp - Z * sp, Z2 = Y * sp + Z * cp;
        const lat = Math.asin(Math.max(-1, Math.min(1, Y2))), lon = Math.atan2(X, Z2) + yaw;
        let u = ((lon / Math.PI + 1) / 2) % 1; if (u < 0) u += 1;
        // Blend the four nearest map squares so the globe looks smooth rather than blocky.
        const fx = u * width - 0.5, fy = Math.max(0, Math.min(height - 1.001, (0.5 - lat / Math.PI) * height - 0.5));
        const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0, xa = (x0 + width) % width, xb = (x0 + 1) % width;
        const a = (y0 * width + xa) * 4, b = (y0 * width + xb) * 4, c = ((y0 + 1) * width + xa) * 4, e = ((y0 + 1) * width + xb) * 4;
        const at = (k: number) => (pixels[a + k] * (1 - ax) + pixels[b + k] * ax) * (1 - ay) + (pixels[c + k] * (1 - ax) + pixels[e + k] * ax) * ay;
        // A locked world is lit from its sun; one that spins is lit from the upper left.
        let k: number;
        if (locked) { const l = ((lon + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; k = 0.25 + 0.85 * Math.max(0, Math.cos(lat) * Math.cos(l)) ** 0.7; }
        else k = 0.3 + 0.8 * Math.max(0, X * -0.55 + Y * 0.38 + Z * 0.74);
        const rim = (1 - Z) ** 3 * 0.55;
        d[o] = at(0) * k * (1 - rim) + 160 * rim; d[o + 1] = at(1) * k * (1 - rim) + 205 * rim; d[o + 2] = at(2) * k * (1 - rim) + 240 * rim; d[o + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    };
    const step = () => { if (!view.current.spinning || reduced) return; view.current.yaw += 0.006; draw(); frame = requestAnimationFrame(step); };
    draw();
    frame = requestAnimationFrame(step);
    const turn = (yaw: number, pitch: number) => { view.current.yaw = yaw; view.current.pitch = Math.max(-1.2, Math.min(1.2, pitch)); draw(); };
    const down = (e: PointerEvent) => { const v = view.current; v.drag = { x: e.clientX, y: e.clientY, yaw: v.yaw, pitch: v.pitch }; v.spinning = false; cv.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => { const s = view.current.drag; if (s) turn(s.yaw - (e.clientX - s.x) * 0.01, s.pitch + (e.clientY - s.y) * 0.01); };
    const up = () => { view.current.drag = null; };
    const key = (e: KeyboardEvent) => {
      const v = view.current, by = { ArrowLeft: [0.15, 0], ArrowRight: [-0.15, 0], ArrowUp: [0, -0.15], ArrowDown: [0, 0.15] }[e.key];
      if (!by) return;
      e.preventDefault(); v.spinning = false; turn(v.yaw + by[0], v.pitch + by[1]);
    };
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('keydown', key);
    return () => { cancelAnimationFrame(frame); cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); cv.removeEventListener('keydown', key); };
  }, [pixels, width, height, locked]);
  return <canvas ref={canvas} className="planet-globe" width={360} height={360} tabIndex={0} role="img" aria-label={`${label}. Drag or use the arrow keys to turn the globe.`}/>;
}
