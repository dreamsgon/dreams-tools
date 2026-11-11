import test from "node:test";
import assert from "node:assert/strict";
import { fogMergeReason, fogRegionParts, mergeFogRegions, splitFogRegion, unionFogRegions, fogUnionReason, fogRegionContains, flattenFogRegions } from "../lib/fog.ts";
import { fogStrokeSchema } from "../lib/model.ts";
const rect=(x,mode="reveal")=>({shape:"rect",mode,size:40,points:[{x,y:0},{x:x+100,y:100}]});
test("merged fog retains overlapping and disconnected contours through serialization",()=>{
 const strokes=[rect(0),rect(50),rect(500)];
 const result=mergeFogRegions(strokes,[2,0,1]);
 assert.equal(result.strokes.length,1);
 const merged=fogStrokeSchema.parse(JSON.parse(JSON.stringify(result.strokes[0])));
 assert.deepEqual(fogRegionParts(merged),strokes.map(s=>({shape:s.shape,points:s.points})));
 assert.deepEqual(strokes[0],rect(0));
 const again=mergeFogRegions([merged,rect(700)],[0,1]);
 assert.equal(fogRegionParts(again.strokes[0]).length,4);
});
test("opposite strokes block a merge even when unselected",()=>{
 assert.match(fogMergeReason([rect(0),rect(20,"cover"),rect(40)],[0,2]),/opposite-mode/);
 assert.match(fogMergeReason([rect(0),rect(20,"cover")],[0,1]),/same reveal/);
 assert.equal(fogMergeReason([rect(0),rect(20),rect(40)],[0,2]),null);
});
test("merged fog validates all part ranges and polygon vertices",()=>{
 const valid=mergeFogRegions([rect(0),rect(50)],[0,1]).strokes[0];
 assert.equal(fogStrokeSchema.safeParse({...valid,parts:[]}).success,false);
 assert.equal(fogStrokeSchema.safeParse({...valid,parts:[{shape:"polygon",start:0,count:2}]}).success,false);
 assert.equal(fogStrokeSchema.safeParse({...valid,parts:[{shape:"rect",start:3,count:2}]}).success,false);
});
test("split restores contours in place and enforces the scene stroke limit",()=>{
 const original=[rect(0),rect(50)];
 const merged=mergeFogRegions(original,[0,1]).strokes[0];
 assert.deepEqual(splitFogRegion([rect(-100,"cover"),merged,rect(900,"cover")],1),[rect(-100,"cover"),...original,rect(900,"cover")]);
 assert.equal(splitFogRegion([merged,...Array.from({length:1999},()=>rect(900))],0),null);
});

