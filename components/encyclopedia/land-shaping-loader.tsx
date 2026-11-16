'use client';
import { useEffect } from 'react';
import * as shaping from '@/lib/encyclopedia/land-shaping';

export type Shaping = typeof shaping;
/** Renders nothing: hands the land shaping functions to the map editor once they have loaded in the browser. */
export function ShapingLoader({ onReady }: { onReady: (m: Shaping) => void }) {
  useEffect(() => onReady(shaping), [onReady]);
  return null;
}
