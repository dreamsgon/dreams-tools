import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSchema,demoWorkspace,playerCampaign,campaignExport,importCopy,searchableText,defaultCharacter,playerText} from '../lib/encyclopedia/world-model.ts';
import {applyCoGmEdit,CoGmEditError} from '../lib/encyclopedia/co-gm-edit.ts';
import {callTool} from '../lib/mcp/tools.ts';
import {narrow} from '../lib/mcp/players-only.ts';
import {presets} from '../lib/mcp/permissions.ts';
import {pageFromTemplate,starterTemplates} from '../lib/encyclopedia/templates.ts';
import {defaultOrg,newBlock,placeBlock,moveBlockBy,switchColumn,boardSegments,layOutOrg,layoutOf,defaultLayout} from '../lib/encyclopedia/org-profile.ts';
import {applyCharacterLayout,characterProfileText,defaultCharacterLayout,defaultProfile,joinOrg,joinRefusal,joinable,layOutProfile,leaveOrg,newProfileBlock,organizationsOf,playerOrganizations,playerProfile,profileLayoutOf,profileOf,profileSearchText,remapProfile,setOrgPlace} from '../lib/encyclopedia/character-profile.ts';

const C='demo-campaign',C2='demo-campaign-two',T='2026-11-14T10:00:00.000Z',LATER='2026-11-14T12:00:00.000Z';
const page=(id,title,kind,extra={})=>({id,worldId:'demo-world',campaignId:C,parentId:null,title,kind,body:'',updatedAt:T,...extra});
const char=(id,title,extra={})=>page(id,title,'character',{character:defaultCharacter(),...extra});
const get=(s,id)=>s.entries.find(e=>e.id===id);
const put=(s,id,patch)=>({...s,entries:s.entries.map(e=>e.id===id?{...e,...patch}:e)});
const ok=s=>workspaceSchema.safeParse(s).success;

/** An organization profile with these spots (title, gm, people) and members. */
function org({spots=[],members=[],visibility='players',blockGm=false,type}={}){
 const o=defaultOrg();o.visibility=visibility;if(type)o.type=type;
 o.blocks=o.blocks.map(b=>b.kind==='spots'?{...b,gm:blockGm||undefined,spots}:b.kind==='members'?{...b,gm:blockGm||undefined,members}:b);
 return o;
}
const place=(id,title,people,gm)=>({id,title,...(gm?{gm:true}:{}),people});
const who=(id,entryId,extra={})=>({id,entryId,...extra});

/** The demo world with Reeve Ostra Hale, Bram the ferryman, The Lantern Wardens, Greyfen and The Salt Road. */
function world(){
 const s=demoWorkspace();
 s.entries.push(
  char('ostra','Reeve Ostra Hale',{overviewVisibility:'players'}),
  char('bram','Bram the ferryman',{overviewVisibility:'players'}),
  char('veil','The Quiet Buyer'),
  char('tobin','Tobin Reed',{profile:{...defaultProfile(),visibility:'players'}}),
  page('greyfen','Greyfen','place',{overviewVisibility:'players'}),
  page('road','The Salt Road','place',{overviewVisibility:'players'}),
  page('wardens','The Lantern Wardens','faction',{overviewVisibility:'players',org:org({spots:[place('s1','Warden-Captain',[who('p1','ostra',{standing:'loyal'})])]})}),
  page('union','Saltmere Barge Union','faction',{overviewVisibility:'players',org:org({visibility:'gm',members:[{id:'m1',entryId:'ostra',role:'Ferry-warden',standing:'wary'}]})}),
  page('quiet','The Quiet Seat','faction',{org:org({visibility:'gm',members:[{id:'m2',entryId:'ostra',role:'Paymaster'}]})}),
  page('mixed','The Counting House','faction',{overviewVisibility:'players',org:org({spots:[place('s2','Secret Seat',[who('p2','ostra')],true)],members:[{id:'m3',entryId:'ostra',role:'Clerk',standing:'friendly'}]})}),
  page('gm-member','The Toll Cooperative','faction',{overviewVisibility:'players',org:org({members:[{id:'m4',entryId:'ostra',role:'Informer',gm:true}]})}),
  page('gm-spot','The Dockers','faction',{overviewVisibility:'players',org:org({spots:[place('s3','Hidden Seat',[who('p3','ostra')],true)]})}),
  page('gm-person','The Ferry Cooperative','faction',{overviewVisibility:'players',org:org({spots:[place('s4','Wardens',[who('p4','ostra',{gm:true})])]})}),
  page('gm-block','The Reed Court','faction',{overviewVisibility:'players',org:org({blockGm:true,members:[{id:'m5',entryId:'ostra',role:'Judge'}]})}),
 );
 return s;
}
/** Ostra's profile with something GM-only on every path. */
function rich(){
 const p=defaultProfile();
 p.visibility='players';
 p.traits=[{id:'t1',label:'Shrewd',symbol:'scale'},{id:'t2',label:'Proud'},{id:'t3',label:'Owes the Crown',gm:true},{id:'t4',label:'Weary',symbol:'moon'}];
 p.blocks=p.blocks.map(b=>{
  if(b.kind==='beliefs')return {...b,beliefs:[{id:'b1',topic:'Authority',stance:'Earned by service',detail:'Rank follows river miles.'},{id:'b2',topic:'The Crown',stance:'Would sell it',detail:'',gm:true}]};
  if(b.kind==='ties')return {...b,ties:[
   {id:'x1',entryId:'bram',note:'Rival · owes her a debt she won’t forgive\n::: secret\nHis brother\n:::'},{id:'x2',entryId:'veil',note:'Unreadable page'},{id:'x3',entryId:'wardens',note:'Her old crew'},{id:'x4',entryId:'union',note:'Secret tie',gm:true}]};
  return b;});
 p.blocks.push({id:'gmnote',kind:'text',title:'Plans',gm:true,column:'left',text:'Sell the tolls.'},{id:'note',kind:'text',title:'History',column:'left',text:'Born in Greyfen.\n::: secret\nPoisoned a judge.\n:::'},{id:'linked',kind:'linked',title:'Linked pages',column:'right'});
 p.bar.fields=p.bar.fields.map(f=>f.id==='wants'?{...f,value:'A quiet river'}:f.id==='how'?{...f,value:'By the toll book'}:f.id==='trouble'?{...f,value:'The Crown audit'}:f);
 return p;
}

