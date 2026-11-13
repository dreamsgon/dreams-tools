import test from 'node:test';
import assert from 'node:assert/strict';
import {frontPageSchema,defaultFrontPage,newWidget,resolveFrontPage} from '../lib/encyclopedia/front-page.ts';
import {workspaceSchema,playerCampaign,importCopy,emptyWorkspace} from '../lib/encyclopedia/world-model.ts';
import {hubOf,saveFrontPage,campaignSession,readBoth} from '../lib/campaigns-server.ts';

class Bucket {
 data=new Map();n=0;
 async get(key){const v=this.data.get(key);return v?{etag:v.etag,json:async()=>JSON.parse(v.text)}:null;}
 async head(key){return this.get(key);}
 async put(key,text,options={}){const old=this.data.get(key);if(options.onlyIf?.etagMatches&&old?.etag!==options.onlyIf.etagMatches)return null;if(options.onlyIf?.etagDoesNotMatch==='*'&&old)return null;const etag=String(++this.n);this.data.set(key,{text,etag});return {etag};}
 async delete(key){this.data.delete(key);}
}

const gh={repository:'',branch:'main'};
const T=n=>`2026-03-${String(n).padStart(2,'0')}T00:00:00.000Z`;
const entry=(id,o={})=>({id,worldId:'w1',campaignId:'e1',parentId:null,title:id,kind:'note',body:'',updatedAt:T(1),...o});
const char=(role)=>({role,group:'',tags:[],location:'',faction:'',status:'active',statsVisibility:'gm',statsByCampaign:{}});
const shown=[{id:'overview-tab',title:'Public',body:'',visibility:'players'}];
const calendar=(id,visibility)=>({id,name:'Cal '+id,era:'AE',yearPrefix:'',template:'',notes:'',
 periods:[{id:'p1',name:'Frostfall',days:30,kind:'month',outsideWeek:false}],weekdays:['Moonday','Sunday'],firstWeekday:0,
 leap:{every:0,exceptEvery:0,includeEvery:0,offset:0,periodId:'',extraDays:1},
 current:{year:1200,periodId:'p1',day:4},visibility,events:[]});
const build=(entries,campaign={})=>workspaceSchema.parse({schemaVersion:1,
 worlds:[{id:'w1',name:'Ashenwood',description:'',archived:false}],
 campaigns:[{id:'e1',worldId:'w1',name:'Sunless Citadel',description:'',github:gh,...campaign}],entries});

const ok=w=>assert.equal(frontPageSchema.safeParse({widgets:[w]}).success,true,JSON.stringify(w));
const bad=(widgets,msg)=>{const r=frontPageSchema.safeParse({widgets});assert.equal(r.success,false);if(msg)assert.match(r.error.issues.map(i=>i.message).join('|'),msg);};

test('schema accepts every widget type and newWidget output', () => {
  ok({id:'a',type:'next',when:'2026-05-01T19:00',where:'Discord'});
  ok({id:'a',type:'next',when:'',where:''});
  ok({id:'a',type:'date',calendarId:'c1'});
  ok({id:'a',type:'party'});
  ok({id:'a',type:'recap',wide:true});
  ok({id:'a',type:'text',title:'Hi',body:'Hello'});
  ok({id:'a',type:'links',links:[{label:'Wiki',url:'https://example.com/x'},{label:'Page',entryId:'p1'}]});
  for(const t of ['next','date','party','recap','text','links'])ok(newWidget(t,'w-'+t,[{id:'c1'}]));
  assert.equal(newWidget('date','d',[{id:'c9'}]).calendarId,'c9');
  assert.equal(newWidget('date','d').calendarId,'');
  assert.ok(frontPageSchema.safeParse(defaultFrontPage([{id:'c1',visibility:'players'}])).success);
});

