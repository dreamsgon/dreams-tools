import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSchema,demoWorkspace,playerCampaign} from '../lib/encyclopedia/world-model.ts';
import {lookAttributes,playerLook,hasLook} from '../lib/encyclopedia/look.ts';

const banner={imageId:'22222222-2222-4222-8222-222222222222',width:1600,height:600,y:.4};
function withLook(look){const s=demoWorkspace();s.campaigns=s.campaigns.map(c=>c.id==='demo-campaign'?{...c,look}:c);return s;}

test('a campaign look is checked and turned into attributes', () => {
  assert.equal(workspaceSchema.safeParse(withLook({accent:'crimson',headingFont:'cinzel',surface:'stone',banner})).success,true);
  assert.equal(workspaceSchema.safeParse(withLook({accent:'neon'})).success,false);
  assert.equal(workspaceSchema.safeParse(withLook({banner:{...banner,y:2}})).success,false);
  const a=lookAttributes({accent:'crimson',headingFont:'cinzel',surface:'plain'});
  assert.equal(a['data-look-accent'],'crimson');
  assert.equal(a['data-look-surface'],undefined);
  assert.match(a.style['--font-display'],/Cinzel/);
  assert.deepEqual(lookAttributes(undefined),{style:{}});
  assert.equal(hasLook({surface:'plain'}),false);
});

test('players get the look unless it is kept to the GM', () => {
  const shared=playerCampaign(workspaceSchema.parse(withLook({accent:'brass',banner})),'demo-campaign');
  assert.equal(shared.campaign.look.accent,'brass');
  assert.equal(shared.campaign.look.banner.imageId,banner.imageId);
  assert.equal('players' in shared.campaign.look,false);
  const kept=playerCampaign(workspaceSchema.parse(withLook({accent:'brass',players:false})),'demo-campaign');
  assert.equal(kept.campaign.look,undefined);
  assert.equal(playerLook(undefined),undefined);
});
