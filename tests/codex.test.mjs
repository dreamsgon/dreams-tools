import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSchema,demoWorkspace,playerCampaign,campaignExport,importCopy} from '../lib/encyclopedia/world-model.ts';
import {codexCategories,codexIn,setFound,isNewFind} from '../lib/encyclopedia/codex.ts';

const now='2026-11-12T00:00:00.000Z';
const lore=(id,title,codex,campaignId=null,body='')=>({id,worldId:'demo-world',campaignId,parentId:null,title,kind:'lore',body,codex,updatedAt:now});
function world(extra){const s=demoWorkspace();s.entries.push(...extra);return workspaceSchema.parse(s);}

test('codex finds are kept per campaign', () => {
  let c={category:'Bestiary',summary:'Old women of the reeds.',found:{}};
  c=setFound(c,'demo-campaign',true,'Session 9',now);
  const s=world([lore('hag','Bog hag',c)]);
  assert.equal(codexIn(s.entries,'demo-world','demo-campaign').length,1);
  assert.equal(s.entries.find(e=>e.id==='hag').codex.found['demo-campaign'].label,'Session 9');
  assert.deepEqual(setFound(c,'demo-campaign',false).found,{});
  // A campaign page can't be found in another campaign.
  const bad={...s,entries:[...s.entries,lore('x','X',{category:'Bestiary',summary:'',found:{'demo-campaign-two':{at:now}}},'demo-campaign')]};
  assert.equal(workspaceSchema.safeParse(bad).success,false);
  assert.equal(isNewFind({at:now},Date.parse(now)+864e5),true);
  assert.equal(isNewFind({at:now},Date.parse(now)+8*864e5),false);
});

test('categories keep the saved order and add ones in use', () => {
  const s=world([lore('a','A',{category:'Songs',summary:'',found:{}})]);
  assert.deepEqual(codexCategories(s.entries,['Bestiary']),['Bestiary','Songs']);
  assert.equal(codexCategories(s.entries,undefined)[0],'Bestiary');
});

test('players get found entries only, with the summary and never the GM text', () => {
  const s=world([
    lore('hag','Bog hag',{category:'Bestiary',summary:'She trades in names.',found:{'demo-campaign':{at:now,label:'Session 9'}}},null,'GM SECRET TEXT'),
    lore('hound','Mire hound',{category:'Bestiary',summary:'UNFOUND SUMMARY',found:{}}),
  ]);
  const p=playerCampaign(s,'demo-campaign'),text=JSON.stringify(p);
  const hag=p.entries.find(e=>e.id==='hag');
  assert.deepEqual(hag.codex,{category:'Bestiary',summary:'She trades in names.',found:{at:now,label:'Session 9'}});
  assert.deepEqual(hag.tabs,[]);
  assert(!text.includes('GM SECRET TEXT'));assert(!text.includes('UNFOUND SUMMARY'));assert(!text.includes('Mire hound'));
  // The other campaign hasn't found it.
  assert(!JSON.stringify(playerCampaign(s,'demo-campaign-two')).includes('Bog hag'));
});

test('exports and copies keep finds for the right campaign', () => {
  const s=world([lore('hag','Bog hag',{category:'Bestiary',summary:'',found:{'demo-campaign':{at:now},'demo-campaign-two':{at:now}}})]);
  const out=campaignExport(s,'demo-campaign');
  assert.deepEqual(Object.keys(out.entries.find(e=>e.id==='hag').codex.found),['demo-campaign']);
  const copy=importCopy(s,s);
  assert.equal(workspaceSchema.safeParse(copy).success,true);
});
