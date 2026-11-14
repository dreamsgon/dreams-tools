import type {PhysicalDie} from './dice-physics';
import {z} from "zod";
export const rollPresetSchema=z.object({damageType:z.string().max(80).optional(),damageCategory:z.enum(["normal","precision","persistent","splash"]).optional(),damageTags:z.array(z.string().max(80)).max(30).optional(),scaling:z.object({baseRank:z.number().int().min(1).max(10),baseFormula:z.string().max(200),interval:z.number().int().min(1).max(9),increment:z.string().max(200)}).optional(),mode:z.string().max(80).optional(),persistent:z.boolean().optional(),id:z.string().max(100),name:z.string().max(160),kind:z.enum(["attack","damage","save","skill","other"]),formula:z.string().max(200),damageMode:z.enum(["double","once","criticalOnly"]).optional(),weaponDice:z.boolean().optional(),sourceKey:z.string().max(600).optional(),sourceFormula:z.string().max(200).optional(),note:z.string().max(500).optional()});
export type RollPreset=z.infer<typeof rollPresetSchema>;
/** One dice group or constant. `keep`, `explode`, `target` and `fate` are set only for the notation that asks for them. */
export type Term={sign:number;count:number;sides:number;constant:number;keep?:{high:boolean;n:number};explode?:boolean;target?:number;fate?:boolean};
export const DICE_ERROR="Use dice and modifiers, such as 1d20+9, 4d6kh3, 2d6!, 5d10>=8 or 4dF. No functions or multiplication.";
const LIMIT_ERROR="Use at most 100 dice, 20 terms, d2–d1000, and modifiers up to 100000.";
/** The most extra dice one roll can add by exploding, so a roll always ends. */
export const MAX_EXPLOSIONS=100;
/**
 * Every term starts at a sign or the start, and each suffix starts with its own letter or symbol, so a string can be
 * read only one way and the checks below stay linear in the length (no nested repeats that could backtrack).
 */
const HEAD=/^(\d*)d(\d+|f)/;
const SUFFIX=/^(?:(k[hl]?)(\d*)|(!)|(>=)(\d+))/;
export function parseDice(input:string):Term[]{
  const text=input.toLowerCase().replace(/\s/g,"").replace(/[−–]/g,"-");
  if(!text||text.length>200)throw Error(DICE_ERROR);
  const pieces=text.split(/(?=[+-])/);
  if(pieces.length>20)throw Error(LIMIT_ERROR);
  const terms:Term[]=pieces.map(piece=>{
    const sign=piece[0]==="-"?-1:1,part=/^[+-]/.test(piece)?piece.slice(1):piece;
    if(/^\d+$/.test(part))return {sign,count:0,sides:0,constant:Number(part)};
    const head=HEAD.exec(part);if(!head)throw Error(DICE_ERROR);
    const fate=head[2]==="f",term:Term={sign,count:head[1]?Number(head[1]):1,sides:fate?3:Number(head[2]),constant:0};
    if(fate)term.fate=true;
    for(let rest=part.slice(head[0].length);rest;){
      const m=SUFFIX.exec(rest);if(!m)throw Error(DICE_ERROR);
      if(term.keep||term.explode||term.target!==undefined||fate)throw Error("Use only one of keep (kh, kl), exploding (!) or successes (>=) on a dice group, and none on Fate dice.");
      if(m[1])term.keep={high:m[1]!=="kl",n:m[2]?Number(m[2]):1};
      else if(m[3])term.explode=true;
      else term.target=Number(m[5]);
      rest=rest.slice(m[0].length);
    }
    return term;
  });
  if(terms.some(t=>t.sides&&(t.sides<2||t.sides>1000)||t.count<0||t.count>100||t.constant>100000)||terms.some(t=>t.sides===0&&t.count>0)||terms.reduce((n,t)=>n+t.count,0)>100||terms.some(t=>t.sides>0&&t.count<1))throw Error(LIMIT_ERROR);
  for(const t of terms){
    if(t.keep&&(t.keep.n<1||t.keep.n>t.count))throw Error("Keep at least one die, and no more dice than you roll.");
    if(t.target!==undefined){
      if(t.target<1||t.target>t.sides)throw Error("A success needs a target from 1 up to the die's highest number.");
      if(terms.length>1)throw Error("Counting successes works on its own, such as 5d10>=8, without other dice or modifiers.");
    }
  }
  return terms;
}
/** Lowest and highest total one term can give (an exploding group's highest is only what its first dice can reach). */
export function termRange(t:Term):[number,number]{
  if(!t.count)return [t.constant,t.constant];
  const n=t.keep?t.keep.n:t.count;
  if(t.target!==undefined)return [0,t.count];
  if(t.fate)return [-t.count,t.count];
  return [n,n*t.sides];
}
let physicalContext:{collect:number[];dice?:PhysicalDie[];index:number}|null=null;
const physicalResults=new WeakMap<object,PhysicalDie[]>();
export function takePhysicalDice(result:object){const dice=physicalResults.get(result)||[];physicalResults.delete(result);return dice;}
export async function physicalRoll<T extends object>(calculate:()=>T):Promise<T>{
 const collect:number[]=[];physicalContext={collect,index:0};try{calculate();}finally{physicalContext=null;}
 const {simulateDice}=await import('./dice-physics.ts');const dice=simulateDice(collect,Math.random,typeof window==='undefined'||!window.innerHeight?1.7:window.innerWidth/window.innerHeight);
 physicalContext={collect:[],dice,index:0};try{const result=calculate();physicalResults.set(result,dice);return result;}finally{physicalContext=null;}
}
/** One die. In the 3D tray the first dice of a group come from the simulation (Fate dice as a d6: 1-2 is −1, 3-4 is 0, 5-6 is +1); extra dice from exploding use the plain random source. */
function rollOne(t:Term,random:()=>number,extra:boolean){
  const sides=t.fate?6:t.sides;let v:number;
  if(physicalContext&&!extra){
    if(!physicalContext.dice){physicalContext.collect.push(sides);v=1;}
    else{const d=physicalContext.dice[physicalContext.index++];if(!d||d.sides!==sides)throw Error("Roll formula changed during simulation.");v=d.value;}
  }else v=1+Math.floor(random()*sides);
  return t.fate?Math.floor((v-1)/2)-1:v;
}
export type RollPart=Term&{
  /** The dice that count toward the total (the ones kept, when some were dropped). */
  dice:number[];subtotal:number;
  /** Dice rolled but left out by kh or kl. */
  dropped?:number[];
  /** Parallel to `dice`: true for a die that rolled its highest number and so rolled again (exploding dice). */
  bang?:boolean[];
  /** How many dice reached the target (success counting). */
  successes?:number;
};
export function rollDice(formula:string,random:()=>number=Math.random){
  const terms=parseDice(formula);let extras=0;
  const parts:RollPart[]=terms.map(t=>{
    const rolled:number[]=[],bang:boolean[]=[];
    for(let i=0;i<t.count;i++){
      let v=rollOne(t,random,false);rolled.push(v);bang.push(false);
      while(t.explode&&v===t.sides&&extras<MAX_EXPLOSIONS){bang[bang.length-1]=true;extras++;v=rollOne(t,random,true);rolled.push(v);bang.push(false);}
    }
    if(t.keep){
      const order=rolled.map((v,i)=>i).sort((a,b)=>(t.keep!.high?rolled[b]-rolled[a]:rolled[a]-rolled[b])||a-b),kept=new Set(order.slice(0,t.keep.n));
      const dice=rolled.filter((v,i)=>kept.has(i)),dropped=rolled.filter((v,i)=>!kept.has(i));
      return {...t,dice,dropped,subtotal:t.sign*dice.reduce((a,b)=>a+b,0)};
    }
    if(t.target!==undefined){const successes=rolled.filter(v=>v>=t.target!).length;return {...t,dice:rolled,successes,subtotal:t.sign*successes};}
    return {...t,dice:rolled,...(t.explode?{bang}:{}),subtotal:t.sign*(rolled.reduce((a,b)=>a+b,0)+t.constant)};
  });
  const first=parts[0],natural=first&&first.sides===20&&first.sign===1&&!first.explode&&first.target===undefined&&(first.count===1||first.keep?.n===1)?first.dice[0]:null;
  return {formula,total:parts.reduce((n,p)=>n+p.subtotal,0),parts,natural};
}

