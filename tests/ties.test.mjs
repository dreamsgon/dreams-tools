import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSchema,demoWorkspace,playerCampaign,campaignExport,importCopy,searchableText,defaultCharacter} from '../lib/encyclopedia/world-model.ts';
import {builtInTieTypes,tieTypesOf,tieTypeById,withTieType,withoutTieType,tieFits,tieLabel,remapTies} from '../lib/encyclopedia/ties.ts';
import {pageTies,workedOutTies,playerTies,tieTypeUse,tiesText,tiePages} from '../lib/encyclopedia/tie-connections.ts';
import {putTie,removeTie,setProfileTie,saveTieType,dropTieType,tieChoices,canHoldTie} from '../lib/encyclopedia/tie-edit.ts';
import {defaultProfile} from '../lib/encyclopedia/character-profile.ts';
import {callTool} from '../lib/mcp/tools.ts';
import {narrow} from '../lib/mcp/players-only.ts';
import {presets} from '../lib/mcp/permissions.ts';

const C='demo-campaign',W='demo-world',T='2026-11-14T10:00:00.000Z',LATER='2026-11-14T12:00:00.000Z';
const page=(id,title,kind,extra={})=>({id,worldId:W,campaignId:C,parentId:null,title,kind,body:'',updatedAt:T,overviewVisibility:'players',...extra});
const char=(id,title,extra={})=>page(id,title,'character',{character:defaultCharacter(),...extra});
const get=(s,id)=>s.entries.find(e=>e.id===id);
const put=(s,id,patch)=>({...s,entries:s.entries.map(e=>e.id===id?{...e,...patch}:e)});
const tie=(id,toId,typeId,extra={})=>({id,toId,typeId,...extra});
const valid=s=>{const r=workspaceSchema.safeParse(s);return r.success?true:r.error.issues[0].message;};
const titleOf=s=>id=>get(s,id)?.title??'';

/** A family (Aldric and Mira, parents of Wren and Pell; Pell's other parent is Sorrel), a ship, a port and some lore. */
function world(){
 const s=demoWorkspace();
 s.entries.push(
  char('aldric','Aldric Vane',{ties:[tie('t1','wren','parent'),tie('t2','pell','parent'),tie('t3','mira','partner',{since:'Year 1102',feelFrom:'loyal',feelTo:'friendly'})]}),
  char('mira','Mira Vane',{ties:[tie('t4','wren','parent'),tie('t5','aldric','debt',{gm:true,note:'Her dowry paid his gambling debts',cover:{typeId:'trade',note:'They run the ferry together'}})]}),
  char('sorrel','Sorrel Ashe',{ties:[tie('t6','pell','parent')],overviewVisibility:'gm'}),
  char('wren','Wren Vane'),
  char('pell','Pell Ashe-Vane'),
  char('hidden','The Quiet Buyer',{overviewVisibility:'gm'}),
  page('port','Saltmere Quay','place'),
  page('ship','The Gull','vehicle',{ties:[tie('t7','port','based',{note:'Moored at [[Saltmere Quay]] by the salt sheds'})]}),
  page('wardens','The Lantern Wardens','faction',{ties:[tie('t8','aldric','employs',{gm:true})]}),
  page('blade','The Ember Blade','lore',{campaignId:null}),
 );
 return s;
}

