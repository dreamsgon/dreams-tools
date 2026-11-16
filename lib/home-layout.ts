import { z } from "zod";
import { dashboardSchema, heightSchema, type Dashboard } from "./encyclopedia/dashboard.ts";

/*
 * The signed-in home page layout: which sections show, in what order and how wide (S/M/L = 4/8/12 of 12 columns),
 * the few settings a section keeps, and the small things the sections hold for the account (quick links, to-dos,
 * a scratchpad, pinned campaigns and pages). One small file per account (see home-server.ts). Pure: no server imports.
 */

export const homeWidgets = ["continue", "attention", "sessions", "campaigns", "folders", "links", "recent", "pinned", "quests", "todo", "notes", "roll"] as const;
export type HomeWidget = typeof homeWidgets[number];
export const homeSizes = ["s", "m", "l"] as const;
/** Heights in rows (1 is the default and is left out of the saved layout). */
export const homeHeights = [1, 2, 3] as const;
export type HomeHeight = typeof homeHeights[number];
export type HomeSize = typeof homeSizes[number];
/** Columns out of 12 that each width takes. */
export const homeSpan: Record<HomeSize, number> = { s: 4, m: 8, l: 12 };

export const homeInfo: Record<HomeWidget, { name: string; hint: string; size: HomeSize }> = {
  continue: { name: "Continue where you left off", hint: "The campaign you worked on last", size: "l" },
  attention: { name: "Needs your attention", hint: "Join requests and player activity", size: "s" },
  sessions: { name: "Upcoming sessions", hint: "Next session of every campaign", size: "s" },
  campaigns: { name: "Your campaigns", hint: "Recent or pinned, with counts", size: "l" },
  folders: { name: "Campaign folders", hint: "Your folders, opened right here", size: "m" },
  links: { name: "Quick links", hint: "Any links you add: sheets, Discord, music", size: "s" },
  recent: { name: "Recently edited", hint: "Pages changed lately, all campaigns", size: "m" },
  pinned: { name: "Pinned pages", hint: "Pages you pin in the Encyclopedia", size: "s" },
  quests: { name: "Active quests", hint: "Across every campaign", size: "m" },
  todo: { name: "GM to-do", hint: "A checklist only you see", size: "s" },
  notes: { name: "Scratchpad", hint: "Notes only you see", size: "s" },
  roll: { name: "Quick roll", hint: "Dice and your favorite tables", size: "s" },
};

export const campaignShows = ["recent", "pinfirst", "pinned", "folder"] as const;
export type CampaignShow = typeof campaignShows[number];
export const campaignShowNames: Record<CampaignShow, string> = { recent: "Most recent", pinfirst: "Pinned first, then recent", pinned: "Only pinned", folder: "One folder" };

const folderId = z.string().min(1).max(120);
/** Per-section settings. Anything left out means the section's default. */
export const homeOptionsSchema = z.object({
  campaigns: z.object({ show: z.enum(campaignShows).optional(), folderId: folderId.optional(), count: z.union([z.literal(4), z.literal(8), z.literal(12)]).optional(), compact: z.boolean().optional() }).optional(),
  /** which: the folders to list (default all of them). */
  folders: z.object({ which: z.array(folderId).max(100).optional() }).optional(),
  recent: z.object({ count: z.union([z.literal(3), z.literal(6), z.literal(10)]).optional() }).optional(),
  sessions: z.object({ days: z.union([z.literal(7), z.literal(14), z.literal(30)]).optional() }).optional(),
  roll: z.object({ tables: z.boolean().optional() }).optional(),
});
export type HomeOptions = z.infer<typeof homeOptionsSchema>;

const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
/** A quick link goes to a web address or to a page in this site ("/maptable"). Never javascript:, data: or "//host". */
export const isLinkUrl = (v: string) => /^https?:\/\/[^\s]+$/i.test(v) || /^\/(?![/\\])[^\s]*$/.test(v);
const url = z.string().trim().max(500).refine(isLinkUrl, "Links must start with http://, https:// or /");
const label = z.string().trim().min(1).max(80);
const campaignKey = z.string().min(1).max(120);

export const homeLinkSchema = z.object({ label, url });
export const homeTodoSchema = z.object({ id, text: z.string().trim().min(1).max(200), done: z.boolean(), campaignKey: campaignKey.optional() });

