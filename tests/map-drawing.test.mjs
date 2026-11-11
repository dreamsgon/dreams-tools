import test from "node:test";
import assert from "node:assert/strict";
import { initialWorkspace, workspaceSchema } from "../lib/model.ts";
import { shapePath, layerState, dropLayers, mergeRooms, roomPaths, openingPath, simplifyPoints, orderedShapes, moveLayer } from "../lib/map-drawing.ts";
const shape={id:"room",type:"ellipse",points:[{x:200,y:200},{x:80,y:100}],fill:"#cccccc",stroke:"#333333",thickness:12,closed:false};
test("drawn maps survive save and backup round trips as editable geometry",()=>{
  const w=initialWorkspace();w.scenes[0].drawing={background:"#ffffff",shapes:[shape,{...shape,id:"curve",type:"curve",points:[{x:0,y:0},{x:200,y:0},{x:100,y:70}]}]};
  const parsed=workspaceSchema.parse(w);
  assert.deepEqual(workspaceSchema.parse(JSON.parse(JSON.stringify(parsed))),parsed);
  assert.match(shapePath(shape),/A 60 50/);
  assert.equal(shapePath(w.scenes[0].drawing.shapes[1]),"M 0 0 Q 100 70 200 0");
});
test("old scenes load without drawing data and malformed curves are rejected",()=>{
  const w=initialWorkspace();delete w.scenes[0].drawing;
  assert.equal(workspaceSchema.parse(w).scenes[0].drawing,null);
  w.scenes[0].drawing={background:"#ffffff",shapes:[{...shape,type:"curve"}]};
  assert.equal(workspaceSchema.safeParse(w).success,false);
});

test("smooth paths use cubic curves, keep endpoints, and simplify redundant samples",()=>{
 const points=[{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:10,y:10},{x:20,y:0}];
 const simple=simplifyPoints(points,1);
 assert.deepEqual(simple[0],points[0]);assert.deepEqual(simple.at(-1),points.at(-1));
 assert.ok(simple.length<points.length);
 const path=shapePath({...shape,type:"path",points:simple,smooth:true});
 assert.match(path,/^M 0 0 C /);assert.ok(path.endsWith("20 0"));
 assert.ok(shapePath({...shape,type:"path",points:simple,smooth:true,closed:true}).endsWith(" Z"));
});
test("layer folders preserve drawing order and move as groups",()=>{
 const w=initialWorkspace();w.scenes[0].drawing={background:"#ffffff",folders:[{id:"group",name:"Rooms",parentId:null}],layerOrder:["a","group","b"],shapes:[{...shape,id:"a",folderId:null},{...shape,id:"b",folderId:null},{...shape,id:"inside",folderId:"group"}]};
 const d=workspaceSchema.parse(w).scenes[0].drawing;
 assert.deepEqual(orderedShapes(d).map(s=>s.id),["a","inside","b"]);
 moveLayer(d,"group",1);
 assert.deepEqual(orderedShapes(d).map(s=>s.id),["a","b","inside"]);
 d.folders[0].parentId="group";
 assert.equal(workspaceSchema.safeParse({...w,scenes:[{...w.scenes[0],drawing:d}]}).success,false);
});

test("merging rooms preserves editable outlines and rejects open walls",()=>{
 const a={...shape,type:"rect",name:"A",folderId:null,smooth:false,roomParts:[]};
 const b={...a,id:"b",points:[{x:100,y:100},{x:240,y:220}]};
 const merged=mergeRooms([a,b],"merged");
 assert.equal(merged.type,"merged");assert.equal(merged.points.length,4);assert.equal(roomPaths(merged).length,2);
 assert.equal(mergeRooms([a,{...b,type:"line",fill:null}],"bad"),null);
 const w=initialWorkspace();w.scenes[0].drawing={background:"#ffffff",shapes:[merged],folders:[],layerOrder:["merged"]};
 assert.equal(workspaceSchema.safeParse(w).success,true);
 const again=mergeRooms([merged,b],"again");assert.equal(roomPaths(again).length,3);
});
test("door and window symbols rotate with their endpoints",()=>{
 const door={...shape,type:"door",points:[{x:10,y:10},{x:10,y:60}]};
 assert.match(openingPath(door),/A 50 50/);
 assert.ok(!openingPath({...door,type:"window"}).includes("NaN"));
 assert.ok(!openingPath({...door,points:[{x:0,y:0},{x:0,y:0}]}).includes("NaN"));
});

test("layer drops reorder, nest, reject cycles, and honor inherited locks",()=>{
 const w=initialWorkspace();w.scenes[0].drawing={background:"#ffffff",shapes:[{...shape,id:"a"},{...shape,id:"b"}],folders:[{id:"folder",name:"Rooms",parentId:null}],layerOrder:["a","b","folder"]};
 const d=workspaceSchema.parse(w).scenes[0].drawing;
 assert.equal(dropLayers(d,["a"],{id:"b",mode:"before"}),true);
 assert.deepEqual(orderedShapes(d).map(s=>s.id),["b","a"]);
 assert.equal(dropLayers(d,["a"],{id:"folder",mode:"inside"}),true);
 assert.equal(d.shapes[0].folderId,"folder");
 assert.equal(dropLayers(d,["folder"],{id:"folder",mode:"inside"}),false);
 d.folders[0].hidden=true;assert.deepEqual(orderedShapes(d).map(s=>s.id),["b"]);
 d.folders[0].locked=true;assert.deepEqual(layerState(d,"a"),{hidden:true,locked:true});
 const before=JSON.stringify(d);assert.equal(dropLayers(d,["a"],{id:null,mode:"inside"}),false);assert.equal(JSON.stringify(d),before);
 d.folders[0].locked=false;d.folders[0].hidden=false;
 assert.equal(dropLayers(d,["a"],{id:null,mode:"inside"}),true);assert.equal(d.shapes[0].folderId,null);
});
