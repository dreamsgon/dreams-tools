/*
 * The browser's half of campaign backups (lib/campaign-backup-server.ts has the server's): build the backup ZIP
 * from a few small requests, and import one back. Pictures go straight between the browser and storage.
 */
import { zipFiles } from "./bridge/zip.ts";
import { readZip } from "./zip-read.ts";
import { readJsonResponse, stageTransfer } from "./transfer-client.ts";
import {
  BACKUP_JSON, FILES_DIR, IMAGES_DIR, checkBackup, fileOrder, forumSetupOnly, imageExtension, isBackupFile, isImageId, remapFile, sniffImage,
  type CampaignBackup, type ImageRef, type ImageTool,
} from "./campaign-backup.ts";
import type { CampaignSummary } from "./campaign-links.ts";

export type Progress = (text: string) => void;
const URL_ = "/api/campaigns/backup";
const enc = new TextEncoder(), dec = new TextDecoder();
/** A backup ZIP can be big: every picture is in it. */
const ZIP_LIMITS = { files: 50_000, bytes: 1500 * 1024 * 1024 };
const INLINE = 2_500_000, BATCH_CHARS = 1_000_000;

async function call<T>(body: object): Promise<T> {
  const text = JSON.stringify(body);
  const init: RequestInit = enc.encode(text).length > INLINE
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transferId: await stageTransfer(new Blob([text], { type: "application/json" }), "workspace") }) }
    : { method: "POST", headers: { "Content-Type": "application/json" }, body: text };
  const r = await fetch(URL_, init);
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Something went wrong. Try again."); }
  return readJsonResponse<T>(r);
}
const chunks = <T,>(list: readonly T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
export const slug = (name: string) => name.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase().slice(0, 60) || "campaign";
const imagePath = (tool: ImageTool, id: string, type: string) => `${IMAGES_DIR}${tool}/${id}.${imageExtension(type)}`;

const README = (b: CampaignBackup, missing: number) => `RPG Tools campaign backup: ${b.name}
Made ${b.exportedAt}.

To bring it back, open Campaigns in RPG Tools and choose Import, then pick this ZIP.
It becomes a new campaign; nothing already in your account is changed.

${BACKUP_JSON}  the campaign's maps, notes, tables and member groups
${FILES_DIR}      its forum, saved AI chats and session transcripts
${IMAGES_DIR}     its pictures

Not included, on purpose: player and agent links, AI connections and API keys, bridge keys,
Discord webhooks, and the people in the campaign (they can join again with a new invite).
${missing ? `\n${missing} picture${missing === 1 ? " was" : "s were"} not found in storage and are not in this backup.\n` : ""}`;

/** Reads a campaign's files (the paths `start` or `duplicate` listed) in batches, with any AI chat part files. */
async function readCampaignFiles(key: string, paths: string[], progress: Progress) {
  const out: { path: string; text: string }[] = [];
  const queue = [...paths], done = new Set<string>();
  while (queue.length) {
    const batch = queue.splice(0, 100).filter(p => !done.has(p));
    progress(`Reading files (${done.size + batch.length} of ${done.size + batch.length + queue.length})…`);
    const { files } = await call<{ files: Record<string, string | null> }>({ action: "files", key, paths: batch });
    for (const [path, text] of Object.entries(files)) {
      done.add(path);
      if (text === null) continue;
      out.push({ path, text });
      // A long AI chat keeps its older turns in part files.
      const parts = /^ai-chats\/[A-Za-z0-9-]+\.json$/.test(path) && !/(index|older)\.json$/.test(path) ? Number((JSON.parse(text) as { parts?: number }).parts ?? 0) : 0;
      for (let n = 1; n <= Math.min(parts, 10_000); n++) { const p = path.replace(/\.json$/, `.part-${n}.json`); if (isBackupFile(p) && !done.has(p)) queue.push(p); }
    }
  }
  return out;
}

/** Writes files into a campaign that was just added, given its new ids: batches of up to 200 files or about 1 MB. */
async function writeCampaignFiles(campaignId: string, files: { path: string; text: string }[], ids: Record<string, string>, progress: Progress) {
  const ready = files.map(f => remapFile(f.path, f.text, ids)).filter(f => isBackupFile(f.path)).sort(fileOrder);
  let n = 0, batch: typeof ready = [], size = 0;
  const send = async () => { if (!batch.length) return; progress(`Adding the forum, chats and transcripts (${n} of ${ready.length})…`); await call({ action: "importFiles", campaignId, files: batch }); n += batch.length; batch = []; size = 0; };
  for (const f of ready) {
    // The forum file goes on its own, after every topic is in place.
    if (f.path === "forum/forum.json") await send();
    if (batch.length >= 200 || size + f.text.length > BATCH_CHARS) await send();
    batch.push(f); size += f.text.length;
  }
  await send();
}

/** Builds the backup ZIP for one campaign. */
export async function campaignBackupZip(key: string, progress: Progress): Promise<{ blob: Blob; name: string; missing: number }> {
  progress("Reading the campaign…");
  const start = await call<{ backup: CampaignBackup; files: string[]; images: ImageRef[] }>({ action: "start", key });
  const out: { name: string; data: Uint8Array }[] = (await readCampaignFiles(key, start.files, progress)).map(f => ({ name: FILES_DIR + f.path, data: enc.encode(f.text) }));
  let missing = 0, got = 0;
  for (const batch of chunks(start.images, 12)) {
    progress(`Copying pictures (${got} of ${start.images.length})…`);
    const { images } = await call<{ images: (ImageRef & { url: string })[] }>({ action: "images", images: batch });
    missing += batch.length - images.length;
    await Promise.all(images.map(async img => {
      const r = await fetch(img.url, { credentials: "omit", cache: "no-store", redirect: "error" });
      if (!r.ok) { missing++; return; }
      const data = new Uint8Array(await r.arrayBuffer()), type = sniffImage(data);
      if (!type) { missing++; return; }
      out.push({ name: imagePath(img.tool, img.id, type), data });
    }));
    got += batch.length;
  }
  progress("Packing the ZIP…");
  const all = [{ name: "README.txt", data: enc.encode(README(start.backup, missing)) }, { name: BACKUP_JSON, data: enc.encode(JSON.stringify(start.backup)) }, ...out];
  const day = start.backup.exportedAt.slice(0, 10);
  return { blob: new Blob([zipFiles(all) as BlobPart], { type: "application/zip" }), name: `${slug(start.backup.name)}-backup-${day}.zip`, missing };
}

/** Reads a backup ZIP: its data, files and pictures. Nothing is sent anywhere. */
export async function readBackupZip(file: Blob) {
  const entries = await readZip(new Uint8Array(await file.arrayBuffer()), ZIP_LIMITS);
  const main = entries.find(e => e.name === BACKUP_JSON);
  if (!main) throw new Error("This ZIP has no campaign.json. Choose a ZIP made by Download backup.");
  let value: unknown;
  try { value = JSON.parse(dec.decode(main.data).replace(/^﻿/, "")); } catch { throw new Error("The campaign.json in this ZIP is damaged."); }
  const checked = checkBackup(value);
  if (!checked.ok) throw new Error(checked.error);
  const files = entries.filter(e => e.name.startsWith(FILES_DIR) && isBackupFile(e.name.slice(FILES_DIR.length))).map(e => ({ path: e.name.slice(FILES_DIR.length), text: dec.decode(e.data) }));
  const images = entries.flatMap(e => {
    const m = /^images\/(maptable|encyclopedia)\/([0-9a-fA-F-]{36})\.(png|jpg|webp)$/.exec(e.name);
    const type = m ? sniffImage(e.data) : null;
    return m && type && isImageId(m[2]) ? [{ tool: m[1] as ImageTool, id: m[2].toLowerCase(), type, data: e.data }] : [];
  });
  return { backup: checked.backup, files, images };
}

/** Imports a backup ZIP as a new campaign. Returns its key and the updated campaign list. */
export async function importBackupZip(file: Blob, progress: Progress): Promise<{ key: string; name: string; summary: CampaignSummary }> {
  progress("Reading the ZIP…");
  const { backup, files, images } = await readBackupZip(file);
  if (images.length) {
    progress("Checking pictures…");
    const have = new Set<string>();
    for (const batch of chunks(images, 100)) {
      const r = await call<{ have: ImageRef[] }>({ action: "have", images: batch.map(i => ({ tool: i.tool, id: i.id })) });
      for (const h of r.have) have.add(`${h.tool}:${h.id}`);
    }
    const upload = images.filter(i => !have.has(`${i.tool}:${i.id}`));
    let n = 0;
    for (const batch of chunks(upload, 4)) {
      progress(`Uploading pictures (${n} of ${upload.length})…`);
      await Promise.all(batch.map(async i => {
        const transferId = await stageTransfer(new Blob([i.data as BlobPart], { type: i.type }), "image");
        await call({ action: "putImage", tool: i.tool, id: i.id, transferId });
      }));
      n += batch.length;
    }
  }
  progress("Adding the campaign…");
  const made = await call<{ key: string; name: string; encyclopediaId: string | null; ids: Record<string, string>; summary: CampaignSummary }>({ action: "import", backup });
  if (made.encyclopediaId && files.length) await writeCampaignFiles(made.encyclopediaId, files, made.ids, progress);
  return { key: made.key, name: made.name, summary: made.summary };
}

export type DuplicateChoices = { name: string; copyWorld: boolean; posts: boolean; chats: boolean };
/**
 * Duplicates a campaign: the server adds the copy, then its forum, theme, transcripts (and the posts and AI chats
 * when chosen) are copied across. Pictures are shared within the account, so none are copied.
 */
export async function duplicateCampaign(key: string, choices: DuplicateChoices, progress: Progress): Promise<{ key: string; name: string; summary: CampaignSummary; warning: string }> {
  progress("Copying the campaign…");
  const made = await call<{ key: string; name: string; encyclopediaId: string | null; ids: Record<string, string>; files: string[]; summary: CampaignSummary }>({ action: "duplicate", key, ...choices });
  let warning = "";
  if (made.encyclopediaId && made.files.length) {
    try {
      const files = (await readCampaignFiles(key, made.files, progress)).map(f => f.path === "forum/forum.json" && !choices.posts ? { ...f, text: forumSetupOnly(f.text) } : f);
      await writeCampaignFiles(made.encyclopediaId, files, made.ids, progress);
    } catch (e) {
      // The copy itself is saved by now; say what is missing rather than hide it.
      warning = `${made.name} was made, but its forum, theme or transcripts were not all copied (${e instanceof Error ? e.message : "something went wrong"}).`;
    }
  }
  return { key: made.key, name: made.name, summary: made.summary, warning };
}

export async function deleteCampaign(key: string, confirm: string): Promise<{ deleted: string; summary: CampaignSummary }> {
  return call({ action: "delete", key, confirm });
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
