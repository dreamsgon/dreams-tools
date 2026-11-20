import { campaignLayout, homeCampaigns, type CampaignFolder, type CampaignRow, type CampaignSummary } from "./campaign-links.ts";
import { joinedForSwitcher, type JoinedCampaign } from "./campaign-nav.ts";

/**
 * The quick campaign switcher in the campaign bar (components/campaign-bar.tsx). Pure logic only:
 * filtering, grouping into Pinned / Recent / Folders and keyboard movement.
 * The popover itself is components/campaign-switcher.tsx.
 */

export type SwitcherTool = "encyclopedia" | "maptable";

/** Recent shows at most this many campaigns, none of them pinned. */
export const RECENT_LIMIT = 4;

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * Pins come from GET /api/home as `{ layout: { pinnedCampaigns?: string[] } }`. Anything else
 * (not found, an error page, another shape) means "no pins": null.
 */
export function pinsFromHome(body: unknown): string[] | null {
  const pins = (body as { layout?: { pinnedCampaigns?: unknown } } | null | undefined)?.layout?.pinnedCampaigns;
  if (!Array.isArray(pins)) return null;
  const list = pins.filter((p): p is string => typeof p === "string" && !!p);
  return list.length ? list : null;
}

/** When each campaign was last opened, from the same GET /api/home body (`layout.opened`), or undefined. */
export function openedFromHome(body: unknown): Record<string, string> | undefined {
  const opened = (body as { layout?: { opened?: unknown } } | null | undefined)?.layout?.opened;
  if (!opened || typeof opened !== "object" || Array.isArray(opened)) return undefined;
  const out = Object.fromEntries(Object.entries(opened).filter((e): e is [string, string] => typeof e[1] === "string"));
  return Object.keys(out).length ? out : undefined;
}

/** Where a row sits in the pin list (its first matching pin), or -1 when it is not pinned. A pin names the row key, `m:<maptable id>` or `e:<encyclopedia id>`. */
export function pinPosition(row: CampaignRow, pins: readonly string[] | null | undefined): number {
  if (!pins?.length) return -1;
  const names = [row.key, row.maptable ? `m:${row.maptable.id}` : "", row.encyclopedia ? `e:${row.encyclopedia.id}` : ""].filter(Boolean);
  return pins.findIndex(p => names.includes(p));
}
export const isPinned = (row: CampaignRow, pins: readonly string[] | null | undefined) => pinPosition(row, pins) >= 0;

/** Whether the campaign has something to open in this tool. Without it, picking goes to the campaign hub. */
export function hasHalf(tool: SwitcherTool, row: CampaignRow): boolean {
  return tool === "maptable" ? !!row.maptable : !!row.encyclopedia;
}

/** The campaign's hub on the Campaigns page. */
export const hubHref = (row: CampaignRow) => `/campaigns/${encodeURIComponent(row.key)}`;

/** The small line under a campaign name. */
export function rowDetail(tool: SwitcherTool, row: CampaignRow): string {
  if (tool === "maptable") return !row.maptable ? "No Maptable yet · Add Maptable" : row.maptable.scenes ? plural(row.maptable.scenes, "scene") : "No scenes yet";
  const world = row.encyclopedia?.worldName ?? "";
  return row.encyclopedia ? [world, plural(row.encyclopedia.pages, "page")].filter(Boolean).join(" · ") : "Maptable only · Add Wiki";
}

/** True when the text names the campaign or its world, ignoring case and extra spaces. */
export function matchesQuery(row: CampaignRow, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return true;
  return row.name.toLocaleLowerCase().includes(q) || (row.encyclopedia?.worldName ?? "").toLocaleLowerCase().includes(q);
}

export type SwitcherItem =
  | { type: "heading"; id: string; label: string; icon?: "star" | "folder" }
  | { type: "folder"; id: string; folder: CampaignFolder; depth: number; count: number; open: boolean }
  | { type: "row"; id: string; row: CampaignRow; depth: number; pinned: boolean }
  /** A campaign someone else runs that you joined. */
  | { type: "member"; id: string; joined: JoinedCampaign };

export type SwitcherOptions = {
  query?: string;
  /** Pinned campaign keys, or null when the pins could not be read (the Pinned section is then left out). */
  pins?: readonly string[] | null;
  /** When each campaign was last opened (the home layout's `opened`), which orders Recent. */
  opened?: Record<string, string>;
  /** Folder ids that are expanded. */
  expanded?: ReadonlySet<string>;
  recentLimit?: number;
  /** Campaigns other people run that you joined (GET /api/members?mine=1). Listed last, under "Campaigns you're in". */
  joined?: readonly JoinedCampaign[] | null;
};

