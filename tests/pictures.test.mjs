import test from 'node:test';
import assert from 'node:assert/strict';
import {newPicture,fitCircle,tokenImageFit,circleStyle} from '../lib/encyclopedia/picture.ts';
import {workspaceSchema,playerCampaign} from '../lib/encyclopedia/world-model.ts';

const img='0b5a8c9e-3f1d-4c2a-9b7e-1d2c3b4a5f60';

test('a new picture fits the largest circle, a little high on tall pictures', () => {
  assert.deepEqual(newPicture(img,400,400),{imageId:img,width:400,height:400,x:.5,y:.5,size:1});
  const tall=newPicture(img,400,800);
  assert.equal(tall.size,1);assert.equal(tall.y,.38);
  assert.equal(newPicture(img,400,500).y,.4,'never so high the circle leaves the picture');
});

test('the circle stays inside the picture and never gets smaller than a fifth', () => {
  const p=newPicture(img,1000,500);
  assert.deepEqual(fitCircle(p,0,0,.5),{...p,x:.125,y:.25,size:.5});
  assert.equal(fitCircle(p,.5,.5,.05).size,.2);
  assert.equal(fitCircle(p,.5,.5,3).size,1);
});

test('the token shows exactly the circle', () => {
  assert.deepEqual(tokenImageFit(newPicture(img,400,400)),{imageZoom:1,imageOffsetX:0,imageOffsetY:0});
  // A 1000×500 picture with a circle 250 px across centred at (250, 125).
  const p=fitCircle(newPicture(img,1000,500),.25,.25,.5);
  const fit=tokenImageFit(p);
  assert.equal(fit.imageZoom,2);
  // Maptable covers the token with the picture's shorter side, then zooms: 250 px of picture fill the token.
  // The picture's centre (500, 250) sits 250 px right and 125 px down of the circle's centre: 1 and 0.5 token widths.
  assert.deepEqual([fit.imageOffsetX,fit.imageOffsetY],[1,.5]);
  assert.deepEqual(circleStyle(p,50),{backgroundSize:'200px 100px',backgroundPosition:'-25px 0px'});
});

const gh={repository:'',branch:'main'};
const book=(overviewVisibility)=>workspaceSchema.parse({schemaVersion:1,worlds:[{id:'w1',name:'W',description:'',archived:false}],
 campaigns:[{id:'c1',worldId:'w1',name:'C',description:'',github:gh}],
 entries:[{id:'e1',worldId:'w1',campaignId:'c1',parentId:null,title:'Fen drake',kind:'character',body:'Hates bells.',overviewVisibility,
  character:{role:'creature',group:'',tags:[],location:'',faction:'',status:'active',statsVisibility:'gm',statsByCampaign:{}},
  picture:{...newPicture(img,600,600),ring:'#d9b25e',squares:2},updatedAt:'2026-01-01T00:00:00.000Z'},
  {id:'e2',worldId:'w1',campaignId:'c1',parentId:null,title:'Secret',kind:'character',body:'',tabs:[{id:'t1',title:'Rumours',body:'x',visibility:'players'}],
  picture:newPicture(img,10,10),updatedAt:'2026-01-01T00:00:00.000Z'}]});

test('creatures are characters, and players see a picture only with the Overview', () => {
  const shared=playerCampaign(book('players'),'c1').entries;
  assert.equal(shared.find(e=>e.id==='e1').role,'creature');
  assert.equal(shared.find(e=>e.id==='e1').picture.squares,2);
  assert.equal(shared.find(e=>e.id==='e2').picture,undefined,'only a tab is shared');
  assert.equal(playerCampaign(book('gm'),'c1').entries.find(e=>e.id==='e1'),undefined);
  assert.throws(()=>workspaceSchema.parse({...book('gm'),entries:[{...book('gm').entries[0],picture:{...newPicture(img,5,5),size:.1}}]}));
});
