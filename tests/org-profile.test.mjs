import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSchema,demoWorkspace,playerCampaign,campaignExport,importCopy,searchableText,defaultCharacter} from '../lib/encyclopedia/world-model.ts';
import {applyCoGmEdit,CoGmEditError,coGmRefusal} from '../lib/encyclopedia/co-gm-edit.ts';
import {savePlayerEdit} from '../lib/encyclopedia/player-edit.ts';
import {pageFromTemplate,starterTemplates} from '../lib/encyclopedia/templates.ts';
import {callTool} from '../lib/mcp/tools.ts';
import {addOrgType,applyOrgLayout,boardSegments,defaultLayout,defaultOrg,layoutOf,layOutOrg,moveBlockBy,newBlock,orgMembersOf,orgOf,orgProfileText,placeBlock,playerOrg,switchColumn} from '../lib/encyclopedia/org-profile.ts';
import {playerText} from '../lib/encyclopedia/world-model.ts';

const C='demo-campaign',T='2026-11-14T10:00:00.000Z',IMG='0b5f6a8e-3c1d-4f2a-9b7e-1a2b3c4d5e6f',IMG2='1c6a7b9f-4d2e-4a3b-8c8f-2b3c4d5e6f70';
const page=(id,title,kind,extra={})=>({id,worldId:'demo-world',campaignId:C,parentId:null,title,kind,body:'',updatedAt:T,...extra});
const char=(id,title,extra={})=>page(id,title,'character',{character:defaultCharacter(),...extra});

/** The demo world plus Saltmere Barge Union, its people and the places it holds. */
function world({org,union={}}={}){
 const s=demoWorkspace();
 s.entries.push(
  char('ostra','Reeve Ostra Hale',{overviewVisibility:'players'}),
  char('bram','Bram the ferryman',{overviewVisibility:'players'}),
  char('veil','The Quiet Buyer'),
  page('barge','The Salt Barge','place',{overviewVisibility:'players'}),
  page('vault','The Counting Vault','place'),
  page('wardens','The Lantern Wardens','faction',{parentId:'union',overviewVisibility:'players'}),
  page('union','Saltmere Barge Union','faction',{overviewVisibility:'players',org,...union}),
 );
 return s;
}
const get=(s,id)=>s.entries.find(e=>e.id===id);
const rich=()=>{
 const o=defaultOrg();
 o.type='Toll guild';o.motto='Every barge pays.\n::: secret\nExcept ours.\n:::';o.visibility='players';
 o.emblem={shape:'banner',symbol:'anchor',colour:'#3b6fb6',mapColour:'#2f7f6b'};
 o.banner={imageId:IMG};
 o.blocks=o.blocks.map(b=>{
  if(b.kind==='spots')return {...b,spots:[
   {id:'wc',title:'Warden-Captains',people:[{id:'p1',entryId:'ostra',note:'Holds the toll gate',standing:'loyal'},{id:'p2',entryId:'veil',note:'Takes bribes',standing:'wary'},{id:'p3',entryId:'bram',gm:true,note:'Informer'}]},
   {id:'spy',title:'The Quiet Seat',gm:true,people:[{id:'p4',entryId:'ostra'}]}]};
  if(b.kind==='members')return {...b,members:[{id:'m1',entryId:'bram',role:'Ferry-warden',standing:'friendly'},{id:'m2',entryId:'veil',role:'Fixer',standing:'hostile'},{id:'m3',entryId:'ostra',role:'Secret paymaster',gm:true}]};
  if(b.kind==='facts')return {...b,facts:[{id:'seat',label:'Seat of power',value:'Greyfen',entryId:'barge'},{id:'f2',label:'Strength',value:'Forty barges',entryId:'vault'},{id:'f3',label:'Debt',value:'Owes the Crown\n::: secret\nA fortune\n:::',gm:false},{id:'f4',label:'Secret',value:'Hidden vault',gm:true}]};
  if(b.kind==='beliefs')return {...b,beliefs:[{id:'b1',topic:'Authority',stance:'Earned by service',detail:'Rank follows river miles.'},{id:'b2',topic:'Debt',stance:'Never forgiven',detail:'',gm:true}]};
  if(b.kind==='holdings')return {...b,holdings:[{id:'h1',entryId:'barge'},{id:'h2',entryId:'vault'},{id:'h3',entryId:'bram',gm:true}]};
  return b;});
 o.blocks.push({id:'linked',kind:'linked',title:'Linked pages',column:'right'},{id:'gmnote',kind:'text',title:'Plans',gm:true,column:'right',text:'Sell the tolls.'},{id:'note',kind:'text',title:'History',column:'left',text:'Founded by bargemen.\n::: secret\nBought a judge.\n:::'});
 o.bar.fields=o.bar.fields.map(f=>f.id==='wants'?{...f,value:'Clear the river'}:f.id==='plan'?{...f,value:'Take the Counting Vault'}:f.id==='rumour'?{...f,value:'Wardens skim the tolls'}:f);
 return o;
};

