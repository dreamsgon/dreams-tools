import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {newScene, newToken, initialWorkspace, workspaceSchema, tokenSchema} from '../lib/model.ts';
const source=fs.readFileSync(new URL('../lib/render.ts',import.meta.url),'utf8');
const javascript=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from "\.\/(model|effects|map-drawing|token-defaults|token-name|token-display-layout)"/g,(_,name)=>`from "${new URL('../lib/'+name+'.ts',import.meta.url).href}"`);
const {drawSceneBackdrop,renderScene,strokeFog,drawGrid,drawPerimeterLabels}=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'));
function context(){const calls=[];return new Proxy({calls,measureText:()=>({width:20})},{get:(o,k)=>k in o?o[k]:(...args)=>calls.push([k,...args]),set:(o,k,v)=>{o[k]=v;calls.push(['set',k,v]);return true;}});}

test('campaign sizes and individual overrides reach GM and player screenshot rendering',()=>{
 const w=initialWorkspace(),s=w.scenes[0];
 w.collections=[{id:'c',name:'C',kind:'campaign',parentId:null,tokenDefaults:{partyZeroHp:'off',npcZeroHp:'off',showName:true,showHp:true,nameScale:2,hpBarWidth:1.5,hpBarHeight:14}}];
 s.containerId='c';s.grid.type='none';s.fog.enabled=false;s.tokens=[newToken('Sized label')];
 for(const player of [false,true]) {
  const inherited=context();renderScene(inherited,s,w,new Map(),{player});
  assert.ok(inherited.calls.some(c=>c[0]==='fillRect'&&c[4]===14),'campaign HP thickness');
  const inheritedFont=inherited.calls.find(c=>c[0]==='set'&&c[1]==='font'&&c[2].startsWith('600 '))[2];
  s.tokens[0].nameScale=1;s.tokens[0].hpBarHeight=7;
  const overridden=context();renderScene(overridden,s,w,new Map(),{player});
  assert.ok(overridden.calls.some(c=>c[0]==='fillRect'&&c[4]===7),'individual HP thickness');
  const overriddenFont=overridden.calls.find(c=>c[0]==='set'&&c[1]==='font'&&c[2].startsWith('600 '))[2];
  assert.notEqual(inheritedFont,overriddenFont);
  delete s.tokens[0].nameScale;delete s.tokens[0].hpBarHeight;
 }
});

test('focused crop backing is bounded to the crop and its coordinate gutters',()=>{
 const scene=newScene();scene.grid.labelMode='perimeter';scene.grid.labels=true;
 const crop={x:280,y:140,width:420,height:350};
 let ctx=context();drawSceneBackdrop(ctx,scene,crop);
 assert.deepEqual(ctx.calls.filter(c=>c[0]==='fillRect'),[['fillRect',248,108,452,382]]);
 scene.grid.labels=false;ctx=context();drawSceneBackdrop(ctx,scene,crop);
 assert.deepEqual(ctx.calls.filter(c=>c[0]==='fillRect'),[['fillRect',280,140,420,350]]);
 ctx=context();drawSceneBackdrop(ctx,scene,null);
 assert.deepEqual(ctx.calls.filter(c=>c[0]==='fillRect'),[['fillRect',0,0,scene.width,scene.height]]);
});

test('cropped rendering preserves map alignment and absolute perimeter addresses',()=>{
 const scene=newScene();scene.grid.labelMode='perimeter';scene.grid.labels=true;scene.fog.enabled=false;scene.mapId='map';
 const crop={x:280,y:140,width:420,height:350},image={};
 const ctx=context();renderScene(ctx,scene,initialWorkspace(),new Map([['map',image]]),{crop});
 assert.deepEqual(ctx.calls.find(c=>c[0]==='rect'),['rect',280,140,420,350]);
 assert.deepEqual(ctx.calls.find(c=>c[0]==='fillRect'),['fillRect',280,140,420,350]);
 assert.deepEqual(ctx.calls.find(c=>c[0]==='drawImage'),['drawImage',image,0,0,scene.width,scene.height]);
 assert.deepEqual(ctx.calls.filter(c=>c[0]==='fillText').map(c=>c[1]),['E','F','G','H','I','J','3','4','5','6','7']);
 assert.ok(!ctx.calls.some(c=>c[0]==='translate'),'view and export retain ownership of coordinate transforms');
 assert.deepEqual(ctx.calls.filter(c=>c[0]==='fillRect').slice(1),[['fillRect',248,108,452,32],['fillRect',248,140,32,350]]);
});

