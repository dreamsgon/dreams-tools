import { context, failure, privateHeaders } from "@/lib/server";
import { s3Request, s3Configured } from "@/lib/s3";
import { readTransfer, imageTypes } from "@/lib/transfers";
import { mapsRequest } from "@/lib/maptable-co-gm-server";
/**
 * Pictures in Maptable. With ?member=<ref>, a co-GM's: they load from the GM's storage, and pictures the co-GM adds
 * are stored there too, so they load for the GM and the campaign's other co-GMs (lib/maptable-co-gm.ts).
 */
async function where(request: Request) {
  const ref = new URL(request.url).searchParams.get("member");
  if (ref === null) return { ...await context(request.method === "GET" ? undefined : request), ref: null, upload: "" };
  const grant = await mapsRequest(request, ref);
  if (grant instanceof Response) return grant;
  // The upload itself was staged in the co-GM's own storage (/api/transfers).
  const own = await context(request.method === "GET" ? undefined : request);
  return { bucket: own.bucket, prefix: grant.prefix, ref, upload: own.prefix };
}
export async function GET(request: Request) {
  try {
    const at = await where(request);
    if (at instanceof Response) return at;
    const { bucket, prefix } = at;
    const id = new URL(request.url).searchParams.get("id");
    if (!id || !/^[a-f0-9-]{36}$/.test(id)) throw Error("Invalid image ID.");
    const key = prefix + "images/" + id, object = await bucket.head(key);
    if (!object) return new Response("Not found", { status: 404 });
    if (!imageTypes.includes(object.httpMetadata.contentType)) throw Error("Invalid image type.");
    return new Response(null, {status:302,headers:{...privateHeaders,Location:await bucket.signedGet(key),"Referrer-Policy":"no-referrer"}});
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const at = await where(request);
    if (at instanceof Response) return at;
    const { bucket, prefix, ref } = at;
    const text = await request.text();
    if (text.length > 2048) throw Error("Use a direct transfer to upload images.");
    const data = JSON.parse(text);
    const transfer = await readTransfer(bucket,ref?at.upload:prefix,"image",data.transferId);
    const id = crypto.randomUUID();
    let src: string;
    if (data.storage === "s3" && !ref) {
      if (!s3Configured()) throw Error("The optional image bucket is not configured.");
      const key = `uploads/${id}.${transfer.type.split("/")[1]}`;
      const response = await s3Request(key,prefix,{method:"PUT",headers:{"Content-Type":transfer.type,"Cache-Control":"private, no-store"},body:transfer.bytes});
      if (!response.ok) throw Error("S3 upload failed. Check the optional bucket settings and write permission.");
      src = "/api/s3?key=" + encodeURIComponent(key);
    } else {
      await bucket.put(prefix+"images/"+id,transfer.bytes,{httpMetadata:{contentType:transfer.type}});
      src = "/api/assets?id=" + id + (ref ? "&member=" + ref : "");
    }
    await bucket.delete(transfer.key).catch(() => {});
    return Response.json({src},{headers:privateHeaders});
  } catch (error) { return failure(error); }
}
