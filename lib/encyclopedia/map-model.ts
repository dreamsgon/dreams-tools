import {z} from 'zod';
const id=z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export const terrains=[{name:'Sea',color:'#83afba'},{name:'Grassland',color:'#c0cf9d'},{name:'Forest',color:'#72946f'},{name:'Hills',color:'#adad7f'},{name:'Mountains',color:'#94948a'},{name:'Desert',color:'#dfc38b'},{name:'Marsh',color:'#92ada0'},{name:'Snow',color:'#e3e8df'}] as const;
export const mapKinds={world:'World map',region:'Area map',hex:'Hex crawl'};
export const imageIdSchema=z.string().uuid();
export const weatherLinkSchema=z.object({campaignId:id,calendarId:id,regionId:id});
export const pinSchema=z.object({weatherLinks:z.array(weatherLinkSchema).max(500).optional(),id,title:z.string().trim().min(1).max(160),x:z.number().finite().min(0).max(1),y:z.number().finite().min(0).max(1),notes:z.string().max(3000),entryId:id.nullable(),visibility:z.enum(['gm','players'])});
export const routeSchema=z.object({id,name:z.string().trim().min(1).max(100),unit:z.enum(['mi','km']),stops:z.array(id).min(2).max(20),distances:z.array(z.number().finite().positive().max(1000000)).min(1).max(19),speed:z.number().finite().min(.1).max(10000),hoursPerDay:z.number().finite().min(1).max(24),visibility:z.enum(['gm','players'])}).superRefine((r,ctx)=>{if(r.distances.length!==r.stops.length-1||r.stops.some((s,i)=>i>0&&s===r.stops[i-1]))ctx.addIssue({code:'custom',message:'Routes need a distance for each leg and different adjacent stops.'});});
export type MapRoute=z.infer<typeof routeSchema>;
export const mapSchema=z.object({
 category:z.enum(['world','region','hex']),source:z.enum(['generated','image']),visibility:z.enum(['gm','players']),
 columns:z.number().int().min(6).max(40),rows:z.number().int().min(6).max(30),grid:z.enum(['none','square','hex']),coordinates:z.boolean(),
 tiles:z.array(z.number().int().min(0).max(7)).max(1200),seed:z.string().max(100),preset:z.enum(['blank','island','coast']),
 imageId:imageIdSchema.nullable(),imageWidth:z.number().int().min(1).max(12000),imageHeight:z.number().int().min(1).max(12000),
 pins:z.array(pinSchema).max(100),
 scale:z.object({width:z.number().finite().positive().max(10000000),unit:z.enum(['mi','km'])}).optional(),routes:z.array(routeSchema).max(50).optional(),
 fog:z.object({enabled:z.boolean(),revealed:z.array(z.number().int().min(0).max(1199)).max(1200),previewImageId:imageIdSchema.optional(),previewBasis:z.string().max(16000).optional()}).optional(),
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
  fog:m.fog?{enabled:m.fog.enabled,revealed:[...m.fog.revealed]}:undefined,
  pins:m.pins.filter(p=>p.visibility==='players'&&pointRevealed(m,p.x,p.y))};
}
export function fitMapSize(width:number,height:number,mapWidth:number,mapHeight:number,zoom=1){
 const scale=Math.min(Math.max(1,width)/mapWidth,Math.max(1,height)/mapHeight)*zoom;
 return {width:mapWidth*scale,height:mapHeight*scale};
}
