import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSchema,demoWorkspace,playerCampaign,defaultCharacter} from '../lib/encyclopedia/world-model.ts';
import {defaultOrg,maxMembers,maxPeople,orgTypeList} from '../lib/encyclopedia/org-profile.ts';
import {defaultProfile,maxTies} from '../lib/encyclopedia/character-profile.ts';
import {applyDrop,dropRefusal,maxHoldings,PAGE_DRAG} from '../lib/encyclopedia/profile-drop.ts';
import {beliefSuggestions,fillable,pickAnother,suggestBelief,suggestOrgType,suggestTrait,traitSuggestions} from '../lib/encyclopedia/profile-suggest.ts';
import {holdersByPlace,orgListItems,pinTints,playerHoldersByPlace,playerOrgListItems} from '../lib/encyclopedia/org-holdings.ts';

const C='demo-campaign',C2='demo-campaign-two',T='2026-11-14T10:00:00.000Z',LATER='2026-11-14T12:00:00.000Z';
const page=(id,title,kind,extra={})=>({id,worldId:'demo-world',campaignId:C,parentId:null,title,kind,body:'',updatedAt:T,...extra});
const char=(id,title,extra={})=>page(id,title,'character',{character:defaultCharacter(),...extra});
const get=(s,id)=>s.entries.find(e=>e.id===id);
const block=(s,id,kind)=>get(s,id).org.blocks.find(b=>b.kind===kind);
let counter=0;
const seq=()=>()=>`new${++counter}`;
/** An organization with a Warden-Captain spot, empty members and holdings, then the others. */
const orgWith=(o={})=>{const org=defaultOrg();org.blocks=org.blocks.map(b=>b.kind==='spots'?{...b,spots:[{id:'s1',title:'Warden-Captain',people:[]}]}:b);return {...org,...o};};

function world(){
 const s=demoWorkspace();
 s.entries.push(
  char('ostra','Ostra Hale'),char('bram','Bram'),char('lore-npc','Old Hand',{campaignId:null}),char('other','Camp Two Cook',{campaignId:C2}),
  page('greyfen','Greyfen','place'),page('barge','The Last Barge','note'),page('dir','Cast','folder'),
  page('wardens','Lantern Wardens','faction',{org:orgWith()}),
  page('union','Saltmere Barge Union','faction',{org:orgWith()}),
 );
 return s;
}
const spot={kind:'spot',orgId:'wardens',blockId:'leadership',spotId:'s1'};
const members={kind:'members',orgId:'wardens',blockId:'members'};
const holdings={kind:'holdings',orgId:'wardens',blockId:'holdings'};
const ties={kind:'ties',characterId:'ostra',blockId:'people'};

test('the sidebar drag uses its own data type', () => { assert.equal(PAGE_DRAG,'application/x-encyclopedia-page'); });

