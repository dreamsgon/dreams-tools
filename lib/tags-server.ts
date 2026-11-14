import type { Bucket } from "./storage-types";
import { collectionPath, type Workspace as MapWorkspace } from "./model.ts";
import type { Workspace as BookWorkspace } from "./encyclopedia/world-model.ts";
import { campaignSummary } from "./campaign-links.ts";
import { applyTagAction, emptyTags, importCharacterTags, migrateTagLibrary, tagLibrarySchema, targetKind, type TagAction, type TagLibrary, type TaggedItem } from "./tags.ts";

/** Tags live in one small file per account, next to (not inside) the two tools' saved data. It holds a separate list for each place. */
export const tagsKey = (owner: string) => `users/${encodeURIComponent(owner)}/tags.json`;

export async function readTags(bucket: Bucket, owner: string): Promise<{ data: TagLibrary; etag: string | null }> {
  const object = await bucket.get(tagsKey(owner));
  if (!object) return { data: emptyTags(), etag: null };
  const parsed = tagLibrarySchema.safeParse(migrateTagLibrary(await object.json()));
  if (!parsed.success) throw new Error("Your tags could not be read. Nothing was changed.");
  return { data: parsed.data, etag: object.etag };
}

async function write(bucket: Bucket, owner: string, data: TagLibrary, etag: string | null) {
  const checked = tagLibrarySchema.parse(data);
  const body = JSON.stringify(checked);
  if (body.length > 1_000_000) throw new Error("Your tags are over the 1 MB limit. Delete some tags first.");
  return bucket.put(tagsKey(owner), body, { onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json" } });
}

/** Reads, changes and saves, trying again if another tab saved in between. */
export async function changeTags(bucket: Bucket, owner: string, change: (lib: TagLibrary) => TagLibrary): Promise<TagLibrary> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, etag } = await readTags(bucket, owner);
    const next = change(data);
    if (next === data) return data;
    if (await write(bucket, owner, next, etag)) return next;
  }
  throw new Error("Something else saved your tags at the same moment. Reload and try again.");
}

export const tagAction = (bucket: Bucket, owner: string, action: TagAction) => changeTags(bucket, owner, lib => applyTagAction(lib, action));

/** The first time tags are opened, character tags from before are brought in. */
export async function tagsWithImport(bucket: Bucket, owner: string, book: () => Promise<BookWorkspace>): Promise<TagLibrary> {
  const { data } = await readTags(bucket, owner);
  if (data.imported) return data;
  const entries = (await book()).entries;
  return changeTags(bucket, owner, lib => importCharacterTags(lib, entries));
}


const KIND_LABEL: Record<string, string> = { folder: "Folder", note: "Note", character: "Character", place: "Place", faction: "Organization", lore: "Lore", session: "Session", tasks: "Tasks", map: "Map" };

/**
 * Names and links for everything that has a tag, in every place (the browser shows
 * each place its own). Things that no longer exist are left out (and not counted), but their tags are kept in case a
 * save is still on its way.
 */
export function describeTagged(lib: TagLibrary, map: Pick<MapWorkspace, "collections" | "scenes"> | null, book: BookWorkspace): TaggedItem[] {
  const entries = new Map(book.entries.map(e => [e.id, e]));
  const bookCampaigns = new Map(book.campaigns.map(c => [c.id, c.name]));
  const scenes = new Map((map?.scenes ?? []).map(s => [s.id, s]));
  const rows = campaignSummary(map, book).rows;
  const rowFor = new Map<string, (typeof rows)[number]>();
  for (const r of rows) { rowFor.set(r.key, r); if (r.maptable) rowFor.set(`m:${r.maptable.id}`, r); if (r.encyclopedia) rowFor.set(`e:${r.encyclopedia.id}`, r); }
  const items: TaggedItem[] = [], campaignRows = new Map<string, TaggedItem>();
  for (const [key, tagIds] of Object.entries(lib.on)) {
    if (!tagIds.length) continue;
    const kind = targetKind(key), value = key.slice(key.indexOf(":") + 1);
    if (kind === "entry") {
      const e = entries.get(value); if (!e) continue;
      items.push({ key, kind, title: e.title, entryKind: e.kind, detail: `${KIND_LABEL[e.kind] ?? "Page"} · ${e.campaignId ? bookCampaigns.get(e.campaignId) ?? "Campaign" : "World lore"}`, href: `/encyclopedia?entry=${encodeURIComponent(e.id)}`, tagIds });
    } else if (kind === "scene") {
      const s = scenes.get(value); if (!s || !map) continue;
      items.push({ key, kind, title: s.name, detail: `Scene in Maptable · ${collectionPath(map.collections, s.containerId)}`, href: `/maptable?scene=${encodeURIComponent(s.id)}`, tagIds });
    } else if (kind === "campaign") {
      const r = rowFor.get(value); if (!r) continue;
      // A campaign paired after it was tagged has two keys; show it once with both sets of tags.
      const seen = campaignRows.get(r.key);
      if (seen) { seen.tagIds = [...new Set([...seen.tagIds, ...tagIds])]; continue; }
      const item: TaggedItem = { key: `campaign:${r.key}`, kind, title: r.name, detail: "Campaign", href: `/campaigns/${encodeURIComponent(r.key)}`, tagIds };
      campaignRows.set(r.key, item); items.push(item);
    }
  }
  return items.sort((a, b) => a.title.localeCompare(b.title));
}
