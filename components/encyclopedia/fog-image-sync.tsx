'use client';
import {useEffect,useRef,useState} from 'react';
import {cellShape,fogBasis,fogImageReady,type MapData} from '@/lib/encyclopedia/map-model';
import type {Workspace} from '@/lib/encyclopedia/world-model';
import {uploadMapImage} from './map-transfer';

// Generate a separate raster containing only explored pixels. Never send the original to players.
export async function renderFogImage(map:MapData,signal?:AbortSignal){
 const response=await fetch('/api/encyclopedia/map-images?id='+encodeURIComponent(map.imageId!),{signal});
 if(!response.ok)throw new Error('The original map image is unavailable. Restore its map package first.');
 const bitmap=await createImageBitmap(await response.blob());
 try{
  const scale=Math.min(1,1400/Math.max(map.imageWidth,map.imageHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(map.imageWidth*scale));canvas.height=Math.max(1,Math.round(map.imageHeight*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Image rendering is unavailable in this browser.');
  ctx.fillStyle='#24312e';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.scale(canvas.width/map.imageWidth,canvas.height/map.imageHeight);ctx.beginPath();
  if(map.fog!.revealed.length===map.columns*map.rows)ctx.rect(0,0,map.imageWidth,map.imageHeight);
  else for(const i of map.fog!.revealed){const points=cellShape(map,i).points.split(' ').map(v=>v.split(',').map(Number));ctx.moveTo(points[0][0],points[0][1]);for(const [x,y] of points.slice(1))ctx.lineTo(x,y);ctx.closePath();}
  ctx.clip();ctx.drawImage(bitmap,0,0,map.imageWidth,map.imageHeight);
  return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not prepare player map.')),'image/png'));
 }finally{bitmap.close();}
}
export function FogImageSync({data,change}:{data:Workspace;change:(value:Workspace)=>void}){
 const current=useRef({data,change});current.current={data,change};
 const [error,setError]=useState(''),[retry,setRetry]=useState(0);
 const candidates=data.entries.filter(e=>e.mapData?.source==='image'&&e.mapData.fog?.enabled&&e.mapData.fog.revealed.length&&!fogImageReady(e.mapData));
 const pending=candidates[0],basis=pending?fogBasis(pending.mapData!):'',id=pending?.id;
 useEffect(()=>{
  setError('');if(!id)return;let cancelled=false;const controller=new AbortController();
  const timer=setTimeout(async()=>{try{
   const entry=current.current.data.entries.find(e=>e.id===id);if(!entry?.mapData||fogBasis(entry.mapData)!==basis)return;
   const blob=await renderFogImage(entry.mapData,controller.signal);if(cancelled)return;
   const image=await uploadMapImage(blob);if(cancelled)return;
   const latest=current.current.data,found=latest.entries.find(e=>e.id===id);
   if(!found?.mapData?.fog?.enabled||fogBasis(found.mapData)!==basis)return;
   current.current.change({...latest,entries:latest.entries.map(e=>e.id===id?{...e,mapData:{...e.mapData!,fog:{...e.mapData!.fog!,previewImageId:image.imageId,previewBasis:basis}}}:e)});
  }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Could not prepare player map.');}},450);
  return()=>{cancelled=true;clearTimeout(timer);controller.abort();};
 },[id,basis,retry]);
 return error?<div className="error-banner" role="alert"><div><strong>Player map image needs attention.</strong> {error} The image stays hidden until it is ready.</div><button onClick={()=>setRetry(v=>v+1)}>Retry player image</button></div>:pending?<div className="fog-sync-status" role="status">Preparing player-safe map image…</div>:null;
}
