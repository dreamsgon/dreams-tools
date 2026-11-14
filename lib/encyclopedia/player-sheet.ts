/*
 * A signed-in member linking, refreshing and rolling from their own character's Google Sheet, on the player pages.
 * "Their character" is a character page their Who can edit lets them edit (lib/members.ts pageRights). Everything
 * here is a narrow change to that one page's `character.sheet`, applied to the stored workspace by the routes; the
 * rights are checked again on every call. Server side only (it keys who linked a sheet with a hash).
 *
 * A member can set, refresh or remove a sheet only when the page has none or they linked it themselves. A sheet the
 * GM linked stays the GM's. Players never receive the spreadsheet id, link, cells or tab: the member who linked a
 * sheet gets its open link, which is the one exception.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { clipRows, playerSheet, refreshSheet, sheetOpenUrl, sheetSchema, type Sheet, type SheetTab } from './sheet-link.ts';
import { sheetRollGroups } from './sheet-rolls.ts';
import { defaultCharacter, visibleEntries, workspaceSchema, type Entry, type Workspace } from './world-model.ts';
import type { Rights } from './player-edit.ts';

export class PlayerSheetError extends Error {
  status: number;
  constructor(message: string, status = 403) { super(message); this.status = status; }
}
const no = (message: string, status = 403): never => { throw new PlayerSheetError(message, status); };

/** Who linked a sheet, as a keyed hash that is the same for one person in one campaign and reveals nothing. */
export const linkerKey = (owner: string, campaignId: string, userId: string) => createHash('sha256').update(`sheet-linker\n${owner}\n${campaignId}\n${userId}`).digest('hex').slice(0, 32);

function character(s: Workspace, campaignId: string, rights: Rights, entryId: string): Entry {
  const c = s.campaigns.find(x => x.id === campaignId) ?? no('This campaign is gone.', 404);
  if (!rights.edit.has(entryId)) no('You can’t change this character. Ask your GM.');
  const e = visibleEntries(s, c.worldId, c.id).find(x => x.id === entryId) ?? no('That page is gone.', 404);
  return e.kind === 'character' ? e : no('Only a character page has a character sheet.');
}
/** The page's sheet when this member may change it: none yet, or one they linked. */
function mineOrNone(e: Entry, linker: string): Sheet | undefined {
  const sheet = e.character?.sheet;
  if (sheet && sheet.linkedById !== linker) no('Your GM linked this character’s sheet. Ask your GM to change it.');
  return sheet;
}
const put = (s: Workspace, next: Entry) => {
  const parsed = workspaceSchema.safeParse({ ...s, entries: s.entries.map(e => e.id === next.id ? next : e) });
  return parsed.success ? parsed.data : no(parsed.error.issues[0]?.message ?? 'That change would break the page.', 400);
};
const withSheet = (e: Entry, sheet: Sheet | undefined, now: Date): Entry => {
  const { sheet: _old, ...rest } = e.character ?? defaultCharacter();
  void _old;
  return { ...e, character: sheet ? { ...rest, sheet } : rest, updatedAt: now.toISOString() };
};

/** Whether the member sees the sheet on this page: the GM shared the stats, or they linked it themselves. */
export const memberSeesSheet = (e: Pick<Entry, 'character'>, linker: string) => !!e.character?.sheet && (e.character.statsVisibility === 'players' || e.character.sheet.linkedById === linker);

export type SheetState = { /** They may link, refresh and unlink here. */ canLink: boolean; mine: boolean; hasSheet: boolean; /** Whether the rolls are theirs to make on the server (they see the sheet). */ canRoll: boolean; /** Only for the person who linked it. */ open?: string };
/** Per character page a member may edit: what they can do with its sheet. Nothing about anyone else's pages. */
export function sheetStates(s: Workspace, campaignId: string, rights: Rights, linker: string): Record<string, SheetState> {
  const c = s.campaigns.find(x => x.id === campaignId), out: Record<string, SheetState> = {};
  if (!c) return out;
  for (const e of visibleEntries(s, c.worldId, c.id)) {
    if (e.kind !== 'character' || !rights.edit.has(e.id)) continue;
    const sheet = e.character?.sheet, mine = !!sheet && sheet.linkedById === linker, open = mine && sheet ? sheetOpenUrl(sheet) : null;
    out[e.id] = { canLink: !sheet || mine, mine, hasSheet: !!sheet, canRoll: memberSeesSheet(e, linker), ...(open ? { open } : {}) };
  }
  return out;
}

