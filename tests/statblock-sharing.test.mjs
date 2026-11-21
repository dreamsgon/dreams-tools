import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSchema,demoWorkspace,playerCampaign,defaultCharacter} from '../lib/encyclopedia/world-model.ts';
import {hideTabsPatch} from '../lib/encyclopedia/templates.ts';
import {defaultProfile} from '../lib/encyclopedia/character-profile.ts';
import {playerPins} from '../lib/encyclopedia/profile-pins.ts';
import {playersBook} from '../lib/mcp/players-only.ts';

const T='2026-11-21T10:00:00.000Z';
const block='Owl familiar\nTiny beast\nArmor Class 11\nTalons. Melee Weapon Attack: +3 to hit, 1 slashing.';
const page=(c,character,extra={})=>({id:'owl',worldId:c.worldId,campaignId:c.id,parentId:null,title:'Hoot',kind:'character',body:'',overviewVisibility:'players',updatedAt:T,character:{...defaultCharacter(),role:'companion',statblock:block,...character},...extra});
const forPlayers=(e,mine=new Set())=>{const s=demoWorkspace(),c=s.campaigns[0];const parsed=workspaceSchema.safeParse({...s,entries:[...s.entries,e(c)]});assert.ok(parsed.success,parsed.error?.message);return playerCampaign(parsed.data,c.id,mine).entries.find(x=>x.id==='owl');};

test('a statblock stays GM only by default, even on a player\'s own page',()=>{
  assert.equal(forPlayers(c=>page(c,{})).statblock,undefined);
  assert.equal(forPlayers(c=>page(c,{}),new Set(['owl'])).statblock,undefined);
});

test('a shared statblock reaches players as pasted, with its rolls setting',()=>{
  assert.deepEqual(forPlayers(c=>page(c,{statblockVisibility:'players'})).statblock,{text:block});
  assert.deepEqual(forPlayers(c=>page(c,{statblockVisibility:'players',statblockRolls:false})).statblock,{text:block,rolls:false});
  // A shared statblock alone is enough for players to get the page.
  const only=forPlayers(c=>page(c,{statblockVisibility:'players'},{overviewVisibility:'gm'}));
  assert.ok(only);assert.equal(only.tabs.length,0);assert.equal(only.statblock.text,block);
});

test('a hidden Statblock tab is never sent, and hiding it switches it back to GM only',()=>{
  assert.equal(forPlayers(c=>page(c,{statblockVisibility:'players'},{hiddenTabs:['statblock']})).statblock,undefined);
  const e=page({worldId:'w',id:'c'},{statblockVisibility:'players'});
  assert.equal(hideTabsPatch(e,['statblock']).character.statblockVisibility,'gm');
});

test('an empty statblock is not sent even when shared',()=>{
  assert.equal(forPlayers(c=>page(c,{statblockVisibility:'players',statblock:'  '})).statblock,undefined);
  assert.equal(forPlayers(c=>page(c,{statblockVisibility:'players',statblock:'  '},{overviewVisibility:'gm'})),undefined);
});

test('statblock pins reach players only when the statblock is shared',()=>{
  const pins=[{id:'a',kind:'statblock',ref:'Armor Class 11'},{id:'b',kind:'statblock',ref:'Gone line'}];
  assert.deepEqual(playerPins(pins,{}),[]);
  assert.deepEqual(playerPins(pins,{statblock:block}),[{id:'a',kind:'statblock',line:'Armor Class 11'}]);
  const profile={...defaultProfile(),visibility:'players',pins};
  assert.equal(forPlayers(c=>page(c,{},{profile})).profile?.pins,undefined);
  assert.deepEqual(forPlayers(c=>page(c,{statblockVisibility:'players'},{profile})).profile.pins,[{id:'a',kind:'statblock',line:'Armor Class 11'}]);
});

test('player-only MCP reads keep the statblock only when it is shared',()=>{
  const s=demoWorkspace(),c=s.campaigns[0];
  const book=(character,extra)=>playersBook({...s,entries:[...s.entries,page(c,character,extra)]},c.id).entries.find(x=>x.id==='owl');
  assert.equal(book({}).character.statblock,undefined);
  assert.equal(book({statblockVisibility:'players'}).character.statblock,block);
  assert.equal(book({statblockVisibility:'players'},{hiddenTabs:['statblock']}).character.statblock,undefined);
});
