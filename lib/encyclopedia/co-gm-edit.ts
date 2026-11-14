import { campaignExport, workspaceSchema, type Entry, type Workspace } from './world-model.ts';

/**
 * A co-GM's save, put back into the owner's whole workspace. The co-GM edits the copy campaignExport gives them
 * (one campaign, its world, the pages it can see). Pages they added, changed or deleted are applied; everything
 * else the owner has stays exactly as it is, including the parts of a shared page that belong to other campaigns.
 * Throws a CoGmEditError, with a message for the co-GM, for anything a co-GM may not change.
 */
export class CoGmEditError extends Error {}
const no = (message: string): never => { throw new CoGmEditError(message); };
// Settings that link the campaign to the owner's own accounts and folders stay the owner's.
const ownerOnly = ['id', 'worldId', 'github', 'discord', 'maptableCampaignId', 'folderId'] as const;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const images = (value: unknown) => new Set([...JSON.stringify(value).matchAll(/"(?:imageId|previewImageId)":"([0-9a-fA-F-]{36})"/g)].map(m => m[1]));

/** Puts back what campaignExport left out of a shared page: other campaigns' stats, codex finds and weather links. */
function restore(edited: Entry, full: Entry, campaignId: string): Entry {
  const next = { ...edited };
  if (edited.character && full.character) {
    const others = Object.fromEntries(Object.entries(full.character.statsByCampaign).filter(([cid]) => cid !== campaignId));
    // The linked sheet is the owner's: a co-GM neither links nor changes it (and the sheet id and link stay out of reach).
    const { sheet: _sheet, ...character } = edited.character;
    void _sheet;
    next.character = { ...character, ...(full.character.sheet ? { sheet: full.character.sheet } : {}), statsByCampaign: { ...others, ...Object.fromEntries(Object.entries(edited.character.statsByCampaign).filter(([cid]) => cid === campaignId)) } };
  }
  if (edited.codex && full.codex) {
    const others = Object.fromEntries(Object.entries(full.codex.found).filter(([cid]) => cid !== campaignId));
    next.codex = { ...edited.codex, found: { ...others, ...Object.fromEntries(Object.entries(edited.codex.found).filter(([cid]) => cid === campaignId)) } };
  }
  if (edited.mapData && full.mapData) {
    const before = new Map(full.mapData.pins.map(p => [p.id, p]));
    next.mapData = { ...edited.mapData, pins: edited.mapData.pins.map(pin => {
      const others = before.get(pin.id)?.weatherLinks?.filter(l => l.campaignId !== campaignId) ?? [];
      const links = [...others, ...(pin.weatherLinks ?? []).filter(l => l.campaignId === campaignId)];
      return links.length || pin.weatherLinks ? { ...pin, weatherLinks: links } : pin;
    }) };
  }
  return next;
}

/**
 * Why a co-GM's copy can't become `after`, or null when it can. `before` is the copy as they got it. The app asks
 * this before each change so a co-GM never gets stuck on a save the server would refuse; the server asks it again.
 * `allowed` is picture ids that aren't in the copy yet but are known to be in the GM's storage (pictures the co-GM added).
 */
export function coGmRefusal(before: Workspace, after: Workspace, allowed: ReadonlySet<string> = new Set()): string | null {
  const was = before.campaigns[0], mine = after.campaigns[0];
  if (after.campaigns.length !== 1 || mine?.id !== was?.id) return 'A co-GM can only change the campaign they were invited to.';
  if (after.worlds.length !== 1 || !same(after.worlds[0], before.worlds[0])) return 'Only the GM can change the world and its templates.';
  for (const key of ownerOnly) if (!same(mine[key], was[key])) return 'Only the GM can change where this campaign is linked.';
  // Every picture they use must already be in this campaign, or be one they added to the GM's storage.
  const known = images(before);
  for (const id of images(after)) if (!known.has(id) && !allowed.has(id)) return "That picture isn't in this campaign's storage. Add it again.";
  return null;
}

/** The picture ids a co-GM's copy uses that the campaign's current copy doesn't: the ones the server must find in storage. */
export const newImageIds = (before: Workspace, after: Workspace): string[] => { const known = images(before); return [...images(after)].filter(id => !known.has(id)); };

export function applyCoGmEdit(full: Workspace, campaignId: string, input: Workspace, allowed: ReadonlySet<string> = new Set()): Workspace {
  const edited = workspaceSchema.parse(input);
  const campaign = full.campaigns.find(c => c.id === campaignId) ?? no('This campaign is gone.');
  const before = campaignExport(full, campaignId);
  const refused = coGmRefusal(before, edited, allowed);
  if (refused) no(refused);
  const mine = edited.campaigns[0];

  const inScope = new Map(before.entries.map(e => [e.id, e]));
  const owned = new Map(full.entries.map(e => [e.id, e]));
  const kept = new Set(edited.entries.map(e => e.id));
  const changed = new Map<string, Entry>(), added: Entry[] = [];
  for (const e of edited.entries) {
    if (e.worldId !== campaign.worldId || (e.campaignId !== null && e.campaignId !== campaignId)) no('A page can only belong to this campaign or its world.');
    const was = inScope.get(e.id);
    if (!was) { if (owned.has(e.id)) no('That page belongs somewhere else.'); added.push(e); continue; }
    if (!same(e, was)) changed.set(e.id, restore(e, owned.get(e.id)!, campaignId));
  }
  const next = {
    ...full,
    campaigns: full.campaigns.map(c => c.id === campaignId ? mine : c),
    entries: [...full.entries.filter(e => !inScope.has(e.id) || kept.has(e.id)).map(e => changed.get(e.id) ?? e), ...added],
  };
  const parsed = workspaceSchema.safeParse(next);
  if (!parsed.success) no(parsed.error.issues[0]?.message ?? 'That change would break the campaign.');
  return parsed.data!;
}
