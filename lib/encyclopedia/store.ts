import type { S3Bucket } from '../storage.ts';
import { z } from 'zod';
import { emptyWorkspace, entrySchema, workspaceSchema, playerCampaign, type Workspace } from './world-model.ts';
import { librarySchema, emptyLibrary, LIBRARY_LIMIT, type TableLibrary } from './tables.ts';
import { TRANSCRIPT_LIMIT } from './recaps.ts';
import { addVersion, changedEntries, emptyHistory, historyEntryId, historySchema, snapshotOf, type PageHistory, type Snapshot } from './history.ts';
import { pictureIds } from './markup.ts';
import { bytes as jsonBytes, partOf, sizesProblem, applyScopedPatch, scopeKeys, scopedWorkspace, partSizes, type PartSize, type ScopePlace, type WikiMeta, applyWikiPatch, DamagedWikiError, DEFAULT_PART_LIMIT, DEFAULT_TOTAL_LIMIT, joinWorkspace, worldKey, campaignKey, partLimitOk, totalLimitOk, PAGE_LIMIT, sizeProblem, splitWorkspace, type Layout, type Part, type PartKey, type WikiPatch } from './wiki-parts.ts';
import { isPartStats, partStats, type PartStats } from './part-stats.ts';
import type { BookIndex } from '../campaign-links.ts';
const INDEX_FORMAT = 'wiki-parts-v1';
/** A campaign whose pages are archived (store.ts archiveCampaign): its pages, kept apart from the Wiki. */
const archiveSchema = z.object({ format: z.literal('wiki-archive-v1'), campaignId: z.string(), at: z.string(), entries: z.array(entrySchema) });
/** An archive request that can't be done; the message is for the person. */
export class ArchiveError extends Error {}
type PartRef = { key: string; bytes: number; hash: string; pages?: number; /** Added later: what the campaign list shows of this part (part-stats.ts). */ stats?: PartStats };
/** workspace.json once the Wiki is split: which part holds each campaign and world. It has no `data`, so older code refuses it instead of saving over it. */
type WikiIndex = { format: typeof INDEX_FORMAT; schemaVersion: 1; revision: number; layout: Layout; parts: Record<PartKey, PartRef>; limit?: number; total?: number; legacyBackup?: string; meta?: WikiMeta };
type Stored = { data: Workspace; revision: number; etag: string | null; index: WikiIndex | null; parts: Map<PartKey, Part> | null; legacy: unknown; limit: number; total: number };
function isIndex(x: Record<string, unknown>, prefix: string): x is WikiIndex & Record<string, unknown> {
  if (x.format !== INDEX_FORMAT) return false;
  const i = x as WikiIndex;
  if (!i.layout || !Array.isArray(i.layout.worlds) || !Array.isArray(i.layout.campaigns) || !Array.isArray(i.layout.runs) || !i.parts || typeof i.parts !== 'object'
    || Object.values(i.parts).some(r => !r || typeof r.key !== 'string' || !r.key.startsWith(prefix + 'parts/') || typeof r.hash !== 'string')) throw new DamagedWikiError('Your Wiki index is damaged. Nothing was changed.');
  return true;
}
async function sha256(text: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join(''); }
/** Runs `fn` on each item, at most 8 at a time, keeping their order. */
async function eachLimited<T, U>(items: T[], fn: (item: T) => Promise<U>): Promise<U[]> {
  const out = new Array<U>(items.length); let at = 0;
  await Promise.all(Array.from({ length: Math.min(8, items.length) }, async () => { while (at < items.length) { const i = at++; out[i] = await fn(items[i]); } }));
  return out;
}
export async function hashToken(token: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
}
export type Editor = { name: string; as: 'co-gm' | 'player' };
/** Marks the pages that changed with who changed them, or clears the mark when the owner did. */
export function markEditor(before: Workspace, after: Workspace, editor?: Editor): Workspace {
  const was = new Map(before.entries.map(e => [e.id, e.updatedAt]));
  return { ...after, entries: after.entries.map(e => {
    if (was.get(e.id) === e.updatedAt) return e;
    if (editor) return { ...e, editedBy: editor };
    if (!e.editedBy) return e;
    const { editedBy: _gone, ...rest } = e;
    return rest;
  }) };
}
/** savePartial's answer when this save needs the whole Wiki read after all (see there). */
const FULL = Symbol('full');
/** True when every part's ref says how many pages it holds and has its stats: what reading or saving only some parts needs. */
const complete = (index: WikiIndex) => Object.values(index.parts).every(r => Number.isSafeInteger(r.pages) && isPartStats(r.stats));
export const encyclopediaPrefix = (owner: string) => `users/${encodeURIComponent(owner)}/encyclopedia/`;
type LinkKind = 'player' | 'agent';
type Grant = { owner: string; campaignId: string; hash: string };
export class EncyclopediaStore {
  readonly bucket: S3Bucket;
  constructor(bucket: S3Bucket) { this.bucket = bucket; }
  /** The Wiki as one workspace, joined from its parts (or read from the single file an account had before they were split). */
  async read(owner: string) {
    const { data, revision, etag, limit, total } = await this.stored(owner);
    return { data, revision, etag, limit, total };
  }
  /** What is stored: the workspace, its revision and etag, the parts it was read from (null for the old single file) and the limit per part. */
  private async stored(owner: string, tries = 3): Promise<Stored> {
    const object = await this.bucket.get(encyclopediaPrefix(owner)+'workspace.json');
    if (!object) return { data: emptyWorkspace(), revision: 0, etag: null, index: null, parts: null, legacy: null, limit: DEFAULT_PART_LIMIT, total: DEFAULT_TOTAL_LIMIT };
    const saved = await object.json<Record<string, unknown>>();
    if (!Number.isSafeInteger(saved.revision) || (saved.revision as number) < 1) throw Error('Invalid encyclopedia revision.');
    const revision = saved.revision as number;
    if (!isIndex(saved, encyclopediaPrefix(owner))) return { data: workspaceSchema.parse(saved.data), revision, etag: object.etag, index: null, parts: null, legacy: saved, limit: DEFAULT_PART_LIMIT, total: DEFAULT_TOTAL_LIMIT };
    const refs = Object.entries(saved.parts);
    const loaded = await eachLimited(refs, async ([, ref]) => { const part = await this.bucket.get(ref.key); return part ? part.json<Part>() : null; });
    // A save that landed between reading the index and its parts removes parts it replaced: read again.
    if (loaded.some(p => !p)) { if (tries > 1) return this.stored(owner, tries - 1); throw new DamagedWikiError('Part of your Wiki could not be found. Nothing was changed.'); }
    const parts = new Map(refs.map(([key], i) => [key, loaded[i]!]));
    return { data: workspaceSchema.parse(joinWorkspace(saved.layout, parts)), revision, etag: object.etag, index: saved, parts, legacy: null, limit: partLimitOk(saved.limit) ? saved.limit : DEFAULT_PART_LIMIT, total: totalLimitOk(saved.total) ? saved.total : DEFAULT_TOTAL_LIMIT };
  }
  /**
   * The Wiki with every world and campaign but only the pages one place needs (wiki-parts.ts scopeKeys): what the Wiki
   * app opens, so a big Wiki loads one campaign at a time. `keys` asks for those parts instead (the app's poll and a
   * switch to another campaign). `entryId` finds the campaign or world a page is in when nothing else says where.
   * `scope` is the parts the pages came from; `sizes` is how big every part is, opened or not.
   */
  async readScoped(owner: string, place: ScopePlace & { keys?: PartKey[]; entryId?: string | null }, tries = 3): Promise<{ data: Workspace; revision: number; etag: string | null; limit: number; total: number; scope: PartKey[]; sizes: PartSize[] }> {
    const object = await this.bucket.get(encyclopediaPrefix(owner)+'workspace.json');
    const saved = object ? await object.json<Record<string, unknown>>() : null;
    const index = saved && isIndex(saved, encyclopediaPrefix(owner)) && saved.meta && Array.isArray(saved.meta.worlds) && Array.isArray(saved.meta.campaigns) ? saved as WikiIndex & { meta: WikiMeta } : null;
    if (!index || !object) {
      // An account not split yet, or split before the index named its campaigns: read it all, then cut it down.
      const all = await this.stored(owner), { layout, parts } = splitWorkspace(all.data), meta = { worlds: all.data.worlds, campaigns: all.data.campaigns };
      const keys = this.keysFor(meta, place, parts);
      return { data: scopedWorkspace(layout, meta, parts, keys), revision: all.revision, etag: all.etag, limit: all.limit, total: all.total, scope: keys, sizes: partSizes(all.data) };
    }
    if (!Number.isSafeInteger(index.revision) || index.revision < 1) throw Error('Invalid encyclopedia revision.');
    const read = async (key: PartKey) => { const ref = index.parts[key], part = ref ? await this.bucket.get(ref.key) : null; return part ? part.json<Part>() : null; };
    let keys = (place.keys ?? []).filter(k => k in index.parts);
    if (!place.keys) {
      const hinted = place.campaignId || place.worldId || place.maptableId ? null : place.entryId;
      // A link to a page names only the page: find the campaign (or world lore) it is in.
      let found: PartKey | null = null;
      // Recently changed pages are named in the index (part-stats.ts); otherwise the parts are searched 8 at a time, not one by one.
      if (hinted) found = Object.entries(index.parts).find(([, ref]) => ref.stats?.latest?.some(p => p.id === hinted))?.[0] ?? null;
      if (hinted && !found) { let hit: PartKey | null = null; await eachLimited(Object.keys(index.parts), async key => { if (!hit && (await read(key))?.entries.some(e => e.id === hinted)) hit = key; }); found = hit; }
      keys = scopeKeys(index.meta, found ? (found.startsWith('c:') ? { campaignId: found.slice(2) } : { worldId: found.slice(2) }) : place).filter(k => k in index.parts);
    }
    const loaded = await eachLimited(keys, read);
    // A save between reading the index and its parts removes parts it replaced: read again.
    if (loaded.some(p => !p)) { if (tries > 1) return this.readScoped(owner, place, tries - 1); throw new DamagedWikiError('Part of your Wiki could not be found. Nothing was changed.'); }
    const parts = new Map(keys.map((k, i) => [k, loaded[i]!]));
    const names = new Map<string, Pick<PartSize, 'name' | 'kind'>>([...index.meta.worlds.map(w => [worldKey(w.id), { name: `${w.name} (shared lore)`, kind: 'world' as const }] as const), ...index.meta.campaigns.map(c => [campaignKey(c.id), { name: c.name, kind: 'campaign' as const }] as const)]);
    const sizes: PartSize[] = Object.entries(index.parts).map(([key, ref]) => ({ key, bytes: ref.bytes, pages: ref.pages ?? parts.get(key)?.entries.length ?? 0, ...(names.get(key) ?? { name: 'Pages outside any world', kind: 'other' as const }) })).sort((a, b) => b.bytes - a.bytes);
    return { data: workspaceSchema.parse(scopedWorkspace(index.layout, index.meta, parts, keys)), revision: index.revision, etag: object.etag, limit: partLimitOk(index.limit) ? index.limit : DEFAULT_PART_LIMIT, total: totalLimitOk(index.total) ? index.total : DEFAULT_TOTAL_LIMIT, scope: keys, sizes };
  }
  private keysFor(meta: WikiMeta, place: ScopePlace & { keys?: PartKey[]; entryId?: string | null }, parts: ReadonlyMap<PartKey, Part>) {
    if (place.keys) return place.keys.filter(k => parts.has(k));
    const hinted = place.campaignId || place.worldId || place.maptableId ? null : place.entryId;
    const found = hinted ? [...parts].find(([, p]) => p.entries.some(e => e.id === hinted))?.[0] : undefined;
    return scopeKeys(meta, found ? (found.startsWith('c:') ? { campaignId: found.slice(2) } : { worldId: found.slice(2) }) : place).filter(k => parts.has(k));
  }
  /** The index (workspace.json) when the Wiki is split and the index names its worlds and campaigns, else null. */
  private async readIndexObject(owner: string): Promise<{ index: WikiIndex & { meta: WikiMeta }; etag: string } | null> {
    const object = await this.bucket.get(encyclopediaPrefix(owner)+'workspace.json');
    if (!object) return null;
    const saved = await object.json<Record<string, unknown>>();
    if (!isIndex(saved, encyclopediaPrefix(owner)) || !saved.meta || !Array.isArray(saved.meta.worlds) || !Array.isArray(saved.meta.campaigns)) return null;
    if (!Number.isSafeInteger(saved.revision) || saved.revision < 1) throw Error('Invalid encyclopedia revision.');
    return { index: saved as WikiIndex & { meta: WikiMeta }, etag: object.etag };
  }
  /**
   * Every world and campaign and a few numbers about each (part-stats.ts), read from the index alone: what the
   * campaign list needs, without reading any pages. Null when the index doesn't have them yet (an account whose
   * Wiki hasn't been saved since they were added): read the whole Wiki then.
   */
  async readIndex(owner: string): Promise<BookIndex | null> {
    const read = await this.readIndexObject(owner);
    if (!read || !complete(read.index)) return null;
    return { worlds: read.index.meta.worlds, campaigns: read.index.meta.campaigns, stats: Object.fromEntries(Object.entries(read.index.parts).map(([key, ref]) => [key, ref.stats!])) };
  }
  /**
   * Saves a patch by reading only the parts it changes, instead of the whole Wiki, so a save takes the same time
   * however many campaigns there are. Checks what EncyclopediaStore.commit checks, with the other parts' sizes and
   * page counts taken from the index. Answers FULL when it can't be sure (an older index, a page that belongs in a
   * part the patch doesn't send): the caller then saves the usual way, reading everything.
   */
  private async savePartial(owner: string, patch: WikiPatch, revision: number, scope: PartKey[] | null, tries = 3): Promise<{ revision: number; etag: string } | null | typeof FULL> {
    if (!patch || typeof patch !== 'object' || !patch.layout || !Array.isArray(patch.layout.runs) || !Array.isArray(patch.layout.worlds) || !Array.isArray(patch.layout.campaigns) || !patch.parts || typeof patch.parts !== 'object') throw new DamagedWikiError('That save is not in a form this Wiki understands. Reload and try again.');
    const read = await this.readIndexObject(owner);
    if (!read || !complete(read.index)) return FULL;
    const { index, etag } = read, base = encyclopediaPrefix(owner);
    if (index.revision !== revision) return null;
    const limit = partLimitOk(index.limit) ? index.limit : DEFAULT_PART_LIMIT, total = totalLimitOk(index.total) ? index.total : DEFAULT_TOTAL_LIMIT;
    const stored = Object.keys(patch.parts).filter(key => key in index.parts);
    const loaded = await eachLimited(stored, async key => { const part = await this.bucket.get(index.parts[key].key); return part ? part.json<Part>() : null; });
    // A save between reading the index and its parts removes parts it replaced: read again.
    if (loaded.some(p => !p)) { if (tries > 1) return this.savePartial(owner, patch, revision, scope, tries - 1); throw new DamagedWikiError('Part of your Wiki could not be found. Nothing was changed.'); }
    const before = new Map(stored.map((key, i) => [key, loaded[i]!]));
    // The parts after the save. From a tab that opened only `scope`, a part outside it keeps its stored pages (applyScopedPatch).
    const inScope = scope ? new Set([...scope, ...Object.keys(patch.parts).filter(key => !(key in index.parts))]) : null;
    const after = new Map<PartKey, Part>(), removed = new Set<PartKey>();
    for (const [key, part] of Object.entries(patch.parts)) {
      if (part === null) { removed.add(key); continue; }
      if (!part || typeof part !== 'object' || !Array.isArray(part.entries)) throw new DamagedWikiError('That save is not in a form this Wiki understands. Reload and try again.');
      if (!inScope || inScope.has(key)) { after.set(key, part); continue; }
      if (part.entries.length) throw new DamagedWikiError('That save has pages from a campaign this tab has not opened. Reload and try again.');
      after.set(key, { ...(part.world ? { world: part.world } : {}), ...(part.campaign ? { campaign: part.campaign } : {}), entries: before.get(key)?.entries ?? [] });
    }
    if (inScope && patch.layout.runs.some(([key]) => !inScope.has(key))) throw new DamagedWikiError('That save has pages from a campaign this tab has not opened. Reload and try again.');
    const kept = (key: PartKey) => !removed.has(key) && (after.has(key) || key in index.parts);
    const runs: [PartKey, number][] = [];
    for (const [key, count] of [...(inScope ? index.layout.runs.filter(([key]) => !inScope.has(key) && kept(key)) : []), ...patch.layout.runs]) {
      if (typeof key !== 'string' || !Number.isSafeInteger(count) || count < 1) throw new DamagedWikiError("Your Wiki's storage does not add up (pages are missing). Nothing was changed.");
      const last = runs[runs.length - 1];
      if (last && last[0] === key) last[1] += count; else runs.push([key, count]);
    }
    const layout: Layout = { worlds: patch.layout.worlds, campaigns: patch.layout.campaigns, runs };
    // The worlds and campaigns themselves: as sent for parts the patch has, as the index has them for the rest.
    const oldWorlds = new Map(index.meta.worlds.map(w => [w.id, w])), oldCampaigns = new Map(index.meta.campaigns.map(c => [c.id, c]));
    const worldOf = (id: string) => after.has(worldKey(id)) ? after.get(worldKey(id))!.world : kept(worldKey(id)) ? oldWorlds.get(id) : undefined;
    const campaignOf = (id: string) => after.has(campaignKey(id)) ? after.get(campaignKey(id))!.campaign : kept(campaignKey(id)) ? oldCampaigns.get(id) : undefined;
    const worlds = layout.worlds.map(id => worldOf(id)), campaigns = layout.campaigns.map(id => campaignOf(id));
    if (worlds.some((w, i) => !w || w.id !== layout.worlds[i]) || campaigns.some((c, i) => !c || c.id !== layout.campaigns[i])) return FULL;
    // Every part must be used up exactly by the runs, as joinWorkspace checks; one the layout no longer names goes (only an empty one can).
    const named = new Set([...layout.worlds.map(worldKey), ...layout.campaigns.map(campaignKey), ...runs.map(([key]) => key)]);
    const pagesOf = (key: PartKey) => after.get(key)?.entries.length ?? index.parts[key]?.pages ?? 0;
    const used = new Map<PartKey, number>();
    for (const [key, count] of runs) { if (!kept(key)) return FULL; used.set(key, (used.get(key) ?? 0) + count); }
    const parts = [...new Set([...Object.keys(index.parts), ...after.keys()])].filter(kept);
    for (const key of parts) if ((used.get(key) ?? 0) !== pagesOf(key) && (named.has(key) || pagesOf(key))) return FULL;
    const final = parts.filter(key => named.has(key));
    // Each page sent must be in the part it belongs in (wikiPatch always sends it there). Refused rather than re-sorted:
    // re-sorting would put pages into parts this save didn't send.
    const campaignIds = new Set(layout.campaigns), worldIds = new Set(layout.worlds);
    for (const [key, part] of after) if (part.entries.some(e => !e || typeof e !== 'object' || partOf(e, campaignIds, worldIds) !== key)) throw new DamagedWikiError('That save is not in a form this Wiki understands. Reload and try again.');
    // Checks the sent parts (and every world and campaign) as a whole Wiki would be checked.
    const order = runs.filter(([key]) => after.has(key)), taken = new Map<PartKey, number>(), sentEntries = [];
    for (const [key, count] of order) { const from = taken.get(key) ?? 0; sentEntries.push(...after.get(key)!.entries.slice(from, from + count)); taken.set(key, from + count); }
    const checked = workspaceSchema.parse({ schemaVersion: 1, worlds, campaigns, entries: sentEntries });
    const beforeWs: Workspace = { schemaVersion: 1, worlds: checked.worlds, campaigns: checked.campaigns, entries: [...before.values()].flatMap(p => p.entries) };
    const marked = markEditor(beforeWs, checked);
    const newWorlds = new Map(marked.worlds.map(w => [w.id, w])), newCampaigns = new Map(marked.campaigns.map(c => [c.id, c]));
    const written = new Map<PartKey, Part>();
    for (const key of after.keys()) if (final.includes(key)) {
      const id = key.slice(2);
      written.set(key, { ...(key.startsWith('w:') ? { world: newWorlds.get(id) } : {}), ...(key.startsWith('c:') ? { campaign: newCampaigns.get(id) } : {}), entries: [] });
    }
    for (const e of marked.entries) written.get(partOf(e, campaignIds, worldIds))!.entries.push(e);
    const names = new Map<PartKey, Pick<PartSize, 'name' | 'kind'>>([...marked.worlds.map(w => [worldKey(w.id), { name: `${w.name} (shared lore)`, kind: 'world' as const }] as const), ...marked.campaigns.map(c => [campaignKey(c.id), { name: c.name, kind: 'campaign' as const }] as const)]);
    const sizes: PartSize[] = final.map(key => ({ key, bytes: written.has(key) ? jsonBytes(written.get(key)) : index.parts[key].bytes, pages: pagesOf(key), ...(names.get(key) ?? { name: 'Pages outside any world', kind: 'other' as const }) }));
    const problem = sizesProblem(sizes, limit, total);
    if (problem) throw Error(problem);
    const paths: string[] = [];
    const refs: Record<PartKey, PartRef> = Object.fromEntries(final.filter(key => !written.has(key)).map(key => [key, index.parts[key]]));
    try {
      for (const [key, ref] of await eachLimited([...written], async ([key, part]) => {
        const text = JSON.stringify(part), hash = await sha256(text), had = index.parts[key], stats = partStats(part.entries);
        if (had && had.hash === hash) return [key, { ...had, pages: part.entries.length, stats }] as const;
        const path = `${base}parts/${encodeURIComponent(key)}/${crypto.randomUUID()}.json`;
        paths.push(path);
        await this.bucket.put(path, text, { httpMetadata: { contentType: 'application/json' } });
        return [key, { key: path, bytes: new TextEncoder().encode(text).length, hash, pages: part.entries.length, stats }] as const;
      })) refs[key] = ref;
    } catch (error) { await this.forget(paths); throw error; }
    const meta: WikiMeta = { worlds: layout.worlds.map(id => newWorlds.get(id)!), campaigns: layout.campaigns.map(id => newCampaigns.get(id)!) };
    const next: WikiIndex = { format: INDEX_FORMAT, schemaVersion: 1, revision: index.revision + 1, layout, parts: refs, meta, ...(index.limit !== undefined ? { limit: index.limit } : {}), ...(index.total !== undefined ? { total: index.total } : {}), ...(index.legacyBackup ? { legacyBackup: index.legacyBackup } : {}) };
    const saved = await this.bucket.put(base+'workspace.json', JSON.stringify(next), { onlyIf: { etagMatches: etag }, httpMetadata: { contentType: 'application/json' } })
      .catch(async (error) => { await this.forget(paths); throw error; });
    if (!saved) { await this.forget(paths); return null; }
    const using = new Set(Object.values(refs).map(r => r.key));
    await this.forget(Object.values(index.parts).map(r => r.key).filter(k => !using.has(k)));
    await this.recordHistory(owner, beforeWs, marked).catch(() => {});
    return { revision: next.revision, etag: saved.etag };
  }
  /**
   * Changes one campaign's own settings (its dashboard, front page…) without touching its pages: reads and writes
   * only that campaign's part. Null when the Wiki changed meanwhile.
   */
  async updateCampaign(owner: string, campaignId: string, change: (campaign: Workspace['campaigns'][number]) => Workspace['campaigns'][number]) {
    const read = await this.readIndexObject(owner), key = campaignKey(campaignId);
    if (read && complete(read.index) && key in read.index.parts) {
      const object = await this.bucket.get(read.index.parts[key].key), part = object ? await object.json<Part>() : null;
      if (part?.campaign) {
        const { layout } = read.index;
        const patch: WikiPatch = { layout: { worlds: layout.worlds, campaigns: layout.campaigns, runs: layout.runs.filter(([k]) => k === key) }, parts: { [key]: { ...part, campaign: change(part.campaign) } } };
        const saved = await this.savePartial(owner, patch, read.index.revision, [key]);
        if (saved !== FULL) return saved;
      }
    }
    const { data, revision } = await this.read(owner);
    if (!data.campaigns.some(c => c.id === campaignId)) throw Error('Campaign not found');
    return this.saveTagged(owner, { ...data, campaigns: data.campaigns.map(c => c.id === campaignId ? change(c) : c) }, revision);
  }
  /** A save from a Wiki that opened only `scope` (readScoped): pages outside it stay as stored. */
  async saveScopedPatch(owner: string, patch: WikiPatch, revision: number, scope: PartKey[]) {
    const quick=await this.savePartial(owner, patch, revision, scope);
    if (quick!==FULL) return quick;
    const previous=await this.stored(owner);
    if (previous.revision!==revision) return null;
    const split=previous.parts && previous.index ? { layout: previous.index.layout, parts: previous.parts } : splitWorkspace(previous.data);
    const data=workspaceSchema.parse(applyScopedPatch(split.parts, split.layout, patch, scope));
    const untouched=new Set(Object.keys(previous.index?.parts ?? {}).filter(key => !(key in patch.parts)));
    return this.commit(owner, previous, markEditor(previous.data,data), { untouched });
  }
  async save(owner: string, input: Workspace, revision: number) {
    return (await this.saveTagged(owner, input, revision))?.revision ?? null;
  }
  /**
   * Saves, and also returns the stored copy's etag so the app can ask "anything new?" cheaply. `editor` is who
   * changed it when it wasn't the owner (a co-GM, or a player on their own page): pages they changed are marked
   * with their name, and pages anyone else changed lose an old mark.
   */
  async saveTagged(owner: string, input: Workspace, revision: number, editor?: Editor) {
    const data=workspaceSchema.parse(input);
    const previous=await this.stored(owner);
    if (previous.revision!==revision) return null;
    return this.commit(owner, previous, markEditor(previous.data,data,editor));
  }
  /** Saves only the campaigns and worlds that changed (wiki-parts.ts wikiPatch), made against `revision`. */
  async savePatch(owner: string, patch: WikiPatch, revision: number) {
    const quick=await this.savePartial(owner, patch, revision, null);
    if (quick!==FULL) return quick;
    const previous=await this.stored(owner);
    if (previous.revision!==revision) return null;
    const data=workspaceSchema.parse(applyWikiPatch(previous.parts ?? splitWorkspace(previous.data).parts, patch));
    // Parts the patch didn't send are stored as they were: no need to write them out again to see that.
    const untouched=new Set(Object.keys(previous.index?.parts ?? {}).filter(key => !(key in patch.parts)));
    return this.commit(owner, previous, markEditor(previous.data,data), { untouched });
  }
  /** Sets how big one campaign (or one world's shared lore) may be. Saves the Wiki as it is, under the new limit. */
  async setPartLimit(owner: string, limit: number) {
    if (!partLimitOk(limit)) throw Error('Choose one of the limits offered.');
    const previous=await this.stored(owner);
    return this.commit(owner, previous, previous.data, { limit });
  }
  /** Sets how big the whole Wiki, every live campaign together, may be. */
  async setTotalLimit(owner: string, total: number) {
    if (!totalLimitOk(total)) throw Error('Choose one of the limits offered.');
    const previous=await this.stored(owner);
    return this.commit(owner, previous, previous.data, { total });
  }
  /**
   * Writes each campaign and world that changed to a new part, then publishes the index that names them, only if
   * nothing else saved since (workspace.json stays the one commit point). Parts the new index no longer names are
   * removed afterwards. The first save after the split keeps the old single file as a backup.
   */
  private archivePath(owner: string, campaignId: string) { return encyclopediaPrefix(owner)+`archive/${encodeURIComponent(campaignId)}.json`; }
  /**
   * Archives a campaign: its pages move to their own file (encyclopedia/archive/<id>.json) and out of the Wiki, so they
   * count toward no limit and aren't loaded. The campaign itself stays, marked archived, so its links, members, Maptable
   * pairing and settings are untouched. The file is written first and the Wiki saved after; if that save loses a race,
   * the file is removed again. Page history and transcripts stay where they are. Null when the Wiki changed meanwhile.
   */
  async archiveCampaign(owner: string, campaignId: string, now = new Date()) {
    const previous=await this.stored(owner), campaign=previous.data.campaigns.find(c => c.id===campaignId);
    if (!campaign) throw new ArchiveError('That campaign was not found.');
    if (campaign.archived) throw new ArchiveError('That campaign is already archived.');
    const path=this.archivePath(owner, campaignId), pages=previous.data.entries.filter(e => e.campaignId===campaignId);
    // A file left by an archive that never finished holds older copies of the same pages: the ones in the Wiki now replace them.
    const leftover=await this.bucket.get(path), old=leftover ? archiveSchema.safeParse(await leftover.json()) : null;
    const ids=new Set(pages.map(e => e.id)), kept=old?.success ? old.data.entries.filter(e => !ids.has(e.id)) : [];
    const entries=[...pages, ...kept], text=JSON.stringify({ format: 'wiki-archive-v1', campaignId, at: now.toISOString(), entries });
    const made=await this.bucket.put(path, text, { onlyIf: leftover ? { etagMatches: leftover.etag } : { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/json' } });
    if (!made) return null;
    const next: Workspace={ ...previous.data, campaigns: previous.data.campaigns.map(c => c.id===campaignId ? { ...c, archived: { at: now.toISOString(), pages: entries.length, bytes: new TextEncoder().encode(text).length } } : c), entries: previous.data.entries.filter(e => e.campaignId!==campaignId) };
    let saved: Awaited<ReturnType<EncyclopediaStore['commit']>> = null;
    try { saved=await this.commit(owner, previous, workspaceSchema.parse(next), { history: false }); }
    finally { if (!saved && !leftover) await this.bucket.delete(path).catch(() => {}); }
    return saved;
  }
  /** Brings an archived campaign's pages back into the Wiki, then removes the archive file. Null when the Wiki changed meanwhile. */
  async unarchiveCampaign(owner: string, campaignId: string) {
    const previous=await this.stored(owner), campaign=previous.data.campaigns.find(c => c.id===campaignId);
    if (!campaign) throw new ArchiveError('That campaign was not found.');
    if (!campaign.archived) throw new ArchiveError('That campaign is not archived.');
    const path=this.archivePath(owner, campaignId), object=await this.bucket.get(path);
    if (!object) throw new ArchiveError('The archived pages of this campaign could not be found. Nothing was changed.');
    const parsed=archiveSchema.safeParse(await object.json());
    if (!parsed.success || parsed.data.campaignId!==campaignId) throw new ArchiveError('The archived pages of this campaign could not be read. Nothing was changed.');
    // Pages made in the campaign while it was archived (by an AI connection, say) stay as they are.
    const live=new Set(previous.data.entries.map(e => e.id)), back=parsed.data.entries.filter(e => !live.has(e.id));
    if (previous.data.entries.filter(e => e.campaignId===campaignId).length+back.length>PAGE_LIMIT) throw new ArchiveError(`Bringing back ${back.length} pages would take this campaign over ${PAGE_LIMIT.toLocaleString('en-US')} pages. Nothing was changed.`);
    const { archived: _was, ...rest }=campaign;
    const next: Workspace={ ...previous.data, campaigns: previous.data.campaigns.map(c => c.id===campaignId ? rest : c), entries: [...previous.data.entries, ...back] };
    const checked=workspaceSchema.safeParse(next);
    if (!checked.success) throw new ArchiveError(`These pages no longer fit the Wiki (${checked.error.issues[0]?.message}). Nothing was changed.`);
    const saved=await this.commit(owner, previous, checked.data, { history: false });
    if (saved) await this.bucket.delete(path).catch(() => {});
    return saved;
  }
  private async commit(owner: string, previous: Stored, data: Workspace, { limit = previous.limit, total = previous.total, history = true, untouched = new Set<string>() }: { limit?: number; total?: number; history?: boolean; untouched?: Set<string> } = {}) {
    const problem=sizeProblem(data, limit, total);
    if (problem) throw Error(problem);
    const base=encyclopediaPrefix(owner), next=previous.revision+1, { layout, parts }=splitWorkspace(data), old=previous.index?.parts ?? {};
    const written: string[]=[];
    const refs=Object.fromEntries(await eachLimited([...parts], async ([key, part]) => {
      const had=old[key];
      if (had && untouched.has(key)) return [key, { ...had, pages: part.entries.length, stats: isPartStats(had.stats) ? had.stats : partStats(part.entries) }] as const;
      const text=JSON.stringify(part), hash=await sha256(text);
      if (had && had.hash===hash) return [key, { ...had, pages: part.entries.length, stats: isPartStats(had.stats) ? had.stats : partStats(part.entries) }] as const;
      const path=`${base}parts/${encodeURIComponent(key)}/${crypto.randomUUID()}.json`;
      written.push(path);
      await this.bucket.put(path, text, { httpMetadata: { contentType: 'application/json' } });
      return [key, { key: path, bytes: new TextEncoder().encode(text).length, hash, pages: part.entries.length, stats: partStats(part.entries) }] as const;
    }).catch(async (error) => { await this.forget(written); throw error; }));
    let legacyBackup=previous.index?.legacyBackup;
    if (previous.legacy) {
      // The single file from before the split, exactly as it was. Kept until the owner removes it; only the first one is kept.
      legacyBackup=base+'backups/before-wiki-split.json';
      try { await this.bucket.put(legacyBackup, JSON.stringify(previous.legacy), { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/json' } }); }
      catch (error) { await this.forget(written); throw error; }
    }
    // The worlds and campaigns themselves also go in the index, so the Wiki can open one campaign without reading the others (readScoped).
    const index: WikiIndex={ format: INDEX_FORMAT, schemaVersion: 1, revision: next, layout, parts: refs, meta: { worlds: data.worlds, campaigns: data.campaigns }, ...(limit!==DEFAULT_PART_LIMIT ? { limit } : {}), ...(total!==DEFAULT_TOTAL_LIMIT ? { total } : {}), ...(legacyBackup ? { legacyBackup } : {}) };
    const saved=await this.bucket.put(base+'workspace.json', JSON.stringify(index), { onlyIf: previous.etag ? { etagMatches: previous.etag } : { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/json' } })
      .catch(async (error) => { await this.forget(written); throw error; });
    if (!saved) { await this.forget(written); return null; }
    const using=new Set(Object.values(refs).map(r => r.key));
    await this.forget(Object.values(old).map(r => r.key).filter(k => !using.has(k)));
    // Page history is a convenience copy: a failure here never fails or undoes the save. Archiving moves pages rather than deleting them, so it keeps their history and transcripts.
    if (history) await this.recordHistory(owner, previous.data, data).catch(() => {});
    return { revision: next, etag: saved.etag };
  }
  private async forget(keys: string[]) { await eachLimited(keys, key => this.bucket.delete(key).catch(() => {})); }
  /** Random tables: one library per account, used across campaigns. Saved separately so the workspace limit is unaffected. */
  async readTables(owner: string) {
    const object = await this.bucket.get(encyclopediaPrefix(owner)+'tables.json');
    if (!object) return { data: emptyLibrary(), revision: 0, etag: null as string | null };
    const saved = await object.json<{data:unknown;revision:number}>();
    if (!Number.isSafeInteger(saved.revision) || saved.revision < 1) throw Error('Invalid tables revision.');
    return { data: librarySchema.parse(saved.data), revision: saved.revision, etag: object.etag };
  }
  async saveTables(owner: string, input: TableLibrary, revision: number) {
    const data = librarySchema.parse(input);
    if (new TextEncoder().encode(JSON.stringify(data)).length > LIBRARY_LIMIT) throw Error(`Your tables exceed the ${LIBRARY_LIMIT / 1_000_000} MB limit. Export some and delete them to make room.`);
    const previous = await this.readTables(owner);
    if (previous.revision !== revision) return null;
    const next = revision + 1;
    const saved = await this.bucket.put(encyclopediaPrefix(owner)+'tables.json', JSON.stringify({data,revision:next}), {onlyIf:previous.etag?{etagMatches:previous.etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
    return saved ? next : null;
  }
  private historyPath(owner: string, entryId: string) { return encyclopediaPrefix(owner)+`history/${encodeURIComponent(entryId)}.json`; }
  async history(owner: string, entryId: string): Promise<PageHistory> {
    if (!historyEntryId(entryId)) return emptyHistory();
    const object = await this.bucket.get(this.historyPath(owner, entryId));
    if (!object) return emptyHistory();
    const parsed = historySchema.safeParse(await object.json());
    return parsed.success ? parsed.data : emptyHistory();
  }
  private async addHistory(owner: string, entryId: string, snapshot: Snapshot, at: string, now: Date, force = false) {
    const before = await this.history(owner, entryId), after = addVersion(before, snapshot, at, now, force);
    if (after !== before) await this.bucket.put(this.historyPath(owner, entryId), JSON.stringify(after), { httpMetadata: { contentType: 'application/json' } });
  }
  async recordHistory(owner: string, before: Workspace, after: Workspace, now = new Date()) {
    const { changed, deleted } = changedEntries(before.entries, after.entries);
    for (const entry of changed.slice(0, 50)) if (historyEntryId(entry.id)) await this.addHistory(owner, entry.id, snapshotOf(entry), entry.updatedAt, now);
    for (const id of deleted) if (historyEntryId(id)) {
      await this.bucket.delete(this.historyPath(owner, id)).catch(() => {});
      if (before.entries.find(e => e.id === id)?.kind === 'session') await this.bucket.delete(this.transcriptPath(owner, id)).catch(() => {});
    }
  }
  /** Keeps the current text of an entry before a restore replaces it. The entry must exist in the saved workspace. */
  async checkpoint(owner: string, entryId: string, snapshot: Snapshot, now = new Date()) {
    if (!historyEntryId(entryId)) return false;
    const { data } = await this.read(owner);
    const entry = data.entries.find(e => e.id === entryId);
    if (!entry || entry.kind === 'folder') return false;
    await this.addHistory(owner, entryId, snapshot, entry.updatedAt, now, true);
    return true;
  }
  /** A session's transcript, kept beside the workspace so a long session never counts against its campaign's limit. */
  private transcriptPath(owner: string, entryId: string) { return encyclopediaPrefix(owner)+`transcripts/${encodeURIComponent(entryId)}.txt`; }
  async readTranscript(owner: string, entryId: string) {
    if (!historyEntryId(entryId)) return null;
    const object = await this.bucket.get(this.transcriptPath(owner, entryId));
    return object ? new TextDecoder().decode(await object.arrayBuffer()) : null;
  }
  /** Saves (or with an empty text, deletes) a transcript for a session page. */
  async saveTranscript(owner: string, entryId: string, text: string) {
    if (!historyEntryId(entryId)) throw Error('That page id is not valid.');
    if (text.length > TRANSCRIPT_LIMIT) throw Error('That transcript is over the 2,000,000 character limit. Split the session into two pages.');
    // A page made a moment ago may not be saved yet; one that is saved must be a session page.
    const { data } = await this.read(owner), page = data.entries.find(e => e.id === entryId);
    if (page && page.kind !== 'session') throw Error('A transcript belongs on a session page.');
    if (!text.trim()) { await this.bucket.delete(this.transcriptPath(owner, entryId)).catch(() => {}); return; }
    await this.bucket.put(this.transcriptPath(owner, entryId), text, { httpMetadata: { contentType: 'text/plain; charset=utf-8' } });
  }
  private linkPath(owner: string,campaign: string,kind: LinkKind) { return encyclopediaPrefix(owner)+`${kind}-links/${encodeURIComponent(campaign)}.json`; }
  async createLink(owner: string,campaignId: string,kind: LinkKind='player') {
    const {data}=await this.read(owner);
    if (!data.campaigns.some(c=>c.id===campaignId)) throw Error('Save this campaign first.');
    const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
    const hash=await hashToken(token),path=this.linkPath(owner,campaignId,kind);
    const previous=await this.bucket.get(path),old=previous?await previous.json<{hash:string}>():null;
    await this.bucket.put(`encyclopedia-${kind}-keys/${hash}.json`,JSON.stringify({owner,campaignId,hash}));
    await this.bucket.put(path,JSON.stringify({hash}));
    if(old) await this.bucket.delete(`encyclopedia-${kind}-keys/${old.hash}.json`).catch(()=>{});
    return token;
  }
  async revokeLink(owner: string,campaignId: string,kind: LinkKind='player') {
    const path=this.linkPath(owner,campaignId,kind),previous=await this.bucket.get(path);
    const old=previous?await previous.json<{hash:string}>():null;
    await this.bucket.delete(path);
    if(old) await this.bucket.delete(`encyclopedia-${kind}-keys/${old.hash}.json`).catch(()=>{});
  }
  async grant(token: string,kind: LinkKind='player'):Promise<Grant|null> {
    if(!/^[a-f0-9]{64}$/.test(token))return null;
    const hash=await hashToken(token),object=await this.bucket.get(`encyclopedia-${kind}-keys/${hash}.json`);
    if(!object)return null;
    const grant=await object.json<Grant>();
    const current=await this.bucket.get(this.linkPath(grant.owner,grant.campaignId,kind));
    if(!current||(await current.json<{hash:string}>()).hash!==hash)return null;
    // A campaign the GM closed to players (the member list's `hidden`, lib/members.ts) opens to no player link either.
    if(kind==='player'&&await this.closedToPlayers(grant.owner,grant.campaignId))return null;
    return grant;
  }
  /** Whether the GM has closed this campaign to players and guests. Read from its member list, kept in members-server.ts. */
  async closedToPlayers(owner:string,campaignId:string){
    const list=await this.bucket.get(`${encyclopediaPrefix(owner)}members/${encodeURIComponent(campaignId)}.json`);
    return !!list&&(await list.json<{hidden?:unknown}>().catch(()=>null))?.hidden===true;
  }
  async player(token: string) {
    const grant=await this.grant(token);
    return grant?this.playerOf(grant):null;
  }
  /** What a player sees of a campaign, for a grant from a player link or from campaign membership. */
  async playerOf(grant: {owner:string;campaignId:string}) {
    const {data}=await this.read(grant.owner);
    return data.campaigns.some(c=>c.id===grant.campaignId)?playerCampaign(data,grant.campaignId):null;
  }
  async playerImageOwner(token:string,imageId:string) {
    const grant=await this.grant(token);
    return grant?this.playerImageOwnerOf(grant,imageId):null;
  }
  async playerImageOwnerOf(grant: {owner:string;campaignId:string},imageId:string) {
    const shared=await this.playerOf(grant);if(!shared)return null;
    return shared.campaign.look?.banner?.imageId===imageId||shared.entries.some(e=>e.mapData?.imageId===imageId||e.mapData?.icons?.some(i=>i.imageId===imageId)||e.picture?.imageId===imageId||e.picture?.token?.imageId===imageId||e.org?.emblem.imageId===imageId||e.org?.banner?.imageId===imageId||e.pageLook?.banner?.imageId===imageId||e.tabs.some(t=>pictureIds(t.body).includes(imageId.toLowerCase())))?grant.owner:null;
  }
}