test('a character dropped on a spot joins it with neutral standing', () => {
 const s=world(),next=applyDrop(s,spot,'ostra',LATER,seq());
 const p=block(next,'wardens','spots').spots[0].people;
 assert.equal(p.length,1);assert.deepEqual({...p[0],id:'x'},{id:'x',entryId:'ostra',standing:'neutral'});
 assert.equal(get(next,'wardens').updatedAt,LATER);
 assert.equal(workspaceSchema.safeParse(next).success,true);
 assert.equal(get(s,'wardens').org.blocks.find(b=>b.kind==='spots').spots[0].people.length,0,'the input is not changed');
});
test('a character dropped on Members is added with no role and neutral standing', () => {
 const next=applyDrop(world(),members,'bram',LATER,seq());
 assert.deepEqual(block(next,'wardens','members').members.map(m=>({...m,id:'x'})),[{id:'x',entryId:'bram',standing:'neutral'}]);
 assert.equal(workspaceSchema.safeParse(next).success,true);
});
test('any page dropped on Holdings adds a holding; a folder does not', () => {
 let s=applyDrop(world(),holdings,'greyfen',LATER,seq());
 s=applyDrop(s,holdings,'barge',LATER,seq());
 s=applyDrop(s,holdings,'union',LATER,seq());
 assert.deepEqual(block(s,'wardens','holdings').holdings.map(h=>h.entryId),['greyfen','barge','union']);
 assert.match(dropRefusal(world(),holdings,'dir'),/Folders/);
 assert.equal(workspaceSchema.safeParse(s).success,true);
});
test('a character or organization dropped on People adds a tie, but a place does not', () => {
 let s=applyDrop(world(),ties,'bram',LATER,seq());
 s=applyDrop(s,ties,'wardens',LATER,seq());
 const list=get(s,'ostra').profile.blocks.find(b=>b.kind==='ties').ties;
 assert.deepEqual(list.map(t=>t.entryId),['bram','wardens']);
 assert.equal(list[0].note,undefined);
 assert.match(dropRefusal(world(),ties,'greyfen'),/characters and organizations/);
 assert.equal(workspaceSchema.safeParse(s).success,true);
});
test('a spot and Members only take characters', () => {
 assert.match(dropRefusal(world(),spot,'greyfen'),/spot holds characters/);
 assert.match(dropRefusal(world(),members,'union'),/Members holds characters, not an organization/);
});
test('drops are refused outside the world, scope and for duplicates, and nothing changes', () => {
 const s=world();
 assert.match(dropRefusal(s,spot,'other'),/another campaign/);
 assert.equal(dropRefusal(s,spot,'lore-npc'),null,'shared lore is fine');
 assert.match(dropRefusal(s,spot,'missing'),/gone/);
 assert.match(dropRefusal(s,holdings,'wardens'),/itself/);
 const foreign={...s,entries:[...s.entries,page('away','Away Land','place',{worldId:'elsewhere'})]};
 assert.match(dropRefusal(foreign,holdings,'away'),/another world/);
 const once=applyDrop(s,members,'ostra',LATER,seq());
 assert.match(dropRefusal(once,members,'ostra'),/already a member/);
 assert.equal(applyDrop(once,members,'ostra',LATER,seq()),once);
 const spotted=applyDrop(s,spot,'ostra',LATER,seq());
 assert.match(dropRefusal(spotted,spot,'ostra'),/already in Warden-Captain/);
 assert.equal(applyDrop(s,spot,'greyfen'),s);
 const held=applyDrop(s,holdings,'greyfen',LATER,seq());
 assert.match(dropRefusal(held,holdings,'greyfen'),/already a holding/);
 const tied=applyDrop(s,ties,'bram',LATER,seq());
 assert.match(dropRefusal(tied,ties,'bram'),/already in People/);
 assert.match(dropRefusal(s,{...ties,characterId:'ostra'},'ostra'),/itself/);
 assert.match(dropRefusal(s,{kind:'ties',characterId:'greyfen',blockId:'people'},'bram'),/character/);
 assert.match(dropRefusal(s,{...spot,spotId:'nope'},'ostra'),/spot is gone/);
 assert.match(dropRefusal(s,{...members,blockId:'nope'},'ostra'),/block is gone/);
});
test('drops respect each block’s limits', () => {
 const s=world(),fill=(n,make)=>Array.from({length:n},(_,i)=>make(i));
 const full=(patch)=>({...s,entries:s.entries.map(e=>e.id==='wardens'?{...e,org:{...e.org,blocks:e.org.blocks.map(patch)}}:e)});
 assert.match(dropRefusal(full(b=>b.kind==='spots'?{...b,spots:[{...b.spots[0],people:fill(maxPeople,i=>({id:`p${i}`,entryId:`x${i}`}))}]}:b),spot,'ostra'),/is full/);
 assert.match(dropRefusal(full(b=>b.kind==='members'?{...b,members:fill(maxMembers,i=>({id:`m${i}`,entryId:`x${i}`}))}:b),members,'ostra'),/Members is full/);
 assert.match(dropRefusal(full(b=>b.kind==='holdings'?{...b,holdings:fill(maxHoldings,i=>({id:`h${i}`,entryId:`x${i}`}))}:b),holdings,'greyfen'),/Holdings is full/);
 const crowded={...s,entries:s.entries.map(e=>e.id==='ostra'?{...e,profile:{...defaultProfile(),blocks:defaultProfile().blocks.map(b=>b.kind==='ties'?{...b,ties:fill(maxTies,i=>({id:`t${i}`,entryId:`x${i}`}))}:b)}}:e)};
 assert.match(dropRefusal(crowded,ties,'bram'),/People is full/);
});
test('a page with no profile of its own starts from the default when it takes a drop', () => {
 const s=world();
 s.entries=s.entries.map(e=>e.id==='wardens'?{...e,org:undefined}:e);
 const next=applyDrop(s,spot,'ostra',LATER,seq());
 assert.equal(next,s,'the default has no spots to drop on');
 const m=applyDrop(s,members,'ostra',LATER,seq());
 assert.equal(get(m,'wardens').org.blocks.find(b=>b.kind==='members').members[0].entryId,'ostra');
});

