import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from "polygon-clipping";
import type { FogStroke, Point, Scene } from "./model";

export function polygonContains(points: Point[], point: Point) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function polygonMidpoints(points: Point[]): Point[] {
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    return { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 };
  });
}

/** Independent filled contours: overlaps remain filled and disconnected islands stay separate. */
export function fogRegionParts(stroke: FogStroke): { shape: "rect" | "polygon"; points: Point[] }[] {
  if (stroke.shape === "merged") return (stroke.parts ?? []).map(part => ({
    shape: part.shape, points: stroke.points.slice(part.start, part.start + part.count),
  }));
  if (stroke.shape === "rect" || stroke.shape === "polygon") return [{shape:stroke.shape,points:stroke.points}];
  return [];
}

export function fogMergeReason(strokes: FogStroke[], indices: number[]): string | null {
  const selected = [...new Set(indices)].sort((a,b)=>a-b);
  if (selected.length < 2) return "Select at least two regions to merge.";
  if (selected.some(i=>!strokes[i] || strokes[i].shape === "brush")) return "Select rectangle, polygon, or grouped regions.";
  if (selected.some(i=>strokes[i].fillRule)) return "Use Merge for regions that already contain a geometric union.";
  const mode = strokes[selected[0]].mode;
  if (selected.some(i=>strokes[i].mode !== mode)) return "Select regions with the same reveal or cover mode.";
  if (strokes.slice(selected[0],selected.at(-1)!+1).some(s=>s.mode !== mode))
    return "An opposite-mode stroke lies between these regions. Merge regions from the same reveal or cover run to preserve visibility.";
  const parts = selected.flatMap(i=>fogRegionParts(strokes[i]));
  if (parts.length > 2000 || parts.reduce((n,p)=>n+p.points.length,0)>10000)
    return "These regions exceed the merged region size limit.";
  return null;
}

export function mergeFogRegions(strokes: FogStroke[], indices: number[]): {strokes: FogStroke[]; index: number} | {reason: string} {
  const reason = fogMergeReason(strokes,indices);
  if (reason) return {reason};
  const selected = [...new Set(indices)].sort((a,b)=>a-b), first = selected[0];
  const points:Point[] = [], parts:NonNullable<FogStroke["parts"]> = [];
  for (const index of selected) for (const part of fogRegionParts(strokes[index])) {
    parts.push({shape:part.shape,start:points.length,count:part.points.length});
    points.push(...part.points.map(p=>({...p})));
  }
  const merged: FogStroke = {...strokes[first],shape:"merged",points,parts};
  const chosen = new Set(selected);
  return {strokes:strokes.flatMap((stroke,i)=>i===first?[merged]:chosen.has(i)?[]:[stroke]),index:first};
}

export function splitFogRegion(strokes: FogStroke[], index: number): FogStroke[] | null {
  const stroke=strokes[index];
  if (!stroke || stroke.shape!=="merged" || stroke.fillRule) return null;
  const parts=fogRegionParts(stroke);
  if (!parts.length || strokes.length-1+parts.length>2000) return null;
  return [...strokes.slice(0,index),...parts.map(part=>({mode:stroke.mode,size:stroke.size,shape:part.shape,points:part.points.map(p=>({...p}))})),...strokes.slice(index+1)];
}


