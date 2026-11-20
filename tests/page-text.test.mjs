import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveText,textDiff,proseLook,TEXT_DEFAULT,pageTextSchema} from '../lib/encyclopedia/page-text.ts';
import {demoWorkspace,playerCampaign,workspaceSchema} from '../lib/encyclopedia/world-model.ts';

const pages=list=>{const m=new Map(list.map(p=>[p.id,p]));return id=>m.get(id);};

test('a page reads its own settings, then the nearest branch above it, then the Wiki default',()=>{
 const top={id:'top',parentId:null,text:{font:'hand',branch:true}},mid={id:'mid',parentId:'top',text:{size:'l',branch:true}},leaf={id:'leaf',parentId:'mid'},own={id:'own',parentId:'mid',text:{size:'s'}};
 const by=pages([top,mid,leaf,own]);
 assert.deepEqual(resolveText(leaf,by,{line:'airy'}),{text:{...TEXT_DEFAULT,line:'airy',font:'hand',size:'l'},from:'branch',fromId:'mid'});
 assert.deepEqual(resolveText(own,by).text.size,'s');
 assert.equal(resolveText(own,by).from,'page');
 assert.deepEqual(resolveText({id:'x',parentId:null},by,{drop:'on'}),{text:{...TEXT_DEFAULT,drop:'on'},from:'wiki',fromId:undefined});
 const notBranch={id:'nb',parentId:null,text:{font:'mono'}};
 assert.equal(resolveText({id:'c',parentId:'nb'},pages([notBranch])).text.font,'serif','page-only settings stay on that page');
 const a={id:'a',parentId:'b',text:{size:'xl',branch:true}},b={id:'b',parentId:'a'};
 assert.equal(resolveText(b,pages([a,b])).text.size,'xl','a loop in parents ends');
});

test('the look is classes and variables only for what differs; the payload carries only differences',()=>{
 assert.deepEqual(proseLook(undefined),{className:'',style:{}});
 assert.deepEqual(proseLook({size:'xl',font:'hand',para:'indent',heads:'caps',drop:'on'}),{className:'t-para-indent t-heads-caps t-drop t-set',style:{'--t-size':'23px','--t-font':'var(--wiki-font-hand)'}});
 assert.equal(textDiff(TEXT_DEFAULT),undefined);
 assert.deepEqual(textDiff({...TEXT_DEFAULT,line:'tight'}),{line:'tight'});
 assert.equal(pageTextSchema.safeParse({size:'giant'}).success,false,'only the listed values are kept');
});

test('players get the settings a page is read with, even from a branch they cannot open, and nothing else from it',()=>{
 const s=demoWorkspace();
 const world=s.worlds.find(w=>w.id==='demo-world');world.text={para:'indent'};
 const parent=s.entries.find(e=>e.id==='demo-greyhaven');
 parent.overviewVisibility='gm';parent.text={font:'hand',branch:true};
 s.entries.push({id:'child',worldId:'demo-world',campaignId:parent.campaignId,parentId:'demo-greyhaven',title:'Docks',kind:'note',body:'Wet.',overviewVisibility:'players',updatedAt:'2026-11-20T00:00:00.000Z'});
 workspaceSchema.parse(s);
 const view=playerCampaign(s,'demo-campaign');
 const child=view.entries.find(e=>e.id==='child');
 assert.deepEqual(child.text,{font:'hand',para:'indent'});
 assert.equal(child.parentId,undefined,'its GM-only parent is not named');
 assert.ok(!view.entries.some(e=>e.id==='demo-greyhaven'));
});

test('a page look keeps only what differs from a plain page, and players get it without the contents switch',async()=>{
 const {cleanPageLook,pageLookSchema}=await import('../lib/encyclopedia/page-text.ts');
 const banner={imageId:'0b5f6a8e-3c1d-4f2a-9b7e-1a2b3c4d5e6f',width:1200,height:400,y:.3};
 assert.equal(cleanPageLook({box:'right',toc:true,wide:false}),undefined);
 assert.deepEqual(cleanPageLook({banner,icon:'castle',box:'left',toc:false,wide:true}),{banner,icon:'castle',box:'left',toc:false,wide:true});
 assert.equal(pageLookSchema.safeParse({icon:'not-an-icon'}).success,false);
 assert.equal(pageLookSchema.safeParse({banner:{...banner,imageId:'nope'}}).success,false);
 const w=demoWorkspace();w.entries=w.entries.map(e=>e.id==='demo-first'?{...e,overviewVisibility:'players',pageLook:{banner,icon:'castle',toc:false}}:e);
 assert.ok(workspaceSchema.safeParse(w).success);
 const page=playerCampaign(w,'demo-campaign').entries.find(e=>e.id==='demo-first');
 assert.deepEqual(page.pageLook,{banner,icon:'castle',toc:undefined});
});
