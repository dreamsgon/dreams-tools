import { AwsClient } from 'aws4fetch';
import { createHmac } from 'node:crypto';
import type { Bucket, ObjectInfo, PutOptions, StoredObject } from './storage-types.ts';

export type StorageConfig = { bucket: string; region: string; prefix: string; accessKeyId: string; secretAccessKey: string; sessionToken?: string };
export function storageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const { MAPTABLE_S3_BUCKET: bucket, MAPTABLE_AWS_REGION: region, MAPTABLE_AWS_ACCESS_KEY_ID: accessKeyId, MAPTABLE_AWS_SECRET_ACCESS_KEY: secretAccessKey } = env;
  if (!bucket || !region || !accessKeyId || !secretAccessKey) throw Error('Map storage is not configured. Set the S3 environment variables from DEPLOY_VERCEL.md.');
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) || !/^[a-z]{2}(?:-[a-z]+)+-\d$/.test(region)) throw Error('Invalid map storage bucket or region. Use a bucket name without dots.');
  const prefix = (env.MAPTABLE_S3_PREFIX || 'maptable').replace(/^\/+|\/+$/g, '');
  validateKey(prefix);
  return { bucket, region, prefix, accessKeyId, secretAccessKey, sessionToken: env.MAPTABLE_AWS_SESSION_TOKEN };
}
export function validateKey(key: string) {
  if (!key || key.length > 1024 || key.startsWith('/') || /[\x00-\x1f\\]/.test(key) || key.split('/').some(p => !p || p === '.' || p === '..')) throw Error('Invalid storage key.');
}
const etag = (response: Response) => {
  const value = response.headers.get('etag');
  if (!value) throw Error('Storage did not return a revision.');
  return value.replace(/^"|"$/g, '');
};
function info(response: Response): ObjectInfo {
  return { etag: etag(response), size: Number(response.headers.get('content-length') || 0), httpMetadata: { contentType: response.headers.get('content-type') || 'application/octet-stream' } };
}
export class S3Bucket implements Bucket {
  private aws: AwsClient;
  readonly config: StorageConfig;
  private fetchImpl?: typeof fetch;
  constructor(config: StorageConfig, fetchImpl?: typeof fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
    this.aws = new AwsClient({ ...config, service: 's3' });
  }
  objectKey(key: string) { validateKey(key); return `${this.config.prefix}/${key}`; }
  objectUrl(key: string) {
    return `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${this.objectKey(key).split('/').map(encodeURIComponent).join('/')}`;
  }
  private async request(key: string, init: RequestInit = {}) {
    const signed = await this.aws.sign(this.objectUrl(key), { ...init, redirect: 'error', cache: 'no-store' });
    const response = await (this.fetchImpl || fetch)(signed);
    if (!response.ok && ![404, 409, 412].includes(response.status)) throw Error(`Map storage request failed (${response.status}). Check the bucket's region and IAM permissions.`);
    return response;
  }
  async get(key: string): Promise<StoredObject | null> {
    const response = await this.request(key);
    if (response.status === 404) return null;
    if (!response.ok) throw Error('Storage read failed.');
    return { ...info(response), body: response.body, json: <T>() => response.json() as Promise<T>, arrayBuffer: () => response.arrayBuffer() };
  }
  async head(key: string): Promise<ObjectInfo | null> {
    const response = await this.request(key, { method: 'HEAD' });
    if (response.status === 404) return null;
    if (!response.ok) throw Error('Storage metadata read failed.');
    return info(response);
  }
  async put(key: string, body: string | ArrayBuffer | Uint8Array, options: PutOptions = {}) {
    const headers = new Headers({ 'Content-Type': options.httpMetadata?.contentType || 'application/json', 'Cache-Control': 'private, no-store' });
    // Signing wraps the body in a Request stream. Node otherwise sends ordinary
    // chunked transfer encoding, which S3 PutObject does not accept.
    headers.set('Content-Length', String(typeof body === 'string' ? Buffer.byteLength(body, 'utf8') : body.byteLength));
    if (options.onlyIf?.etagMatches) headers.set('If-Match', `"${options.onlyIf.etagMatches}"`);
    if (options.onlyIf?.etagDoesNotMatch) headers.set('If-None-Match', options.onlyIf.etagDoesNotMatch);
    const response = await this.request(key, { method: 'PUT', headers, body: body as BodyInit });
    // Never retry a conditional failure as an unconditional write.
    if (response.status === 409 || response.status === 412) return null;
    if (!response.ok) throw Error('Storage write failed.');
    return { etag: etag(response) };
  }
  async delete(key: string) {
    const response = await this.request(key, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) throw Error('Storage deletion failed.');
  }
  async signedGet(key: string) {
    const url = new URL(this.objectUrl(key));
    url.searchParams.set('X-Amz-Expires', '300');
    const request = await this.aws.sign(url.toString(), { method: 'GET', aws: { signQuery: true } });
    return request.url;
  }
  /** S3 enforces the exact object key, MIME type, and byte count in this policy. */
  uploadForm(key: string, contentType: string, size: number, now = new Date()) {
    if (!Number.isSafeInteger(size) || size < 1 || size > 50_000_000) throw Error('Invalid upload size.');
    const date = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const day = date.slice(0, 8), scope = `${day}/${this.config.region}/s3/aws4_request`;
    const fields: Record<string, string> = { key: this.objectKey(key), 'Content-Type': contentType, 'Cache-Control': 'private, no-store', 'x-amz-algorithm': 'AWS4-HMAC-SHA256', 'x-amz-credential': `${this.config.accessKeyId}/${scope}`, 'x-amz-date': date, success_action_status: '204' };
    if (this.config.sessionToken) fields['x-amz-security-token'] = this.config.sessionToken;
    const policy = Buffer.from(JSON.stringify({ expiration: new Date(now.getTime() + 300_000).toISOString(), conditions: [{ bucket: this.config.bucket }, ...Object.entries(fields).map(([k, v]) => ({ [k]: v })), ['content-length-range', size, size]] })).toString('base64');
    const hmac = (key: string | Buffer, value: string) => createHmac('sha256', key).update(value).digest();
    const signing = hmac(hmac(hmac(hmac(`AWS4${this.config.secretAccessKey}`, day), this.config.region), 's3'), 'aws4_request');
    return { url: `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/`, fields: { ...fields, policy, 'x-amz-signature': hmac(signing, policy).toString('hex') } };
  }
}
export const getBucket = () => new S3Bucket(storageConfig());