const union=(strokes)=>{const result=unionFogRegions(strokes,strokes.map((_,i)=>i));assert.ok("strokes" in result,JSON.stringify(result));return result.strokes[0];};
test("geometric union removes overlap boundaries and preserves separated islands",()=>{
 const merged=union([rect(0),rect(50),rect(500)]);
 assert.equal(merged.parts.length,2);
 assert.equal(fogRegionContains(merged,{x:125,y:50}),true);
 assert.equal(fogRegionContains(merged,{x:300,y:50}),false);
 assert.deepEqual(fogStrokeSchema.parse(JSON.parse(JSON.stringify(merged))),merged);
 assert.equal(splitFogRegion([merged],0),null);
});
test("brush union preserves round ends and joins",()=>{
 const brush={shape:"brush",mode:"reveal",size:40,points:[{x:50,y:50},{x:150,y:50},{x:150,y:150}]};
 const merged=union([brush,{...brush,points:[{x:150,y:150}]}]);
 assert.equal(fogRegionContains(merged,{x:35,y:50}),true);
 assert.equal(fogRegionContains(merged,{x:165,y:150}),true);
 assert.equal(fogRegionContains(merged,{x:80,y:80}),false);
});
test("union preserves holes through repeated unions",()=>{
 const box=(x,y,w,h)=>({shape:"rect",mode:"reveal",size:40,points:[{x,y},{x:x+w,y:y+h}]});
 const frame=union([box(0,0,100,20),box(0,80,100,20),box(0,20,20,60),box(80,20,20,60)]);
 assert.equal(frame.parts.length,2);
 assert.equal(fogRegionContains(frame,{x:50,y:50}),false);
 assert.equal(fogRegionContains(frame,{x:10,y:50}),true);
 const again=union([frame,box(200,0,20,20)]);
 assert.equal(fogRegionContains(again,{x:50,y:50}),false);
});
test("union keeps ordering guards and accepts brushes",()=>{
 assert.match(fogUnionReason([rect(0),rect(0,"cover")],[0,1]),/same reveal/);
 assert.match(fogUnionReason([rect(0),rect(0,"cover"),rect(10)],[0,2]),/opposite-mode/);
 assert.equal(fogUnionReason([{...rect(0),shape:"brush"},rect(10)],[0,1]),null);
});
test("flatten applies full ordered history and clips to map",()=>{
 const result=flattenFogRegions({enabled:true,base:true,strokes:[rect(0),rect(50,"cover")]},200,200);
 assert.ok("fog" in result);
 const stroke=result.fog.strokes[0];
 assert.equal(result.fog.base,false);
 assert.equal(fogRegionContains(stroke,{x:25,y:50}),false);
 assert.equal(fogRegionContains(stroke,{x:75,y:50}),true);
 assert.equal(fogRegionContains(stroke,{x:175,y:175}),true);
 assert.equal(fogRegionContains(stroke,{x:225,y:50}),false);
 assert.equal(fogStrokeSchema.safeParse(stroke).success,true);
 const empty=flattenFogRegions({enabled:false,base:false,strokes:[]},100,100);
 assert.deepEqual(empty.fog,{enabled:false,base:false,strokes:[]});
});

test("single exterior union stays a point-editable polygon",()=>{
 const merged=union([rect(0),rect(50)]);
 assert.equal(merged.shape,"polygon");
 assert.equal(merged.fillRule,undefined);
 assert.equal(merged.parts,undefined);
 assert.equal(merged.points.length,4);
 assert.equal(fogRegionContains(merged,{x:125,y:50}),true);
 assert.equal(fogStrokeSchema.safeParse(merged).success,true);
});

test("flatten handles dense long brushes and preserves ordered sampled coverage",()=>{
 const points=Array.from({length:6000},(_,i)=>({x:50+i*.1,y:100+20*Math.sin(i*.002)}));
 // A retraced section and near duplicates exercise round joins and tiny segments.
 points.push(...points.slice(2000,4000).reverse(),...Array.from({length:20},()=>({...points[2000]})));
 const brush={shape:"brush",mode:"reveal",size:60,points};
 const cover={shape:"rect",mode:"cover",size:40,points:[{x:250,y:70},{x:300,y:130}]};
 const fog={enabled:true,base:true,strokes:[brush,cover]},before=JSON.stringify(fog);
 const result=flattenFogRegions(fog,800,250);
 assert.ok("fog" in result,JSON.stringify(result));
 assert.equal(JSON.stringify(fog),before);
 assert.equal(fogStrokeSchema.safeParse(result.fog.strokes[0]).success,true);
 const distance=p=>{
   let best=Infinity;
   for(let i=1;i<points.length;i++){
     const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;
     const t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)):0;
     best=Math.min(best,Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy));
   }
   return best;
 };
 let sampled=0;
 for(let y=5;y<250;y+=7)for(let x=5;x<800;x+=7){
   const p={x,y},d=distance(p);
   if(x===250||x===300||y===70||y===130)continue;
   if(Math.abs(d-30)<1)continue; // Documented subpixel brush approximation.
   const covered=(x>250&&x<300&&y>70&&y<130)||d>30;
   assert.equal(fogRegionContains(result.fog.strokes[0],p),covered,JSON.stringify({p,d}));
   sampled++;
 }
 assert.ok(sampled>3000);
});
