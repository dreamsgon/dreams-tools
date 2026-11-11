import { context, failure, privateHeaders } from "@/lib/server";
import { s3Request, s3SignedGet } from "@/lib/s3";
export async function GET(request: Request) {
  try {
    const {prefix} = await context();
    const key = new URL(request.url).searchParams.get("key") || "";
    const response = await s3Request(key,prefix,{method:"HEAD"});
    if (!response.ok) throw Error("S3 image could not be opened. Check the object key and bucket permissions.");
    if (!/^image\/(png|jpeg|webp)$/.test((response.headers.get("Content-Type")||"").split(";")[0])) throw Error("S3 object must be a PNG, JPG, or WebP image.");
    return new Response(null,{status:302,headers:{...privateHeaders,Location:await s3SignedGet(key,prefix),"Referrer-Policy":"no-referrer"}});
  } catch (error) { return failure(error); }
}
