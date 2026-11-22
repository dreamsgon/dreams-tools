/*
 * Campaign backups, imports and deletion against storage. The pure parts are in lib/campaign-backup.ts.
 *
 * A backup is built in the browser from several small requests so no single request has to read thousands of
 * files: `start` gives the workspaces' part and the list of files and pictures, `files` reads a batch of files,
 * and `images` gives short-lived addresses for a batch of pictures. An import goes the other way: pictures not
 * already in the account (`have`, `putImage`), then the workspaces (`importCampaign`), then the files in batches
 * (`importFiles`). Deleting keeps a private copy of the campaign's data first, then revokes every key and link
 * that reached it.
 *
 * Duplicating is a backup imported straight back, without the ZIP: `duplicateCampaign` adds the copy and lists the
 * original's files, and the browser then moves those across with `files` and `importFiles`, as an import would.
 */
import type { S3Bucket } from "./storage.ts";
import { campaignSession, readBoth, summaryOf, type Session } from "./campaigns-server.ts";
import { rowByKey } from "./campaign-links.ts";
import { saveWorkspace } from "./workspace-storage.ts";
import { encyclopediaPrefix } from "./encyclopedia/store.ts";
import { forumKey, presenceKey, readsKey, alertsKey } from "./forum/store.ts";
import { forumSchema, topicSchema } from "./forum/model.ts";
import { MemberStore, listKey } from "./members-server.ts";
import { emptyMemberList, memberListSchema } from "./members.ts";
import { readHome, changeHome } from "./home-store.ts";
import { applyHomeAction } from "./home-layout.ts";
import { listChats, deleteChat } from "./ai/chats.ts";
import { listBridgeKeys, revokeBridgeKey } from "./bridge/keys.ts";
import { listConnections, revokeConnection } from "./mcp/connections.ts";
import { readTransfer } from "./transfers.ts";
import { MAX_IMAGE_BYTES } from "./encyclopedia/map-model.ts";
import { themeKey } from "./campaign-theme/store.ts";
import { themeFileSchema } from "./campaign-theme/model.ts";
import {
  buildBackup, checkBackup, imageRefs, isBackupFile, isImageId, planImport, removeBookCampaign, removeMapCampaign, removeTablesCampaign, sniffImage,
  type CampaignBackup, type ImageRef, type ImageTool, type ImportOptions,
} from "./campaign-backup.ts";

export { campaignSession };
const busy = () => new Error("Something else saved at the same moment. Nothing was changed; reload and try again.");
const json = (value: unknown) => JSON.stringify(value);
const jsonType = { httpMetadata: { contentType: "application/json" } };
/** Runs `work` over `items`, a few at a time. */
async function each<T, R>(items: readonly T[], work: (item: T) => Promise<R>, at = 16): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += at) out.push(...await Promise.all(items.slice(i, i + at).map(work)));
  return out;
}

function rowOf(both: Awaited<ReturnType<typeof readBoth>>, key: unknown) {
  const row = typeof key === "string" ? rowByKey(summaryOf(both).rows, key) : undefined;
  if (!row) throw new Error("That campaign no longer exists. Reload the page.");
  return row;
}

/** Where one of a backup's files is kept for this campaign and its pages. */
function fileKey(owner: string, campaignId: string, path: string) {
  if (!isBackupFile(path)) throw new Error("That isn't a campaign file.");
  const base = encyclopediaPrefix(owner), c = encodeURIComponent(campaignId);
  if (path === "theme.json") return themeKey(owner, campaignId);
  if (path.startsWith("forum/")) return `${base}forum/${c}/${path.slice("forum/".length)}`;
  if (path.startsWith("ai-chats/")) return `${base}ai-chats/${c}/${path.slice("ai-chats/".length)}`;
  return `${base}${path}`; // transcripts/<page id>.txt
}
const imageKey = (s: Session, ref: ImageRef) => {
  if (!isImageId(ref.id)) throw new Error("Invalid picture id.");
  return (ref.tool === "maptable" ? s.prefix : encyclopediaPrefix(s.owner)) + "images/" + ref.id;
};
const asRefs = (v: unknown): ImageRef[] => {
  if (!Array.isArray(v) || v.length > 100) throw new Error("Ask for at most 100 pictures at a time.");
  return v.map(r => ({ tool: (r?.tool === "maptable" ? "maptable" : "encyclopedia") as ImageTool, id: String(r?.id ?? "") }));
};

