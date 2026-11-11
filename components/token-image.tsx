"use client";
import { useEffect, useState } from "react";
import TokenPreview from "./token-preview";
import { uploadAsset } from "@/lib/api";
import { uid, type Token, type Workspace } from "@/lib/model";

const reset={imageZoom:1,imageOffsetX:0,imageOffsetY:0,imageRotation:0};
export default function TokenImage({token,workspace,commit,saved=false}:{token:Token;workspace:Workspace;commit:(fn:(w:Workspace)=>void)=>void;saved?:boolean}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const [localPreview,setLocalPreview]=useState<{src:string;width:number;height:number;assetId?:string}|null>(null);
  useEffect(()=>()=>{if(localPreview)URL.revokeObjectURL(localPreview.src);},[localPreview?.src]);
  const asset=workspace.assets.find(a=>a.id===token.assetId);
  const preview=localPreview&&(busy||localPreview.assetId===token.assetId)?localPreview:asset;
  const framing=busy?reset:token;
  const patch=(values:Partial<Token>,asset?:Workspace["assets"][number])=>commit(w=>{
    const target=saved?w.tokenLibrary.find(t=>t.id===token.id):w.scenes.flatMap(s=>s.tokens).find(t=>t.id===token.id);
    if(!target)return;if(asset)w.assets.push(asset);Object.assign(target,values);
  });
  return <section className="token-image-options"><h3>Token image</h3>
    {preview&&<TokenPreview token={{...token,...framing}} workspace={workspace} image={preview}/>}
    <label>Choose image<select disabled={busy} value={token.assetId??""} onChange={e=>{setLocalPreview(null);patch({assetId:e.target.value||null,...reset});}}><option value="">No image (text token)</option>{workspace.assets.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
    <label>{busy?"Uploading image…":"Upload / replace image"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={async e=>{
      const file=e.target.files?.[0];e.target.value="";if(!file)return;setBusy(true);setError("");
      try{if(file.size>20*1024*1024)throw new Error("Choose an image smaller than 20 MB.");
        const src=URL.createObjectURL(file);
        setLocalPreview({src,width:1,height:1});
        const bitmap=await createImageBitmap(file);const width=bitmap.width,height=bitmap.height;bitmap.close();
        if(width>16000||height>16000)throw new Error("Image dimensions must be at most 16,000 pixels.");
        setLocalPreview({src,width,height});
        const result=await uploadAsset(file,file.name),id=uid();patch({assetId:id,...reset},{id,name:file.name,src:result.src,width,height});
        setLocalPreview({src,width,height,assetId:id});
      }catch(err){setLocalPreview(null);setError(err instanceof Error?err.message:"Upload failed.");}finally{setBusy(false);}
    }}/></label>
    {asset&&!busy&&<>
      <label>Image zoom ({Math.round((token.imageZoom??1)*100)}%)<input aria-label="Image zoom" type="range" min={0.25} max={5} step={0.01} value={token.imageZoom??1} onChange={e=>patch({imageZoom:Number(e.target.value)})}/></label>
      <label>Image horizontal position<input aria-label="Image horizontal position" type="range" min={-1} max={1} step={0.01} value={token.imageOffsetX??0} onChange={e=>patch({imageOffsetX:Number(e.target.value)})}/></label>
      <label>Image vertical position<input aria-label="Image vertical position" type="range" min={-1} max={1} step={0.01} value={token.imageOffsetY??0} onChange={e=>patch({imageOffsetY:Number(e.target.value)})}/></label>
      <label>Image rotation ({token.imageRotation??0}°)<input aria-label="Image rotation" type="range" min={-180} max={180} step={1} value={token.imageRotation??0} onChange={e=>patch({imageRotation:Number(e.target.value)})}/></label>
      <button onClick={()=>patch(reset)}>Reset image framing</button>
    </>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
