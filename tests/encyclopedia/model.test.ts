import './world-templates.test.ts';
import './travel.test.ts';
import './map-weather.test.ts';
import './weather.test.ts';
import './almanac.test.ts';
import './calendar.test.ts';
import {newMap,mapSchema,generateTerrain,imageType,MAX_IMAGE_BYTES,mapPackageSchema,mapSize,cellShape,pointCell,pointRevealed,fogBrush,fogBasis,fogImageReady,playerMap,fitMapSize} from '../../lib/encyclopedia/map-model.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoWorkspace, workspaceSchema, campaignExport, importCopy, emptyWorkspace, canParent, resolveLink, defaultCharacter, playerCampaign, folderPath, inFolder, reorderEntry, compareEntries } from '../../lib/encyclopedia/world-model.ts';
import { callReadTool } from '../../lib/encyclopedia/mcp.ts';
const demo = demoWorkspace();
test('sample has two isolated campaigns sharing lore', () => { assert.equal(workspaceSchema.parse(demo).campaigns.length, 2); const one = campaignExport(demo, 'demo-campaign'); assert.equal(one.campaigns.length, 1); assert(!one.entries.some(e => e.id === 'demo-winter')); assert(one.entries.some(e => e.id === 'demo-greyhaven')); });
test('MCP refuses another campaign article and scopes search', () => { assert.throws(() => callReadTool(demo, 'read_article', { campaign_id: 'demo-campaign', article_id: 'demo-winter' })); const result = callReadTool(demo, 'search_campaign', { campaign_id: 'demo-campaign', query: 'snowfall' }) as unknown[]; assert.equal(result.length, 0); });
test('import remaps IDs, hierarchy and explicit wiki links without replacing existing data', () => { const copy = importCopy(demo, campaignExport(demo, 'demo-campaign')); assert.equal(copy.worlds.length, 2); assert.equal(copy.entries[0].id, demo.entries[0].id); const imported = copy.entries.filter(e => e.worldId !== 'demo-world'); const session = imported.find(e => e.title === 'A light in the fog')!; assert(session.parentId !== null && session.parentId !== 'demo-sessions'); const grey = imported.find(e => e.title === 'Greyhaven')!; assert(session.body.includes(`[[${grey.id}|Greyhaven]]`)); workspaceSchema.parse(copy); });
test('dangling parents, cross-campaign parents and cycles are rejected', () => { for (const parent of ['missing', 'demo-sessions', 'demo-places']) {
    const state = structuredClone(demo);
    state.entries.find(e => e.id === 'demo-places')!.parentId = parent;
    assert(!workspaceSchema.safeParse(state).success);
} });
test('moving folder under itself or descendants is forbidden', () => { const parent = demo.entries.find(e => e.id === 'demo-places')!; assert.equal(canParent(parent, parent, demo), false); assert.equal(canParent(demo.entries.find(e => e.id === 'demo-first')!, parent, demo), false); });
test('title links cannot cross campaign boundaries', () => { const from = demo.entries.find(e => e.id === 'demo-first')!; assert.equal(resolveLink(demo, from, 'The first snowfall'), undefined); assert.equal(resolveLink(demo, from, 'Greyhaven')?.id, 'demo-greyhaven'); });
test('malformed import never mutates existing workspace', () => { const s = emptyWorkspace(); assert.throws(() => importCopy(s, { schemaVersion: 7 })); assert.equal(s.worlds.length, 0); });