/* ---- Backup ---- */

async function backupData(s: Session, bucket: S3Bucket, both: Awaited<ReturnType<typeof readBoth>>, key: string, now = new Date()) {
  const row = rowOf(both, key), eid = row.encyclopedia?.id ?? null, mid = row.maptable?.id ?? null;
  const [tables, members, home] = await Promise.all([
    eid ? s.book.readTables(s.owner).then(t => t.data) : null,
    eid ? new MemberStore(bucket).read(s.owner, eid).then(r => r.etag ? { groups: r.list.groups, ...(r.list.pages ? { pages: r.list.pages } : {}) } : null) : null,
    !eid && mid ? readHome(bucket, s.owner).catch(() => null) : null,
  ]);
  return buildBackup({
    name: row.name, now: now.toISOString(), map: both.map?.workspace ?? null, maptableId: mid, book: both.book.data, encyclopediaId: eid,
    tables, members, dashboard: (mid && home?.layout.campaignDashboards?.[`m:${mid}`]) || null,
  });
}

/** The files a campaign has beside its workspaces, and the pictures its forum adds. */
async function campaignFiles(s: Session, bucket: S3Bucket, backup: CampaignBackup) {
  const eid = backup.encyclopedia?.campaignId;
  if (!eid) return { files: [] as string[], images: [] as ImageRef[] };
  const files: string[] = [], images: ImageRef[] = [];
  if (await bucket.head(themeKey(s.owner, eid)).catch(() => null)) files.push("theme.json");
  const forum = await bucket.get(forumKey(s.owner, eid));
  if (forum) {
    const parsed = forumSchema.safeParse(await forum.json().catch(() => null));
    files.push("forum/forum.json");
    if (parsed.success) {
      for (const t of parsed.data.topics) files.push(`forum/topics/${t.id}.json`);
      for (const u of parsed.data.uploads ?? []) images.push({ tool: "encyclopedia", id: u.id });
    }
  }
  const chats = await listChats(bucket, s.owner, eid).catch(() => []);
  if (chats.length) files.push("ai-chats/index.json", "ai-chats/older.json", ...chats.map(c => `ai-chats/${c.id}.json`));
  const sessions = backup.encyclopedia!.workspace.entries.filter(e => e.campaignId === eid && e.kind === "session");
  const found = await each(sessions, async e => await bucket.head(fileKey(s.owner, eid, `transcripts/${e.id}.txt`)).catch(() => null) ? `transcripts/${e.id}.txt` : null);
  files.push(...found.filter((f): f is string => !!f));
  return { files: files.filter(isBackupFile), images };
}

/** The first step of a backup: the campaign's data, the files to read next and the pictures to fetch. */
export async function startBackup(s: Session, bucket: S3Bucket, key: string) {
  const both = await readBoth(s), backup = await backupData(s, bucket, both, key);
  const extra = await campaignFiles(s, bucket, backup);
  const seen = new Set<string>(), images = [...imageRefs(backup), ...extra.images].filter(r => isImageId(r.id) && !seen.has(`${r.tool}:${r.id}`) && !!seen.add(`${r.tool}:${r.id}`));
  return { backup, files: extra.files, images };
}

/** A batch of the campaign's files, as text; null for one that is not there. */
export async function readFiles(s: Session, bucket: S3Bucket, key: string, paths: unknown) {
  if (!Array.isArray(paths) || paths.length > 200) throw new Error("Ask for at most 200 files at a time.");
  const both = await readBoth(s), row = rowOf(both, key), eid = row.encyclopedia?.id;
  if (!eid) throw new Error("Only a campaign with a Wiki has files.");
  const out: Record<string, string | null> = {};
  await each(paths.filter(isBackupFile), async path => {
    const object = await bucket.get(fileKey(s.owner, eid, path));
    out[path] = object ? new TextDecoder().decode(await object.arrayBuffer()) : null;
  });
  return { files: out };
}

/** Addresses, good for five minutes, for a batch of pictures; null for one that is not in this account. */
export async function imageUrls(s: Session, bucket: S3Bucket, refs: unknown) {
  const urls = await each(asRefs(refs), async ref => {
    if (!isImageId(ref.id)) return null;
    const k = imageKey(s, ref);
    return await bucket.head(k) ? { ...ref, url: await bucket.signedGet(k) } : null;
  });
  return { images: urls.filter(Boolean) };
}

