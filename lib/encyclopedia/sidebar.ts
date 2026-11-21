import { z } from "zod";

/*
 * A campaign's Encyclopedia sidebar, arranged by the GM with Customize sidebar:
 *  - `nav`: the menu (Quests, Codex, Relationships…) in the GM's order, each shown or hidden.
 *  - `quick`: the small links under the menu (Stat form, Player view, Look by default). Any link can go here.
 *  - `sections`: the folding sections below (World Lore, Campaign Notes, Organizations and the GM's own
 *    categories) in order, each shown or hidden.
 *  - `categories`: the GM's own sections. Each holds links picked by hand (pages, parts of the Encyclopedia,
 *    tools or web pages) and can also list every page of chosen kinds, such as all places.
 * A campaign without `sidebar` uses the starting layout. Players never see it.
 */

export const navIds = ["quests", "codex", "relationships", "characters", "maps", "calendar", "tables", "templates"] as const;
export type NavId = typeof navIds[number];
/** Menu items that need a campaign; a world on its own does not show them. */
export const campaignOnlyNav: readonly NavId[] = ["quests", "codex", "calendar"];
export const navLabels: Record<NavId, string> = { quests: "Quests", codex: "Codex", relationships: "Relationships", characters: "Characters", maps: "World maps", calendar: "Calendar", tables: "Random tables", templates: "Templates" };

/** Parts of the Encyclopedia a link can open: the menu items, and Look. */
export const viewIds = [...navIds, "look"] as const;
export type ViewId = typeof viewIds[number];
export const viewLabels: Record<ViewId, string> = { ...navLabels, look: "Look" };

/** Tools a link can open. */
export const toolIds = ["form", "share", "items", "dice", "log", "search", "tags", "ai", "backups"] as const;
export type ToolId = typeof toolIds[number];
export const toolLabels: Record<ToolId, string> = { form: "Stat form", share: "Player view", items: "Items and spells", dice: "Dice", log: "Roll log", search: "Quick search", tags: "Tags", ai: "Connect an AI", backups: "Workspace & backups" };

export const builtInSections = ["lore", "notes", "sessions", "orgs"] as const;
export type BuiltInSection = typeof builtInSections[number];
export const sectionLabels: Record<BuiltInSection, string> = { lore: "World Lore", notes: "Campaign Notes", sessions: "Sessions", orgs: "Organizations" };

/** Page kinds a category can list on its own (the same kinds as Entry, less folders). */
export const categoryKinds = ["character", "place", "faction", "lore", "session", "quest", "note", "tasks", "map", "vehicle", "store", "galaxy", "sector", "system", "page", "other"] as const;
export type CategoryKind = typeof categoryKinds[number];

export const maxQuickLinks = 12, maxGroups = 8, maxCategoryTypes = 20, maxCategories = 30, maxCategoryLinks = 60, maxCategoryTags = 20;
const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const label = z.string().trim().min(1).max(60);
const url = z.string().trim().max(500).refine(v => /^https?:\/\/[^\s]+$/i.test(v), "Links must start with http:// or https://");

export const sidebarLinkSchema = z.discriminatedUnion("type", [
  z.object({ id, type: z.literal("page"), page: id }),
  z.object({ id, type: z.literal("view"), view: z.enum(viewIds) }),
  z.object({ id, type: z.literal("tool"), tool: z.enum(toolIds) }),
  z.object({ id, type: z.literal("web"), label, url }),
]);
export type SidebarLink = z.infer<typeof sidebarLinkSchema>;
type NewLink = SidebarLink extends infer L ? L extends SidebarLink ? Omit<L, "id"> : never : never;

export const sidebarCategorySchema = z.object({
  id, name: z.string().trim().min(1).max(40),
  links: z.array(sidebarLinkSchema).max(maxCategoryLinks),
  kinds: z.array(z.enum(categoryKinds)).max(categoryKinds.length).optional(),
  /** Optional (added later): also every page with any of these Wiki tags (the GM's own tags, lib/tags.ts). */
  tags: z.array(id).max(maxCategoryTags).optional(),
  /** Optional (added later): also every page of these GM entry types (page templates, by id). */
  types: z.array(id).max(maxCategoryTypes).optional(),
});
export type SidebarCategory = z.infer<typeof sidebarCategorySchema>;

