"use client";
import type { Scene } from "@/lib/model";
import { ambients, mapLights } from "@/lib/map-light";
import { Toggle } from "./dialogs";

/**
 * Lighting for a drawn map in Maptable: what players see where no light reaches, and every light
 * on the map, to light or put out during play. The shading follows straight away.
 */
export default function SceneLights({ scene, update }: { scene: Scene; update: (fn: (s: Scene) => void) => void }) {
  const d = scene.drawing;
  if (!d) return <p className="muted">Lights belong to drawn maps. Open a map in the Map Creator to add them.</p>;
  const lights = mapLights(d), ambient = d.ambient ?? "day";
  const setOn = (ids: string[], on: boolean) => update(s => { for (const shape of s.drawing?.shapes ?? []) if (ids.includes(shape.id)) shape.light = { ...(shape.light ?? {}), on }; });
  return <div className="scene-lights">
    <div className="field"><span>Where no light reaches</span>
      <div className="scene-lights-seg" role="group" aria-label="Where no light reaches">{ambients.map(a => <button key={a.id} type="button" aria-pressed={ambient === a.id} onClick={() => update(s => { if (s.drawing) s.drawing.ambient = a.id; })}>{a.name}</button>)}</div>
    </div>
    <p className="muted">{ambients.find(a => a.id === ambient)!.hint}</p>
    <h3>Lights on this map <small>({lights.length})</small></h3>
    {lights.length ? <>
      <div className="button-row"><button type="button" onClick={() => setOn(lights.map(l => l.id), true)}>Light all</button><button type="button" onClick={() => setOn(lights.map(l => l.id), false)}>Put all out</button></div>
      <ul className="scene-lights-list">{lights.map(l => { const shape = d.shapes.find(s => s.id === l.id)!; return <li key={l.id}>
        <i style={{ background: l.on ? l.colour : "#6b6f73" }} aria-hidden="true"/>
        <Toggle label={`${shape.name || "Light"} (${l.bright}/${l.dim} squares)`} checked={l.on} onChange={on => setOn([l.id], on)}/>
      </li>; })}</ul>
    </> : <p className="muted">This map has no lights yet. Add them in the Map Creator with the Light tool, or with torch, brazier and other light stamps.</p>}
  </div>;
}
