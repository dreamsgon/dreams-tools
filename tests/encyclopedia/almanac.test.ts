import assert from 'node:assert/strict';
import {test} from 'node:test';
import {calendarSchema,moonPhase,seasonOn,advanceDate,publicCalendar} from '../../lib/encyclopedia/calendar-model.ts';
import {makeCalendar,calendarTemplates} from '../../lib/encyclopedia/calendar-templates.ts';
import {withAlmanacDefaults} from '../../lib/encyclopedia/calendar-almanac.ts';
const close=(a:number,b:number)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('almanac defaults cover all templates without inventing unknown phase cycles',()=>{
 const counts:Record<string,number>={harptos:1,gregorian:1,krynn:3,tamriel:2,thedas:2,eberron:12,greyhawk:2,exandria:2,custom:1};
 for(const t of calendarTemplates){const c=makeCalendar(t.id);assert.equal(c.moons?.length,counts[t.id]);assert.equal(c.seasons?.length,t.id==='greyhawk'?5:4);calendarSchema.parse(c);assert(c.almanacNotes);}
 assert(makeCalendar('eberron').moons!.every(m=>m.mode==='manual'));assert(makeCalendar('thedas').moons!.every(m=>m.mode==='manual'));assert.equal(makeCalendar('exandria').moons![1].mode,'manual');
 assert.deepEqual(makeCalendar('krynn').moons!.map(m=>m.cycleDays),[36,28,8]);assert.equal(makeCalendar('krynn').moons![2].visibility,'gm');
});
test('phases honor fractional cycles, named quarters, and dates before the reference',()=>{
 const c=makeCalendar('custom'),m=c.moons![0];m.anchor={...c.current,day:10};m.cycleDays=8;m.phase=0;
 for(const [delta,phase,name] of [[0,0,'New moon'],[2,.25,'First quarter'],[4,.5,'Full moon'],[6,.75,'Last quarter'],[-2,.75,'Last quarter'],[8,0,'New moon']] as const){const result=moonPhase(c,m,advanceDate(c,m.anchor,delta));close(result.phase,phase);assert.equal(result.name,name);}
 m.cycleDays=2.5;close(moonPhase(c,m,advanceDate(c,m.anchor,5)).phase,0);close(moonPhase(c,m,advanceDate(c,m.anchor,1)).phase,.4);
 m.mode='manual';m.phase=.375;assert.deepEqual(moonPhase(c,m,c.current),moonPhase(c,m,advanceDate(c,c.current,9000)));
});
test('moon clocks count intercalary festivals, leap days and year boundaries',()=>{
 const c=makeCalendar('harptos'),m=c.moons![0];m.anchor={year:1492,periodId:'flamerule',day:30};m.cycleDays=8;m.phase=0;
 close(moonPhase(c,m,{year:1492,periodId:'midsummer',day:1}).phase,.125);close(moonPhase(c,m,{year:1492,periodId:'shieldmeet',day:1}).phase,.25);close(moonPhase(c,m,{year:1492,periodId:'eleasis',day:1}).phase,.375);
 m.anchor={year:1492,periodId:'nightal',day:30};close(moonPhase(c,m,{year:1493,periodId:'hammer',day:1}).phase,.125);
 const fr=makeCalendar('harptos');close(moonPhase(fr,fr.moons![0],{year:1492,periodId:'hammer',day:1}).phase,.5);
 const grey=makeCalendar('greyhawk');for(const p of ['needfest','growfest','richfest','brewfest'])close(moonPhase(grey,grey.moons![1],{year:576,periodId:p,day:4}).phase,.5);
});
test('seasons wrap into January, change on exact boundaries, and include leap days',()=>{
 const c=makeCalendar('gregorian');for(const [periodId,day,season] of [['january',1,'Winter'],['february',29,'Winter'],['march',1,'Spring'],['may',31,'Spring'],['june',1,'Summer'],['september',1,'Autumn'],['december',1,'Winter']] as const)assert.equal(seasonOn(c,{year:2024,periodId,day})?.name,season);
 c.seasons!.reverse();assert.equal(seasonOn(c,{year:2024,periodId:'march',day:1})?.name,'Spring');
 const ex=makeCalendar('exandria');assert.equal(seasonOn(ex,{year:836,periodId:'dualahei',day:12})?.name,'Winter');assert.equal(seasonOn(ex,{year:836,periodId:'dualahei',day:13})?.name,'Spring');
 c.seasons=[];assert.equal(seasonOn(c,c.current),undefined);
});
test('almanac validation rejects invalid anchors, cycles, colors, IDs and season boundaries',()=>{
 const original=makeCalendar('gregorian');
 for(const mutate of [(c:typeof original)=>c.moons![0].cycleDays=0,(c:typeof original)=>c.moons![0].cycleDays=Infinity,(c:typeof original)=>c.moons![0].phase=1,(c:typeof original)=>c.moons![0].color='url(evil)',(c:typeof original)=>c.moons![0].anchor.periodId='missing',(c:typeof original)=>c.moons!.push(c.moons![0]),(c:typeof original)=>c.seasons!.push({...c.seasons![0],id:'new'}),(c:typeof original)=>{c.seasons![0].periodId='february';c.seasons![0].day=29;},(c:typeof original)=>c.periods=c.periods.filter(p=>p.id!=='march')]){const c=structuredClone(original);mutate(c);assert(!calendarSchema.safeParse(c).success);}
 const old=structuredClone(original);delete old.moons;delete old.seasons;delete old.almanacNotes;assert(calendarSchema.safeParse(old).success);const filled=withAlmanacDefaults(old);assert(filled.moons?.length);assert.equal(old.moons,undefined);
 const custom=structuredClone(old);custom.periods[0].id='renamed-id';custom.periods[0].name='Renamed month';custom.current.periodId='renamed-id';assert.throws(()=>withAlmanacDefaults(custom),/Template defaults need/);
});
test('player projection removes secret moon configuration and notes without mutating owner data',()=>{
 const c=makeCalendar('krynn'),m=c.moons![2];m.name='SECRET-MOON';m.notes='SECRET-NOTES';const p=publicCalendar(c);assert.equal(p.moons?.length,2);assert(!JSON.stringify(p).includes('SECRET-'));assert.equal(c.moons!.length,3);assert.deepEqual(p.seasons,c.seasons);
});
