/*
 * Players writing in a quest's Log. A signed-in member may add to the log of a quest they can read on the player
 * pages, and change or remove only the entries they wrote. Their entries are always shared with the table, carry
 * their name and a keyed hash of who they are (never sent back to players), and change nothing else in the workspace.
 */
import { z } from 'zod';
import { playerCampaign, newId, type Workspace } from './world-model.ts';
import { newQuest } from './quests.ts';
import { PlayerSheetError } from './player-sheet.ts';
import type { Rights } from './player-edit.ts';

const playerLogText = z.string().trim().min(1, 'Write something first.').max(2000, 'Keep a log entry under 2,000 characters.');
function cleanText(text: string) {
  const r = playerLogText.safeParse(text);
  if (!r.success) throw new PlayerSheetError(r.error.issues[0]?.message ?? 'That entry isn’t valid.', 400);
  return r.data;
}
const MAX_LOG = 500;

/** The quest, when this member can read it on the player pages; refused otherwise. */
function readableQuest(data: Workspace, campaignId: string, rights: Rights, linker: string, entryId: string) {
  const seen = playerCampaign(data, campaignId, rights.edit, linker).entries.some(e => e.id === entryId && e.quest);
  const entry = data.entries.find(e => e.id === entryId && e.kind === 'quest');
  if (!seen || !entry) throw new PlayerSheetError('You can’t write in this quest’s log. The GM may have stopped sharing it.', 403);
  return entry;
}
const withLog = (data: Workspace, entryId: string, change: (log: ReturnType<typeof newQuest>['log']) => ReturnType<typeof newQuest>['log']): Workspace =>
  ({ ...data, entries: data.entries.map(e => e.id === entryId ? { ...e, quest: { ...(e.quest ?? newQuest()), log: change((e.quest ?? newQuest()).log) } } : e) });
function ownEntry(data: Workspace, entryId: string, logId: string, linker: string) {
  const l = (data.entries.find(e => e.id === entryId)?.quest?.log ?? []).find(x => x.id === logId);
  if (!l) throw new PlayerSheetError('That log entry is gone.', 404);
  if (l.authorId !== linker) throw new PlayerSheetError('You can only change your own log entries.', 403);
  return l;
}

/** Adds a member's entry. The log keeps its newest-first order, like the GM's entries. */
export function addPlayerLog(data: Workspace, campaignId: string, rights: Rights, linker: string, who: { name: string }, entryId: string, text: string, now = new Date()): Workspace {
  const entry = readableQuest(data, campaignId, rights, linker, entryId), body = cleanText(text);
  if ((entry.quest?.log.length ?? 0) >= MAX_LOG) throw new PlayerSheetError('This quest’s log is full. Ask your GM to tidy it.', 409);
  const author = who.name.replace(/\s+/g, ' ').trim().slice(0, 80) || 'A player';
  return withLog(data, entryId, log => [{ id: newId(), at: now.toISOString(), text: body, players: true, author, authorId: linker }, ...log]);
}
/** Rewrites one of the member's own entries. */
export function editPlayerLog(data: Workspace, campaignId: string, rights: Rights, linker: string, entryId: string, logId: string, text: string, now = new Date()): Workspace {
  readableQuest(data, campaignId, rights, linker, entryId); ownEntry(data, entryId, logId, linker);
  const body = cleanText(text);
  return withLog(data, entryId, log => log.map(l => l.id === logId ? { ...l, text: body, editedAt: now.toISOString() } : l));
}
/** Removes one of the member's own entries. */
export function removePlayerLog(data: Workspace, campaignId: string, rights: Rights, linker: string, entryId: string, logId: string): Workspace {
  readableQuest(data, campaignId, rights, linker, entryId); ownEntry(data, entryId, logId, linker);
  return withLog(data, entryId, log => log.filter(l => l.id !== logId));
}
