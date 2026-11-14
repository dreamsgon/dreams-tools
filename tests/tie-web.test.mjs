import test from 'node:test';
import assert from 'node:assert/strict';
import {demoWorkspace,defaultCharacter,playerCampaign} from '../lib/encyclopedia/world-model.ts';
import {defaultOrg} from '../lib/encyclopedia/org-profile.ts';
import {defaultProfile} from '../lib/encyclopedia/character-profile.ts';
import {buildWeb,filterWeb,focusWeb,layoutWeb,playersWebTies,radialLayout,webKindOf,webTieLabel,webTies} from '../lib/encyclopedia/tie-web.ts';
import {placeFromQuery,placeQuery} from '../lib/encyclopedia/place.ts';
import {encyclopediaTitle} from '../lib/page-title.ts';

const C='demo-campaign',W='demo-world',T='2026-11-14T10:00:00.000Z';
const page=(id,title,kind,extra={})=>({id,worldId:W,campaignId:C,parentId:null,title,kind,body:'',updatedAt:T,overviewVisibility:'players',...extra});
const char=(id,title,extra={})=>page(id,title,'character',{character:defaultCharacter(),...extra});
const tie=(id,toId,typeId,extra={})=>({id,toId,typeId,...extra});

function world(){
 const s=demoWorkspace(),org=defaultOrg();
 org.blocks=org.blocks.map(b=>b.kind==='members'?{...b,members:[{id:'m1',entryId:'wren',role:'Lamplighter'}]}:b);
 s.entries.push(
  char('aldric','Aldric Vane',{ties:[tie('t1','wren','parent'),tie('t3','mira','partner')]}),
  char('mira','Mira Vane',{ties:[tie('t4','wren','parent'),tie('t5','aldric','debt',{gm:true,note:'Her dowry',cover:{typeId:'employs',reversed:true,note:'He works her ferry'}})]}),
  char('sorrel','Sorrel Ashe',{ties:[tie('t6','mira','rival',{gm:true})],profile:{...defaultProfile(),visibility:'gm',blocks:[{id:'b1',kind:'ties',title:'People',column:'right',ties:[{id:'p1',entryId:'wren',typeId:'mentor'}]}]}}),
  char('wren','Wren Vane'),
  char('secret','The Quiet Buyer',{overviewVisibility:'gm',ties:[tie('t7','aldric','blackmail')]}),
  page('port','Saltmere Quay','place'),
  page('gull','The Gull','vehicle',{ties:[tie('t8','port','based')]}),
  page('wardens','The Lantern Wardens','faction',{org}),
  page('blade','The Ember Blade','lore',{campaignId:null}),
  {...page('elsewhere','Far Shore','place'),campaignId:'demo-campaign-two'},
 );
 s.entries.find(e=>e.id==='aldric').ties.push(tie('t9','blade','carries'));
 return s;
}

test('the web holds every tie in the campaign, one line per pair of pages', () => {
 const s=world(),ties=webTies(s,W,C);
 assert.equal(ties.filter(t=>t.source==='tie').length,8);
 assert.equal(ties.filter(t=>t.source==='profile').length,1);
 const web=buildWeb(s,ties);
 const pair=web.edges.find(e=>e.key===['aldric','mira'].sort().join('|'));
 assert.deepEqual(pair.ties.map(t=>t.name).sort(),['Married to','Owes a debt to']);
 const debt=pair.ties.find(t=>t.name==='Owes a debt to');
 assert.equal(webTieLabel(debt,'aldric'),'Is owed by');
 assert.equal(debt.gm,true);
 assert.deepEqual(debt.cover,{name:'Employs',reverse:'Works for',group:'dealings',reversed:true,note:'He works her ferry'});
 assert.equal(web.nodes[0].id,'aldric','the most connected page comes first');
 assert.ok(!web.nodes.some(n=>n.id==='wardens'),'a page with no ties is left out');
 assert.equal(webKindOf('map'),'place');assert.equal(webKindOf('session'),'other');
 // The world's shared lore alone, with no campaign.
 assert.deepEqual(webTies(s,W,null),[]);
});

