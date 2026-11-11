import type {MapShape} from "@/lib/model";
import {shapePath,roomPaths,openingPath} from "@/lib/map-drawing";
export default function DrawingShape({shape:s,background}:{shape:MapShape;background:string}){
  if(s.type==="merged"){
    const paths=roomPaths(s);
    return <g data-shape={s.id} strokeLinejoin="round" strokeLinecap="round">
      {paths.map((d,i)=><path key={`wall${i}`} d={d} fill="none" stroke={s.stroke} strokeWidth={s.thickness*2}/>)}
      {paths.map((d,i)=><path key={`floor${i}`} d={d} fill={s.fill??background} stroke="none"/>)}</g>;
  }
  if(s.type==="door"||s.type==="window")return <g data-shape={s.id}>
    <path d={shapePath(s)} fill="none" stroke={s.fill??background} strokeWidth={s.thickness+6}/>
    <path d={openingPath(s)} fill="none" stroke={s.stroke} strokeWidth={2}/>
    <path d={shapePath(s)} fill="none" stroke="transparent" strokeWidth={Math.max(16,s.thickness)}/>
  </g>;
  return <path data-shape={s.id} d={shapePath(s)} fill={s.fill??"none"} stroke={s.stroke} strokeWidth={s.thickness} strokeLinecap="round" strokeLinejoin="round"/>;
}