function characterFixture(){
 const s=demoWorkspace(),c=s.campaigns[0],other=s.campaigns[1],e=s.entries.find(e=>e.id==='demo-mara')!;
 c.statFields=[{id:'hp',label:'Health',section:'Vitals',type:'number',options:[],visibility:'players',archived:false},{id:'secret',label:'Secret allegiance',section:'Private',type:'text',options:[],visibility:'gm',archived:false},{id:'old',label:'Old secret',section:'Old',type:'text',options:[],visibility:'players',archived:true}];
 other.statFields=[{id:'hp',label:'Health',section:'Vitals',type:'number',options:[],visibility:'players',archived:false}];
 e.character={...defaultCharacter(),statsVisibility:'players',statsByCampaign:{[c.id]:{hp:12,secret:'HIDDEN-STAT',old:'ARCHIVED-SECRET'},[other.id]:{hp:99}}};
 e.body='GM-OVERVIEW-SECRET';e.overviewVisibility='gm';e.tabs=[{id:'public',title:'Rumors',body:'Shared story [[demo-greyhaven|Home]]',visibility:'players'},{id:'private',title:'PRIVATE-TITLE',body:'HIDDEN-TAB',visibility:'gm'}];
 return s;
}
test('old v0.1 backups load without new fields and remain private',()=>{
 const s=workspaceSchema.parse(demoWorkspace());assert.equal(playerCampaign(s,'demo-campaign').entries.length,0);
 const copy=importCopy(emptyWorkspace(),s);assert.equal(copy.entries.length,s.entries.length);assert.equal(copy.campaigns.length,2);
});
test('player payload excludes private tabs, overview, fields, archived values, metadata and other campaigns',()=>{
 const s=characterFixture();const data=playerCampaign(s,'demo-campaign'),text=JSON.stringify(data);const e=data.entries.find(e=>e.id==='demo-mara')!;
 assert.deepEqual(e.tabs.map(t=>t.title),['Rumors']);assert.deepEqual(e.stats.map(f=>f.value),[12]);
 for(const secret of ['GM-OVERVIEW-SECRET','PRIVATE-TITLE','HIDDEN-TAB','HIDDEN-STAT','ARCHIVED-SECRET','demo-campaign-two','statsByCampaign','token','repository'])assert(!text.includes(secret),secret);
 s.entries.find(e=>e.id==='demo-mara')!.character!.statsVisibility='gm';assert.equal(playerCampaign(s,'demo-campaign').entries[0].stats.length,0);
});
test('MCP article and campaign reads isolate shared character stat sets and search custom tabs',()=>{
 const s=characterFixture();for(const name of ['read_article','read_campaign']){const result=callReadTool(s,name,{campaign_id:'demo-campaign',article_id:'demo-mara'});assert(!JSON.stringify(result).includes('demo-campaign-two'));}
 const results=callReadTool(s,'search_campaign',{campaign_id:'demo-campaign',query:'shared story'}) as {id:string}[];assert.equal(results[0].id,'demo-mara');
});
test('new export/import preserves custom tabs, visibility, stats, field IDs and remaps campaign and wiki references',()=>{
 const s=characterFixture(),c=campaignExport(s,'demo-campaign'),copy=importCopy(s,c),world=copy.worlds.at(-1)!,campaign=copy.campaigns.at(-1)!;
 const mara=copy.entries.find(e=>e.worldId===world.id&&e.title==='Mara Venn')!,home=copy.entries.find(e=>e.worldId===world.id&&e.title==='Greyhaven')!;
 assert.equal(mara.tabs![0].body,`Shared story [[${home.id}|Home]]`);assert.equal(mara.tabs![1].visibility,'gm');assert.deepEqual(mara.character!.statsByCampaign,{[campaign.id]:{hp:12,secret:'HIDDEN-STAT',old:'ARCHIVED-SECRET'}});assert.equal(campaign.statFields![0].id,'hp');assert.equal(s.entries.find(e=>e.id==='demo-mara')!.character!.statsByCampaign['demo-campaign-two'].hp,99);
});
test('renaming, reordering and archiving fields retain values; invalid types and duplicate IDs fail',()=>{
 const s=characterFixture();s.campaigns[0].statFields![0].label='Hit points';s.campaigns[0].statFields!.reverse();s.campaigns[0].statFields!.find(f=>f.id==='hp')!.archived=true;
 assert.equal(workspaceSchema.parse(s).entries.find(e=>e.id==='demo-mara')!.character!.statsByCampaign['demo-campaign'].hp,12);
 s.entries.find(e=>e.id==='demo-mara')!.character!.statsByCampaign['demo-campaign'].hp='invalid';assert(!workspaceSchema.safeParse(s).success);
 const fresh=characterFixture();fresh.campaigns[0].statFields!.push(fresh.campaigns[0].statFields![0]);assert(!workspaceSchema.safeParse(fresh).success);
});
test('custom mixed-content folders move and reorder without changing IDs, tabs, stats or links',()=>{
 const s=characterFixture(),folder=s.entries.find(e=>e.id==='demo-places')!,mara=s.entries.find(e=>e.id==='demo-mara')!;folder.title='Harbor Crew';mara.parentId=folder.id;
 assert(canParent(mara,folder,s));assert.equal(folderPath(s,mara),'Harbor Crew');assert(inFolder(s,mara,folder.id));const reordered=reorderEntry(s,mara.id,-1);const first=reordered.entries.filter(e=>e.parentId===folder.id).sort(compareEntries)[0];assert.equal(first.id,mara.id);assert.deepEqual(first.tabs,mara.tabs);assert.deepEqual(first.character,mara.character);
 const restored=workspaceSchema.parse(JSON.parse(JSON.stringify(reordered)));assert.equal(restored.entries.find(e=>e.id===mara.id)!.parentId,folder.id);
 assert(!canParent(folder,folder,s));assert(!canParent(s.entries.find(e=>e.id==='demo-first')!,folder,s));
});
test('moving a folder subtree past the depth limit is rejected by the folder picker',()=>{
 const s=demoWorkspace(),base=s.entries[0];let parent:string|null=null;for(let i=0;i<20;i++){const id='depth-'+i;s.entries.push({...base,id,title:id,parentId:parent});parent=id;}
 const top={...base,id:'subtree',title:'Subtree',parentId:null};s.entries.push(top,{...base,id:'child',title:'Child',parentId:top.id});assert(workspaceSchema.safeParse(s).success);assert(!canParent(top,s.entries.find(e=>e.id===parent)!,s));
});

