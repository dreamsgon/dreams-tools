import {z} from 'zod';
const id=z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export const terrains=[{name:'Sea',color:'#83afba'},{name:'Grassland',color:'#c0cf9d'},{name:'Forest',color:'#72946f'},{name:'Hills',color:'#adad7f'},{name:'Mountains',color:'#94948a'},{name:'Desert',color:'#dfc38b'},{name:'Marsh',color:'#92ada0'},{name:'Snow',color:'#e3e8df'}] as const;
export const mapKinds={world:'World map',region:'Area map',hex:'Hex crawl'};
export const imageIdSchema=z.string().uuid();
export const weatherLinkSchema=z.object({campaignId:id,calendarId:id,regionId:id});
/** What a place is, which sets its symbol on the map. Pins without a kind keep the numbered marker. */
export const placeKinds=[{id:'city',name:'City'},{id:'town',name:'Town'},{id:'village',name:'Village'},{id:'castle',name:'Castle'},{id:'dungeon',name:'Dungeon'},{id:'ruin',name:'Ruin'},{id:'landmark',name:'Landmark'},{id:'camp',name:'Camp'}] as const;
export type PlaceKind=typeof placeKinds[number]['id'];
const point=z.object({x:z.number().finite().min(0).max(1),y:z.number().finite().min(0).max(1)});
/** Rivers, roads and borders drawn on the map, with points as fractions of the map size. */
export const pathKinds=[{id:'river',name:'River'},{id:'road',name:'Road'},{id:'border',name:'Border'}] as const;
export const mapPathSchema=z.object({id,kind:z.enum(['river','road','border']),name:z.string().trim().max(100),points:z.array(point).min(2).max(400),visibility:z.enum(['gm','players'])});
export type MapPath=z.infer<typeof mapPathSchema>;
/** Names written on the map itself: seas, regions, mountain ranges. */
export const mapLabelSchema=z.object({id,text:z.string().trim().min(1).max(80),x:z.number().finite().min(0).max(1),y:z.number().finite().min(0).max(1),size:z.enum(['small','medium','large']),visibility:z.enum(['gm','players'])});
export type MapLabel=z.infer<typeof mapLabelSchema>;
export const pinSchema=z.object({kind:z.enum(placeKinds.map(k=>k.id) as [PlaceKind,...PlaceKind[]]).optional(),areaMapId:id.nullable().optional(),weatherLinks:z.array(weatherLinkSchema).max(500).optional(),id,title:z.string().trim().min(1).max(160),x:z.number().finite().min(0).max(1),y:z.number().finite().min(0).max(1),notes:z.string().max(3000),entryId:id.nullable(),visibility:z.enum(['gm','players'])});
export const routeSchema=z.object({id,name:z.string().trim().min(1).max(100),unit:z.enum(['mi','km']),stops:z.array(id).min(2).max(20),distances:z.array(z.number().finite().positive().max(1000000)).min(1).max(19),speed:z.number().finite().min(.1).max(10000),hoursPerDay:z.number().finite().min(1).max(24),visibility:z.enum(['gm','players'])}).superRefine((r,ctx)=>{if(r.distances.length!==r.stops.length-1||r.stops.some((s,i)=>i>0&&s===r.stops[i-1]))ctx.addIssue({code:'custom',message:'Routes need a distance for each leg and different adjacent stops.'});});
export type MapRoute=z.infer<typeof routeSchema>;
const cellIndex=z.number().int().min(0).max(1199);
/** Notes for one hex or square of an area map: what is there and which table to roll for encounters. */
export const hexNoteSchema=z.object({cell:cellIndex,title:z.string().trim().max(100),notes:z.string().max(4000),tableId:id.nullable().optional(),exploredOn:z.string().trim().max(80).optional(),visibility:z.enum(['gm','players'])});
export type HexNote=z.infer<typeof hexNoteSchema>;
/** Where the party is on an area map, the cells they came through, and the travel hours already spent today. */
export const partySchema=z.object({cell:cellIndex,trail:z.array(cellIndex).max(500),hours:z.number().finite().min(0).max(24),visibility:z.enum(['gm','players'])});
export type MapParty=z.infer<typeof partySchema>;
/** Painted terrain: a finer raster than the map's cells, stored as runs of terrain numbers ("<terrain><count in base 36>", joined by dots). */
export const PAINT_MAX={columns:240,rows:180};
export function encodePaint(cells:ArrayLike<number>){const runs:string[]=[];let i=0;while(i<cells.length){let j=i;while(j<cells.length&&cells[j]===cells[i])j++;runs.push(`${cells[i]}${(j-i).toString(36)}`);i=j;}return runs.join('.');}
export function decodePaint(columns:number,rows:number,text:string):Uint8Array|null{
 const total=columns*rows,out=new Uint8Array(total);let at=0;
 for(const run of text.split('.')){const t=run.charCodeAt(0)-48,n=parseInt(run.slice(1),36);if(!(t>=0&&t<=7)||!/^[0-9a-z]+$/.test(run.slice(1))||!(n>0)||at+n>total)return null;out.fill(t,at,at+n);at+=n;}
 return at===total?out:null;
}
export const paintSchema=z.object({columns:z.number().int().min(12).max(PAINT_MAX.columns),rows:z.number().int().min(12).max(PAINT_MAX.rows),cells:z.string().min(2).max(250000).regex(/^[0-7][0-9a-z]+(\.[0-7][0-9a-z]+)*$/)}).superRefine((p,ctx)=>{if(!decodePaint(p.columns,p.rows,p.cells))ctx.addIssue({code:'custom',message:'Painted terrain must cover the whole map'});});
export type MapPaint=z.infer<typeof paintSchema>;
export const mapSchema=z.object({
 category:z.enum(['world','region','hex']),source:z.enum(['generated','image']),visibility:z.enum(['gm','players']),
 columns:z.number().int().min(6).max(40),rows:z.number().int().min(6).max(30),grid:z.enum(['none','square','hex']),coordinates:z.boolean(),
 tiles:z.array(z.number().int().min(0).max(7)).max(1200),seed:z.string().max(100),preset:z.enum(['blank','island','coast']),
 imageId:imageIdSchema.nullable(),imageWidth:z.number().int().min(1).max(12000),imageHeight:z.number().int().min(1).max(12000),
 pins:z.array(pinSchema).max(100),
 scale:z.object({width:z.number().finite().positive().max(10000000),unit:z.enum(['mi','km'])}).optional(),routes:z.array(routeSchema).max(50).optional(),
 fog:z.object({enabled:z.boolean(),revealed:z.array(z.number().int().min(0).max(1199)).max(1200),previewImageId:imageIdSchema.optional(),previewBasis:z.string().max(16000).optional()}).optional(),
 paint:paintSchema.optional(),compass:z.boolean().optional(),scaleBar:z.boolean().optional(),
 paths:z.array(mapPathSchema).max(300).optional(),labels:z.array(mapLabelSchema).max(150).optional(),
 hexes:z.array(hexNoteSchema).max(1200).optional(),party:partySchema.optional(),encounterTableId:id.nullable().optional(),maptableSceneId:z.string().min(1).max(120).optional(),
 mapStyle:z.object({look:z.enum(['painted','atlas','ink']).optional(),font:z.enum(['serif','plain','hand']).optional(),nameSize:z.enum(['small','medium','large']).optional(),legend:z.boolean().optional(),title:z.string().trim().max(100).optional()}).optional(),
}).superRefine((m,ctx)=>{
 const bad=(message:string)=>ctx.addIssue({code:'custom',message});
 if(m.source==='generated'&&m.tiles.length!==m.columns*m.rows)bad('Terrain must match the map dimensions');
 if(m.source==='image'&&!m.imageId)bad('An uploaded map needs an image');
 if(m.fog&&(new Set(m.fog.revealed).size!==m.fog.revealed.length||m.fog.revealed.some(i=>i>=m.columns*m.rows)))bad('Fog cells must be unique and inside the map');
 if(m.fog?.previewImageId&&m.fog.previewImageId===m.imageId)bad('Fog preview must be separate from the original image');
 for(const pin of m.pins)if(new Set((pin.weatherLinks??[]).map(l=>l.campaignId)).size!==(pin.weatherLinks??[]).length)bad('Use one weather region per campaign for each pin');
 if(new Set((m.routes??[]).map(r=>r.id)).size!==(m.routes??[]).length)bad('Route IDs must be unique');
 for(const route of m.routes??[])if(route.stops.some(id=>!m.pins.some(p=>p.id===id)))bad('Every route stop must be a location on this map');
 if(new Set(m.pins.map(p=>p.id)).size!==m.pins.length)bad('Map pin IDs must be unique');
 if(m.paint&&m.source!=='generated')bad('Only drawn terrain can be painted');
 const cells=m.columns*m.rows;
 if(m.hexes&&(new Set(m.hexes.map(h=>h.cell)).size!==m.hexes.length||m.hexes.some(h=>h.cell>=cells)))bad('Hex notes must be unique and inside the map');
 if(m.party&&(m.grid==='none'||m.party.cell>=cells||m.party.trail.some(c=>c>=cells)))bad('The party must stand on a grid cell inside the map');
 if(new Set([...(m.paths??[]).map(p=>p.id),...(m.labels??[]).map(l=>l.id)]).size!==(m.paths?.length??0)+(m.labels?.length??0))bad('Map path and label IDs must be unique');
});
export type MapData=z.infer<typeof mapSchema>;
export type MapPin=z.infer<typeof pinSchema>;
export const MAX_IMAGE_BYTES=8*1024*1024;
export function imageType(bytes:Uint8Array):string|null {
 if(bytes.length<24||bytes.length>MAX_IMAGE_BYTES)return null;
 if([137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)&&String.fromCharCode(...bytes.slice(12,16))==='IHDR'){const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),w=v.getUint32(16),h=v.getUint32(20);return w>0&&h>0&&w<=12000&&h<=12000&&w*h<=40000000?'image/png':null;}
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217)return 'image/jpeg';
 if(String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
 return null;
}
function hash(seed:string){let n=2166136261;for(const ch of seed)n=Math.imul(n^ch.charCodeAt(0),16777619);return n>>>0;}
function noise(x:number,y:number,seed:number){const n=Math.sin(x*127.1+y*311.7+seed*.00001)*43758.5453;return n-Math.floor(n);}
function smoothNoise(x:number,y:number,seed:number){const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);const a=noise(ix,iy,seed)*(1-u)+noise(ix+1,iy,seed)*u,b=noise(ix,iy+1,seed)*(1-u)+noise(ix+1,iy+1,seed)*u;return a*(1-v)+b*v;}
export function generateTerrain(columns:number,rows:number,seed:string,preset:MapData['preset']):number[]{
 if(preset==='blank')return Array(columns*rows).fill(1);
 const n=hash(seed);return Array.from({length:columns*rows},(_,i)=>{const x=i%columns,y=Math.floor(i/columns),nx=x/(columns-1),ny=y/(rows-1);
 const height=.64*smoothNoise(nx*4,ny*4,n)+.23*smoothNoise(nx*9,ny*9,n+100)+.13*smoothNoise(nx*18,ny*18,n+200);
 const edge=preset==='island'?Math.pow(Math.hypot((nx-.5)*1.6,(ny-.5)*1.6),1.5)*.48:nx*.42;
 const h=height-edge,wet=smoothNoise(nx*7,ny*7,n+300);
 if(h<.19)return 0;if(h>.61)return 7;if(h>.53)return 4;if(h>.45)return 3;if(wet>.63)return 2;if(wet<.26)return 5;if(h<.27&&wet>.48)return 6;return 1;
 });
}
/** How many paint squares fit across one map cell. */
export function paintScale(columns:number,rows:number){return Math.max(1,Math.min(6,Math.floor(PAINT_MAX.columns/columns),Math.floor(PAINT_MAX.rows/rows)));}
/** A fast cell lookup for a point given as fractions of the map size; hex maps pick the nearest hex centre. */
export function cellFinder(m:MapData){
 if(m.grid!=='hex')return (x:number,y:number)=>Math.min(m.rows-1,Math.max(0,Math.floor(y*m.rows)))*m.columns+Math.min(m.columns-1,Math.max(0,Math.floor(x*m.columns)));
 const size=mapSize(m),centres=Array.from({length:m.columns*m.rows},(_,i)=>cellShape(m,i)),r=centres[0].h/2;
 const offsetY=centres[0].y-r,offsetX=centres[0].x-centres[0].w/2;
 return (x:number,y:number)=>{const px=x*size.width,py=y*size.height,row=Math.round((py-offsetY-r)/(1.5*r)),col=Math.round((px-offsetX)/centres[0].w-.5);let best=-1,dist=Infinity;
  for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){const rr=row+dr,cc=col+dc;if(rr<0||cc<0||rr>=m.rows||cc>=m.columns)continue;const c=centres[rr*m.columns+cc],d=(c.x-px)**2+(c.y-py)**2;if(d<dist){dist=d;best=rr*m.columns+cc;}}
  return best;};
}
/** Paint from the map's cells, with soft, wobbly edges so coasts and forests don't follow the grid. */
export function paintFromTiles(m:MapData):MapPaint{
 const k=paintScale(m.columns,m.rows),columns=m.columns*k,rows=m.rows*k,n=hash(m.seed||'map'),cell=cellFinder(m),out=new Uint8Array(columns*rows);
 for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const u=(x+.5)/columns,v=(y+.5)/rows;
  const dx=(smoothNoise(u*m.columns*.9,v*m.rows*.9,n+11)-.5)*.9+(smoothNoise(u*m.columns*2.7,v*m.rows*2.7,n+13)-.5)*.35,dy=(smoothNoise(u*m.columns*.9,v*m.rows*.9,n+17)-.5)*.9+(smoothNoise(u*m.columns*2.7,v*m.rows*2.7,n+19)-.5)*.35;
  const i=cell(Math.min(1,Math.max(0,u+dx/m.columns)),Math.min(1,Math.max(0,v+dy/m.rows)));out[y*columns+x]=m.tiles[i]??1;}
 return {columns,rows,cells:encodePaint(out)};
}
/** The terrain the map shows: its own paint, or paint made from its cells. */
export function mapPaint(m:MapData):MapPaint|null{return m.source!=='generated'?null:m.paint??paintFromTiles(m);}
/** Each cell takes the terrain that covers most of it, so cell-based tools keep working on painted maps. */
export function tilesFromPaint(m:MapData,paint:MapPaint):number[]{
 const cells=decodePaint(paint.columns,paint.rows,paint.cells);if(!cells)return m.tiles;
 const cell=cellFinder(m),counts=Array.from({length:m.columns*m.rows},()=>new Array(8).fill(0));
 for(let y=0;y<paint.rows;y++)for(let x=0;x<paint.columns;x++){const i=cell((x+.5)/paint.columns,(y+.5)/paint.rows);if(i>=0)counts[i][cells[y*paint.columns+x]]++;}
 return counts.map((c,i)=>{const most=Math.max(...c);return most?c.indexOf(most):m.tiles[i]??1;});
}
export function newMap(category:MapData['category']='region',preset:MapData['preset']='island',seed='A new world',columns=24,rows=18):MapData{
 return {category,source:'generated',visibility:'gm',columns,rows,grid:category==='hex'?'hex':'none',coordinates:category==='hex',tiles:generateTerrain(columns,rows,seed,preset),seed,preset,imageId:null,imageWidth:1200,imageHeight:800,pins:[]};
}
export function mapSize(m:MapData){return m.source==='image'?{width:m.imageWidth,height:m.imageHeight}:m.grid==='hex'?{width:Math.sqrt(3)*(m.columns+.5)*24,height:(1.5*(m.rows-1)+2)*24}:{width:m.columns*40,height:m.rows*40};}
export function cellShape(m:MapData,index:number){
 const col=index%m.columns,row=Math.floor(index/m.columns),size=mapSize(m);
 if(m.grid!=='hex'){const w=size.width/m.columns,h=size.height/m.rows,x=(col+.5)*w,y=(row+.5)*h;return {x,y,w,h,points:`${x-w/2},${y-h/2} ${x+w/2},${y-h/2} ${x+w/2},${y+h/2} ${x-w/2},${y+h/2}`};}
 const baseW=Math.sqrt(3)*(m.columns+.5),baseH=1.5*(m.rows-1)+2,rx=size.width/baseW,ry=size.height/baseH;
 const r=Math.min(rx,ry),offsetX=(size.width-baseW*r)/2,offsetY=(size.height-baseH*r)/2;
 const x=offsetX+Math.sqrt(3)*(col+.5+(row%2)*.5)*r,y=offsetY+(1+row*1.5)*r;
 const points=Array.from({length:6},(_,i)=>{const a=(60*i-30)*Math.PI/180;return `${x+Math.cos(a)*r},${y+Math.sin(a)*r}`;}).join(' ');
 return {x,y,w:Math.sqrt(3)*r,h:2*r,points};
}
const packageTab=z.object({id,title:z.string().trim().min(1).max(160),body:z.string().max(100000),visibility:z.enum(['gm','players'])});
export const mapPackageSchema=z.object({format:z.literal('ttrpg-map'),version:z.literal(1),title:z.string().trim().min(1).max(160),body:z.string().max(100000),tabs:z.array(packageTab).max(30).optional(),map:mapSchema,image:z.object({mime:z.enum(['image/png','image/jpeg','image/webp']),data:z.string().max(11200000).regex(/^[A-Za-z0-9+/]*={0,2}$/)}).optional()}).superRefine((p,ctx)=>{if(p.map.source==='image'&&!p.image)ctx.addIssue({code:'custom',message:'This map package is missing its image'});});

