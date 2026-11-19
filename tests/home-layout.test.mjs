import test from 'node:test';
import assert from 'node:assert/strict';
import {homeLayoutSchema,defaultHomeLayout,presetLayout,toggleWidget,moveWidget,resizeWidget,setWidgetHeight,setOption,isPinnedCampaign,isLinkUrl,applyHomeAction,homeWidgets,needsWorkspaces,MAX_CAMPAIGN_DASHBOARDS,MAX_OPENED} from '../lib/home-layout.ts';

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

test('section heights: 1 to 3, optional, old saves stay valid', () => {
  const ok=h=>homeLayoutSchema.safeParse({widgets:[{type:'links',size:'s',...(h===undefined?{}:{h})}]}).success;
  assert.equal(ok(undefined),true,'a save from before heights');
  for(const h of [1,2,3]) assert.equal(ok(h),true,String(h));
  for(const h of [0,4,2.5,'2',null]) assert.equal(ok(h),false,String(h));
  let l={widgets:[{type:'links',size:'s'},{type:'todo',size:'s'}]};
  l=setWidgetHeight(l,'links',2);
  assert.deepEqual(l.widgets[0],{type:'links',size:'s',h:2});
  assert.equal(resizeWidget(l,'links','l').widgets[0].h,2,'the width change keeps the height');
  assert.deepEqual(setWidgetHeight(l,'links',1).widgets[0],{type:'links',size:'s'},'1 row is left out');
  assert.deepEqual(homeLayoutSchema.parse(l),l);
  // A saved file with no heights at all (written before they existed) reads back unchanged.
  const old={widgets:[{type:'continue',size:'l'},{type:'campaigns',size:'l'}],notes:'n'};
  assert.deepEqual(homeLayoutSchema.parse(old),old);
});

test('GM prep has the new order with tall Quick links and To-do; the other presets are unchanged', () => {
  assert.deepEqual(presetLayout('gm').widgets,[
    {type:'continue',size:'l'},{type:'campaigns',size:'l'},{type:'links',size:'s',h:2},{type:'folders',size:'m'},{type:'quests',size:'m'},{type:'todo',size:'s',h:2},
    {type:'sessions',size:'s'},{type:'attention',size:'s'},{type:'recent',size:'m'},{type:'roll',size:'s'},{type:'pinned',size:'s'},{type:'notes',size:'s'}]);
  assert.equal(homeLayoutSchema.safeParse(presetLayout('gm')).success,true);
  assert.deepEqual(presetLayout('standard').widgets,[{type:'continue',size:'l'},{type:'campaigns',size:'l'},{type:'recent',size:'l'}]);
  assert.deepEqual(presetLayout('minimal').widgets,[{type:'links',size:'l'},{type:'campaigns',size:'l'}]);
  assert.deepEqual(presetLayout('gm').options,{campaigns:{show:'recent',count:8},recent:{count:6},roll:{tables:true}});
});

