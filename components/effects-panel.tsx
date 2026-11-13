"use client";
import {useState} from "react";
import {createPortal} from "react-dom";
import {effectSchema,uid} from "@/lib/model";
import EffectAppearance from "./effect-appearance";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { resolveEffect, isOneOffArea } from "@/lib/effects";
import type { Scene, Tool, Workspace, EffectPreset } from "@/lib/model";
import { Field, NumberField, Toggle, Modal } from "./dialogs";
import EffectPresets from "./effect-presets";
import PanelTip from "./panel-tip";
export type EffectDefaults = {
    size: number;
    color: string;
    label: string;
    persistent: boolean;
    hidden: boolean;
    width: number;
};
type Props = {
    workspace: Workspace;
    commit: (fn: (w: Workspace) => void) => void;
    onUsePreset: (preset: EffectPreset) => void;
    scene: Scene;
    tool: Tool;
    chooseTool: (tool: Tool) => void;
    selected: string | null;
    select: (id: string | null) => void;
    update: (fn: (scene: Scene) => void) => void;
    defaults: EffectDefaults;
    setDefaults: (patch: Partial<EffectDefaults>) => void;
};
const shapes = ["circle", "square", "line", "cone", "custom"] as const;
const names = { circle: "Circle", square: "Square", line: "Line", cone: "Cone", custom: "Custom" };
type Effect = Scene["effects"][number];
function Adjustment({ label, value, min, max, step, sliderMax = max, onChange }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    sliderMax?: number;
    onChange: (value: number) => void;
}) {
    return <div className="effect-adjustment"><NumberField label={label} value={value} min={min} max={max} step={step} onChange={onChange}/><input type="range" aria-label={`${label} slider`} min={min} max={Math.max(sliderMax, value)} step={step} value={value} onChange={e => onChange(Number(e.target.value))}/></div>;
}
export default function EffectsPanel({ workspace, commit, onUsePreset, scene, tool, chooseTool, selected, select, update, defaults, setDefaults }: Props) {
    const [editorOpen,setEditorOpen]=useState(false);
    const [objectShape,setObjectShape]=useState("square");
    const addObject = (labelOnly=false, draw=false) => {
      if(scene.effects.length>=300)return;
      const crop=scene.cropFocus?scene.crop:null;
      const item=effectSchema.parse({id:uid(),kind:labelOnly?"label":"object",type:labelOnly?"square":objectShape==="rectangle"?"line":objectShape==="triangle"?"custom":objectShape,
        x:crop?crop.x+crop.width/2:scene.width/2,y:crop?crop.y+crop.height/2:scene.height/2,size:2,width:1,color:defaults.color,
        label:labelOnly?"Map label":"Object",persistent:true,fillOpacity:labelOnly?0:.85,strokeWidth:labelOnly?0:3,labelSize:labelOnly?24:16,
        points:objectShape==="triangle"?[{x:0,y:-scene.grid.size},{x:scene.grid.size,y:scene.grid.size},{x:-scene.grid.size,y:scene.grid.size}]:[]});
      if(draw){onUsePreset({...item,name:item.label});return;}
      update(s=>{s.effects.push(item);});chooseTool("select");select(item.id);setEditorOpen(true);
    };
    const effect = scene.effects.find(item => item.id === selected);
    const patch = (values: Partial<Effect>) => {
        if (!effect)
            return;
        update(s => {
            const item = s.effects.find(candidate => candidate.id === effect.id);
            if (!item)
                return;
            if (item.type === "custom" && values.size !== undefined && item.size > 0) {
                const ratio = values.size / item.size;
                item.points = item.points.map(p => ({ x: p.x * ratio, y: p.y * ratio }));
            }
            if (values.tokenId !== undefined) {
                const resolved = resolveEffect(item, s.tokens);
                item.x = resolved.x;
                item.y = resolved.y;
                if (values.tokenId)
                    values.persistent = true;
            }
            if (values.persistent === false && item.tokenId) {
                const resolved = resolveEffect(item, s.tokens);
                Object.assign(item, { x: resolved.x, y: resolved.y, tokenId: null });
            }
            Object.assign(item, values);
        });
    };
    const selectEffect = (id: string) => { chooseTool("select"); select(id); setEditorOpen(true); };
    return <>
  <h3>Objects &amp; map labels</h3>
  <Field label="Object shape"><select value={objectShape} onChange={e=>setObjectShape(e.target.value)}><option value="square">Square</option><option value="rectangle">Rectangle</option><option value="circle">Circle</option><option value="triangle">Triangle</option><option value="custom">Freehand</option></select></Field>
  <div className="button-row"><button disabled={scene.effects.length>=300||objectShape==="custom"} onClick={()=>addObject()}>Add object</button><button disabled={scene.effects.length>=300} onClick={()=>addObject(false,true)}>Draw object</button><button disabled={scene.effects.length>=300} onClick={()=>addObject(true)}>Add map label</button></div>
  <PanelTip more={<p>Add places it in the middle of the map (or of your focused crop). Draw lets you drag its size on the map. Objects stay when one-off AoEs are cleared.</p>}>Add drops one in the middle; Draw lets you size it.</PanelTip>
  <h3>Auras &amp; AoEs</h3>
  <button className={tool === "select" ? "active" : ""} aria-pressed={tool === "select"} onClick={() => chooseTool("select")}>Select &amp; edit an area</button>
  <div className="button-row effect-shapes" role="group" aria-label="Draw an area of effect">{shapes.map(shape => <button key={shape} className={tool === shape ? "active" : ""} aria-pressed={tool === shape} onClick={() => { select(null); chooseTool(shape); }}>{names[shape]}</button>)}</div>
  <PanelTip more={<p>Custom draws a freehand area; let go to close it. To change an area, choose Select &amp; edit, then click it on the map or in the list below.</p>}>Pick a shape, then drag on the map to draw it.</PanelTip>
  {effect && <>
   <button className="primary" onClick={()=>setEditorOpen(true)}>Edit {effect.kind==="label"?"map label":effect.kind==="object"?"object":"selected area"}</button>
   {editorOpen && createPortal(<Modal title={effect.kind==="label"?"Edit map label":effect.kind==="object"?"Edit object":"Edit aura / AoE"} close={()=>setEditorOpen(false)}>

   <div className="section-heading"><h3>{effect.kind==="label"?"Map label":`Selected ${effect.kind==="object"&&effect.type==="line"?"rectangle":names[effect.type].toLowerCase()}`}</h3><button className="text-button" onClick={() => select(null)}>Deselect</button></div>
   <p className="muted">{effect.kind==="label"?"Changes appear immediately. Drag the label on the map to move it, and adjust its text size below.":"Changes appear on the map immediately. Drag the area to move it, or use its resize and rotation handles."}</p>
   <Toggle label="Lock in place" checked={effect.locked??false} onChange={locked=>patch({locked})}/>{effect.locked&&<p className="muted">Locked: dragging, resizing, and rotation are disabled. Unlock to reposition.</p>}
   <Field label={effect.kind==="label"?"Label text":"Area label"}><input value={effect.label} maxLength={120} onChange={e => patch({ label: e.target.value })}/></Field>
   {effect.kind!=="label"&&<fieldset className="effect-geometry" disabled={effect.locked}><Field label="Shape"><select value={effect.type} onChange={e=>patch({type:e.target.value as Effect["type"]})}>{shapes.map(shape=><option key={shape} value={shape} disabled={shape==="custom"&&effect.points.length<3}>{effect.kind==="object"&&shape==="line"?"Rectangle":names[shape]}</option>)}</select></Field><Adjustment label={effect.type === "circle" ? "Radius (cells)" : effect.type === "cone" || effect.type === "line" ? "Length (cells)" : "Size (cells)"} value={effect.size} min={0.25} max={200} sliderMax={30} step={0.25} onChange={size => patch({ size })}/>
   {effect.type !== "circle" && <>
    <Adjustment label="Rotation (degrees)" value={effect.rotation} min={-360} max={360} step={1} onChange={rotation => patch({ rotation })}/>
    <div className="button-row" role="group" aria-label="Quick rotation"><button onClick={() => patch({ rotation: ((effect.rotation - 15 + 540) % 360) - 180 })}>Rotate -15°</button><button onClick={() => patch({ rotation: 0 })}>Reset angle</button><button onClick={() => patch({ rotation: ((effect.rotation + 15 + 540) % 360) - 180 })}>Rotate +15°</button></div>
   </>}
   {effect.type === "line" && <Adjustment label={effect.kind==="object"?"Rectangle width (cells)":"Line width (cells)"} value={effect.width} min={0.05} max={200} sliderMax={10} step={0.05} onChange={width => patch({ width })}/>}
   {effect.type === "cone" && <Adjustment label="Cone angle (degrees)" value={effect.angle} min={1} max={180} step={1} onChange={angle => patch({ angle })}/>}
   </fieldset>}
   {effect.kind!=="label"&&<Field label="Fill / outline color"><input type="color" value={effect.color} onChange={e => patch({ color: e.target.value })}/></Field>}
   <EffectAppearance effect={effect} patch={patch}/>
   {!effect.tokenId&&<fieldset className="form-row effect-geometry" disabled={effect.locked}><NumberField label="X position (px)" min={0} max={scene.width} value={effect.x} onChange={x=>patch({x})}/><NumberField label="Y position (px)" min={0} max={scene.height} value={effect.y} onChange={y=>patch({y})}/></fieldset>}
   {(!effect.kind||effect.kind==="area")&&<Toggle label="Persistent aura" checked={effect.persistent} onChange={persistent => patch({ persistent })}/>}
   {effect.persistent && (!effect.kind||effect.kind==="area") && <Field label="Attach aura to token"><select value={effect.tokenId ?? ""} onChange={e => patch({ tokenId: e.target.value || null })}><option value="">Unattached</option>{scene.tokens.map(token => <option key={token.id} value={token.id}>{token.name || "Unnamed token"}{token.hidden ? " (hidden)" : ""}</option>)}</select></Field>}
   {effect.tokenId && <p className="muted">This aura follows its token center. Move the token to move the aura, or choose Unattached to move it independently. Hidden tokens also hide their auras from players.</p>}
   <Toggle label="Hidden from players" checked={effect.hidden} onChange={hidden => patch({ hidden })}/>
   <button disabled={scene.effects.length>=300} onClick={()=>{const copy={...structuredClone(resolveEffect(effect,scene.tokens)),id:uid(),tokenId:null,locked:false,x:Math.min(scene.width,resolveEffect(effect,scene.tokens).x+scene.grid.size),y:Math.min(scene.height,resolveEffect(effect,scene.tokens).y+scene.grid.size)};update(s=>{s.effects.push(copy);});select(copy.id);}}>Duplicate</button>
   <button className="danger" onClick={() => { update(s => { s.effects = s.effects.filter(item => item.id !== effect.id); }); select(null); }}><Trash2 size={15}/> Remove area</button>
   <button className="primary" onClick={()=>setEditorOpen(false)}>Done</button>
   </Modal>,document.body)}
  </>}
  <details open={!effect}><summary>New area defaults</summary>
   <Field label="New area label"><input value={defaults.label} maxLength={120} placeholder="e.g. Spirit guardians" onChange={e => setDefaults({ label: e.target.value })}/></Field>
   <div className="form-row"><NumberField label="Default size (cells)" value={defaults.size} min={0.25} max={200} step={0.25} onChange={size => setDefaults({ size })}/><Field label="New area color"><input type="color" value={defaults.color} onChange={e => setDefaults({ color: e.target.value })}/></Field></div>
   <NumberField label="Default line width (cells)" value={defaults.width} min={0.05} max={200} step={0.25} onChange={width => setDefaults({ width })}/>
   <Toggle label="New areas are persistent auras" checked={defaults.persistent} onChange={persistent => setDefaults({ persistent })}/><Toggle label="Hide new areas from players" checked={defaults.hidden} onChange={hidden => setDefaults({ hidden })}/>
   <PanelTip more={<p>One-off AoEs can be cleared together with Clear one-off AoEs. Hidden areas are visible only to you.</p>}>Persistent auras stay until you remove them.</PanelTip>
  </details>
  <EffectPresets workspace={workspace} commit={commit} onUsePreset={onUsePreset} selectedEffect={effect}/>
  {["objects", "auras", "areas"].map(group => { const persistent=group==="auras"; const items = scene.effects.filter(item => group==="objects" ? item.kind==="object"||item.kind==="label" : (!item.kind||item.kind==="area")&&item.persistent===persistent); return <div key={group}><div className="section-heading"><h3>{group==="objects"?"Objects & map labels":persistent ? "Persistent auras" : "One-off AoEs"}</h3><span className="count">{items.length}</span></div><div className="token-list">{items.map(item => <div className="token-list-row" key={item.id}><button className={selected === item.id ? "active" : ""} aria-label={`Select and edit ${item.label || names[item.type]}`} aria-pressed={selected === item.id} onClick={() => selectEffect(item.id)}><span className="token-avatar" style={{ background: item.color }}/>{item.label || names[item.type]}{item.locked?" (locked)":""}</button><button className="token-visibility" aria-label={`${item.hidden ? "Show" : "Hide"} ${item.label || names[item.type]} ${item.hidden ? "to" : "from"} players`} title={item.hidden ? "Hidden from players" : "Visible to players"} aria-pressed={item.hidden} onClick={() => update(s => { const area = s.effects.find(candidate => candidate.id === item.id); if (area)
        area.hidden = !area.hidden; })}>{item.hidden ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>)}</div>{!items.length && <p className="empty-small">{group==="objects"?"No objects or labels yet.":persistent ? "No persistent auras." : "No one-off AoEs."}</p>}</div>; })}
  <button className="danger" disabled={!scene.effects.some(isOneOffArea)} onClick={() => { update(s => { s.effects = s.effects.filter(item => !isOneOffArea(item)); }); if (effect && isOneOffArea(effect))
        select(null); }}>Clear one-off AoEs</button>
 </>;
}
