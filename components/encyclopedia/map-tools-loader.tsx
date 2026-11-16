'use client';
import { useEffect } from 'react';
import * as shaping from '@/lib/encyclopedia/land-shaping';
import * as zoom from '@/lib/encyclopedia/zoom-maps';

export type MapTools = { shaping: typeof shaping; zoom: typeof zoom };
const tools: MapTools = { shaping, zoom };
/** Renders nothing: hands the land shaping and zoom-in functions to the map editor once they have loaded in the browser. */
export function MapToolsLoader({ onReady }: { onReady: (m: MapTools) => void }) {
  useEffect(() => onReady(tools), [onReady]);
  return null;
}