const unique = <T>(list: T[], key: (x: T) => string) => new Set(list.map(key)).size === list.length;
export const sidebarSchema = z.object({
  nav: z.array(z.object({ id: z.enum(navIds), on: z.boolean() })).max(navIds.length),
  quick: z.array(sidebarLinkSchema).max(maxQuickLinks),
  sections: z.array(z.object({ id, on: z.boolean() })).max(builtInSections.length + maxCategories + maxGroups),
  categories: z.array(sidebarCategorySchema).max(maxCategories),
  /**
   * Optional (added later): the GM's own top-level headings. Each sits in `sections` like a section does, and heads
   * the sections after it, up to the next heading. Folding a heading folds its sections.
   */
  groups: z.array(z.object({ id, name: z.string().trim().min(1).max(40) })).max(maxGroups).optional(),
}).superRefine((s, ctx) => {
  if (!unique(s.nav, x => x.id)) ctx.addIssue({ code: "custom", message: "Each menu item can only be in the sidebar once" });
  if (!unique(s.sections, x => x.id)) ctx.addIssue({ code: "custom", message: "Each section can only be in the sidebar once" });
  if (!unique(s.categories, x => x.id)) ctx.addIssue({ code: "custom", message: "Category IDs must be unique" });
  if (s.categories.some(c => (builtInSections as readonly string[]).includes(c.id))) ctx.addIssue({ code: "custom", message: "A category cannot use a built-in section's ID" });
  const groups = s.groups ?? [];
  if (!unique(groups, x => x.id) || groups.some(g => (builtInSections as readonly string[]).includes(g.id) || s.categories.some(c => c.id === g.id))) ctx.addIssue({ code: "custom", message: "Heading IDs must be unique" });
});
export type Sidebar = z.infer<typeof sidebarSchema>;

const startingQuick: SidebarLink[] = [{ id: "q-form", type: "tool", tool: "form" }, { id: "q-items", type: "tool", tool: "items" }, { id: "q-share", type: "tool", tool: "share" }, { id: "q-look", type: "view", view: "look" }];
/** The layout every campaign starts with, and what Reset goes back to. Categories are kept by Reset. */
export function defaultSidebar(keep: SidebarCategory[] = [], groups: SidebarGroup[] = []): Sidebar {
  return {
    nav: navIds.map(id => ({ id, on: true })),
    quick: startingQuick.map(l => ({ ...l })),
    sections: [...builtInSections.map(id => ({ id, on: true })), ...groups.map(g => ({ id: g.id, on: true })), ...keep.map(c => ({ id: c.id, on: true }))],
    categories: keep,
    ...(groups.length ? { groups } : {}),
  };
}
export type SidebarGroup = { id: string; name: string };

/**
 * The sidebar to show: the campaign's own layout made whole. Menu items and sections it does not
 * list yet (added to the app later, or a category without a place) go at the end, shown; anything
 * it lists that no longer exists is dropped.
 */
export function sidebarOf(saved: Sidebar | undefined | null): Sidebar {
  if (!saved) return defaultSidebar();
  const nav = saved.nav.filter((x, i, a) => navIds.includes(x.id) && a.findIndex(y => y.id === x.id) === i);
  for (const id of navIds) if (!nav.some(x => x.id === id)) nav.push({ id, on: true });
  const known = new Set<string>([...builtInSections, ...saved.categories.map(c => c.id), ...(saved.groups ?? []).map(g => g.id)]);
  const sections = saved.sections.filter((x, i, a) => known.has(x.id) && a.findIndex(y => y.id === x.id) === i);
  for (const id of known) if (!sections.some(x => x.id === id)) sections.push({ id, on: true });
  return { nav, quick: saved.quick, sections, categories: saved.categories, ...(saved.groups?.length ? { groups: saved.groups } : {}) };
}

/** A heading's id, or null when the section is a section. */
export const groupOf = (s: Pick<Sidebar, "groups">, sectionId: string) => s.groups?.find(g => g.id === sectionId) ?? null;

/**
 * The sections in their order, each with the heading it sits under (the nearest heading above it), and the headings
 * themselves. Sections above every heading have none.
 */
export function sectionsUnder(s: Sidebar): { id: string; on: boolean; group: SidebarGroup | null; heading: boolean }[] {
  let under: SidebarGroup | null = null;
  return s.sections.map(x => { const g = groupOf(s, x.id); if (g) { under = g; return { ...x, group: g, heading: true }; } return { ...x, group: under, heading: false }; });
}

