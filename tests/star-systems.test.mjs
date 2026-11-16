import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSchema,demoWorkspace,playerCampaign,searchableText,importCopy} from '../lib/encyclopedia/world-model.ts';
import {presetGalaxy,galaxySchema,newDrive} from '../lib/encyclopedia/galaxies.ts';
import {localBubble,laneHexes,generateSector} from '../lib/encyclopedia/sectors.ts';
import {starSystemSchema,survey,solSystem,newStarSystem,defaultOptions,zones,zoneOf,temperatureAt,yearLength,travelInSystem,travelBetweenStars,formatDuration,allWorlds,editWorld,removeWorld,rerollWorld,addWorldOutside,rerollHook,worldLine,worldSummary,remapSystem,findWorld,isGiant} from '../lib/encyclopedia/star-systems.ts';
import {defaultTab} from '../lib/encyclopedia/place.ts';

const C='demo-campaign',T='2026-11-16T10:00:00.000Z';
const page=(id,title,kind,extra={})=>({id,worldId:'demo-world',campaignId:C,parentId:null,title,kind,body:'',updatedAt:T,...extra});
const input=(extra={})=>({name:'Kel',star:'G',companions:[],premise:'',options:defaultOptions(),backdrop:'nebula',seed:'kel',...extra});

test('zones, temperatures, years and travel follow the real rules of thumb', () => {
  const z=zones({star:'G',companions:[]});
  assert.equal(z.hzIn,0.95);assert.equal(z.hzOut,1.37);assert.equal(z.frost,2.7);
  assert.equal(zoneOf(1,z),'Green');assert.equal(zoneOf(0.4,z),'Scorch');assert.equal(zoneOf(5.2,z),'Frost');assert.equal(zoneOf(40,z),'Dark');
  assert.equal(temperatureAt(1,1,'standard'),38,'Earth comes out a little warm, as the simple formula does');
  assert.equal(temperatureAt(1,1,'none'),5);
  assert.equal(yearLength(1,'G'),'365 days');
  assert.equal(yearLength(5.2,'G'),'11.9 years');
  assert.ok(zones({star:'M',companions:[]}).hzOut<0.25,'a red dwarf keeps its green zone close');
  assert.ok(zones({star:'G',companions:[{star:'G',separation:'close'}]}).L===2,'a close companion adds its light');
  assert.equal(travelInSystem(1,5.2,'light','G').time,'35 min');
  assert.equal(travelInSystem(1,5.2,'torch','G').time,'5.9 days');
  assert.equal(travelInSystem(1,1.52,'transfer','G').time,'258 days','Earth to Mars the cheap way');
  assert.equal(formatDuration(30),'30 s');
});

test('travel between stars with each kind of FTL drive', () => {
  const jump={...newDrive(1),range:12,jumpHours:6,recharge:20},speed={...newDrive(2),mode:'speed',speed:1000,name:'Warp'},lanes={...newDrive(3),mode:'lanes',laneDays:2,name:'Lanes'};
  const rows=travelBetweenStars(30,[jump,speed,lanes],{hexes:6});
  assert.deepEqual(rows.map(r=>r.name),['Light speed','Jump drive','Warp','Lanes']);
  assert.equal(rows[0].time,'30 years');
  assert.equal(rows[1].time,'3 jumps · 2.4 days','3 jumps of 6 hours with 2 recharges of 20 hours: 58 hours');
  assert.equal(rows[2].time,'11 days');
  assert.equal(rows[3].time,'12 days');
  assert.equal(travelBetweenStars(30,[lanes],null)[1].time,'No lane');
  assert.equal(travelInSystem(1,30,'ftl:drive1','G',[jump]).time,'4.0 hours','a jump drive needs open space, so in a system it is light speed');
  assert.equal(travelInSystem(1,30,'ftl:drive2','G',[{...speed,start:'anywhere'}]).time,'14 s');
  assert.equal(galaxySchema.safeParse({...presetGalaxy('milky'),drives:[jump,jump]}).success,false,'drive ids are unique');
  assert.equal(galaxySchema.safeParse({...presetGalaxy('milky'),drives:[jump,speed]}).success,true);
});