test('the default profile has the six blocks in two columns and the Right now bar', () => {
 const o=defaultOrg();
 assert.deepEqual(o.blocks.map(b=>[b.title,b.kind,b.column]),[['Leadership','spots','left'],['Subgroups','subgroups','left'],['Members','members','left'],['At a glance','facts','right'],['Beliefs','beliefs','right'],['Holdings','holdings','right']]);
 assert.deepEqual(o.blocks.find(b=>b.kind==='facts').facts.map(f=>f.label),['Seat of power','Founded','Motto']);
 assert.equal(o.bar.title,'Right now');
 assert.deepEqual(o.bar.fields.map(f=>[f.label,!!f.gm]),[['Wants',false],['Plan',true],['Trouble',true],['Rumour',false]]);
 assert.equal(o.visibility,'gm');
 assert.equal(workspaceSchema.safeParse(world({org:o})).success,true);
});

test('a new organization starts from the world layout, and an older page shows the same default', () => {
 const s=world();
 const layout={blocks:[{id:'a',kind:'members',title:'Crew',column:'right',full:true},{id:'b',kind:'text',title:'Creed',column:'left'}],bar:{title:'This week',fields:[{id:'x',label:'Goal'},{id:'y',label:'Fear',gm:true}]}};
 const w=applyOrgLayout(s,'demo-world',layout);
 assert.deepEqual(w.worlds[0].orgLayout,layout);
 const fresh=defaultOrg(w.worlds[0]);
 assert.deepEqual(fresh.blocks.map(b=>[b.id,b.kind,b.title,b.column,!!b.full]),[['a','members','Crew','right',true],['b','text','Creed','left',false]]);
 assert.deepEqual(fresh.bar.fields.map(f=>[f.label,!!f.gm,f.value]),[['Goal',false,''],['Fear',true,'']]);
 assert.equal(fresh.bar.title,'This week');
 // pages made from the Organization template get it too
 const t=starterTemplates(()=>crypto.randomUUID()).find(x=>x.kind==='faction');
 assert.equal(t.name,'Organization');
 const made=pageFromTemplate(t,{id:'n1',title:'New',worldId:'demo-world',campaignId:C,parentId:null,newId:()=>crypto.randomUUID(),org:fresh});
 assert.deepEqual(made.org,fresh);
 assert.equal(pageFromTemplate({...t,kind:'place'},{id:'n2',title:'P',worldId:'demo-world',campaignId:C,parentId:null,newId:()=>'x',org:fresh}).org,undefined);
 // a page with no profile yet shows the world's layout, and the default when there is none
 assert.deepEqual(orgOf(get(w,'union'),w.worlds[0]),fresh);
 assert.deepEqual(orgOf(get(s,'union'),s.worlds[0]),defaultOrg());
 assert.equal(get(s,'union').org,undefined,'nothing is migrated');
});

