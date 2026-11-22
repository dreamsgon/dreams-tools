/**
 * Loading and saving the Wiki from the browser. A big Wiki is handed over through storage both ways
 * (lib/transfers.ts): a load answers with a download address, and a save over 3 MB is staged first.
 */
import { readJsonResponse, stageTransfer } from '../transfer-client.ts';
export const INLINE_SAVE_LIMIT = 3_000_000;
/** A workspace response's body, fetched from storage when the server handed it over that way. */
export const workspaceBody = <T>(response: Response, request: typeof fetch = fetch) => readJsonResponse<T>(response, request);
/** PUTs a save, staging it in storage first when it is too big to send directly. */
export async function putWorkspace(url: string, body: unknown, request: typeof fetch = fetch) {
  const payload = JSON.stringify(body), blob = new Blob([payload], { type: 'application/json' });
  const sent = blob.size > INLINE_SAVE_LIMIT ? JSON.stringify({ transferId: await stageTransfer(blob, 'workspace', request) }) : payload;
  return request(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: sent });
}
