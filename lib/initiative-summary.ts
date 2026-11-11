import type {Token,Condition,Scene} from './model';
import {conditionAge,getInitiativeEntries,getInitiativeRound,getCurrentInitiativeEntry} from './initiative-tracker.ts';

// Match Avrae's public health bands; explicit unconscious/dead state takes precedence.
export function tokenHealth(token:Token):string {
 if(token.status==='dead')return 'Dead';
 if(token.status==='unconscious')return 'Unconscious';
 if(token.hp<=0)return token.zeroHpStatus==='unconscious'?'Unconscious':'Dead';
 const ratio=token.hp/token.maxHp;
 return ratio>=1?'Healthy':ratio>0.5?'Injured':ratio>0.15?'Bloodied':'Critical';
}
export function discordHpDisplay(token:Token):'exact'|'health'|'hidden' {
 if(token.discordHpDisplay==='hidden')return 'hidden';
 if(token.discordHpDisplay==='health')return 'health';
 const monster=token.rosterRole==='npc'||token.disposition==='enemy';
 if(token.discordHpDisplay!=='exact'&&monster)return 'health';
 if(!token.showHp||token.hpVisibility==='hide')return 'hidden';
 return 'exact';
}
// A user-entered name cannot close the code fence or inject additional summary rows.
const plain=(value:string)=>value.replace(/[`\r\n\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
export function initiativeSummary(sceneName:string,tokens:Token[],conditions:Condition[],scene?:Scene):string {
 const entries=scene?getInitiativeEntries({...scene,tokens}):null;
 const visible=(entries?entries.flatMap(e=>e.tokens):[...tokens].sort((a,b)=>(b.initiative??-Infinity)-(a.initiative??-Infinity)||a.name.localeCompare(b.name))).filter(t=>!t.hidden&&typeof t.initiative==='number'&&Number.isFinite(t.initiative));
 if(!visible.length)throw Error('No visible tokens have initiative.');
 const rows=visible.map(t=>{
  const hp=discordHpDisplay(t),stats:string[]=[];
  if(hp==='exact')stats.push(`${t.hp}/${t.maxHp} HP`);
  if(hp==='health')stats.push(tokenHealth(t));
  for(const [label,value,show] of [['AC',t.ac,t.showAc],['DC',t.dc,t.showDc],['PP',t.passivePerception,t.showPassivePerception],['Temp HP',t.tempHp,t.showTempHp]] as const){
   if(show&&typeof value==='number'&&Number.isFinite(value))stats.push(`${label} ${value}`);
  }
  const name=t.showName&&t.nameVisibility!=='hide'?plain(t.name):'Unknown';
  const detail=t.showDiscordConditions?t.conditions.flatMap(id=>{const name=conditions.find(c=>c.id===id)?.name;if(!name)return [];const age=scene?conditionAge(t,id,getInitiativeRound(scene)):null;return [plain(name)+(age!==null?` (${age} rounds)`:'')];}).join(', '):'';
  const current=scene?getCurrentInitiativeEntry(scene):null;
  const active=current?.tokens.some(token=>token.id===t.id)&&!t.skipInitiative;
  return {initiative:String(t.initiative),name:(active?'▶ ':'')+name+(t.skipInitiative?' (skipped)':''),stats,detail};
 });
 const width=Math.max(...rows.map(r=>r.initiative.length));
 const current=scene?getCurrentInitiativeEntry(scene):null;
 const visibleCurrent=current?.tokens.filter(t=>!t.hidden&&!t.skipInitiative)??[];
 const currentLabel=current?(visibleCurrent.length?visibleCurrent.map(t=>t.showName&&t.nameVisibility!=='hide'?plain(t.name):'Unknown').join(', '):'Hidden turn'):'Not started';
 const tracking=scene?`Round ${getInitiativeRound(scene)} | Current: ${currentLabel}\n`:'';
 return '```text\n'+plain(sceneName)+' — Initiative\n'+tracking+rows.map(r=>`${r.initiative.padStart(width)}: ${r.name}${r.stats.length?' <'+r.stats.join(' | ')+'>':''}${r.detail?' ['+r.detail+']':''}`).join('\n')+'\n```';
}