/* ---- Import ---- */

/** Which of these pictures the account already has. */
export async function haveImages(s: Session, bucket: S3Bucket, refs: unknown) {
  const found = await each(asRefs(refs), async ref => isImageId(ref.id) && await bucket.head(imageKey(s, ref)) ? ref : null);
  return { have: found.filter(Boolean) };
}

/** Stores one picture from a backup under its own id, uploaded to the account's staging area first. An existing one is kept. */
export async function putImage(s: Session, bucket: S3Bucket, body: { tool?: unknown; id?: unknown; transferId?: unknown }) {
  const ref = asRefs([body])[0];
  if (!isImageId(ref.id)) throw new Error("Invalid picture id.");
  const transfer = await readTransfer(bucket, s.prefix, "image", body.transferId);
  await bucket.delete(transfer.key).catch(() => {});
  const bytes = new Uint8Array(transfer.bytes), type = sniffImage(bytes);
  if (!type || type !== transfer.type) throw new Error("That picture is not a PNG, JPEG or WebP image.");
  if (ref.tool === "encyclopedia" && bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("A Wiki picture can be at most 8 MB.");
  await bucket.put(imageKey(s, ref), bytes, { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: type } });
  return { ok: true };
}

/** Adds the backup as a new campaign. Returns its key and the new ids the files must use. */
export async function importCampaign(s: Session, bucket: S3Bucket, input: unknown) {
  const checked = checkBackup(input);
  if (!checked.ok) throw new Error(checked.error);
  return addCampaign(s, bucket, await readBoth(s), checked.backup, {}, "Some of the data in this backup is damaged or from a newer version, so nothing was imported.");
}

/** Saves a backup as a new campaign beside the others (an import, or a duplicate). */
async function addCampaign(s: Session, bucket: S3Bucket, both: Awaited<ReturnType<typeof readBoth>>, backup: CampaignBackup, options: ImportOptions, damaged: string) {
  const tablesNow = await s.book.readTables(s.owner);
  let plan: ReturnType<typeof planImport>;
  try { plan = planImport(backup, { map: both.map?.workspace ?? null, book: both.book.data, tables: tablesNow.data }, undefined, options); }
  catch (e) { throw new Error(e instanceof Error && !("issues" in e) ? e.message : damaged); }
  // Everything is checked above before anything is saved. The Encyclopedia goes first: it has the stricter size limit.
  if (plan.book && (await s.book.save(s.owner, plan.book, both.book.revision)) === null) throw busy();
  if (plan.map && !(await saveWorkspace(bucket, s.prefix, plan.map, both.map?.revision ?? null))) throw busy();
  if (plan.tables) await s.book.saveTables(s.owner, plan.tables, tablesNow.revision).catch(() => null);
  if (plan.encyclopediaId && plan.members) {
    const list = memberListSchema.safeParse({ ...emptyMemberList(plan.encyclopediaId), groups: plan.members.groups, ...(plan.members.pages ? { pages: plan.members.pages } : {}) });
    if (list.success) await bucket.put(listKey(s.owner, plan.encyclopediaId), json(list.data), { onlyIf: { etagDoesNotMatch: "*" }, ...jsonType });
  }
  if (!plan.encyclopediaId && plan.maptableId && plan.dashboard)
    await changeHome(bucket, s.owner, l => applyHomeAction(l, { action: "campaignDashboard", key: `m:${plan.maptableId}`, dashboard: plan.dashboard })).catch(() => {});
  const key = plan.encyclopediaId ? `e:${plan.encyclopediaId}` : `m:${plan.maptableId}`;
  return { key, name: plan.name, encyclopediaId: plan.encyclopediaId, ids: plan.ids, summary: summaryOf(await readBoth(s)) };
}

/** What a duplicate takes along besides the campaign itself. Boards, theme and session transcripts always go. */
export type DuplicateOptions = { name: string; copyWorld: boolean; posts: boolean; chats: boolean };

/**
 * Adds a copy of a campaign beside it: its maps, tokens, pages, tables, member groups, theme and forum boards,
 * with new ids, under a new name and in the same folder. Never its members, links, keys or web address. Returns
 * the copy's key, the new ids, and the original's files for the browser to copy across next (`files`, then
 * `importFiles`).
 */