test('a survey is valid, repeatable and laid out like a real system', () => {
  for(const star of ['O','B','A','F','G','K','M']){
    const s=survey(input({star})),again=survey(input({star}));
    assert.deepEqual(s,again,`${star}: the same input gives the same system`);
    assert.equal(starSystemSchema.safeParse(s).success,true,star);
    assert.equal(s.bodies.length,6);
    const z=zones(s);
    for(let i=1;i<s.bodies.length;i++)assert.ok(s.bodies[i].au>s.bodies[i-1].au,`${star}: worlds go outwards`);
    assert.ok(s.bodies.some(b=>zoneOf(b.au,z)==='Green'),`${star}: a green-zone world when asked`);
    for(const w of allWorlds(s)){
      if(isGiant(w.kind))assert.ok(zoneOf(w.au,z)!=='Green'&&zoneOf(w.au,z)!=='Scorch',`${star}: giants form past the frost line`);
      if(w.life==='complex'||w.life==='sapient')assert.ok(w.air!=='none'&&w.temp>-20&&w.temp<80,`${star}: ${w.name} has complex life at ${w.temp} °C`);
      if(w.air==='none')assert.ok(!['ocean','abundant','some'].includes(w.water),`${star}: no open water without air`);
    }
    if(star==='O'||star==='B')assert.ok(allWorlds(s).every(w=>!['complex','sapient','simple'].includes(w.life)),'young stars burn out before life gets far');
    assert.deepEqual(s.hooks.map(h=>h.kind),['lure','danger','secret']);
  }
  assert.equal(survey(input({options:{...defaultOptions(),naming:'letters'}})).bodies[0].name,'Kel b');
  assert.equal(survey(input()).bodies[1].name,'Kel-II');
  assert.equal(survey(input({options:{...defaultOptions(),giants:'none'}})).bodies.some(b=>isGiant(b.kind)),false);
  assert.equal(survey(input({options:{...defaultOptions(),moons:'none'}})).bodies.every(b=>!b.moons.length),true);
  assert.notDeepEqual(survey(input({seed:'other'})).bodies,survey(input()).bodies);
});

test('pulp science is kinder to life than realistic science', () => {
  const count=science=>Array.from({length:12},(_,i)=>survey(input({seed:`s${i}`,star:'K',options:{...defaultOptions(),science}}))).flatMap(allWorlds).filter(w=>w.life!=='none').length;
  assert.ok(count('pulp')>count('realistic'));
});

test('running the survey again keeps locked worlds and hooks', () => {
  const first=survey(input()),mine={...first.bodies[2],name:'Corira',locked:true,note:'Ours.'};
  const locked={...first,bodies:first.bodies.map(b=>b.id===mine.id?mine:b),hooks:first.hooks.map(h=>h.kind==='secret'?{...h,text:'Mine.',locked:true}:h)};
  const again=survey(input({seed:'new seed'}),locked);
  assert.deepEqual(again.bodies.find(b=>b.id===mine.id),mine);
  assert.equal(again.bodies.length,6,'the kept world counts towards the total');
  assert.equal(again.hooks.find(h=>h.kind==='secret').text,'Mine.');
  for(const b of again.bodies)if(b.id!==mine.id)assert.ok(Math.abs(Math.log(b.au/mine.au))>=0.1,'new worlds keep their distance from it');
  assert.equal(starSystemSchema.safeParse(again).success,true);
});

test('editing worlds: fields are marked, air changes the temperature, reroll and remove', () => {
  const s=survey(input()),w=s.bodies.find(b=>!isGiant(b.kind)&&b.air!=='crushing');
  const e=editWorld(s,w.id,{air:'crushing'}),after=findWorld(e,w.id);
  assert.deepEqual(after.edited,['air']);
  assert.ok(after.temp>w.temp+300,'a crushing atmosphere cooks the surface');
  assert.equal(findWorld(editWorld(s,w.id,{note:'Hello'}),w.id).edited,undefined,'notes are not survey edits');
  const r=rerollWorld({...s,bodies:s.bodies.map(b=>b.id===w.id?{...b,note:'keep'}:b)},w.id,'x');
  assert.equal(findWorld(r,w.id).note,'keep');assert.equal(findWorld(r,w.id).au,w.au);assert.equal(findWorld(r,w.id).name,w.name);
  const withMoon=s.bodies.find(b=>b.moons.length),moon=withMoon.moons[0];
  assert.equal(findWorld(removeWorld(s,moon.id),moon.id),undefined);
  assert.equal(removeWorld(s,withMoon.id).bodies.length,5);
  const added=addWorldOutside(s,'Kel','y');assert.equal(added.bodies.length,7);assert.ok(added.bodies[6].au>s.bodies[5].au);
  assert.equal(starSystemSchema.safeParse(added).success,true);
  const h=rerollHook(s,'lure','Kel','The Guild','z');assert.equal(h.hooks.length,3);assert.equal(starSystemSchema.safeParse(h).success,true);
  assert.match(worldSummary(s,w,'Kel'),/zone of Kel/);
  assert.ok(worldLine(w).endsWith('.'));
});

