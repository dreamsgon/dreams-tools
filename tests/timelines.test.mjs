import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSchema,demoWorkspace,playerCampaign,importCopy,campaignExport,searchableText} from '../lib/encyclopedia/world-model.ts';
import {newTimeline,readTimeline,restyle,eventDate,formatWhen,eraOf,timelineMarkdown,timelineSchema,playerSafeTimeline,timelinesNaming} from '../lib/encyclopedia/timelines.ts';
import {kindStarts} from '../lib/encyclopedia/entry-type.ts';
import {kindChangeLoses} from '../lib/encyclopedia/entry-kinds.ts';
import {buildBackup,planImport} from '../lib/campaign-backup.ts';
import {playersBook} from '../lib/mcp/players-only.ts';
import {rpExportFiles} from '../lib/encyclopedia/rp-export.ts';

const T='2026-11-01T00:00:00.000Z',W='demo-world',C='demo-campaign';
// A Krynn-like calendar: three months, year prefix none, era AC.
const krynn={id:'krynn',name:'Krynn reckoning',era:'AC',yearPrefix:'',template:'',notes:'',periods:[{id:'winter',name:'Winterhome',days:30,kind:'month',outsideWeek:false},{id:'spring',name:'Mishamont',days:30,kind:'month',outsideWeek:false},{id:'summer',name:'Corij',days:30,kind:'month',outsideWeek:false}],weekdays:['Gods','Mages'],firstWeekday:0,leap:{every:0,exceptEvery:0,includeEvery:0,offset:0,periodId:'',extraDays:1},current:{year:352,periodId:'spring',day:3},visibility:'players',events:[{id:'ev-fall',title:'Fall of Tarsis',notes:'',date:{year:352,periodId:'winter',day:12},annual:false,visibility:'players'},{id:'ev-yule',title:'Yule',notes:'',date:{year:1,periodId:'winter',day:1},annual:true,visibility:'players'},{id:'ev-secret',title:'Verminaard plots',notes:'',date:{year:351,periodId:'summer',day:2},annual:false,visibility:'gm'}]};
const ev=(id,title,extra={})=>({id,title,text:'',pageIds:[],visibility:'players',...extra});
const page=(id,title,kind,campaignId,extra={})=>({id,worldId:W,campaignId,parentId:null,title,kind,body:'',updatedAt:T,...extra});
const recap=(playedOn,date,extra={})=>({status:'published',timeline:[{id:'b1',title:'Dragons over Solace',big:true,steps:[]},{id:'b2',title:'A small thing',big:false,steps:[]}],quotes:[],gmNotes:'',review:date?[{id:'d1',kind:'date',name:'date',text:'',calendarId:'krynn',date,state:'done'}]:[],playedOn,shareTimeline:true,...extra});

function world(){
 const s=demoWorkspace();
 s.campaigns[0].calendars=[krynn];
 const history={...newTimeline('history'),visibility:'players',beforeSuffix:'PC',calendarId:'krynn',
  eras:[{id:'age-might',name:'Age of Might',start:-1000,end:0,color:'#b07a1f',text:'Istar rises.',visibility:'players'},{id:'age-despair',name:'Age of Despair',start:1,color:'#2f6fae',text:'',visibility:'players'},{id:'age-secret',name:'Hidden age',start:400,color:'#7a5bb0',text:'',visibility:'gm'}],
  events:[
   ev('e-cata','The Cataclysm',{when:{year:0},major:true,categoryId:'disaster',text:'The fiery mountain falls on [[demo-greyhaven|Istar]].',pageIds:['demo-greyhaven']}),
   ev('e-after','The gods are silent',{text:'No date: stays after the Cataclysm.'}),
   ev('e-war','War of the Lance',{when:{year:351,periodId:'summer'},end:{year:352,periodId:'spring'},categoryId:'war-battle',pageIds:['demo-mara','gm-page']}),
   ev('e-kingpriest','Kingpriest’s decree',{when:{year:-50},approx:true}),
   ev('e-gm','A GM secret',{when:{year:200},visibility:'gm',text:'::: secret\nhidden\n:::'}),
  ]};
 const life={...newTimeline('life',{focusId:'demo-mara'}),visibility:'players',events:[ev('l-born','Mara is born',{when:{year:320}})]};
 const chronicle={...newTimeline('campaign',{calendarId:'krynn'}),visibility:'players',events:[ev('c-meet','The party meets in the Inn',{sessionId:'s1'})]};
 s.entries.push(
  page('tl-history','History of Krynn','timeline',null,{timeline:history,overviewVisibility:'players'}),
  page('tl-life','Life of Mara','timeline',null,{timeline:life}),
  page('tl-chronicle','Our chronicle','timeline',C,{timeline:chronicle}),
  page('gm-page','A GM-only page','note',null),
  page('s1','Session 1','session',C,{overviewVisibility:'players',recap:recap('2026-01-05')}),
  page('s2','Session 2','session',C,{overviewVisibility:'players',recap:recap('2026-01-12',{year:352,periodId:'winter',day:20})}),
  page('s3','Session 3 (draft)','session',C,{overviewVisibility:'players',recap:recap('2026-01-19',undefined,{status:'draft'})}),
 );
 s.entries.find(e=>e.id==='demo-mara').overviewVisibility='players';
 s.entries.find(e=>e.id==='demo-greyhaven').overviewVisibility='players';
 return workspaceSchema.parse(s);
}
const campaign=s=>s.campaigns.find(c=>c.id===C);
const pagesOf=s=>s.entries.filter(e=>e.worldId===W&&(e.campaignId===null||e.campaignId===C));
const read=(s,id,filter)=>readTimeline(s.entries.find(e=>e.id===id),pagesOf(s),campaign(s),filter);

