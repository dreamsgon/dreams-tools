"use client";
import type {Effect} from "@/lib/model";
import {Field,NumberField,Toggle} from "./dialogs";
export default function EffectAppearance({effect,patch}:{effect:Omit<Effect,"x"|"y"|"tokenId">;patch:(value:Partial<Effect>)=>void}) {
 return <fieldset className="effect-appearance"><legend>Style &amp; label</legend>
 {effect.kind!=="label"&&<>
 <Field label="Fill opacity"><input aria-label="Fill opacity" type="range" min={0} max={100} step={1} value={Math.round((effect.fillOpacity??69/255)*100)} onChange={e=>patch({fillOpacity:Number(e.target.value)/100})}/><small>{Math.round((effect.fillOpacity??69/255)*100)}%</small></Field>
 <NumberField label="Outline thickness (px)" min={0} max={20} value={effect.strokeWidth??3} onChange={strokeWidth=>patch({strokeWidth})}/>
 <Field label="Outline style"><select value={effect.strokeStyle??"solid"} onChange={e=>patch({strokeStyle:e.target.value as Effect["strokeStyle"]})}><option value="solid">Solid</option><option value="dashed">Dashed</option></select></Field>
 <Toggle label="Show label" checked={effect.showLabel!==false} onChange={showLabel=>patch({showLabel})}/>
 </>}
 <NumberField label="Label text size (px)" min={8} max={120} value={effect.labelSize??(effect.kind==="label"?24:16)} onChange={labelSize=>patch({labelSize})}/>
 <Field label="Label color"><input type="color" value={effect.labelColor??"#15241e"} onChange={e=>patch({labelColor:e.target.value})}/></Field>
 {effect.kind!=="label"&&<div className="form-row"><NumberField label="Label horizontal offset (px)" min={-2000} max={2000} value={effect.labelOffsetX??0} onChange={labelOffsetX=>patch({labelOffsetX})}/><NumberField label="Label vertical offset (px)" min={-2000} max={2000} value={effect.labelOffsetY??0} onChange={labelOffsetY=>patch({labelOffsetY})}/></div>}
 </fieldset>;
}