test('Sol from real data', () => {
  const sol=solSystem();
  assert.equal(starSystemSchema.safeParse(sol).success,true);
  assert.equal(sol.real,true);
  assert.deepEqual(sol.bodies.map(b=>b.name),['Mercury','Venus','Earth','Mars','Jupiter','Saturn','Uranus','Neptune']);
  const earth=sol.bodies[2];assert.equal(earth.life,'sapient');assert.equal(zoneOf(earth.au,zones(sol)),'Green');
  assert.ok(sol.bodies.find(b=>b.name==='Saturn').rings);
  assert.ok(allWorlds(sol).some(w=>w.name==='Europa'&&w.water==='under-ice'));
});

test('bad systems are refused', () => {
  const s=survey(input());
  assert.equal(starSystemSchema.safeParse({...s,bodies:[...s.bodies,s.bodies[0]]}).success,false,'two worlds with one id');
  assert.equal(starSystemSchema.safeParse({...s,companions:[{star:'M',separation:'wide'},{star:'M',separation:'wide'},{star:'M',separation:'wide'}]}).success,false);
  assert.equal(starSystemSchema.safeParse({...s,bodies:s.bodies.map((b,i)=>i<2?{...b,pageId:'same'}:b)}).success,false,'one page per world');
  assert.equal(starSystemSchema.safeParse({...s,star:'X'}).success,false);
});

test('a sector lane path counts hexes', () => {
  const sys=(id,c,r)=>({id,c,r,name:id,star:'G',status:'charted',note:''});
  const s={...generateSector({cols:12,rows:7,count:0,seed:'x',lanes:false,rumours:0,x:.5,y:.5,color:'#fff',backdrop:'deep'}),systems:[sys('a',0,0),sys('b',3,0),sys('c',6,0)],lanes:[{a:'a',b:'b'},{a:'b',b:'c'}]};
  assert.equal(laneHexes(s,'a','c'),6);
  assert.equal(laneHexes({...s,lanes:[]},'a','c'),null);
});

test('a star system page inside a sector saves, searches, copies and stays away from players', () => {
  const s=demoWorkspace();
  s.entries.push(page('mw','Milky Way','galaxy',{galaxy:{...presetGalaxy('milky'),drives:[newDrive(1)]}}));
  const bubble=localBubble({x:.6,y:.6,color:'#7fdc9a'}),solHex=bubble.systems.find(x=>x.name==='Sol');
  s.entries.push({...page('lb','Local Bubble','sector',{sector:{...bubble,systems:bubble.systems.map(x=>x.id===solHex.id?{...x,pageId:'sol'}:x)}}),parentId:'mw'});
  s.entries.push(page('guild','The Guild','faction'));
  const sol=solSystem();sol.bodies[3]={...sol.bodies[3],holderId:'guild',note:'The red frontier.'};
  s.entries.push({...page('sol','Sol','system',{starSystem:{...sol,sector:{pageId:'lb',systemId:solHex.id},options:{...sol.options,holders:['guild']}},overviewVisibility:'players',body:'Home.'}),parentId:'lb'});
  s.entries.push(page('kel','Kel','system',{starSystem:newStarSystem('Kel')}));
  const r=workspaceSchema.safeParse(s);assert.equal(r.success,true,JSON.stringify(r.error?.issues?.slice(0,2)));
  assert.match(searchableText(s.entries.find(e=>e.id==='sol')),/red frontier/);
  assert.equal(defaultTab('system'),'chart');
  const view=playerCampaign(s,C),solView=view.entries.find(e=>e.id==='sol');
  assert.ok(solView);assert.equal('starSystem' in solView,false);
  assert.doesNotMatch(JSON.stringify(view),/red frontier|Europa/);
  const copy=importCopy(demoWorkspace(),s),copied=copy.entries.find(e=>e.title==='Sol'),lb=copy.entries.find(e=>e.title==='Local Bubble'),guild=copy.entries.find(e=>e.title==='The Guild');
  assert.equal(copied.starSystem.sector.pageId,lb.id,'the link to the sector follows the copy');
  assert.equal(copied.starSystem.bodies[3].holderId,guild.id);
  assert.deepEqual(copied.starSystem.options.holders,[guild.id]);
  assert.equal(lb.sector.systems.find(x=>x.name==='Sol').pageId,copied.id);
  assert.equal(workspaceSchema.safeParse(copy).success,true);
  const wrongKind=demoWorkspace();wrongKind.entries.push(page('n','Note','note',{starSystem:newStarSystem('x')}));
  assert.equal(workspaceSchema.safeParse(wrongKind).success,false);
  const badHolder=demoWorkspace();badHolder.entries.push(page('p','A place','place'),page('k','Kel','system',{starSystem:{...newStarSystem('Kel'),options:{...defaultOptions(),holders:['p']}}}));
  assert.equal(workspaceSchema.safeParse(badHolder).success,false,'only organizations hold worlds');
  assert.deepEqual(remapSystem(newStarSystem('Kel'),()=>undefined),newStarSystem('Kel'));
});
