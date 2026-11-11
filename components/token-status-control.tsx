"use client";
import { Skull, Moon, Circle } from "lucide-react";
import type { Token } from "@/lib/model";
export default function TokenStatusControl({value,onChange,zeroHpStatus,onZeroHpChange}:{zeroHpStatus:Token["zeroHpStatus"];onZeroHpChange:(status:Token["zeroHpStatus"])=>void;value:Token["status"];onChange:(status:NonNullable<Token["status"]>)=>void}) {
 return <fieldset className="token-status-control" style={{border:0,padding:0,margin:"12px 0"}}><legend style={{fontSize:12,fontWeight:600,marginBottom:8}}>Token state</legend><div className="button-row" style={{flexWrap:"wrap"}}>
 <button type="button" aria-pressed={!value||value==="active"} onClick={()=>onChange("active")}><Circle size={16}/>Active</button>
 <button type="button" aria-pressed={value==="unconscious"} onClick={()=>onChange("unconscious")}><Moon size={16}/>Unconscious</button>
 <button type="button" aria-pressed={value==="dead"} onClick={()=>onChange("dead")}><Skull size={16}/>Dead</button>
 </div><label style={{display:"grid",gap:6,marginTop:12}}>At 0 HP<select value={zeroHpStatus ?? "inherit"} onChange={e=>onZeroHpChange(e.target.value === "inherit" ? undefined : e.target.value as NonNullable<Token["zeroHpStatus"]>)}><option value="inherit">Inherit campaign default</option><option value="off">Off — manual only</option><option value="unconscious">Mark unconscious</option><option value="dead">Mark dead</option></select></label><small>Applies when HP reaches 0, or when enabled at 0 HP. Healing above 0 HP clears Unconscious. Dead stays marked until you choose Active.</small></fieldset>;
}
