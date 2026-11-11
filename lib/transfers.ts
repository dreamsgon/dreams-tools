import type { S3Bucket } from './storage.ts';

export const INLINE_LIMIT = 3_000_000;
export const imageTypes = ['image/png', 'image/jpeg', 'image/webp'];
export const limits = { image: 20 * 1024 * 1024, discord: 9 * 1024 * 1024, workspace: 50_000_000 };
export type Purpose = keyof typeof limits;
export function transferKey(prefix: string, purpose: Purpose, id: unknown) {
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) throw Error('Invalid transfer ID.');
  return `transfers/${prefix}${purpose}/${id}`;
}
export function createTransfer(bucket: S3Bucket, prefix: string, data: { purpose: Purpose; type: string; size: number }) {
  if (!Object.hasOwn(limits, data.purpose) || !Number.isSafeInteger(data.size) || data.size < 1 || data.size > limits[data.purpose]) throw Error('Invalid transfer purpose or size.');
  if (data.purpose === 'workspace' ? data.type !== 'application/json' : !imageTypes.includes(data.type)) throw Error('Unsupported transfer type.');
  const id = crypto.randomUUID();
  return { id, ...bucket.uploadForm(transferKey(prefix, data.purpose, id), data.type, data.size) };
}
export async function readTransfer(bucket: S3Bucket, prefix: string, purpose: Purpose, id: unknown) {
  const key = transferKey(prefix, purpose, id);
  const object = await bucket.get(key);
  if (!object) throw Error('Upload is missing or expired. Try again.');
  const type = object.httpMetadata.contentType;
  if (object.size < 1 || object.size > limits[purpose] || (purpose === 'workspace' ? type !== 'application/json' : !imageTypes.includes(type))) {
    await object.body?.cancel();
    throw Error('Invalid uploaded file.');
  }
  const bytes = await object.arrayBuffer();
  if (bytes.byteLength !== object.size || bytes.byteLength > limits[purpose]) throw Error('Invalid uploaded size.');
  return { key, type, bytes };
}
export async function workspaceBody(request: Request, bucket: S3Bucket, prefix: string) {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > INLINE_LIMIT) throw Error('Use a staged transfer for large workspace saves.');
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object') throw Error('Invalid workspace request.');
  if (!Object.hasOwn(data, 'transferId')) return data;
  const transfer = await readTransfer(bucket, prefix, 'workspace', data.transferId);
  const value = JSON.parse(new TextDecoder().decode(transfer.bytes));
  // Best-effort cleanup; lifecycle expiry handles abandoned transfers too.
  await bucket.delete(transfer.key).catch(() => {});
  return value;
}
export async function storedJson(bucket: S3Bucket, prefix: string, value: unknown, init: ResponseInit = {}) {
  const text = JSON.stringify(value);
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Content-Type', 'application/json');
  if (new TextEncoder().encode(text).length <= INLINE_LIMIT) return new Response(text, { ...init, headers });
  const key = `transfers/${prefix}downloads/${crypto.randomUUID()}.json`;
  await bucket.put(key, text, { httpMetadata: { contentType: 'application/json' } });
  return Response.json({ downloadUrl: await bucket.signedGet(key) }, { ...init, headers });
}
