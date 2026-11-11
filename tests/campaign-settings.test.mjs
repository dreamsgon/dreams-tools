import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignSettingsKey, requireCampaign, sceneCampaign, validWebhook } from '../lib/campaign-settings.ts';
const workspace = () => ({collections:[{id:'a',kind:'campaign',parentId:null},{id:'b',kind:'campaign',parentId:null},{id:'folder',kind:'folder',parentId:'a'}],scenes:[{id:'scene',containerId:'folder'},{id:'other',containerId:'b'},{id:'loose',containerId:null}]});
test('scene lookup isolates campaigns and rejects unfiled or absent scenes',()=>{
  const w=workspace();
  assert.equal(sceneCampaign(w,'scene'),'a');
  assert.equal(sceneCampaign(w,'other'),'b');
  for(const id of ['loose','missing',null]) assert.throws(()=>sceneCampaign(w,id));
  assert.equal(requireCampaign(w,'a'),'a');
  for(const id of ['folder','missing',null,'']) assert.throws(()=>requireCampaign(w,id));
});
test('scene lookup rejects broken and cyclic ancestry even above a campaign',()=>{
  const w=workspace();
  w.collections[0].parentId='folder';
  assert.throws(()=>sceneCampaign(w,'scene'));
  w.collections[0].parentId='missing';
  assert.throws(()=>sceneCampaign(w,'scene'));
  w.collections.push({...w.collections[2]});
  assert.throws(()=>sceneCampaign(w,'scene'));
});
test('configuration keys isolate users and campaigns including encoded identifiers',()=>{
  assert.notEqual(campaignSettingsKey('users/a/','a'),campaignSettingsKey('users/a/','b'));
  assert.notEqual(campaignSettingsKey('users/a/','a'),campaignSettingsKey('users/b/','a'));
  assert.equal(campaignSettingsKey('users/a/','a/b'),'users/a/campaign-settings/a%2Fb.json');
});
test('webhooks require the fixed Discord HTTPS endpoint without injected options',()=>{
  assert.ok(validWebhook('https://discord.com/api/webhooks/123/token_ABC-123'));
  for(const value of ['',null,'https://evil.example/api/webhooks/123/token','https://discord.com/api/webhooks/123/token?thread_id=1','http://discord.com/api/webhooks/123/token','https://user:pass@discord.com/api/webhooks/123/token']) assert.equal(validWebhook(value),false);
});
