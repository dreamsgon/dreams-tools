import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

// lib/scene-map.ts imports from ./model without an extension, so read it with that import stubbed.
const source=await readFile(new URL('../lib/scene-map.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source.replace(/^import .*;\r?\n/gm,''),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('export ','');
const fitImageDimensions=(width,height)=>({width,height});
const {placeholderSceneName,attachSceneMap}=new Function('fitImageDimensions',`${compiled};return {placeholderSceneName,attachSceneMap};`)(fitImageDimensions);
const scene=name=>({name,mapId:null,drawing:{},width:1,height:1,grid:{size:70,offsetX:0,offsetY:0,type:'hex'}});
const asset={id:'a1',width:1400,height:1000};

test('the names the app gives a new scene count as placeholders, a GM-chosen name does not',()=>{
  for(const name of ['Untitled scene','New Encounter Map','New Area Map',' New World Map '])assert.equal(placeholderSceneName(name),true,name);
  for(const name of ['Harbor fight','New Encounter Map 2','new encounter map','Untitled'])assert.equal(placeholderSceneName(name),false,name);
});

test('an uploaded map names a scene that still has its placeholder name, and keeps a chosen name',()=>{
  const fresh=scene('New Encounter Map');attachSceneMap(fresh,asset,undefined,'  Sunken Temple  ');
  assert.equal(fresh.name,'Sunken Temple');assert.equal(fresh.mapId,'a1');assert.equal(fresh.drawing,null);assert.equal(fresh.width,1400);
  const named=scene('Harbor fight');attachSceneMap(named,asset,undefined,'Sunken Temple');
  assert.equal(named.name,'Harbor fight');
  const blank=scene('Untitled scene');attachSceneMap(blank,asset,undefined,'   ');
  assert.equal(blank.name,'Untitled scene');
  const long=scene('Untitled scene');attachSceneMap(long,asset,undefined,'x'.repeat(200));
  assert.equal(long.name.length,120);
});

test('import settings set the size and a square grid',()=>{
  const s=scene('Untitled scene');attachSceneMap(s,asset,{width:2100,height:1500,grid:{size:105,offsetX:3,offsetY:4}},'Cave');
  assert.equal(s.width,2100);assert.equal(s.height,1500);assert.deepEqual(s.grid,{size:105,offsetX:3,offsetY:4,type:'square'});
});
