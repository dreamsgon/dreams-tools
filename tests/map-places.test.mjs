import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSchema,playerCampaign} from '../lib/encyclopedia/world-model.ts';
import {newMap,mapSchema} from '../lib/encyclopedia/map-model.ts';
import {mapThings,placeCard,linkedCount,linkThing,leadText,secretBlocks} from '../lib/encyclopedia/map-places.ts';

const now='2026-11-13T12:00:00.000Z';
const settle={id:'t1',name:'Settlement',kind:'place',updatedAt:now,overviewVisibility:'players',body:'',tabs:[],
 fields:[{id:'f1',label:'People',type:'number',visibility:'players'},{id:'f2',label:'Who really runs it',type:'text',visibility:'gm'}]};
const entry=(id,o={})=>({id,worldId:'w1',campaignId:null,parentId:null,title:id,kind:'place',body:'',updatedAt:now,...o});
const map=mapSchema.parse({...newMap('region','island','coast',12,8),visibility:'players',
 pins:[{id:'p1',title:'Greyfen',kind:'town',x:.5,y:.5,notes:'Smells of eel smoke.',entryId:'greyfen',visibility:'players',areaMapId:'docks-map'},{id:'p2',title:'Quenwick',kind:'village',x:.2,y:.7,notes:'',entryId:null,visibility:'gm'}],
 paths:[{id:'r1',kind:'river',name:'The Ashwash',points:[{x:.1,y:.1},{x:.5,y:.3}],visibility:'players',entryId:'secret-river'},{id:'r2',kind:'road',name:'',points:[{x:.1,y:.1},{x:.2,y:.2}],visibility:'players'}],
 labels:[{id:'l1',text:'The Corrin',x:.9,y:.1,size:'large',visibility:'players',entryId:'greyfen'}]});
const build=()=>workspaceSchema.parse({schemaVersion:1,
 worlds:[{id:'w1',name:'The Lantern Coast',description:'',archived:false,templates:[settle]}],
 campaigns:[{id:'salt',worldId:'w1',name:'The Salt Road',description:'',github:{repository:'',branch:'main'}}],
 entries:[entry('coast',{kind:'map',title:'The Lantern Coast',mapData:map,overviewVisibility:'players'}),
  entry('greyfen',{title:'Greyfen',overviewVisibility:'players',templateId:'t1',fields:{f1:340,f2:'Factor Dace'},
   body:'## At a glance\nA stilt village where the Ashwash meets the sea.\n\nMore below.\n\n::: secret\nDace holds the **debts**.\n:::\n'}),
  entry('lantern',{title:'The Sunken Lantern',parentId:'greyfen',overviewVisibility:'players',body:'Best eel stew on the coast.'}),
  entry('docks',{title:'Greyfen docks',parentId:'greyfen',body:'Barges.'}),
  entry('cellar',{title:'Cellar',kind:'folder',parentId:'greyfen'}),
  entry('secret-river',{title:'Ashwash',body:'Grey with silt.'})]});

test('places, named rivers and names on the map are listed, unnamed roads are not',()=>{
 const things=mapThings(map);
 assert.deepEqual(things.map(t=>[t.type,t.title,t.kind,t.entryId]),[['pin','Greyfen','Town','greyfen'],['pin','Quenwick','Village',null],['path','The Ashwash','River','secret-river'],['label','The Corrin','Name','greyfen']]);
 assert.equal(things[2].x,.3);
});

test('the card reads the opening lines, the info box, GM secrets and the pages inside',()=>{
 const s=build(),m=s.entries[0],card=placeCard(s,m,'greyfen');
 assert.deepEqual(card.page,{id:'greyfen',title:'Greyfen',kind:'Place',players:true});
 assert.equal(card.lead,'A stilt village where the Ashwash meets the sea.');
 assert.deepEqual(card.info.map(r=>[r.label,r.value,r.gm]),[['People','340',false],['Who really runs it','Factor Dace',true]]);
 assert.deepEqual(card.secrets,['Dace holds the debts.']);
 assert.deepEqual(card.inside.map(c=>[c.title,c.players]),[['Greyfen docks',false],['The Sunken Lantern',true]],'folders are left out');
 assert.equal(linkedCount(s,m,'greyfen'),3);assert.equal(linkedCount(s,m,null),0);assert.equal(linkedCount(s,m,'gone'),0);
 assert.equal(placeCard(s,m,null).page,null);
});

test('lead text and secrets skip headings and lists, and an unclosed secret still counts as secret',()=>{
 assert.equal(leadText('# Title\n- a list\n\nThe real start.'),'The real start.');
 assert.equal(leadText('::: secret\nhidden\n:::\n\nShown.'),'Shown.');
 assert.deepEqual(secretBlocks('Open.\n::: secret\nNever closed'),['Never closed']);
});

test('linking a page works on places, rivers and names, and players only keep links they can read',()=>{
 let m=linkThing(map,{type:'path',id:'r1'},null);assert.equal(m.paths[0].entryId,null);
 m=linkThing(m,{type:'label',id:'l1'},'lantern');assert.equal(m.labels[0].entryId,'lantern');
 m=linkThing(m,{type:'pin',id:'p2'},'docks');assert.equal(m.pins[1].entryId,'docks');
 assert.doesNotThrow(()=>mapSchema.parse(m));
 const player=playerCampaign(build(),'salt').entries.find(e=>e.id==='coast').mapData;
 assert.equal(player.paths[0].entryId,null,'the river links a GM-only page');
 assert.equal(player.labels[0].entryId,'greyfen');
});