test('campaign visibility defaults and token overrides govern names and HP in GM and player renders',()=>{
 const workspace=initialWorkspace();
 workspace.collections=[{id:'campaign',kind:'campaign',name:'Campaign',parentId:null,tokenDefaults:{partyZeroHp:'unconscious',npcZeroHp:'dead',showName:false,showHp:false}}];
 const scene=newScene();scene.containerId='campaign';scene.grid.type='none';scene.fog.enabled=false;workspace.scenes=[scene];
 const token={...newToken('Visible label'),showName:true,showHp:true,nameVisibility:'inherit',hpVisibility:'inherit'};scene.tokens=[token];
 for(const player of [false,true]) {
  let ctx=context();renderScene(ctx,scene,workspace,new Map(),{player});
  assert.ok(!ctx.calls.some(c=>c[0]==='fillText'&&c[1]===token.name),'campaign hides both center and external labels');
  assert.ok(!ctx.calls.some(c=>c[0]==='fillRect'&&c[4]===7),'campaign hides HP bars');
  token.nameVisibility='show';token.hpVisibility='show';ctx=context();renderScene(ctx,scene,workspace,new Map(),{player});
  assert.equal(ctx.calls.filter(c=>c[0]==='fillText'&&c[1]===token.name).length,1,'explicit show draws the name once at the chosen placement');
  assert.ok(ctx.calls.some(c=>c[0]==='fillRect'&&c[4]===7),'explicit show draws HP bars');
  workspace.collections[0].tokenDefaults.showName=true;workspace.collections[0].tokenDefaults.showHp=true;
  token.nameVisibility='hide';token.hpVisibility='hide';ctx=context();renderScene(ctx,scene,workspace,new Map(),{player});
  assert.ok(!ctx.calls.some(c=>c[0]==='fillText'&&c[1]===token.name),'explicit hide overrides campaign show');
  assert.ok(!ctx.calls.some(c=>c[0]==='fillRect'&&c[4]===7));
  workspace.collections[0].tokenDefaults.showName=false;workspace.collections[0].tokenDefaults.showHp=false;
  token.nameVisibility='inherit';token.hpVisibility='inherit';
 }
});

test('exploration markers respect player visibility and stay beneath fog',()=>{
 const s=newScene();s.grid.type='none';s.fog.enabled=true;
 s.pointsOfInterest=[{id:'p',name:'Hidden destination',x:30,y:40,color:'#123456',hidden:true,targetSceneId:null,activation:'double'}];
 const previous=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>context()})};
 try {
  let ctx=context();renderScene(ctx,s,initialWorkspace(),new Map(),{player:true});
  assert.ok(!ctx.calls.some(c=>c[0]==='fillText'&&c[1]==='Hidden destination'));
  s.pointsOfInterest[0].hidden=false;ctx=context();renderScene(ctx,s,initialWorkspace(),new Map(),{player:true});
  const label=ctx.calls.findIndex(c=>c[0]==='fillText'&&c[1]==='Hidden destination');
  assert.ok(label>=0&&label<ctx.calls.findIndex(c=>c[0]==='drawImage'));
 } finally {globalThis.document=previous;}
});
test('polygon fog uses a closed filled path and proper reveal/cover compositing',()=>{
 for(const mode of ['reveal','cover']){const ctx=context();strokeFog(ctx,{mode,shape:'polygon',size:20,points:[{x:1,y:2},{x:30,y:2},{x:30,y:40}]});assert.ok(ctx.calls.some(c=>c[0]==='closePath'));assert.ok(ctx.calls.some(c=>c[0]==='fill'));assert.equal(ctx.globalCompositeOperation,mode==='reveal'?'destination-out':'source-over');assert.ok(!ctx.calls.some(c=>c[0]==='arc'));}
});

