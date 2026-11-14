import test from 'node:test';
import assert from 'node:assert/strict';
const {demoWorkspace,campaignExport,defaultCharacter}=await import('../lib/encyclopedia/world-model.ts');
const {applyCoGmEdit,CoGmEditError}=await import('../lib/encyclopedia/co-gm-edit.ts');

const C='demo-campaign',T='2026-11-14T10:00:00.000Z',IMG='0b5f6a8e-3c1d-4f2a-9b7e-1a2b3c4d5e6f';
// The owner's workspace: the demo, plus a page in their other campaign and stats Mara keeps in both campaigns.
function owner(){
 const w=demoWorkspace();
 const fields=[{id:'hp',label:'HP',section:'',type:'number',options:[],visibility:'gm',archived:false}];
 return {...w,campaigns:w.campaigns.map(c=>({...c,statFields:fields})),entries:[...w.entries.map(e=>e.id==='demo-mara'?{...e,character:{...defaultCharacter(),statsByCampaign:{[C]:{hp:12},'demo-campaign-two':{hp:30}}}}:e),
  {id:'greyfen-secret',worldId:'demo-world',campaignId:'demo-campaign-two',parentId:null,title:'Only in the other campaign',kind:'note',body:'Hidden',updatedAt:T}]};
}
const copy=w=>structuredClone(campaignExport(w,C));
const refuses=(fn,re)=>assert.throws(fn,e=>e instanceof CoGmEditError&&re.test(e.message));

test('a co-GM\'s edits, new pages and deletions land in the owner\'s workspace; the rest stays as it was',()=>{
 const full=owner(),mine=copy(full);
 mine.entries=mine.entries.filter(e=>e.id!=='demo-threads').map(e=>e.id==='demo-first'?{...e,body:'The bridge fell.',updatedAt:T}:e);
 mine.entries.push({id:'new-page',worldId:'demo-world',campaignId:C,parentId:'demo-sessions',title:'Salt Road ambush',kind:'note',body:'',updatedAt:T});
 const next=applyCoGmEdit(full,C,mine);
 const byId=new Map(next.entries.map(e=>[e.id,e]));
 assert.equal(byId.get('demo-first').body,'The bridge fell.');
 assert.ok(byId.has('new-page'));assert.equal(byId.has('demo-threads'),false);
 assert.deepEqual(byId.get('greyfen-secret'),full.entries.find(e=>e.id==='greyfen-secret'),'other campaigns untouched');
 assert.deepEqual(byId.get('demo-winter'),full.entries.find(e=>e.id==='demo-winter'));
 assert.deepEqual(next.campaigns[1],full.campaigns[1]);
});

test('a shared page keeps what belongs to the owner\'s other campaigns',()=>{
 const full=owner(),mine=copy(full);
 const mara=mine.entries.find(e=>e.id==='demo-mara');
 assert.deepEqual(mara.character.statsByCampaign,{[C]:{hp:12}},'the co-GM only sees this campaign\'s stats');
 mara.character.statsByCampaign[C].hp=9;mara.body='Limping now.';
 const after=applyCoGmEdit(full,C,mine).entries.find(e=>e.id==='demo-mara');
 assert.deepEqual(after.character.statsByCampaign,{[C]:{hp:9},'demo-campaign-two':{hp:30}});
 assert.equal(after.body,'Limping now.');
});

test('co-GMs can\'t reach outside the campaign, change the world, relink the campaign or use outside pictures',()=>{
 const full=owner();
 let mine=copy(full);mine.entries.push({...full.entries.find(e=>e.id==='greyfen-secret'),campaignId:C,body:'Overwritten'});
 refuses(()=>applyCoGmEdit(full,C,mine),/belongs somewhere else/);
 mine=copy(full);mine.entries.push({id:'sneak',worldId:'demo-world',campaignId:'demo-campaign-two',parentId:null,title:'Sneak',kind:'note',body:'',updatedAt:T});
 assert.throws(()=>applyCoGmEdit(full,C,mine),'a page in another campaign is refused');
 mine=copy(full);mine.worlds[0].name='Renamed';
 refuses(()=>applyCoGmEdit(full,C,mine),/world/);
 mine=copy(full);mine.campaigns[0].maptableCampaignId='someone-elses-table';
 refuses(()=>applyCoGmEdit(full,C,mine),/linked/);
 mine=copy(full);mine.campaigns.push({...full.campaigns[1]});
 refuses(()=>applyCoGmEdit(full,C,mine),/only change the campaign/);
 mine=copy(full);mine.entries=mine.entries.map(e=>e.id==='demo-mara'?{...e,picture:{imageId:IMG,width:10,height:10,x:.5,y:.5,size:1}}:e);
 refuses(()=>applyCoGmEdit(full,C,mine),/storage/);
});

test('campaign notes a co-GM may change, like its name and calendars, save; the rest of the campaign stays the owner\'s',()=>{
 const full=owner(),mine=copy(full);mine.campaigns[0].description='Now with more salt.';
 const next=applyCoGmEdit(full,C,mine);
 assert.equal(next.campaigns.find(c=>c.id===C).description,'Now with more salt.');
 assert.equal(next.worlds.length,full.worlds.length);
});

test('a picture that is new to the copy is refused unless the server found it in the GM\'s storage',()=>{
 const full=owner(),mine=copy(full);mine.entries=mine.entries.map(e=>e.id==='demo-mara'?{...e,picture:{imageId:IMG,width:10,height:10,x:.5,y:.5,size:1}}:e);
 refuses(()=>applyCoGmEdit(full,C,mine),/isn't in this campaign's storage/);
 refuses(()=>applyCoGmEdit(full,C,mine,new Set()),/isn't in this campaign's storage/);
 const next=applyCoGmEdit(full,C,mine,new Set([IMG]));
 assert.equal(next.entries.find(e=>e.id==='demo-mara').picture.imageId,IMG);
});