test('the schema keeps a profile on organizations, inside their world and campaign, and with unique ids', () => {
 const ok=world({org:rich()});
 assert.equal(workspaceSchema.safeParse(ok).success,true);
 // org on a page that is not a faction
 const note={...ok,entries:ok.entries.map(e=>e.id==='barge'?{...e,org:rich()}:e)};
 assert.equal(workspaceSchema.safeParse(note).success,false);
 // a person in another campaign
 const away={...ok,entries:[...ok.entries,char('far','Far away',{campaignId:'demo-campaign-two'})]};
 const point=(s,patch)=>({...s,entries:s.entries.map(e=>e.id==='union'?{...e,org:patch(e.org)}:e)});
 const addMember=(entryId)=>o=>({...o,blocks:o.blocks.map(b=>b.kind==='members'?{...b,members:[...b.members,{id:'zz',entryId}]}:b)});
 assert.equal(workspaceSchema.safeParse(point(away,addMember('far'))).success,false);
 // a member that is not a character
 assert.equal(workspaceSchema.safeParse(point(ok,addMember('barge'))).success,false);
 // a holding or a fact link in another campaign
 const holding=o=>({...o,blocks:o.blocks.map(b=>b.kind==='holdings'?{...b,holdings:[...b.holdings,{id:'zz',entryId:'far'}]}:b)});
 assert.equal(workspaceSchema.safeParse(point(away,holding)).success,false);
 const fact=o=>({...o,blocks:o.blocks.map(b=>b.kind==='facts'?{...b,facts:[...b.facts,{id:'zz',label:'Hq',value:'',entryId:'far'}]}:b)});
 assert.equal(workspaceSchema.safeParse(point(away,fact)).success,false);
 // shared lore may only point at shared lore
 const lore=point({...ok,entries:ok.entries.map(e=>e.id==='union'?{...e,campaignId:null,parentId:null}:e)},o=>o);
 assert.equal(workspaceSchema.safeParse(lore).success,false,'a shared organization cannot name a campaign page');
 // duplicate ids
 assert.equal(workspaceSchema.safeParse(point(ok,o=>({...o,blocks:[...o.blocks,{...o.blocks[0]}]}))).success,false);
 assert.equal(workspaceSchema.safeParse(point(ok,o=>({...o,bar:{...o.bar,fields:[...o.bar.fields,{...o.bar.fields[0]}]}}))).success,false);
 assert.equal(workspaceSchema.safeParse(point(ok,addMember('bram')&&(o=>({...o,blocks:o.blocks.map(b=>b.kind==='members'?{...b,members:[...b.members,{...b.members[0]}]}:b)})))).success,false);
 // one Subgroups block, at most 20 blocks, at most 6 bar fields, bad colours
 assert.equal(workspaceSchema.safeParse(point(ok,o=>({...o,blocks:[...o.blocks,newBlock('subgroups')]}))).success,false);
 assert.equal(workspaceSchema.safeParse(point(ok,o=>({...o,blocks:Array.from({length:21},(_,i)=>({...newBlock('text'),id:'t'+i}))}))).success,false);
 assert.equal(workspaceSchema.safeParse(point(ok,o=>({...o,bar:{...o.bar,fields:Array.from({length:7},(_,i)=>({id:'f'+i,label:'L',value:''}))}}))).success,false);
 assert.equal(workspaceSchema.safeParse(point(ok,o=>({...o,emblem:{...o.emblem,colour:'blue'}}))).success,false);
 assert.equal(workspaceSchema.safeParse(point(ok,o=>({...o,type:'x'.repeat(61)}))).success,false);
 // a missing page (deleted later) is tolerated, like a quest giver
 assert.equal(workspaceSchema.safeParse(point(ok,addMember('gone'))).success,true);
 // world: layout and types
 assert.equal(workspaceSchema.safeParse({...ok,worlds:[{...ok.worlds[0],orgTypes:Array.from({length:61},(_,i)=>'T'+i)}]}).success,false);
});

test('custom types are kept once for the world', () => {
 let s=world();
 s=addOrgType(s,'demo-world','Ferry cooperative');
 s=addOrgType(s,'demo-world','ferry cooperative');
 s=addOrgType(s,'demo-world','Guild');
 assert.deepEqual(s.worlds[0].orgTypes,['Ferry cooperative']);
});