test('ties and kinds of tie pass the schema, and bad ones are refused', () => {
 const s=world();
 assert.equal(valid(s),true);
 assert.match(String(valid(put(s,'wren',{ties:[tie('x','nowhere-kind','no-such-kind')]}))),/kind of tie/);
 assert.match(String(valid(put(s,'wren',{ties:[tie('x','wren','knows')]}))),/itself/);
 assert.match(String(valid(put(s,'wren',{ties:[tie('x','pell','knows'),tie('x','aldric','knows')]}))),/unique/);
 // A shared lore page may not point into one campaign.
 assert.match(String(valid(put(s,'blade',{ties:[tie('x','aldric','linked')]}))),/outside/);
 // A People tie must use a kind the world has.
 const profile={...defaultProfile(),blocks:[{id:'b1',kind:'ties',title:'People',column:'right',ties:[{id:'p1',entryId:'pell',typeId:'nope'}]}]};
 assert.match(String(valid(put(s,'wren',{profile}))),/kind of tie/);
 // A world's own kinds.
 const sail={id:'sail',name:'Sails from',reverse:'Home port of',group:'belonging',from:['vehicle'],to:['place'],custom:true};
 const withSail={...s,worlds:s.worlds.map(w=>({...w,tieTypes:[sail]}))};
 assert.equal(valid(put(withSail,'ship',{ties:[tie('t7','port','sail')]})),true);
 assert.notEqual(valid({...s,worlds:s.worlds.map(w=>({...w,tieTypes:[sail,sail]}))}),true,'ids are unique');
});

test('a world keeps only the kinds it changed, and can put a built-in kind back', () => {
 assert.equal(tieTypesOf(undefined).length,builtInTieTypes.length);
 const parent=builtInTieTypes.find(t=>t.id==='parent');
 assert.equal(withTieType(undefined,{...parent}),undefined,'an unchanged built-in kind is not stored');
 const saved=withTieType(undefined,{...parent,name:'Sire of',reverse:'Get of'});
 assert.deepEqual(saved.map(t=>t.name),['Sire of']);
 assert.equal(saved[0].custom,undefined);
 const types=tieTypesOf({tieTypes:saved});
 assert.equal(types.length,builtInTieTypes.length);
 assert.equal(tieTypeById(types,'parent').name,'Sire of');
 assert.equal(tieLabel(tieTypeById(types,'parent'),false),'Get of');
 const mine=withTieType(saved,{id:'haunt',name:'Haunts',reverse:'Haunted by',group:'other',from:['character'],to:['place','vehicle']});
 assert.equal(mine.find(t=>t.id==='haunt').custom,true);
 assert.equal(tieTypesOf({tieTypes:mine}).at(-1).name,'Haunts');
 assert.equal(withoutTieType(withoutTieType(mine,'parent'),'haunt'),undefined);
 assert.equal(tieTypeById(types,'gone').id,'linked','a missing kind reads as Connected to');
 assert.ok(tieFits(tieTypeById(types,'based'),'vehicle','place'));
 assert.ok(!tieFits(tieTypeById(types,'parent'),'character','place'));
});

test('a page lists its ties both ways, named from its own end, with People ties as Knows', () => {
 let s=world();
 s=put(s,'wren',{profile:{...defaultProfile(),blocks:[{id:'b1',kind:'ties',title:'People',column:'right',ties:[{id:'p1',entryId:'pell',note:'Best friend'},{id:'p2',entryId:'mira',typeId:'mentor'}]}]}});
 assert.equal(valid(s),true);
 const wren=pageTies(s,get(s,'wren'));
 assert.deepEqual(wren.map(x=>[titleOf(s)(x.otherId),x.label,x.source]),[
  ['Aldric Vane','Child of','tie'],['Mira Vane','Child of','tie'],['Mira Vane','Mentor of','profile'],['Pell Ashe-Vane','Knows','profile']]);
 const mira=pageTies(s,get(s,'mira'));
 assert.ok(mira.some(x=>x.otherId==='wren'&&x.label==='Student of'));
 assert.ok(mira.some(x=>x.otherId==='aldric'&&x.label==='Owes a debt to'));
 assert.ok(pageTies(s,get(s,'aldric')).some(x=>x.otherId==='mira'&&x.label==='Is owed by'));
 assert.ok(pageTies(s,get(s,'port')).some(x=>x.otherId==='ship'&&x.label==='Base of'));
 // Shared lore read inside a campaign sees that campaign's ties to it.
 s=put(s,'aldric',{ties:[...get(s,'aldric').ties,tie('t9','blade','carries')]});
 assert.equal(valid(s),true);
 assert.deepEqual(pageTies(s,get(s,'blade'),undefined,C).map(x=>x.label),['Carried by']);
 assert.deepEqual(pageTies(s,get(s,'blade')).map(x=>x.label),[],'outside a campaign it sees only shared lore');
 assert.ok(tiePages(s,get(s,'blade'),C).some(e=>e.id==='aldric'));
});