test('the default profile has Beliefs on the left, Organizations then People on the right, and Wants, How and Trouble', () => {
 const p=defaultProfile();
 assert.deepEqual(p.blocks.map(b=>[b.title,b.kind,b.column]),[['Beliefs','beliefs','left'],['Organizations','organizations','right'],['People','ties','right']]);
 assert.deepEqual(p.bar.fields.map(f=>[f.label,!!f.gm]),[['Wants',false],['How',false],['Trouble',true]]);
 assert.equal(p.bar.title,'Right now');assert.equal(p.visibility,'gm');assert.deepEqual(p.traits,[]);
 const s=world();
 assert.equal(get(s,'ostra').profile,undefined,'nothing is migrated');
 assert.deepEqual(profileOf(get(s,'ostra'),s.worlds[0]),p,'an older character shows the default');
 assert.ok(ok(put(s,'ostra',{profile:p})));
 // the world's layout is what new and older characters get
 const layout={blocks:[{id:'a',kind:'text',title:'Creed',column:'right',full:true}],bar:{title:'This week',fields:[{id:'g',label:'Goal'}]}};
 const w=applyCharacterLayout(s,'demo-world',layout);
 assert.deepEqual(w.worlds[0].characterLayout,layout);
 assert.deepEqual(profileOf(get(w,'ostra'),w.worlds[0]).blocks.map(b=>[b.id,b.kind,b.column,!!b.full]),[['a','text','right',true]]);
 // a template page of kind character starts with it, other kinds don't
 const t=starterTemplates(()=>crypto.randomUUID()).find(x=>x.kind==='character')??starterTemplates(()=>'x')[0];
 const made=pageFromTemplate({...t,kind:'character'},{id:'n1',title:'New',worldId:'demo-world',campaignId:C,parentId:null,newId:()=>'x',profile:p});
 assert.deepEqual(made.profile,p);
 assert.equal(pageFromTemplate({...t,kind:'place'},{id:'n2',title:'P',worldId:'demo-world',campaignId:C,parentId:null,newId:()=>'x',profile:p}).profile,undefined);
});

test('the schema allows a profile only on characters, with ties inside the world and campaign to characters or organizations', () => {
 const s=world(),p=rich();
 assert.ok(ok(put(s,'ostra',{profile:p})));
 // only on a character
 assert.equal(ok(put(s,'greyfen',{profile:p})),false,'a place');
 assert.equal(ok(put(s,'wardens',{profile:p})),false,'an organization');
 const tie=(entryId,extra={})=>put(s,'ostra',{profile:{...p,blocks:p.blocks.map(b=>b.kind==='ties'?{...b,ties:[{id:'z',entryId,...extra}]}:b)}});
 // characters and organizations are fine, a place or a note is not
 assert.ok(ok(tie('bram')));assert.ok(ok(tie('wardens')));
 assert.equal(ok(tie('greyfen')),false,'a tie to a place');
 assert.equal(ok(tie('ostra')),false,'a tie to themselves');
 // scope: another campaign, another world, shared lore (fine for a campaign character to point at)
 const away={...s,entries:[...s.entries,char('far','Far away',{campaignId:C2}),char('lore','A legend',{campaignId:null}),char('abroad','Abroad',{worldId:'other-world',campaignId:null})],worlds:[...s.worlds,{...s.worlds[0],id:'other-world',name:'Elsewhere'}]};
 const at=(s2,entryId)=>put(s2,'ostra',{profile:{...p,blocks:p.blocks.map(b=>b.kind==='ties'?{...b,ties:[{id:'z',entryId}]}:b)}});
 assert.equal(ok(at(away,'far')),false,'another campaign');
 assert.equal(ok(at(away,'abroad')),false,'another world');
 assert.ok(ok(at(away,'lore')),'shared lore is in scope');
 // shared lore may only point at shared lore
 const loreChar=put(away,'lore',{profile:{...p,blocks:p.blocks.map(b=>b.kind==='ties'?{...b,ties:[{id:'z',entryId:'bram'}]}:b)}});
 assert.equal(ok(loreChar),false);
 // a missing page (deleted later) is tolerated
 assert.ok(ok(tie('gone')));
 // ids, limits and the singles
 assert.equal(ok(put(s,'ostra',{profile:{...p,traits:[...p.traits,{...p.traits[0]}]}})),false,'duplicate trait ids');
 assert.equal(ok(put(s,'ostra',{profile:{...p,traits:Array.from({length:13},(_,i)=>({id:'t'+i,label:'T'}))}})),false,'13 traits');
 assert.equal(ok(put(s,'ostra',{profile:{...p,traits:[{id:'t',label:'x'.repeat(31)}]}})),false,'a long trait');
 assert.equal(ok(put(s,'ostra',{profile:{...p,traits:[{id:'t',label:'Shrewd',symbol:'rocket'}]}})),false,'an unknown symbol');
 assert.equal(ok(put(s,'ostra',{profile:{...p,blocks:[...p.blocks,newProfileBlock('organizations')]}})),false,'two Organizations blocks');
 assert.equal(ok(put(s,'ostra',{profile:{...p,blocks:[...p.blocks,newProfileBlock('linked'),newProfileBlock('linked')]}})),false);
 assert.equal(ok(put(s,'ostra',{profile:{...p,blocks:[...p.blocks,{...p.blocks[0]}]}})),false,'duplicate block ids');
 assert.equal(ok(put(s,'ostra',{profile:{...p,bar:{...p.bar,fields:Array.from({length:7},(_,i)=>({id:'f'+i,label:'L',value:''}))}}})),false,'7 bar fields');
 assert.equal(ok(put(s,'ostra',{profile:{...p,blocks:Array.from({length:21},(_,i)=>({...newProfileBlock('text'),id:'t'+i}))}})),false,'21 blocks');
 assert.equal(ok(put(s,'ostra',{profile:{...p,blocks:[{...newProfileBlock('beliefs'),kind:'spots',spots:[]}]}})),false,'an organization block kind');
 assert.equal(ok({...s,worlds:[{...s.worlds[0],characterLayout:defaultCharacterLayout()}]}),true);
 assert.equal(ok({...s,worlds:[{...s.worlds[0],characterLayout:{...defaultCharacterLayout(),blocks:[{id:'a',kind:'spots',title:'x',column:'left'}]}}]}),false);
});

