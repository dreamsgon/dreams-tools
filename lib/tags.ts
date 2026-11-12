import { z } from "zod";

/*
 * Tags: your own coloured labels, shared by Maptable and the Encyclopedia.
 * One small file per account holds every tag and everything it is on, so renaming,
 * recolouring, merging and deleting change one place and never touch pages or maps.
 *
 * What a tag is on is a "target" key:
 *   entry:<id>     an Encyclopedia page
 *   scene:<id>     a Maptable scene
 *   campaign:<key> a campaign row on the Campaigns page (e:<id> or m:<id>)
 */

export const TAG_COLORS = ["red", "orange", "amber", "green", "teal", "blue", "purple", "pink", "slate"] as const;
export type TagColor = (typeof TAG_COLORS)[number];
export const TAG_COLOR_NAMES: Record<TagColor, string> = { red: "Red", orange: "Orange", amber: "Amber", green: "Green", teal: "Teal", blue: "Blue", purple: "Purple", pink: "Pink", slate: "Grey" };

export const TAG_LIMIT = 500, TAGS_PER_ITEM = 30, TAG_NAME_LIMIT = 40, TARGET_LIMIT = 20_000;
const id = z.string().min(1).max(60).regex(/^[a-zA-Z0-9_-]+$/);
const target = z.string().min(3).max(140).regex(/^(entry|scene|campaign):[a-zA-Z0-9_:-]+$/);
export const tagSchema = z.object({ id, name: z.string().trim().min(1).max(TAG_NAME_LIMIT), color: z.enum(TAG_COLORS) });
export const tagLibrarySchema = z.object({
  tags: z.array(tagSchema).max(TAG_LIMIT),
  on: z.record(target, z.array(id).max(TAGS_PER_ITEM)),
  /** Set once old character tags have been brought in. */
  imported: z.boolean().optional(),
}).superRefine((lib, ctx) => {
  if (new Set(lib.tags.map(t => t.id)).size !== lib.tags.length) ctx.addIssue({ code: "custom", message: "Tag IDs must be unique" });
  if (new Set(lib.tags.map(t => tagKey(t.name))).size !== lib.tags.length) ctx.addIssue({ code: "custom", message: "Tag names must be unique" });
  if (Object.keys(lib.on).length > TARGET_LIMIT) ctx.addIssue({ code: "custom", message: "Too many tagged items" });
});
export type Tag = z.infer<typeof tagSchema>;
export type TagLibrary = z.infer<typeof tagLibrarySchema>;
export type TargetKind = "entry" | "scene" | "campaign";

/** Something tagged, with its name and a link, for search and the Tags manager. */
export type TaggedItem = { key: string; kind: TargetKind; title: string; detail: string; href: string; entryKind?: string; tagIds: string[] };

export const emptyTags = (): TagLibrary => ({ tags: [], on: {} });
export const targetKey = (kind: TargetKind, value: string) => `${kind}:${value}`;
export const targetKind = (key: string) => key.slice(0, key.indexOf(":")) as TargetKind;