export async function duplicateCampaign(s: Session, bucket: S3Bucket, key: string, input: Record<string, unknown>) {
  const options: DuplicateOptions = { name: typeof input.name === "string" ? input.name : "", copyWorld: input.copyWorld === true, posts: input.posts === true, chats: input.chats === true };
  if (!options.name.trim()) throw new Error("Give the copy a name.");
  const both = await readBoth(s), row = rowOf(both, key), backup = await backupData(s, bucket, both, key);
  const extra = await campaignFiles(s, bucket, backup);
  const made = await addCampaign(s, bucket, both, backup, { name: options.name, copyWorld: options.copyWorld, folderId: row.folderId }, "Some of this campaign's data could not be read, so nothing was copied.");
  const files = extra.files.filter(f => f.startsWith("forum/topics/") ? options.posts : f.startsWith("ai-chats/") ? options.chats : true);
  return { ...made, from: key, files, posts: options.posts };
}

/** Writes a batch of an imported campaign's files (already given their new ids). A file that is already there is left alone. */
export async function importFiles(s: Session, bucket: S3Bucket, campaignId: unknown, files: unknown) {
  if (typeof campaignId !== "string" || !Array.isArray(files) || files.length > 200) throw new Error("Send at most 200 files at a time.");
  const { data } = await s.book.read(s.owner);
  if (!data.campaigns.some(c => c.id === campaignId)) throw new Error("That campaign no longer exists. Reload the page.");
  const pages = new Set(data.entries.filter(e => e.campaignId === campaignId).map(e => e.id));
  let written = 0;
  await each(files, async (f: { path?: unknown; text?: unknown }) => {
    const path = f?.path, text = f?.text;
    if (!isBackupFile(path) || typeof text !== "string" || text.length > 4_000_000) throw new Error("One of the campaign's files is damaged.");
    let body = text, type = "application/json";
    if (path === "forum/forum.json") body = json(forumSchema.parse(JSON.parse(text)));
    else if (path.startsWith("forum/topics/")) {
      const topic = topicSchema.parse(JSON.parse(text));
      if (`forum/topics/${topic.id}.json` !== path) throw new Error("One of the forum's topics is damaged.");
      body = json(topic);
    } else if (path.startsWith("ai-chats/")) JSON.parse(text);
    else if (path === "theme.json") body = json(themeFileSchema.parse(JSON.parse(text)));
    else {
      if (!pages.has(path.slice("transcripts/".length, -".txt".length))) return;
      type = "text/plain; charset=utf-8";
    }
    if (await bucket.put(fileKey(s.owner, campaignId, path), body, { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: type } })) written++;
  }, 8);
  return { written };
}

/* ---- Delete ---- */

export const deletedKey = (owner: string, campaignId: string, now: Date) => encyclopediaPrefix(owner) + `backups/deleted/${now.toISOString().replace(/[:.]/g, "-")}-${encodeURIComponent(campaignId)}.json`;

/**
 * Deletes a campaign from both tools. `confirm` must be its name, as the GM typed it. A copy of its data (not its
 * pictures, which stay in the account) is kept privately first; then its maps, pages and tables go, and every key,
 * link and member that reached it is cut off. Files beside it (forum, AI chats, transcripts) are deleted last.
 */
