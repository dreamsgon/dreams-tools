import test from 'node:test';
import assert from 'node:assert/strict';
import {newPicture,fitCircle,tokenImageFit,circleStyle,tokenPicture} from '../lib/encyclopedia/picture.ts';
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

test('a token ring can be any picked #rrggbb colour but not other text',()=>{
  const w=book('gm'),withRing=ring=>({...w,entries:[{...w.entries[0],picture:{...newPicture(img,5,5),ring}}]});
  assert.equal(workspaceSchema.parse(withRing('#12ab9f')).entries[0].picture.ring,'#12ab9f');
  for(const bad of ['red','#abc','#12ab9g','#12ab9f;x'])assert.throws(()=>workspaceSchema.parse(withRing(bad)),bad);
});

test('a token can have no ring, but only as a true/false choice',()=>{
  const w=book('gm'),withFlag=noRing=>({...w,entries:[{...w.entries[0],picture:{...newPicture(img,5,5),noRing}}]});
  assert.equal(workspaceSchema.parse(withFlag(true)).entries[0].picture.noRing,true);
  assert.equal(workspaceSchema.safeParse(withFlag('yes')).success,false);
});

test('a separate token image has its own framing and the portrait stays', () => {
  const img2='1c6b9d0f-4a2e-4d3b-8c8f-2e3d4c5b6a71';
  const main={...newPicture(img,600,600),ring:'#d9b25e',squares:2};
  assert.deepEqual(tokenPicture(main),main);
  const split={...main,token:{...newPicture(img2,400,800),x:.4,y:.3,size:.5}};
  const t=tokenPicture(split);
  assert.equal(t.imageId,img2);assert.deepEqual([t.width,t.height,t.x,t.y,t.size],[400,800,.4,.3,.5]);
  assert.equal(t.ring,'#d9b25e');assert.equal(t.squares,2);assert.equal('token' in t,false);
  assert.equal(split.imageId,img,'the portrait keeps the main image');
  assert.deepEqual(tokenImageFit(t),tokenImageFit({...split.token}));
});

test('picture.token is optional and validated like the picture', () => {
  const img2='1c6b9d0f-4a2e-4d3b-8c8f-2e3d4c5b6a71';
  const parse=p=>workspaceSchema.safeParse({schemaVersion:1,worlds:[{id:'w1',name:'W',description:'',archived:false}],campaigns:[],
   entries:[{id:'e1',worldId:'w1',campaignId:null,parentId:null,title:'T',kind:'note',body:'',picture:p,updatedAt:'2026-01-01T00:00:00.000Z'}]});
  const base=newPicture(img,600,600);
  assert.ok(parse(base).success);
  assert.ok(parse({...base,token:newPicture(img2,300,500)}).success);
  assert.ok(!parse({...base,token:{...newPicture(img2,300,500),imageId:'nope'}}).success);
  assert.ok(!parse({...base,token:{...newPicture(img2,300,500),size:.1}}).success);
  assert.ok(!parse({...base,token:{imageId:img2,width:3,height:3}}).success);
});

test('tokens can be Tiny (½) or Small (¾) as well as whole squares', async () => {
 const {pictureSchema}=await import('../lib/encyclopedia/world-model.ts');
 const {tokenSizes}=await import('../lib/encyclopedia/picture.ts');
 const base=newPicture('3f2b9c1e-8d4a-4b6f-9e2a-1c5d7f8a9b0c',600,600);
 for(const squares of [0.5,0.75,1,2,6])assert.ok(pictureSchema.safeParse({...base,squares}).success,String(squares));
 for(const squares of [0.25,0.6,1.5,7])assert.equal(pictureSchema.safeParse({...base,squares}).success,false,String(squares));
 assert.deepEqual(tokenSizes.slice(0,3).map(s=>s.squares),[0.5,0.75,1]);
});