test('arranging for the whole world keeps every organization\'s own content', () => {
 const s=world({org:rich()});
 // a second organization with its own people, arranged differently, and a lazy one with no profile
 const other=defaultOrg();
 other.blocks=other.blocks.map(b=>b.kind==='members'?{...b,id:'crew',members:[{id:'k',entryId:'bram',role:'Cook'}]}:b);
 other.bar.fields=other.bar.fields.map(f=>f.id==='trouble'?{...f,value:'The ice'}:f);
 const s2={...s,entries:s.entries.map(e=>e.id==='wardens'?{...e,org:other}:e)};
 // lay out: members first, in the right column, full width; text moved; spots dropped; a new beliefs block
 const layout=layoutOf(get(s2,'union').org);
 const arranged={...layout,blocks:[{id:'members',kind:'members',title:'Crew',column:'right',full:true,gm:true},...layout.blocks.filter(b=>b.kind==='beliefs'||b.id==='note')].map(b=>b.id==='note'?{...b,column:'right'}:b),bar:{...layout.bar,title:'Today',fields:[...layout.bar.fields.filter(f=>f.id!=='plan'),{id:'mood',label:'Mood'}]}};
 const next=applyOrgLayout(s2,'demo-world',arranged,'2026-11-15T00:00:00.000Z');
 assert.equal(workspaceSchema.safeParse(next).success,true);
 assert.deepEqual(next.worlds[0].orgLayout.bar.title,'Today');
 const union=get(next,'union').org,wardens=get(next,'wardens').org;
 assert.deepEqual(union.blocks.slice(0,3).map(b=>[b.id,b.title,b.column,!!b.full,!!b.gm]),[['members','Crew','right',true,true],['beliefs','Beliefs','right',false,false],['note','History','right',false,false]]);
 assert.equal(union.blocks[0].members.length,3,'members keep their people');
 assert.equal(union.blocks[1].beliefs.length,2);
 assert.equal(union.blocks[2].text.startsWith('Founded by bargemen'),true);
 // blocks the layout dropped that hold something stay at the end; empty ones go
 const leftovers=union.blocks.slice(3).map(b=>b.id);
 assert.ok(leftovers.includes('leadership')&&leftovers.includes('glance')&&leftovers.includes('holdings')&&leftovers.includes('gmnote'));
 assert.equal(union.blocks.some(b=>b.kind==='subgroups'),false,'an empty dropped block is gone');
 // the bar: renamed, values kept by id, the new field empty, Plan (removed from the layout) kept because it holds a value
 assert.equal(union.bar.title,'Today');
 assert.equal(union.bar.fields.find(f=>f.id==='wants').value,'Clear the river');
 assert.equal(union.bar.fields.find(f=>f.id==='mood').value,'');
 assert.equal(union.bar.fields.find(f=>f.id==='plan').value,'Take the Counting Vault');
 // the other organization matches blocks by kind when ids differ, and keeps its text
 assert.deepEqual(wardens.blocks.find(b=>b.kind==='members').members,[{id:'k',entryId:'bram',role:'Cook'}]);
 assert.equal(wardens.blocks[0].id,'crew');
 assert.equal(wardens.bar.fields.find(f=>f.id==='trouble').value,'The ice');
 assert.equal(get(next,'wardens').updatedAt,'2026-11-15T00:00:00.000Z');
 // other worlds and non-organizations are untouched
 assert.deepEqual(get(next,'barge'),get(s2,'barge'));
 const again=applyOrgLayout(next,'demo-world',next.worlds[0].orgLayout);
 assert.deepEqual(get(again,'union').org,union,'applying the same layout twice changes nothing');
});

test('moving blocks between columns, rows and positions', () => {
 const o=defaultOrg(),ids=bs=>bs.map(b=>b.id);
 assert.deepEqual(boardSegments(o.blocks).map(s=>[ids(s.left),ids(s.right)]),[[['leadership','subgroups','members'],['glance','beliefs','holdings']]]);
 const wide=o.blocks.map(b=>b.id==='beliefs'?{...b,full:true}:b);
 const segs=boardSegments(wide);
 assert.equal(segs.length,3);assert.equal(segs[1].full.id,'beliefs');assert.equal(segs[0].endsBefore,'beliefs');
 assert.deepEqual(ids(moveBlockBy(o.blocks,'members',-1)).slice(0,3),['leadership','members','subgroups']);
 assert.deepEqual(ids(moveBlockBy(o.blocks,'glance',-1)),ids(o.blocks),'the first block of the right column cannot go up');
 assert.deepEqual(ids(moveBlockBy(o.blocks,'members',1)),ids(o.blocks),'the last block of its column cannot go down');
 const dropped=placeBlock(o.blocks,'beliefs','leadership','left');
 assert.equal(dropped[0].id,'beliefs');assert.equal(dropped[0].column,'left');
 assert.equal(switchColumn(o.blocks,'members').find(b=>b.id==='members').column,'right');
 assert.equal(ids(placeBlock(o.blocks,'leadership',null)).at(-1),'leadership');
});

