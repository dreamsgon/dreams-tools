import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSchema,demoWorkspace,playerCampaign,defaultCharacter} from '../lib/encyclopedia/world-model.ts';
import {defaultProfile,layOutProfile,profileLayoutOf,profileFromLayout,playerProfile} from '../lib/encyclopedia/character-profile.ts';
import {featuresSchema,playerFeatures,featureGroupsOf,setUses,resetUses,moveFeature} from '../lib/encyclopedia/features.ts';
import {playerPins,sizePin,pinKindNames} from '../lib/encyclopedia/profile-pins.ts';

const C='demo-campaign',T='2026-11-17T02:00:00.000Z';
const feats=()=>[
 {id:'f1',name:'Second Wind',group:'Class',note:'Bonus action',text:'Heal [[1d10+3|Healing]].',uses:{value:1,max:1,reset:'Short rest'},rolls:[{name:'Heal',formula:'1d10+3'}]},
 {id:'f2',name:'Darkvision',group:'Species'},
 {id:'f3',name:'Action Surge',group:'Class',uses:{value:0,max:1,reset:'Short rest'}},
 {id:'f4',name:'Cursed blood',group:'Species',gm:true,text:'The GM’s secret.'},
];

test('features: schema, groups, uses, reset and moving', () => {
 assert.ok(featuresSchema.safeParse(feats()).success);
 assert.equal(featuresSchema.safeParse([...feats(),feats()[0]]).success,false,'ids are unique');
 assert.equal(featuresSchema.safeParse([{id:'x',name:'Bad',uses:{value:3,max:2}}]).success,false,'uses can’t be above the maximum');
 assert.deepEqual(featureGroupsOf(feats()).map(g=>[g.name,g.features.map(f=>f.id)]),[['Class',['f1','f3']],['Species',['f2','f4']]]);
 assert.equal(setUses(feats(),'f1',0)[0].uses.value,0);
 assert.equal(setUses(feats(),'f1',9)[0].uses.value,1,'kept at the maximum');
 assert.equal(setUses(feats(),'f1',-3)[0].uses.value,0);
 assert.equal(setUses(feats(),'f2',1)[1].uses,undefined,'a feature without uses is unchanged');
 const rested=resetUses(setUses(feats(),'f1',0),'short REST');
 assert.deepEqual(rested.filter(f=>f.uses).map(f=>f.uses.value),[1,1]);
 assert.deepEqual(resetUses(feats(),'Long rest').map(f=>f.uses?.value),feats().map(f=>f.uses?.value));
 assert.deepEqual(moveFeature(feats(),'f2',-1).map(f=>f.id),['f2','f1','f3','f4']);
 assert.deepEqual(moveFeature(feats(),'f1',-1).map(f=>f.id),['f1','f2','f3','f4']);
 assert.deepEqual(moveFeature(feats(),'f4',1).map(f=>f.id),['f1','f2','f3','f4']);
 const pf=playerFeatures(feats());
 assert.deepEqual(pf.map(f=>f.id),['f1','f2','f3']);
 assert.equal(pf.some(f=>'gm' in f),false);
 assert.deepEqual(playerFeatures(undefined),[]);
});

function world({vis='players',profile='players'}={}){
 const s=demoWorkspace();
 s.entries.push({id:'pc',worldId:'demo-world',campaignId:C,parentId:null,title:'Featured One',kind:'character',body:'',updatedAt:T,
  character:{...defaultCharacter(),features:feats(),featuresVisibility:vis},
  profile:{...defaultProfile(),visibility:profile,
   facts:[{id:'k1',label:'Class',value:'Fighter',size:'m'},{id:'k2',label:'Secret',value:'Vampire',gm:true}],
   pins:[{id:'p1',kind:'feature',ref:'f1',size:'l'},{id:'p2',kind:'feature',ref:'f4'},{id:'p3',kind:'feature',ref:'gone'}]}});
 return s;
}
const pcOf=(s,mine)=>playerCampaign(s,C,mine).entries.find(e=>e.id==='pc');

test('players get shared features without GM-only ones, and feature pins only for those', () => {
 const s=world();
 const ok=workspaceSchema.safeParse(s);assert.ok(ok.success,JSON.stringify(ok.error?.issues));
 const pe=pcOf(s);
 assert.deepEqual(pe.features.map(f=>f.id),['f1','f2','f3']);
 assert.equal(JSON.stringify(pe).includes('The GM’s secret'),false);
 assert.equal(JSON.stringify(pe).includes('Cursed blood'),false);
 assert.deepEqual(pe.profile.pins.map(p=>[p.id,p.kind,p.size]),[['p1','feature','l']]);
 assert.equal(pe.profile.pins[0].feature.name,'Second Wind');
 // GM-only Features tab: no features, no feature pins
 const hidden=pcOf(world({vis:'gm'}));
 assert.equal(hidden?.features,undefined);
 assert.equal(hidden?.profile?.pins,undefined);
 // the character's own player still sees them
 assert.deepEqual(pcOf(world({vis:'gm'}),new Set(['pc'])).features.map(f=>f.id),['f1','f2','f3']);
 // facts keep their width; GM-only facts stay out
 assert.deepEqual(pe.profile.facts,[{id:'k1',label:'Class',value:'Fighter',size:'m'}]);
});

