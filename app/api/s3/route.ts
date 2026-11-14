import { context, failure, privateHeaders } from "@/lib/server";
import { s3Request, s3SignedGet } from "@/lib/s3";
import { mapsRequest } from "@/lib/maptable-co-gm-server";
export async function GET(request: Request) {
  try {
    // ?member=<ref>: a co-GM opening a picture in the GM's campaign (lib/maptable-co-gm.ts).
    const params = new URL(request.url).searchParams, ref = params.get("member");
    const grant = ref === null ? null : await mapsRequest(request, ref);
    if (grant instanceof Response) return grant;
    const prefix = grant ? grant.prefix : (await context()).prefix;
    const key = params.get("key") || "";
    const response = await s3Request(key,prefix,{method:"HEAD"});
    if (!response.ok) throw Error("S3 image could not be opened. Check the object key and bucket permissions.");
    if (!/^image\/(png|jpeg|webp)$/.test((response.headers.get("Content-Type")||"").split(";")[0])) throw Error("S3 object must be a PNG, JPG, or WebP image.");
    return new Response(null,{status:302,headers:{...privateHeaders,Location:await s3SignedGet(key,prefix),"Referrer-Policy":"no-referrer"}});
  } catch (error) { return failure(error); }
}
