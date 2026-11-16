"use client";
import { useMemo } from "react";
import type { MapDrawing } from "@/lib/model";
import type { Stamp } from "@/lib/map-stamps";
import { lightArea, lightWalls, mapLights, type MapLight } from "@/lib/map-light";

/** How the Map Creator shows lights: not at all, as a warm glow on the map, or with the dark around them. */
export type LightingMode = "off" | "glow" | "dark";
export const lightingModes: { id: LightingMode; name: string }[] = [{ id: "off", name: "Off" }, { id: "glow", name: "Glow" }, { id: "dark", name: "Darkness" }];

/**
 * The map's lights drawn over it: a coloured glow round each lit light, kept inside the walls
 * that stop it, and in Darkness a dark veil with each light's bright and dim reach cut out of it.
 * Overlapping lights add up the same in any order, because each one only takes away darkness.
 */
export default function MapLighting({ drawing, width, height, gridSize, mode, find, id = "lighting" }: {
  drawing: Pick<MapDrawing, "shapes" | "folders" | "layerOrder">; width: number; height: number; gridSize: number; mode: LightingMode;
  find?: (stampId: string | null) => Stamp | null; id?: string;
}) {
  const { shapes, folders, layerOrder } = drawing;
  const lit = useMemo(() => {
    const d = { shapes, folders, layerOrder };
    const lights = mapLights(d, find).filter(l => l.on && l.dim > 0);
    if (!lights.length) return [];
    const walls = lightWalls(d);
    return lights.map(l => ({ ...l, area: lightArea(l, gridSize, walls) }));
  }, [shapes, folders, layerOrder, gridSize, find]);
  if (mode === "off" || !lit.length) return null;
  const dark = mode === "dark";
  const edge = (l: MapLight) => Math.max(.02, Math.min(1, l.bright / l.dim));
  const clip = (l: { area: string | null }, i: number) => l.area ? `url(#${id}-c${i})` : undefined;
  return <g className="map-lighting" pointerEvents="none" data-mode={mode}>
    <defs>
      {lit.map((l, i) => { const b = edge(l); return <g key={l.id}>
        <radialGradient id={`${id}-g${i}`}>
          <stop offset="0" stopColor={l.colour} stopOpacity=".5"/>
          <stop offset={b} stopColor={l.colour} stopOpacity={dark ? .28 : .24}/>
          <stop offset="1" stopColor={l.colour} stopOpacity="0"/>
        </radialGradient>
        {dark && <radialGradient id={`${id}-m${i}`}>
          <stop offset="0" stopColor="#000" stopOpacity="1"/>
          <stop offset={b} stopColor="#000" stopOpacity="1"/>
          <stop offset={Math.min(.98, b + (1 - b) * .08)} stopColor="#000" stopOpacity=".62"/>
          <stop offset=".9" stopColor="#000" stopOpacity=".48"/>
          <stop offset="1" stopColor="#000" stopOpacity="0"/>
        </radialGradient>}
        {l.area && <clipPath id={`${id}-c${i}`}><path d={l.area}/></clipPath>}
      </g>; })}
      {dark && <mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
        <rect width={width} height={height} fill="#fff"/>
        {lit.map((l, i) => <circle key={l.id} cx={l.x} cy={l.y} r={l.dim * gridSize} fill={`url(#${id}-m${i})`} clipPath={clip(l, i)}/>)}
      </mask>}
    </defs>
    {dark && <rect width={width} height={height} fill="#06070c" opacity=".78" mask={`url(#${id}-mask)`}/>}
    <g style={{ mixBlendMode: dark ? "screen" : "multiply" }}>
      {lit.map((l, i) => <g key={l.id} clipPath={clip(l, i)}><circle className={l.flicker ? "map-light-flicker" : undefined} cx={l.x} cy={l.y} r={l.dim * gridSize} fill={`url(#${id}-g${i})`}/></g>)}
    </g>
    {!dark && <g style={{ mixBlendMode: "screen" }} opacity=".5">
      {lit.map((l, i) => l.bright > 0 && <g key={l.id} clipPath={clip(l, i)}><circle cx={l.x} cy={l.y} r={l.bright * gridSize} fill={`url(#${id}-g${i})`}/></g>)}
    </g>}
  </g>;
}
