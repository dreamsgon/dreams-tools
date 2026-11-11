import assert from 'node:assert/strict';
import {test} from 'node:test';
import {calendarSchema,yearDays,isLeap,periodDays,dateOrdinal,dateFromOrdinal,advanceDate,weekdayIndex,validDate,eventsOn,formatDate,MAX_YEAR} from '../../lib/encyclopedia/calendar-model.ts';
import {calendarTemplates,makeCalendar} from '../../lib/encyclopedia/calendar-templates.ts';
import {demoWorkspace,workspaceSchema,playerCampaign,campaignExport,importCopy,emptyWorkspace} from '../../lib/encyclopedia/world-model.ts';
import {callReadTool} from '../../lib/encyclopedia/mcp.ts';
test('all setting templates are valid, independent, and have documented year lengths',()=>{
 const expected:Record<string,number>={harptos:366,gregorian:365,krynn:336,tamriel:365,thedas:365,eberron:336,greyhawk:364,exandria:328,custom:360};
 for(const t of calendarTemplates){const c=makeCalendar(t.id),other=makeCalendar(t.id);calendarSchema.parse(c);assert.equal(yearDays(c,c.current.year),expected[t.id]);assert.notEqual(c.id,other.id);c.periods[0].name='Changed';assert.notEqual(other.periods[0].name,'Changed');assert.equal(c.visibility,'gm');}
 assert.match(formatDate(makeCalendar('thedas'),makeCalendar('thedas').current),/9:41 Dragon/);assert.match(formatDate(makeCalendar('tamriel'),makeCalendar('tamriel').current),/4E 201/);
});
test('Gregorian leap exceptions and weekday anchors match proleptic civil dates',()=>{
 const c=makeCalendar('gregorian');for(const [y,leap] of [[1900,false],[2000,true],[2024,true],[2100,false],[2400,true]] as const)assert.equal(isLeap(c,y),leap);
 for(const y of [1,4,100,400,1900,2000,2026,2100,99999])for(const month of [0,1,2,11]){const d={year:y,periodId:c.periods[month].id,day:1};const real=new Date(0);real.setUTCFullYear(y,month,1);real.setUTCHours(0,0,0,0);assert.equal(weekdayIndex(c,d),real.getUTCDay());}
 assert.deepEqual(advanceDate(c,{year:2000,periodId:'february',day:28},1),{year:2000,periodId:'february',day:29});assert.deepEqual(advanceDate(c,{year:1900,periodId:'february',day:28},1),{year:1900,periodId:'march',day:1});
});
test('Harptos handles festivals and leap-only Shieldmeet without advancing tendays',()=>{
 const c=makeCalendar('harptos');assert.deepEqual(advanceDate(c,{year:1492,periodId:'flamerule',day:30},1),{year:1492,periodId:'midsummer',day:1});assert.deepEqual(advanceDate(c,{year:1492,periodId:'midsummer',day:1},1),{year:1492,periodId:'shieldmeet',day:1});assert.deepEqual(advanceDate(c,{year:1493,periodId:'midsummer',day:1},1),{year:1493,periodId:'eleasis',day:1});assert.equal(weekdayIndex(c,{year:1492,periodId:'shieldmeet',day:1}),null);assert.equal(weekdayIndex(c,{year:1492,periodId:'eleasis',day:1}),0);assert.equal(yearDays(c,1493),365);
});
test('date arithmetic round trips across festivals, years and large advances',()=>{
 for(const t of calendarTemplates){const c=makeCalendar(t.id);for(const year of [1,4,100,400,836,1492,2026,MAX_YEAR])for(const p of c.periods){const count=periodDays(c,p,year);if(!count)continue;for(const day of [1,count]){const d={year,periodId:p.id,day};assert.deepEqual(dateFromOrdinal(c,dateOrdinal(c,d)),d);}}
 const next=advanceDate(c,c.current,100000);assert.deepEqual(advanceDate(c,next,-100000),c.current);assert.throws(()=>dateFromOrdinal(c,-1));assert.throws(()=>advanceDate(c,dateFromOrdinal(c,0),-1));}
});
test('custom leap offset and weekday exclusions agree with a day-by-day count',()=>{
 const c=makeCalendar('custom');c.moons=[];c.seasons=[];c.periods=[{id:'first',name:'First',days:3,kind:'month',outsideWeek:false},{id:'feast',name:'Feast',days:1,kind:'festival',outsideWeek:true}];c.leap={every:4,exceptEvery:8,includeEvery:16,offset:1,periodId:'first',extraDays:2};c.current={year:1,periodId:'first',day:1};c.firstWeekday=2;calendarSchema.parse(c);let ordinal=0,week=2;
 for(let year=1;year<=50;year++)for(const p of c.periods)for(let day=1;day<=periodDays(c,p,year);day++){const d={year,periodId:p.id,day};assert.equal(dateOrdinal(c,d),ordinal++);assert.equal(weekdayIndex(c,d),p.outsideWeek?null:week%c.weekdays.length);if(!p.outsideWeek)week++;}
});
test('calendar rules reject invalid dates, conflicting identifiers and destructive edits',()=>{
 const original=makeCalendar('gregorian');original.current={year:2024,periodId:'february',day:29};assert(calendarSchema.safeParse(original).success);
 const noLeap=structuredClone(original);noLeap.leap.every=0;assert(!calendarSchema.safeParse(noLeap).success);
 for(const mutate of [(c:typeof original)=>c.periods.push(c.periods[0]),(c:typeof original)=>c.weekdays.push(c.weekdays[0]),(c:typeof original)=>c.firstWeekday=19,(c:typeof original)=>c.leap.exceptEvery=7,(c:typeof original)=>c.leap.includeEvery=50,(c:typeof original)=>c.leap.offset=4,(c:typeof original)=>c.current.year=0]){const c=structuredClone(original);mutate(c);assert(!calendarSchema.safeParse(c).success);}
 const c=makeCalendar('custom');c.events=[{id:'festival',title:'Festival',notes:'',annual:false,visibility:'gm',date:{year:1,periodId:c.periods[0].id,day:30}}];c.periods[0].days=29;assert(!calendarSchema.safeParse(c).success);c.periods[0].days=30;c.periods[0].name='Renamed';calendarSchema.parse(c);assert.equal(eventsOn(c,{...c.current,day:30}).length,1);
});
test('annual leap-day events skip common years and one-off events stay in their year',()=>{
 const c=makeCalendar('gregorian');c.events=[{id:'annual',title:'Leap birthday',notes:'',visibility:'players',annual:true,date:{year:2024,periodId:'february',day:29}},{id:'once',title:'Once',notes:'',visibility:'gm',annual:false,date:{year:2024,periodId:'february',day:29}}];calendarSchema.parse(c);assert(!validDate(c,{year:2025,periodId:'february',day:29}));assert.equal(eventsOn(c,{year:2028,periodId:'february',day:29}).length,1);assert.equal(eventsOn(c,{year:2024,periodId:'february',day:29}).length,2);
});
test('calendar player projection excludes private calendars, notes and events and stays campaign scoped',()=>{
 const s=demoWorkspace(),c=makeCalendar('eberron');c.visibility='players';c.notes='PRIVATE-NOTES';c.events.push({id:'secret',title:'PRIVATE-EVENT',notes:'PRIVATE-NOTES',date:c.current,annual:false,visibility:'gm'});const secret=makeCalendar('harptos');secret.name='PRIVATE-CALENDAR';s.campaigns[0].calendars=[c,secret];s.campaigns[1].calendars=[makeCalendar('exandria')];
 const p=playerCampaign(s,s.campaigns[0].id);assert.equal(p.calendars.length,1);assert(!JSON.stringify(p).includes('PRIVATE-'));assert.equal(p.calendars[0].events.length,4);assert.equal(s.campaigns[0].calendars[0].notes,'PRIVATE-NOTES');c.visibility='gm';assert.equal(playerCampaign(s,s.campaigns[0].id).calendars.length,0);
});
test('calendars persist in workspace copies, campaign exports and read-only MCP',()=>{
 const s=demoWorkspace(),c=makeCalendar('harptos');c.events=[{id:'custom',title:'GM plan',notes:'Secret plan',date:c.current,visibility:'gm',annual:false}];s.campaigns[0].calendars=[c];s.campaigns[1].calendars=[makeCalendar('gregorian')];workspaceSchema.parse(s);const exported=campaignExport(s,s.campaigns[0].id),copy=importCopy(emptyWorkspace(),exported);assert.deepEqual(copy.campaigns[0].calendars,[c]);assert.equal(copy.campaigns.length,1);assert.notEqual(copy.campaigns[0].id,s.campaigns[0].id);const mcp=callReadTool(s,'read_campaign',{campaign_id:s.campaigns[0].id}) as typeof s;assert.deepEqual(mcp.campaigns[0].calendars,[c]);assert.equal(mcp.campaigns.length,1);const duplicate=structuredClone(s);duplicate.campaigns[0].calendars!.push(c);assert(!workspaceSchema.safeParse(duplicate).success);
});
