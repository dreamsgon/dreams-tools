import type { S3Bucket } from '../storage.ts';
import { emptyWorkspace, workspaceSchema, playerCampaign, type Workspace } from './world-model.ts';
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
    return saved ? next : null;
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
    return playerCampaign(data,grant.campaignId).entries.some(e=>e.mapData?.imageId===imageId)?grant.owner:null;
  }
}
