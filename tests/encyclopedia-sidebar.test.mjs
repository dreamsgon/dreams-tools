import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSchema,entrySchema,demoWorkspace,importCopy,campaignExport} from '../lib/encyclopedia/world-model.ts';
import {sidebarSchema,defaultSidebar,sidebarOf,moveNav,moveSection,moveQuick,showNav,showSection,addQuick,removeQuick,addCategory,removeCategory,renameCategory,addCategoryLink,removeCategoryLink,moveCategoryLink,setCategoryKinds,categoryItems,sidebarToSave,navIds,categoryKinds,maxQuickLinks} from '../lib/encyclopedia/sidebar.ts';

let n=0;const makeId=()=>`id${++n}`;
function withSidebar(sidebar){const s=demoWorkspace();s.campaigns=s.campaigns.map(c=>c.id==='demo-campaign'?{...c,sidebar}:c);return s;}

test('a campaign without a sidebar shows the starting layout', () => {
  const d=sidebarOf(undefined);
  assert.deepEqual(d.nav.map(x=>x.id),['quests','codex','relationships','characters','maps','calendar','tables','templates']);
  assert.ok(d.nav.every(x=>x.on));
  assert.deepEqual(d.quick.map(l=>l.type==='tool'?l.tool:l.type==='view'?l.view:''),['form','items','share','look']);
  assert.deepEqual(d.sections.map(x=>x.id),['lore','notes','sessions','orgs']);
  assert.equal(sidebarToSave(defaultSidebar()),undefined);
});

test('a sidebar layout is checked with the campaign', () => {
  let s=defaultSidebar();
  const made=addCategory(s,'Villains',makeId);s=made.sidebar;
  s=addCategoryLink(s,made.id,{type:'page',page:'demo-mara'},makeId);
  s=addCategoryLink(s,made.id,{type:'web',label:'Music',url:'https://example.com/music'},makeId);
  assert.equal(workspaceSchema.safeParse(withSidebar(s)).success,true);
  assert.equal(sidebarSchema.safeParse({...s,nav:[...s.nav,{id:'quests',on:false}]}).success,false,'a menu item twice');
  assert.equal(sidebarSchema.safeParse({...s,nav:[{id:'weather',on:true}]}).success,false,'an unknown menu item');
  assert.equal(sidebarSchema.safeParse({...s,quick:[{id:'x',type:'web',label:'Bad',url:'javascript:alert(1)'}]}).success,false,'only http links');
  assert.equal(sidebarSchema.safeParse({...s,categories:[...s.categories,{id:'lore',name:'Clash',links:[]}]}).success,false,'a category cannot take a built-in id');
});

test('menu items and sections are moved, hidden and shown', () => {
  let s=defaultSidebar();
  s=moveNav(s,7,0);
  assert.equal(s.nav[0].id,'templates');
  assert.equal(moveNav(s,0,99),s);
  s=showNav(s,'codex',false);
  assert.equal(s.nav.find(x=>x.id==='codex').on,false);
  s=moveSection(s,3,0);
  assert.deepEqual(s.sections.map(x=>x.id),['orgs','lore','notes','sessions']);
  s=showSection(s,'lore',false);
  assert.equal(s.sections.find(x=>x.id==='lore').on,false);
  assert.notEqual(sidebarToSave(s),undefined);
});

test('quick links take any page, section, tool or web link, once each', () => {
  let s=defaultSidebar();
  s=addQuick(s,{type:'tool',tool:'form'},makeId);
  assert.equal(s.quick.length,4,'already there');
  s=addQuick(s,{type:'tool',tool:'dice'},makeId);
  s=addQuick(s,{type:'page',page:'demo-mara'},makeId);
  s=addQuick(s,{type:'web',label:'  Sheets ',url:' https://example.com '},makeId);
  assert.equal(s.quick.length,7);
  assert.deepEqual(s.quick.at(-1).label,'Sheets');
  assert.deepEqual(s.quick.at(-1).url,'https://example.com');
  s=moveQuick(s,6,0);
  assert.equal(s.quick[0].type,'web');
  s=removeQuick(s,s.quick[0].id);
  assert.equal(s.quick.length,6);
  for(let i=0;i<20;i++)s=addQuick(s,{type:'web',label:'L'+i,url:`https://example.com/${i}`},makeId);
  assert.equal(s.quick.length,maxQuickLinks);
});

