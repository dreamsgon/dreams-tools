import type { MapDrawing, MapShape, Point } from "./model";
export function simplifyPoints(points:Point[], tolerance=3):Point[] {
  if(points.length<3)return points;
  const a=points[0],b=points[points.length-1],dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;
  let max=0,index=0;
  for(let i=1;i<points.length-1;i++){
    const p=points[i],t=len?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len)):0;
    const distance=Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
    if(distance>max){max=distance;index=i;}
  }
  if(max<=tolerance)return [a,b];
  return [...simplifyPoints(points.slice(0,index+1),tolerance).slice(0,-1),...simplifyPoints(points.slice(index),tolerance)];
}
export function layerIds(d:MapDrawing):string[]{return [...new Set([...(d.layerOrder??[]),...(d.folders??[]).map(f=>f.id),...d.shapes.map(s=>s.id)])].filter(id=>d.shapes.some(s=>s.id===id)||(d.folders??[]).some(f=>f.id===id));}
export function layerChildren(d:MapDrawing,parent:string|null):string[]{return layerIds(d).filter(id=>{const s=d.shapes.find(s=>s.id===id);return s?(s.folderId??null)===parent:(d.folders??[]).find(f=>f.id===id)?.parentId===parent;});}
export function orderedShapes(d:MapDrawing):MapShape[]{
  const walk=(parent:string|null):MapShape[]=>layerChildren(d,parent).flatMap(id=>{if(layerState(d,id).hidden)return [];const s=d.shapes.find(s=>s.id===id);return s?[s]:walk(id);});return walk(null);
}
export function layerState(d:MapDrawing,id:string):{hidden:boolean;locked:boolean}{
  let hidden=false,locked=false;const seen=new Set<string>();let key:string|null=id;
  while(key&&!seen.has(key)){seen.add(key);const s=d.shapes.find(s=>s.id===key),f=d.folders.find(f=>f.id===key);hidden ||= !!(s?.hidden||f?.hidden);locked ||= !!(s?.locked||f?.locked);key=s?s.folderId:f?.parentId??null;}
  return {hidden,locked};
}
export type LayerDrop={id:string|null;mode:"before"|"after"|"inside"};
export function dropLayers(d:MapDrawing,ids:string[],target:LayerDrop):boolean {
  const item=(id:string)=>d.shapes.find(s=>s.id===id)||d.folders.find(f=>f.id===id);
  const parentOf=(id:string)=>{const s=d.shapes.find(s=>s.id===id);return s?s.folderId:d.folders.find(f=>f.id===id)?.parentId??null;};
  const within=(id:string,parent:string)=>{let key:string|null=id;const seen=new Set<string>();while(key&&!seen.has(key)){if(key===parent)return true;seen.add(key);key=parentOf(key);}return false;};
  const moving=layerIds(d).filter(id=>ids.includes(id)&&!ids.some(other=>other!==id&&within(id,other)));
  if(!moving.length||moving.some(id=>!item(id)||layerState(d,id).locked)||target.id!==null&&!item(target.id))return false;
  const parent=target.mode==="inside"?target.id:target.id?parentOf(target.id):null;
  if(parent && (!d.folders.some(f=>f.id===parent)||layerState(d,parent).locked))return false;
  if(target.id && moving.some(id=>within(target.id!,id)))return false;
  if(layerIds(d).some(id=>layerState(d,id).locked&&moving.some(root=>within(id,root))))return false;
  let order=layerIds(d).filter(id=>!moving.includes(id));
  let index=order.length;
  if(target.mode!=="inside" && target.id){index=order.indexOf(target.id)+(target.mode==="before"?1:0);}
  order.splice(index,0,...moving);d.layerOrder=order;
  for(const id of moving){const s=d.shapes.find(s=>s.id===id);if(s)s.folderId=parent;else d.folders.find(f=>f.id===id)!.parentId=parent;}
  return true;
}
export function moveLayer(d:MapDrawing,id:string,direction:number){const shape=d.shapes.find(s=>s.id===id),folder=d.folders.find(f=>f.id===id);if(!shape&&!folder)return;const siblings=layerChildren(d,shape?shape.folderId:folder!.parentId),i=siblings.indexOf(id),other=siblings[i+direction];if(other)dropLayers(d,[id],{id:other,mode:direction>0?"before":"after"});}

