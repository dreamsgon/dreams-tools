import type { S3Bucket } from '../storage.ts';
import { emptyWorkspace, workspaceSchema, playerCampaign, type Workspace } from './world-model.ts';
import { librarySchema, emptyLibrary, LIBRARY_LIMIT, type TableLibrary } from './tables.ts';
import { addVersion, changedEntries, emptyHistory, historyEntryId, historySchema, snapshotOf, type PageHistory, type Snapshot } from './history.ts';
export async function hashToken(token: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
}
export const encyclopediaPrefix = (owner: string) => `users/${encodeURIComponent(owner)}/encyclopedia/`;
type LinkKind = 'player' | 'agent';
type Grant = { owner: string; campaignId: string; hash: string };
export class EncyclopediaStore {
  readonly bucket: S3Bucket;
  constructor(bucket: S3Bucket) { this.bucket = bucket; }
  async read(owner: string) {
    const object = await this.bucket.get(encyclopediaPrefix(owner)+'workspace.json');
    if (!object) return { data: emptyWorkspace(), revision: 0, etag: null };
    const saved = await object.json<{data:unknown;revision:number}>();
    if (!Number.isSafeInteger(saved.revision) || saved.revision < 1) throw Error('Invalid encyclopedia revision.');
    return { data: workspaceSchema.parse(saved.data), revision: saved.revision, etag: object.etag };
  }
  async save(owner: string, input: Workspace, revision: number) {
    const data=workspaceSchema.parse(input);
    if (new TextEncoder().encode(JSON.stringify(data)).length > 2_000_000) throw Error('Encyclopedia workspace exceeds the 2 MB limit. Export a backup before reducing content.');
    const previous=await this.read(owner);
    if (previous.revision!==revision) return null;
    const next=revision+1;
    const saved=await this.bucket.put(encyclopediaPrefix(owner)+'workspace.json',JSON.stringify({data,revision:next}),{onlyIf:previous.etag?{etagMatches:previous.etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
    if (!saved) return null;
    // Page history is a convenience copy: a failure here never fails or undoes the save.
    await this.recordHistory(owner, previous.data, data).catch(() => {});
    return next;
  }
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
    if (new TextEncoder().encode(JSON.stringify(data)).length > LIBRARY_LIMIT) throw Error('Your tables exceed the 1 MB limit. Export some and delete them to make room.');
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
    for (const id of deleted) if (historyEntryId(id)) await this.bucket.delete(this.historyPath(owner, id)).catch(() => {});
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
    return grant;
  }
  async player(token: string) {
    const grant=await this.grant(token);if(!grant)return null;
    const {data}=await this.read(grant.owner);
    return data.campaigns.some(c=>c.id===grant.campaignId)?playerCampaign(data,grant.campaignId):null;
  }
  async playerImageOwner(token:string,imageId:string) {
    const grant=await this.grant(token);if(!grant)return null;
    const {data}=await this.read(grant.owner);
    if(!data.campaigns.some(c=>c.id===grant.campaignId))return null;
    const shared=playerCampaign(data,grant.campaignId);
    return shared.campaign.look?.banner?.imageId===imageId||shared.entries.some(e=>e.mapData?.imageId===imageId||e.picture?.imageId===imageId)?grant.owner:null;
  }
}