/** How names are compared: case, extra spaces and a leading # do not matter. */
export const tagKey = (name: string) => name.trim().replace(/^#+/, "").trim().replace(/\s+/g, " ").toLowerCase();
export const cleanTagName = (name: string) => name.trim().replace(/^#+/, "").trim().replace(/\s+/g, " ").slice(0, TAG_NAME_LIMIT);
export const findTag = (lib: TagLibrary, name: string) => lib.tags.find(t => tagKey(t.name) === tagKey(name));
export const newTagId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** A colour for a new tag: the first one not used yet, so new tags look different. */
export function nextColor(lib: TagLibrary): TagColor {
  const used = new Set(lib.tags.map(t => t.color));
  return TAG_COLORS.find(c => !used.has(c)) ?? TAG_COLORS[lib.tags.length % TAG_COLORS.length];
}

/** The tags on one or more targets (a campaign can have two keys), in the order they were added, without repeats. */
export function tagsOn(lib: TagLibrary, ...targets: string[]): Tag[] {
  const byId = new Map(lib.tags.map(t => [t.id, t]));
  const ids = [...new Set(targets.flatMap(t => lib.on[t] ?? []))];
  return ids.flatMap(i => byId.get(i) ?? []);
}

/** Every key a campaign row may have been tagged under: pairing a campaign changes its row key. */
export function campaignTargets(row: { key: string; maptable: { id: string } | null; encyclopedia: { id: string } | null }): string[] {
  return [...new Set([`campaign:${row.key}`, ...(row.encyclopedia ? [`campaign:e:${row.encyclopedia.id}`] : []), ...(row.maptable ? [`campaign:m:${row.maptable.id}`] : [])])];
}

/** For each tag, how many things it is on and what kinds they are. */
export function tagUses(lib: TagLibrary) {
  const uses = new Map<string, { count: number; kinds: Set<TargetKind> }>(lib.tags.map(t => [t.id, { count: 0, kinds: new Set() }]));
  for (const [key, ids] of Object.entries(lib.on)) for (const i of ids) { const u = uses.get(i); if (u) { u.count++; u.kinds.add(targetKind(key)); } }
  return uses;
}

const KIND_WORDS: Record<TargetKind, string> = { entry: "Pages", scene: "Maps", campaign: "Campaigns" };
export const kindsLabel = (kinds: Set<TargetKind>) => (["entry", "scene", "campaign"] as const).filter(k => kinds.has(k)).map((k, i) => i ? KIND_WORDS[k].toLowerCase() : KIND_WORDS[k]).join(", ");

/** Every target that has all of the given tags. */
export function targetsWith(lib: TagLibrary, tagIds: string[]): string[] {
  if (!tagIds.length) return [];
  return Object.entries(lib.on).filter(([, ids]) => tagIds.every(t => ids.includes(t))).map(([key]) => key);
}

/** Splits a search like "#villain goblin #act-2" into tag names and the remaining words. */
export function parseTagQuery(query: string): { tags: string[]; words: string } {
  const tags: string[] = [];
  const words = query.replace(/(^|\s)#([^\s#]+)/g, (_, space: string, name: string) => { tags.push(name.replace(/[-_]/g, " ")); return space; }).replace(/\s+/g, " ").trim();
  return { tags, words };
}

/** The tag a typed "#vil" is completing, if the query ends with one. */
export function partialTag(query: string): string | null {
  const m = /(?:^|\s)#([^\s#]*)$/.exec(query);
  return m ? m[1] : null;
}

/** Tags whose names match a prefix best: starts with, then a word starts with, then contains. */
export function suggestTags(lib: TagLibrary, text: string, limit = 8): Tag[] {
  const q = tagKey(text);
  const score = (t: Tag) => { const n = tagKey(t.name); return !q ? 0 : n === q ? 0 : n.startsWith(q) ? 1 : n.split(" ").some(w => w.startsWith(q)) ? 2 : n.includes(q) ? 3 : 9; };
  return lib.tags.map(t => ({ t, s: score(t) })).filter(x => x.s < 9).sort((a, b) => a.s - b.s || a.t.name.localeCompare(b.t.name)).slice(0, limit).map(x => x.t);
}

export type TagAction =
  | { action: "create"; id: string; name: string; color: TagColor }
  | { action: "add"; target: string; tagId: string }
  | { action: "remove"; targets: string[]; tagId: string }
  | { action: "rename"; tagId: string; name: string }
  | { action: "recolor"; tagId: string; color: TagColor }
  | { action: "merge"; from: string; into: string }
  | { action: "delete"; tagId: string };

export const tagActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), id, name: z.string(), color: z.enum(TAG_COLORS) }),
  z.object({ action: z.literal("add"), target, tagId: id }),
  z.object({ action: z.literal("remove"), targets: z.array(target).min(1).max(4), tagId: id }),
  z.object({ action: z.literal("rename"), tagId: id, name: z.string() }),
  z.object({ action: z.literal("recolor"), tagId: id, color: z.enum(TAG_COLORS) }),
  z.object({ action: z.literal("merge"), from: id, into: id }),
  z.object({ action: z.literal("delete"), tagId: id }),
]);

const fail = (message: string): never => { throw new Error(message); };
const without = (on: TagLibrary["on"], key: string) => { const next = { ...on }; delete next[key]; return next; };