test('Maptable-only campaign dashboards are stored in the layout, checked and kept by presets', () => {
  const dash={widgets:[{type:'initiative',size:'s',h:2},{type:'roll',size:'s'}],notes:'hi'};
  const base=defaultHomeLayout();
  let l=applyHomeAction(base,{action:'campaignDashboard',key:'m:abc',dashboard:dash});
  assert.deepEqual(l.campaignDashboards,{'m:abc':dash});
  l=applyHomeAction(l,{action:'campaignDashboard',key:'m:def',dashboard:{widgets:[]}});
  assert.deepEqual(Object.keys(l.campaignDashboards),['m:abc','m:def']);
  assert.deepEqual(presetLayout('gm',l).campaignDashboards,l.campaignDashboards,'presets keep them');
  // A layout saved from the page never changes them, even if the page sends none or a stale copy.
  assert.deepEqual(applyHomeAction(l,{action:'layout',layout:{widgets:[]}}).campaignDashboards,l.campaignDashboards);
  assert.deepEqual(applyHomeAction(l,{action:'layout',layout:{widgets:[],campaignDashboards:{'m:zzz':{widgets:[]}}}}).campaignDashboards,l.campaignDashboards);
  assert.equal(applyHomeAction(l,{action:'campaignDashboard',key:'m:abc',dashboard:null}).campaignDashboards['m:abc'],undefined);
  assert.equal('campaignDashboards' in applyHomeAction(applyHomeAction(base,{action:'campaignDashboard',key:'m:abc',dashboard:dash}),{action:'campaignDashboard',key:'m:abc',dashboard:null}),false,'the last one removed leaves no empty object');
  assert.throws(()=>applyHomeAction(base,{action:'campaignDashboard',key:'e:abc',dashboard:dash}),'only Maptable keys');
  assert.throws(()=>applyHomeAction(base,{action:'campaignDashboard',key:'m:abc',dashboard:{widgets:[{type:'nope',size:'s'}]}}));
  assert.throws(()=>applyHomeAction(base,{action:'campaignDashboard',key:'m:abc',dashboard:{widgets:[{type:'links',size:'s',h:9}]}}));
  assert.throws(()=>applyHomeAction(base,{action:'campaignDashboard',key:7,dashboard:dash}));
  const many=n=>Object.fromEntries(Array.from({length:n},(_,i)=>[`m:${i}`,{widgets:[]}]));
  assert.equal(homeLayoutSchema.safeParse({widgets:[],campaignDashboards:many(MAX_CAMPAIGN_DASHBOARDS)}).success,true);
  assert.equal(homeLayoutSchema.safeParse({widgets:[],campaignDashboards:many(MAX_CAMPAIGN_DASHBOARDS+1)}).success,false);
  assert.equal(homeLayoutSchema.safeParse({widgets:[],campaignDashboards:{'e:1':{widgets:[]}}}).success,false);
});

test('a folder always gets the same colour from a small palette', async () => {
  const {folderColor,folderColors}=await import('../lib/folder-color.ts');
  assert.equal(folderColor('abc'),folderColor('abc'));
  const seen=new Set(Array.from({length:60},(_,i)=>folderColor(`folder-${i}`)));
  assert.ok(seen.size>=4,'ids spread over the palette');
  for(const c of seen) assert.ok(folderColors.includes(c));
  assert.ok(folderColors.every(c=>/^#[0-9a-f]{6}$/.test(c)));
});

test('opening a campaign is remembered, newest kept, repeats within a few minutes not saved again', () => {
  const t=m=>new Date(Date.UTC(2026,10,19,12,m)).toISOString();
  let l=applyHomeAction(defaultHomeLayout(),{action:'opened',key:'e:poppy',at:t(0)});
  assert.deepEqual(l.opened,{'e:poppy':t(0)});
  l=applyHomeAction(l,{action:'opened',key:'e:odyssey',at:t(1)});
  assert.deepEqual(l.opened,{'e:odyssey':t(1),'e:poppy':t(0)});
  assert.equal(applyHomeAction(l,{action:'opened',key:'e:odyssey',at:t(5)}),l,'the newest again soon after is no change, so nothing is written');
  assert.equal(applyHomeAction(l,{action:'opened',key:'e:odyssey',at:t(20)}).opened['e:odyssey'],t(20));
  assert.equal(applyHomeAction(l,{action:'opened',key:'e:poppy',at:t(2)}).opened['e:poppy'],t(2),'switching back is saved at once');
  assert.throws(()=>applyHomeAction(l,{action:'opened',key:'odyssey'}),/Choose a campaign/);
  for(let i=0;i<MAX_OPENED+5;i++) l=applyHomeAction(l,{action:'opened',key:`m:c${i}`,at:t(30+i)});
  assert.equal(Object.keys(l.opened).length,MAX_OPENED,'only the newest are kept');
  assert.equal(l.opened['e:poppy'],undefined);
  assert.deepEqual(applyHomeAction(l,{action:'layout',layout:{widgets:[],opened:{}}}).opened,l.opened,'a saved layout never replaces them');
  assert.deepEqual(presetLayout('gm',l).opened,l.opened,'presets keep them');
});
