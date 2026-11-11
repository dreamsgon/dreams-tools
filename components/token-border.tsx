"use client";
import { useEffect, useState } from "react";
import TokenPreview from "./token-preview";
import { uploadAsset } from "@/lib/api";
import { uid, isTokenBorder, collectionPath, type Token, type Workspace } from "@/lib/model";
import { NumberField } from "./dialogs";

export default function TokenBorder({token, workspace, commit, saved=false}: {token:Token; workspace:Workspace; commit:(fn:(w:Workspace)=>void)=>void; saved?:boolean}) {
  const [busy,setBusy]=useState(false), [error,setError]=useState("");
  const [preview,setPreview]=useState<{src:string;assetId?:string}|null>(null);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview.src);},[preview?.src]);
  const patch=(values:Partial<Token>, asset?:Workspace["assets"][number])=>commit(w=>{
    const target=saved?w.tokenLibrary.find(t=>t.id===token.id):w.scenes.flatMap(s=>s.tokens).find(t=>t.id===token.id);
    if(!target)return;
    if(asset)w.assets.push(asset);
    Object.assign(target,values);
  });
  return <div className="token-border-options">
    <TokenPreview token={token} workspace={workspace} borderSrc={preview&&(busy||preview.assetId===token.borderAssetId)?preview.src:undefined}/>
    <NumberField label="Border thickness (px)" min={0} max={50} step={1} value={token.borderWidth??4} onChange={borderWidth=>patch({borderWidth})}/>
    <label>Border from Assets<select disabled={busy} value={token.borderAssetId??""} onChange={e=>{setPreview(null);patch({borderAssetId:e.target.value||null});}}>
      <option value="">Normal colored border</option>
      {workspace.assets.filter(a=>a.id===token.borderAssetId||isTokenBorder(workspace,a.id)).map(a=><option key={a.id} value={a.id}>{workspace.assetLocations[a.id]?`${collectionPath(workspace.assetFolders,workspace.assetLocations[a.id]!)} / `:""}{a.name}</option>)}
    </select></label>
    <label>Custom border (optional)<input type="file" accept="image/png,image/webp" disabled={busy} onChange={async e=>{
      const file=e.target.files?.[0];e.target.value="";if(!file)return;
      setBusy(true);setError("");
      try {
        if(file.size>20*1024*1024)throw new Error("Choose an image smaller than 20 MB.");
        const src=URL.createObjectURL(file);setPreview({src});
        const bitmap=await createImageBitmap(file);
        const width=bitmap.width,height=bitmap.height;bitmap.close();
        if(width>16000||height>16000)throw new Error("Image dimensions must be at most 16,000 pixels.");
        const result=await uploadAsset(file,file.name), id=uid();
        patch({borderAssetId:id},{id,name:file.name,src:result.src,width,height,kind:"border"});
        setPreview({src,assetId:id});
      } catch(err){setPreview(null);setError(err instanceof Error?err.message:"Upload failed.");} finally{setBusy(false);}
    }}/></label>
    <small>{busy?"Uploading border…":"Use a square PNG or WebP with a transparent center. Custom artwork replaces the normal border; thickness controls the normal border."}</small>
    {token.borderAssetId&&<button disabled={busy} onClick={()=>{setPreview(null);patch({borderAssetId:null});}}>Use normal border</button>}
    {error&&<p role="alert">{error}</p>}
  </div>;
}