// Exact source/mask identity, shared by browser rendering and server authorization.
export function fogBasis(m:MapData){return JSON.stringify([1,m.imageId,m.imageWidth,m.imageHeight,m.columns,m.rows,m.grid,[...(m.fog?.revealed??[])].sort((a,b)=>a-b)]);}
export function fogImageReady(m:MapData){return !!m.fog?.previewImageId&&m.fog.previewImageId!==m.imageId&&m.fog.previewBasis===fogBasis(m);}
export function pointCell(m:MapData,x:number,y:number){
 const size=mapSize(m),px=x*size.width,py=y*size.height;
 if(m.grid!=='hex')return Math.min(m.rows-1,Math.max(0,Math.floor(y*m.rows)))*m.columns+Math.min(m.columns-1,Math.max(0,Math.floor(x*m.columns)));
 for(let i=0;i<m.columns*m.rows;i++){const c=cellShape(m,i),dx=Math.abs(px-c.x),dy=Math.abs(py-c.y);if(dx<=c.w/2+1e-7&&dy<=c.h/2-dx/Math.sqrt(3)+1e-7)return i;}
 return -1;
}
export function pointRevealed(m:MapData,x:number,y:number){return !m.fog?.enabled||m.fog.revealed.length===m.columns*m.rows||m.fog.revealed.includes(pointCell(m,x,y));}
export function fogBrush(m:MapData,index:number,radius:number){
 if(index<0||index>=m.columns*m.rows)return [];
 const center=cellShape(m,index);return Array.from({length:m.columns*m.rows},(_,i)=>i).filter(i=>{const c=cellShape(m,i);return Math.hypot((c.x-center.x)/center.w,(c.y-center.y)/center.w)<=radius+.1;});
}
export function playerMap(m:MapData):MapData{
 const fog=m.fog?.enabled,visible=new Set(m.fog?.revealed??[]);
 return {...m,routes:m.routes?.filter(r=>r.visibility==='players'&&(!fog||visible.size===m.columns*m.rows)&&r.stops.every(id=>m.pins.some(p=>p.id===id&&p.visibility==='players'))),seed:fog?'':m.seed,preset:fog?'blank':m.preset,
  imageId:fog?(m.source==='image'&&fogImageReady(m)?m.fog!.previewImageId!:null):m.imageId,
  tiles:fog?m.tiles.map((v,i)=>visible.has(i)?v:0):m.tiles,
  paint:fog&&m.paint?hiddenPaint(m,m.paint,visible):m.paint,
  fog:m.fog?{enabled:m.fog.enabled,revealed:[...m.fog.revealed]}:undefined,
  pins:m.pins.filter(p=>p.visibility==='players'&&pointRevealed(m,p.x,p.y)),
  paths:m.paths?.filter(p=>p.visibility==='players').flatMap(p=>revealedRuns(m,p.points).map((points,i)=>({...p,id:i?`${p.id}-${i}`.slice(0,100):p.id,points}))),
  labels:m.labels?.filter(l=>l.visibility==='players'&&pointRevealed(m,l.x,l.y)),
  hexes:m.hexes?.filter(h=>h.visibility==='players'&&(!fog||visible.has(h.cell))).map(h=>({...h,tableId:undefined})),
  party:m.party?.visibility==='players'&&(!fog||visible.has(m.party.cell))?{...m.party,trail:fog?m.party.trail.filter(c=>visible.has(c)):m.party.trail}:undefined,
  encounterTableId:undefined,maptableSceneId:undefined};
}
/** The parts of a line that lie outside the fog, so players only get what they have seen. */
export function revealedRuns(m:MapData,points:{x:number;y:number}[]){
 if(!m.fog?.enabled||m.fog.revealed.length===m.columns*m.rows)return [points];
 const cell=cellFinder(m),visible=new Set(m.fog.revealed),runs:{x:number;y:number}[][]=[];let run:{x:number;y:number}[]=[];
 for(const p of points){if(visible.has(cell(p.x,p.y)))run.push(p);else{if(run.length>=2)runs.push(run);run=[];}}
 if(run.length>=2)runs.push(run);return runs;
}
/** Paint with every square under fog turned to sea, so players never receive hidden terrain. */
function hiddenPaint(m:MapData,paint:MapPaint,visible:Set<number>):MapPaint{
 if(visible.size===m.columns*m.rows)return paint;
 const cells=decodePaint(paint.columns,paint.rows,paint.cells);if(!cells)return {...paint,cells:encodePaint(new Uint8Array(paint.columns*paint.rows))};
 const cell=cellFinder(m);for(let y=0;y<paint.rows;y++)for(let x=0;x<paint.columns;x++)if(!visible.has(cell((x+.5)/paint.columns,(y+.5)/paint.rows)))cells[y*paint.columns+x]=0;
 return {...paint,cells:encodePaint(cells)};
}
export function fitMapSize(width:number,height:number,mapWidth:number,mapHeight:number,zoom=1){
 const scale=Math.min(Math.max(1,width)/mapWidth,Math.max(1,height)/mapHeight)*zoom;
 return {width:mapWidth*scale,height:mapHeight*scale};
}