const readableOnly=ids=>id=>ids.includes(id);
test('players get an allowlisted profile without GM-only blocks, items, bar fields or unreadable pages', () => {
 const s=world({org:rich()});
 const shared=playerCampaign(s,C);
 const pe=shared.entries.find(e=>e.id==='union').org;
 assert.ok(pe,'a shared profile is sent');
 const flat=JSON.stringify(pe);
 // GM-only: the Plans block, the Quiet Seat spot, Bram as informer, the secret paymaster, a GM-only fact, belief, holding and bar fields
 assert.equal(pe.blocks.some(b=>b.id==='gmnote'),false);
 const spots=pe.blocks.find(b=>b.kind==='spots').spots;
 assert.deepEqual(spots.map(x=>x.title),['Warden-Captains']);
 assert.deepEqual(spots[0].people.map(p=>p.entryId),['ostra'],'GM-only person and unreadable character are left out');
 assert.deepEqual(spots[0].people[0],{id:'p1',entryId:'ostra',title:'Reeve Ostra Hale',note:'Holds the toll gate',standing:'loyal'});
 assert.deepEqual(pe.blocks.find(b=>b.kind==='members').members.map(m=>m.entryId),['bram']);
 const facts=pe.blocks.find(b=>b.kind==='facts').facts;
 assert.deepEqual(facts.map(f=>f.label),['Seat of power','Strength','Debt']);
 assert.equal(facts[0].entryId,'barge','a link to a readable page stays');
 assert.equal(facts[1].entryId,undefined,'a link to an unreadable page goes but the words stay');
 assert.equal(facts[1].value,'Forty barges');
 assert.deepEqual(pe.blocks.find(b=>b.kind==='beliefs').beliefs.map(b=>b.topic),['Authority']);
 assert.deepEqual(pe.blocks.find(b=>b.kind==='holdings').holdings.map(h=>h.entryId),['barge']);
 assert.deepEqual(pe.bar.fields.map(f=>f.label),['Wants','Rumour']);
 // secrets in text are stripped
 assert.equal(flat.includes('Except ours'),false);assert.equal(flat.includes('Bought a judge'),false);assert.equal(flat.includes('A fortune'),false);
 assert.equal(pe.motto,'Every barge pays.');
 assert.equal(pe.blocks.find(b=>b.id==='note').text,'Founded by bargemen.');
 // nothing GM-only leaks anywhere in the payload
 for(const secret of ['Informer','Takes bribes','Secret paymaster','Hidden vault','Never forgiven','Sell the tolls','Take the Counting Vault','Quiet Seat','The Quiet Buyer','Counting Vault'])assert.equal(JSON.stringify(shared).includes(secret),false,secret);
 // the emblem and banner pictures are sent so players can load them
 assert.equal(pe.banner.imageId,IMG);assert.deepEqual(Object.keys(pe).sort(),['banner','bar','blocks','emblem','motto','type']);
 // subgroups: only readable child organization pages, with the members players can read
 const sub=pe.blocks.find(b=>b.kind==='subgroups').subgroups;
 assert.deepEqual(sub.map(g=>g.id),['wardens']);
 // linked pages: readable pages that link here (secrets and GM-only tabs don't count)
 const withLinks={...s,entries:s.entries.map(e=>e.id==='barge'?{...e,body:'Owned by [[union|the Union]].'}:e.id==='bram'?{...e,body:'::: secret\nWorks for [[union]].\n:::'}:e.id==='vault'?{...e,body:'[[union]]'}:e)};
 const l=playerCampaign(withLinks,C).entries.find(e=>e.id==='union').org.blocks.find(b=>b.kind==='linked').linked;
 assert.deepEqual(l,[{id:'barge',title:'The Salt Barge'}],'the barge is readable and links; Bram only in a secret; the vault is GM-only');
});

