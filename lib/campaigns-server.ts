import type { Bucket } from "./storage-types";
import { loadWorkspace, saveWorkspace } from "./workspace-storage.ts";
import { initialWorkspace, uid, type Workspace as MapWorkspace } from "./model.ts";
import { EncyclopediaStore, encyclopediaPrefix } from "./encyclopedia/store.ts";
import { newId, type Workspace as BookWorkspace } from "./encyclopedia/world-model.ts";
import { applyPairs, campaignSummary, cleanName } from "./campaign-links.ts";

/*
 * The Campaigns page: one list of campaigns across Maptable and the Encyclopedia.
 * Each tool keeps its own saved data. Pairing only sets the optional
 * `maptableCampaignId` on an Encyclopedia campaign. Before the first change made
 * here, both workspaces are copied to a private backup that is never overwritten.
 */

export type Session = { bucket: Bucket; owner: string; prefix: string; book: EncyclopediaStore };
export function campaignSession(bucket: Bucket, owner: string): Session {
  return { bucket, owner, prefix: `users/${encodeURIComponent(owner)}/`, book: new EncyclopediaStore(bucket as ConstructorParameters<typeof EncyclopediaStore>[0]) };
}

export async function readBoth(s: Session) {
  const [map, book] = await Promise.all([loadWorkspace(s.bucket, s.prefix), s.book.read(s.owner)]);
  return { map, book };
}

export const backupKey = (owner: string) => encyclopediaPrefix(owner) + "backups/before-campaigns-page.json";

