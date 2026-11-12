import test from 'node:test';
import assert from 'node:assert/strict';
import {statblockSegments,statblockRolls,fieldRoll} from '../lib/encyclopedia/statblock.ts';
import {discordRollMessage,discordTarget} from '../lib/encyclopedia/discord-roll.ts';
import {demoWorkspace,workspaceSchema,playerCampaign,campaignExport} from '../lib/encyclopedia/world-model.ts';
const rolls=line=>statblockSegments(line).filter(s=>s.formula).map(s=>[s.text,s.formula,s.context]);

test('pasted statblocks: dice, to-hit, ability and skill modifiers become rolls',()=>{
 assert.deepEqual(rolls('Hit Points 27 (5d10)'),[['5d10','5d10','Hit Points']]);
 assert.deepEqual(rolls('STR 17 (+3) DEX 14 (+2) INT 8 (−1)'),[['+3','1d20+3','STR'],['+2','1d20+2','DEX'],['−1','1d20-1','INT']]);
 assert.deepEqual(rolls('Skills Stealth +6, Survival +2'),[['+6','1d20+6','Stealth'],['+2','1d20+2','Survival']]);
 assert.deepEqual(rolls('Morningstar. Melee Weapon Attack: +5 to hit, reach 5 ft. Hit: 11 (2d8 + 3) piercing damage.'),[['+5 to hit','1d20+5','Morningstar'],['2d8 + 3','2d8+3','Morningstar']]);
});
test('distances, ranges and words are not rolls; explicit rolls always work',()=>{
 assert.deepEqual(rolls('Speed 30 ft., range 30/120 ft., AC16-2, 1-2 creatures'),[]);
 assert.equal(statblockRolls('Stealth +6\n[[1d6+2|Sneak attack]]',false).length,1,'with detection off only [[...]] rolls');
});
test('sheet fields roll by their setting',()=>{
 assert.equal(fieldRoll({type:'number'},3),null);
 assert.equal(fieldRoll({type:'number',roll:'d20'},3),'1d20+3');
 assert.equal(fieldRoll({type:'number',roll:'d20'},-1),'1d20-1');
 assert.equal(fieldRoll({type:'text',roll:'formula'},'2d8 + 3'),'2d8+3');
 assert.equal(fieldRoll({type:'text',roll:'formula'},'Longsword'),null);
 assert.equal(fieldRoll({type:'number',roll:'custom',rollFormula:'1d20+{value}+2'},-3),'1d20-3+2');
 assert.equal(fieldRoll({type:'number',roll:'d20'},''),null);
});
test('statblocks and roll settings are saved, kept in backups, and never sent to players',()=>{
 const s=demoWorkspace(),c=s.campaigns[0],e=s.entries.find(e=>e.id==='demo-mara');
 e.character={role:'npc',group:'',tags:[],location:'',faction:'',status:'active',statsVisibility:'players',statsByCampaign:{[c.id]:{f1:4}},statblock:'SECRET-STATBLOCK\nStealth +6',statblockRolls:false};
 c.statFields=[{id:'f1',label:'Dex',section:'',type:'number',options:[],visibility:'players',archived:false,roll:'d20'}];
 c.discord={maptableCampaignId:'maptable-camp',route:'combat'};
 const parsed=workspaceSchema.parse(s);
 assert.equal(parsed.entries.find(x=>x.id==='demo-mara').character.statblock,'SECRET-STATBLOCK\nStealth +6');
 assert.equal(parsed.campaigns[0].statFields[0].roll,'d20');
 assert.deepEqual(discordTarget(parsed,c.id),{maptableCampaignId:'maptable-camp',route:'combat'});
 assert(JSON.stringify(campaignExport(parsed,c.id)).includes('SECRET-STATBLOCK'));
 const player=JSON.stringify(playerCampaign(parsed,c.id));
 assert(!player.includes('SECRET-STATBLOCK'));assert(!player.includes('maptable-camp'));
 // Data saved before these fields existed still loads.
 delete e.character.statblock;delete e.character.statblockRolls;delete c.discord;delete c.statFields[0].roll;workspaceSchema.parse(s);
});
test('Discord roll messages are one formatted post and refuse bad formulas',()=>{
 assert.equal(discordRollMessage({campaignId:'c',title:'Klarg · Morningstar',formula:'1d20+5',total:19,detail:'14 + 5'}),'🎲 Klarg · Morningstar\n1d20+5 = **19** (14 + 5)');
 assert.throws(()=>discordRollMessage({campaignId:'c',title:'x',formula:'drop table',total:1,detail:''}));
 assert.throws(()=>discordTarget(demoWorkspace(),'demo-campaign'),/Discord channel/);
});