test('a character\'s organizations come from the organizations that list them, with the role, standing and GM-only places', () => {
 const s=world(),list=organizationsOf(s.entries,'ostra'),by=id=>list.find(o=>o.org.id===id);
 assert.deepEqual(list.map(o=>o.org.id).sort(),['gm-block','gm-member','gm-person','gm-spot','mixed','quiet','union','wardens']);
 // a spot's title is the role, a member's role is the role, standing comes along
 assert.deepEqual([by('wardens').role,by('wardens').standing,by('wardens').gm],['Warden-Captain','loyal',false]);
 assert.deepEqual([by('union').role,by('union').standing,by('union').gm],['Ferry-warden','wary',false]);
 // GM only: the block, the spot, the person and the member
 for(const id of ['gm-block','gm-member','gm-spot','gm-person'])assert.equal(by(id).gm,true,id);
 // two places in one organization: one row, both roles, GM only only when every place is
 assert.deepEqual([by('mixed').role,by('mixed').gm,by('mixed').placements.length],['Secret Seat · Clerk',false,2]);
 // players' view of the same: GM-only places are dropped first
 const seen=organizationsOf(s.entries,'ostra',true);
 assert.deepEqual(seen.map(o=>o.org.id).sort(),['mixed','quiet','union','wardens']);
 assert.equal(seen.find(o=>o.org.id==='mixed').role,'Clerk');
 // nobody else is in them
 assert.deepEqual(organizationsOf(s.entries,'bram'),[]);
 // an organization with no profile yet lists nobody
 assert.deepEqual(organizationsOf([page('o','Plain','faction')],'ostra'),[]);
});

