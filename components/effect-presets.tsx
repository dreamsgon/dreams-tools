"use client";
import { useState } from "react";
import { Circle, Square, Minus, Triangle, Pentagon } from "lucide-react";
import { canMoveCollection, effectPresetSchema, uid, type Effect, type EffectPreset, type Workspace } from "@/lib/model";
import { Field, Modal, NumberField, Toggle } from "./dialogs";
import EffectAppearance from "./effect-appearance";
import LibraryOrganizer from "./library-organizer";
import { moveSibling, placeBeside } from "@/lib/folder-order";

const icons = { circle: Circle, square: Square, line: Minus, cone: Triangle, custom: Pentagon };
type Props = { workspace: Workspace; commit: (fn: (w: Workspace) => void) => void; onUsePreset: (preset: EffectPreset) => void; selectedEffect?: Effect };
export default function EffectPresets({ workspace, commit, onUsePreset, selectedEffect }: Props) {
  const [location, setLocation] = useState<string | null>(null);
  const [editing, setEditing] = useState<EffectPreset | null>(null);
  const [error, setError] = useState("");
  const open = (preset: EffectPreset) => { setEditing(structuredClone(preset)); setError(""); };
  const saveSelected = () => {
    if (!selectedEffect) return;
    const { x, y, tokenId, ...values } = selectedEffect;
    void x; void y; void tokenId;
    open({ ...structuredClone(values), id: uid(), name: selectedEffect.label || `${selectedEffect.type} preset` });
  };
  const save = () => {
    if (!editing) return;
    try {
      const preset = effectPresetSchema.parse(editing);
      if (preset.type === "custom" && preset.points.length < 3) { setError("Custom shapes need at least three vertices."); return; }
      commit(w => { const index = w.effectPresets.findIndex(p => p.id === preset.id); if (index < 0) { w.effectPresets.push(preset); w.presetLocations[preset.id] = location; } else w.effectPresets[index] = preset; });
      setEditing(null);
    } catch { setError("Check the preset name and geometry limits."); }
  };
  return <>
    <LibraryOrganizer title="Area presets" folders={workspace.effectPresetFolders} items={workspace.effectPresets} locations={workspace.presetLocations} location={location} setLocation={setLocation}
      onCreateFolder={name => commit(w => { w.effectPresetFolders.push({ id: uid(), name, kind: "folder", parentId: null }); })}
      onRenameFolder={(id, name) => commit(w => { const folder = w.effectPresetFolders.find(f => f.id === id); if (folder) folder.name = name; })}
      onMoveFolder={(id, parentId) => commit(w => { const folder = w.effectPresetFolders.find(f => f.id === id); if (folder && canMoveCollection(w.effectPresetFolders, id, parentId)) folder.parentId = parentId; })}
      onStepFolder={(id, delta) => commit(w => { w.effectPresetFolders = moveSibling(w.effectPresetFolders, id, delta); })}
      onPlaceFolder={(id, targetId, place) => commit(w => { const t = w.effectPresetFolders.find(f => f.id === targetId); if (t && canMoveCollection(w.effectPresetFolders, id, t.parentId)) w.effectPresetFolders = placeBeside(w.effectPresetFolders, id, targetId, place); })}
      onRemoveFolder={id => { commit(w => { const parent = w.effectPresetFolders.find(f => f.id === id)?.parentId ?? null; for (const folder of w.effectPresetFolders) if (folder.parentId === id) folder.parentId = parent; for (const key of Object.keys(w.presetLocations)) if (w.presetLocations[key] === id) w.presetLocations[key] = parent; w.effectPresetFolders = w.effectPresetFolders.filter(f => f.id !== id); }); if (location === id) setLocation(null); }}
      onMoveItem={(id, target) => commit(w => { w.presetLocations[id] = target; })}
      renderItem={preset => { const Icon = icons[preset.type]; return <div className="token-list-row"><button title="Use preset to draw on the map" onClick={() => onUsePreset(preset)}><Icon size={18} color={preset.color} /><span>{preset.name}</span></button><button className="text-button" aria-label={`Edit preset ${preset.name}`} onClick={() => open(preset)}>Edit</button></div>; }} />
    <button disabled={!selectedEffect} onClick={saveSelected}>Save selected area as preset</button>
    {editing && <Modal title="Edit area preset" close={() => setEditing(null)}>
      <Field label="Preset name"><input maxLength={120} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></Field>
      <Field label="Shape"><select value={editing.type} onChange={e => setEditing({ ...editing, type: e.target.value as EffectPreset["type"] })}>{Object.keys(icons).map(type => <option key={type} disabled={type === "custom" && editing.points.length < 3}>{type}</option>)}</select></Field>
      <Field label="Area label"><input maxLength={120} value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })} /></Field>
      <Field label="Color"><input type="color" value={editing.color} onChange={e => setEditing({ ...editing, color: e.target.value })} /></Field>
      <NumberField label="Size (cells)" min={0.25} max={200} step={0.25} value={editing.size} onChange={size => { const ratio = size / editing.size; setEditing({ ...editing, size, points: editing.type === "custom" ? editing.points.map(p => ({ x: p.x * ratio, y: p.y * ratio })) : editing.points }); }} />
      <NumberField label="Rotation (degrees)" min={-360} max={360} step={5} value={editing.rotation} onChange={rotation => setEditing({ ...editing, rotation })} />
      <NumberField label="Line width (cells)" min={0.05} max={200} step={0.25} value={editing.width} onChange={width => setEditing({ ...editing, width })} />
      <NumberField label="Cone angle (degrees)" min={1} max={180} value={editing.angle} onChange={angle => setEditing({ ...editing, angle })} />
      {editing.type === "custom" ? <p className="muted">To change the outline, place this preset on the map, reshape it using the handles, then save it as a preset.</p> : editing.points.length < 3 && <p className="muted">To create a custom preset, draw a custom area on the map, select it, then save it as a preset.</p>}
      <EffectAppearance effect={editing} patch={values=>setEditing({...editing,...values})}/>
      <Toggle label="Persistent aura" checked={editing.persistent} onChange={persistent => setEditing({ ...editing, persistent })} />
      <Toggle label="Hidden from players" checked={editing.hidden} onChange={hidden => setEditing({ ...editing, hidden })} />
      {error && <p role="alert">{error}</p>}
      <div className="button-row"><button onClick={save}>Save preset</button><button onClick={() => setEditing(null)}>Cancel</button>{workspace.effectPresets.some(p => p.id === editing.id) && <button className="danger" onClick={() => { commit(w => { w.effectPresets = w.effectPresets.filter(p => p.id !== editing.id); delete w.presetLocations[editing.id]; }); setEditing(null); }}>Delete preset</button>}</div>
    </Modal>}
  </>;
}
