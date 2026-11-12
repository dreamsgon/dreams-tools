import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ACCENTS,DEFAULT_ACCENT,parseAccent,parseThemeMode,pickThemeMode,resolveTheme,appearanceBootScript} from '../lib/appearance.ts';

test('theme and accent values are validated',()=>{
  assert.equal(parseThemeMode('dark'),'dark');
  assert.equal(parseThemeMode('sepia'),null);
  assert.equal(parseAccent('lapis'),'lapis');
  assert.equal(parseAccent('#ff0000'),null);
  assert.ok(ACCENTS.some(a=>a.id===DEFAULT_ACCENT));
});

test('system mode follows the device, explicit modes win',()=>{
  assert.equal(resolveTheme('system',true),'dark');
  assert.equal(resolveTheme('system',false),'light');
  assert.equal(resolveTheme('light',true),'light');
});

test('old per-tool theme keys are honoured until a new choice is saved',()=>{
  assert.equal(pickThemeMode(null,['dark',null]),'dark');
  assert.equal(pickThemeMode(null,[null,'light']),'light');
  assert.equal(pickThemeMode('system',['dark']),'system');
  assert.equal(pickThemeMode('bogus',[]),'system');
});

test('every accent has light and dark rules in the shared stylesheet',()=>{
  const css=readFileSync(new URL('../app/appearance.css',import.meta.url),'utf8');
  for(const accent of ACCENTS){
    assert.match(css,new RegExp(`:root\\[data-accent="${accent.id}"\\]\\s*\\{[^}]*--accent:\\s*${accent.light}`),accent.id+' light');
    assert.match(css,new RegExp(`:root\\[data-theme="dark"\\]\\[data-accent="${accent.id}"\\]\\s*\\{[^}]*--accent:\\s*${accent.dark}`),accent.id+' dark');
  }
});

function luminance(hex){
  const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4);
  return 0.2126*r+0.7152*g+0.0722*b;
}
function contrast(a,b){const [x,y]=[luminance(a),luminance(b)].sort((p,q)=>p-q);return (y+0.05)/(x+0.05);}

test('accents keep readable contrast for text and filled buttons',()=>{
  for(const accent of ACCENTS){
    assert.ok(contrast(accent.light,'#ffffff')>=4.5,accent.id+' white text on light accent');
    assert.ok(contrast(accent.light,'#eef1f3')>=4.5,accent.id+' accent text on light page');
    assert.ok(contrast(accent.dark,'#181d22')>=4.5,accent.id+' accent text on dark panel');
    assert.ok(contrast(accent.dark,'#0c1214')>=4.5,accent.id+' dark text on dark accent');
  }
});

test('boot script is plain JavaScript that sets theme and accent',()=>{
  assert.doesNotThrow(()=>new Function(appearanceBootScript));
  assert.match(appearanceBootScript,/dataset\.theme/);
  assert.match(appearanceBootScript,/dataset\.accent/);
});