/**
 * Applies one change and returns the new library. The browser runs it straight away
 * and the server runs it again on the saved copy, so two tabs never undo each other.
 */
export function applyTagAction(lib: TagLibrary, a: TagAction): TagLibrary {
  const tag = (tagId: string) => lib.tags.find(t => t.id === tagId) ?? fail("That tag no longer exists.");
  switch (a.action) {
    case "create": {
      const name = cleanTagName(a.name);
      if (!name) fail("Give the tag a name.");
      if (lib.tags.some(t => t.id === a.id)) return lib;
      if (findTag(lib, name)) fail(`There is already a tag called “${name}”.`);
      if (lib.tags.length >= TAG_LIMIT) fail(`You can have up to ${TAG_LIMIT} tags.`);
      return { ...lib, tags: [...lib.tags, { id: a.id, name, color: a.color }] };
    }
    case "add": {
      tag(a.tagId);
      const ids = lib.on[a.target] ?? [];
      if (ids.includes(a.tagId)) return lib;
      if (ids.length >= TAGS_PER_ITEM) fail(`Something can have up to ${TAGS_PER_ITEM} tags.`);
      if (!lib.on[a.target] && Object.keys(lib.on).length >= TARGET_LIMIT) fail("You have tagged too many things. Remove some tags first.");
      return { ...lib, on: { ...lib.on, [a.target]: [...ids, a.tagId] } };
    }
    case "remove": {
      let on = lib.on;
      for (const key of a.targets) {
        const ids = on[key]; if (!ids?.includes(a.tagId)) continue;
        const rest = ids.filter(i => i !== a.tagId);
        on = rest.length ? { ...on, [key]: rest } : without(on, key);
      }
      return on === lib.on ? lib : { ...lib, on };
    }
    case "rename": {
      const name = cleanTagName(a.name), current = tag(a.tagId);
      if (!name) fail("Give the tag a name.");
      const other = findTag(lib, name);
      if (other && other.id !== current.id) fail(`There is already a tag called “${other.name}”. Use Merge to combine them.`);
      return { ...lib, tags: lib.tags.map(t => t.id === current.id ? { ...t, name } : t) };
    }
    case "recolor":
      tag(a.tagId);
      return { ...lib, tags: lib.tags.map(t => t.id === a.tagId ? { ...t, color: a.color } : t) };
    case "merge": {
      if (a.from === a.into) fail("Choose a different tag to merge into.");
      tag(a.from); tag(a.into);
      const on: TagLibrary["on"] = {};
      for (const [key, ids] of Object.entries(lib.on)) {
        const moved = [...new Set(ids.map(i => i === a.from ? a.into : i))].slice(0, TAGS_PER_ITEM);
        on[key] = moved;
      }
      return { ...lib, tags: lib.tags.filter(t => t.id !== a.from), on };
    }
    case "delete": {
      tag(a.tagId);
      const on: TagLibrary["on"] = {};
      for (const [key, ids] of Object.entries(lib.on)) { const rest = ids.filter(i => i !== a.tagId); if (rest.length) on[key] = rest; }
      return { ...lib, tags: lib.tags.filter(t => t.id !== a.tagId), on };
    }
  }
}

/**
 * Brings in the comma-separated tags characters had before tags were shared, once.
 * The old list stays on the character as it was, so nothing is lost.
 */
export function importCharacterTags(lib: TagLibrary, entries: { id: string; character?: { tags: string[] } }[], makeId = newTagId): TagLibrary {
  if (lib.imported) return lib;
  let next: TagLibrary = { ...lib, imported: true };
  for (const e of entries) for (const raw of e.character?.tags ?? []) {
    const name = cleanTagName(raw); if (!name) continue;
    let t = findTag(next, name);
    if (!t) {
      if (next.tags.length >= TAG_LIMIT) continue;
      t = { id: makeId(), name, color: nextColor(next) };
      next = { ...next, tags: [...next.tags, t] };
    }
    const key = targetKey("entry", e.id), ids = next.on[key] ?? [];
    if (!ids.includes(t.id) && ids.length < TAGS_PER_ITEM) next = { ...next, on: { ...next.on, [key]: [...ids, t.id] } };
  }
  return next;
}
