import { z } from 'zod';
import { tabSchema, type Entry } from './world-model.ts';

/**
 * Page history is stored beside workspace.json, one file per entry:
 * users/<owner>/encyclopedia/history/<entryId>.json. It never changes the workspace format.
 * Each version is the text of an entry as it was before a later save replaced it.
 */
export const HISTORY_LIMIT = 20;
export const HISTORY_INTERVAL_MS = 10 * 60 * 1000;
export const HISTORY_MAX_BYTES = 4_000_000;
export const versionSchema = z.object({
  at: z.string().max(64),        // when this text was last edited (the entry's updatedAt then)
  savedAt: z.string().max(64),   // when the version was captured
  title: z.string().min(1).max(160),
  body: z.string().max(100000),
  tabs: z.array(tabSchema).max(30).default([]),
});
export const historySchema = z.object({ format: z.literal('encyclopedia-history-v1'), versions: z.array(versionSchema).max(HISTORY_LIMIT) });
export type PageVersion = z.infer<typeof versionSchema>;
export type PageHistory = z.infer<typeof historySchema>;
export type Snapshot = Pick<PageVersion, 'title' | 'body' | 'tabs'>;

export const emptyHistory = (): PageHistory => ({ format: 'encyclopedia-history-v1', versions: [] });
export const snapshotOf = (e: Pick<Entry, 'title' | 'body' | 'tabs'>): Snapshot => ({ title: e.title, body: e.body, tabs: e.tabs ?? [] });
export const sameText = (a: Snapshot, b: Snapshot) => a.title === b.title && a.body === b.body && JSON.stringify(a.tabs) === JSON.stringify(b.tabs);
export const historyEntryId = (id: string) => /^[A-Za-z0-9_-]{1,120}$/.test(id);

/** Entries whose title, text or tabs changed between two saves, and entries that were deleted. */
export function changedEntries(before: Entry[], after: Entry[]) {
  const next = new Map(after.map(e => [e.id, e]));
  const changed: Entry[] = [], deleted: string[] = [];
  for (const old of before) {
    const now = next.get(old.id);
    if (!now) deleted.push(old.id);
    else if (old.kind !== 'folder' && !sameText(snapshotOf(old), snapshotOf(now))) changed.push(old);
  }
  return { changed, deleted };
}

/**
 * Adds the text an entry had before a save. At most one version per interval while someone keeps typing,
 * unless forced (a restore always keeps the text it replaces). Keeps the newest HISTORY_LIMIT versions.
 */
export function addVersion(history: PageHistory, snapshot: Snapshot, at: string, now: Date, force = false): PageHistory {
  const last = history.versions.at(-1);
  if (last && sameText(last, snapshot)) return history;
  if (!force && last && now.getTime() - Date.parse(last.savedAt) < HISTORY_INTERVAL_MS) return history;
  let versions = [...history.versions, { ...snapshot, at, savedAt: now.toISOString() }].slice(-HISTORY_LIMIT);
  while (versions.length > 1 && new TextEncoder().encode(JSON.stringify(versions)).length > HISTORY_MAX_BYTES) versions = versions.slice(1);
  return { format: 'encyclopedia-history-v1', versions };
}

/** A line diff for previews: 'same', 'add' (in the version, not current) and 'remove' (current, not in the version). */
export function lineDiff(current: string, version: string): { kind: 'same' | 'add' | 'remove'; text: string }[] {
  const a = current.split('\n'), b = version.split('\n');
  if (a.length * b.length > 1_500_000) return [...a.map(text => ({ kind: 'remove' as const, text })), ...b.map(text => ({ kind: 'add' as const, text }))];
  const n = a.length, m = b.length, table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const out: { kind: 'same' | 'add' | 'remove'; text: string }[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ kind: 'same', text: a[i] }); i++; j++; }
    else if (table[i + 1][j] >= table[i][j + 1]) out.push({ kind: 'remove', text: a[i++] });
    else out.push({ kind: 'add', text: b[j++] });
  }
  while (i < n) out.push({ kind: 'remove', text: a[i++] });
  while (j < m) out.push({ kind: 'add', text: b[j++] });
  return out;
}
