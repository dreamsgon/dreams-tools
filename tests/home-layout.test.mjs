import test from 'node:test';
import assert from 'node:assert/strict';
import {homeLayoutSchema,defaultHomeLayout,presetLayout,toggleWidget,moveWidget,resizeWidget,setOption,isPinnedCampaign,isLinkUrl,applyHomeAction,homeWidgets,needsWorkspaces} from '../lib/home-layout.ts';

const row=(key,m,e)=>({key,name:'x',maptable:m?{id:m,name:'x',scenes:0}:null,encyclopedia:e?{id:e}:null,folderId:null});

test('the default layout is today\'s page and validates', () => {
  const d=defaultHomeLayout();
  assert.deepEqual(d.widgets,[{type:'continue',size:'l'},{type:'campaigns',size:'l'},{type:'recent',size:'l'}]);
  assert.equal(homeLayoutSchema.safeParse(d).success,true);
  assert.equal(homeLayoutSchema.safeParse({widgets:[]}).success,true);
});

test('the schema rejects bad layouts', () => {
  const ok={widgets:[{type:'links',size:'s'}]};
  assert.equal(homeLayoutSchema.safeParse({widgets:[{type:'links',size:'s'},{type:'links',size:'l'}]}).success,false);
  assert.equal(homeLayoutSchema.safeParse({widgets:[{type:'weather',size:'s'}]}).success,false);
  assert.equal(homeLayoutSchema.safeParse({widgets:[{type:'links',size:'xl'}]}).success,false);
  assert.equal(homeLayoutSchema.safeParse({...ok,notes:'x'.repeat(8001)}).success,false);
  assert.equal(homeLayoutSchema.safeParse({...ok,notes:'x'.repeat(8000)}).success,true);
  assert.equal(homeLayoutSchema.safeParse({...ok,pinnedPages:Array.from({length:51},(_,i)=>`p${i}`)}).success,false);
  assert.equal(homeLayoutSchema.safeParse({...ok,pinnedCampaigns:Array.from({length:101},(_,i)=>`e:${i}`)}).success,false);
  assert.equal(homeLayoutSchema.safeParse({...ok,todo:Array.from({length:101},(_,i)=>({id:`t${i}`,text:'a',done:false}))}).success,false);
  assert.equal(homeLayoutSchema.safeParse({...ok,todo:[{id:'t1',text:'Stat the leader',done:false,campaignKey:'e:abc'}]}).success,true);
  assert.equal(homeLayoutSchema.safeParse({...ok,options:{campaigns:{count:5}}}).success,false);
  assert.equal(homeLayoutSchema.safeParse({...ok,options:{campaigns:{show:'folder',folderId:'f1',count:12,compact:true},roll:{tables:false}}}).success,true);
});

test('link addresses: web or same-site path only', () => {
  for(const u of ['https://example.com','http://example.com/a?b=1','/maptable','/encyclopedia?entry=1']) assert.equal(isLinkUrl(u),true,u);
  for(const u of ['javascript:alert(1)','data:text/html,x','//evil.com','/\\evil.com','ftp://x.com','example.com','/a b','']) assert.equal(isLinkUrl(u),false,u);
  const links=n=>({widgets:[],links:Array.from({length:n},(_,i)=>({label:`L${i}`,url:'/maptable'}))});
  assert.equal(homeLayoutSchema.safeParse(links(24)).success,true);
  assert.equal(homeLayoutSchema.safeParse(links(25)).success,false);
  assert.equal(homeLayoutSchema.safeParse({widgets:[],links:[{label:'Bad',url:'javascript:alert(1)'}]}).success,false);
});

test('presets keep links, to-dos, notes and pins', () => {
  const mine={...defaultHomeLayout(),links:[{label:'Sheets',url:'https://example.com'}],todo:[{id:'a',text:'Prep',done:false}],notes:'keep',pinnedCampaigns:['e:1'],pinnedPages:['p1'],options:{recent:{count:3}}};
  for(const p of ['standard','gm','minimal']){
    const l=presetLayout(p,mine);
    assert.equal(homeLayoutSchema.safeParse(l).success,true,p);
    assert.deepEqual([l.links,l.todo,l.notes,l.pinnedCampaigns,l.pinnedPages],[mine.links,mine.todo,mine.notes,mine.pinnedCampaigns,mine.pinnedPages],p);
  }
  assert.deepEqual(presetLayout('minimal').widgets,[{type:'links',size:'l'},{type:'campaigns',size:'l'}]);
  assert.equal(presetLayout('gm').widgets.length,12);
  assert.deepEqual(new Set(presetLayout('gm').widgets.map(w=>w.type)),new Set(homeWidgets));
  assert.equal(presetLayout('standard',mine).options,undefined);
});