export const MAX_CAMPAIGN_DASHBOARDS = 200;
export const homeLayoutSchema = z.object({
  widgets: z.array(z.object({ type: z.enum(homeWidgets), size: z.enum(homeSizes), h: heightSchema.optional() })).max(homeWidgets.length)
    .refine(w => new Set(w.map(x => x.type)).size === w.length, "Each section can only be on the page once"),
  options: homeOptionsSchema.optional(),
  links: z.array(homeLinkSchema).max(24).optional(),
  todo: z.array(homeTodoSchema).max(100).optional(),
  notes: z.string().max(8000).optional(),
  /** Campaign keys as the Campaigns page uses them: "e:<Encyclopedia campaign id>" or "m:<Maptable campaign id>". */
  pinnedCampaigns: z.array(campaignKey).max(100).optional(),
  /** Encyclopedia entry ids. */
  pinnedPages: z.array(z.string().min(1).max(100)).max(50).optional(),
  /** Dashboards of Maptable-only campaigns, which have no Encyclopedia campaign to keep one in. Keyed "m:<Maptable campaign id>". */
  campaignDashboards: z.record(z.string().min(3).max(120).startsWith("m:"), dashboardSchema).optional()
    .refine(r => !r || Object.keys(r).length <= MAX_CAMPAIGN_DASHBOARDS, "Too many campaign dashboards."),
});
export type HomeLayout = z.infer<typeof homeLayoutSchema>;
export type HomeLink = z.infer<typeof homeLinkSchema>;
export type HomeTodo = z.infer<typeof homeTodoSchema>;

export const homePresets = ["standard", "gm", "minimal"] as const;
export type HomePreset = typeof homePresets[number];
export const presetNames: Record<HomePreset, string> = { standard: "Today's page", gm: "GM prep", minimal: "Minimal" };
/** type:size or type:size:height. */
const presetWidgets: Record<HomePreset, string[]> = {
  standard: ["continue:l", "campaigns:l", "recent:l"],
  gm: ["continue:l", "links:s:2", "campaigns:m", "folders:m", "todo:s:2", "quests:m", "sessions:s", "attention:s", "roll:s", "recent:m", "pinned:s", "notes:s"],
  minimal: ["links:l", "campaigns:l"],
};
const presetOptions: Partial<Record<HomePreset, HomeOptions>> = { gm: { campaigns: { show: "recent", count: 8 }, recent: { count: 6 }, roll: { tables: true } } };

type Kept = Pick<HomeLayout, "links" | "todo" | "notes" | "pinnedCampaigns" | "pinnedPages" | "campaignDashboards">;
/** What a preset never replaces: the account's own things. */
export function kept(l: Partial<HomeLayout> = {}): Kept {
  const out: Kept = {};
  if (l.links) out.links = l.links;
  if (l.todo) out.todo = l.todo;
  if (l.notes !== undefined) out.notes = l.notes;
  if (l.pinnedCampaigns) out.pinnedCampaigns = l.pinnedCampaigns;
  if (l.pinnedPages) out.pinnedPages = l.pinnedPages;
  if (l.campaignDashboards) out.campaignDashboards = l.campaignDashboards;
  return out;
}

/** A named layout. Links, to-dos, notes and pins from `keep` carry over. */
export function presetLayout(preset: HomePreset, keep: Partial<HomeLayout> = {}): HomeLayout {
  const widgets = presetWidgets[preset].map(x => {
    const [type, size, h] = x.split(":");
    return { type: type as HomeWidget, size: size as HomeSize, ...(h && h !== "1" ? { h: Number(h) as HomeHeight } : {}) };
  });
  const options = presetOptions[preset];
  return { ...kept(keep), widgets, ...(options ? { options: structuredClone(options) } : {}) };
}

/** The layout for anyone without a saved one, and what the page looked like before it was customizable. */
export const defaultHomeLayout = (keep: Partial<HomeLayout> = {}): HomeLayout => presetLayout("standard", keep);

export const hasWidget = (l: HomeLayout, type: HomeWidget) => l.widgets.some(w => w.type === type);

export function toggleWidget(l: HomeLayout, type: HomeWidget, on: boolean): HomeLayout {
  if (on === hasWidget(l, type)) return l;
  return { ...l, widgets: on ? [...l.widgets, { type, size: homeInfo[type].size }] : l.widgets.filter(w => w.type !== type) };
}

export function moveWidget(l: HomeLayout, from: number, to: number): HomeLayout {
  if (from === to || from < 0 || to < 0 || from >= l.widgets.length || to >= l.widgets.length) return l;
  const widgets = [...l.widgets], [w] = widgets.splice(from, 1);
  widgets.splice(to, 0, w);
  return { ...l, widgets };
}

