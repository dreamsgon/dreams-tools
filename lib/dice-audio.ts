import type {DiceAppearance} from './dice-appearance';
import type {PhysicalBody} from './dice-physics';

// Synthesized impacts avoid external audio downloads and follow the simulated contacts.
export const materialSounds={resin:{frequency:380,decay:.07,noise:.65},metal:{frequency:1350,decay:.28,noise:.25},glass:{frequency:2550,decay:.19,noise:.12},gemstone:{frequency:1850,decay:.13,noise:.32}};
let context:AudioContext|undefined;
export async function unlockDiceAudio(){
 try{context??=new AudioContext();if(context.state==='suspended')await context.resume();}catch{/* Audio is optional on browsers without Web Audio. */}
}
export function audioEvents(bodies:PhysicalBody[]){
 // Merge simultaneous contacts so large rolls stay comfortable and inexpensive.
 const slots=new Map<number,{time:number;strength:number}>();
 for(const body of bodies)for(const hit of body.impacts||[]){const slot=Math.floor(hit.time/35),old=slots.get(slot);if(!old||hit.strength>old.strength)slots.set(slot,hit);}
 return [...slots.values()].sort((a,b)=>a.time-b.time);
}
export function startDiceAudio(bodies:PhysicalBody[],style:DiceAppearance){
 const ctx=context,volume=style.volume??.55;
 if(!ctx||ctx.state!=='running'||style.muted||volume<=0)return()=>{};
 const profile=materialSounds[style.material||'resin'],sources:AudioScheduledSourceNode[]=[];
 let master:GainNode;try{master=ctx.createGain();}catch{return()=>{};}
 const cleanup=()=>{for(const source of sources){try{source.stop();}catch{}try{source.disconnect();}catch{}}try{master.disconnect();}catch{}};
 try{
 master.gain.value=volume*.22;master.connect(ctx.destination);
 const start=ctx.currentTime;
 for(const hit of audioEvents(bodies)){
  const at=start+hit.time/1000,energy=Math.min(1,hit.strength/10),length=profile.decay;
  const gain=ctx.createGain();gain.gain.setValueAtTime(.001,at);gain.gain.linearRampToValueAtTime(energy,at+.002);gain.gain.exponentialRampToValueAtTime(.001,at+length);gain.connect(master);
  const noise=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*length),ctx.sampleRate),data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*profile.noise;
  const source=ctx.createBufferSource();source.buffer=noise;const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=profile.frequency*2;source.connect(filter);filter.connect(gain);sources.push(source);source.start(at);source.stop(at+length);
  for(const ratio of [1,1.47,2.09]){const tone=ctx.createOscillator(),level=ctx.createGain();tone.frequency.value=profile.frequency*ratio;level.gain.value=(1-profile.noise)/3; tone.connect(level);level.connect(gain);sources.push(tone);tone.start(at);tone.stop(at+length);}
 }
 }catch{cleanup();}
 return cleanup;
}
