import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSchema,demoWorkspace} from '../lib/encyclopedia/world-model.ts';
import {pageFromTemplate,saveTemplate,templateFromPage} from '../lib/encyclopedia/templates.ts';
import {ENTRY_KINDS,KIND_GROUPS,KIND_LABELS,kindChangeLoses} from '../lib/encyclopedia/entry-kinds.ts';
import {changeEntryType,kindStarts,typeChangeLoses,typeName,typeOf} from '../lib/encyclopedia/entry-type.ts';
import {categoryKinds} from '../lib/encyclopedia/sidebar.ts';

const T='2026-11-21T10:00:00.000Z';
let n=0;const newId=()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`;
const page=(s,over={})=>({id:newId(),worldId:s.worlds[0].id,campaignId:s.campaigns[0].id,parentId:null,title:'Brightwater',kind:'page',body:'Some text',updatedAt:T,...over});
const withPage=(over)=>{const s=demoWorkspace();const e=page(s,over);return {s:{...s,entries:[...s.entries,e]},e};};
const deity=(s,extra={})=>({id:newId(),name:'Deity',kind:'lore',icon:'sun',fields:[{id:newId(),label:'Domain',type:'text',visibility:'players'}],tabs:[{title:'Worship',visibility:'players'}],body:'## Tenets\n',updatedAt:T,...extra});

test('Page and Other are kinds a page can be, with names, picker groups and sidebar categories',()=>{
  const {s}=withPage({kind:'other'});
  assert.equal(workspaceSchema.safeParse(s).success,true);
  for(const k of ['page','other'])assert.ok(ENTRY_KINDS.includes(k)&&KIND_LABELS[k]&&categoryKinds.includes(k));
  // Every kind is in exactly one group of the New entry picker.
  assert.deepEqual(KIND_GROUPS.flatMap(g=>g.kinds).sort(),[...ENTRY_KINDS].sort());
  assert.equal(KIND_GROUPS[0].kinds[0],'page');
});

test('a GM type is a template with an icon: pages made from it get the icon and its name as their type',()=>{
  const {s}=withPage();const t=deity(s);const s2=saveTemplate(s,s.worlds[0].id,t,newId);
  assert.equal(workspaceSchema.safeParse(s2).success,true);
  const p=pageFromTemplate(t,{id:newId(),title:'Sarenrae',worldId:s.worlds[0].id,campaignId:null,parentId:null,newId});
  assert.equal(p.pageLook?.icon,'sun');
  const s3={...s2,entries:[...s2.entries,p]};
  assert.equal(typeName(s3,p),'Deity');
  assert.deepEqual(typeOf(s3,p),{templateId:t.id});
  // Saving a page as a template keeps its icon.
  assert.equal(templateFromPage(s3,p,'Deity 2',newId).icon,'sun');
  assert.equal(workspaceSchema.safeParse(s3).success,true);
});

test('changing a plain page to a character keeps its text and starts a Profile and sheet',()=>{
  const {s,e}=withPage({tabs:[{id:newId(),title:'Rumours',body:'x',visibility:'gm'}]});
  const out=changeEntryType(s,e.id,{kind:'character'},newId,T),p=out.entries.find(x=>x.id===e.id);
  assert.equal(p.kind,'character');assert.equal(p.body,'Some text');assert.equal(p.tabs.length,1);
  assert.ok(p.character&&p.profile);
  assert.deepEqual(typeChangeLoses(s,e,{kind:'character'}),[]);
  assert.equal(workspaceSchema.safeParse(out).success,true);
});

test('changing away from a map or organization names what goes, and the result still saves',()=>{
  const s0=demoWorkspace();
  const map=page(s0,{kind:'map',...kindStarts('map',s0.worlds[0],'Coast')});
  const org=page(s0,{kind:'faction',...kindStarts('faction',s0.worlds[0],'Guild')});
  const s={...s0,entries:[...s0.entries,map,org]};
  assert.deepEqual(typeChangeLoses(s,map,{kind:'place'}),['the map']);
  assert.deepEqual(kindChangeLoses(org,'page'),['the organization profile']);
  const out=changeEntryType(changeEntryType(s,map.id,{kind:'place'},newId,T),org.id,{kind:'page'},newId,T);
  assert.equal(out.entries.find(x=>x.id===map.id).mapData,undefined);
  assert.equal(out.entries.find(x=>x.id===org.id).org,undefined);
  assert.equal(workspaceSchema.safeParse(out).success,true);
});

test('changing to a GM type uses its template; leaving it drops its info box and its icon, not one the GM chose',()=>{
  const {s,e}=withPage();const t=deity(s);let w=saveTemplate(s,s.worlds[0].id,t,newId);
  w=changeEntryType(w,e.id,{templateId:t.id},newId,T);
  let p=w.entries.find(x=>x.id===e.id);
  assert.equal(p.kind,'lore');assert.equal(p.templateId,t.id);assert.equal(p.pageLook.icon,'sun');assert.ok(p.tabs.some(x=>x.title==='Worship'));
  w={...w,entries:w.entries.map(x=>x.id===e.id?{...x,fields:{[t.fields[0].id]:'Sun'}}:x)};p=w.entries.find(x=>x.id===e.id);
  assert.deepEqual(typeChangeLoses(w,p,{kind:'page'}),["what's filled in on the Deity info box"]);
  const back=changeEntryType(w,e.id,{kind:'page'},newId,T).entries.find(x=>x.id===e.id);
  assert.equal(back.templateId,undefined);assert.equal(back.fields,undefined);assert.equal(back.pageLook,undefined);
  // An icon the GM picked themselves stays.
  const own={...w,entries:w.entries.map(x=>x.id===e.id?{...x,pageLook:{icon:'crown'}}:x)};
  assert.equal(changeEntryType(own,e.id,{kind:'page'},newId,T).entries.find(x=>x.id===e.id).pageLook.icon,'crown');
});

test('a page with pages inside cannot become a map',()=>{
  const {s,e}=withPage();const child=page(s,{parentId:e.id,title:'Inside'});
  assert.throws(()=>changeEntryType({...s,entries:[...s.entries,child]},e.id,{kind:'map'},newId,T),/can't hold other pages/);
});

test('sidebar headings: the GM adds one, sections after it sit under it, and removing it keeps them',async()=>{
  const {defaultSidebar,addGroup,removeGroup,renameGroup,sectionsUnder,sidebarSchema,sidebarOf,moveSection,categoryItems,setCategoryTypes,addCategory}=await import('../lib/encyclopedia/sidebar.ts');
  let s=defaultSidebar();const made=addGroup(s,'The World',()=> 'grp1');s=made.sidebar;
  s=moveSection(s,s.sections.findIndex(x=>x.id==='grp1'),0);
  assert.equal(sidebarSchema.safeParse(s).success,true);
  const under=sectionsUnder(s);
  assert.equal(under[0].heading,true);assert.ok(under.slice(1).every(x=>x.group?.id==='grp1'));
  s=renameGroup(s,'grp1','Lands');assert.equal(s.groups[0].name,'Lands');
  assert.deepEqual(sidebarOf(s).sections.map(x=>x.id),s.sections.map(x=>x.id));
  const gone=removeGroup(s,'grp1');assert.equal(gone.groups,undefined);assert.equal(gone.sections.length,4);
  // A category can gather every page of one of the GM's types.
  const c=addCategory(gone,'Gods',()=> 'cat1');const withType=setCategoryTypes(c.sidebar,'cat1',['tpl1']);
  const items=categoryItems(withType.categories[0],[{id:'a',title:'Sarenrae',kind:'lore',templateId:'tpl1'},{id:'b',title:'Bob',kind:'lore'}]);
  assert.deepEqual(items.map(i=>i.page.id),['a']);
});