/** Links (or replaces) the member's own sheet on a page. The input is the client's sheet; the linker is set here. */
export function linkSheet(s: Workspace, campaignId: string, rights: Rights, linker: string, who: { name: string }, input: { entryId: string; sheet: unknown }, now = new Date()) {
  const e = character(s, campaignId, rights, input.entryId);
  mineOrNone(e, linker);
  const parsed = sheetSchema.safeParse(input.sheet);
  if (!parsed.success) return no(parsed.error.issues[0]?.message ?? 'That sheet can’t be saved.', 400);
  if (!parsed.data.items.length) no('Pick at least one cell or row to read.', 400);
  const sheet: Sheet = { ...parsed.data, linkedBy: who.name.trim().slice(0, 100) || 'A player', linkedById: linker, readAt: now.toISOString(), writeBack: false };
  return put(s, withSheet(e, sheet, now));
}

/** The link to read again on the server, for a published sheet the member linked. Google sheets are read in the member's browser. */
export function publishedLinkOf(s: Workspace, campaignId: string, rights: Rights, linker: string, entryId: string): string | null {
  const sheet = mineOrNone(character(s, campaignId, rights, entryId), linker) ?? no('There is no sheet to refresh.', 404);
  return sheet.source === 'published' ? sheet.publishedUrl ?? null : null;
}

export const tabsSchema = z.array(z.object({ name: z.string().max(100), gid: z.string().max(20).optional(), rows: z.array(z.array(z.string().max(2000)).max(40)).max(201) })).max(12);
/** Tabs the browser read from Google, cut to what a read is allowed to hold. */
export const cleanTabs = (tabs: z.infer<typeof tabsSchema>): SheetTab[] => tabs.map(t => ({ name: t.name, ...(t.gid ? { gid: t.gid } : {}), rows: clipRows(t.rows) }));

/** The member's sheet with fresh values from tabs that were just read. */
export function refreshOwnSheet(s: Workspace, campaignId: string, rights: Rights, linker: string, entryId: string, tabs: SheetTab[], now = new Date()) {
  const e = character(s, campaignId, rights, entryId), sheet = mineOrNone(e, linker) ?? no('There is no sheet to refresh.', 404);
  let fresh: ReturnType<typeof refreshSheet>;
  try { fresh = refreshSheet(sheet, tabs, now.toISOString()); }
  catch (err) { return no(err instanceof Error ? err.message : 'Could not read that sheet again.', 400); }
  return { data: put(s, withSheet(e, fresh.sheet, now)), missing: fresh.missing };
}

export function unlinkSheet(s: Workspace, campaignId: string, rights: Rights, linker: string, entryId: string, now = new Date()) {
  const e = character(s, campaignId, rights, entryId);
  if (!mineOrNone(e, linker)) no('There is no sheet to unlink.', 404);
  return put(s, withSheet(e, undefined, now));
}

/**
 * The roll a member asked for, found in the stored sheet: the page's own name and the roll's name and formula.
 * Only rolls the member can see (the sheet is shared with them, or theirs) on a page they may edit.
 */
export function rollOf(s: Workspace, campaignId: string, rights: Rights, linker: string, entryId: string, itemId: string) {
  const e = character(s, campaignId, rights, entryId);
  if (!memberSeesSheet(e, linker)) no('There is no sheet you can roll from here.', 404);
  const shown = playerSheet(e.character!.sheet!);
  for (const g of sheetRollGroups(shown)) for (const r of g.rows) for (const b of r.buttons) if (b.itemId === itemId) return { character: e.title, name: b.rollName, formula: b.formula };
  return no('That roll is not on the sheet.', 404);
}
