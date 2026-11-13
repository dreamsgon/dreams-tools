import test from 'node:test';
import assert from 'node:assert/strict';
import {sectionNumber,pageSections,sectionText,areaPolygon,areaAt,roomAt,numberedRooms,linkAllRooms,orderedAreas,areaLabel,playerAreaText} from '../lib/map-areas.ts';
import {generateMap} from '../lib/map-generator.ts';
import {workspaceSchema as bookSchema} from '../lib/encyclopedia/world-model.ts';
import {sceneSchema} from '../lib/model.ts';
import {playersScenes} from '../lib/mcp/players-only.ts';

const grid={type:'square',size:70,offsetX:0,offsetY:0,color:'#58675e',opacity:.3,labels:true,labelMode:'cells',labelTheme:'light',snap:true,units:5,unit:'ft',diagonal:'equal'};
const body='Under the old chapel.\n\n## 1. Entry stair\n> Worn steps.\n\nSlick.\n\n### Hazard\nDC 10.\n\n## 6. The Flooded Chapel\n> Black water.\n\n::: secret\nThe key opens area 8.\n:::\n\n## Area 8: The Reliquary\nGold.\n';

test('room numbers are read from headings and labels',()=>{
 assert.equal(sectionNumber('6. The Flooded Chapel'),'6');assert.equal(sectionNumber('Area 12b: Well'),'12b');assert.equal(sectionNumber('Room 3'),'3');
 assert.equal(sectionNumber('The Reliquary (area 8)'),'8');assert.equal(sectionNumber('1st floor'),null);assert.equal(sectionNumber('The Hall'),null);
});

test('a section is its heading and everything under it until the next heading at its level',()=>{
 const s=pageSections(body);
 assert.deepEqual(s.map(x=>[x.title,x.number,x.level]),[['1. Entry stair','1',2],['Hazard',null,3],['6. The Flooded Chapel','6',2],['Area 8: The Reliquary','8',2]]);
 assert.equal(sectionText(body,'1. Entry stair'),'> Worn steps.\n\nSlick.\n\n### Hazard\nDC 10.');
 assert.match(sectionText(body,'6. the flooded chapel'),/secret/);
 assert.equal(sectionText(body,'Gone'),null);
 assert.equal(sectionText(body,''),body.trim());
});

test('areas are boxes or outlines, and the smallest one under a point wins',()=>{
 assert.deepEqual(areaPolygon([{x:10,y:20},{x:0,y:0}]),[{x:0,y:0},{x:10,y:0},{x:10,y:20},{x:0,y:20}]);
 const hall={id:'h',points:[{x:0,y:0},{x:100,y:100}]},room={id:'r',points:[{x:10,y:10},{x:40,y:10},{x:40,y:40},{x:10,y:40}]};
 assert.equal(areaAt([hall,room],{x:20,y:20}).id,'r');assert.equal(areaAt([hall,room],{x:80,y:80}).id,'h');assert.equal(areaAt([hall,room],{x:200,y:0}),null);
 assert.deepEqual(orderedAreas([{section:'Area 10'},{section:'2. Hall'},{section:'Notes'},{section:'1. Stair'}]).map(a=>a.section),['1. Stair','2. Hall','Area 10','Notes']);
 assert.equal(areaLabel({section:'Notes'},4),'5');
});

test('numbered rooms on a generated dungeon are found by their labels, not the corridors through them',()=>{
 const g=generateMap({kind:'dungeon',size:'medium',rooms:8,style:'parchment',seed:'drowned-crypt',grid:70});
 const rooms=numberedRooms(g.drawing);
 assert.equal(rooms.length,8);
 for(const r of rooms){const xs=r.points.map(p=>p.x),ys=r.points.map(p=>p.y);assert.ok(Math.min(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))>70,`room ${r.number} is wider than a corridor`);}
 assert.equal(roomAt(g.drawing,{x:-50,y:-50}),null);
 let n=0;const made=linkAllRooms(g.drawing,body,'crypt',[{id:'a',points:[{x:0,y:0},{x:1,y:1}],pageId:'crypt',section:'1. Entry stair'}],()=>`n${++n}`,true);
 assert.deepEqual(made.map(a=>[a.section,a.playersSee]),[['6. The Flooded Chapel',true],['Area 8: The Reliquary',true]]);
 assert.doesNotThrow(()=>sceneSchema.parse({id:'s',name:'Crypt',folder:'f',width:g.width,height:g.height,mapId:null,drawing:g.drawing,grid,tokens:[],effects:[],fog:{enabled:false,base:false,strokes:[]},areas:made}));
});

test('players read only shared areas on pages they can already read, without secrets',()=>{
 const now='2026-11-13T12:00:00.000Z';
 const book=bookSchema.parse({schemaVersion:1,worlds:[{id:'w',name:'The Lantern Coast',description:'',archived:false}],
  campaigns:[{id:'salt',worldId:'w',name:'The Salt Road',description:'',github:{repository:'',branch:'main'},maptableCampaignId:'camp'}],
  entries:[{id:'crypt',worldId:'w',campaignId:'salt',parentId:null,title:'The Drowned Crypt',kind:'place',body,overviewVisibility:'players',updatedAt:now},
   {id:'gm',worldId:'w',campaignId:'salt',parentId:null,title:'GM notes',kind:'note',body,updatedAt:now}]});
 const area={pageId:'crypt',section:'6. The Flooded Chapel',playersSee:true};
 const shown=playerAreaText(area,book,'camp');
 assert.equal(shown.pageTitle,'The Drowned Crypt');assert.match(shown.text,/Black water/);assert.doesNotMatch(shown.text,/key opens/);
 assert.equal(playerAreaText({...area,playersSee:false},book,'camp'),null);
 assert.equal(playerAreaText({...area,pageId:'gm'},book,'camp'),null,'a GM-only page');
 assert.equal(playerAreaText(area,book,'other'),null,'an unpaired campaign');
 assert.equal(playerAreaText(area,null,'camp'),null);
 const scene=sceneSchema.parse({id:'s',name:'Crypt',folder:'f',width:100,height:100,mapId:null,grid,tokens:[],effects:[],fog:{enabled:false,base:false,strokes:[]},
  areas:[{id:'a',points:[{x:0,y:0},{x:9,y:9}],pageId:'crypt',section:'x',playersSee:true},{id:'b',points:[{x:0,y:0},{x:9,y:9}],pageId:'crypt',section:'y'}]});
 assert.deepEqual(playersScenes([scene],()=>false)[0].areas.map(a=>a.id),['a'],'the AI in player mode only gets shared areas');
});