test('join, change and leave write to the organization and the character stores nothing', () => {
 const s=world();let n=0;const id=()=>'new'+(++n);
 const before=get(s,'ostra');
 // join: lands in the existing Members block with a role and standing
 const a=joinOrg(s,'tobin','wardens',{role:' Ferry-warden ',standing:'friendly'},LATER,id);
 const members=get(a,'wardens').org.blocks.find(b=>b.kind==='members').members;
 assert.deepEqual(members,[{id:'new1',entryId:'tobin',role:'Ferry-warden',standing:'friendly'}]);
 assert.equal(get(a,'wardens').updatedAt,LATER);
 assert.equal(get(a,'tobin'),get(s,'tobin'),'the character page is untouched');
 assert.equal(get(a,'ostra'),before);
 assert.ok(ok(a));
 assert.deepEqual(organizationsOf(a.entries,'tobin').map(o=>[o.org.id,o.role,o.standing]),[['wardens','Ferry-warden','friendly']]);
 // join with no role: the key is left out
 assert.deepEqual(get(joinOrg(s,'tobin','wardens',{standing:'wary'},LATER,id),'wardens').org.blocks.find(b=>b.kind==='members').members[0],{id:'new2',entryId:'tobin',standing:'wary'});
 // an organization with no Members block gets one
 const bare=put(s,'wardens',{org:{...get(s,'wardens').org,blocks:get(s,'wardens').org.blocks.filter(b=>b.kind!=='members')}});
 const b=joinOrg(bare,'tobin','wardens',{role:'Cook'},LATER,id),made=get(b,'wardens').org.blocks.filter(x=>x.kind==='members');
 assert.equal(made.length,1);assert.equal(made[0].title,'Members');assert.deepEqual(made[0].members.map(m=>m.entryId),['tobin']);assert.ok(ok(b));
 // ...and so does one that has no profile at all yet (it becomes the world's default)
 const lazy=put(s,'wardens',{org:undefined}),c=joinOrg(lazy,'tobin','wardens',{},LATER,id);
 assert.ok(get(c,'wardens').org.blocks.some(x=>x.kind==='members'&&x.members.length===1));assert.ok(ok(c));
 // a shared Members block is preferred over a GM-only one
 const gmFirst=put(s,'wardens',{org:{...get(s,'wardens').org,blocks:[{...newBlock('members'),id:'gmm',gm:true},{...newBlock('members'),id:'pub'},...get(s,'wardens').org.blocks.filter(x=>x.kind!=='members')]}});
 const d=joinOrg(gmFirst,'tobin','wardens',{},LATER,id);
 assert.deepEqual(get(d,'wardens').org.blocks.find(x=>x.id==='pub').members.map(m=>m.entryId),['tobin']);

 // change the standing everywhere they are, and the role of a member
 const both=put(s,'mixed',{org:org({spots:[place('s2','Seat',[who('p2','ostra',{standing:'hostile'})])],members:[{id:'m3',entryId:'ostra',role:'Clerk',standing:'friendly'}]})});
 const e=setOrgPlace(both,'ostra','mixed',{standing:'loyal',role:'Head clerk'},LATER),eo=organizationsOf(e.entries,'ostra').find(o=>o.org.id==='mixed');
 assert.deepEqual(eo.placements.map(p=>[p.via,p.role,p.standing]),[['spot','Seat','loyal'],['member','Head clerk','loyal']]);
 assert.equal(get(e,'mixed').updatedAt,LATER);assert.ok(ok(e));
 // the role of someone in a spot is the spot's title: it isn't changed from here
 const onlySpot=setOrgPlace(s,'ostra','wardens',{role:'Cook',standing:'wary'},LATER);
 assert.equal(organizationsOf(onlySpot.entries,'ostra').find(o=>o.org.id==='wardens').role,'Warden-Captain');
 assert.equal(organizationsOf(onlySpot.entries,'ostra').find(o=>o.org.id==='wardens').standing,'wary');
 // no standing removes it; an empty role removes the role; a trailing space is kept while typing
 const none=setOrgPlace(s,'ostra','union',{standing:null,role:''},LATER).entries.find(x=>x.id==='union').org.blocks.find(x=>x.kind==='members').members[0];
 assert.deepEqual(none,{id:'m1',entryId:'ostra'});
 assert.equal(setOrgPlace(s,'ostra','union',{role:'Ferry '},LATER).entries.find(x=>x.id==='union').org.blocks.find(x=>x.kind==='members').members[0].role,'Ferry ');
 // other people in the organization keep their places
 const crowd=put(s,'union',{org:org({members:[{id:'m1',entryId:'ostra',role:'A',standing:'wary'},{id:'m9',entryId:'bram',role:'B',standing:'loyal'}]})});
 assert.deepEqual(get(setOrgPlace(crowd,'ostra','union',{standing:'hostile'},LATER),'union').org.blocks.find(x=>x.kind==='members').members.map(m=>[m.entryId,m.standing]),[['ostra','hostile'],['bram','loyal']]);

 // leave: every spot and member entry of theirs goes, everyone else stays
 const l=leaveOrg(both,'ostra','mixed',LATER),lo=get(l,'mixed').org;
 assert.deepEqual(organizationsOf(l.entries,'ostra').map(o=>o.org.id).includes('mixed'),false);
 assert.equal(lo.blocks.find(x=>x.kind==='spots').spots.length,1,'the spot stays');assert.deepEqual(lo.blocks.find(x=>x.kind==='spots').spots[0].people,[]);
 assert.deepEqual(get(leaveOrg(crowd,'ostra','union',LATER),'union').org.blocks.find(x=>x.kind==='members').members.map(m=>m.entryId),['bram']);
 assert.ok(ok(l));
 // not in it: nothing changes (same object back)
 assert.equal(leaveOrg(s,'bram','wardens',LATER),s);assert.equal(setOrgPlace(s,'bram','wardens',{standing:'loyal'},LATER),s);
});