export async function deleteCampaign(s: Session, bucket: S3Bucket, key: string, confirm: unknown, now = new Date()) {
  const both = await readBoth(s), row = rowOf(both, key);
  if (typeof confirm !== "string" || confirm.trim().toLocaleLowerCase() !== row.name.trim().toLocaleLowerCase()) throw new Error(`Type the campaign's name, ${row.name}, to delete it.`);
  const eid = row.encyclopedia?.id ?? null, mid = row.maptable?.id ?? null;
  const backup = await backupData(s, bucket, both, key, now), extra = await campaignFiles(s, bucket, backup);
  const kept = deletedKey(s.owner, eid ?? mid!, now);
  if (!await bucket.put(kept, json({ ...backup, files: extra.files }), { onlyIf: { etagDoesNotMatch: "*" }, ...jsonType })) throw busy();

  // Members and their lists of campaigns are read before the member list goes.
  const members = eid ? await new MemberStore(bucket).read(s.owner, eid).catch(() => null) : null;
  if (eid) {
    const tables = await s.book.readTables(s.owner);
    if ((await s.book.save(s.owner, removeBookCampaign(both.book.data, eid, mid), both.book.revision)) === null) throw busy();
    const next = removeTablesCampaign(tables.data, eid);
    if (next !== tables.data) await s.book.saveTables(s.owner, next, tables.revision).catch(() => null);
  }
  if (mid && both.map) {
    if (!(await saveWorkspace(bucket, s.prefix, removeMapCampaign(both.map.workspace, mid), both.map.revision))) throw busy();
    await changeHome(bucket, s.owner, l => l.campaignDashboards?.[`m:${mid}`] ? applyHomeAction(l, { action: "campaignDashboard", key: `m:${mid}`, dashboard: null }) : l).catch(() => {});
  }

  // From here on the campaign is gone; what follows tidies up and never fails the delete.
  const quietly = (work: Promise<unknown>) => work.catch(() => undefined);
  const tasks: Promise<unknown>[] = [];
  if (mid) {
    const access = await bucket.get(`${s.prefix}agent-access/${encodeURIComponent(mid)}.json`).catch(() => null);
    const hash = access ? (await access.json<{ hash?: string }>().catch(() => ({ hash: undefined }))).hash : undefined;
    if (hash && /^[a-f0-9]{64}$/.test(hash)) tasks.push(quietly(bucket.delete(`agent-keys/${hash}.json`)));
    tasks.push(quietly(bucket.delete(`${s.prefix}agent-access/${encodeURIComponent(mid)}.json`)), quietly(bucket.delete(`${s.prefix}campaign-settings/${encodeURIComponent(mid)}.json`)));
  }
  if (eid) {
    const base = encyclopediaPrefix(s.owner), c = encodeURIComponent(eid);
    tasks.push(quietly(s.book.revokeLink(s.owner, eid, "player")), quietly(s.book.revokeLink(s.owner, eid, "agent")));
    tasks.push(quietly(listBridgeKeys(bucket, s.owner, eid).then(keys => Promise.all(keys.map(k => revokeBridgeKey(bucket, s.owner, eid, k.id)))).then(() => bucket.delete(`${base}bridge-keys/${c}.json`))));
    tasks.push(quietly(listConnections(bucket, s.owner, eid).then(list => Promise.all(list.map(k => revokeConnection(bucket, s.owner, eid, k.id)))).then(() => bucket.delete(`${base}ai-connections/${c}.json`))));
    tasks.push(quietly(bucket.delete(`${base}ai-activity/${c}.json`)), quietly(bucket.delete(themeKey(s.owner, eid))));
    if (members?.etag) {
      const store = new MemberStore(bucket);
      for (const link of members.list.links) tasks.push(quietly(store.linkOff(s.owner, eid, link.groupId)));
    }
  }
  await Promise.all(tasks);
  if (eid && members?.etag) {
    await quietly(bucket.delete(listKey(s.owner, eid)));
    // Each member's list of campaigns drops this one.
    const people = [...new Set([...members.list.members.map(m => m.userId), ...members.list.requests.map(r => r.userId)])];
    const store = new MemberStore(bucket);
    await each(people, id => quietly(store.syncMembership(s.owner, eid, id)), 8);
  }
  if (eid) {
    const readers = [s.owner, ...(members?.list.members.map(m => m.userId) ?? [])];
    const forumFiles = extra.files.filter(f => f.startsWith("forum/")).map(f => fileKey(s.owner, eid, f));
    const others = [presenceKey(s.owner, eid), ...readers.flatMap(u => [readsKey(s.owner, eid, u), alertsKey(s.owner, eid, u)])];
    const transcripts = extra.files.filter(f => f.startsWith("transcripts/")).map(f => fileKey(s.owner, eid, f));
    // Topics first and the forum file last, so a half-finished delete never leaves a forum listing missing topics.
    await each([...forumFiles.filter(k => k !== forumKey(s.owner, eid)), ...others, ...transcripts], k => quietly(bucket.delete(k)));
    await quietly(bucket.delete(forumKey(s.owner, eid)));
    const chats = await listChats(bucket, s.owner, eid).catch(() => []);
    await each(chats, c => quietly(deleteChat(bucket, s.owner, eid, c.id)), 8);
    await quietly(bucket.delete(fileKey(s.owner, eid, "ai-chats/index.json")));
    await quietly(bucket.delete(fileKey(s.owner, eid, "ai-chats/older.json")));
  }
  return { deleted: row.name, summary: summaryOf(await readBoth(s)) };
}