test('merged fog paints overlapping contours independently with unchanged compositing',()=>{
 for(const mode of ['reveal','cover']) {
  const ctx=context();
  strokeFog(ctx,{mode,shape:'merged',size:20,points:[{x:0,y:0},{x:100,y:100},{x:50,y:0},{x:150,y:0},{x:150,y:100}],parts:[{shape:'rect',start:0,count:2},{shape:'polygon',start:2,count:3}]});
  assert.equal(ctx.calls.filter(c=>c[0]==='fillRect').length,1);
  assert.equal(ctx.calls.filter(c=>c[0]==='fill').length,1);
  assert.equal(ctx.globalCompositeOperation,mode==='reveal'?'destination-out':'source-over');
  assert.ok(!ctx.calls.some(c=>c[0]==='arc'));
 }
});
test('stored measurements respect player visibility and render beneath fog',()=>{
 const s=newScene();s.grid.type='none';s.fog.enabled=true;s.measurements=[{id:'m',label:'Secret',points:[{x:10,y:10},{x:80,y:80}],color:'#123456',hidden:true}];
 const oldDocument=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>context()})};
 try{let ctx=context();renderScene(ctx,s,initialWorkspace(),new Map(),{player:true});assert.ok(!ctx.calls.some(c=>c[0]==='fillText'&&c[1].includes('Secret')));
 ctx=context();renderScene(ctx,s,initialWorkspace(),new Map());const label=ctx.calls.findIndex(c=>c[0]==='fillText'&&c[1].includes('Secret'));assert.ok(label>=0);assert.ok(label<ctx.calls.findIndex(c=>c[0]==='drawImage'));
 s.measurements[0].hidden=false;ctx=context();renderScene(ctx,s,initialWorkspace(),new Map(),{player:true});assert.ok(ctx.calls.some(c=>c[0]==='fillText'&&c[1].includes('Secret')));
 }finally{globalThis.document=oldDocument;}
});
test('dark label theme uses pale text; perimeter rectangles never cover the map',()=>{
 const s=newScene();s.grid.labelTheme='dark';let ctx=context();drawGrid(ctx,s);assert.ok(ctx.calls.some(c=>c[0]==='set'&&c[1]==='fillStyle'&&c[2]==='#f1f1e6'));
 s.grid.labelMode='perimeter';ctx=context();drawPerimeterLabels(ctx,s);for(const c of ctx.calls.filter(c=>c[0]==='fillRect'))assert.ok(c[1]+c[3]<=0||c[2]+c[4]<=0);
});

test('scene background is painted before transparent map images',()=>{
 const s=newScene();s.background='#17211c';s.mapId='map';s.grid.type='none';
 const image={};const ctx=context();renderScene(ctx,s,initialWorkspace(),new Map([['map',image]]));
 const background=ctx.calls.findIndex(c=>c[0]==='set'&&c[1]==='fillStyle'&&c[2]==='#17211c');
 const map=ctx.calls.findIndex(c=>c[0]==='drawImage'&&c[1]===image);
 assert.ok(background>=0&&map>background);
});

test('elevation badges use scene units and follow token player visibility',()=>{
 const scene=newScene();scene.grid.type='none';scene.grid.unit='ft';scene.fog.enabled=false;
 const token={...newToken('Elevated'),elevation:15,showName:false,showHp:false};scene.tokens=[token];
 const hasBadge=ctx=>ctx.calls.some(call=>call[0]==='fillText'&&call[1]==='+15 ft');
 let ctx=context();renderScene(ctx,scene,initialWorkspace(),new Map(),{player:true});assert.ok(hasBadge(ctx));
 token.hidden=true;ctx=context();renderScene(ctx,scene,initialWorkspace(),new Map(),{player:true});assert.ok(!hasBadge(ctx));
 ctx=context();renderScene(ctx,scene,initialWorkspace(),new Map());assert.ok(hasBadge(ctx));
 token.hidden=false;token.elevation=-5;scene.grid.unit='m';ctx=context();renderScene(ctx,scene,initialWorkspace(),new Map(),{player:true});assert.ok(ctx.calls.some(call=>call[0]==='fillText'&&call[1]==='-5 m'));
 token.elevation=0;ctx=context();renderScene(ctx,scene,initialWorkspace(),new Map(),{player:true});assert.ok(!ctx.calls.some(call=>call[0]==='fillText'&&call[1]==='0 m'));
});

test('elevation is centered above the condition markers',()=>{
 const scene=newScene();scene.grid.type='none';scene.fog.enabled=false;
 const w=initialWorkspace();const t={...newToken('Rider'),x:100,y:100,elevation:10,conditions:[w.conditions[0].id]};scene.tokens=[t];
 const ctx=context();renderScene(ctx,scene,w,new Map());
 const label=ctx.calls.find(c=>c[0]==='fillText'&&c[1]==='+10 ft');
 const condition=ctx.calls.find(c=>c[0]==='arc'&&c[3]===10);
 assert.equal(label[2],t.x);
 assert.ok(label[3]+9<condition[2]-10,'badge bottom stays above condition top');
});

