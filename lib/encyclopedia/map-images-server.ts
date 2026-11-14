import {getBucket} from '../storage';
import {readTransfer} from '../transfers';
import {imageIdSchema,imageType,MAX_IMAGE_BYTES} from './map-model';
import {EncyclopediaStore,encyclopediaPrefix} from './store';
const key=(owner:string,id:string)=>encyclopediaPrefix(owner)+'images/'+imageIdSchema.parse(id);
export async function saveMapImage(owner:string,bytes:Uint8Array){
 const type=imageType(bytes);if(!type||bytes.byteLength>MAX_IMAGE_BYTES)throw Error('Use a PNG, JPEG, or WebP image up to 8 MB.');
 const id=crypto.randomUUID();await getBucket().put(key(owner,id),bytes,{httpMetadata:{contentType:type}});return {id,type};
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
export async function readImageUpload(request:Request,owner:string){
 const text=await request.text();if(text.length>2048)throw Error('Use a direct image transfer.');
 const {transferId}=JSON.parse(text),bucket=getBucket();
 const transfer=await readTransfer(bucket,`users/${encodeURIComponent(owner)}/`,'image',transferId);
 if(transfer.bytes.byteLength>MAX_IMAGE_BYTES)throw Error('Choose an image up to 8 MB.');
 await bucket.delete(transfer.key).catch(()=>{});
 return new Uint8Array(transfer.bytes);
}
export function imageResponse(object:{url:string}){return new Response(null,{status:303,headers:{Location:object.url,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});}