test('players don\'t get the profile when the tab is GM only, and a hidden bar stays hidden', () => {
 const gm=world({org:{...rich(),visibility:'gm'}});
 assert.equal(playerCampaign(gm,C).entries.find(e=>e.id==='union').org,undefined);
 const hidden=world({org:{...rich(),bar:{...rich().bar,hidden:true}}});
 assert.equal(playerCampaign(hidden,C).entries.find(e=>e.id==='union').org.bar,undefined);
 // a shared Profile on a page whose Overview is GM only still reaches players
 const quiet=world({org:rich(),union:{overviewVisibility:'gm'}});
 assert.ok(playerCampaign(quiet,C).entries.find(e=>e.id==='union')?.org);
 // not another campaign's players
 assert.equal(playerCampaign(world({org:rich(),union:{campaignId:'demo-campaign-two'}}),C).entries.some(e=>e.id==='union'),false);
});

test('playerOrg is pure: it works from the readable set and the text cleaner alone', () => {
 const o=rich(),pe=playerOrg(o,readableOnly(['ostra']),playerText,{title:id=>id.toUpperCase()});
 assert.deepEqual(pe.blocks.find(b=>b.kind==='spots').spots[0].people.map(p=>p.title),['OSTRA']);
 assert.equal(pe.blocks.find(b=>b.kind==='subgroups').subgroups.length,0);
 assert.equal(pe.blocks.find(b=>b.kind==='members').members.length,0);
 assert.equal(playerOrg({...o,blocks:o.blocks.map(b=>b.id==='note'?{...b,text:'::: secret\nall of it\n:::'}:b)},()=>true,playerText).blocks.some(b=>b.id==='note'),false,'a text block that is all secret is not sent');
});

test('members of an organization can be listed for the subgroup stacks', () => {
 const o=rich();
 assert.deepEqual(orgMembersOf(o),['ostra','veil','bram']);
 assert.deepEqual(orgMembersOf(o,(id,gm)=>!gm&&id!=='veil'),['ostra','bram'],'GM-only entries and anyone filtered out are left off');
 assert.deepEqual(orgMembersOf(undefined),[]);
});

test('a co-GM edits a profile but not the world\'s layout or types, and only uses pictures in the campaign', () => {
 const full=world({org:rich()});
 const mine=()=>structuredClone(campaignExport(full,C));
 // the profile itself: fine
 const a=mine();a.entries.find(e=>e.id==='union').org.motto='New words';
 assert.equal(get(applyCoGmEdit(full,C,a),'union').org.motto,'New words');
 // new subgroup with its own default profile: fine
 const b=mine();b.entries.push(page('sub','Toll collectors','faction',{parentId:'union',org:defaultOrg(b.worlds[0])}));
 assert.ok(get(applyCoGmEdit(full,C,b),'sub').org);
 // the world layout and custom types: refused
 const c=mine();c.worlds[0]={...c.worlds[0],orgLayout:defaultLayout()};
 assert.throws(()=>applyCoGmEdit(full,C,c),e=>e instanceof CoGmEditError&&/world/i.test(e.message));
 const d=mine();d.worlds[0]={...d.worlds[0],orgTypes:['Ferry cooperative']};
 assert.throws(()=>applyCoGmEdit(full,C,d),CoGmEditError);
 assert.match(coGmRefusal(campaignExport(full,C),workspaceSchema.parse(c)),/world/i);
 // pictures are found by the imageId key: an emblem or banner picture from outside the campaign is refused
 const e=mine();e.entries.find(x=>x.id==='union').org.emblem.imageId=IMG2;
 assert.throws(()=>applyCoGmEdit(full,C,e),e2=>e2 instanceof CoGmEditError&&/picture/i.test(e2.message));
 assert.doesNotThrow(()=>applyCoGmEdit(full,C,e,new Set([IMG2])));
 const f=mine();f.entries.find(x=>x.id==='union').org.banner={imageId:IMG2};
 assert.throws(()=>applyCoGmEdit(full,C,f),CoGmEditError);
});