/** Keeps a copy of both workspaces as they were before this page first changed anything. */
async function backupOnce(s: Session, both: Awaited<ReturnType<typeof readBoth>>) {
  const key = backupKey(s.owner);
  if (await s.bucket.head(key)) return;
  const body = JSON.stringify({ createdAt: new Date().toISOString(), note: "Maptable and Encyclopedia data before the Campaigns page changed anything.", maptable: both.map?.workspace ?? null, encyclopedia: both.book.data });
  await s.bucket.put(key, body, { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json" } });
}

const busy = () => new Error("Something else saved at the same moment. Nothing was changed here; reload and try again.");

async function saveMap(s: Session, map: Awaited<ReturnType<typeof loadWorkspace>>, next: MapWorkspace) {
  if (!(await saveWorkspace(s.bucket, s.prefix, next, map?.revision ?? null))) throw busy();
}
async function saveBook(s: Session, revision: number, next: BookWorkspace) {
  if ((await s.book.save(s.owner, next, revision)) === null) throw busy();
}

export function summaryOf(both: { map: { workspace: MapWorkspace } | null; book: { data: BookWorkspace } }) {
  return campaignSummary(both.map?.workspace ?? null, both.book.data);
}


export function backupFile(both: Awaited<ReturnType<typeof readBoth>>) {
  return JSON.stringify({ createdAt: new Date().toISOString(), maptable: both.map?.workspace ?? null, encyclopedia: both.book.data });
}

export type CampaignAction =
  | { action: "pair"; pairs: { encyclopediaId: string; maptableId: string | null }[] }
  | { action: "rename"; encyclopediaId?: string; maptableId?: string; name: string; description?: string }
  | { action: "create"; name: string; description?: string; maptable: boolean; encyclopedia: boolean; worldId?: string; newWorld?: string }
  | { action: "complete"; encyclopediaId?: string; maptableId?: string; worldId?: string; newWorld?: string };

const str = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 120 ? v : undefined;
const describe = (v: unknown) => typeof v === "string" ? v.trim().slice(0, 1000) : "";

function addMapCampaign(map: MapWorkspace, name: string) {
  const id = uid();
  return { id, next: { ...map, collections: [...map.collections, { id, name, kind: "campaign" as const, parentId: null }] } };
}
function addBookCampaign(book: BookWorkspace, body: { worldId?: unknown; newWorld?: unknown }, name: string, description: string, maptableId?: string) {
  let worlds = book.worlds, worldId = str(body.worldId);
  if (!worldId || !worlds.some(w => w.id === worldId && !w.isTemplate)) {
    if (typeof body.newWorld !== "string" || !body.newWorld.trim()) throw new Error("Choose a world for the Encyclopedia notes.");
    worldId = newId();
    worlds = [...worlds, { id: worldId, name: cleanName(body.newWorld), description: "", archived: false }];
  }
  const id = newId();
  return { id, next: { ...book, worlds, campaigns: [...book.campaigns, { id, worldId, name, description, github: { repository: "", branch: "main" }, ...(maptableId ? { maptableCampaignId: maptableId } : {}) }] } };
}

/** Runs one change from the Campaigns page and returns the new list. */
export async function campaignAction(s: Session, body: CampaignAction) {
  const both = await readBoth(s);
  await backupOnce(s, both);
  const mapNow = both.map?.workspace ?? initialWorkspace();
  if (body.action === "pair") {
    if (!Array.isArray(body.pairs) || body.pairs.length > 500) throw new Error("Invalid pairs.");
    const pairs = body.pairs.map(p => ({ encyclopediaId: str(p?.encyclopediaId) ?? "", maptableId: p?.maptableId === null ? null : str(p?.maptableId) ?? "" }));
    await saveBook(s, both.book.revision, applyPairs(both.book.data, both.map?.workspace ?? null, pairs));
  } else if (body.action === "rename") {
    const name = cleanName(body.name), eid = str(body.encyclopediaId), mid = str(body.maptableId);
    if (!eid && !mid) throw new Error("Choose a campaign.");
    if (mid) {
      if (!mapNow.collections.some(c => c.id === mid && c.kind === "campaign")) throw new Error("That Maptable campaign no longer exists. Reload the page.");
      await saveMap(s, both.map, { ...mapNow, collections: mapNow.collections.map(c => c.id === mid ? { ...c, name } : c) });
    }
    if (eid) {
      if (!both.book.data.campaigns.some(c => c.id === eid)) throw new Error("That Encyclopedia campaign no longer exists. Reload the page.");
      const description = body.description === undefined ? undefined : describe(body.description);
      await saveBook(s, both.book.revision, { ...both.book.data, campaigns: both.book.data.campaigns.map(c => c.id === eid ? { ...c, name, ...(description === undefined ? {} : { description }) } : c) });
    }
  } else if (body.action === "create") {
    const name = cleanName(body.name), description = describe(body.description);
    if (!body.maptable && !body.encyclopedia) throw new Error("Choose at least one tool.");
    let mapId: string | undefined;
    // Encyclopedia problems (such as no world chosen) are found before Maptable is changed.
    const book = body.encyclopedia ? addBookCampaign(both.book.data, body, name, description) : null;
    if (body.maptable) { const made = addMapCampaign(mapNow, name); mapId = made.id; await saveMap(s, both.map, made.next); }
    if (book) await saveBook(s, both.book.revision, mapId ? applyPairs(book.next, { collections: [...mapNow.collections, { id: mapId, name, kind: "campaign", parentId: null }] }, [{ encyclopediaId: book.id, maptableId: mapId }]) : book.next);
  } else if (body.action === "complete") {
    const eid = str(body.encyclopediaId), mid = str(body.maptableId);
    if (eid) {
      const campaign = both.book.data.campaigns.find(c => c.id === eid);
      if (!campaign) throw new Error("That Encyclopedia campaign no longer exists. Reload the page.");
      if (campaign.maptableCampaignId && mapNow.collections.some(c => c.id === campaign.maptableCampaignId)) throw new Error("This campaign already has a Maptable campaign.");
      const made = addMapCampaign(mapNow, cleanName(campaign.name));
      await saveMap(s, both.map, made.next);
      await saveBook(s, both.book.revision, applyPairs(both.book.data, made.next, [{ encyclopediaId: eid, maptableId: made.id }]));
    } else if (mid) {
      const campaign = mapNow.collections.find(c => c.id === mid && c.kind === "campaign");
      if (!campaign) throw new Error("That Maptable campaign no longer exists. Reload the page.");
      if (both.book.data.campaigns.some(c => c.maptableCampaignId === mid)) throw new Error("This campaign already has Encyclopedia notes.");
      await saveBook(s, both.book.revision, addBookCampaign(both.book.data, body, campaign.name, "", mid).next);
    } else throw new Error("Choose a campaign.");
  } else throw new Error("Unknown action.");
  return summaryOf(await readBoth(s));
}
