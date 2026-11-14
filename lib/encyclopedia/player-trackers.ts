/*
 * A signed-in member changing the trackers on a character they may edit (their Who can edit), on the player pages.
 * They see and change only the shown trackers: they can add their own (always shown), rename and reshape them, move
 * their values and remove them. A GM-only tracker is never sent to them and can't be touched from here. Only that one
 * page's `character.trackers` changes; the rights are checked again on every call.
 */
import { addTracker, editTracker, removeTracker, setTrackerValue, TrackerError, type Tracker, type TrackerInput } from './trackers.ts';
import { defaultCharacter, visibleEntries, workspaceSchema, type Entry, type Workspace } from './world-model.ts';
import type { Rights } from './player-edit.ts';

const no = (message: string, status = 403): never => { throw new TrackerError(message, status); };

function ownCharacter(s: Workspace, campaignId: string, rights: Rights, entryId: string): Entry {
  const c = s.campaigns.find(x => x.id === campaignId) ?? no('This campaign is gone.', 404);
  if (!rights.edit.has(entryId)) no('You can’t change this character. Ask your GM.');
  const e = visibleEntries(s, c.worldId, c.id).find(x => x.id === entryId) ?? no('That page is gone.', 404);
  return e.kind === 'character' ? e : no('Only a character page has trackers.', 400);
}

export type TrackerChange =
  | { action: 'add'; tracker: TrackerInput }
  | { action: 'edit'; trackerId: string; tracker: Partial<TrackerInput> }
  | { action: 'set'; trackerId: string; value: number }
  | { action: 'remove'; trackerId: string };

/** The workspace with one member change to one character's shown trackers. */
export function changePlayerTrackers(s: Workspace, campaignId: string, rights: Rights, entryId: string, change: TrackerChange): Workspace {
  const e = ownCharacter(s, campaignId, rights, entryId), character = e.character ?? defaultCharacter(), all: Tracker[] = character.trackers ?? [];
  if (change.action !== 'add' && !all.some(t => t.id === change.trackerId && !t.gm)) no('That tracker is gone.', 404);
  const next = change.action === 'add' ? addTracker(all, change.tracker)
    : change.action === 'edit' ? editTracker(all, change.trackerId, change.tracker)
    : change.action === 'set' ? setTrackerValue(all, change.trackerId, change.value)
    : removeTracker(all, change.trackerId);
  const { trackers: _old, ...rest } = character;
  void _old;
  const page: Entry = { ...e, character: next.length ? { ...rest, trackers: next } : rest };
  const parsed = workspaceSchema.safeParse({ ...s, entries: s.entries.map(x => x.id === e.id ? page : x) });
  return parsed.success ? parsed.data : no(parsed.error.issues[0]?.message ?? 'That change would break the page.', 400);
}
