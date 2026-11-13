/*
 * The AI activity log: one list per campaign of what AI connections changed, newest first, with what
 * each change replaced so the GM can undo it. Also holds the campaign's "paused" switch.
 */
import type { S3Bucket } from "../storage.ts";
import { stable } from "../stable-json.ts";
export { stable };
import { encyclopediaPrefix } from "../encyclopedia/store.ts";
import type { Entry, Workspace } from "../encyclopedia/world-model.ts";
import type { TablePart } from "./table.ts";

/** One page as it was before the change (null: the AI made it), and a fingerprint of it after (null: removed). */
export type PageChange = { id: string; title: string; before: Entry | null; after: string | null };
/** Where a suggested move would put a token, so Maptable can show it on the map. */
export type MovePreview = { sceneId: string; tokenId: string; x: number; y: number };
export type ActivityEntry = {
  id: string; at: string; connection: string; connectionId: string | null; tool: string;
  summary: string; detail?: string; changes?: PageChange[]; table?: TablePart[]; undone?: string;
  /** A suggestion waiting for the GM's OK: the tool and arguments to run when it is approved. */
  waiting?: { args: Record<string, unknown>; preview?: MovePreview };
  /** What the GM did with a suggestion, and what came of it. Decided suggestions leave the panel. */
  decided?: "approved" | "skipped"; result?: string;
};
export type ActivityLog = { paused: boolean; entries: ActivityEntry[] };

export const ACTIVITY_LIMIT = 200;
const path = (owner: string, campaignId: string) => encyclopediaPrefix(owner) + `ai-activity/${encodeURIComponent(campaignId)}.json`;

/** A short fingerprint of a page (FNV-1a, two lanes). */
export function fingerprint(e: Entry): string {
  const s = stable(e);
  let a = 0x811c9dc5, b = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 2246822519); }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

/** The pages a change added, changed or removed. */
export function pageChanges(before: Workspace, after: Workspace): PageChange[] {
  const old = new Map(before.entries.map(e => [e.id, e])), now = new Map(after.entries.map(e => [e.id, e]));
  const out: PageChange[] = [];
  for (const [id, e] of now) { const was = old.get(id); if (!was || stable(was) !== stable(e)) out.push({ id, title: e.title, before: was ?? null, after: fingerprint(e) }); }
  for (const [id, e] of old) if (!now.has(id)) out.push({ id, title: e.title, before: e, after: null });
  return out;
}

/**
 * Puts the pages back as they were. A page someone changed since the AI's change is left alone
 * and named in `kept`, so undo never throws away the GM's own later work.
 */
export function undoChanges(full: Workspace, changes: PageChange[]) {
  let entries = full.entries;
  const kept: string[] = [];
  for (const c of changes) {
    const current = entries.find(e => e.id === c.id);
    if ((current ? fingerprint(current) : null) !== c.after) { kept.push(c.title); continue; }
    entries = c.before
      ? (current ? entries.map(e => e.id === c.id ? c.before! : e) : [...entries, c.before])
      : entries.filter(e => e.id !== c.id);
  }
  return { next: { ...full, entries }, kept };
}

export async function readActivity(bucket: S3Bucket, owner: string, campaignId: string): Promise<ActivityLog & { etag: string | null }> {
  const object = await bucket.get(path(owner, campaignId));
  if (!object) return { paused: false, entries: [], etag: null };
  const saved = await object.json<Partial<ActivityLog>>();
  return { paused: saved.paused === true, entries: Array.isArray(saved.entries) ? saved.entries : [], etag: object.etag };
}

/** Changes the log with a compare-and-swap, retrying when two writes meet. */
export async function updateActivity(bucket: S3Bucket, owner: string, campaignId: string, edit: (log: ActivityLog) => ActivityLog) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { etag, ...log } = await readActivity(bucket, owner, campaignId);
    const next = edit(log);
    const body = JSON.stringify({ paused: next.paused, entries: next.entries.slice(0, ACTIVITY_LIMIT) });
    const saved = await bucket.put(path(owner, campaignId), body, { onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json" } });
    if (saved) return next;
  }
  throw Error("The AI activity log is busy. Try again.");
}

export const logActivity = (bucket: S3Bucket, owner: string, campaignId: string, entry: ActivityEntry) =>
  updateActivity(bucket, owner, campaignId, log => ({ ...log, entries: [entry, ...log.entries] }));

/** What the panel shows: suggestions waiting for the GM, then what was done, without the stored copies of pages. */
export const publicActivity = (log: ActivityLog) => ({
  paused: log.paused,
  waiting: log.entries.filter(e => e.waiting && !e.decided).map(e => ({ id: e.id, at: e.at, connection: e.connection, tool: e.tool, summary: e.summary, detail: e.detail, args: e.waiting!.args, preview: e.waiting!.preview })),
  entries: log.entries.filter(e => !e.waiting).map(({ changes, table, ...e }) => ({ ...e, canUndo: !!(changes?.length || table?.length) && !e.undone })),
});