test('sections are turned on and off, moved and resized', () => {
  let l=defaultHomeLayout({notes:'kept'});
  l=toggleWidget(l,'todo',true);
  assert.deepEqual(l.widgets.at(-1),{type:'todo',size:'s'});
  assert.equal(toggleWidget(l,'todo',true),l);
  l=toggleWidget(l,'continue',false);
  assert.equal(l.widgets.some(w=>w.type==='continue'),false);
  assert.equal(toggleWidget(l,'continue',false),l);
  l=moveWidget(l,l.widgets.length-1,0);
  assert.equal(l.widgets[0].type,'todo');
  assert.equal(moveWidget(l,0,99),l);
  assert.equal(moveWidget(l,1,1),l);
  l=resizeWidget(l,'todo','l');
  assert.equal(l.widgets[0].size,'l');
  l=setOption(setOption(l,'campaigns',{count:12}),'campaigns',{compact:true});
  assert.deepEqual(l.options.campaigns,{count:12,compact:true});
  assert.equal(l.notes,'kept');
});

test('pinned campaigns match by either key', () => {
  assert.equal(isPinnedCampaign(['e:1'],row('e:1',null,'1')),true);
  assert.equal(isPinnedCampaign(['m:9'],row('e:1','9','1')),true);
  assert.equal(isPinnedCampaign(['e:1'],row('m:9','9',null)),false);
  assert.equal(isPinnedCampaign(['e:1'],row('e:1','9','1')),true);
  assert.equal(isPinnedCampaign([],row('e:1',null,'1')),false);
  assert.equal(isPinnedCampaign(undefined,row('e:1',null,'1')),false);
});

test('quick actions change one part and are validated', () => {
  const base=defaultHomeLayout({notes:'n'});
  let l=applyHomeAction(base,{action:'pinCampaign',key:'e:1',on:true});
  assert.deepEqual(l.pinnedCampaigns,['e:1']);
  assert.equal(applyHomeAction(l,{action:'pinCampaign',key:'e:1',on:true}),l);
  assert.deepEqual(applyHomeAction(l,{action:'pinCampaign',key:'e:1',on:false}).pinnedCampaigns,[]);
  l=applyHomeAction(l,{action:'pinPage',id:'p1',on:true});
  assert.deepEqual(l.pinnedPages,['p1']);
  l=applyHomeAction(l,{action:'todo',todo:[{id:'a',text:'x',done:true}]});
  l=applyHomeAction(l,{action:'notes',notes:'hello'});
  l=applyHomeAction(l,{action:'links',links:[{label:'M',url:'/maptable'}]});
  assert.equal(l.notes,'hello');assert.equal(l.todo.length,1);assert.deepEqual(l.pinnedCampaigns,['e:1']);assert.equal(l.links[0].url,'/maptable');
  assert.throws(()=>applyHomeAction(l,{action:'links',links:[{label:'x',url:'javascript:1'}]}));
  assert.throws(()=>applyHomeAction(l,{action:'notes',notes:'x'.repeat(9000)}));
  assert.throws(()=>applyHomeAction(l,{action:'layout',layout:{widgets:[{type:'nope',size:'s'}]}}));
  assert.throws(()=>applyHomeAction(l,{action:'bogus'}));
  assert.deepEqual(applyHomeAction(l,{action:'layout',layout:{widgets:[]}}),{widgets:[]});
});

test('only sections that need the workspaces ask for them', () => {
  assert.equal(needsWorkspaces({widgets:[{type:'links',size:'l'},{type:'notes',size:'s'},{type:'roll',size:'s'},{type:'attention',size:'s'}]}),false);
  assert.equal(needsWorkspaces(defaultHomeLayout()),true);
});