export function shapePath(s: MapShape): string {
  const [a,b] = s.points;
  if(s.type==="merged")return roomPaths(s).join(" ");
  if(s.type === "rect") return `M ${a.x} ${a.y} H ${b.x} V ${b.y} H ${a.x} Z`;
  if(s.type === "ellipse") {
    const cx=(a.x+b.x)/2, cy=(a.y+b.y)/2, rx=Math.abs(b.x-a.x)/2, ry=Math.abs(b.y-a.y)/2;
    return `M ${cx-rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx+rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx-rx} ${cy} Z`;
  }
  if(s.type === "curve") {const c=s.points[2]; return `M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`;}
  if(s.type === "path" && s.smooth && s.points.length>2){
    const pts=s.points,n=pts.length,count=s.closed?n:n-1;
    const at=(i:number)=>s.closed?pts[(i+n)%n]:pts[Math.max(0,Math.min(n-1,i))];
    let path=`M ${a.x} ${a.y}`;
    for(let i=0;i<count;i++){const p0=at(i-1),p1=at(i),p2=at(i+1),p3=at(i+2);
      path+=` C ${p1.x+(p2.x-p0.x)/6} ${p1.y+(p2.y-p0.y)/6} ${p2.x-(p3.x-p1.x)/6} ${p2.y-(p3.y-p1.y)/6} ${p2.x} ${p2.y}`;
    }return path+(s.closed?" Z":"");
  }
  return `M ${a.x} ${a.y} `+s.points.slice(1).map(p=>`L ${p.x} ${p.y}`).join(" ")+(s.closed?" Z":"");
}
export function roomPaths(s:MapShape):string[]{return s.roomParts.map(part=>shapePath({...s,type:part.type,points:s.points.slice(part.start,part.start+part.count),smooth:part.smooth,closed:part.closed}));}
export function mergeRooms(shapes:MapShape[],id:string):MapShape|null {
  if(shapes.length<2||shapes.some(s=>!s.fill||!["rect","ellipse","merged"].includes(s.type)&&!(s.type==="path"&&s.closed)))return null;
  const points:Point[]=[],parts:MapShape["roomParts"]=[];
  for(const s of shapes){const start=points.length;points.push(...s.points.map(p=>({...p})));
    if(s.type==="merged")parts.push(...s.roomParts.map(p=>({...p,start:p.start+start})));
    else parts.push({type:s.type as "rect"|"ellipse"|"path",start,count:s.points.length,smooth:s.smooth,closed:s.closed});
  }
  if(points.length>2000)return null;
  return {...shapes[0],id,name:"Merged rooms",type:"merged",points,roomParts:parts};
}
export function openingPath(s:MapShape):string {
  const [a,b]=s.points,dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len,w=Math.max(5,s.thickness/2);
  const line=(p:Point,q:Point)=>`M ${p.x} ${p.y} L ${q.x} ${q.y} `;
  const offset=(p:Point,t:number)=>({x:p.x+nx*t,y:p.y+ny*t});
  let path=line(offset(a,-w),offset(a,w))+line(offset(b,-w),offset(b,w));
  if(s.type==="window")return path+line(offset(a,-3),offset(b,-3))+line(offset(a,3),offset(b,3));
  const end={x:a.x+nx*len,y:a.y+ny*len};
  return path+line(a,end)+`M ${b.x} ${b.y} A ${len} ${len} 0 0 1 ${end.x} ${end.y}`;
}
