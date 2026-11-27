import assert from 'node:assert/strict';
import {test} from 'node:test';
import {jsonEqual} from '../lib/json-equal.ts';
import {initialWorkspace,newScene,newToken} from '../lib/model.ts';

const pairs=[
  [{a:1,b:2},{a:1,b:2}],[{a:1,b:2},{b:2,a:1}],[{a:1,b:undefined},{a:1}],[{a:undefined},{}],[[1,undefined],[1,null]],[[()=>1],[null]],
  [{a:NaN},{a:null}],[{a:Infinity},{a:null}],[{d:new Date(0)},{d:'1970-01-01T00:00:00.000Z'}],[{a:[1,2]},{a:[1,2,3]}],[{a:{}},{a:[]}],
  [{a:'1'},{a:1}],[{a:null},{}],[{a:0},{a:-0}],[{x:{y:{z:[1,{w:2}]}}},{x:{y:{z:[1,{w:3}]}}}],[{f(){} ,a:1},{a:1}],[{a:1,f(){}},{a:1}],
  [[],[]],[{},{}],[null,null],['a','a'],[{a:new Map([[1,2]])},{a:{}}],[{a:Symbol('s')},{}],[{a:true},{a:false}],[{a:1,b:2,c:undefined},{a:1,c:undefined,b:2}],
];
test('jsonEqual says what comparing the JSON text says',()=>{
  for(const [a,b] of pairs){assert.equal(jsonEqual(a,b),JSON.stringify(a)===JSON.stringify(b),JSON.stringify([a,b]));assert.equal(jsonEqual(b,a),JSON.stringify(a)===JSON.stringify(b));}
});
test('jsonEqual on a Maptable workspace and an edited copy',()=>{
  const w=initialWorkspace(),s=newScene('One');for(let i=0;i<50;i++){const t=newToken('T'+i);t.x=i;s.tokens.push(t);}w.scenes=[s];
  const copy=structuredClone(w);assert(jsonEqual(w,copy));
  copy.scenes[0].tokens[49].x=99;assert.equal(jsonEqual(w,copy),false);
  const again=structuredClone(w);again.scenes[0].tokens[3].name='Renamed';assert.equal(jsonEqual(w,again),false);
  const added=structuredClone(w);added.scenes[0].tokens[3].extra=undefined;assert(jsonEqual(w,added));
});
