import test from 'node:test';
import assert from 'node:assert/strict';
import {newScene, sceneSchema, fogStrokeSchema, perimeterLabels, sceneRenderBounds, mapCrop, address} from '../lib/model.ts';
test('perimeter strips stay outside map and preserve offset cell addresses',()=>{
  const s=newScene();Object.assign(s,{width:140,height:100});Object.assign(s.grid,{size:50,offsetX:-20,offsetY:10,labelMode:'perimeter'});
  assert.deepEqual(sceneRenderBounds(s),{x:-32,y:-32,width:172,height:132});
  for(const c of perimeterLabels(s).columns)assert.equal(address({x:c.position,y:35},s.grid),`${c.label}1`);
  assert.deepEqual(perimeterLabels(s).rows.map(r=>r.label),['1','2']);
  s.grid.type='hex-flat';assert.deepEqual(sceneRenderBounds(s),{x:0,y:0,width:140,height:100});
});
test('older scenes get label defaults and an empty measurement list',()=>{
  const s=newScene();delete s.grid.labelMode;delete s.grid.labelTheme;delete s.measurements;
  const parsed=sceneSchema.parse(s);assert.equal(parsed.grid.labelMode,'cells');assert.equal(parsed.grid.labelTheme,'light');assert.deepEqual(parsed.measurements,[]);
});
test('polygon fog requires three vertices; measurements validate and default private',()=>{
  const fog={mode:'reveal',shape:'polygon',size:20,points:[{x:0,y:0},{x:50,y:0}]};
  assert.equal(fogStrokeSchema.safeParse(fog).success,false);fog.points.push({x:50,y:50});assert.equal(fogStrokeSchema.safeParse(fog).success,true);
  const s=newScene();s.measurements=[{id:'m',label:'Route',points:fog.points,color:'#123456'}];
  assert.equal(sceneSchema.parse(s).measurements[0].hidden,true);
  s.measurements[0].points=[{x:0,y:0}];assert.equal(sceneSchema.safeParse(s).success,false);
});

test('legacy scenes default a pale background and accept a custom base color',()=>{
 const s=newScene();delete s.background;assert.equal(sceneSchema.parse(s).background,'#e3e6d8');
 s.background='#17211c';assert.equal(sceneSchema.parse(s).background,'#17211c');
 s.background='transparent';assert.equal(sceneSchema.safeParse(s).success,false);
});

test('saved crop clamps to resized map and retains original edge addresses',()=>{
 const s=newScene();s.crop={x:280,y:140,width:420,height:350};s.grid.labelMode='perimeter';
 assert.deepEqual(sceneRenderBounds(s,mapCrop(s)),{x:248,y:108,width:452,height:382});
 assert.deepEqual(perimeterLabels(s,mapCrop(s)).columns.map(c=>c.label),['E','F','G','H','I','J']);
 assert.deepEqual(perimeterLabels(s,mapCrop(s)).rows.map(r=>r.label),['3','4','5','6','7']);
 s.width=300;s.height=200;assert.deepEqual(mapCrop(s),{x:280,y:140,width:20,height:60});
 delete s.crop;assert.equal(sceneSchema.parse(s).crop,null);
});