function mapsFixture(){const s=demoWorkspace(),base=s.entries.find(e=>e.id==='demo-mara')!;s.entries.push({...base,id:'world-map',title:'Northern reaches',kind:'map',body:'',mapData:newMap('world')},{...base,id:'campaign-map',campaignId:'demo-campaign',title:'The harbor hexes',kind:'map',body:'',mapData:newMap('hex')});return s;}
test('multiple maps retain scope, hierarchy, terrain and linked pins through exports and imports',()=>{
 const s=mapsFixture(),m=s.entries.find(e=>e.id==='campaign-map')!;m.parentId='demo-sessions';m.mapData!.pins=[{id:'pin-1',title:'Harbor',x:.2,y:.4,notes:'A busy port',entryId:'demo-greyhaven',visibility:'gm'}];
 const copy=importCopy(emptyWorkspace(),campaignExport(s,'demo-campaign')),map=copy.entries.find(e=>e.title==='The harbor hexes')!,place=copy.entries.find(e=>e.title==='Greyhaven')!;assert.equal(copy.entries.filter(e=>e.kind==='map').length,2);assert.equal(map.mapData!.pins[0].entryId,place.id);assert.deepEqual(map.mapData!.tiles,m.mapData!.tiles);assert.notEqual(map.parentId,'demo-sessions');assert.equal(campaignExport(s,'demo-campaign-two').entries.filter(e=>e.kind==='map').length,1);
});
test('player map filtering excludes private maps and pins and links to unshared articles',()=>{
 const s=mapsFixture(),m=s.entries.find(e=>e.id==='campaign-map')!;m.mapData!.visibility='players';m.mapData!.pins=[{id:'public-pin',title:'Harbor',x:.2,y:.4,notes:'Public',entryId:'demo-greyhaven',visibility:'players'},{id:'private-pin',title:'HIDDEN-PIN',x:.3,y:.5,notes:'HIDDEN-NOTE',entryId:null,visibility:'gm'}];
 let player=playerCampaign(s,'demo-campaign');assert.equal(player.entries.length,1);assert.equal(player.entries[0].mapData!.pins.length,1);assert.equal(player.entries[0].mapData!.pins[0].entryId,null);assert(!JSON.stringify(player).includes('HIDDEN'));assert(!JSON.stringify(player).includes('world-map'));
 s.entries.find(e=>e.id==='demo-greyhaven')!.overviewVisibility='players';player=playerCampaign(s,'demo-campaign');assert.equal(player.entries.find(e=>e.id===m.id)!.mapData!.pins[0].entryId,'demo-greyhaven');
});
test('map validation rejects invalid tile counts, coordinates, duplicate pins, image IDs and cross-campaign links',()=>{
 const m=newMap('hex');assert(mapSchema.safeParse(m).success);for(const patch of [{tiles:[]},{rows:10000},{imageId:'../private'},{source:'image',imageId:null}])assert(!mapSchema.safeParse({...m,...patch}).success);
 const pin={id:'p',title:'Port',x:.2,y:.3,notes:'',entryId:null,visibility:'gm'};assert(!mapSchema.safeParse({...m,pins:[pin,pin]}).success);assert(!mapSchema.safeParse({...m,pins:[{...pin,x:2}]}).success);
 const s=mapsFixture();s.entries.find(e=>e.id==='campaign-map')!.mapData!.pins=[{...pin,visibility:'gm',entryId:'demo-winter'}];assert(!workspaceSchema.safeParse(s).success);
});
test('terrain generation is reproducible, editable-sized and contains land and water',()=>{
 const a=generateTerrain(24,18,'The Lantern Coast','island'),b=generateTerrain(24,18,'The Lantern Coast','island');assert.deepEqual(a,b);assert.equal(a.length,432);assert(a.includes(0));assert(a.some(x=>x>0));assert.notDeepEqual(a,generateTerrain(24,18,'Another coast','island'));assert(generateTerrain(8,8,'blank','blank').every(x=>x===1));
 const m=newMap('hex'),size=mapSize(m);for(let i=0;i<m.tiles.length;i++){const c=cellShape(m,i);assert(c.x>0&&c.x<size.width&&c.y>0&&c.y<size.height);assert.equal(c.points.split(' ').length,6);}
});
test('map packages require uploaded bytes and preserve custom notes; signatures reject active formats',()=>{
 const m=newMap();assert(mapPackageSchema.safeParse({format:'ttrpg-map',version:1,title:'Map',body:'Notes',tabs:[{id:'notes',title:'GM',body:'Secret',visibility:'gm'}],map:m}).success);assert(!mapPackageSchema.safeParse({format:'ttrpg-map',version:1,title:'Map',body:'',map:{...m,source:'image',imageId:crypto.randomUUID()}}).success);
 assert.equal(imageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')),null);assert.equal(imageType(new Uint8Array(MAX_IMAGE_BYTES+1)),null);
 const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'));assert.equal(imageType(png),'image/png');
});
test('MCP finds map pin notes and excludes maps in another campaign',()=>{
 const s=mapsFixture();s.entries.find(e=>e.id==='campaign-map')!.mapData!.pins=[{id:'p',title:'Lighthouse',x:.5,y:.5,notes:'The green signal',entryId:null,visibility:'gm'}];
 const hits=callReadTool(s,'search_campaign',{campaign_id:'demo-campaign',query:'green signal'}) as {id:string}[];assert.equal(hits[0].id,'campaign-map');assert.throws(()=>callReadTool(s,'read_article',{campaign_id:'demo-campaign-two',article_id:'campaign-map'}));
});

test('fog defaults preserve older maps and validates exploration cell indexes',()=>{
 const m=newMap();assert.equal(mapSchema.parse(m).fog,undefined);assert.equal(playerMap(m).tiles.length,m.tiles.length);
 for(const revealed of [[-1],[432],[0,0],[.5]])assert(!mapSchema.safeParse({...m,fog:{enabled:true,revealed}}).success);
 assert(mapSchema.safeParse({...m,fog:{enabled:true,revealed:[0,431]}}).success);
});
test('fog player payload redacts terrain, generation seed and hidden pin details without mutating owner data',()=>{
 const s=mapsFixture(),m=s.entries.find(e=>e.id==='campaign-map')!.mapData!;m.visibility='players';m.seed='SECRET-SEED';m.fog={enabled:true,revealed:[0]};m.tiles.fill(7);
 const size=mapSize(m),a=cellShape(m,0),b=cellShape(m,100);
 m.pins=[{id:'shown',title:'Harbor',notes:'Public',x:a.x/size.width,y:a.y/size.height,entryId:null,visibility:'players'},{id:'hidden',title:'SECRET-PIN',notes:'SECRET-NOTE',x:b.x/size.width,y:b.y/size.height,entryId:null,visibility:'players'}];
 const player=playerCampaign(s,'demo-campaign'),p=player.entries[0].mapData!;assert.equal(p.tiles[0],7);assert(p.tiles.slice(1).every(v=>v===0));assert.equal(p.pins.length,1);assert(!JSON.stringify(player).includes('SECRET'));assert.equal(m.pins.length,2);assert.equal(m.tiles[1],7);
 m.fog.revealed=[];assert.equal(playerMap(m).pins.length,0);m.fog.enabled=false;assert.equal(playerMap(m).pins.length,2);
});
test('uploaded fog maps never disclose original or stale previews and redact preview metadata',()=>{
 const m={...newMap(),source:'image' as const,imageId:crypto.randomUUID(),tiles:[],fog:{enabled:true,revealed:[0],previewImageId:crypto.randomUUID(),previewBasis:''}};
 assert.equal(playerMap(m).imageId,null);m.fog.previewBasis=fogBasis(m);assert(fogImageReady(m));const p=playerMap(m);assert.equal(p.imageId,m.fog.previewImageId);assert(!JSON.stringify(p).includes(m.imageId));assert(!('previewBasis' in p.fog!));
 for(const patch of [{imageId:crypto.randomUUID()},{imageWidth:500},{grid:'hex' as const},{columns:12},{fog:{...m.fog,revealed:[1]}}])assert.equal(playerMap({...m,...patch}).imageId,null);
 assert(!mapSchema.safeParse({...m,fog:{...m.fog,previewImageId:m.imageId}}).success);
});
test('fog geometry matches square and hex cell centers and respects unrevealed borders',()=>{
 for(const source of ['image','generated'] as const)for(const grid of ['square','hex','none'] as const){
  const m={...newMap(),source,grid,imageWidth:800,imageHeight:500},size=mapSize(m);
  for(let i=0;i<m.columns*m.rows;i++){const c=cellShape(m,i);assert.equal(pointCell(m,c.x/size.width,c.y/size.height),i);}
  m.fog={enabled:true,revealed:[100]};const c=cellShape(m,100);assert(pointRevealed(m,c.x/size.width,c.y/size.height));assert(!pointRevealed(m,0,0));assert.deepEqual(fogBrush(m,100,0),[100]);assert(fogBrush(m,100,2).length>fogBrush(m,100,1).length);
 }
});
test('fog exploration persists through workspace and map package round trips',()=>{
 const s=mapsFixture(),e=s.entries.find(e=>e.id==='campaign-map')!;e.mapData!.fog={enabled:true,revealed:[3,4,5]};
 const copy=importCopy(emptyWorkspace(),campaignExport(s,'demo-campaign'));assert.deepEqual(copy.entries.find(x=>x.title===e.title)!.mapData!.fog,e.mapData!.fog);
 const p=mapPackageSchema.parse(JSON.parse(JSON.stringify({format:'ttrpg-map',version:1,title:e.title,body:e.body,map:e.mapData})));assert.deepEqual(p.map.fog,e.mapData!.fog);
});
test('fit keeps wide and tall maps wholly inside desktop and mobile viewports',()=>{
 for(const [w,h] of [[1000,500],[330,380]])for(const [mw,mh] of [[1000,100],[100,1000],[800,500]]){const fit=fitMapSize(w,h,mw,mh);assert(fit.width<=w+.01&&fit.height<=h+.01);assert(Math.abs(fit.width/fit.height-mw/mh)<.001);const zoom=fitMapSize(w,h,mw,mh,2);assert.equal(zoom.width,fit.width*2);}
});