test('widths: sizePin, and fact sizes in layouts', () => {
 assert.equal(pinKindNames.stat,'Stats & Skills');
 assert.equal(pinKindNames.feature,'Features');
 const pins=[{id:'a',kind:'stat',ref:'s'},{id:'b',kind:'feature',ref:'f',size:'m'}];
 assert.deepEqual(sizePin(pins,'a','l')[0],{id:'a',kind:'stat',ref:'s',size:'l'});
 assert.deepEqual(sizePin(pins,'b','s')[1],{id:'b',kind:'feature',ref:'f'},'S is the default and isn’t stored');
 assert.deepEqual(playerPins([{id:'x',kind:'feature',ref:'f1',size:'m'}],{features:[{id:'f1',name:'A'}]}),[{id:'x',size:'m',kind:'feature',feature:{id:'f1',name:'A'}}]);
 const p={...defaultProfile(),facts:[{id:'k1',label:'Class',value:'Fighter',size:'l'},{id:'k2',label:'Level',value:'3'}]};
 const layout=profileLayoutOf(p);
 assert.deepEqual(layout.facts,[{id:'k1',label:'Class',size:'l'},{id:'k2',label:'Level'}]);
 assert.deepEqual(profileFromLayout(layout).facts.map(f=>f.size),['l',undefined]);
 // laying a layout on: the layout's width wins, and a character's own width stays when the layout has none
 const own={...defaultProfile(),facts:[{id:'k1',label:'Class',value:'Rogue',size:'m'},{id:'k2',label:'Level',value:'5',size:'m'}]};
 const laid=layOutProfile(own,layout);
 assert.deepEqual(laid.facts.map(f=>[f.label,f.value,f.size]),[['Class','Rogue','l'],['Level','5','m']]);
 assert.deepEqual(playerProfile(laid,()=>true,t=>t,[]).facts.map(f=>f.size),['l','m']);
});

test('withoutDeletedStats removes the stats’ values, typed modifiers and arrangement ids, only in that campaign', async () => {
 const {withoutDeletedStats}=await import('../lib/encyclopedia/stat-arrange.ts');
 const w={entries:[
  {id:'a',character:{statsByCampaign:{c1:{str:10,'str-mod':0,dex:12},c2:{str:8}},statLayout:{order:['dex','str'],off:['str']}}},
  {id:'b',character:{statsByCampaign:{c1:{dex:3}}}},
  {id:'c'},
 ]};
 const out=withoutDeletedStats(w,'c1',['str']);
 assert.deepEqual(out.entries[0].character.statsByCampaign,{c1:{dex:12},c2:{str:8}});
 assert.deepEqual(out.entries[0].character.statLayout,{order:['dex']});
 assert.equal(out.entries[1],w.entries[1],'untouched characters are the same object');
 assert.equal(out.entries[2],w.entries[2]);
 assert.equal(withoutDeletedStats(w,'c1',[]),w);
 assert.deepEqual(w.entries[0].character.statsByCampaign.c1,{str:10,'str-mod':0,dex:12},'does not mutate');
});

test('a fact can start a new line: kept by layouts and sent to players', () => {
 const p={...defaultProfile(),facts:[{id:'k1',label:'Species',value:'Dragon'},{id:'k2',label:'Class',value:'Paladin',br:true}]};
 const layout=profileLayoutOf(p);
 assert.deepEqual(layout.facts,[{id:'k1',label:'Species'},{id:'k2',label:'Class',br:true}]);
 assert.deepEqual(profileFromLayout(layout).facts.map(f=>!!f.br),[false,true]);
 const laid=layOutProfile({...defaultProfile(),facts:[{id:'k1',label:'Species',value:'Elf',br:true},{id:'k2',label:'Class',value:'Bard'}]},layout);
 assert.deepEqual(laid.facts.map(f=>[f.value,!!f.br]),[['Elf',false],['Bard',true]],'the layout’s line breaks win');
 assert.deepEqual(playerProfile(p,()=>true,t=>t,[]).facts.map(f=>!!f.br),[false,true]);
});