test('schema rejects duplicate ids, bad links and an invalid date', () => {
  bad([{id:'a',type:'party'},{id:'a',type:'recap'}],/unique/);
  bad([{id:'a',type:'links',links:[{label:'x'}]}],/web address or a page/);
  bad([{id:'a',type:'links',links:[{label:'x',url:'https://a.com',entryId:'p1'}]}],/web address or a page/);
  bad([{id:'a',type:'links',links:[{label:'x',url:'javascript:alert(1)'}]}],/http/);
  bad([{id:'a',type:'links',links:[{label:'x',url:'ftp://a.com'}]}],/http/);
  bad([{id:'a',type:'next',when:'not a date',where:''}],/valid date/);
  bad([{id:'bad id!',type:'party'}]);
  bad([{id:'a',type:'nope'}]);
});

test('default page: used without a saved page, with a shared calendar only when one is shared', () => {
  assert.deepEqual(defaultFrontPage().widgets.map(w=>w.type),['next','party','recap','text']);
  assert.deepEqual(defaultFrontPage([{id:'a',visibility:'gm'},{id:'b',visibility:'players'}]).widgets.map(w=>w.type),['next','date','party','recap','text']);
  const w=build([],{calendars:[calendar('c1','players')]});
  const front=playerCampaign(w,'e1').frontPage;
  assert.equal(front.customised,false);
  assert.deepEqual(front.widgets.map(x=>x.type),['next','date','party','recap','text']);
  assert.equal(front.widgets[1].calendar,'Cal c1');
  assert.match(front.widgets[1].date,/Frostfall/);
  assert.equal(resolveFrontPage(undefined,{entries:[],calendars:[],clean:s=>s,sessionsNewestFirst:[]}).customised,false);
});

test('players only get safe content on the front page', () => {
  const w=build([
    entry('pc1',{kind:'character',title:'Aria',character:char('pc'),tabs:shown}),
    entry('pc2',{kind:'character',title:'Hidden PC',character:char('pc'),overviewVisibility:'gm'}),
    entry('pc3',{kind:'character',title:'Visible via overview',character:char('pc'),overviewVisibility:'players',body:'x'}),
    entry('npc1',{kind:'character',title:'Bartender',character:char('npc'),tabs:shown}),
    entry('s1',{kind:'session',title:'Session 1',updatedAt:T(2),overviewVisibility:'players',body:'Old recap'}),
    entry('s2',{kind:'session',title:'Session 2',updatedAt:T(5),overviewVisibility:'players',body:'# Heading\n\nThe party fled.\n\n:::secret\nThe butler did it.\n:::\n\nThen they rested.'}),
    entry('s3',{kind:'session',title:'Session 3 (GM only)',updatedAt:T(9),body:'Unshared'}),
    entry('lore',{title:'Public lore',tabs:shown}),
    entry('gmpage',{title:'GM page',body:'secret'}),
  ],{
    calendars:[calendar('shared','players'),calendar('private','gm')],
    frontPage:{widgets:[
      {id:'t',type:'text',body:'Welcome!\n\n:::secret\nTwist\n:::\n\nBring snacks.'},
      {id:'party',type:'party',title:'  Heroes  '},
      {id:'recap',type:'recap'},
      {id:'l',type:'links',links:[{label:'Lore',entryId:'lore'},{label:'Hidden',entryId:'gmpage'},{label:'Missing',entryId:'nope'},{label:'Web',url:'https://example.com'}]},
      {id:'d1',type:'date',calendarId:'shared'},
      {id:'d2',type:'date',calendarId:'private'},
      {id:'n',type:'next',when:'2026-05-01T19:00',where:'Online\n:::secret\nGM address\n:::'},
    ]},
  });
  const front=playerCampaign(w,'e1').frontPage;
  assert.equal(front.customised,true);
  const by=id=>front.widgets.find(x=>x.id===id);
  assert.equal(by('t').body.includes('Twist'),false);
  assert.match(by('t').body,/Welcome!/);
  assert.match(by('t').body,/Bring snacks/);
  assert.equal(by('t').title,'Text');
  assert.equal(by('party').title,'Heroes');
  assert.deepEqual(by('party').members.map(m=>m.id).sort(),['pc1','pc3']);
  assert.equal(by('recap').entryId,'s2','newest player-visible session');
  assert.equal(by('recap').heading,'Session 2');
  assert.equal(by('recap').excerpt.includes('butler'),false);
  assert.match(by('recap').excerpt,/The party fled\. Then they rested\./);
  assert.deepEqual(by('l').links,[{label:'Lore',entryId:'lore'},{label:'Web',url:'https://example.com'}]);
  assert.ok(by('d1'));
  assert.equal(by('d2'),undefined,'calendar not shared with players is dropped');
  assert.equal(by('n').where.includes('GM address'),false);
  assert.equal(JSON.stringify(front).includes('butler'),false);
  assert.equal(JSON.stringify(front).includes('Unshared'),false);
});

