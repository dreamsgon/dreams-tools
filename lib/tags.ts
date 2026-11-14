import { z } from "zod";

/*
 * Tags: your own coloured labels. Each place keeps its own list: Encyclopedia,
 * Campaigns and Maptable. A tag has a `scope` and can only go on targets of that
 * scope's kind; names are unique within a scope, so the same name may exist in two.
 * One small file per account holds every tag and everything it is on, so renaming,
 * recolouring, merging and deleting change one place and never touch pages or maps.
 *
 * What a tag is on is a "target" key (and the scope that may use it):
 *   entry:<id>     an Encyclopedia page          (encyclopedia)
 *   campaign:<key> a campaign row on the Campaigns page, e:<id> or m:<id>  (campaigns)
 *   scene:<id>     a Maptable scene              (maptable)
 *
 * Files saved before scopes existed have one shared list. `migrateTagLibrary` splits
 * it when the file is read: a tag used in several places becomes one tag per place.
 */

export const TAG_COLORS = ["red", "orange", "amber", "green", "teal", "blue", "purple", "pink", "slate"] as const;
export type TagColor = (typeof TAG_COLORS)[number];
export const TAG_COLOR_NAMES: Record<TagColor, string> = { red: "Red", orange: "Orange", amber: "Amber", green: "Green", teal: "Teal", blue: "Blue", purple: "Purple", pink: "Pink", slate: "Grey" };

export const TAG_LIMIT = 500, TAGS_PER_ITEM = 30, TAG_NAME_LIMIT = 40, TARGET_LIMIT = 20_000;
const id = z.string().min(1).max(60).regex(/^[a-zA-Z0-9_-]+$/);
export const TAG_SCOPES = ["encyclopedia", "campaigns", "maptable"] as const;
export type TagScope = (typeof TAG_SCOPES)[number];
export const TAG_SCOPE_NAMES: Record<TagScope, string> = { encyclopedia: "Encyclopedia", campaigns: "Campaign", maptable: "Maptable" };
const target = z.string().min(3).max(140).regex(/^(entry|scene|campaign):[a-zA-Z0-9_:-]+$/);
export const tagSchema = z.object({ id, name: z.string().trim().min(1).max(TAG_NAME_LIMIT), color: z.enum(TAG_COLORS), scope: z.enum(TAG_SCOPES) });
export const tagLibrarySchema = z.object({
  tags: z.array(tagSchema).max(TAG_LIMIT),
  on: z.record(target, z.array(id).max(TAGS_PER_ITEM)),
  /** Set once old character tags have been brought in. */
  imported: z.boolean().optional(),
}).superRefine((lib, ctx) => {
  if (new Set(lib.tags.map(t => t.id)).size !== lib.tags.length) ctx.addIssue({ code: "custom", message: "Tag IDs must be unique" });
  if (new Set(lib.tags.map(t => `${t.scope}:${tagKey(t.name)}`)).size !== lib.tags.length) ctx.addIssue({ code: "custom", message: "Tag names must be unique within each list" });
  const scopeOf = new Map(lib.tags.map(t => [t.id, t.scope]));
  for (const [key, ids] of Object.entries(lib.on)) for (const i of ids) {
    const s = scopeOf.get(i);
    if (s && s !== kindScope(targetKind(key))) ctx.addIssue({ code: "custom", message: `A ${s} tag cannot be put on ${key}` });
  }
  if (Object.keys(lib.on).length > TARGET_LIMIT) ctx.addIssue({ code: "custom", message: "Too many tagged items" });
});
export type Tag = z.infer<typeof tagSchema>;
export type TagLibrary = z.infer<typeof tagLibrarySchema>;
export type TargetKind = "entry" | "scene" | "campaign";

/** Something tagged, with its name and a link, for search and the Tags manager. */
export type TaggedItem = { key: string; kind: TargetKind; title: string; detail: string; href: string; entryKind?: string; tagIds: string[] };