test('dates read the timeline’s way: calendar months, before-years and spans', () => {
 const t={beforeSuffix:'PC'};
 assert.equal(formatWhen({year:351,periodId:'spring',day:12},t,krynn),'12 Mishamont, 351 AC');
 assert.equal(formatWhen({year:351,periodId:'spring'},t,krynn),'Mishamont 351 AC');
 assert.equal(formatWhen({year:0},t,krynn),'1 PC','year 0 is the first year before');
 assert.equal(formatWhen({year:-499},t),'500 PC');
 assert.equal(formatWhen({year:-3},{}),'−3');
 assert.equal(formatWhen({year:12},{yearSuffix:'DR'}),'12 DR');
 assert.equal(eventDate({when:{year:351},end:{year:352}},{yearSuffix:'AC'}),'351–352 AC');
 assert.equal(eventDate({when:{year:-10},end:{year:-5},approx:true},{beforeSuffix:'PC'}),'c. 11–6 PC');
 assert.equal(eventDate({when:{year:-1},end:{year:5}},{beforeSuffix:'PC',yearSuffix:'AC'}),'2 PC – 5 AC');
 assert.equal(eventDate({when:{year:1},label:'Before the Sundering'},{}),'Before the Sundering');
 assert.equal(eventDate({},{}),'');
});

test('a timeline reads in order, undated events stay after the one before, eras hold their years', () => {
 const s=world(),v=read(s,'tl-history');
 assert.deepEqual(v.items.map(i=>i.title),['Kingpriest’s decree','The Cataclysm','The gods are silent','A GM secret','War of the Lance']);
 assert.equal(v.items[0].date,'c. 51 PC');
 assert.equal(v.items.find(i=>i.id==='e-war').date,'Corij 351 AC – Mishamont 352 AC');
 assert.equal(eraOf(v.eras,v.items[1].year).name,'Age of Might');
 assert.equal(eraOf(v.eras,v.items[2].year).name,'Age of Might','an undated event takes the year of the one before it');
 assert.equal(eraOf(v.eras,351).name,'Age of Despair');
 assert.equal(eraOf(v.eras,450).name,'Hidden age','the latest era that has started');
 assert.equal(v.now.date,'3 Mishamont, 352 AC');
 assert.ok(v.eras.every(e=>e.years));
 assert.equal(v.eras[0].years,'1001–1 PC');
});

test('a campaign chronicle gathers sessions (placed by in-world or played date) and calendar events, not yearly holidays', () => {
 const s=world(),v=read(s,'tl-chronicle');
 const titles=v.items.map(i=>i.title);
 assert.ok(!titles.includes('Yule'),'yearly holidays are not history');
 assert.ok(titles.includes('Verminaard plots'),'the GM sees GM-only calendar events');
 const s2=v.items.find(i=>i.id==='s2');
 assert.equal(s2.date,'20 Winterhome, 352 AC','the date the recap moved the calendar to');
 assert.deepEqual(s2.steps,['Dragons over Solace'],'big beats only');
 const order=titles.filter(t=>/Session|Fall of Tarsis|meets/.test(t));
 assert.deepEqual(order,['Fall of Tarsis','The party meets in the Inn','Session 1','Session 2','Session 3 (draft)'],'session 1 has no in-world date, so it goes just before session 2 (played after it); its event goes with it; session 3 just after');
 assert.equal(v.items.find(i=>i.id==='c-meet').sessionId,'s1');
});