test('token status overlays follow portraits and borders, precede selection and HP, and respect visibility',()=>{
 const scene=newScene();scene.grid.type='none';scene.fog.enabled=false;
 const token={...newToken('Fallen'),x:100,y:120,assetId:'portrait',borderAssetId:'border',showName:false,showHp:true,status:'dead'};
 scene.tokens=[token];
 const portrait={width:100,height:100},border={};const images=new Map([['portrait',portrait],['border',border]]);
 for(const status of ['dead','unconscious']) {
  token.status=status;
  for(const options of [{selected:token.id},{player:true},{}]) {
   const ctx=context();renderScene(ctx,scene,initialWorkspace(),images,options);
   const disc=ctx.calls.findIndex(c=>c[0]==='set'&&c[1]==='fillStyle'&&c[2]==='rgba(10, 15, 19, 0.78)');
   assert.ok(disc>ctx.calls.findIndex(c=>c[0]==='drawImage'&&c[1]===border));
   assert.ok(disc<ctx.calls.findIndex(c=>c[0]==='fillRect'&&c[4]===7));
   assert.ok(ctx.calls.some(c=>c[0]==='translate'&&c[1]===100&&c[2]===120));
   assert.ok(ctx.calls.some(c=>c[0]===(status==='dead'?'bezierCurveTo':'lineTo')));
   if(options.selected) assert.ok(disc<ctx.calls.findIndex(c=>c[0]==='set'&&c[1]==='strokeStyle'&&c[2]==='#fff'));
  }
 }
 token.hidden=true;const hidden=context();renderScene(hidden,scene,initialWorkspace(),images,{player:true});
 assert.ok(!hidden.calls.some(c=>c[0]==='drawImage'));
 for(const status of ['active',undefined]) {
  token.hidden=false;token.status=status;const ctx=context();renderScene(ctx,scene,initialWorkspace(),images);
  assert.ok(!ctx.calls.some(c=>c[0]==='set'&&c[2]==='rgba(10, 15, 19, 0.78)'));
 }
});

test('token statuses survive workspace JSON round trips while legacy tokens stay active',()=>{
 const workspace=initialWorkspace();
 const scene=newScene();workspace.scenes=[scene];
 scene.tokens=['active','dead','unconscious'].map(status=>({...newToken(status),status}));
 const saved=workspaceSchema.parse(JSON.parse(JSON.stringify(workspace)));
 assert.deepEqual(saved.scenes[0].tokens.map(token=>token.status),['active','dead','unconscious']);
 const legacy={...newToken()};delete legacy.status;
 assert.equal(tokenSchema.parse(legacy).status??'active','active');
 assert.equal(tokenSchema.safeParse({...legacy,status:'sleepy'}).success,false);
});
test('object styling and map-only labels reach shared GM/player rendering',()=>{
 const w=initialWorkspace(),s=w.scenes[0];s.grid.type='none';s.grid.labels=false;s.fog.enabled=false;s.tokens=[];
 const object={id:'obj',type:'square',x:100,y:100,size:2,width:1,angle:90,rotation:0,points:[],persistent:true,tokenId:null,hidden:false,kind:'object',color:'#336699',fillOpacity:.8,strokeWidth:5,strokeStyle:'dashed',label:'Crate',labelSize:32,labelColor:'#abcdef',labelOffsetX:20,labelOffsetY:30};
 s.effects=[object];
 for(const player of [false,true]) {
  const ctx=context();renderScene(ctx,s,w,new Map(),{player});
  assert.ok(ctx.calls.some(c=>c[0]==='set'&&c[1]==='fillStyle'&&c[2]==='#336699cc'));
  assert.ok(ctx.calls.some(c=>c[0]==='set'&&c[1]==='font'&&c[2]==='bold 32px system-ui'));
  assert.ok(ctx.calls.some(c=>c[0]==='fillText'&&c[1]==='Crate'&&c[2]===120&&c[3]===130));
 }
 s.effects=[{...object,kind:'label',label:'Room'}];
 const ctx=context();renderScene(ctx,s,w,new Map(),{player:true});
 assert.ok(ctx.calls.some(c=>c[0]==='fillText'&&c[1]==='Room'));
 assert.equal(ctx.calls.some(c=>c[0]==='fill'),false,'map label has no filled shape');
 s.effects[0].hidden=true;const hidden=context();renderScene(hidden,s,w,new Map(),{player:true});
 assert.equal(hidden.calls.some(c=>c[0]==='fillText'&&c[1]==='Room'),false);
 s.effects=[{...object,showLabel:false}];const unlabeled=context();renderScene(unlabeled,s,w,new Map(),{player:false});
 assert.equal(unlabeled.calls.some(c=>c[0]==='fillText'&&c[1]==='Crate'),false);
});
