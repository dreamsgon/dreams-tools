/** No account cookies or campaign bearer tokens are forwarded to storage. */
export async function readJsonResponse<T>(response: Response, request: typeof fetch = fetch): Promise<T> {
  const value = await response.json();
  if (response.ok && typeof value?.downloadUrl === 'string') {
    const url = new URL(value.downloadUrl);
    if (url.protocol !== 'https:' || url.username || url.password) throw Error('Invalid download address.');
    const download = await request(url.toString(), { credentials: 'omit', cache: 'no-store', redirect: 'error' });
    if (!download.ok) throw Error('Download expired or failed. Reload and try again.');
    return download.json();
  }
  return value;
}
export async function stageTransfer(blob: Blob, purpose: 'image' | 'discord' | 'workspace', request: typeof fetch = fetch) {
  const response = await request('/api/transfers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purpose, type: blob.type, size: blob.size }) });
  const transfer = await response.json();
  if (!response.ok) throw Error(transfer.error || 'Could not prepare upload.');
  const form = new FormData();
  for (const [key, value] of Object.entries(transfer.fields)) form.set(key, String(value));
  form.set('file', blob, 'upload');
  const uploaded = await request(transfer.url, { method: 'POST', body: form, credentials: 'omit', redirect: 'error' });
  if (!uploaded.ok) throw Error('Storage upload failed. Check the bucket CORS configuration and try again.');
  return transfer.id as string;
}
