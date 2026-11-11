import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenSchema, newToken, initialWorkspace, workspaceSchema } from '../lib/model.ts';
import { drawTokenName } from '../lib/token-name.ts';

function canvas() {
  const calls = [];
  const ctx = new Proxy({measureText: text => ({width: Array.from(text).length * 8})}, {
    get(target, key) { return key in target ? target[key] : (...args) => calls.push([key, ...args]); },
  });
  return {ctx, calls};
}
test('name placement survives workspace and gallery serialization; old tokens remain valid', () => {
  assert.equal(tokenSchema.parse(newToken()).namePosition, undefined);
  for (const namePosition of ['bottom','top','side','wrap']) {
    const w = initialWorkspace();
    const t = {...newToken('Mountain Troll'), namePosition, nameVisibility:'hide'};
    w.scenes[0].tokens.push(t);
    w.tokenLibrary.push({...t,id:'gallery'});
    const saved = workspaceSchema.parse(JSON.parse(JSON.stringify(w)));
    assert.equal(saved.scenes[0].tokens[0].namePosition, namePosition);
    assert.equal(saved.tokenLibrary[0].namePosition, namePosition);
    assert.equal(saved.tokenLibrary[0].nameVisibility, 'hide');
  }
  assert.equal(tokenSchema.safeParse({...newToken(),namePosition:'invalid'}).success,false);
});
test('hidden names draw nothing and keep the editable name', () => {
  const {ctx,calls} = canvas();
  const t = {...newToken('Mountain Troll'),showName:false,namePosition:'wrap'};
  drawTokenName(ctx,t,40);
  assert.deepEqual(calls,[]);
  assert.equal(t.name,'Mountain Troll');
});
test('bottom avoids HP, top is above the token, and side rotates vertically', () => {
  const t = newToken('Troll');
  for (const position of [undefined,'bottom','top','side']) {
    const {ctx,calls} = canvas();
    drawTokenName(ctx,{...t,namePosition:position},40);
    const [,x,y] = calls.find(c=>c[0]==='translate');
    if (position === 'top') assert.ok(y < t.y-40);
    else if(position === 'side') {
      assert.ok(x>t.x+40);
      assert.ok(calls.some(c=>c[0]==='rotate' && c[1]===-Math.PI/2));
    } else assert.ok(y>t.y+40+13);
    assert.equal(calls.filter(c=>c[0]==='fillText').length,1);
    assert.equal(calls.filter(c=>c[0]==='save').length,calls.filter(c=>c[0]==='restore').length);
  }
});
test('wrapped long names fit a bounded arc without truncating their text', () => {
  const {ctx,calls} = canvas();
  const text = 'Ancient Mountain Troll '.repeat(5);
  drawTokenName(ctx,{...newToken(text),namePosition:'wrap'},10);
  assert.equal(calls.filter(c=>c[0]==='fillText').map(c=>c[1]).join(''),text);
  assert.ok(calls.filter(c=>c[0]==='scale').every(c=>c[1]>0 && c[1]<=1));
  assert.ok(calls.filter(c=>c[0]==='rotate').every(c=>Math.abs(c[1])<=Math.PI*.75));
});
test('wrapped name hugs the upper rim and does not inherit spacing from a lower HP bar',()=>{
  const t={...newToken('Mountain Troll'),x:0,y:0,namePosition:'wrap',nameScale:2,borderWidth:10};
  function radiusFor(token) {
    const {ctx,calls}=canvas();drawTokenName(ctx,token,100);
    const [,x,y]=calls.find(c=>c[0]==='translate');
    return Math.hypot(x,y);
  }
  const noHp=radiusFor({...t,showHp:false});
  assert.ok(Math.abs(noHp-127)<1e-8,'text inner edge stays seven pixels outside the token radius');
  assert.ok(Math.abs(radiusFor({...t,hpPosition:'bottom',hpBarHeight:40})-noHp)<1e-8);
  assert.ok(Math.abs(radiusFor({...t,hpPosition:'wrap',hpBarWidth:1,hpBarHeight:40})-noHp)<1e-8);
  assert.ok(radiusFor({...t,hpPosition:'wrap',hpBarWidth:2,hpBarHeight:10})>noHp,'full HP rings still reserve clearance');
});
