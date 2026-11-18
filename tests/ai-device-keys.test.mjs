import test from 'node:test';
import assert from 'node:assert/strict';
// A browser's storage and events, enough for lib/ai/device-keys.ts.
const store=new Map(),events=new EventTarget();
globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
globalThis.window={addEventListener:(t,f)=>events.addEventListener(t,f),removeEventListener:(t,f)=>events.removeEventListener(t,f),dispatchEvent:e=>events.dispatchEvent(e)};
const K=await import('../lib/ai/device-keys.ts');

test('keys stay in this browser, by connection, and signing out forgets them all',()=>{
 let changes=0;const off=K.onDeviceAi(()=>changes++);
 assert.deepEqual(K.keyFields('c1'),{connectionId:'c1',apiKey:''},'no key here: the server says where to paste it');
 K.saveDeviceKey('c1',' sk-one-1234 ');K.saveDeviceKey('c2','sk-two-5678');
 assert.deepEqual(K.keyFields('c1'),{connectionId:'c1',apiKey:'sk-one-1234'});assert.equal(K.deviceKeyCount(),2);
 K.forgetDeviceKey('c2');assert.equal(K.deviceKey('c2'),null);
 K.saveOwnAi({provider:'openai',model:'gpt-test',apiKey:'sk-own-0000'});assert.equal(K.ownAi().apiKey,'sk-own-0000');
 K.forgetOwnAi();assert.equal(K.ownAi(),null);assert.equal(K.deviceKey('c1'),'sk-one-1234','forgetting your own AI keeps connection keys');
 K.keepMoved([{id:'c3',key:'sk-moved-9999'},{id:7,key:'bad'}]);assert.equal(K.deviceKey('c3'),'sk-moved-9999');assert.equal(K.deviceKeyCount(),2);
 K.forgetDeviceAi();assert.equal(K.deviceKeyCount(),0);assert.equal(store.size,0,'nothing left in storage');
 assert.ok(changes>=6);off();
 store.set('rpg-tools:ai-keys','not json');assert.equal(K.deviceKey('c1'),null,'broken storage reads as empty');
});