/* ---- Suggest ---- */

const rngOf=(...v)=>{let i=0;return()=>v[i++%v.length];};
test('pickAnother avoids what was just suggested', () => {
 assert.equal(pickAnother(['a','b','c'],['a'],()=>0),'b');
 assert.equal(pickAnother(['a'],['a'],()=>0),'a','one choice is still a choice');
 assert.equal(pickAnother([],[],()=>0),undefined);
 assert.equal(pickAnother(['a','b'],[],()=>0.999),'b');
});
test('an organization type is suggested from our list and the world’s own, only while the Type is empty', () => {
 const t=suggestOrgType(undefined,undefined,[],rngOf(0));
 assert.ok(orgTypeList.includes(t));
 assert.equal(suggestOrgType('Guild',undefined),null,'typed types are never replaced');
 assert.equal(suggestOrgType('Guild',{type:'Church'}),null);
 const again=suggestOrgType(t,{type:t},[],rngOf(0));
 assert.notEqual(again,t,'again gives another');
 assert.equal(suggestOrgType('',undefined,['Ferry cooperative'],()=>0.999),'Ferry cooperative');
});
test('a trait is suggested from our list, never one the character already has', () => {
 const t=suggestTrait('',undefined,[traitSuggestions[0]],rngOf(0));
 assert.ok(traitSuggestions.includes(t));assert.notEqual(t,traitSuggestions[0]);
 assert.equal(suggestTrait('Shrewd',undefined),null);
 assert.notEqual(suggestTrait(t,{label:t},[],rngOf(0)),t);
 assert.ok(traitSuggestions.every(x=>x.length<=30&&x.trim()===x));
});
test('a belief suggestion fills the empty fields only', () => {
 const both=suggestBelief({topic:'',stance:''},undefined,[],rngOf(0));
 assert.ok(both.topic&&both.stance);
 assert.ok(beliefSuggestions.find(x=>x.topic===both.topic).stances.includes(both.stance),'the stance fits the topic');
 const stanceOnly=suggestBelief({topic:'Authority',stance:''},undefined,[],rngOf(0));
 assert.equal(stanceOnly.topic,undefined);
 assert.ok(beliefSuggestions.find(x=>x.topic==='Authority').stances.includes(stanceOnly.stance));
 const own=suggestBelief({topic:'Cheese',stance:''},undefined,[],rngOf(0));
 assert.ok(own.stance&&own.topic===undefined,'a topic of their own gets a general stance');
 assert.equal(suggestBelief({topic:'Authority',stance:'Never'},undefined),null,'filled in fields stay');
 const topicOnly=suggestBelief({topic:'',stance:'My own words'},undefined,[],rngOf(0));
 assert.ok(topicOnly.topic&&topicOnly.stance===undefined,'a typed stance is kept');
});
test('pressing Suggest again changes only what it filled and the GM has not edited', () => {
 const first=suggestBelief({topic:'',stance:''},undefined,[],rngOf(0));
 const again=suggestBelief(first,first,[],rngOf(0));
 assert.notEqual(again.topic,first.topic);
 const edited=suggestBelief({topic:first.topic,stance:'Mine'},first,[],rngOf(0));
 assert.deepEqual(Object.keys(edited),['topic'],'the typed stance stays; the topic Suggest filled may still change');
 assert.notEqual(edited.topic,first.topic);
});
test('a belief suggestion avoids topics already on the page', () => {
 const used=beliefSuggestions.slice(1).map(x=>x.topic);
 for(let i=0;i<20;i++)assert.equal(suggestBelief({topic:'',stance:''},undefined,used,()=>i/20).topic,beliefSuggestions[0].topic);
});
test('fillable means empty or still what Suggest put there', () => {
 assert.equal(fillable('',undefined),true);assert.equal(fillable('  ','x'),true);
 assert.equal(fillable('Guild',undefined),false);assert.equal(fillable(' guild ','Guild'),true);assert.equal(fillable('Guild!','Guild'),false);
});
test('the suggestion lists are our own words', () => {
 const words=[...traitSuggestions,...beliefSuggestions.flatMap(b=>[b.topic,...b.stances])];
 assert.ok(words.length>60);
 assert.equal(new Set(traitSuggestions.map(x=>x.toLowerCase())).size,traitSuggestions.length);
});