test('joining respects scope and the maximum counts', () => {
 const s=world();
 // already in it, not a character, not an organization, another world, another campaign, shared lore
 assert.match(joinRefusal(s,'ostra','wardens'),/already/);
 assert.ok(joinRefusal(s,'greyfen','wardens'));assert.ok(joinRefusal(s,'tobin','greyfen'));assert.ok(joinRefusal(s,'tobin','nobody'));
 const wide={...s,worlds:[...s.worlds,{...s.worlds[0],id:'other-world',name:'Elsewhere'}],entries:[...s.entries,page('far-org','Far Org','faction',{campaignId:C2,org:org()}),page('lore-org','Lore Org','faction',{campaignId:null,org:org()}),page('away-org','Away Org','faction',{worldId:'other-world',campaignId:null,org:org()}),char('lore-char','A legend',{campaignId:null})]};
 assert.ok(joinRefusal(wide,'tobin','far-org'),'another campaign');
 assert.ok(joinRefusal(wide,'tobin','away-org'),'another world');
 assert.ok(joinRefusal(wide,'tobin','lore-org'),'a campaign character cannot be listed by shared lore');
 assert.equal(joinRefusal(wide,'lore-char','lore-org'),null);
 assert.equal(joinRefusal(wide,'lore-char','far-org'),null,'a shared character may join any organization in the world');
 assert.equal(joinOrg(wide,'tobin','far-org',{},LATER),wide,'refused joins change nothing');
 assert.deepEqual(joinable(wide,'tobin').map(e=>e.id).sort(),['gm-block','gm-member','gm-person','gm-spot','mixed','quiet','union','wardens']);
 // 60 members is the most. A full Members block makes a second one while there is room for a block; with 20 blocks there is none.
 const membersFull=Array.from({length:60},(_,i)=>({id:'m'+i,entryId:'bram'}));
 const roomy=put(s,'wardens',{org:org({members:membersFull})});
 assert.ok(ok(roomy));
 assert.equal(joinRefusal(roomy,'tobin','wardens'),null);
 const more=joinOrg(roomy,'tobin','wardens',{},LATER);
 assert.equal(get(more,'wardens').org.blocks.filter(b=>b.kind==='members').length,2);assert.ok(ok(more));
 const o20=org({members:membersFull});o20.blocks=[...o20.blocks.filter(b=>b.kind==='members'),...Array.from({length:19},(_,i)=>({...newBlock('text'),id:'t'+i}))];
 const full=put(s,'wardens',{org:o20});
 assert.ok(ok(full));assert.equal(o20.blocks.length,20);
 assert.match(joinRefusal(full,'tobin','wardens'),/no room/);assert.equal(joinOrg(full,'tobin','wardens',{},LATER),full);
 // 20 blocks and none is a Members block: no room either
 const crowded=put(s,'wardens',{org:{...get(s,'wardens').org,blocks:Array.from({length:20},(_,i)=>({...newBlock('text'),id:'t'+i}))}});
 assert.match(joinRefusal(crowded,'tobin','wardens'),/no room/);
});

test('players get an allowlisted profile: no GM-only traits, blocks, beliefs, ties or bar fields, and only shared organizations', () => {
 const s=put(world(),'ostra',{profile:rich()});
 const shared=playerCampaign(s,C),pe=shared.entries.find(e=>e.id==='ostra').profile;
 assert.ok(pe,'a shared profile is sent');
 assert.deepEqual(Object.keys(pe).sort(),['bar','blocks','traits']);
 assert.deepEqual(pe.traits,[{id:'t1',label:'Shrewd',symbol:'scale'},{id:'t2',label:'Proud'},{id:'t4',label:'Weary',symbol:'moon'}]);
 assert.equal(pe.blocks.some(b=>b.id==='gmnote'),false,'a GM-only block');
 assert.deepEqual(pe.blocks.find(b=>b.kind==='beliefs').beliefs.map(b=>b.topic),['Authority']);
 // ties: Bram and the Wardens are readable; the Quiet Buyer isn't; the Union tie is GM only. Secrets are stripped from notes.
 const ties=pe.blocks.find(b=>b.kind==='ties').ties;
 assert.deepEqual(ties.map(t=>[t.entryId,t.title]),[['bram','Bram the ferryman'],['wardens','The Lantern Wardens']]);
 assert.equal(ties[0].note,'Rival · owes her a debt she won’t forgive');
 // organizations: shared page and Profile, and a place that isn't GM only. Only name, type, role and standing.
 const orgs=pe.blocks.find(b=>b.kind==='organizations').organizations;
 assert.deepEqual(orgs,[{id:'mixed',title:'The Counting House',type:'',role:'Clerk',standing:'friendly'},{id:'wardens',title:'The Lantern Wardens',type:'',role:'Warden-Captain',standing:'loyal'}]);
 assert.deepEqual(pe.bar.fields.map(f=>f.label),['Wants','How'],'Trouble is GM only');
 assert.equal(pe.blocks.find(b=>b.id==='note').text,'Born in Greyfen.');
 // linked pages: readable pages that mention them
 const mention=put(s,'greyfen',{body:'Home of [[Reeve Ostra Hale]].'});
 assert.deepEqual(playerCampaign(mention,C).entries.find(e=>e.id==='ostra').profile.blocks.find(b=>b.kind==='linked').linked,[{id:'greyfen',title:'Greyfen'}]);
 // nothing GM-only leaks anywhere in the payload
 const flat=JSON.stringify(shared);
 for(const secret of ['Owes the Crown','Would sell it','The Quiet Buyer','Unreadable page','Secret tie','Sell the tolls','Poisoned a judge','His brother','The Crown audit','Secret Seat','Informer','Hidden Seat','Paymaster','The Quiet Seat'])assert.equal(flat.includes(secret),false,secret);
 // the organizations whose place is GM only or whose Profile is private are not named in the profile (their pages are shared, so the titles are elsewhere in the payload)
 const mine=JSON.stringify(pe);
 for(const name of ['Saltmere Barge Union','The Toll Cooperative','The Dockers','The Ferry Cooperative','The Reed Court','Secret Seat'])assert.equal(mine.includes(name),false,name);
 // the profile tab is shared only when asked: no profile for a GM-only tab
 const hidden=put(s,'ostra',{profile:{...rich(),visibility:'gm'}});
 assert.equal(playerCampaign(hidden,C).entries.find(e=>e.id==='ostra').profile,undefined);
 assert.equal(JSON.stringify(playerCampaign(hidden,C)).includes('Shrewd'),false);
 // a hidden bar stays hidden
 const nobar=put(s,'ostra',{profile:{...rich(),bar:{...rich().bar,hidden:true}}});
 assert.equal(playerCampaign(nobar,C).entries.find(e=>e.id==='ostra').profile.bar,undefined);
 // a character with nothing else shared is readable through the profile, and a GM-only profile on an unshared page sends nothing
 const tobin=playerCampaign(s,C).entries.find(e=>e.id==='tobin');
 assert.ok(tobin?.profile,'Tobin has only his profile shared');assert.deepEqual(tobin.tabs,[]);
 assert.equal(playerCampaign(put(s,'tobin',{profile:{...defaultProfile(),visibility:'gm'}}),C).entries.some(e=>e.id==='tobin'),false);
});