const joinedMatches = (j: JoinedCampaign, query: string) => {
  const q = query.trim().toLocaleLowerCase();
  return !q || j.campaign.toLocaleLowerCase().includes(q) || j.world.toLocaleLowerCase().includes(q);
};

/**
 * Everything the popover lists, top to bottom. With a search it is one flat list of matches (archived
 * campaigns included). Without, Pinned, Recent (not already pinned) and the Campaigns page's folders in
 * the same order, then campaigns that sit in no folder. Archived campaigns stay out of the groups, as on the Campaigns page.
 */
export function switcherItems(summary: CampaignSummary, options: SwitcherOptions = {}): SwitcherItem[] {
  const { query = "", pins = null, opened, expanded = new Set<string>(), recentLimit = RECENT_LIMIT } = options;
  const flag = (row: CampaignRow) => isPinned(row, pins);
  const joined = joinedForSwitcher(options.joined).filter(j => joinedMatches(j, query));
  const members = joined.map((j): SwitcherItem => ({ type: "member", id: `j:${j.ref}`, joined: j }));
  if (query.trim()) {
    const hits = summary.rows.filter(r => matchesQuery(r, query)), count = hits.length + members.length;
    return [{ type: "heading", id: "h-matches", label: count === 1 ? "1 match" : `${count} matches` },
      ...hits.map((row): SwitcherItem => ({ type: "row", id: `s:${row.key}`, row, depth: 0, pinned: flag(row) })), ...members];
  }
  const live = summary.rows.filter(r => !r.encyclopedia?.archived);
  const out: SwitcherItem[] = [];
  const pinned = live.map(row => ({ row, at: pinPosition(row, pins) })).filter(x => x.at >= 0).sort((a, b) => a.at - b.at).map(x => x.row);
  if (pinned.length) out.push({ type: "heading", id: "h-pinned", label: "Pinned", icon: "star" }, ...pinned.map((row): SwitcherItem => ({ type: "row", id: `p:${row.key}`, row, depth: 0, pinned: true })));
  const recent = homeCampaigns({ ...summary, rows: live }, opened).filter(r => !flag(r)).slice(0, Math.max(0, recentLimit));
  if (recent.length) out.push({ type: "heading", id: "h-recent", label: "Recent" }, ...recent.map((row): SwitcherItem => ({ type: "row", id: `r:${row.key}`, row, depth: 0, pinned: false })));
  const collapsed = new Set(summary.folders.map(f => f.id).filter(id => !expanded.has(id)));
  const layout = campaignLayout(summary.folders, live, collapsed);
  const firstLoose = layout.findIndex(item => item.type === "row" && item.depth === 0);
  layout.forEach((item, i) => {
    if (i === 0 && summary.folders.length && firstLoose !== 0) out.push({ type: "heading", id: "h-folders", label: "Folders", icon: "folder" });
    if (i === firstLoose && (i === 0 || summary.folders.length)) out.push({ type: "heading", id: "h-loose", label: summary.folders.length ? "Not in a folder" : "All campaigns" });
    out.push(item.type === "folder"
      ? { type: "folder", id: `f:${item.folder.id}`, folder: item.folder, depth: item.depth, count: item.count, open: item.open }
      : { type: "row", id: `c:${item.row.key}`, row: item.row, depth: item.depth, pinned: flag(item.row) });
  });
  if (members.length) out.push({ type: "heading", id: "h-joined", label: "Campaigns you're in" }, ...members);
  return out;
}

/** Positions in `items` that ↑/↓ visit: campaigns and folders, not headings. */
export const navigable = (items: readonly SwitcherItem[]): number[] => items.flatMap((item, i) => item.type === "heading" ? [] : [i]);

/**
 * The next highlighted position after an arrow key. `current` is a position in the navigable list, or -1 for none
 * yet; ↓ from none goes to the first, ↑ to the last, and both wrap. Home and End jump. Other keys leave it as it is.
 */
export function moveIndex(current: number, key: string, count: number): number {
  if (count <= 0) return -1;
  if (key === "ArrowDown") return current < 0 || current >= count - 1 ? 0 : current + 1;
  if (key === "ArrowUp") return current <= 0 ? count - 1 : current - 1;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return Math.min(current, count - 1);
}

/** The folders that hold a campaign, so the one with the current campaign starts open. */
export function folderChain(folders: readonly CampaignFolder[], folderId: string | null): string[] {
  const by = new Map(folders.map(f => [f.id, f])), out: string[] = [];
  for (let at = folderId ? by.get(folderId) : undefined; at && !out.includes(at.id); at = at.parentId ? by.get(at.parentId) : undefined) out.push(at.id);
  return out;
}

/** The shortcut that opens the switcher anywhere in a tool: Ctrl/Cmd+Shift+O. (Ctrl/Cmd+K is quick search.) */
export function isSwitcherShortcut(e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  return (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === "o";
}
