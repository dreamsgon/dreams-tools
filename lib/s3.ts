import { AwsClient } from "aws4fetch";
type Config = {
  MAPTABLE_AWS_ACCESS_KEY_ID?: string;
  MAPTABLE_AWS_SECRET_ACCESS_KEY?: string;
  MAPTABLE_AWS_SESSION_TOKEN?: string;
  MAPTABLE_AWS_REGION?: string;
  S3_BUCKET?: string;
  S3_PREFIX?: string;
};
const config = () => process.env as Config;
export function s3Configured() {
  const c = config();
  return Boolean(
    c.MAPTABLE_AWS_ACCESS_KEY_ID &&
    c.MAPTABLE_AWS_SECRET_ACCESS_KEY &&
    c.MAPTABLE_AWS_REGION &&
    c.S3_BUCKET,
  );
}
function s3Target(key: string, userPrefix: string) {
  const c = config();
  if (!s3Configured())
    throw new Error(
      "S3 is not configured. Add bucket settings and AWS credentials in server environment variables.",
    );
  if (
    !key ||
    key.length > 1024 ||
    key.split("/").some((x) => x === ".." || x === ".") ||
    key.startsWith("/") ||
    /[\x00-\x1f\\]/.test(key)
  )
    throw new Error(
      "Use a valid object key relative to the configured prefix.",
    );
  if (
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(c.S3_BUCKET!) ||
    !/^[a-z]{2}(?:-[a-z]+)+-\d$/.test(c.MAPTABLE_AWS_REGION!)
  )
    throw new Error("Invalid bucket name or AWS region.");
  const prefix = (c.S3_PREFIX || "maptable/").replace(/^\/+|\/+$/g, "");
  const path = [...(prefix ? prefix.split("/") : []), ...userPrefix.replace(/\/$/, "").split("/"), ...key.split("/")]
    .map(encodeURIComponent)
    .join("/");
  const aws = new AwsClient({
    accessKeyId: c.MAPTABLE_AWS_ACCESS_KEY_ID!,
    secretAccessKey: c.MAPTABLE_AWS_SECRET_ACCESS_KEY!,
    sessionToken: c.MAPTABLE_AWS_SESSION_TOKEN,
    region: c.MAPTABLE_AWS_REGION,
    service: "s3",
  });
  return { aws, url: `https://s3.${c.MAPTABLE_AWS_REGION}.amazonaws.com/${c.S3_BUCKET}/${path}` };
}
export async function s3Request(key: string, userPrefix: string, init: RequestInit = {}) {
  const {aws,url}=s3Target(key,userPrefix);
  return aws.fetch(url,{...init,redirect:"error",cache:"no-store"});
}
export async function s3SignedGet(key: string, userPrefix: string) {
  const {aws,url}=s3Target(key,userPrefix),target=new URL(url);
  target.searchParams.set("X-Amz-Expires","300");
  return (await aws.sign(target.toString(),{method:"GET",aws:{signQuery:true}})).url;
}