/** A new top-level heading at the end of the sections, so the GM can drag sections under it. */
export function addGroup(s: Sidebar, name: string, makeId: () => string): { sidebar: Sidebar; id: string } | null {
  const clean = name.trim().slice(0, 40), groups = s.groups ?? [];
  if (!clean || groups.length >= maxGroups) return null;
  let gid = makeId();
  while ((builtInSections as readonly string[]).includes(gid) || s.categories.some(c => c.id === gid) || groups.some(g => g.id === gid)) gid = makeId();
  return { id: gid, sidebar: { ...s, groups: [...groups, { id: gid, name: clean }], sections: [...s.sections, { id: gid, on: true }] } };
}
export function renameGroup(s: Sidebar, gid: string, name: string): Sidebar {
  const clean = name.trim().slice(0, 40);
  return clean && s.groups ? { ...s, groups: s.groups.map(g => g.id === gid ? { ...g, name: clean } : g) } : s;
}
/** Takes the heading away; its sections stay where they are, under the heading above, if any. */
export function removeGroup(s: Sidebar, gid: string): Sidebar {
  const groups = (s.groups ?? []).filter(g => g.id !== gid), out: Sidebar = { ...s, sections: s.sections.filter(x => x.id !== gid) };
  if (groups.length) out.groups = groups; else delete out.groups;
  return out;
}

/** Move one item of a list from one place to another; the same list when nothing moves. */
export function moveIn<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return list;
  const next = [...list], [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

export function moveNav(s: Sidebar, from: number, to: number): Sidebar { const nav = moveIn(s.nav, from, to); return nav === s.nav ? s : { ...s, nav }; }
export function moveSection(s: Sidebar, from: number, to: number): Sidebar { const sections = moveIn(s.sections, from, to); return sections === s.sections ? s : { ...s, sections }; }
export function moveQuick(s: Sidebar, from: number, to: number): Sidebar { const quick = moveIn(s.quick, from, to); return quick === s.quick ? s : { ...s, quick }; }
export function showNav(s: Sidebar, id: NavId, on: boolean): Sidebar { return { ...s, nav: s.nav.map(x => x.id === id ? { ...x, on } : x) }; }
export function showSection(s: Sidebar, id: string, on: boolean): Sidebar { return { ...s, sections: s.sections.map(x => x.id === id ? { ...x, on } : x) }; }

/** True when the link already points at the same thing (another link to it would only repeat it). */
export function sameLink(a: NewLink | SidebarLink, b: NewLink | SidebarLink): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "page": return a.page === (b as typeof a).page;
    case "view": return a.view === (b as typeof a).view;
    case "tool": return a.tool === (b as typeof a).tool;
    case "web": return a.url.trim() === (b as typeof a).url.trim();
  }
}

function withId(link: NewLink, makeId: () => string): SidebarLink {
  const l = link.type === "web" ? { ...link, label: link.label.trim().slice(0, 60), url: link.url.trim() } : link;
  return { ...l, id: makeId() } as SidebarLink;
}

/** Add a quick link at the end; a link already there, or one past the limit, is left out. */
export function addQuick(s: Sidebar, link: NewLink, makeId: () => string): Sidebar {
  if (s.quick.length >= maxQuickLinks || s.quick.some(l => sameLink(l, link))) return s;
  return { ...s, quick: [...s.quick, withId(link, makeId)] };
}
export function removeQuick(s: Sidebar, linkId: string): Sidebar { return { ...s, quick: s.quick.filter(l => l.id !== linkId) }; }

