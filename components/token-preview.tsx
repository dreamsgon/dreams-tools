import type { Token, Workspace } from "@/lib/model";

export default function TokenPreview({token,workspace,image,borderSrc}: {
  token:Token;workspace:Workspace;image?:{src:string;width:number;height:number};borderSrc?:string;
}) {
  const portrait=image??workspace.assets.find(a=>a.id===token.assetId);
  const frame=borderSrc??workspace.assets.find(a=>a.id===token.borderAssetId)?.src;
  return <div className="token-composite-preview" role="img" aria-label="Token and border preview">
    <div className="token-preview-clip" style={{background:token.color}}>
      {portrait?<img alt="" src={portrait.src} style={{position:"absolute",maxWidth:"none",width:`${Math.max(1,portrait.width/portrait.height)*100}%`,height:`${Math.max(1,portrait.height/portrait.width)*100}%`,left:`${50+(token.imageOffsetX??0)*100}%`,top:`${50+(token.imageOffsetY??0)*100}%`,transform:`translate(-50%, -50%) rotate(${token.imageRotation??0}deg) scale(${token.imageZoom??1})`}}/>:<span style={{color:token.textColor??"#ffffff"}}>{token.name}</span>}
    </div>
    {frame?<img className="token-preview-frame" alt="Custom border" src={frame}/>:<div className="token-preview-ring" style={{border:`${token.borderWidth??4}px solid ${token.borderColor??token.color}`}}/>}
  </div>;
}