/* ---- Held places on maps ---- */

const holding=(id,entryId,gm)=>({id,entryId,...(gm?{gm:true}:{})});
function held({wardensHold=[holding('h1','greyfen')],unionHold=[holding('h2','greyfen')],unionColour,wardensColour='#2f7f6b',unionShared=true,wardensShared=true,gmBlock=false}={}){
 const s=world();
 const mk=(id,hold,mapColour,shared,extra={})=>{const o=orgWith({visibility:shared?'players':'gm',emblem:{shape:'shield',...(mapColour?{mapColour}:{})}});o.blocks=o.blocks.map(b=>b.kind==='holdings'?{...b,...extra,holdings:hold}:b);return {...get(s,id),overviewVisibility:'players',org:o};};
 s.entries=s.entries.map(e=>e.id==='wardens'?mk('wardens',wardensHold,wardensColour,wardensShared,gmBlock?{gm:true}:{}):e.id==='union'?mk('union',unionHold,unionColour,unionShared):e.id==='greyfen'||e.id==='barge'?{...e,overviewVisibility:'players'}:e);
 return s;
}
const scope={worldId:'demo-world',campaignId:C};
test('a held place gets the colour of the first holder by name, and the rest follow in order', () => {
 const s=held({unionColour:'#a23f75'}),h=holdersByPlace(s.entries,scope);
 assert.deepEqual(h.greyfen.map(x=>x.title),['Lantern Wardens','Saltmere Barge Union']);
 assert.equal(h.greyfen[0].colour,'#2f7f6b');assert.equal(h.greyfen[1].colour,'#a23f75');
 assert.deepEqual(pinTints([{id:'p1',entryId:'greyfen'},{id:'p2',entryId:null},{id:'p3'},{id:'p4',entryId:'barge'}],h),{p1:'#2f7f6b'});
});
test('an organization with no map colour tints in the default blue', () => {
 const s=held({wardensColour:null});
 assert.equal(holdersByPlace(s.entries,scope).greyfen[0].colour,'#3b6fb6');
});
test('holders follow the campaign scope', () => {
 const s=held();
 s.entries=s.entries.map(e=>e.id==='union'?{...e,campaignId:C2}:e);
 assert.deepEqual(holdersByPlace(s.entries,scope).greyfen.map(x=>x.id),['wardens']);
 assert.deepEqual(holdersByPlace(s.entries,{worldId:'demo-world',campaignId:C2}).greyfen.map(x=>x.id),['union']);
 assert.deepEqual(holdersByPlace(s.entries,{worldId:'demo-world',campaignId:null}).greyfen??[],[],'lore sees only lore organizations');
 assert.deepEqual(holdersByPlace(s.entries,{worldId:'other',campaignId:C}),{});
});
test('the GM sees GM only holdings, marked, and a place held openly elsewhere is not marked', () => {
 const s=held({wardensHold:[holding('h1','greyfen',true)],unionHold:[holding('h2','barge')]});
 const h=holdersByPlace(s.entries,scope);
 assert.equal(h.greyfen[0].gm,true);assert.equal(h.barge[0].gm,undefined);
 const both=held({wardensHold:[holding('h1','greyfen',true),holding('h3','greyfen')]});
 assert.equal(holdersByPlace(both.entries,scope).greyfen.find(x=>x.id==='wardens').gm,undefined);
});
const playersOf=s=>playerCampaign(s,C).entries;
test('players see a tint only for shared Profiles and holdings that are not GM only', () => {
 const open=held({unionColour:'#a23f75'});
 assert.deepEqual(playerHoldersByPlace(playersOf(open)).greyfen.map(x=>x.id),['wardens','union']);
 // the first holder's Profile isn't shared: the tint passes to the next one
 const hidden=held({unionColour:'#a23f75',wardensShared:false});
 const h=playerHoldersByPlace(playersOf(hidden));
 assert.deepEqual(h.greyfen.map(x=>x.id),['union']);
 assert.equal(pinTints([{id:'p',entryId:'greyfen'}],h).p,'#a23f75');
 // a GM only holding or a GM only block is left out
 assert.equal(playerHoldersByPlace(playersOf(held({wardensHold:[holding('h1','greyfen',true)],unionShared:false}))).greyfen,undefined);
 assert.equal(playerHoldersByPlace(playersOf(held({gmBlock:true,unionShared:false}))).greyfen,undefined);
 // no shared Profile at all: no tint and no holders
 assert.deepEqual(playerHoldersByPlace(playersOf(held({wardensShared:false,unionShared:false}))),{});
});
test('players get no tint for a held page they cannot read', () => {
 const s=held({wardensHold:[holding('h1','greyfen')],unionShared:false});
 s.entries=s.entries.map(e=>e.id==='greyfen'?{...e,overviewVisibility:'gm'}:e);
 assert.deepEqual(playerHoldersByPlace(playersOf(s)),{});
});
test('the player copy never carries a GM only organization’s colour in the holders', () => {
 const out=JSON.stringify(playerHoldersByPlace(playersOf(held({wardensColour:'#123456',wardensShared:false,unionColour:'#654321'}))));
 assert.ok(!out.includes('#123456'));assert.ok(out.includes('#654321'));
});