const KIND_SCOPE: Record<TargetKind, TagScope> = { entry: "encyclopedia", campaign: "campaigns", scene: "maptable" };
const SCOPE_KIND: Record<TagScope, TargetKind> = { encyclopedia: "entry", campaigns: "campaign", maptable: "scene" };
export const kindScope = (kind: TargetKind) => KIND_SCOPE[kind];
export const scopeKind = (scope: TagScope) => SCOPE_KIND[scope];
/** The list a target's tags come from. */
export const targetScope = (key: string) => KIND_SCOPE[targetKind(key)];

export const emptyTags = (): TagLibrary => ({ tags: [], on: {} });
export const targetKey = (kind: TargetKind, value: string) => `${kind}:${value}`;
export const targetKind = (key: string) => key.slice(0, key.indexOf(":")) as TargetKind;

/** How names are compared: case, extra spaces and a leading # do not matter. */
export const tagKey = (name: string) => name.trim().replace(/^#+/, "").trim().replace(/\s+/g, " ").toLowerCase();
export const cleanTagName = (name: string) => name.trim().replace(/^#+/, "").trim().replace(/\s+/g, " ").slice(0, TAG_NAME_LIMIT);
/** Finds a tag by name; with a scope, only in that list. */
export const findTag = (lib: TagLibrary, name: string, scope?: TagScope) => lib.tags.find(t => (!scope || t.scope === scope) && tagKey(t.name) === tagKey(name));

/** Just one list: its tags, and only the targets of its kind. This is what a picker or search works on. */
export function scopedTags(lib: TagLibrary, scope: TagScope): TagLibrary {
  const kind = SCOPE_KIND[scope], ids = new Set(lib.tags.filter(t => t.scope === scope).map(t => t.id));
  const on: TagLibrary["on"] = {};
  for (const [key, list] of Object.entries(lib.on)) if (targetKind(key) === kind) { const own = list.filter(i => ids.has(i)); if (own.length) on[key] = own; }
  return { tags: lib.tags.filter(t => t.scope === scope), on, ...(lib.imported ? { imported: true } : {}) };
}
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
  | { action: "create"; id: string; scope: TagScope; name: string; color: TagColor }
  | { action: "add"; target: string; tagId: string }
  | { action: "remove"; targets: string[]; tagId: string }
  | { action: "rename"; tagId: string; name: string }
  | { action: "recolor"; tagId: string; color: TagColor }
  | { action: "merge"; from: string; into: string }
  | { action: "delete"; tagId: string };

export const tagActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), id, scope: z.enum(TAG_SCOPES), name: z.string(), color: z.enum(TAG_COLORS) }),
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
      if (findTag(lib, name, a.scope)) fail(`There is already a tag called “${name}”.`);
      if (lib.tags.length >= TAG_LIMIT) fail(`You can have up to ${TAG_LIMIT} tags.`);
      return { ...lib, tags: [...lib.tags, { id: a.id, name, color: a.color, scope: a.scope }] };
    }
    case "add": {
      const scope = tag(a.tagId).scope;
      if (targetScope(a.target) !== scope) fail(`A ${TAG_SCOPE_NAMES[scope]} tag can only go on ${KIND_WORDS[SCOPE_KIND[scope]].toLowerCase()}.`);
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
      const other = findTag(lib, name, current.scope);
      if (other && other.id !== current.id) fail(`There is already a tag called “${other.name}”. Use Merge to combine them.`);
      return { ...lib, tags: lib.tags.map(t => t.id === current.id ? { ...t, name } : t) };
    }
    case "recolor":
      tag(a.tagId);
      return { ...lib, tags: lib.tags.map(t => t.id === a.tagId ? { ...t, color: a.color } : t) };
    case "merge": {
      if (a.from === a.into) fail("Choose a different tag to merge into.");
      if (tag(a.from).scope !== tag(a.into).scope) fail("Tags can only be merged with tags from the same list.");
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
 * Brings in the comma-separated tags characters had before tags existed, once. They are Encyclopedia tags.
 * The old list stays on the character as it was, so nothing is lost.
 */
export function importCharacterTags(lib: TagLibrary, entries: { id: string; character?: { tags: string[] } }[], makeId = newTagId): TagLibrary {
  if (lib.imported) return lib;
  let next: TagLibrary = { ...lib, imported: true };
  for (const e of entries) for (const raw of e.character?.tags ?? []) {
    const name = cleanTagName(raw); if (!name) continue;
    let t = findTag(next, name, "encyclopedia");
    if (!t) {
      if (next.tags.length >= TAG_LIMIT) continue;
      t = { id: makeId(), name, color: nextColor(scopedTags(next, "encyclopedia")), scope: "encyclopedia" };
      next = { ...next, tags: [...next.tags, t] };
    }
    const key = targetKey("entry", e.id), ids = next.on[key] ?? [];
    if (!ids.includes(t.id) && ids.length < TAGS_PER_ITEM) next = { ...next, on: { ...next.on, [key]: [...ids, t.id] } };
  }
  return next;
}

const SCOPE_SUFFIX: Record<TagScope, string> = { encyclopedia: "e", campaigns: "c", maptable: "m" };

/**
 * Splits an old shared library into one list per place, once. Anything with every tag
 * already scoped is returned as it is. For each old tag: one tag per place it is used
 * (the first keeps the old id; the others get `<id>-c` / `<id>-m`, made longer if that
 * id is taken), with the same name and colour, and each target moves to the copy for
 * its own place. A tag on nothing goes into every place, so nothing is lost.
 */
export function migrateTagLibrary(raw: unknown): unknown {
  const lib = raw as { tags?: unknown; on?: unknown; imported?: unknown } | null;
  if (!lib || typeof lib !== "object" || !Array.isArray(lib.tags)) return raw;
  const old = lib.tags as { id?: unknown; name?: unknown; color?: unknown; scope?: unknown }[];
  if (!old.some(t => t && typeof t === "object" && !TAG_SCOPES.includes(t.scope as TagScope))) return raw;
  const on = (lib.on && typeof lib.on === "object" ? lib.on : {}) as Record<string, string[]>;
  const taken = new Set(old.map(t => String(t?.id)));
  const used = new Map<string, Set<TagScope>>();
  for (const [key, ids] of Object.entries(on)) if (Array.isArray(ids)) for (const i of ids) {
    const k = key.slice(0, key.indexOf(":")) as TargetKind;
    if (KIND_SCOPE[k]) (used.get(i) ?? used.set(i, new Set()).get(i)!).add(KIND_SCOPE[k]);
  }
  const copies = new Map<string, Partial<Record<TagScope, string>>>(), tags: unknown[] = [];
  for (const t of old) {
    if (!t || typeof t !== "object") continue;
    const id = String(t.id);
    if (TAG_SCOPES.includes(t.scope as TagScope)) { tags.push(t); continue; }
    const scopes = TAG_SCOPES.filter(s => used.get(id)?.has(s)), mine = scopes.length ? scopes : [...TAG_SCOPES], map: Partial<Record<TagScope, string>> = {};
    mine.forEach((scope, n) => {
      let copy = id;
      if (n) { copy = `${id.slice(0, 56)}-${SCOPE_SUFFIX[scope]}`; while (taken.has(copy)) copy = `${copy.slice(0, 59)}x`; taken.add(copy); }
      map[scope] = copy;
      tags.push({ ...t, id: copy, scope });
    });
    copies.set(id, map);
  }
  const moved: Record<string, string[]> = {};
  for (const [key, ids] of Object.entries(on)) {
    if (!Array.isArray(ids)) continue;
    const scope = KIND_SCOPE[key.slice(0, key.indexOf(":")) as TargetKind];
    moved[key] = [...new Set(ids.map(i => copies.get(i)?.[scope] ?? i))];
  }
  return { ...lib, tags, on: moved };
}