export const resizeWidget = (l: HomeLayout, type: HomeWidget, size: HomeSize): HomeLayout =>
  ({ ...l, widgets: l.widgets.map(w => w.type === type ? { ...w, size } : w) });

/** Sets a section's height; 1 (the default) is left out of the saved layout. */
export const setWidgetHeight = (l: HomeLayout, type: HomeWidget, h: HomeHeight): HomeLayout =>
  ({ ...l, widgets: l.widgets.map(w => { if (w.type !== type) return w; const { h: _old, ...rest } = w; return h > 1 ? { ...rest, h } : rest; }) });

/** Changes one setting of one section (for example `setOption(l, "campaigns", { count: 12 })`). */
export function setOption<K extends keyof HomeOptions>(l: HomeLayout, section: K, patch: NonNullable<HomeOptions[K]>): HomeLayout {
  return { ...l, options: { ...l.options, [section]: { ...l.options?.[section], ...patch } } };
}

type PinRow = { key: string; maptable: { id: string } | null; encyclopedia: { id: string } | null };
/** Whether a campaign row (from lib/campaign-links.ts) is pinned. A campaign paired after it was pinned matches by either of its keys. */
export function isPinnedCampaign(pins: readonly string[] | undefined, row: PinRow): boolean {
  if (!pins?.length) return false;
  return pins.includes(row.key) || (!!row.maptable && pins.includes(`m:${row.maptable.id}`)) || (!!row.encyclopedia && pins.includes(`e:${row.encyclopedia.id}`));
}

const withMember = (list: readonly string[] | undefined, value: string, on: boolean) => {
  const has = !!list?.includes(value);
  if (on === has) return list;
  return on ? [...(list ?? []), value] : (list ?? []).filter(x => x !== value);
};

/** Quick changes that touch one part of the layout, so two tabs editing different things don't overwrite each other. */
export type HomeAction =
  | { action: "layout"; layout: HomeLayout }
  | { action: "pinCampaign"; key: string; on: boolean }
  | { action: "pinPage"; id: string; on: boolean }
  | { action: "todo"; todo: HomeTodo[] }
  | { action: "notes"; notes: string }
  | { action: "links"; links: HomeLink[] }
  /** Saves (or, with null, clears) the dashboard of a Maptable-only campaign, by its key "m:<id>". */
  | { action: "campaignDashboard"; key: string; dashboard: Dashboard | null };

/** Applies one action to a layout and returns the checked result. Throws a readable message when the input is not valid. */
export function applyHomeAction(l: HomeLayout, body: HomeAction): HomeLayout {
  const check = (next: unknown) => {
    const parsed = homeLayoutSchema.safeParse(next);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "That could not be saved.");
    return parsed.data;
  };
  switch (body?.action) {
    // A layout from the page never changes the campaign dashboards, which are saved on their own.
    case "layout": {
      const { campaignDashboards: _ignored, ...next } = (body.layout ?? {}) as Partial<HomeLayout>;
      return check(l.campaignDashboards ? { ...next, campaignDashboards: l.campaignDashboards } : next);
    }
    case "pinCampaign": {
      if (typeof body.key !== "string") throw new Error("Choose a campaign.");
      const pins = withMember(l.pinnedCampaigns, body.key, !!body.on);
      return pins === l.pinnedCampaigns ? l : check({ ...l, pinnedCampaigns: pins });
    }
    case "pinPage": {
      if (typeof body.id !== "string") throw new Error("Choose a page.");
      const pins = withMember(l.pinnedPages, body.id, !!body.on);
      return pins === l.pinnedPages ? l : check({ ...l, pinnedPages: pins });
    }
    case "todo": return check({ ...l, todo: body.todo });
    case "notes": return check({ ...l, notes: body.notes });
    case "links": return check({ ...l, links: body.links });
    case "campaignDashboard": {
      if (typeof body.key !== "string" || !/^m:.{1,100}$/.test(body.key)) throw new Error("Choose a Maptable campaign.");
      const { [body.key]: _old, ...others } = l.campaignDashboards ?? {};
      const dashboards = body.dashboard === null ? others : { ...others, [body.key]: body.dashboard };
      const { campaignDashboards: _all, ...rest } = l;
      return check(Object.keys(dashboards).length ? { ...rest, campaignDashboards: dashboards } : rest);
    }
    default: throw new Error("Unknown action.");
  }
}

/** The widgets whose data needs the Maptable and Encyclopedia workspaces. */
export const needsWorkspaces = (l: HomeLayout) => l.widgets.some(w => ["continue", "campaigns", "folders", "recent", "sessions", "quests", "pinned", "todo"].includes(w.type));
