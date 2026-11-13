import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {savePhase} from '../lib/save-phase.ts';

test('the save chip shows one state for each save status', () => {
  assert.equal(savePhase('Saved to cloud','',false),'saved');
  assert.equal(savePhase('Ready','',false),'saved');
  assert.equal(savePhase('Unsaved changes','',false),'unsaved');
  assert.equal(savePhase('Saving…','',false),'saving');
  assert.equal(savePhase('Not saved','Cloud save failed.',false),'failed');
  assert.equal(savePhase('Not saved','Another device saved changes.',true),'conflict');
  assert.equal(savePhase('Loading','',false),'loading');
  assert.equal(savePhase('Unavailable','',false),'offline');
});

test('no component uses the browser confirm box', () => {
  const found=[];
  const walk=dir=>{for(const name of readdirSync(dir)){const p=join(dir,name);if(statSync(p).isDirectory())walk(p);else if(/\.tsx?$/.test(name)&&/(^|[^\w.])(window\.)?confirm\(/.test(readFileSync(p,'utf8')))found.push(p);}};
  walk('components');walk('app');
  assert.deepEqual(found,[]);
});