test('organizations a character is in stay private unless the page is readable, its own Profile is shared, and the place is not GM only', () => {
 const s=put(world(),'ostra',{profile:rich()});
 const shown=id=>playerCampaign(put(s,id,{}),C).entries.find(e=>e.id==='ostra').profile.blocks.find(b=>b.kind==='organizations').organizations.map(o=>o.id);
 assert.deepEqual(shown(),['mixed','wardens']);
 // the Union page is readable but its Profile is GM only: not listed; share it and it appears with the member role
 const union=put(s,'union',{org:{...get(s,'union').org,visibility:'players'}});
 assert.ok(playerCampaign(union,C).entries.find(e=>e.id==='ostra').profile.blocks.find(b=>b.kind==='organizations').organizations.some(o=>o.id==='union'&&o.role==='Ferry-warden'&&o.standing==='wary'));
 // the Quiet Seat's page is not shared at all, so players can't read it even once its Profile is shared... it becomes readable, as a shared profile makes a page readable
 const quiet=put(s,'quiet',{org:{...get(s,'quiet').org,visibility:'players'}});
 assert.ok(playerCampaign(quiet,C).entries.find(e=>e.id==='ostra').profile.blocks.find(b=>b.kind==='organizations').organizations.some(o=>o.id==='quiet'));
 // every GM-only path, shared one at a time: the place stays hidden
 const ids=['gm-member','gm-spot','gm-person','gm-block'];
 for(const id of ids)assert.equal(shown().includes(id),false,id);
 // the page itself is not readable: drop it from the readable set
 const out=playerOrganizations(s.entries,'ostra',id=>id!=='wardens',playerText);
 assert.deepEqual(out.map(o=>o.id),['mixed']);
 // a place made GM only afterwards disappears, and an organization being deleted does too
 const flip=put(s,'wardens',{org:{...get(s,'wardens').org,blocks:get(s,'wardens').org.blocks.map(b=>b.kind==='spots'?{...b,spots:b.spots.map(sp=>({...sp,people:sp.people.map(p=>({...p,gm:true}))}))}:b)}});
 assert.deepEqual(shown2(flip),['mixed']);
 function shown2(w){return playerCampaign(w,C).entries.find(e=>e.id==='ostra').profile.blocks.find(b=>b.kind==='organizations').organizations.map(o=>o.id);}
 assert.deepEqual(shown2({...s,entries:s.entries.filter(e=>e.id!=='wardens')}),['mixed']);
 // an organization type is its words only, through the secrets filter
 const typed=put(s,'wardens',{org:{...get(s,'wardens').org,type:'Toll guild\n::: secret\nSmugglers\n:::'}});
 const t=playerCampaign(typed,C).entries.find(e=>e.id==='ostra').profile.blocks.find(b=>b.kind==='organizations').organizations.find(o=>o.id==='wardens');
 assert.equal(t.type,'Toll guild');assert.deepEqual(Object.keys(t).sort(),['id','role','standing','title','type']);
});

test('playerProfile is pure and the organization profile still lists characters players can read', () => {
 const p=rich(),orgs=[{id:'wardens',title:'The Lantern Wardens',type:'Guild',role:'Warden-Captain'}];
 const out=playerProfile(p,id=>id==='bram',t=>t.replace(/::: secret[\s\S]*?:::/g,'').trim(),orgs,{title:id=>({bram:'Bram the ferryman'})[id]??''});
 assert.deepEqual(out.blocks.find(b=>b.kind==='ties').ties.map(t=>t.entryId),['bram']);
 assert.deepEqual(out.blocks.find(b=>b.kind==='organizations').organizations,orgs);
 // Tobin has only a shared profile, so organizations that list him now show him to players and the link opens his profile
 const s=put(world(),'wardens',{org:org({spots:[place('s1','Warden-Captain',[who('p1','ostra',{standing:'loyal'}),who('p9','tobin',{note:'Newest'}),who('p8','veil')])]})});
 const pe=playerCampaign(s,C).entries.find(e=>e.id==='wardens').org.blocks.find(b=>b.kind==='spots').spots[0].people;
 assert.deepEqual(pe.map(x=>x.entryId),['ostra','tobin'],'the unshared Quiet Buyer is still left out');
 assert.equal(pe.find(x=>x.entryId==='tobin').title,'Tobin Reed');
});

