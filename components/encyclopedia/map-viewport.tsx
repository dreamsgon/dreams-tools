'use client';
import { uiZoom } from "@/lib/appearance";
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {fitMapSize,mapSize,type MapData} from '@/lib/encyclopedia/map-model';
export function MapViewport({map,children,editing=false}:{map:MapData;children:ReactNode;editing?:boolean}){
 const viewport=useRef<HTMLDivElement>(null),drag=useRef<{x:number;y:number;left:number;top:number;moved:boolean}|null>(null),suppress=useRef(false);
 const [bounds,setBounds]=useState({width:600,height:420}),[zoom,setZoom]=useState(1),[panning,setPanning]=useState(false);
 const size=mapSize(map),scaled=fitMapSize(bounds.width,bounds.height,size.width,size.height,zoom);
 useEffect(()=>{const element=viewport.current;if(!element)return;const observer=new ResizeObserver(()=>setBounds({width:element.clientWidth,height:element.clientHeight}));observer.observe(element);return()=>observer.disconnect();},[]);
 useEffect(()=>{setZoom(1);viewport.current?.scrollTo(0,0);},[size.width,size.height]);
 const adjust=(value:number)=>{const el=viewport.current;if(!el)return;const x=(el.scrollLeft+el.clientWidth/2)/Math.max(el.scrollWidth,1),y=(el.scrollTop+el.clientHeight/2)/Math.max(el.scrollHeight,1);setZoom(value);requestAnimationFrame(()=>{el.scrollLeft=x*el.scrollWidth-el.clientWidth/2;el.scrollTop=y*el.scrollHeight-el.clientHeight/2;});};
 return <div className="map-stage"><div className="map-navigation"><span>{editing?'Drag to brush · scroll outside the map to move the page':zoom>1?'Drag to pan · use the scrollbars or arrow keys':'Whole map in view · scroll to move the page'}</span><div className="map-zoom"><button aria-label="Zoom out" disabled={zoom<=1} onClick={()=>adjust(Math.max(1,zoom-.5))}>−</button><span aria-live="polite">{Math.round(zoom*100)}%</span><button aria-label="Zoom in" disabled={zoom>=4} onClick={()=>adjust(Math.min(4,zoom+.5))}>+</button><button onClick={()=>{setZoom(1);viewport.current?.scrollTo(0,0);}}>Fit map</button></div></div>
 <div ref={viewport} style={{aspectRatio:`${size.width}/${size.height}`}} className={`map-viewport map-fitted ${editing?'map-editing':''} ${zoom>1&&!editing?'map-pannable':''} ${panning?'is-panning':''}`} tabIndex={0} role="region" aria-label="Map viewport" onKeyDown={e=>{if(e.target!==e.currentTarget)return;const moves:Record<string,[number,number]>={ArrowLeft:[-60,0],ArrowRight:[60,0],ArrowUp:[0,-60],ArrowDown:[0,60]};if(moves[e.key]){e.preventDefault();e.currentTarget.scrollBy(...moves[e.key]);}}}
 onPointerDown={e=>{if(editing||zoom<=1||e.button!==0||e.pointerType!=='mouse')return;drag.current={x:e.clientX,y:e.clientY,left:e.currentTarget.scrollLeft,top:e.currentTarget.scrollTop,moved:false};suppress.current=false;}}
 onPointerMove={e=>{const d=drag.current;if(!d)return;if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>4){d.moved=true;setPanning(true);e.currentTarget.setPointerCapture(e.pointerId);const z=uiZoom();e.currentTarget.scrollLeft=d.left-(e.clientX-d.x)/z;e.currentTarget.scrollTop=d.top-(e.clientY-d.y)/z;}}}
 onPointerUp={e=>{suppress.current=!!drag.current?.moved;drag.current=null;setPanning(false);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
 onPointerCancel={()=>{drag.current=null;setPanning(false);}} onPointerLeave={()=>{if(!panning)drag.current=null;}}
 onClickCapture={e=>{if(suppress.current){e.stopPropagation();e.preventDefault();suppress.current=false;}}}>
 <div className="map-pan-space" style={{width:Math.max(bounds.width,scaled.width),height:Math.max(bounds.height,scaled.height)}}><div className="map-surface" style={{width:scaled.width,height:scaled.height}}>{children}</div></div>
 </div></div>;
}