/* ---- The sidebar's Organizations section ---- */

test('the sidebar lists organization pages by name with their colour, lore marked', () => {
 const s=world();
 s.entries.push(page('lore-org','Ash Court','faction',{campaignId:null,org:{...orgWith(),emblem:{shape:'shield',mapColour:'#6b4fa0'}}}),page('bare','Bare Org','faction'));
 const items=orgListItems(s.entries);
 assert.deepEqual(items.map(i=>i.title),['Ash Court','Bare Org','Lantern Wardens','Saltmere Barge Union']);
 assert.deepEqual(items[0],{id:'lore-org',title:'Ash Court',colour:'#6b4fa0',lore:true});
 assert.equal(items[1].colour,'#3b6fb6','no profile yet: the default colour');
 assert.equal(items.some(i=>i.title==='Ostra Hale'),false);
});
test('a player’s sidebar lists only organizations they can read, with a colour only when the Profile is shared', () => {
 const s=held({unionColour:'#a23f75',unionShared:false});
 s.entries.push(page('shared-org','Shared Seat','faction',{org:orgWith({visibility:'players'})}),page('gm-org','Hidden Hand','faction',{org:orgWith()}));
 const list=playerOrgListItems(playersOf(s));
 assert.deepEqual(list.map(l=>l.title),['Lantern Wardens','Saltmere Barge Union','Shared Seat']);
 assert.equal(list[0].colour,'#2f7f6b');
 assert.equal(list[1].colour,null,'readable page, Profile not shared');
 assert.equal(list[2].colour,'#3b6fb6','a shared Profile with no colour of its own');
 assert.ok(!list.some(l=>l.id==='gm-org'),'a page players cannot read is not listed');
});
