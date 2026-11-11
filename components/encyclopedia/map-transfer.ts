import {stageTransfer} from "@/lib/transfer-client";
import {unlinkMapWeather} from '@/lib/encyclopedia/map-weather';
import {mapPackageSchema,MAX_IMAGE_BYTES,type MapData} from '@/lib/encyclopedia/map-model';
import type {Entry} from '@/lib/encyclopedia/world-model';
export async function uploadMapImage(file:Blob){
 if(file.size>MAX_IMAGE_BYTES)throw new Error('Choose an image up to 8 MB.');
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Choose a PNG, JPEG, or WebP image.');
 let bitmap:ImageBitmap;try{bitmap=await createImageBitmap(file);}catch{throw new Error('This file could not be opened as an image.');}
 const width=bitmap.width,height=bitmap.height;bitmap.close();
 if(width>12000||height>12000||width*height>40000000)throw new Error('Use an image up to 12,000 pixels per side and 40 megapixels.');
 const response=await fetch('/api/encyclopedia/map-images',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transferId:await stageTransfer(file,'image')})});const result=await response.json() as {id:string;error?:string};if(!response.ok)throw new Error(result.error??'Upload failed');return {imageId:result.id,imageWidth:width,imageHeight:height};
}
export function downloadMapFile(value:unknown,title:string){const url=URL.createObjectURL(new Blob([JSON.stringify(value)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=title.replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,80)+'.map.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export async function exportMapPackage(entry:Entry){
 const map=entry.mapData;if(!map)throw new Error('No map to export');let image:undefined|{mime:string;data:string};
 if(map.source==='image'&&map.imageId){const r=await fetch('/api/encyclopedia/map-images?id='+encodeURIComponent(map.imageId));if(!r.ok)throw new Error('Image unavailable. Replace it before exporting this map.');const blob=await r.blob();const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Could not read map image'));reader.readAsDataURL(blob);});image={mime:blob.type,data};}
 downloadMapFile({format:'ttrpg-map',version:1,title:entry.title,body:entry.body,tabs:entry.tabs??[],map:{...unlinkMapWeather(map),fog:map.fog?{enabled:map.fog.enabled,revealed:map.fog.revealed}:undefined},image},entry.title);
}
export async function importMapPackage(file:File):Promise<{title:string;body:string;tabs:Entry['tabs'];mapData:MapData}>{
 if(file.size>12*1024*1024)throw new Error('Choose a map package smaller than 12 MB.');
 const p=mapPackageSchema.parse(JSON.parse(await file.text()));let mapData=unlinkMapWeather(p.map);
 if(p.image){const bytes=Uint8Array.from(atob(p.image.data),c=>c.charCodeAt(0));const image=await uploadMapImage(new Blob([bytes],{type:p.image.mime}));mapData={...mapData,...image};}
 return {title:p.title,body:p.body,tabs:(p.tabs??[]).map(t=>({...t,visibility:'gm' as const})),mapData:{...mapData,fog:mapData.fog?{enabled:mapData.fog.enabled,revealed:mapData.fog.revealed}:undefined,visibility:'gm',pins:mapData.pins.map(pin=>({...pin,visibility:'gm'}))}};
}
