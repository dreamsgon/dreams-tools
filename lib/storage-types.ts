export type ObjectInfo = { etag: string; size: number; httpMetadata: { contentType: string } };
export type StoredObject = ObjectInfo & {
  body: ReadableStream<Uint8Array> | null;
  json<T = unknown>(): Promise<T>;
  arrayBuffer(): Promise<ArrayBuffer>;
};
export type PutOptions = {
  onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string };
  httpMetadata?: { contentType?: string };
};
export interface Bucket {
  get(key: string): Promise<StoredObject | null>;
  head(key: string): Promise<ObjectInfo | null>;
  put(key: string, body: string | ArrayBuffer | Uint8Array, options?: PutOptions): Promise<{ etag: string } | null>;
}
