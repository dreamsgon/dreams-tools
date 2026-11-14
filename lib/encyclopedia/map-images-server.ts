import {getBucket} from '../storage';
import {readTransfer} from '../transfers';
import {imageIdSchema,imageType,MAX_IMAGE_BYTES} from './map-model';
import {EncyclopediaStore,encyclopediaPrefix} from './store';
const key=(owner:string,id:string)=>encyclopediaPrefix(owner)+'images/'+imageIdSchema.parse(id);
export async function saveMapImage(owner:string,bytes:Uint8Array){
 const type=imageType(bytes);if(!type||bytes.byteLength>MAX_IMAGE_BYTES)throw Error('Use a PNG, JPEG, or WebP image up to 8 MB.');
 const id=crypto.randomUUID();await getBucket().put(key(owner,id),bytes,{httpMetadata:{contentType:type}});return {id,type};
}
// A marker in the GM's storage: this picture was added by a co-GM for this campaign, so only that campaign may use it.
const upKey=(owner:string,campaignId:string,id:string)=>encyclopediaPrefix(owner)+'co-gm-uploads/'+encodeURIComponent(campaignId)+'/'+imageIdSchema.parse(id);
export async function markCoGmUpload(owner:string,campaignId:string,id:string){
 await getBucket().put(upKey(owner,campaignId,id),'{}',{httpMetadata:{contentType:'application/json'}});
}
export async function isCoGmUpload(owner:string,campaignId:string,id:string){
 if(!imageIdSchema.safeParse(id).success)return false;
 return !!await getBucket().head(upKey(owner,campaignId,id));
}
export async function readMapImage(owner:string,id:string){
 if(!imageIdSchema.safeParse(id).success)return null;
 const bucket=getBucket(),path=key(owner,id),object=await bucket.head(path);
 return object?{url:await bucket.signedGet(path)}:null;
}
export async function readPlayerMapImage(grant:{owner:string;campaignId:string},id:string){
 if(!imageIdSchema.safeParse(id).success)return null;
 const owner=await new EncyclopediaStore(getBucket()).playerImageOwnerOf(grant,id);
 return owner?readMapImage(owner,id):null;
}
export async function readImageUpload(request:Request,owner:string,transferOwner=owner){
 const text=await request.text();if(text.length>2048)throw Error('Use a direct image transfer.');
 const {transferId}=JSON.parse(text),bucket=getBucket();
 const transfer=await readTransfer(bucket,`users/${encodeURIComponent(transferOwner)}/`,'image',transferId);
 if(transfer.bytes.byteLength>MAX_IMAGE_BYTES)throw Error('Choose an image up to 8 MB.');
 await bucket.delete(transfer.key).catch(()=>{});
 return new Uint8Array(transfer.bytes);
}
export function imageResponse(object:{url:string}){return new Response(null,{status:303,headers:{Location:object.url,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});}
