import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoWorkspace, workspaceSchema, playerCampaign, stripSecrets, campaignExport } from '../../lib/encyclopedia/world-model.ts';
import { callReadTool } from '../../lib/encyclopedia/mcp.ts';

test('stripSecrets removes GM secret blocks and keeps the rest', () => {
  assert.equal(stripSecrets('Before\n\n::: secret\nHIDDEN\n:::\n\nAfter'), 'Before\n\nAfter');
  assert.equal(stripSecrets('A\n::: Secret \nHIDDEN\n  :::  \nB'), 'A\nB');
  assert.equal(stripSecrets('A\r\n::: secret\r\nHIDDEN\r\n:::\r\nB'), 'A\r\nB');
  assert.equal(stripSecrets('No secrets here ::: inline'), 'No secrets here ::: inline');
  assert.equal(stripSecrets('  keeps\n\n\nspacing  '), '  keeps\n\n\nspacing  ');
});

test('an unclosed secret hides everything after it', () => {
  assert.equal(stripSecrets('Public\n::: secret\nHIDDEN\nALSO-HIDDEN'), 'Public');
});

test('secret markers inside code fences still hide the text', () => {
  assert(!stripSecrets('```\n::: secret\nHIDDEN\n:::\n```').includes('HIDDEN'));
});

test('player views never contain secret text from the overview or a shared tab', () => {
  const s = demoWorkspace();
  const place = s.entries.find(e => e.id === 'demo-greyhaven')!;
  place.overviewVisibility = 'players';
  place.body = 'Public intro\n\n::: secret\nSECRET-OVERVIEW\n:::\n\nPublic outro\n::: secret\nSECRET-UNCLOSED';
  place.tabs = [{ id: 'tab-1', title: 'Rumors', body: 'Heard in town\n::: secret\nSECRET-TAB\n:::', visibility: 'players' }];
  workspaceSchema.parse(s);
  const view = playerCampaign(s, 'demo-campaign'), text = JSON.stringify(view);
  for (const secret of ['SECRET-OVERVIEW', 'SECRET-UNCLOSED', 'SECRET-TAB']) assert(!text.includes(secret), secret);
  const entry = view.entries.find(e => e.id === 'demo-greyhaven')!;
  assert.equal(entry.tabs[0].body, 'Public intro\n\nPublic outro');
  assert.equal(entry.tabs[1].body, 'Heard in town');
  // The GM's own copies keep secrets: saved data, backups, and read-only AI access are unchanged.
  assert(place.body.includes('SECRET-OVERVIEW'));
  assert(JSON.stringify(campaignExport(s, 'demo-campaign')).includes('SECRET-TAB'));
  assert(JSON.stringify(callReadTool(s, 'read_article', { campaign_id: 'demo-campaign', article_id: 'demo-greyhaven' })).includes('SECRET-OVERVIEW'));
});

test('stripSecrets: blocks inside a secret do not end it early; asides and (gm) lines go too', () => {
  assert.equal(stripSecrets('A\n::: secret\n::: note\nINNER\n:::\nSTILL HIDDEN\n:::\nB'), 'A\nB');
  assert.equal(stripSecrets('The innkeeper %%is the cult leader%% smiles.'), 'The innkeeper smiles.');
  assert.equal(stripSecrets('::: infobox\nKind: Inn\n(gm) Owner: The cult\n:::'), '::: infobox\nKind: Inn\n:::');
  assert.equal(stripSecrets('(GM) whole line\nKept'), 'Kept');
  assert.equal(stripSecrets('100% sure, 50% likely'), '100% sure, 50% likely');
  assert.equal(stripSecrets('::: note\nPlain\n:::'), '::: note\nPlain\n:::');
});

test('players never receive asides, (gm) rows or text in a secret holding nested blocks', () => {
  const data = demoWorkspace();
  const page = data.entries.find(e => e.id === 'demo-greyhaven')!;
  page.overviewVisibility = 'players';
  page.body = 'Open %%ASIDE%% text\n(gm) GMLINE\n::: secret\n::: columns\nNESTED\n+++\nMORE\n:::\nAFTER\n:::\nEnd';
  const json = JSON.stringify(playerCampaign(data, 'demo-campaign'));
  for (const word of ['ASIDE', 'GMLINE', 'NESTED', 'MORE', 'AFTER']) assert.ok(!json.includes(word), word);
  assert.ok(json.includes('End'));
});