// ---- Roll twice, advantage and disadvantage ----------------------------------------------------

export type RollMode="normal"|"high"|"low";
/** A formula that starts with one plain d20 (1d20, d20+5), which is where advantage and disadvantage apply. */
export const isSingleD20=(formula:string)=>/^\+?1?d20(?=$|[+-])/.test(formula.toLowerCase().replace(/\s/g,""));
/** Advantage turns the first 1d20 into 2d20kh1 and disadvantage into 2d20kl1. Other formulas, and Normal, come back unchanged. */
export function withKeepMode(formula:string,mode:RollMode):string{
  if(mode==="normal"||!isSingleD20(formula))return formula;
  return formula.toLowerCase().replace(/\s/g,"").replace(/^\+?1?d20/,mode==="high"?"2d20kh1":"2d20kl1");
}
/** Rolls a whole formula twice and keeps the higher (or lower) total. A tie keeps the first. */
export function rollTwice(formula:string,mode:"high"|"low",random:()=>number=Math.random){
  const a=rollDice(formula,random),b=rollDice(formula,random),pickB=mode==="high"?b.total>a.total:b.total<a.total;
  return {kept:pickB?b:a,dropped:pickB?a:b,first:a,second:b};
}

// ---- Describing a roll -------------------------------------------------------------------------

const FATE=(v:number)=>v>0?"+":v<0?"−":"0";
/** One dice group: "14", "(5, 4)", "(6!, 4)", "13 (dropped 5)", "(10, 8, 3, 9, 1) 3 successes", "(+, 0, −, +)". Brackets can be "[" for the tray. */
export function partText(p:RollPart,open="("):string{
  const close=open==="["?"]":")",shown=p.dice.map((v,i)=>p.fate?FATE(v):`${v}${p.bang?.[i]?"!":""}`);
  if(p.target!==undefined)return `${open}${shown.join(", ")}${close} ${p.successes} ${p.successes===1?"success":"successes"}`;
  const body=shown.length>1||p.fate||open==="["?`${open}${shown.join(", ")}${close}`:shown[0]??"0";
  return p.dropped?.length?`${body} (dropped ${p.dropped.join(", ")})`:body;
}
/** "14 + 5" or "(5, 4) + 3": each dice group in brackets when it has more than one die. Plain formulas read as they always have. */
export function describeParts(parts:RollPart[]){
  return parts.map((p,i)=>{const text=p.count?partText(p):String(p.constant);return i===0?(p.sign<0?`−${text}`:text):`${p.sign<0?"−":"+"} ${text}`;}).join(" ");
}