test('categories are added, renamed, filled, ordered and removed', () => {
  let s=defaultSidebar();
  assert.equal(addCategory(s,'   ',makeId),null);
  const made=addCategory(s,'Places to visit',makeId);s=made.sidebar;
  assert.deepEqual(s.sections.at(-1),{id:made.id,on:true});
  s=renameCategory(s,made.id,'Places');
  s=renameCategory(s,made.id,'  ');
  assert.equal(s.categories[0].name,'Places');
  s=addCategoryLink(s,made.id,{type:'page',page:'a'},makeId);
  s=addCategoryLink(s,made.id,{type:'page',page:'a'},makeId);
  s=addCategoryLink(s,made.id,{type:'view',view:'maps'},makeId);
  assert.equal(s.categories[0].links.length,2);
  s=moveCategoryLink(s,made.id,1,0);
  assert.equal(s.categories[0].links[0].type,'view');
  s=removeCategoryLink(s,made.id,s.categories[0].links[0].id);
  assert.equal(s.categories[0].links.length,1);
  s=setCategoryKinds(s,made.id,['place','character']);
  assert.deepEqual(s.categories[0].kinds,['character','place'],'kinds keep one order');
  s=setCategoryKinds(s,made.id,[]);
  assert.equal('kinds' in s.categories[0],false);
  s=removeCategory(s,made.id);
  assert.deepEqual(s.categories,[]);
  assert.deepEqual(s.sections.map(x=>x.id),['lore','notes','sessions','orgs']);
});

test('a category lists its links, then every page of its kinds by name', () => {
  const pages=[{id:'p1',title:'Zeth',kind:'place'},{id:'p2',title:'Amber Hold',kind:'place'},{id:'c1',title:'Mira',kind:'character'}];
  const cat={id:'k',name:'Where',links:[{id:'l1',type:'page',page:'p1'},{id:'l2',type:'page',page:'gone'},{id:'l3',type:'web',label:'Atlas',url:'https://example.com'}],kinds:['place']};
  const items=categoryItems(cat,pages);
  assert.deepEqual(items.map(x=>x.link.type==='page'?x.page.title:x.link.label),['Zeth','Atlas','Amber Hold']);
});

test('a saved layout is made whole: new menu items and loose categories join, unknown ones go', () => {
  const s=sidebarOf({nav:[{id:'maps',on:false},{id:'maps',on:true}],quick:[],sections:[{id:'gone',on:true},{id:'notes',on:false}],categories:[{id:'k1',name:'Mine',links:[]}]});
  assert.equal(s.nav.length,navIds.length);
  assert.deepEqual(s.nav[0],{id:'maps',on:false});
  assert.deepEqual(s.sections.map(x=>x.id),['notes','lore','sessions','orgs','k1']);
  assert.equal(s.sections[0].on,false);
});

test('the kinds a category can list are the page kinds less folders', () => {
  const kinds=entrySchema.shape.kind.options.filter(k=>k!=='folder');
  assert.deepEqual([...categoryKinds].sort(),[...kinds].sort());
});

test('an imported copy keeps the sidebar with its page links pointed at the copies', () => {
  let s=defaultSidebar();
  const made=addCategory(s,'Cast',makeId);s=made.sidebar;
  s=addCategoryLink(s,made.id,{type:'page',page:'demo-mara'},makeId);
  s=addQuick(s,{type:'page',page:'demo-winter'},makeId);
  const exported=campaignExport(withSidebar(s),'demo-campaign');
  const copy=importCopy({schemaVersion:1,worlds:[],campaigns:[],entries:[]},exported);
  const c=copy.campaigns[0];
  const pageId=c.sidebar.categories[0].links[0].page;
  assert.notEqual(pageId,'demo-mara');
  assert.equal(copy.entries.find(e=>e.id===pageId)?.title,exported.entries.find(e=>e.id==='demo-mara').title);
  assert.equal(c.sidebar.quick.some(l=>l.type==='page'),false,'a link to a page not copied is dropped');
});