test('siblings and half-siblings are worked out from shared parents, and other parts of the workspace count too', () => {
 const s=world();
 const wren=workedOutTies(s,get(s,'wren'));
 assert.deepEqual(wren.filter(w=>w.source==='family').map(w=>[w.otherId,w.label]),[['pell','Half-sibling of']]);
 // Give Pell Mira as a parent too, and drop Sorrel: now they are full siblings.
 let full=put(s,'mira',{ties:[...get(s,'mira').ties,tie('t10','pell','parent')]});
 full=put(full,'sorrel',{ties:undefined});
 assert.deepEqual(workedOutTies(full,get(full,'wren')).filter(w=>w.source==='family').map(w=>w.label),['Sibling of']);
 // A sibling tie already said is not worked out again.
 const said=put(full,'wren',{ties:[tie('t11','pell','sibling')]});
 assert.equal(workedOutTies(said,get(said,'wren')).filter(w=>w.source==='family').length,0);
 // Vehicles and quests.
 const v={...s,entries:[...s.entries,page('q','The Salt Debt','quest',{quest:{state:'active',objectives:[],log:[],giverId:'aldric'}})]};
 const aldric=workedOutTies(v,get(v,'aldric'));
 assert.ok(aldric.some(w=>w.source==='quest'&&w.label==='Gave this quest'));
});

test('players see shared ties and cover stories, never GM-only ties or pages they cannot read', () => {
 const s=world();
 const readable=new Set(['aldric','mira','wren','pell','port','ship','wardens']);
 const clean=t=>t;
 const mira=playerTies(s,get(s,'mira'),C,id=>readable.has(id),clean);
 assert.ok(mira.some(x=>x.id==='aldric'&&x.label==='Married to'),'a tie shows on the page at its other end too');
 const both=playerTies(s,get(s,'aldric'),C,id=>readable.has(id),clean);
 assert.ok(both.some(x=>x.id==='mira'&&x.label==='Married to'));
 assert.ok(both.some(x=>x.id==='mira'&&x.label==='Trades with'&&x.note==='They run the ferry together'),'the cover story stands in for the debt');
 assert.ok(!JSON.stringify(both).includes('dowry'));
 assert.ok(!both.some(x=>x.id==='wardens'),'a GM-only tie with no cover is left out');
 assert.ok(!playerTies(s,get(s,'pell'),C,id=>readable.has(id),clean).some(x=>x.id==='sorrel'),'nor a tie to a page players cannot read');
 // The whole player payload carries them, as an allowlist.
 const p=playerCampaign(s,C);
 const ald=p.entries.find(e=>e.id==='aldric');
 assert.ok(ald.ties.some(x=>x.label==='Parent of'&&x.id==='wren'));
 assert.ok(!JSON.stringify(p).includes('dowry'));
 assert.ok(!JSON.stringify(p).includes('Owes a debt'));
 assert.equal(p.entries.find(e=>e.id==='ship').ties[0].note,'Moored at [[Saltmere Quay]] by the salt sheds');
 for(const e of p.entries)for(const x of e.ties??[])assert.deepEqual(Object.keys(x).filter(k=>!['id','label','note'].includes(k)),[]);
 // A reversed cover reads from the other end.
 const rev=put(s,'mira',{ties:[tie('t5','aldric','debt',{gm:true,cover:{typeId:'employs',reversed:true}})]});
 assert.ok(playerTies(rev,get(rev,'mira'),C,id=>readable.has(id),clean).some(x=>x.id==='aldric'&&x.label==='Works for'));
 // People ties count only when the Profile is shared.
 const prof=v=>put(s,'wren',{profile:{...defaultProfile(),visibility:v,blocks:[{id:'b1',kind:'ties',title:'People',column:'right',ties:[{id:'p1',entryId:'pell',typeId:'rival'}]}]}});
 assert.ok(!playerTies(prof('gm'),get(prof('gm'),'wren'),C,id=>readable.has(id),clean).some(x=>x.label==='Rival of'));
 assert.ok(playerTies(prof('players'),get(prof('players'),'pell'),C,id=>readable.has(id),clean).some(x=>x.label==='Rival of'));
});