test('a life timeline gathers events from other timelines that name its page', () => {
 const s=world(),v=read(s,'tl-life');
 assert.deepEqual(v.items.map(i=>i.title),['Mara is born','War of the Lance']);
 const war=v.items.find(i=>i.source==='linked');
 assert.equal(war.fromTitle,'History of Krynn');
 assert.equal(war.date,'Corij 351 AC – Mishamont 352 AC','dates read with the other timeline’s calendar');
 assert.deepEqual(timelinesNaming(pagesOf(s),'demo-mara').map(p=>p.id),['tl-history']);
});

test('players get only shared events and eras, readable pages, and gathered things they could see', () => {
 const s=world(),p=playerCampaign(s,C);
 const hist=p.entries.find(e=>e.id==='tl-history');
 assert.ok(hist.timeline);
 assert.ok(!hist.timeline.items.some(i=>i.title==='A GM secret'));
 assert.ok(!hist.timeline.eras.some(e=>e.name==='Hidden age'));
 assert.deepEqual(hist.timeline.items.find(i=>i.id==='e-war').pageIds,['demo-mara'],'a GM-only page is left out');
 assert.ok(!JSON.stringify(p).includes('hidden'),'GM text never reaches players');
 const chron=p.entries.find(e=>e.id==='tl-chronicle').timeline;
 assert.ok(!chron.items.some(i=>i.title==='Verminaard plots'),'GM-only calendar events stay hidden');
 assert.ok(!chron.items.some(i=>i.id==='s3'),'a draft recap never reaches players');
 assert.ok(chron.items.some(i=>i.id==='s1'));
 // A GM-only Timeline tab sends nothing, and the page is left out when nothing else on it is shared.
 const s2=world();s2.entries.find(e=>e.id==='tl-chronicle').timeline.visibility='gm';
 assert.equal(playerCampaign(s2,C).entries.find(e=>e.id==='tl-chronicle'),undefined);
 // A calendar players can't see: no calendar events, no month names, no Today.
 const s3=world();s3.campaigns[0].calendars[0].visibility='gm';
 const c3=playerCampaign(s3,C).entries.find(e=>e.id==='tl-chronicle').timeline;
 assert.ok(!c3.items.some(i=>i.source==='calendar'));
 assert.equal(c3.now,undefined);
 assert.equal(playerCampaign(s3,C).entries.find(e=>e.id==='tl-history').timeline.items.find(i=>i.id==='e-war').date,'351 – 352','without the calendar, years only');
});

test('the stored timeline is checked: kind, scope, sessions and dates', () => {
 const bad=(mut,msg)=>{const s=world();mut(s);const r=workspaceSchema.safeParse(s);assert.ok(!r.success,msg);};
 bad(s=>{s.entries.find(e=>e.id==='demo-mara').timeline=newTimeline();},'a timeline needs a timeline page');
 bad(s=>{s.entries.find(e=>e.id==='tl-history').timeline.events[0].pageIds=['demo-winter'];},'shared lore cannot point into one campaign');
 bad(s=>{s.entries.find(e=>e.id==='tl-chronicle').timeline.events[0].sessionId='demo-mara';},'a session must be a session page');
 assert.ok(!timelineSchema.safeParse({...newTimeline(),eras:[{id:'a',name:'A',start:5,end:2,color:'#000000',text:'',visibility:'gm'}]}).success,'an era cannot end before it starts');
 assert.ok(!timelineSchema.safeParse({...newTimeline(),events:[ev('x','X',{end:{year:3}})]}).success,'an end needs a start');
});

test('new timeline pages, styles and changing type', () => {
 assert.equal(kindStarts('timeline',undefined,'X').timeline.style,'history');
 const c=newTimeline('campaign',{calendarId:'krynn'});
 assert.equal(c.showSessions,true);assert.equal(c.showCalendar,true);
 const r=restyle(newTimeline('history'),'life');
 assert.equal(r.style,'life');assert.ok(r.categories.some(x=>x.name==='Family')&&r.categories.some(x=>x.name==='War & battle'));
 assert.deepEqual(kindChangeLoses({kind:'timeline',timeline:newTimeline()},'note'),['the timeline\'s events and eras']);
 const s=world();assert.match(searchableText(s.entries.find(e=>e.id==='tl-history')),/Cataclysm.*Age of Might|Age of Might.*Cataclysm/s);
});

