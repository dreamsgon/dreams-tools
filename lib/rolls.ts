import type {DamageComponent} from './damage.ts';
import type {PhysicalDie} from './dice-physics';
import {z} from "zod";
export const rollPresetSchema=z.object({damageType:z.string().max(80).optional(),damageCategory:z.enum(["normal","precision","persistent","splash"]).optional(),damageTags:z.array(z.string().max(80)).max(30).optional(),scaling:z.object({baseRank:z.number().int().min(1).max(10),baseFormula:z.string().max(200),interval:z.number().int().min(1).max(9),increment:z.string().max(200)}).optional(),mode:z.string().max(80).optional(),persistent:z.boolean().optional(),id:z.string().max(100),name:z.string().max(160),kind:z.enum(["attack","damage","save","skill","other"]),formula:z.string().max(200),damageMode:z.enum(["double","once","criticalOnly"]).optional(),weaponDice:z.boolean().optional(),sourceKey:z.string().max(600).optional(),sourceFormula:z.string().max(200).optional(),note:z.string().max(500).optional()});
export type RollPreset=z.infer<typeof rollPresetSchema>;
type Term={sign:number;count:number;sides:number;constant:number};
export function parseDice(input:string):Term[]{
  const text=input.toLowerCase().replace(/\s/g,"").replace(/[−–]/g,"-");
  if(!text||text.length>200||!/^[-+]?(?:\d*d\d+|\d+)(?:[-+](?:\d*d\d+|\d+))*$/.test(text))throw Error("Use dice and modifiers, such as 1d20+9 or 2d6+4+1d4. No functions or multiplication.");
  const terms=(text.match(/[+-]?[^+-]+/g)||[]).map(t=>{const sign=t[0]==="-"?-1:1;const part=t.replace(/^[+-]/,"");if(part.includes("d")){const [n,s]=part.split("d");return {sign,count:n?Number(n):1,sides:Number(s),constant:0};}return {sign,count:0,sides:0,constant:Number(part)};});
  if(terms.length>20||terms.some(t=>t.sides&&(t.sides<2||t.sides>1000)||t.count<0||t.count>100||t.constant>100000)||terms.some(t=>t.sides===0&&t.count>0)||terms.reduce((n,t)=>n+t.count,0)>100||/\b0d/.test(text))throw Error("Use at most 100 dice, 20 terms, d2–d1000, and modifiers up to 100000.");
  return terms;
}
let physicalContext:{collect:number[];dice?:PhysicalDie[];index:number}|null=null;
const physicalResults=new WeakMap<object,PhysicalDie[]>();
export function takePhysicalDice(result:object){const dice=physicalResults.get(result)||[];physicalResults.delete(result);return dice;}
export function emitPhysicalDice(result:object){const dice=physicalResults.get(result);if(dice&&typeof window!=="undefined"){window.dispatchEvent(new CustomEvent("pf2e-dice-rolled",{detail:dice}));physicalResults.delete(result);}}
export async function physicalRoll<T extends object>(calculate:()=>T):Promise<T>{
 const collect:number[]=[];physicalContext={collect,index:0};try{calculate();}finally{physicalContext=null;}
 const {simulateDice}=await import('./dice-physics.ts');const dice=simulateDice(collect,Math.random,typeof window==='undefined'||!window.innerHeight?1.7:window.innerWidth/window.innerHeight);
 physicalContext={collect:[],dice,index:0};try{const result=calculate();physicalResults.set(result,dice);return result;}finally{physicalContext=null;}
}
export function rollDice(formula:string,random:()=>number=Math.random){
  const emitted:PhysicalDie[]=[];const terms=parseDice(formula);const parts=terms.map(t=>{const dice=Array.from({length:t.count},()=>{if(physicalContext){if(!physicalContext.dice){physicalContext.collect.push(t.sides);return 1;}const d=physicalContext.dice[physicalContext.index++];if(!d||d.sides!==t.sides)throw Error("Roll formula changed during simulation.");emitted.push(d);return d.value;}const value=1+Math.floor(random()*t.sides);emitted.push({sides:t.sides,value});return value;});const subtotal=t.sign*(dice.reduce((a,b)=>a+b,0)+t.constant);return {...t,dice,subtotal};});
  if(typeof window!=="undefined"&&!physicalContext)window.dispatchEvent(new CustomEvent("pf2e-dice-rolled",{detail:emitted}));
  return {formula,total:parts.reduce((n,p)=>n+p.subtotal,0),parts,natural:parts.length>=1&&parts[0].count===1&&parts[0].sides===20&&parts[0].sign===1?parts[0].dice[0]:null};
}
export function modifierFormula(n:number){return `1d20${n<0?"":"+"}${n}`;}
// Only explicit signed skill totals are actionable; source proficiency ranks aren't totals.
export function skillRolls(text:string){return Array.from(text.matchAll(/(?:^|[\n;,])\s*([A-Za-z][A-Za-z ()'-]{1,60})\s+([+−-]\d{1,3})\b/g)).map(m=>({name:m[1].trim(),formula:modifierFormula(Number(m[2].replace("−","-")))}));}


export function announceDiceResult(name:string,total:number,lines:string[]=[],appearance?:unknown,actorName?:string,onComplete?:()=>void,logScope?:string,metadata?:{id?:string;damage?:DamageComponent[]}){
 const event=typeof window!=="undefined"?new CustomEvent("pf2e-dice-result",{cancelable:true,detail:{name,total,lines,appearance,actorName,onComplete,logScope,...metadata}}):null;
 if(!event||window.dispatchEvent(event))onComplete?.();
}
export function cancelDiceAnimation(){if(typeof window!=="undefined")window.dispatchEvent(new Event("pf2e-dice-cancel"));}