test('recap with no player-visible session is empty', () => {
  const w=build([entry('s3',{kind:'session',body:'Unshared'})],{frontPage:{widgets:[{id:'r',type:'recap'}]}});
  assert.deepEqual(playerCampaign(w,'e1').frontPage.widgets[0],{id:'r',type:'recap',title:'Last session',wide:false,entryId:null,heading:'',excerpt:''});
});

const mapWs=()=>({collections:[
 {id:'m1',name:'Sunless Citadel',kind:'campaign',parentId:null},
 {id:'f1',name:'Act 1',kind:'folder',parentId:'m1'},
 {id:'m2',name:'Solo',kind:'campaign',parentId:null}],
 scenes:[{id:'s-b',name:'Second',containerId:'m1'},{id:'s-a',name:'First',containerId:'f1'},{id:'s-x',name:'Other',containerId:'m2'}]});
const hubBook=(campaign={})=>build([
 ...[1,2,3,4,5,6].map(n=>entry('r'+n,{updatedAt:T(n)})),
 entry('folder',{kind:'folder',updatedAt:T(20)}),
 entry('gm-pc',{kind:'character',character:char('pc'),overviewVisibility:'gm',updatedAt:T(7)}),
 entry('npc',{kind:'character',character:char('npc'),updatedAt:T(8)}),
 entry('other',{campaignId:null,updatedAt:T(25)}),
],{maptableCampaignId:'m1',...campaign});

test('hubOf for a paired campaign', () => {
  const hub=hubOf({map:{workspace:mapWs()},book:{data:hubBook()}},'e:e1');
  assert.deepEqual(hub.scenes.map(({id,name})=>({id,name})),[{id:'s-a',name:'First'},{id:'s-b',name:'Second'}]);
  assert.deepEqual(hub.party.map(({id,title,role})=>({id,title,role})),[{id:'gm-pc',title:'gm-pc',role:'pc'}],'GM-only pcs are included');
  assert.deepEqual(hub.recent.map(r=>r.id),['npc','gm-pc','r6','r5','r4']);
  assert.equal(hub.recent.some(r=>r.kind==='folder'),false);
  assert.deepEqual(hub.frontConfig,defaultFrontPage([]));
  assert.equal(hub.front.customised,false);
  assert.deepEqual(hub.calendars,[]);
  assert.throws(()=>hubOf({map:null,book:{data:hubBook()}},'e:nope'),/Campaign not found/);
  assert.throws(()=>hubOf({map:null,book:{data:hubBook()}},'garbage'),/Campaign not found/);
});

test('hubOf uses the saved front page and lists calendars', () => {
  const fp={widgets:[{id:'t',type:'text',body:'Hi'}]};
  const hub=hubOf({map:null,book:{data:hubBook({frontPage:fp,calendars:[calendar('c1','players'),calendar('c2','gm')]})}},'e:e1');
  assert.deepEqual(hub.frontConfig,fp);
  assert.equal(hub.front.customised,true);
  assert.deepEqual(hub.scenes,[],'no Maptable data means no scenes');
  assert.deepEqual(hub.calendars,[{id:'c1',name:'Cal c1',shared:true},{id:'c2',name:'Cal c2',shared:false}]);
  const dflt=hubOf({map:null,book:{data:hubBook({calendars:[calendar('c1','players')]})}},'e:e1').frontConfig;
  assert.equal(dflt.widgets.find(w=>w.type==='date').calendarId,'c1');
});

