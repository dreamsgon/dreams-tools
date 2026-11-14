'use client';
import {useEffect,useMemo,useState,useId,useRef,type MouseEvent} from 'react';
import {cellShape,mapSize,terrains,pointCell,mapPaint,type MapData,type MapPaint,type MapPath,type MapLabel,type MapPin} from '@/lib/encyclopedia/map-model';
import {terrainLayers,terrainGlyphs,scaleBarLength,smoothLine,type TerrainGlyph} from '@/lib/encyclopedia/terrain-art';
import {MapWeather} from './map-weather';
import type {Calendar} from '@/lib/encyclopedia/calendar-model';
import {MapViewport} from './map-viewport';
import {legendItems,mapLookOf,mapLooks,type MapLook} from '@/lib/encyclopedia/map-looks';
import {imageSrc} from './member-view';
type Style=ReturnType<typeof mapLookOf>;
const painted0=mapLookOf({});
export function useMapImage(map:MapData,playerToken?:string){
 const [url,setUrl]=useState<string|undefined>(),[error,setError]=useState('');
 useEffect(()=>{setUrl(undefined);setError('');if(map.source!=='image'||!map.imageId)return;const controller=new AbortController();let objectUrl:string|undefined;
 const request=playerToken?fetch('/api/encyclopedia/player-map-images',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:playerToken,imageId:map.imageId}),signal:controller.signal}):fetch(imageSrc(map.imageId),{signal:controller.signal});
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
function Glyph({g,look=mapLooks.painted}:{g:TerrainGlyph;look?:MapLook}){const {x,y,size:s}=g,c=look.glyph;
 if(g.kind==='mountain'||g.kind==='snowpeak')return <g><path d={`M${x-s} ${y+s*.5}L${x-s*.08} ${y-s*.75}L${x+s} ${y+s*.5}Z`} fill={g.kind==='snowpeak'?c.snow:c.mountain} stroke={c.mountainInk} strokeWidth={s*.1} strokeLinejoin="round"/><path d={`M${x-s*.08} ${y-s*.75}L${x+s*.3} ${y+s*.5}`} stroke={c.mountainInk} strokeOpacity={.45} strokeWidth={s*.08}/></g>;
 if(g.kind==='hill')return <path d={`M${x-s*.6} ${y+s*.1}q${s*.6} ${-s*.75} ${s*1.2} 0`} fill="none" stroke={c.hill} strokeOpacity={.75} strokeWidth={s*.1} strokeLinecap="round"/>;
 if(g.kind==='tree')return <g><path d={`M${x} ${y+s*.4}v${s*.6}`} stroke={c.treeInk} strokeWidth={s*.2}/><circle cx={x} cy={y} r={s*.62} fill={c.tree} stroke={c.treeInk} strokeWidth={s*.12}/></g>;
 return <path d={`M${x-s*.6} ${y+s*.3}h${s*1.2}M${x-s*.3} ${y+s*.3}v${-s*.5}M${x} ${y+s*.3}v${-s*.7}M${x+s*.3} ${y+s*.3}v${-s*.5}`} stroke={c.marsh} strokeWidth={s*.1} strokeLinecap="round"/>;
}
/** Smooth painted terrain: layered shapes, then small symbols. */
export function TerrainArt({paint,width,height,glyphs=true,look=mapLooks.painted,uid='t'}:{paint:MapPaint;width:number;height:number;glyphs?:boolean;look?:MapLook;uid?:string}){
 const layers=useMemo(()=>terrainLayers(paint,width,height),[paint,width,height]);
 const marks=useMemo(()=>glyphs?terrainGlyphs(paint,width,height):[],[paint,width,height,glyphs]);
 const wave=width/40;
 return <g className="map-terrain" pointerEvents="none"><rect width={width} height={height} fill={look.sea}/>{look.waves&&<><defs><pattern id={`${uid}-waves`} width={wave*2} height={wave} patternUnits="userSpaceOnUse"><path d={`M${wave*.2} ${wave*.55}q${wave*.2} ${-wave*.25} ${wave*.4} 0t${wave*.4} 0`} fill="none" stroke={look.ink} strokeOpacity={.22} strokeWidth={wave*.05}/></pattern></defs><rect width={width} height={height} fill={`url(#${uid}-waves)`}/></>}{layers.map(l=><path key={l.id} d={l.d} fill={look.layers[l.id]??l.color} fillRule="evenodd" stroke={l.id==='land'?look.coast:'none'} strokeOpacity={look===mapLooks.painted?.55:.9} strokeWidth={Math.max(1,width/900)*look.coastWidth}/>)}{marks.map((g,i)=><Glyph key={i} g={g} look={look}/>)}</g>;
}
/** A compass rose for the corner of a map. */
export function Compass({x,y,r,ink='#3b3a33',paper='#fffdf6'}:{x:number;y:number;r:number;ink?:string;paper?:string}){return <g className="map-compass" transform={`translate(${x} ${y})`} pointerEvents="none" aria-hidden="true"><circle r={r} fill={paper} fillOpacity={.82} stroke={ink} strokeWidth={r*.05}/><circle r={r*.78} fill="none" stroke={ink} strokeOpacity={.35} strokeWidth={r*.03}/><path d={`M0 ${-r*.9}L${r*.2} 0L0 ${r*.9}L${-r*.2} 0Z`} fill={ink} fillOpacity={.2} stroke={ink} strokeWidth={r*.03}/><path d={`M0 ${-r*.9}L${r*.2} 0H${-r*.2}Z`} fill={ink}/><path d={`M${-r*.9} 0L0 ${r*.14}L${r*.9} 0L0 ${-r*.14}Z`} fill={ink} fillOpacity={.4}/><text y={-r*1.12} textAnchor="middle" fontSize={r*.5} fontWeight="700" fontFamily="Georgia, serif" fill={ink} stroke={paper} strokeWidth={r*.12} paintOrder="stroke">N</text></g>;}
/** A scale bar sized to the map's width in miles or kilometres. */
export function ScaleBar({map,width,height,ink='#2d2a22',paper='#fffdf6'}:{map:MapData;width:number;height:number;ink?:string;paper?:string}){
 if(!map.scale)return null;const length=scaleBarLength(map.scale.width),px=length/map.scale.width*width,u=Math.min(width,height)/60,x=u*2,y=height-u*2.4;
 return <g className="map-scale" pointerEvents="none" aria-label={`Scale: ${length} ${map.scale.unit}`} fontFamily="Inter, system-ui, sans-serif" fontSize={u*1.1} fill={ink}><rect x={x-u*.6} y={y-u*2.2} width={px+u*1.2} height={u*3.2} rx={u*.4} fill={paper} fillOpacity={.75}/><rect x={x} y={y} width={px/2} height={u*.5} fill={ink}/><rect x={x+px/2} y={y} width={px/2} height={u*.5} fill={paper} stroke={ink} strokeWidth={u*.08}/><text x={x} y={y-u*.5}>0</text><text x={x+px} y={y-u*.5} textAnchor="end">{length} {map.scale.unit}</text></g>;
}
const pathLook={river:{color:'#5b8fa6',dash:undefined,width:1,halo:false},road:{color:'#8a5a3b',dash:'2.4 1.6',width:.7,halo:false},border:{color:'#8a3b4a',dash:'.4 1.4',width:.8,halo:true}} as const;
/** Rivers, roads and borders, with names written along them. */
export function MapPaths({paths,width,height,prefix,selected,onSelect,draft,style=painted0}:{paths:MapPath[];width:number;height:number;prefix:string;selected?:string;onSelect?:(id:string)=>void;draft?:MapPath|null;style?:Style}){
 const u=Math.max(1.2,Math.min(width,height)/260);
 const one=(p:MapPath,isDraft=false)=>{const look=pathLook[p.kind],color=style.look[p.kind],d=smoothLine(p.points,width,height),w=u*look.width*(p.kind==='river'?1.6:1.4),pid=`${prefix}-path-${p.id}`,backwards=p.points[0].x>p.points[p.points.length-1].x,textD=backwards?smoothLine([...p.points].reverse(),width,height):d;
  return <g key={p.id+(isDraft?'-draft':'')} className={`map-path map-path-${p.kind}`}>
   {selected===p.id&&<path d={d} fill="none" stroke="#e3b341" strokeOpacity={.8} strokeWidth={w+u*3} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none"/>}
   {look.halo&&<path d={d} fill="none" stroke={style.look.halo} strokeOpacity={.35} strokeWidth={w*3} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none"/>}
   {p.name&&!isDraft&&<path id={pid} d={textD} fill="none" stroke="none"/>}<path d={d} fill="none" stroke={color} strokeWidth={w} strokeDasharray={look.dash?look.dash.split(' ').map(n=>+n*w*2).join(' '):undefined} strokeLinecap="round" strokeLinejoin="round" opacity={isDraft?.7:1} pointerEvents="none"/>
   {onSelect&&!isDraft&&<path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(w*4,u*6)} strokeLinecap="round" role="button" aria-label={`${p.kind==='river'?'River':p.kind==='road'?'Road':'Border'}${p.name?' '+p.name:''}`} style={{cursor:'pointer'}} onClick={e=>{e.stopPropagation();onSelect(p.id);}}/>}
   {p.name&&!isDraft&&<text fontSize={u*(p.kind==='river'?4.2:3.8)*style.size} fontFamily={style.font} fontStyle="italic" fill={color} stroke={style.look.halo} strokeWidth={u*1.1} paintOrder="stroke" dy={-w*1.4} pointerEvents="none" letterSpacing={u*.4}><textPath href={`#${pid}`} startOffset="50%" textAnchor="middle">{p.name}</textPath></text>}
  </g>;};
 return <g className="map-paths">{['border','river','road'].flatMap(k=>paths.filter(p=>p.kind===k).map(p=>one(p)))}{draft&&one(draft,true)}</g>;
}
/** Names written across the map. */
export function MapLabels({labels,width,height,selected,onSelect,style=painted0}:{labels:MapLabel[];width:number;height:number;selected?:string;onSelect?:(id:string)=>void;style?:Style}){
 const u=Math.min(width,height)/100;
 return <g className="map-labels">{labels.map(l=>{const size={small:2.2,medium:3.2,large:4.6}[l.size]*u*style.size,large=l.size==='large';
  return <text key={l.id} x={l.x*width} y={l.y*height} textAnchor="middle" dominantBaseline="middle" fontSize={size} fontFamily={style.font} fontStyle={large?'normal':'italic'} letterSpacing={large?size*.28:size*.04} fill={style.look.label} fillOpacity={.88} stroke={selected===l.id?'#e3b341':style.look.halo} strokeOpacity={selected===l.id?1:.7} strokeWidth={size*(selected===l.id?.3:.18)} paintOrder="stroke" role={onSelect?'button':undefined} aria-label={onSelect?`Label ${l.text}`:undefined} style={onSelect?{cursor:'pointer'}:undefined} pointerEvents={onSelect?'auto':'none'} onClick={onSelect?e=>{e.stopPropagation();onSelect(l.id);}:undefined}>{large?l.text.toUpperCase():l.text}</text>;})}</g>;
}
/** The symbol for a kind of place. */
export function PlaceSymbol({kind,x,y,r,selected}:{kind:NonNullable<MapPin['kind']>;x:number;y:number;r:number;selected:boolean}){
 const ink=selected?'#b7673e':'#2f2b24',paper='#fffdf6',sw=r*.16;
 switch(kind){
  case 'city':return <g transform={`translate(${x} ${y})`}><path d={`M${-r} ${r*.7}V${-r*.35}H${-r*.55}V${-r*.75}H${-r*.15}V${-r*.35}H${r*.15}V${-r*.75}H${r*.55}V${-r*.35}H${r}V${r*.7}Z`} fill={paper} stroke={ink} strokeWidth={sw} strokeLinejoin="round"/><path d={`M${-r*.25} ${r*.7}V${r*.15}H${r*.25}V${r*.7}`} fill={ink}/></g>;
  case 'castle':return <g transform={`translate(${x} ${y})`}><path d={`M${-r*.8} ${r*.7}V${-r*.2}H${-r*.4}V${-r*.9}H${r*.4}V${-r*.2}H${r*.8}V${r*.7}Z`} fill={paper} stroke={ink} strokeWidth={sw} strokeLinejoin="round"/><path d={`M${-r*.4} ${-r*.9}V${-r*1.15}M${r*.4} ${-r*.9}V${-r*1.15}M0 ${-r*.9}V${-r*1.4}l${r*.4} ${r*.12}l${-r*.4} ${r*.12}`} stroke={ink} strokeWidth={sw} fill="none"/></g>;
  case 'town':return <g><circle cx={x} cy={y} r={r*.62} fill={paper} stroke={ink} strokeWidth={sw}/><circle cx={x} cy={y} r={r*.24} fill={ink}/></g>;
  case 'village':return <circle cx={x} cy={y} r={r*.42} fill={ink} stroke={paper} strokeWidth={sw}/>;
  case 'dungeon':return <g transform={`translate(${x} ${y})`}><path d={`M${-r*.8} ${r*.6}V0a${r*.8} ${r*.8} 0 0 1 ${r*1.6} 0V${r*.6}Z`} fill="#2b2622" stroke={paper} strokeWidth={sw*.8}/><path d={`M${-r*.3} ${r*.6}V${r*.1}a${r*.3} ${r*.3} 0 0 1 ${r*.6} 0V${r*.6}`} fill="#c9a24a"/></g>;
  case 'ruin':return <g transform={`translate(${x} ${y})`}><path d={`M${-r*.9} ${r*.6}H${r*.9}`} stroke={ink} strokeWidth={sw*1.4}/><path d={`M${-r*.6} ${r*.6}V${-r*.4}M0 ${r*.6}V${-r*.8}M${r*.6} ${r*.6}V0`} stroke={ink} strokeWidth={sw*1.6} strokeLinecap="round"/></g>;
  case 'landmark':return <path transform={`translate(${x} ${y}) scale(${r/9})`} d="M0 -9 2.6 -2.9 9 -2.4 4.2 1.9 5.6 8.6 0 5.2 -5.6 8.6 -4.2 1.9 -9 -2.4 -2.6 -2.9z" fill="#e3b341" stroke={ink} strokeWidth={1.4}/>;
  case 'camp':return <g transform={`translate(${x} ${y})`}><path d={`M${-r*.85} ${r*.6}L0 ${-r*.8}L${r*.85} ${r*.6}Z`} fill={paper} stroke={ink} strokeWidth={sw} strokeLinejoin="round"/><path d={`M0 ${-r*.8}L${-r*.2} ${r*.6}H${r*.2}Z`} fill={ink}/></g>;
 }
}
/** Hex crawl marks: cells with notes, the party and its trail, the walk being planned, and the selected cell. */
function CrawlLayer({map,selectedCell,route}:{map:MapData;selectedCell?:number;route?:number[]}){
 const first=cellShape(map,0),u=Math.min(first.w,first.h),sw=Math.max(1.2,u*.06),party=map.party;
 const centre=(i:number)=>{const c=cellShape(map,i);return `${c.x},${c.y}`;};
 return <g className="map-crawl" pointerEvents="none">
  {map.hexes?.map(h=>{const c=cellShape(map,h.cell);return <circle key={h.cell} cx={c.x+c.w*.26} cy={c.y-c.h*.2} r={u*.075} fill="#b7673e" stroke="#fffdf6" strokeWidth={u*.025}><title>{h.title||'Notes'}</title></circle>;})}
  {party&&party.trail.length>0&&<polyline points={[...party.trail,party.cell].map(centre).join(' ')} fill="none" stroke="#a33a3a" strokeWidth={sw*1.3} strokeDasharray={`0.1 ${sw*2.6}`} strokeLinecap="round" strokeLinejoin="round"/>}
  {party&&!!route?.length&&<polyline points={[party.cell,...route].map(centre).join(' ')} fill="none" stroke="#a33a3a" strokeWidth={sw} strokeDasharray={`${sw*3} ${sw*2}`} strokeOpacity={.65}/>}
  {selectedCell!==undefined&&selectedCell>=0&&<polygon points={cellShape(map,selectedCell).points} fill="#e3b341" fillOpacity={.16} stroke="#d39a1c" strokeWidth={sw*1.3}/>}
  {party&&(()=>{const c=cellShape(map,party.cell);return <g aria-label="Party"><circle cx={c.x} cy={c.y} r={u*.3} fill="#fffdf6" fillOpacity={.55} stroke="#a33a3a" strokeWidth={sw*1.7}/><circle cx={c.x} cy={c.y} r={u*.09} fill="#a33a3a"/></g>;})()}
 </g>;
}
/** The frame, title cartouche and legend a map style adds. */
function MapDecor({map,width,height,style,paint}:{map:MapData;width:number;height:number;style:Style;paint:MapPaint|null}){
 const look=style.look,u=Math.min(width,height)/100,title=map.mapStyle?.title?.trim(),items=map.mapStyle?.legend?legendItems(map,paint):[];
 if(!look.frame&&!title&&!items.length)return null;
 const row=u*3.4,lw=u*26,lh=u*4.6+items.length*row;
 return <g className="map-decor" pointerEvents="none">
  {look.frame&&<><rect x={u*.8} y={u*.8} width={width-u*1.6} height={height-u*1.6} fill="none" stroke={look.ink} strokeWidth={u*.45}/><rect x={u*1.6} y={u*1.6} width={width-u*3.2} height={height-u*3.2} fill="none" stroke={look.ink} strokeWidth={u*.15}/></>}
  {title&&<g><rect x={width/2-Math.min(width*.4,title.length*u*2.4+u*8)/2} y={u*3} width={Math.min(width*.4,title.length*u*2.4+u*8)} height={u*8} rx={u*.6} fill={look.halo} fillOpacity={.88} stroke={look.ink} strokeWidth={u*.2}/><text x={width/2} y={u*8.4} textAnchor="middle" fontFamily={style.font} fontStyle="italic" fontSize={u*4.4*style.size} fill={look.label}>{title}</text></g>}
  {!!items.length&&<g transform={`translate(${u*3} ${u*3+(title&&width<lw*3.2?u*10:0)})`} aria-label="Legend">
   <rect width={lw} height={lh} rx={u*.6} fill={look.halo} fillOpacity={.9} stroke={look.ink} strokeOpacity={.6} strokeWidth={u*.15}/>
   <text x={u*1.6} y={u*3} fontFamily={style.font} fontSize={u*2.2} fontWeight="600" fill={look.label}>Legend</text>
   {items.map((it,i)=>{const y=u*4.6+i*row,cy=y+row/2;return <g key={it.kind+it.id}>
    {it.kind==='terrain'?<><rect x={u*1.6} y={cy-u*1.1} width={u*3.2} height={u*2.2} rx={u*.3} fill={it.color} stroke={look.ink} strokeOpacity={.4} strokeWidth={u*.1}/>{it.id==='2'&&<Glyph g={{kind:'tree',x:u*3.2,y:cy-u*.2,size:u*.9}} look={look}/>}{it.id==='3'&&<Glyph g={{kind:'hill',x:u*3.2,y:cy+u*.3,size:u*1.3}} look={look}/>}{(it.id==='4'||it.id==='7')&&<Glyph g={{kind:it.id==='7'?'snowpeak':'mountain',x:u*3.2,y:cy+u*.1,size:u*1.1}} look={look}/>}{it.id==='6'&&<Glyph g={{kind:'marsh',x:u*3.2,y:cy,size:u*1.3}} look={look}/>}</>
     :it.kind==='place'?<PlaceSymbol kind={it.id as NonNullable<MapPin['kind']>} x={u*3.2} y={cy} r={u*1.2} selected={false}/>
     :<path d={`M${u*1.6} ${cy}h${u*3.2}`} stroke={look[it.id as 'river'|'road'|'border']} strokeWidth={u*(it.id==='river'?.5:.4)} strokeDasharray={it.id==='road'?`${u*.6} ${u*.4}`:it.id==='border'?`${u*.15} ${u*.45}`:undefined} strokeLinecap="round"/>}
    <text x={u*6.4} y={cy+u*.75} fontFamily="Inter, system-ui, sans-serif" fontSize={u*2} fill={look.label}>{it.name}</text></g>;})}
  </g>}
 </g>;
}
export type PaintBrush={radius:number;onStroke:(x:number,y:number,start:boolean)=>void;onEnd:()=>void};
export function MapCanvas({map,imageUrl,onCell,onPlace,onPin,selectedPin,thumbnail=false,fogMode='gm',onStrokeStart,fogEditing=false,paint:livePaint,brush:paintBrush,show,selectedItem,onItem,draft,selectedCell,route}:{map:MapData;imageUrl?:string;onCell?:(i:number)=>void;onPlace?:(x:number,y:number)=>void;onPin?:(id:string)=>void;selectedPin?:string;thumbnail?:boolean;fogMode?:'gm'|'player';onStrokeStart?:()=>void;fogEditing?:boolean;paint?:MapPaint;brush?:PaintBrush;show?:{art?:boolean;pins?:boolean;routes?:boolean;paths?:boolean;labels?:boolean};selectedItem?:string;onItem?:(id:string)=>void;draft?:MapPath|null;selectedCell?:number;route?:number[]}){
 const maskId=useId().replace(/:/g,''),drawing=useRef(false),lastCell=useRef(-1),[hover,setHover]=useState<{x:number;y:number}|null>(null);
 const terrainPaint=livePaint??cachedPaint(map);
 const showPins=show?.pins!==false,showRoutes=show?.routes!==false;
 const size=mapSize(map);const count=map.columns*map.rows;const click=(event:MouseEvent<SVGSVGElement>)=>{if(!onPlace)return;const r=event.currentTarget.getBoundingClientRect();onPlace(Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(event.clientY-r.top)/r.height)));};
 const brush=(event:React.PointerEvent<SVGSVGElement>)=>{const r=event.currentTarget.getBoundingClientRect(),i=pointCell(map,(event.clientX-r.left)/r.width,(event.clientY-r.top)/r.height);if(i>=0&&i!==lastCell.current){lastCell.current=i;onCell?.(i);}};
 const point=(e:React.PointerEvent<SVGSVGElement>)=>{const r=e.currentTarget.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};};
 const style=mapLookOf(map),look=style.look;
 const fog=map.fog?.enabled,all=map.fog?.revealed.length===count,soft=fogMode==='player'&&!thumbnail,painted=map.source==='generated'&&!!terrainPaint;
 return <svg className="map-canvas" viewBox={`0 0 ${size.width} ${size.height}`} style={{aspectRatio:`${size.width}/${size.height}`}} aria-label={thumbnail?'Map preview':'Map canvas'} role={onCell||onPlace||(onPin&&map.pins.length)?'group':'img'} onClick={click}
 onPointerDown={paintBrush?e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();drawing.current=true;e.currentTarget.setPointerCapture(e.pointerId);const p=point(e);paintBrush.onStroke(p.x,p.y,true);}:onCell?e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();drawing.current=true;lastCell.current=-1;onStrokeStart?.();e.currentTarget.setPointerCapture(e.pointerId);brush(e);}:undefined}
 onPointerMove={paintBrush?e=>{const p=point(e);setHover(p);if(drawing.current)paintBrush.onStroke(p.x,p.y,false);}:onCell?e=>{if(drawing.current)brush(e);}:undefined}
 onPointerLeave={paintBrush?()=>setHover(null):undefined}
 onPointerUp={e=>{const was=drawing.current;drawing.current=false;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);if(was)paintBrush?.onEnd();}}
 onPointerCancel={()=>{const was=drawing.current;drawing.current=false;if(was)paintBrush?.onEnd();}}>
 <defs><mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={size.width} height={size.height}><rect width={size.width} height={size.height} fill="white"/>{all?<rect width={size.width} height={size.height} fill="black"/>:<g filter={soft?`url(#${maskId}-soft)`:undefined}>{map.fog?.revealed.map(i=><polygon key={i} points={cellShape(map,i).points} fill="black" stroke="black" strokeWidth={soft?cellShape(map,0).w*.3:0}/>)}</g>}</mask>{soft&&<><filter id={`${maskId}-soft`} filterUnits="userSpaceOnUse" x={-size.width*.1} y={-size.height*.1} width={size.width*1.2} height={size.height*1.2}><feGaussianBlur stdDeviation={cellShape(map,0).w*.2}/></filter><pattern id={`${maskId}-hatch`} width={size.width/90} height={size.width/90} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d={`M0 0V${size.width/90}`} stroke="#ffffff" strokeOpacity={.4} strokeWidth={size.width/300}/></pattern></>}</defs>
 <rect width={size.width} height={size.height} fill={look.paper}/>
 {map.source==='image'&&imageUrl&&<image href={imageUrl} width={size.width} height={size.height} preserveAspectRatio="none"/>}
 {painted&&<TerrainArt paint={terrainPaint!} look={look} uid={maskId} width={size.width} height={size.height} glyphs={!thumbnail&&show?.art!==false}/>}
 {(map.grid!=='none'||onCell||(map.coordinates&&!thumbnail))&&Array.from({length:count},(_,i)=>{const cell=cellShape(map,i),terrain=map.tiles[i]??1,coord=`${String(i%map.columns+1).padStart(2,'0')}.${String(Math.floor(i/map.columns)+1).padStart(2,'0')}`,name=terrains[terrain].name;
 return <g key={i} role={onCell?'button':undefined} tabIndex={onCell?0:undefined} aria-label={onCell?`${map.grid==='hex'?'Hex':'Cell'} ${coord} ${fogEditing?(map.fog?.revealed.includes(i)?'Revealed':'Hidden'):name}`:undefined} aria-pressed={fogEditing?map.fog?.revealed.includes(i):undefined} onClick={onCell?e=>e.stopPropagation():undefined} onKeyDown={onCell?e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onStrokeStart?.();onCell(i);}}:undefined}>
 <polygon points={cell.points} fill="transparent" stroke="#253f3b" strokeOpacity={map.grid==='none'?(onCell?.16:0):.28} strokeWidth={Math.max(size.width/1200,.6)}/>
 {map.coordinates&&!thumbnail&&<text x={cell.x} y={cell.y+cell.h*.36} textAnchor="middle" fontSize={Math.min(cell.w*.18,12)} fill="#283e38" opacity={.7} pointerEvents="none">{coord}</text>}
 </g>;})}
 {!thumbnail&&showRoutes&&map.routes?.map(route=><polyline key={route.id} aria-label={`Route ${route.name}`} points={route.stops.map(id=>map.pins.find(p=>p.id===id)).filter(p=>!!p).map(p=>`${p.x*size.width},${p.y*size.height}`).join(' ')} fill="none" stroke="#d08245" strokeWidth={Math.max(2,size.width/350)} strokeDasharray="8 5" pointerEvents="none"><title>{route.name} · {route.distances.reduce((a,b)=>a+b,0).toFixed(1)} {route.unit}</title></polyline>)}
 {!thumbnail&&show?.paths!==false&&(!!map.paths?.length||!!draft)&&<MapPaths paths={map.paths??[]} width={size.width} height={size.height} prefix={maskId} selected={selectedItem} onSelect={onItem} draft={draft} style={style}/>}
 {!thumbnail&&show?.labels!==false&&!!map.labels?.length&&<MapLabels labels={map.labels} width={size.width} height={size.height} selected={selectedItem} onSelect={onItem} style={style}/>}
 {fog&&(soft?<g mask={`url(#${maskId})`} pointerEvents="none"><rect width={size.width} height={size.height} fill="#d9d3c3"/><rect width={size.width} height={size.height} fill={`url(#${maskId}-hatch)`}/></g>:<rect width={size.width} height={size.height} fill="#24312e" opacity={fogMode==='gm'?.58:1} mask={`url(#${maskId})`} pointerEvents="none"/>)}
 {!thumbnail&&map.grid!=='none'&&(!!map.hexes?.length||!!map.party||(selectedCell??-1)>=0)&&<CrawlLayer map={map} selectedCell={selectedCell} route={route}/>}
 {!thumbnail&&(map.compass||map.scaleBar)&&<>{map.scaleBar&&<ScaleBar map={map} width={size.width} height={size.height} ink={look.ink} paper={look.halo}/>}{map.compass&&<Compass x={size.width-Math.min(size.width,size.height)*.08} y={size.height-Math.min(size.width,size.height)*.09} r={Math.min(size.width,size.height)*.045} ink={look.ink} paper={look.halo}/>}</>}
 {!thumbnail&&<MapDecor map={map} width={size.width} height={size.height} style={style} paint={painted?terrainPaint:null}/>}
 {!thumbnail&&showPins&&map.pins.map((pin,i)=>{const x=pin.x*size.width,y=pin.y*size.height,r=size.width/90;return <g key={pin.id} role={onPin?'button':undefined} tabIndex={onPin?0:undefined} aria-label={`Pin ${pin.title}`} className="map-pin" onClick={e=>{e.stopPropagation();onPin?.(pin.id);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onPin?.(pin.id);}}}>
 {pin.kind?<><circle cx={x} cy={y} r={r*1.2} fill="transparent"/><PlaceSymbol kind={pin.kind} x={x} y={y} r={pin.kind==='city'||pin.kind==='castle'?r*1.05:r*.9} selected={selectedPin===pin.id}/></>:<><circle cx={x} cy={y} r={r} fill={selectedPin===pin.id?'#b7673e':'#344f43'} stroke="#fff9e9" strokeWidth={r*.18}/><text x={x} y={y+r*.34} textAnchor="middle" fill="white" fontSize={r} pointerEvents="none">{i+1}</text></>}<text x={x} y={y-r*1.6} textAnchor={pin.x>.8?'end':pin.x<.2?'start':'middle'} fontSize={(pin.kind==='city'?r*1.4:r*1.05)*style.size} fontFamily={pin.kind?style.font:undefined} fill={look===mapLooks.painted?'#263e34':look.label} stroke={look===mapLooks.painted?'#fff9e9':look.halo} strokeWidth={r*.22} paintOrder="stroke" fontWeight={pin.kind&&pin.kind!=='city'?'500':'600'} pointerEvents="none">{pin.title}</text>
 </g>;})}
 {paintBrush&&hover&&paintBrush.radius>0&&<g pointerEvents="none"><circle cx={hover.x*size.width} cy={hover.y*size.height} r={paintBrush.radius*size.width} fill="none" stroke="#ffffff" strokeWidth={Math.max(2,size.width/500)}/><circle cx={hover.x*size.width} cy={hover.y*size.height} r={paintBrush.radius*size.width} fill="none" stroke="#16191c" strokeWidth={Math.max(1,size.width/1000)} strokeDasharray={`${size.width/160} ${size.width/160}`}/></g>}
 </svg>;
}
export function ReadOnlyMap({map,playerToken,onOpen,campaignId,calendars=[]}:{map:MapData;campaignId?:string;calendars?:Calendar[];playerToken?:string;onOpen?:(id:string)=>void}){
 const {url,error}=useMapImage(map,playerToken),[selected,setSelected]=useState(''),[cell,setCell]=useState(-1);const pin=map.pins.find(p=>p.id===selected),note=map.hexes?.find(h=>h.cell===cell);
 return <div className="map-reader">{map.fog?.enabled&&<p className="map-tool-hint">Unexplored areas remain hidden. Your GM reveals the map as you explore.</p>}{error&&<p className="info-note">{error}</p>}<div className="map-exploration"><MapViewport map={map}><MapCanvas map={map} imageUrl={url} selectedPin={selected} onPin={id=>{setSelected(id);setCell(-1);}} onPlace={map.hexes?.length?(x,y)=>{setSelected('');setCell(pointCell(map,x,y));}:undefined} selectedCell={note?cell:undefined} fogMode="player"/></MapViewport><MapWeather pin={pin} campaignId={campaignId} calendars={calendars}/></div>{!!map.routes?.length&&<ul className="shared-routes">{map.routes.map(r=><li key={r.id}><strong>{r.name}</strong> · {r.distances.reduce((a,b)=>a+b,0).toFixed(1)} {r.unit} · {r.stops.map(id=>map.pins.find(p=>p.id===id)?.title).join(' → ')}</li>)}</ul>}{note&&!pin&&<div className="pin-readout"><h3>{note.title||`${map.grid==='hex'?'Hex':'Square'} ${String(cell%map.columns+1).padStart(2,'0')}.${String(Math.floor(cell/map.columns)+1).padStart(2,'0')}`}</h3>{note.notes&&<p>{note.notes}</p>}{note.exploredOn&&<small>Explored on {note.exploredOn}</small>}</div>}{pin&&<div className="pin-readout"><h3>{pin.title}</h3><p>{pin.notes||'No notes for this location.'}</p>{pin.entryId&&onOpen&&<button className="text-button" onClick={()=>onOpen(pin.entryId!)}>Open linked article →</button>}</div>}</div>;
}