test('a player editing a page never changes its profile', () => {
 const full=world({org:rich()});
 const rights={edit:new Set(['union']),subPages:new Set(),made:new Set()};
 const next=savePlayerEdit(full,C,rights,{entryId:'union',title:'Saltmere Union',tabs:[{id:'overview',body:'Our own words.'}]},{name:'Mara',as:'player'},new Date('2026-11-14T12:00:00Z'));
 assert.deepEqual(get(next,'union').org,rich());
 assert.equal(get(next,'union').body,'Our own words.');
});

test('Ctrl K finds the type, motto and the words in facts, beliefs and spots', () => {
 const s=world({org:rich()}),e=get(s,'union');
 for(const word of ['Toll guild','Every barge pays','Forty barges','Earned by service','Rank follows river miles','Warden-Captains','Holds the toll gate','Ferry-warden'])assert.ok(searchableText(e).includes(word),word);
});

test('importing a campaign copy points the profile at the new page ids', () => {
 const s=world({org:rich()}),out=importCopy({schemaVersion:1,worlds:[],campaigns:[],entries:[]},campaignExport(s,C));
 const union=out.entries.find(e=>e.title==='Saltmere Barge Union'),ostra=out.entries.find(e=>e.title==='Reeve Ostra Hale');
 const people=union.org.blocks.find(b=>b.kind==='spots').spots[0].people;
 assert.equal(people[0].entryId,ostra.id);assert.notEqual(people[0].entryId,'ostra');
 assert.equal(union.org.banner.imageId,IMG,'pictures keep their ids');
});

test('the AI connection can create an organization with a profile and read it back as text', async () => {
 const s=world({org:rich()}),book=campaignExport(s,C);
 const base={book,campaign:book.campaigns[0],maps:null,level:'assist'};
 let saved;
 const commit=async(tool,change)=>{const r=change(s,base,new Date(T));saved=r.next;return {reply:r.reply};};
 const out=await callTool({...base,commit},'create_page',{title:'Greyfen Dockers',kind:'faction'});
 assert.equal(out.isError??false,false);
 assert.deepEqual(saved.entries.find(e=>e.title==='Greyfen Dockers').org,defaultOrg(s.worlds[0]));
 const read=await callTool(base,'read_page',{page:'Saltmere Barge Union'});
 const text=JSON.parse(read.content[0].text.replace(/^Campaign text.*\n/,'')).profile;
 assert.match(text,/Toll guild/);assert.match(text,/Reeve Ostra Hale/);assert.match(text,/\[GM only\]/);assert.match(text,/Right now: .*Wants: Clear the river/);
 assert.ok(text.length<4001);
 assert.equal(orgProfileText(undefined,()=>''),undefined);
});

test('layOutOrg leaves a profile alone when its layout already matches', () => {
 const o=rich();
 assert.deepEqual(layOutOrg(o,layoutOf(o)),o);
});

test('laying out a layout with a new block of a kind the page already has never duplicates ids', () => {
 const o=defaultOrg();
 // the layout puts a new Facts block (new id) ahead of At a glance, and a new Goal field ahead of Wants
 const layout=layoutOf(o);
 layout.blocks=[{id:'extra',kind:'facts',title:'Extra',column:'left'},...layout.blocks];
 layout.bar.fields=[{id:'goal',label:'Wants'},...layout.bar.fields];
 const out=layOutOrg(o,layout);
 assert.equal(new Set(out.blocks.map(b=>b.id)).size,out.blocks.length);
 assert.equal(new Set(out.bar.fields.map(f=>f.id)).size,out.bar.fields.length);
 assert.deepEqual(out.blocks.map(b=>b.id),layout.blocks.map(b=>b.id));
 // the exact-id block keeps its own content, not the one that matched by kind
 const withFacts={...o,blocks:o.blocks.map(b=>b.id==='glance'?{...b,facts:[{id:'k',label:'Seat',value:'Greyfen'}]}:b),bar:{...o.bar,fields:o.bar.fields.map(f=>f.id==='wants'?{...f,value:'Peace'}:f)}};
 const kept=layOutOrg(withFacts,layout);
 assert.equal(kept.blocks.find(b=>b.id==='glance').facts[0].value,'Greyfen');
 assert.equal(kept.bar.fields.find(f=>f.id==='wants').value,'Peace');
 const s=world({org:withFacts});
 assert.equal(workspaceSchema.safeParse(applyOrgLayout(s,'demo-world',layout)).success,true);
});