test('hubOf for a Maptable-only campaign has no front page', () => {
  const hub=hubOf({map:{workspace:mapWs()},book:{data:hubBook()}},'m:m2');
  assert.equal(hub.front,null);
  assert.equal(hub.frontConfig,null);
  assert.deepEqual(hub.party,[]);
  assert.deepEqual(hub.recent,[]);
  assert.deepEqual(hub.scenes.map(({id,name})=>({id,name})),[{id:'s-x',name:'Other'}]);
  assert.deepEqual(hub.playerPages,[]);
});

test('importCopy remaps links widget page IDs and drops links to pages that were not imported', () => {
  const src=build([entry('pg1',{title:'One'}),entry('pg2',{title:'Two'})],{frontPage:{widgets:[
    {id:'l',type:'links',links:[{label:'A',entryId:'pg1'},{label:'Gone',entryId:'ghost'},{label:'Web',url:'https://example.com'},{label:'B',entryId:'pg2'}]},
    {id:'t',type:'text',body:'kept'}]}});
  const out=importCopy(emptyWorkspace(),src);
  const c=out.campaigns[0];
  assert.notEqual(c.id,'e1');
  const idOf=title=>out.entries.find(e=>e.title===title).id;
  const links=c.frontPage.widgets[0].links;
  assert.deepEqual(links,[{label:'A',entryId:idOf('One')},{label:'Web',url:'https://example.com'},{label:'B',entryId:idOf('Two')}]);
  assert.notEqual(idOf('One'),'pg1');
  assert.deepEqual(c.frontPage.widgets[1],{id:'t',type:'text',body:'kept'});
  assert.equal(importCopy(emptyWorkspace(),build([])).campaigns[0].frontPage,undefined);
});

async function setup(){
  const b=new Bucket(),s=campaignSession(b,'owner-1');
  const {saveWorkspace}=await import('../lib/workspace-storage.ts');
  const {initialWorkspace}=await import('../lib/model.ts');
  const w=initialWorkspace();w.collections=[{id:'m1',name:'Solo Map',kind:'campaign',parentId:null}];w.scenes[0].containerId='m1';
  await saveWorkspace(b,s.prefix,w,null);
  const book=build([],{});
  assert.equal(await s.book.save('owner-1',book,0),1);
  return {b,s};
}

test('saveFrontPage validates, refuses Maptable-only campaigns and saves valid pages', async () => {
  const {s}=await setup();
  await assert.rejects(()=>saveFrontPage(s,'e:e1',{widgets:[{id:'a',type:'links',links:[{label:'x',url:'javascript:alert(1)'}]}]}),/http:\/\/ or https:\/\//);
  await assert.rejects(()=>saveFrontPage(s,'e:e1',{widgets:[{id:'a',type:'party'},{id:'a',type:'party'}]}),/unique/);
  await assert.rejects(()=>saveFrontPage(s,'e:e1','nonsense'),/./);
  await assert.rejects(()=>saveFrontPage(s,'m:m1',{widgets:[]}),/Start Encyclopedia notes/);
  assert.equal((await s.book.read('owner-1')).data.campaigns[0].frontPage,undefined,'nothing saved on failure');
  const page={widgets:[{id:'t',type:'text',title:'Rules',body:'Be kind'}]};
  const hub=await saveFrontPage(s,'e:e1',page);
  assert.deepEqual(hub.frontConfig,page);
  assert.equal(hub.front.customised,true);
  assert.deepEqual((await s.book.read('owner-1')).data.campaigns[0].frontPage,page);
  assert.deepEqual(hubOf(await readBoth(s),'e:e1').frontConfig,page);
});
