'use client';
import {useEffect,useState,useId,useRef,type MouseEvent} from 'react';
import {cellShape,mapSize,terrains,pointCell,type MapData} from '@/lib/encyclopedia/map-model';
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
export function MapCanvas({map,imageUrl,onCell,onPlace,onPin,selectedPin,thumbnail=false,fogMode='gm',onStrokeStart,fogEditing=false}:{map:MapData;imageUrl?:string;onCell?:(i:number)=>void;onPlace?:(x:number,y:number)=>void;onPin?:(id:string)=>void;selectedPin?:string;thumbnail?:boolean;fogMode?:'gm'|'player';onStrokeStart?:()=>void;fogEditing?:boolean}){
 const maskId=useId().replace(/:/g,''),drawing=useRef(false),lastCell=useRef(-1);
 const size=mapSize(map);const count=map.columns*map.rows;const click=(event:MouseEvent<SVGSVGElement>)=>{if(!onPlace)return;const r=event.currentTarget.getBoundingClientRect();onPlace(Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(event.clientY-r.top)/r.height)));};
 const brush=(event:React.PointerEvent<SVGSVGElement>)=>{const r=event.currentTarget.getBoundingClientRect(),i=pointCell(map,(event.clientX-r.left)/r.width,(event.clientY-r.top)/r.height);if(i>=0&&i!==lastCell.current){lastCell.current=i;onCell?.(i);}};
 const fog=map.fog?.enabled,all=map.fog?.revealed.length===count;
 return <svg className="map-canvas" viewBox={`0 0 ${size.width} ${size.height}`} style={{aspectRatio:`${size.width}/${size.height}`}} aria-label={thumbnail?'Map preview':'Map canvas'} role={onCell||onPlace||(onPin&&map.pins.length)?'group':'img'} onClick={click}
 onPointerDown={onCell?e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();drawing.current=true;lastCell.current=-1;onStrokeStart?.();e.currentTarget.setPointerCapture(e.pointerId);brush(e);}:undefined}
 onPointerMove={onCell?e=>{if(drawing.current)brush(e);}:undefined}
 onPointerUp={e=>{drawing.current=false;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
 onPointerCancel={()=>{drawing.current=false;}}>
 <defs><mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={size.width} height={size.height}><rect width={size.width} height={size.height} fill="white"/>{all?<rect width={size.width} height={size.height} fill="black"/>:map.fog?.revealed.map(i=><polygon key={i} points={cellShape(map,i).points} fill="black"/>)}</mask></defs>
 <rect width={size.width} height={size.height} fill="#e7e3d5"/>
 {map.source==='image'&&imageUrl&&<image href={imageUrl} width={size.width} height={size.height} preserveAspectRatio="none"/>}
 {(map.source==='generated'||map.grid!=='none'||onCell)&&Array.from({length:count},(_,i)=>{const cell=cellShape(map,i),terrain=map.tiles[i]??1,coord=`${String(i%map.columns+1).padStart(2,'0')}.${String(Math.floor(i/map.columns)+1).padStart(2,'0')}`,name=terrains[terrain].name;
 return <g key={i} role={onCell?'button':undefined} tabIndex={onCell?0:undefined} aria-label={onCell?`${map.grid==='hex'?'Hex':'Cell'} ${coord} ${fogEditing?(map.fog?.revealed.includes(i)?'Revealed':'Hidden'):name}`:undefined} aria-pressed={fogEditing?map.fog?.revealed.includes(i):undefined} onClick={onCell?e=>e.stopPropagation():undefined} onKeyDown={onCell?e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onStrokeStart?.();onCell(i);}}:undefined}>
 <polygon points={cell.points} fill={map.source==='generated'?terrains[terrain].color:'transparent'} stroke={map.grid==='none'&&!onCell?(map.source==='generated'?terrains[terrain].color:'none'):'#253f3b'} strokeOpacity={map.grid==='none'&&!onCell?1:.28} strokeWidth={map.grid==='none'?.6:Math.max(size.width/1200,.6)}/>
 {map.source==='generated'&&!thumbnail&&terrain===4&&<path d={`M${cell.x-cell.w*.23} ${cell.y+cell.h*.12}l${cell.w*.23} ${-cell.h*.33}l${cell.w*.23} ${cell.h*.33}M${cell.x-cell.w*.1} ${cell.y-cell.h*.02}l${cell.w*.1} ${cell.h*.04}l${cell.w*.08} ${-cell.h*.08}`} fill="none" stroke="#62685f" strokeWidth={1.2} pointerEvents="none"/>}
 {map.source==='generated'&&!thumbnail&&terrain===2&&<path d={`M${cell.x} ${cell.y-cell.h*.22}l${-cell.w*.17} ${cell.h*.32}h${cell.w*.34}z M${cell.x} ${cell.y+cell.h*.1}v${cell.h*.12}`} fill="#4d7354" stroke="#48684a" strokeWidth={.8} pointerEvents="none"/>}
 {map.coordinates&&!thumbnail&&<text x={cell.x} y={cell.y+cell.h*.36} textAnchor="middle" fontSize={Math.min(cell.w*.18,12)} fill="#283e38" opacity={.7} pointerEvents="none">{coord}</text>}
 </g>;})}
 {!thumbnail&&map.routes?.map(route=><polyline key={route.id} aria-label={`Route ${route.name}`} points={route.stops.map(id=>map.pins.find(p=>p.id===id)).filter(p=>!!p).map(p=>`${p.x*size.width},${p.y*size.height}`).join(' ')} fill="none" stroke="#d08245" strokeWidth={Math.max(2,size.width/350)} strokeDasharray="8 5" pointerEvents="none"><title>{route.name} · {route.distances.reduce((a,b)=>a+b,0).toFixed(1)} {route.unit}</title></polyline>)}
 {fog&&<rect width={size.width} height={size.height} fill="#24312e" opacity={fogMode==='gm'?.58:1} mask={`url(#${maskId})`} pointerEvents="none"/>}
 {!thumbnail&&map.pins.map((pin,i)=>{const x=pin.x*size.width,y=pin.y*size.height,r=size.width/90;return <g key={pin.id} role={onPin?'button':undefined} tabIndex={onPin?0:undefined} aria-label={`Pin ${pin.title}`} className="map-pin" onClick={e=>{e.stopPropagation();onPin?.(pin.id);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onPin?.(pin.id);}}}>
 <circle cx={x} cy={y} r={r} fill={selectedPin===pin.id?'#b7673e':'#344f43'} stroke="#fff9e9" strokeWidth={r*.18}/><text x={x} y={y+r*.34} textAnchor="middle" fill="white" fontSize={r} pointerEvents="none">{i+1}</text><text x={x} y={y-r*1.6} textAnchor={pin.x>.8?'end':pin.x<.2?'start':'middle'} fontSize={r*1.05} fill="#263e34" stroke="#fff9e9" strokeWidth={r*.22} paintOrder="stroke" fontWeight="600" pointerEvents="none">{pin.title}</text>
 </g>;})}
 </svg>;
}
export function ReadOnlyMap({map,playerToken,onOpen,campaignId,calendars=[]}:{map:MapData;campaignId?:string;calendars?:Calendar[];playerToken?:string;onOpen?:(id:string)=>void}){
 const {url,error}=useMapImage(map,playerToken),[selected,setSelected]=useState('');const pin=map.pins.find(p=>p.id===selected);
 return <div className="map-reader">{map.fog?.enabled&&<p className="map-tool-hint">Unexplored areas remain hidden. Your GM reveals the map as you explore.</p>}{error&&<p className="info-note">{error}</p>}<div className="map-exploration"><MapViewport map={map}><MapCanvas map={map} imageUrl={url} selectedPin={selected} onPin={setSelected} fogMode="player"/></MapViewport><MapWeather pin={pin} campaignId={campaignId} calendars={calendars}/></div>{!!map.routes?.length&&<ul className="shared-routes">{map.routes.map(r=><li key={r.id}><strong>{r.name}</strong> · {r.distances.reduce((a,b)=>a+b,0).toFixed(1)} {r.unit} · {r.stops.map(id=>map.pins.find(p=>p.id===id)?.title).join(' → ')}</li>)}</ul>}{pin&&<div className="pin-readout"><h3>{pin.title}</h3><p>{pin.notes||'No notes for this location.'}</p>{pin.entryId&&onOpen&&<button className="text-button" onClick={()=>onOpen(pin.entryId!)}>Open linked article →</button>}</div>}</div>;
}