/** A new category at the end of the sections, shown. */
export function addCategory(s: Sidebar, name: string, makeId: () => string): { sidebar: Sidebar; id: string } | null {
  const clean = name.trim().slice(0, 40);
  if (!clean || s.categories.length >= maxCategories) return null;
  let catId = makeId();
  while ((builtInSections as readonly string[]).includes(catId) || s.categories.some(c => c.id === catId)) catId = makeId();
  return { id: catId, sidebar: { ...s, categories: [...s.categories, { id: catId, name: clean, links: [] }], sections: [...s.sections, { id: catId, on: true }] } };
}
export function removeCategory(s: Sidebar, catId: string): Sidebar {
  return { ...s, categories: s.categories.filter(c => c.id !== catId), sections: s.sections.filter(x => x.id !== catId) };
}
export function updateCategory(s: Sidebar, catId: string, patch: (c: SidebarCategory) => SidebarCategory): Sidebar {
  return { ...s, categories: s.categories.map(c => c.id === catId ? patch(c) : c) };
}
export function renameCategory(s: Sidebar, catId: string, name: string): Sidebar {
  const clean = name.trim().slice(0, 40);
  return clean ? updateCategory(s, catId, c => ({ ...c, name: clean })) : s;
}
export function addCategoryLink(s: Sidebar, catId: string, link: NewLink, makeId: () => string): Sidebar {
  return updateCategory(s, catId, c => c.links.length >= maxCategoryLinks || c.links.some(l => sameLink(l, link)) ? c : { ...c, links: [...c.links, withId(link, makeId)] });
}
export function removeCategoryLink(s: Sidebar, catId: string, linkId: string): Sidebar {
  return updateCategory(s, catId, c => ({ ...c, links: c.links.filter(l => l.id !== linkId) }));
}
export function moveCategoryLink(s: Sidebar, catId: string, from: number, to: number): Sidebar {
  return updateCategory(s, catId, c => { const links = moveIn(c.links, from, to); return links === c.links ? c : { ...c, links }; });
}
export function setCategoryKinds(s: Sidebar, catId: string, kinds: CategoryKind[]): Sidebar {
  const ordered = categoryKinds.filter(k => kinds.includes(k));
  return updateCategory(s, catId, c => { const rest = { ...c }; delete rest.kinds; return ordered.length ? { ...rest, kinds: ordered } : rest; });
}

export function setCategoryTypes(s: Sidebar, catId: string, types: string[]): Sidebar {
  const clean = [...new Set(types)].slice(0, maxCategoryTypes);
  return updateCategory(s, catId, c => { const rest = { ...c }; delete rest.types; return clean.length ? { ...rest, types: clean } : rest; });
}

export function setCategoryTags(s: Sidebar, catId: string, tags: string[]): Sidebar {
  const clean = [...new Set(tags)].slice(0, maxCategoryTags);
  return updateCategory(s, catId, c => { const rest = { ...c }; delete rest.tags; return clean.length ? { ...rest, tags: clean } : rest; });
}

type PageLike = { id: string; title: string; kind: string; templateId?: string };
/**
 * What a category lists: its own links first, in the GM's order, then every page of its kinds, or with any of its
 * tags, not already linked, by title. Links to pages that are gone, or that this campaign cannot see, are skipped.
 * `tagsOf` gives a page's tag ids; without it, tags gather nothing.
 */
export function categoryItems<P extends PageLike>(c: SidebarCategory, pages: P[], tagsOf?: (pageId: string) => readonly string[]): ({ link: SidebarLink; page?: P })[] {
  const byId = new Map(pages.map(p => [p.id, p]));
  const out: ({ link: SidebarLink; page?: P })[] = [];
  for (const link of c.links) {
    if (link.type !== "page") { out.push({ link }); continue; }
    const page = byId.get(link.page);
    if (page) out.push({ link, page });
  }
  const tags = new Set(tagsOf ? c.tags ?? [] : []);
  if (c.kinds?.length || tags.size || c.types?.length) {
    const linked = new Set(c.links.flatMap(l => l.type === "page" ? [l.page] : []));
    const kinds = new Set<string>(c.kinds ?? []), types = new Set(c.types ?? []);
    pages.filter(p => (kinds.has(p.kind) || (!!p.templateId && types.has(p.templateId)) || (tags.size > 0 && tagsOf!(p.id).some(t => tags.has(t)))) && !linked.has(p.id)).sort((a, b) => a.title.localeCompare(b.title)).forEach(p => out.push({ link: { id: `auto-${p.id}`, type: "page", page: p.id }, page: p }));
  }
  return out;
}

/** The layout to save: nothing when it is the starting layout, so an untouched campaign stays as it was. */
export function sidebarToSave(s: Sidebar): Sidebar | undefined {
  const d = defaultSidebar();
  return JSON.stringify(s) === JSON.stringify(d) ? undefined : s;
}

/** The layout with page links pointed at copied pages (an imported copy); links to pages not copied are dropped. */
export function remapSidebarPages(s: Sidebar, ids: Map<string, string>): Sidebar {
  const keep = (links: SidebarLink[]): SidebarLink[] => links.flatMap((l): SidebarLink[] => l.type !== "page" ? [l] : ids.has(l.page) ? [{ ...l, page: ids.get(l.page)! }] : []);
  return { ...s, quick: keep(s.quick), categories: s.categories.map(c => ({ ...c, links: keep(c.links) })) };
}
