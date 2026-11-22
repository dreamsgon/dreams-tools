import test from 'node:test';
import assert from 'node:assert/strict';
import {ancestorIds,parseOpenFolders,withOpened,withClosed,maxOpenFolders} from '../lib/encyclopedia/folder-state.ts';

const pages=[{id:'ch',parentId:null},{id:'npcs',parentId:'ch'},{id:'npc',parentId:'npcs'},{id:'loose',parentId:null}];

test('the path above a page, nearest folder first',()=>{
  assert.deepEqual(ancestorIds(pages,'npc'),['npcs','ch']);
  assert.deepEqual(ancestorIds(pages,'loose'),[]);
  assert.deepEqual(ancestorIds(pages,null),[]);
  assert.deepEqual(ancestorIds(pages,'gone'),[]);
});

test('a loop or a missing parent ends the path',()=>{
  assert.deepEqual(ancestorIds([{id:'a',parentId:'b'},{id:'b',parentId:'a'}],'a'),['b','a']);
  assert.deepEqual(ancestorIds([{id:'a',parentId:'deleted'}],'a'),[]);
});

test('saved open folders: only short strings, no repeats, at most the cap',()=>{
  assert.deepEqual(parseOpenFolders(null),[]);
  assert.deepEqual(parseOpenFolders('not json'),[]);
  assert.deepEqual(parseOpenFolders('{"a":true}'),[]);
  assert.deepEqual(parseOpenFolders(JSON.stringify(['a',1,'',null,'a','b','x'.repeat(200)])),['a','b']);
  const many=Array.from({length:maxOpenFolders+10},(_,i)=>`f${i}`);
  const kept=parseOpenFolders(JSON.stringify(many));
  assert.equal(kept.length,maxOpenFolders);
  assert.equal(kept.at(-1),`f${maxOpenFolders+9}`);
});

test('opening moves a folder to the newest end; closing drops it',()=>{
  assert.deepEqual(withOpened(['a','b'],['a','c']),['b','a','c']);
  assert.deepEqual(withClosed(['a','b','c'],['b']),['a','c']);
  const full=Array.from({length:maxOpenFolders},(_,i)=>`f${i}`);
  const next=withOpened(full,['new']);
  assert.equal(next.length,maxOpenFolders);
  assert.equal(next[0],'f1');
  assert.equal(next.at(-1),'new');
});