test('importing a campaign gives ties the new page ids, and search reads tie notes', () => {
 const s=world();
 assert.deepEqual(remapTies([tie('a','x','knows'),tie('b','gone','knows')],new Map([['x','y']])),[tie('a','y','knows')]);
 const copy=importCopy(s,campaignExport(s,C));
 assert.equal(valid(copy),true);
 const ship=copy.entries.filter(e=>e.title==='The Gull').at(-1),port=copy.entries.filter(e=>e.title==='Saltmere Quay').at(-1);
 assert.notEqual(ship.id,'ship');
 assert.equal(ship.ties[0].toId,port.id);
 assert.match(searchableText(get(s,'mira')),/dowry/);
});

test('ties are added, moved, changed and removed, and kinds are saved and dropped', () => {
 let s=world();
 const types=tieTypesOf(s.worlds[0]);
 // Wren is offered both directions of Parent of, and Rival of only once.
 const choices=tieChoices(types,get(s,'wren'),get(s,'pell'));
 assert.ok(choices.some(c=>c.value==='parent'&&c.label==='Parent of'));
 assert.ok(choices.some(c=>c.value==='parent:rev'&&c.label==='Child of'&&c.reversed));
 assert.equal(choices.filter(c=>c.typeId==='rival').length,1);
 assert.ok(!tieChoices(types,get(s,'port'),get(s,'ship')).some(c=>c.typeId==='parent'));
 // Shared lore only holds ties to shared lore; a campaign page ties to it from its own side.
 assert.ok(!canHoldTie(get(s,'blade'),get(s,'aldric')));
 assert.ok(tieChoices(types,get(s,'blade'),get(s,'aldric')).every(c=>c.reversed));
 s=putTie(s,'wren',tie('n1','pell','rival',{note:'Over the ferry'}),LATER);
 assert.equal(get(s,'wren').ties[0].note,'Over the ferry');
 assert.equal(get(s,'wren').updatedAt,LATER);
 // Turning it round moves it to Pell's page.
 s=putTie(s,'pell',tie('n1','wren','wronged'),LATER,{source:'tie',ownerId:'wren',id:'n1'});
 assert.equal(get(s,'wren').ties,undefined);
 assert.equal(get(s,'pell').ties[0].typeId,'wronged');
 assert.equal(valid(s),true);
 // A full page takes no more.
 const full=put(s,'port',{ties:Array.from({length:100},(_,i)=>tie(`f${i}`,'ship','linked'))});
 assert.equal(putTie(full,'port',tie('more','wren','linked'),LATER),null);
 s=removeTie(s,{source:'tie',ownerId:'pell',id:'n1'},LATER);
 assert.equal(get(s,'pell').ties,undefined);
 // A People tie changes its kind, note and switch in place; Knows is not stored.
 s=put(s,'wren',{profile:{...defaultProfile(),blocks:[{id:'b1',kind:'ties',title:'People',column:'right',ties:[{id:'p1',entryId:'pell'}]}]}});
 s=setProfileTie(s,'wren','p1',{typeId:'rival',note:'Since the regatta',gm:true},LATER);
 assert.deepEqual(get(s,'wren').profile.blocks[0].ties[0],{id:'p1',entryId:'pell',typeId:'rival',note:'Since the regatta',gm:true});
 s=setProfileTie(s,'wren','p1',{typeId:'knows'},LATER);
 assert.deepEqual(get(s,'wren').profile.blocks[0].ties[0],{id:'p1',entryId:'pell'});
 s=removeTie(s,{source:'profile',ownerId:'wren',id:'p1'},LATER);
 assert.equal(get(s,'wren').profile.blocks[0].ties.length,0);
 // Kinds of tie: a new one, used, counted, then dropped.
 s=saveTieType(s,W,{id:'sail',name:'Sails from',reverse:'Home port of',group:'belonging',from:['vehicle'],to:['place']});
 assert.equal(s.worlds[0].tieTypes[0].custom,true);
 s=putTie(s,'ship',tie('n2','port','sail'),LATER);
 assert.equal(valid(s),true);
 assert.equal(tieTypeUse(s,W).get('sail'),1);
 assert.equal(tieTypeUse(s,W).get('trade'),1,'a cover story counts as a use');
 s=saveTieType(s,W,{...builtInTieTypes.find(t=>t.id==='rival'),name:'Nemesis of'});
 assert.equal(tieTypesOf(s.worlds[0]).find(t=>t.id==='rival').name,'Nemesis of');
 s=dropTieType(s,W,'rival');
 assert.equal(tieTypesOf(s.worlds[0]).find(t=>t.id==='rival').name,'Rival of');
});

