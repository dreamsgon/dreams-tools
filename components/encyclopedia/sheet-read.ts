/** Client helpers that read a linked Google Sheet into grids: the signed-in way (in the browser) and the published-link way (through our server). */
import { GRID_RANGE, googleToken, pickSpreadsheet, readSheetInfo, readTabs } from '@/lib/encyclopedia/google-client';
import { refreshRanges, type Sheet, type SheetTab } from '@/lib/encyclopedia/sheet-link';

export type SheetRead = {
  source: 'google' | 'published'; spreadsheetId?: string; publishedUrl?: string; title: string; tabs: SheetTab[];
  /** Single-cell named ranges (Google only), offered as one-click adds. */
  named: { label: string; cell: string }[];
};

/** Reads a published link on our server (the GM must be signed in). */
export async function readPublished(link: string): Promise<SheetRead> {
  let res: Response;
  try { res = await fetch('/api/encyclopedia/sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'read', link }) }); }
  catch { throw new Error("Couldn't reach RPG Tools. Check your connection and try again."); }
  const body = await res.json().catch(() => null) as { error?: string; title?: string; url?: string; tabs?: SheetTab[] } | null;
  if (!res.ok || !body?.tabs) throw new Error(body?.error ?? 'Could not read that sheet.');
  return { source: 'published', publishedUrl: body.url, title: body.title ?? 'Published sheet', tabs: body.tabs, named: [] };
}

/** Every tab of a Google sheet (the first 12) with its named ranges. */
export async function readGoogle(id: string, token: string): Promise<SheetRead> {
  const info = await readSheetInfo(id, token);
  const tabs = await readTabs(id, token, info.tabs.slice(0, 12).map(t => ({ name: t.name, range: GRID_RANGE })));
  return { source: 'google', spreadsheetId: id, title: info.title, tabs, named: info.named.map(n => ({ label: n.label, cell: n.cell })) };
}

/** Sign in, let the person pick one spreadsheet in Google's own picker, and read it. Null when they close the picker. */
export async function pickAndReadGoogle(): Promise<SheetRead | null> {
  const token = await googleToken();
  const picked = await pickSpreadsheet(token);
  return picked ? readGoogle(picked.id, token) : null;
}

/** The linked sheet's tabs again, for Refresh and Change cells. Google asks for a sign-in when the token has ended. */
export async function readLinked(sheet: Sheet): Promise<SheetTab[]> {
  if (sheet.source === 'published') return (await readPublished(sheet.publishedUrl ?? '')).tabs;
  const token = await googleToken();
  return readTabs(sheet.spreadsheetId ?? '', token, refreshRanges(sheet));
}
/** The whole linked sheet, to change which cells are read. */
export async function reopenLinked(sheet: Sheet): Promise<SheetRead> {
  if (sheet.source === 'published') return readPublished(sheet.publishedUrl ?? '');
  return readGoogle(sheet.spreadsheetId ?? '', await googleToken());
}