const contourPoints = (part: {shape: "rect" | "polygon"; points: Point[]}): Point[] => {
  if (part.shape !== "rect") return part.points;
  const a=part.points[0], b=part.points.at(-1)!;
  return [a,{x:b.x,y:a.y},b,{x:a.x,y:b.y}];
};
/** Parity preserves the empty interior rings of a geometric union. */
export function fogRegionContains(stroke: FogStroke, point: Point): boolean {
  const hits=fogRegionParts(stroke).filter(part=>polygonContains(contourPoints(part),point)).length;
  return stroke.fillRule === "evenodd" ? hits % 2 === 1 : hits > 0;
}
// Iterative Ramer–Douglas–Peucker keeps long pointer histories tractable without
// moving the round brush boundary by more than 0.25 map pixels.
function brushCenterline(points: Point[]): Point[] {
  if(points.length<3)return points;
  const keep=new Set([0,points.length-1]), pending=[[0,points.length-1]];
  while(pending.length){
    const [start,end]=pending.pop()!,a=points[start],b=points[end];
    const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
    let farthest=-1,distance=.25*.25;
    for(let i=start+1;i<end;i++){
      const p=points[i],t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;
      const d=(p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2;
      if(d>distance){distance=d;farthest=i;}
    }
    if(farthest>=0){keep.add(farthest);pending.push([start,farthest],[farthest,end]);}
  }
  return [...keep].sort((a,b)=>a-b).map(i=>points[i]);
}
// Quantize constructed brush vertices to avoid almost-identical intersections.
const brushCoordinate=(n:number)=>Math.round(n*1e6)/1e6;
function unionBrushShapes(shapes: MultiPolygon[]): MultiPolygon {
  while(shapes.length>1){
    const next:MultiPolygon[]=[];
    for(let i=0;i<shapes.length;i+=2)next.push(i+1<shapes.length?polygonClipping.union(shapes[i],shapes[i+1]):shapes[i]);
    shapes=next;
  }
  return shapes[0]??[];
}
function clippingGeometry(stroke: FogStroke): MultiPolygon {
  if (stroke.shape === "brush") {
    const radius=stroke.size/2;
    const points=brushCenterline(stroke.points);
    // Inscribed circles add at most 0.5 pixels to the centerline's 0.25 error.
    const count=Math.max(12,Math.ceil(Math.PI/Math.acos(1-Math.min(.5,radius)/radius)));
    if(points.length*(count+4)>100000)throw new Error("Brush too complex");
    const shapes:Polygon[]=points.map(p=>[Array.from({length:count},(_,i)=>[p.x+radius*Math.cos(i*2*Math.PI/count),p.y+radius*Math.sin(i*2*Math.PI/count)])]);
    for(let i=1;i<points.length;i++) {
      const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.y-a.y);
      if(!length)continue;
      const x=-(b.y-a.y)/length*radius,y=(b.x-a.x)/length*radius;
      shapes.push([[[a.x+x,a.y+y],[b.x+x,b.y+y],[b.x-x,b.y-y],[a.x-x,a.y-y]]]);
    }
    return unionBrushShapes(shapes.map(polygon=>[polygon.map(ring=>ring.map(([x,y])=>[brushCoordinate(x),brushCoordinate(y)]))]));
  }
  const contours=fogRegionParts(stroke).map(contourPoints);
  const rings:Ring[]=contours.map(points=>points.map(p=>[p.x,p.y]));
  if(!stroke.fillRule)return rings.map(ring=>[ring]);
  // Assign holes to their immediate containing exterior; nested islands stay separate.
  const depth=contours.map((points,i)=>contours.filter((other,j)=>i!==j&&polygonContains(other,points[0])).length);
  return rings.flatMap((ring,i)=>depth[i]%2 ? [] : [[ring,...rings.filter((_,j)=>depth[j]===depth[i]+1&&polygonContains(contours[i],contours[j][0]))]]);
}
export function fogUnionReason(strokes: FogStroke[], indices: number[]): string | null {
  const selected=[...new Set(indices)].sort((a,b)=>a-b);
  if(selected.length<2)return "Select at least two regions or brush strokes to merge.";
  if(selected.some(i=>!strokes[i]))return "A selected region no longer exists.";
  const mode=strokes[selected[0]].mode;
  if(selected.some(i=>strokes[i].mode!==mode))return "Select regions with the same reveal or cover mode.";
  if(strokes.slice(selected[0],selected.at(-1)!+1).some(s=>s.mode!==mode))return "An opposite-mode stroke lies between these regions. Merge within the same reveal or cover run to preserve visibility.";
  if(selected.reduce((n,i)=>n+strokes[i].points.length,0)>10000)return "These regions exceed the merged region size limit.";
  return null;
}
export function unionFogRegions(strokes: FogStroke[], indices: number[]): {strokes: FogStroke[]; index: number} | {reason: string} {
  const reason=fogUnionReason(strokes,indices);if(reason)return {reason};
  const selected=[...new Set(indices)].sort((a,b)=>a-b);
  try {
    let geometry:MultiPolygon=[];
    for(const i of selected)geometry=polygonClipping.union(geometry,clippingGeometry(strokes[i]));
    const points:Point[]=[],parts:NonNullable<FogStroke["parts"]>=[];
    for(const polygon of geometry)for(const ring of polygon){
      const vertices=ring.slice(0,-1);
      parts.push({shape:"polygon",start:points.length,count:vertices.length});
      points.push(...vertices.map(([x,y])=>({x,y})));
    }
    if(!parts.length)return {reason:"These strokes contain no filled area to merge."};
    if(parts.length>2000||points.length>10000)return {reason:"The union exceeds the merged region size limit."};
    const first=selected[0],chosen=new Set(selected);
    const merged:FogStroke=parts.length===1
      ? {mode:strokes[first].mode,size:strokes[first].size,shape:"polygon",points}
      : {...strokes[first],shape:"merged",fillRule:"evenodd",points,parts};
    return {strokes:strokes.flatMap((stroke,i)=>i===first?[merged]:chosen.has(i)?[]:[stroke]),index:first};
  }catch{return {reason:"These shapes could not be merged. Simplify the selected regions and try again."};}
}


/** Collapse the entire ordered fog history into its final covered area. */
export function flattenFogRegions(fog: Scene["fog"], width: number, height: number): {fog: Scene["fog"]} | {reason: string} {
  try {
    const bounds:MultiPolygon=[[[[0,0],[width,0],[width,height],[0,height],[0,0]]]];
    let coverage:MultiPolygon=fog.base?bounds:[];
    for(const stroke of fog.strokes){
      const geometry=clippingGeometry(stroke);
      coverage=stroke.mode==="cover"?polygonClipping.union(coverage,geometry):polygonClipping.difference(coverage,geometry);
    }
    coverage=polygonClipping.intersection(coverage,bounds);
    const points:Point[]=[],parts:NonNullable<FogStroke["parts"]>=[];
    for(const polygon of coverage)for(const ring of polygon){
      parts.push({shape:"polygon",start:points.length,count:ring.length-1});
      points.push(...ring.slice(0,-1).map(([x,y])=>({x,y})));
    }
    if(parts.length>2000||points.length>10000)return {reason:"The flattened fog exceeds the region size limit. Simplify its strokes first."};
    return {fog:{...fog,base:false,strokes:parts.length?[{mode:"cover",shape:"merged",size:5,fillRule:"evenodd",points,parts}]:[]}};
  }catch(error){
    return {reason:error instanceof Error&&error.message==="Brush too complex"
      ? "A brush stroke still exceeds the geometry size limit after simplification. Split or simplify that stroke first."
      : "The fog geometry could not be calculated. Your original fog is unchanged."};
  }
}