test('the AI connection ties pages by either name of a kind and reads ties back', async () => {
 const s=world(),book=campaignExport(s,C);
 const base={book,campaign:book.campaigns[0],maps:null,level:'assist'};
 let saved;
 const commit=async(tool,change)=>{const r=change(s,base,new Date(T));saved=r.next;return {reply:r.reply};};
 const out=await callTool({...base,commit},'tie_pages',{from:'Pell Ashe-Vane',kind:'Student of',to:'Mira Vane',note:'Learning the river'});
 assert.equal(out.isError??false,false,out.content[0].text);
 const made=get(saved,'mira').ties.at(-1);
 assert.deepEqual({toId:made.toId,typeId:made.typeId,note:made.note,gm:made.gm},{toId:'pell',typeId:'mentor',note:'Learning the river',gm:true});
 assert.equal(valid(saved),true);
 const bad=await callTool({...base,commit},'tie_pages',{from:'Saltmere Quay',kind:'Parent of',to:'Wren Vane'});
 assert.equal(bad.isError,true);
 assert.match(bad.content[0].text,/can't go from/);
 const unknown=await callTool({...base,commit},'tie_pages',{from:'Wren Vane',kind:'Frenemy of',to:'Pell Ashe-Vane'});
 assert.match(unknown.content[0].text,/No kind of tie/);
 const read=JSON.parse((await callTool(base,'read_page',{page:'Mira Vane'})).content[0].text.replace(/^Campaign text.*\n/,''));
 const debt=read.ties.find(x=>x.tie==='Owes a debt to');
 assert.equal(debt.playersSee,false);
 assert.equal(debt.playersBelieve,'Trades with: They run the ferry together');
 assert.deepEqual(tiesText(s,get(s,'aldric'),C,titleOf(s)).find(x=>x.page==='Mira Vane'&&x.tie==='Married to').since,'Year 1102');
});

test('a players-only AI connection reads only shared ties and cover stories', async () => {
 const s=world(),full=campaignExport(s,C);
 const limited=narrow({book:full,campaign:full.campaigns[0],maps:null,level:'read',perms:{...presets.gm,seeSecrets:'off'}});
 const read=async page=>JSON.parse((await callTool(limited,'read_page',{page})).content[0].text.replace(/^Campaign text.*\n/,''));
 const mira=await read('Mira Vane');
 assert.ok(!JSON.stringify(mira).includes('dowry'));
 assert.ok(mira.ties.some(x=>x.tie==='Trades with'&&x.page==='Aldric Vane'));
 assert.ok(!mira.ties.some(x=>x.tie==='Owes a debt to'));
 const aldric=await read('Aldric Vane');
 assert.ok(!aldric.ties.some(x=>x.page==='The Lantern Wardens'),'a GM-only tie without a cover is gone');
 assert.ok(aldric.ties.every(x=>x.playersSee));
});