test('laying a layout onto characters keeps their content, traits and bar values', () => {
 let s=world();
 const mine=rich();
 s=put(s,'ostra',{profile:mine});
 s=put(s,'bram',{profile:{...defaultProfile(),traits:[{id:'q',label:'Kind'}],blocks:[...defaultProfile().blocks,{id:'tx',kind:'text',title:'Notes',column:'left',text:'Keeps a ledger.'}]}});
 const layout={blocks:[{id:'organizations',kind:'organizations',title:'Where they belong',column:'left',full:true},{id:'beliefs',kind:'beliefs',title:'What they hold',column:'right',gm:true}],bar:{title:'This week',fields:[{id:'how',label:'How',gm:true},{id:'w',label:'wants'}]}};
 const a=applyCharacterLayout(s,'demo-world',layout,LATER),o=get(a,'ostra').profile;
 assert.deepEqual(a.worlds[0].characterLayout,layout);
 // the layout's blocks come first with the layout's titles, columns, widths and visibility
 assert.deepEqual(o.blocks.slice(0,2).map(b=>[b.id,b.kind,b.title,b.column,!!b.full,!!b.gm]),[['organizations','organizations','Where they belong','left',true,false],['beliefs','beliefs','What they hold','right',false,true]]);
 // content stays: beliefs and the text blocks; People (ties) isn't in the layout but holds ties, so it is kept at the end
 assert.equal(o.blocks.find(b=>b.kind==='beliefs').beliefs.length,2);
 assert.equal(o.blocks.find(b=>b.kind==='ties').ties.length,4);
 assert.equal(o.blocks.find(b=>b.id==='note').text.startsWith('Born in Greyfen'),true);
 assert.equal(o.blocks.some(b=>b.id==='gmnote'),true);
 assert.equal(o.blocks.some(b=>b.id==='linked'),false,'an empty block the layout lacks goes');
 assert.deepEqual(o.traits,mine.traits,'traits are not part of a layout');
 assert.equal(o.visibility,'players');
 // bar: matched by id then label, values kept, extra fields with values kept
 assert.deepEqual(o.bar.fields.map(f=>[f.id,f.label,f.value,!!f.gm]).slice(0,2),[['how','How','By the toll book',true],['w','wants','A quiet river',false]]);
 assert.ok(o.bar.fields.some(f=>f.value==='The Crown audit'),'a value in a field the layout drops is kept');
 assert.equal(o.bar.title,'This week');
 assert.ok(ok(a));
 // bram too; tobin (a profile with no content) and ostra's updatedAt; characters with no profile get none
 assert.equal(get(a,'bram').profile.blocks.some(b=>b.text==='Keeps a ledger.'),true);
 assert.equal(get(a,'veil').profile,undefined);assert.equal(get(a,'ostra').updatedAt,LATER);assert.equal(get(a,'veil').updatedAt,T);
 // organizations are untouched, and only this world's characters change
 assert.equal(get(a,'wardens'),get(s,'wardens'));
 assert.equal(a.worlds[0].orgLayout,undefined);
 // new and older characters now start from it
 assert.deepEqual(profileOf(get(a,'veil'),a.worlds[0]).blocks.map(b=>b.id),['organizations','beliefs']);
 // applying twice changes nothing more
 assert.deepEqual(applyCharacterLayout(a,'demo-world',layout,LATER).entries,a.entries);
 assert.deepEqual(profileLayoutOf(layOutProfile(o,layout)).blocks.slice(0,2),layout.blocks.map(b=>({...b})).map(b=>({id:b.id,kind:b.kind,title:b.title,column:b.column,...(b.gm?{gm:true}:{}),...(b.full?{full:true}:{})})));
 // a bad layout is refused
 assert.throws(()=>applyCharacterLayout(s,'demo-world',{...layout,blocks:[{id:'a',kind:'facts',title:'x',column:'left'}]}));
});

test('the board helpers and organization layouts work the same as before', () => {
 const blocks=defaultProfile().blocks;
 assert.deepEqual(boardSegments(blocks).map(s=>'full' in s?[s.full.id]:[s.left.map(b=>b.id),s.right.map(b=>b.id)]),[[['beliefs'],['organizations','people']]]);
 assert.deepEqual(placeBlock(blocks,'people','beliefs','left').map(b=>[b.id,b.column]),[['people','left'],['beliefs','left'],['organizations','right']]);
 assert.deepEqual(moveBlockBy(blocks,'people',-1).map(b=>b.id),['beliefs','people','organizations']);
 assert.equal(switchColumn(blocks,'beliefs')[0].column,'right');
 const o=defaultOrg();assert.deepEqual(layOutOrg(o,layoutOf(o)),o);assert.deepEqual(boardSegments(o.blocks).length,1);
 assert.equal(defaultLayout().blocks.length,6);
});

test('a co-GM edits a character profile and an organization they join, but not the world\'s character layout', () => {
 const full=put(world(),'ostra',{profile:rich()});
 const mine=()=>structuredClone(campaignExport(full,C));
 const a=mine();a.entries.find(e=>e.id==='ostra').profile.traits.push({id:'t9',label:'Brave'});
 assert.equal(get(applyCoGmEdit(full,C,a),'ostra').profile.traits.length,5);
 // joining writes to the organization's page, which is also theirs to edit
 const joined=joinOrg(mine(),'bram','wardens',{role:'Ferry-warden'},LATER);
 assert.equal(get(applyCoGmEdit(full,C,joined),'wardens').org.blocks.find(b=>b.kind==='members').members[0].entryId,'bram');
 // the world's layout is the GM's
 const b=mine();b.worlds[0]={...b.worlds[0],characterLayout:defaultCharacterLayout()};
 assert.throws(()=>applyCoGmEdit(full,C,b),e=>e instanceof CoGmEditError&&/world/i.test(e.message));
 assert.throws(()=>applyCoGmEdit(full,C,applyCharacterLayout(mine(),'demo-world',defaultCharacterLayout())),CoGmEditError);
});