test('import, campaign backup and duplicate keep timelines pointing at the copies', () => {
 const s=world();
 // JSON import (Export & import of a campaign): every id is new.
 const exp=campaignExport(s,C),copy=importCopy({schemaVersion:1,worlds:[],campaigns:[],entries:[]},exp);
 const map=new Map(exp.entries.map(e=>[e.title,copy.entries.find(x=>x.title===e.title)]));
 const hist=map.get('History of Krynn').timeline,mara=map.get('Mara Venn').id;
 assert.ok(hist.events.find(e=>e.title==='War of the Lance').pageIds.includes(mara));
 assert.match(hist.events.find(e=>e.title==='The Cataclysm').text,new RegExp(`\\[\\[${map.get('Greyhaven').id}\\|Istar\\]\\]`));
 assert.equal(map.get('Life of Mara').timeline.focusId,mara);
 assert.equal(map.get('Our chronicle').timeline.events[0].sessionId,map.get('Session 1').id);
 // Campaign backup with its world copied (Duplicate campaign uses the same plan).
 const backup=buildBackup({name:'Salt Road',now:T,map:null,maptableId:null,book:s,encyclopediaId:C,tables:null,members:null,dashboard:null});
 let n=0;const plan=planImport(backup,{map:null,book:s,tables:{tables:[]}},()=>`new-${++n}`,{name:'Salt Road B',copyWorld:true});
 const nc=plan.book.campaigns.at(-1),mine=plan.book.entries.filter(e=>e.worldId===nc.worldId);
 const by=t=>mine.find(e=>e.title===t);
 assert.equal(by('Our chronicle').timeline.events[0].sessionId,by('Session 1').id);
 assert.equal(by('Life of Mara').timeline.focusId,by('Mara Venn').id);
 assert.ok(by('History of Krynn').timeline.events.find(e=>e.title==='War of the Lance').pageIds.includes(by('Mara Venn').id));
 assert.equal(by('Our chronicle').timeline.calendarId,'krynn','calendar ids are per campaign and copied with it');
 assert.ok(nc.calendars.some(c=>c.id==='krynn'));
 assert.ok(workspaceSchema.safeParse(plan.book).success);
 // Duplicate sharing the world: the chronicle is copied, shared lore isn't.
 const shared=planImport(backup,{map:null,book:s,tables:{tables:[]}},()=>`dup-${++n}`,{name:'Salt Road C'});
 const sc=shared.book.campaigns.at(-1),chron=shared.book.entries.find(e=>e.campaignId===sc.id&&e.kind==='timeline');
 assert.equal(chron.timeline.events[0].sessionId,shared.book.entries.find(e=>e.campaignId===sc.id&&e.title==='Session 1').id);
 assert.equal(shared.book.entries.filter(e=>e.title==='History of Krynn').length,1);
});

test('a players-only AI reads only shared events of shared timelines', () => {
 const s=world();s.entries.find(e=>e.id==='tl-life').timeline.visibility='gm';
 const book=playersBook(s,C);
 const h=book.entries.find(e=>e.id==='tl-history');
 assert.ok(!h.timeline.events.some(e=>e.visibility==='gm'));
 assert.ok(!h.timeline.eras.some(e=>e.visibility==='gm'));
 assert.equal(book.entries.find(e=>e.id==='tl-life'),undefined,'a GM-only timeline with nothing else shared is left out');
 assert.equal(playerSafeTimeline(undefined,x=>x),undefined);
});

test('the RP export writes timelines: players’ copy in the page, everything in the GM twin', () => {
 const s=world(),files=rpExportFiles(s,C,{includeGm:true,exportedAt:T});
 const pub=files.find(f=>f.path==='2-Story/Timelines/Our-chronicle.md'||/2-Story\/Timelines\/.*chronicle/i.test(f.path)&&!f.path.startsWith('6-GM-Only'));
 assert.ok(pub,'timeline pages go in 2-Story/Timelines');
 assert.match(pub.text,/## Timeline/);
 assert.doesNotMatch(pub.text,/Verminaard/);
 const gm=files.find(f=>f.path==='6-GM-Only/'+pub.path);
 assert.ok(gm);assert.match(gm.text,/Verminaard plots/);
 const hist=files.find(f=>/Timelines\/History/.test(f.path)&&!f.path.startsWith('6-GM-Only'));
 assert.match(hist.text,/Age of Might/);assert.doesNotMatch(hist.text,/A GM secret/);
 const md=timelineMarkdown(read(s,'tl-history'),id=>`[[${id}]]`);
 assert.match(md,/## Age of Might \(1001–1 PC\)/);
 assert.match(md,/\*\*1 PC\*\*: \*\*The Cataclysm\*\*/);
});
