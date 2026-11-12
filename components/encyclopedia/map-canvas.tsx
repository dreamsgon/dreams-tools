'use client';
import {useEffect,useMemo,useState,useId,useRef,type MouseEvent} from 'react';
import {cellShape,mapSize,terrains,pointCell,mapPaint,type MapData,type MapPaint} from '@/lib/encyclopedia/map-model';
import {terrainLayers,terrainGlyphs,scaleBarLength,type TerrainGlyph} from '@/lib/encyclopedia/terrain-art';
import {MapWeather} from './map-weather';
import type {Calendar} from '@/lib/encyclopedia/calendar-model';
import {MapViewport} from './map-viewport';
export function useMapImage(map:MapData,playerToken?:string){
 const [url,setUrl]=useState<string|undefined>(),[error,setError]=useState('');
 useEffect(()=>{setUrl(undefined);setError('');if(map.source!=='image'||!map.imageId)return;const controller=new AbortController();let objectUrl:string|undefined;
 const request=playerToken?fetch('/api/encyclopedia/player-map-images',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:playerToken,imageId:map.imageId}),signal:controller.signal}):fetch('/api/encyclopedia/map-images?id='+encodeURIComponent(map.imageId),{signal:controller.signal});
 request.then(async r=>{if(!r.ok)throw new Error('Map image unavailable. Ask the GM to check or refresh the map.');const blob=await r.blob();if(controller.signal.aborted)return;objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
 return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[map.imageId,map.source,playerToken]);return {url,error};
}
const paintCache=new Map<string,MapPaint|null>();
/** The map's terrain paint, made from its cells once and reused while they stay the same. */
function cachedPaint(map:MapData){
 if(map.source!=='generated')return null;if(map.paint)return map.paint;
 const key=`${map.columns}x${map.rows}${map.grid}:${map.seed}:${map.tiles.join('')}`;
 if(!paintCache.has(key)){if(paintCache.size>12)paintCache.delete(paintCache.keys().next().value!);paintCache.set(key,mapPaint(map));}
 return paintCache.get(key)!;
}
/** Glyph drawings for painted terrain. */
function Glyph({g}:{g:TerrainGlyph}){const {x,y,size:s}=g;
 if(g.kind==='mountain'||g.kind==='snowpeak')return <g><path d={`M${x-s} ${y+s*.5}L${x-s*.08} ${y-s*.75}L${x+s} ${y+s*.5}Z`} fill={g.kind==='snowpeak'?'#f3f4ef':'#b6a98f'} stroke="#4f483c" strokeWidth={s*.1} strokeLinejoin="round"/><path d={`M${x-s*.08} ${y-s*.75}L${x+s*.3} ${y+s*.5}`} stroke="#4f483c" strokeOpacity={.45} strokeWidth={s*.08}/></g>;
 if(g.kind==='hill')return <path d={`M${x-s*.6} ${y+s*.1}q${s*.6} ${-s*.75} ${s*1.2} 0`} fill="none" stroke="#5f5d3f" strokeOpacity={.75} strokeWidth={s*.1} strokeLinecap="round"/>;
 if(g.kind==='tree')return <g><path d={`M${x} ${y+s*.4}v${s*.6}`} stroke="#3c5537" strokeWidth={s*.2}/><circle cx={x} cy={y} r={s*.62} fill="#557a4d" stroke="#3c5537" strokeWidth={s*.12}/></g>;
 return <path d={`M${x-s*.6} ${y+s*.3}h${s*1.2}M${x-s*.3} ${y+s*.3}v${-s*.5}M${x} ${y+s*.3}v${-s*.7}M${x+s*.3} ${y+s*.3}v${-s*.5}`} stroke="#4a6a5c" strokeWidth={s*.1} strokeLinecap="round"/>;
}
/** Smooth painted terrain: layered shapes, then small symbols. */
export function TerrainArt({paint,width,height,glyphs=true}:{paint:MapPaint;width:number;height:number;glyphs?:boolean}){
 const layers=useMemo(()=>terrainLayers(paint,width,height),[paint,width,height]);
 const marks=useMemo(()=>glyphs?terrainGlyphs(paint,width,height):[],[paint,width,height,glyphs]);
 return <g className="map-terrain" pointerEvents="none"><rect width={width} height={height} fill={terrains[0].color}/>{layers.map(l=><path key={l.id} d={l.d} fill={l.color} fillRule="evenodd" stroke={l.id==='land'?'#5c6f63':'none'} strokeOpacity={.55} strokeWidth={Math.max(1,width/900)}/>)}{marks.map((g,i)=><Glyph key={i} g={g}/>)}</g>;
}
/** A compass rose for the corner of a map. */
export function Compass({x,y,r}:{x:number;y:number;r:number}){return <g className="map-compass" transform={`translate(${x} ${y})`} pointerEvents="none" aria-hidden="true"><circle r={r} fill="#fffdf6" fillOpacity={.82} stroke="#3b3a33" strokeWidth={r*.05}/><circle r={r*.78} fill="none" stroke="#3b3a33" strokeOpacity={.35} strokeWidth={r*.03}/><path d={`M0 ${-r*.9}L${r*.2} 0L0 ${r*.9}L${-r*.2} 0Z`} fill="#3b3a33" fillOpacity={.2} stroke="#3b3a33" strokeWidth={r*.03}/><path d={`M0 ${-r*.9}L${r*.2} 0H${-r*.2}Z`} fill="#3b3a33"/><path d={`M${-r*.9} 0L0 ${r*.14}L${r*.9} 0L0 ${-r*.14}Z`} fill="#3b3a33" fillOpacity={.4}/><text y={-r*1.12} textAnchor="middle" fontSize={r*.5} fontWeight="700" fontFamily="Georgia, serif" fill="#3b3a33" stroke="#fffdf6" strokeWidth={r*.12} paintOrder="stroke">N</text></g>;}
/** A scale bar sized to the map's width in miles or kilometres. */
export function ScaleBar({map,width,height}:{map:MapData;width:number;height:number}){
 if(!map.scale)return null;const length=scaleBarLength(map.scale.width),px=length/map.scale.width*width,u=Math.min(width,height)/60,x=u*2,y=height-u*2.4;
 return <g className="map-scale" pointerEvents="none" aria-label={`Scale: ${length} ${map.scale.unit}`} fontFamily="Inter, system-ui, sans-serif" fontSize={u*1.1} fill="#2d2a22"><rect x={x-u*.6} y={y-u*2.2} width={px+u*1.2} height={u*3.2} rx={u*.4} fill="#fffdf6" fillOpacity={.75}/><rect x={x} y={y} width={px/2} height={u*.5} fill="#2d2a22"/><rect x={x+px/2} y={y} width={px/2} height={u*.5} fill="#fffdf6" stroke="#2d2a22" strokeWidth={u*.08}/><text x={x} y={y-u*.5}>0</text><text x={x+px} y={y-u*.5} textAnchor="end">{length} {map.scale.unit}</text></g>;
}
export type PaintBrush={radius:number;onStroke:(x:number,y:number,start:boolean)=>void;onEnd:()=>void};
export function MapCanvas({map,imageUrl,onCell,onPlace,onPin,selectedPin,thumbnail=false,fogMode='gm',onStrokeStart,fogEditing=false,paint:livePaint,brush:paintBrush,show}:{map:MapData;imageUrl?:string;onCell?:(i:number)=>void;onPlace?:(x:number,y:number)=>void;onPin?:(id:string)=>void;selectedPin?:string;thumbnail?:boolean;fogMode?:'gm'|'player';onStrokeStart?:()=>void;fogEditing?:boolean;paint?:MapPaint;brush?:PaintBrush;show?:{art?:boolean;pins?:boolean;routes?:boolean}}){
 const maskId=useId().replace(/:/g,''),drawing=useRef(false),lastCell=useRef(-1),[hover,setHover]=useState<{x:number;y:number}|null>(null);
 const terrainPaint=livePaint??cachedPaint(map);
 const showPins=show?.pins!==false,showRoutes=show?.routes!==false;
 const size=mapSize(map);const count=map.columns*map.rows;const click=(event:MouseEvent<SVGSVGElement>)=>{if(!onPlace)return;const r=event.currentTarget.getBoundingClientRect();onPlace(Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(event.clientY-r.top)/r.height)));};
 const brush=(event:React.PointerEvent<SVGSVGElement>)=>{const r=event.currentTarget.getBoundingClientRect(),i=pointCell(map,(event.clientX-r.left)/r.width,(event.clientY-r.top)/r.height);if(i>=0&&i!==lastCell.current){lastCell.current=i;onCell?.(i);}};
 const point=(e:React.PointerEvent<SVGSVGElement>)=>{const r=e.currentTarget.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};};
 const fog=map.fog?.enabled,all=map.fog?.revealed.length===count,painted=map.source==='generated'&&!!terrainPaint;
 return <svg className="map-canvas" viewBox={`0 0 ${size.width} ${size.height}`} style={{aspectRatio:`${size.width}/${size.height}`}} aria-label={thumbnail?'Map preview':'Map canvas'} role={onCell||onPlace||(onPin&&map.pins.length)?'group':'img'} onClick={click}
 onPointerDown={paintBrush?e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();drawing.current=true;e.currentTarget.setPointerCapture(e.pointerId);const p=point(e);paintBrush.onStroke(p.x,p.y,true);}:onCell?e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();drawing.current=true;lastCell.current=-1;onStrokeStart?.();e.currentTarget.setPointerCapture(e.pointerId);brush(e);}:undefined}
 onPointerMove={paintBrush?e=>{const p=point(e);setHover(p);if(drawing.current)paintBrush.onStroke(p.x,p.y,false);}:onCell?e=>{if(drawing.current)brush(e);}:undefined}
 onPointerLeave={paintBrush?()=>setHover(null):undefined}
 onPointerUp={e=>{const was=drawing.current;drawing.current=false;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);if(was)paintBrush?.onEnd();}}
 onPointerCancel={()=>{const was=drawing.current;drawing.current=false;if(was)paintBrush?.onEnd();}}>
 <defs><mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={size.width} height={size.height}><rect width={size.width} height={size.height} fill="white"/>{all?<rect width={size.width} height={size.height} fill="black"/>:map.fog?.revealed.map(i=><polygon key={i} points={cellShape(map,i).points} fill="black"/>)}</mask></defs>
 <rect width={size.width} height={size.height} fill="#e7e3d5"/>
 {map.source==='image'&&imageUrl&&<image href={imageUrl} width={size.width} height={size.height} preserveAspectRatio="none"/>}
 {painted&&<TerrainArt paint={terrainPaint!} width={size.width} height={size.height} glyphs={!thumbnail&&show?.art!==false}/>}
 {(map.grid!=='none'||onCell||(map.coordinates&&!thumbnail))&&Array.from({length:count},(_,i)=>{const cell=cellShape(map,i),terrain=map.tiles[i]??1,coord=`${String(i%map.columns+1).padStart(2,'0')}.${String(Math.floor(i/map.columns)+1).padStart(2,'0')}`,name=terrains[terrain].name;
 return <g key={i} role={onCell?'button':undefined} tabIndex={onCell?0:undefined} aria-label={onCell?`${map.grid==='hex'?'Hex':'Cell'} ${coord} ${fogEditing?(map.fog?.revealed.includes(i)?'Revealed':'Hidden'):name}`:undefined} aria-pressed={fogEditing?map.fog?.revealed.includes(i):undefined} onClick={onCell?e=>e.stopPropagation():undefined} onKeyDown={onCell?e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onStrokeStart?.();onCell(i);}}:undefined}>
 <polygon points={cell.points} fill="transparent" stroke="#253f3b" strokeOpacity={map.grid==='none'?(onCell?.16:0):.28} strokeWidth={Math.max(size.width/1200,.6)}/>
 {map.coordinates&&!thumbnail&&<text x={cell.x} y={cell.y+cell.h*.36} textAnchor="middle" fontSize={Math.min(cell.w*.18,12)} fill="#283e38" opacity={.7} pointerEvents="none">{coord}</text>}
 </g>;})}
 {!thumbnail&&showRoutes&&map.routes?.map(route=><polyline key={route.id} aria-label={`Route ${route.name}`} points={route.stops.map(id=>map.pins.find(p=>p.id===id)).filter(p=>!!p).map(p=>`${p.x*size.width},${p.y*size.height}`).join(' ')} fill="none" stroke="#d08245" strokeWidth={Math.max(2,size.width/350)} strokeDasharray="8 5" pointerEvents="none"><title>{route.name} · {route.distances.reduce((a,b)=>a+b,0).toFixed(1)} {route.unit}</title></polyline>)}
 {fog&&<rect width={size.width} height={size.height} fill="#24312e" opacity={fogMode==='gm'?.58:1} mask={`url(#${maskId})`} pointerEvents="none"/>}
 {!thumbnail&&(map.compass||map.scaleBar)&&<>{map.scaleBar&&<ScaleBar map={map} width={size.width} height={size.height}/>}{map.compass&&<Compass x={size.width-Math.min(size.width,size.height)*.08} y={size.height-Math.min(size.width,size.height)*.09} r={Math.min(size.width,size.height)*.045}/>}</>}
 {!thumbnail&&showPins&&map.pins.map((pin,i)=>{const x=pin.x*size.width,y=pin.y*size.height,r=size.width/90;return <g key={pin.id} role={onPin?'button':undefined} tabIndex={onPin?0:undefined} aria-label={`Pin ${pin.title}`} className="map-pin" onClick={e=>{e.stopPropagation();onPin?.(pin.id);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onPin?.(pin.id);}}}>
 <circle cx={x} cy={y} r={r} fill={selectedPin===pin.id?'#b7673e':'#344f43'} stroke="#fff9e9" strokeWidth={r*.18}/><text x={x} y={y+r*.34} textAnchor="middle" fill="white" fontSize={r} pointerEvents="none">{i+1}</text><text x={x} y={y-r*1.6} textAnchor={pin.x>.8?'end':pin.x<.2?'start':'middle'} fontSize={r*1.05} fill="#263e34" stroke="#fff9e9" strokeWidth={r*.22} paintOrder="stroke" fontWeight="600" pointerEvents="none">{pin.title}</text>
 </g>;})}
 {paintBrush&&hover&&<g pointerEvents="none"><circle cx={hover.x*size.width} cy={hover.y*size.height} r={paintBrush.radius*size.width} fill="none" stroke="#ffffff" strokeWidth={Math.max(2,size.width/500)}/><circle cx={hover.x*size.width} cy={hover.y*size.height} r={paintBrush.radius*size.width} fill="none" stroke="#16191c" strokeWidth={Math.max(1,size.width/1000)} strokeDasharray={`${size.width/160} ${size.width/160}`}/></g>}
 </svg>;
}
export function ReadOnlyMap({map,playerToken,onOpen,campaignId,calendars=[]}:{map:MapData;campaignId?:string;calendars?:Calendar[];playerToken?:string;onOpen?:(id:string)=>void}){
 const {url,error}=useMapImage(map,playerToken),[selected,setSelected]=useState('');const pin=map.pins.find(p=>p.id===selected);
 return <div className="map-reader">{map.fog?.enabled&&<p className="map-tool-hint">Unexplored areas remain hidden. Your GM reveals the map as you explore.</p>}{error&&<p className="info-note">{error}</p>}<div className="map-exploration"><MapViewport map={map}><MapCanvas map={map} imageUrl={url} selectedPin={selected} onPin={setSelected} fogMode="player"/></MapViewport><MapWeather pin={pin} campaignId={campaignId} calendars={calendars}/></div>{!!map.routes?.length&&<ul className="shared-routes">{map.routes.map(r=><li key={r.id}><strong>{r.name}</strong> · {r.distances.reduce((a,b)=>a+b,0).toFixed(1)} {r.unit} · {r.stops.map(id=>map.pins.find(p=>p.id===id)?.title).join(' → ')}</li>)}</ul>}{pin&&<div className="pin-readout"><h3>{pin.title}</h3><p>{pin.notes||'No notes for this location.'}</p>{pin.entryId&&onOpen&&<button className="text-button" onClick={()=>onOpen(pin.entryId!)}>Open linked article →</button>}</div>}</div>;
}