test('members and crew can be drawn as worked-out lines', () => {
 const s=world(),ties=webTies(s,W,C,{worked:true}).filter(t=>t.source==='worked');
 assert.deepEqual(ties.map(t=>[t.fromId,t.name,t.toId,t.note]),[['wren','Member of','wardens','Lamplighter']]);
 assert.equal(ties[0].group,'worked');
});

test('filters keep the chosen groups and kinds of page, and focus keeps the pages near one', () => {
 const s=world(),web=buildWeb(s,webTies(s,W,C));
 const family=filterWeb(web,new Set(['family']),new Set(['character','faction','place','lore','vehicle','quest','other']));
 assert.deepEqual(family.nodes.map(n=>n.id).sort(),['aldric','mira','wren']);
 assert.ok(family.edges.every(e=>e.ties.every(t=>t.group==='family')));
 const noPlaces=filterWeb(web,new Set(['family','heart','conflict','allegiance','guidance','dealings','belonging','other']),new Set(['character','faction','lore','vehicle','quest','other']));
 assert.ok(!noPlaces.nodes.some(n=>n.id==='port'));
 assert.ok(!noPlaces.nodes.some(n=>n.id==='gull'),'a vehicle tied only to a place goes too');
 const near=focusWeb(web,'wren',1);
 assert.deepEqual(near.nodes.map(n=>n.id).sort(),['aldric','mira','sorrel','wren']);
 assert.ok(near.edges.some(e=>e.key==='aldric|mira'),'lines between the pages around it stay');
 const far=focusWeb(web,'wren',2);
 assert.ok(far.nodes.some(n=>n.id==='secret')&&far.nodes.some(n=>n.id==='blade'));
 assert.ok(!far.nodes.some(n=>n.id==='port'));
});

test('players see shared ties and cover stories between pages they can read', () => {
 const s=world(),readable=new Set(playerCampaign(s,C).entries.map(e=>e.id));
 const shared=id=>s.entries.find(e=>e.id===id)?.profile?.visibility==='players';
 const ties=playersWebTies(webTies(s,W,C),id=>readable.has(id),shared);
 assert.ok(!ties.some(t=>t.gm));
 assert.ok(!ties.some(t=>t.name==='Rival of'),'a GM-only tie with no cover is gone');
 assert.ok(!ties.some(t=>t.fromId==='secret'||t.toId==='secret'),'as is a tie to a page players cannot read');
 assert.ok(!ties.some(t=>t.source==='profile'),'and a People tie on a Profile that is not shared');
 const cover=ties.find(t=>t.name==='Employs');
 assert.deepEqual([cover.fromId,cover.toId,cover.note],['aldric','mira','He works her ferry'],'a reversed cover reads from the other end');
 assert.ok(!JSON.stringify(ties).includes('dowry'));
});

test('the layout is the same every time and spreads pages apart', () => {
 const s=world(),web=buildWeb(s,webTies(s,W,C));
 const a=layoutWeb(web,600),b=layoutWeb(web,600);
 assert.deepEqual([...a],[...b]);
 const ps=[...a.values()];
 for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++)assert.ok(Math.hypot(ps[i].x-ps[j].x,ps[i].y-ps[j].y)>20,'no two pages sit on each other');
 const r=radialLayout(focusWeb(web,'wren',2),'wren',1000);
 assert.deepEqual(r.get('wren'),{x:0,y:0});
 assert.ok(Math.hypot(r.get('aldric').x,r.get('aldric').y)<Math.hypot(r.get('secret').x,r.get('secret').y),'pages one step out sit inside pages two steps out');
 assert.equal(layoutWeb({nodes:[],edges:[]}).size,0);
});

test('Relationships has its own place in the address and the tab title', () => {
 const s=world();
 const q=placeQuery({worldId:W,campaignId:C,view:'relationships',entryId:null});
 assert.match(q,/view=relationships/);
 assert.equal(placeFromQuery(new URLSearchParams(q),s).view,'relationships');
 assert.equal(placeFromQuery(new URLSearchParams(`world=${W}&view=relationships`),s).view,'relationships','a world without a campaign has one too');
 assert.match(encyclopediaTitle({view:'relationships',campaign:'The Salt Road'}),/^Relationships/);
});
