'use client';
import {moonPhase,seasonOn,type Calendar,type CalendarDate} from '@/lib/encyclopedia/calendar-model';
export function MoonGlyph({phase,color,size=28}:{phase:number;color:string;size?:number}){
 const waxing=phase<.5,cos=Math.cos(2*Math.PI*phase);
 return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#232630"/><path d={waxing?'M12 2 A10 10 0 0 1 12 22 Z':'M12 2 A10 10 0 0 0 12 22 Z'} fill={color}/><ellipse cx="12" cy="12" rx={Math.abs(cos)*10} ry="10" fill={cos>0?'#232630':color}/><circle cx="12" cy="12" r="10" fill="none" stroke={color} strokeWidth=".65"/></svg>;
}
export function CalendarSky({calendar,date}:{calendar:Calendar;date:CalendarDate}){
 const season=seasonOn(calendar,date),moons=calendar.moons??[];
 if(!season&&!moons.length)return null;
 return <section className="calendar-sky" aria-label="Sky and season for selected date"><span className="eyebrow">SKY & SEASON</span>{season&&<div className="season-badge"><i style={{background:season.color}}/><strong>{season.name}</strong><small>Since {season.day} {calendar.periods.find(p=>p.id===season.periodId)?.name}</small></div>}<div className="moon-readings">{moons.map(m=>{const phase=moonPhase(calendar,m,date);return <article key={m.id}><MoonGlyph phase={phase.phase} color={m.color} size={34}/><div><strong>{m.name}{m.visibility==='gm'&&<small> · GM only</small>}</strong><span>{phase.name}</span><small>{m.mode==='manual'?'Manual · GM selected':`${Math.round(phase.illumination*100)}% lit · ${m.cycleDays}-day cycle`}</small></div></article>;})}</div>{moons.some(m=>m.mode==='manual')&&<p className="aside-hint">Manual phases stay fixed on all dates until the GM changes them.</p>}{calendar.almanacNotes&&<details className="sky-notes"><summary>Almanac notes</summary><p>{calendar.almanacNotes}</p>{moons.filter(m=>m.notes).map(m=><p key={m.id}><strong>{m.name}:</strong> {m.notes}</p>)}</details>}</section>;
}