test('Ctrl K finds traits, beliefs, notes on ties, text and bar values', () => {
 const s=put(world(),'ostra',{profile:rich()}),e=get(s,'ostra');
 for(const word of ['Shrewd','Weary','Authority','Earned by service','Rank follows river miles','Rival · owes her a debt','Born in Greyfen','A quiet river','The Crown audit'])assert.ok(searchableText(e).includes(word),word);
 assert.equal(profileSearchText(undefined),'');
});

test('importing a campaign copy points ties at the new page ids and drops ties to pages left out', () => {
 const s=put(world(),'ostra',{profile:rich()}),exp=campaignExport(s,C);
 const out=importCopy({schemaVersion:1,worlds:[],campaigns:[],entries:[]},exp);
 const ostra=out.entries.find(e=>e.title==='Reeve Ostra Hale'),bram=out.entries.find(e=>e.title==='Bram the ferryman'),wardens=out.entries.find(e=>e.title==='The Lantern Wardens');
 const ties=ostra.profile.blocks.find(b=>b.kind==='ties').ties;
 assert.deepEqual(ties.map(t=>t.entryId).slice(0,1),[bram.id]);assert.notEqual(ties[0].entryId,'bram');assert.ok(ties.some(t=>t.entryId===wardens.id));
 assert.ok(workspaceSchema.safeParse(out).success);
 // pure: a tie to a page that isn't in the map is dropped
 const r=remapProfile(rich(),new Map([['bram','b2']]));
 assert.deepEqual(r.blocks.find(b=>b.kind==='ties').ties.map(t=>t.entryId),['b2']);
 assert.deepEqual(r.traits,rich().traits);
});

test('the AI connection creates a character with the default profile and reads it back with their organizations', async () => {
 const s=world(),book=campaignExport(put(s,'ostra',{profile:rich()}),C);
 const base={book,campaign:book.campaigns[0],maps:null,level:'assist'};
 let saved;
 const commit=async(tool,change)=>{const r=change(s,base,new Date(T));saved=r.next;return {reply:r.reply};};
 const out=await callTool({...base,commit},'create_page',{title:'Greyfen Ferryman',kind:'character'});
 assert.equal(out.isError??false,false);
 assert.deepEqual(saved.entries.find(e=>e.title==='Greyfen Ferryman').profile,defaultProfile(s.worlds[0]));
 await callTool({...base,commit},'create_page',{title:'The Salt Road Inn',kind:'place'});
 assert.equal(saved.entries.find(e=>e.title==='The Salt Road Inn').profile,undefined);
 const read=await callTool(base,'read_page',{page:'Reeve Ostra Hale'});
 const text=JSON.parse(read.content[0].text.replace(/^Campaign text.*\n/,'')).profile;
 assert.match(text,/Traits: Shrewd, Proud, Owes the Crown \[GM only\], Weary/);
 assert.match(text,/Authority: Earned by service/);assert.match(text,/Bram the ferryman – Rival/);
 assert.match(text,/The Lantern Wardens, Warden-Captain \(loyal\)/);assert.match(text,/The Toll Cooperative, Informer \[GM only\]/);
 assert.match(text,/Right now: .*Wants: A quiet river.*Trouble: The Crown audit \[GM only\]/);
 assert.ok(text.length<4001);
 // a character with no stored profile still lists their organizations; a page with nothing says nothing
 const plain=JSON.parse((await callTool(base,'read_page',{page:'Bram the ferryman'})).content[0].text.replace(/^Campaign text.*\n/,'')).profile;
 assert.equal(plain,undefined);
 assert.equal(characterProfileText(undefined,()=>'',[]),undefined);
 assert.match(characterProfileText(undefined,()=>'',organizationsOf(book.entries,'ostra')),/Organizations: /);
});

test('a players-only AI connection reads no character or organization profile, nor organizations drawn from GM-only places', async () => {
 const s=put(world(),'ostra',{profile:rich(),overviewVisibility:'players'});
 const full=campaignExport(s,C);
 const limited=narrow({book:full,campaign:full.campaigns[0],maps:null,level:'read',perms:{...presets.gm,seeSecrets:'off'}});
 const read=async page=>JSON.parse((await callTool(limited,'read_page',{page})).content[0].text.replace(/^Campaign text.*\n/,''));
 const ostra=await read('Reeve Ostra Hale');
 assert.equal(ostra.profile,undefined,'a character profile (GM-only traits, bar fields, ties) is not read');
 const wardens=await read('The Lantern Wardens');
 assert.equal(wardens.profile,undefined,'nor an organization profile');
 const found=JSON.stringify((await callTool(limited,'search',{query:'Crown audit'})).content[0].text);
 assert.doesNotMatch(found,/Ostra/,'search does not look inside a profile');
});
