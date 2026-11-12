import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {TEXT_SIZES,DEFAULT_TEXT_SIZE,parseTextSize,uiZoom,appearanceBootScript,APPEARANCE_STORAGE_KEYS,TEXT_SIZE_STORAGE_KEY} from '../lib/appearance.ts';

test('text sizes are validated and default to normal',()=>{
  assert.equal(parseTextSize('smaller'),'smaller');
  assert.equal(parseTextSize('huge'),DEFAULT_TEXT_SIZE);
  assert.equal(parseTextSize(null),DEFAULT_TEXT_SIZE);
  assert.equal(TEXT_SIZES.find(s=>s.id===DEFAULT_TEXT_SIZE).zoom,1);
  assert.equal(uiZoom(),1,'no document on the server');
  assert.ok(APPEARANCE_STORAGE_KEYS.includes(TEXT_SIZE_STORAGE_KEY));
  assert.match(appearanceBootScript,/textSize/);
});

test('every text size has a matching zoom rule',()=>{
  const css=readFileSync('app/appearance.css','utf8');
  for(const size of TEXT_SIZES.filter(s=>s.id!==DEFAULT_TEXT_SIZE)){
    const rule=css.match(new RegExp(`html\\[data-text-size="${size.id}"\\]\\s*\\{([^}]*)\\}`));
    assert.ok(rule,size.id);
    assert.equal(Number(rule[1].match(/(?:^|;)\s*zoom:\s*([\d.]+)/)[1]),size.zoom);
    assert.equal(Number(rule[1].match(/--ui-zoom:\s*([\d.]+)/)[1]),size.zoom);
  }
});

test('viewport lengths are divided by the text size zoom so full-height layouts still fit',()=>{
  const files=[];const walk=d=>{for(const e of readdirSync(d,{withFileTypes:true})){const p=join(d,e.name);if(e.isDirectory())walk(p);else if(/\.(css|tsx)$/.test(e.name))files.push(p);}};
  walk('app');walk('components');
  const bad=[];
  for(const f of files){
    const src=readFileSync(f,'utf8');
    for(const m of src.matchAll(/(?<![\w-])\d*\.?\d+(?:d|s|l)?v(?:h|w|min|max)\b/g)){
      const after=src.slice(m.index+m[0].length,m.index+m[0].length+30);
      if(!/^\s*\/\s*var\(--ui-zoom/.test(after))bad.push(`${f}: ${m[0]}`);
    }
  }
  assert.deepEqual(bad,[]);
});
