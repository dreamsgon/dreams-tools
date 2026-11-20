import test from 'node:test';
import assert from 'node:assert/strict';
import {campaignToolLinks,landingHref,landingNote,hasTool,toolMarks,matchesRef,ownCampaign,memberCampaign,addToolParam,addToolHref,dashboardHref,joinedForSwitcher} from '../lib/campaign-nav.ts';
import {switcherItems} from '../lib/campaign-switcher.ts';

const book=(id,over={})=>({id,name:id,description:'',worldId:'w',worldName:'Thedas',archived:false,pages:3,characters:0,maptableCampaignId:null,forum:false,solo:false,lastEdited:null,maps:0,latest:[],...over});
const both={key:'e:frog',name:'Dragon Age',maptable:{id:'mf',name:'Dragon Age',scenes:2},encyclopedia:book('frog',{forum:true}),folderId:null};
const notes={key:'e:stc',name:'Star Trek',maptable:null,encyclopedia:book('stc'),folderId:null};
const maps={key:'m:moth',name:'Mothership',maptable:{id:'moth',name:'Mothership',scenes:1},encyclopedia:null,folderId:null};
const joined=(over={})=>({ref:'a'.repeat(64),campaign:'Curse of Strahd',world:'Barovia',ownerName:'Sam',asking:false,open:true,gm:false,...over});

test('a campaign you run lists all four places; missing ones offer to add them on its Dashboard',()=>{
  const links=campaignToolLinks(ownCampaign(notes));
  assert.deepEqual(links.map(l=>[l.name,l.href,l.add]),[
    ['Dashboard','/campaigns/e%3Astc',null],
    ['Maptable',null,'/campaigns/e%3Astc?add=maptable'],
    ['Wiki','/encyclopedia?campaign=stc',null],
    ['Forum',null,'/campaigns/e%3Astc?add=forum'],
  ]);
  assert.deepEqual(campaignToolLinks(ownCampaign(both)).map(l=>l.href),['/campaigns/e%3Afrog','/maptable?campaign=mf','/encyclopedia?campaign=frog','/forum#c-frog']);
});

test('picking a campaign keeps you in the same place, or opens its Dashboard when it lacks it',()=>{
  assert.equal(landingHref(ownCampaign(both),'forum'),'/forum#c-frog');
  assert.equal(landingHref(ownCampaign(notes),'maptable'),'/campaigns/e%3Astc?add=maptable');
  assert.equal(landingHref(ownCampaign(maps),'encyclopedia'),'/campaigns/m%3Amoth?add=encyclopedia');
  assert.equal(landingHref(ownCampaign(maps),'dashboard'),'/campaigns/m%3Amoth');
  assert.equal(landingNote(ownCampaign(notes),'maptable'),'No Maptable yet · opens Dashboard');
  assert.equal(landingNote(ownCampaign(both),'maptable'),'Thedas');
});

test('a member sees only the places they can open, with no Dashboard and nothing to add',()=>{
  const player=memberCampaign(joined({forum:true}));
  assert.deepEqual(campaignToolLinks(player).map(l=>[l.name,l.href,l.add]),[
    ['Wiki',`/encyclopedia/player#m-${'a'.repeat(64)}`,null],
    ['Forum',`/forum#m-${'a'.repeat(64)}`,null],
  ]);
  const cogm=memberCampaign(joined({gm:true,maps:true}));
  assert.deepEqual(campaignToolLinks(cogm).map(l=>l.name),['Maptable','Wiki']);
  assert.equal(campaignToolLinks(cogm)[1].href,`/encyclopedia#m-${'a'.repeat(64)}`);
  // From Maptable, a player who may not open it lands on the first place they can.
  assert.equal(landingHref(player,'maptable'),`/encyclopedia/player#m-${'a'.repeat(64)}`);
  assert.equal(hasTool(player,'maptable'),false);
  assert.equal(landingNote(player,'maptable'),'No Maptable for you here');
});

test('tool marks say which of Maptable, Wiki and Forum a campaign has',()=>{
  assert.deepEqual(toolMarks(ownCampaign(maps)).map(m=>[m.name,m.on]),[['Maptable',true],['Wiki',false],['Forum',false]]);
});

test('a page finds its campaign by any id it knows',()=>{
  const c=ownCampaign(both);
  for(const ref of [{key:'e:frog'},{key:'m:mf'},{maptableId:'mf'},{encyclopediaId:'frog'}])assert.equal(matchesRef(c,ref),true,JSON.stringify(ref));
  for(const ref of [{key:'e:stc'},{maptableId:'x'},{memberRef:'a'.repeat(64)},{}])assert.equal(matchesRef(c,ref),false,JSON.stringify(ref));
  assert.equal(matchesRef(memberCampaign(joined()),{memberRef:'a'.repeat(64)}),true);
});

test('the Dashboard reads ?add= only for a real place',()=>{
  assert.equal(addToolParam('forum'),'forum');
  for(const bad of ['dashboard','',null,undefined,'wiki'])assert.equal(addToolParam(bad),null);
  assert.equal(addToolHref('e:a b','maptable'),'/campaigns/e%3Aa%20b?add=maptable');
  assert.equal(dashboardHref('m:x'),'/campaigns/m%3Ax');
});

test('the switcher lists joined campaigns last, leaving out ones you are still asking to join',()=>{
  const summary={rows:[both,notes],folders:[],recent:[],worlds:[],loose:0};
  const list=[joined(),joined({ref:'b'.repeat(64),campaign:'Asking',asking:true})];
  assert.equal(joinedForSwitcher(list).length,1);
  const items=switcherItems(summary,{joined:list,recentLimit:0});
  assert.deepEqual(items.slice(-2).map(i=>i.type==='heading'?i.label:i.joined.campaign),["Campaigns you're in",'Curse of Strahd']);
  const found=switcherItems(summary,{joined:list,query:'barov'});
  assert.deepEqual(found.map(i=>i.type==='heading'?i.label:i.type==='member'?i.joined.campaign:i.row.name),['1 match','Curse of Strahd']);
});
