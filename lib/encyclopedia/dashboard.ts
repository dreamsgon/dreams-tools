import { z } from "zod";

/*
 * A campaign's dashboard: the GM's own page on the campaign hub. It is a list of widgets,
 * each with a width, and the few things a widget keeps itself (loose threads, GM notes, links).
 * Everything else a widget shows comes from the rest of the campaign: quests, codex, scenes, party.
 * Players never see the dashboard.
 */

export const dashWidgets = ["next", "quests", "board", "scenes", "initiative", "party", "recent", "codex", "threads", "date", "recap", "roll", "notes", "links"] as const;
export type DashWidget = typeof dashWidgets[number];
export const dashSizes = ["s", "m", "l"] as const;
export type DashSize = typeof dashSizes[number];
/** Columns out of 12 that each width takes. */
export const dashSpan: Record<DashSize, number> = { s: 4, m: 8, l: 12 };

/** Heights in rows: a widget of 2 or 3 rows runs down the side while the others flow beside it. */
export const dashHeights = [1, 2, 3] as const;
export type DashHeight = typeof dashHeights[number];
export const heightSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

/** `tool` is the half of a campaign a widget needs: Maptable ("maps") or the Encyclopedia ("notes"). */
export type DashTool = "maps" | "notes";
export const dashInfo: Record<DashWidget, { name: string; hint: string; size: DashSize; tool?: DashTool }> = {
  next: { name: "Next session", hint: "Date, time and where", size: "s" },
  quests: { name: "Active quests", hint: "From the quest board", size: "m", tool: "notes" },
  board: { name: "Quest board", hint: "The quest columns, small", size: "l", tool: "notes" },
  scenes: { name: "Scenes", hint: "Maptable scenes", size: "m", tool: "maps" },
  initiative: { name: "Last encounter", hint: "Initiative order where you left it", size: "s", tool: "maps" },
  party: { name: "The party", hint: "Player characters and companions", size: "s", tool: "notes" },
  recent: { name: "Recently edited", hint: "Pages changed lately", size: "s", tool: "notes" },
  codex: { name: "Codex", hint: "Newest codex entries", size: "s", tool: "notes" },
  threads: { name: "Loose threads", hint: "A checklist only you see", size: "s" },
  date: { name: "In the game", hint: "Today in a campaign calendar", size: "s", tool: "notes" },
  recap: { name: "Last session", hint: "The newest session page", size: "m", tool: "notes" },
  roll: { name: "Quick roll", hint: "Dice and this campaign's tables", size: "s" },
  notes: { name: "GM notes", hint: "A scratchpad only you see", size: "s" },
  links: { name: "Links", hint: "Character sheets, music, VTT", size: "s" },
};

const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const url = z.string().trim().max(500).refine(v => /^https?:\/\/[^\s]+$/i.test(v), "Links must start with http:// or https://");

export const dashboardSchema = z.object({
  widgets: z.array(z.object({ type: z.enum(dashWidgets), size: z.enum(dashSizes), h: heightSchema.optional() })).max(dashWidgets.length)
    .refine(w => new Set(w.map(x => x.type)).size === w.length, "Each widget can only be on the dashboard once"),
  threads: z.array(z.object({ id, text: z.string().trim().min(1).max(200), done: z.boolean() })).max(50).optional(),
  notes: z.string().max(4000).optional(),
  links: z.array(z.object({ label: z.string().trim().min(1).max(80), url })).max(12).optional(),
});
export type Dashboard = z.infer<typeof dashboardSchema>;

/** Which halves a campaign has: Maptable maps, Encyclopedia notes. */
export type Halves = { maps: boolean; notes: boolean };
export const halvesKind = (h: Halves) => h.maps && h.notes ? "both" as const : h.maps ? "maps" as const : "notes" as const;
/** "type:size" or "type:size:height". */
const starting = {
  both: ["next:s", "scenes:m", "links:s:2", "quests:m", "threads:s:2", "party:s", "initiative:s", "recap:m", "recent:s", "notes:s"],
  maps: ["next:s", "scenes:m", "links:s:2", "initiative:s", "threads:s", "roll:s", "notes:s"],
  notes: ["next:s", "quests:m", "links:s:2", "party:s", "recap:m", "threads:s", "recent:s", "notes:s"],
};
/** The layout a campaign starts with (by the halves it has), and what "Reset" goes back to. Notes, threads and links are kept. */
export function defaultDashboard(keep: Partial<Dashboard> = {}, halves: Halves = { maps: true, notes: true }): Dashboard {
  const widgets = starting[halvesKind(halves)].map(x => {
    const [type, size, h] = x.split(":") as [DashWidget, DashSize, string | undefined];
    return { type, size, ...(h && h !== "1" ? { h: Number(h) as DashHeight } : {}) };
  });
  return { ...keep, widgets };
}

/** The half this campaign lacks for a widget, or null when it can show. */
export const missingHalf = (type: DashWidget, halves: Halves): DashTool | null => {
  const tool = dashInfo[type].tool;
  return tool && !(tool === "maps" ? halves.maps : halves.notes) ? tool : null;
};

export function toggleWidget(d: Dashboard, type: DashWidget, on: boolean): Dashboard {
  const has = d.widgets.some(w => w.type === type);
  if (on === has) return d;
  return { ...d, widgets: on ? [...d.widgets, { type, size: dashInfo[type].size }] : d.widgets.filter(w => w.type !== type) };
}

export function moveWidget(d: Dashboard, from: number, to: number): Dashboard {
  if (from === to || from < 0 || to < 0 || from >= d.widgets.length || to >= d.widgets.length) return d;
  const widgets = [...d.widgets], [w] = widgets.splice(from, 1);
  widgets.splice(to, 0, w);
  return { ...d, widgets };
}

export const resizeWidget = (d: Dashboard, type: DashWidget, size: DashSize): Dashboard =>
  ({ ...d, widgets: d.widgets.map(w => w.type === type ? { ...w, size } : w) });

/** Sets a widget's height; 1 (the default) is left out of the saved layout. */
export const setHeight = (d: Dashboard, type: DashWidget, h: DashHeight): Dashboard =>
  ({ ...d, widgets: d.widgets.map(w => { if (w.type !== type) return w; const { h: _old, ...rest } = w; return h > 1 ? { ...rest, h } : rest; }) });

/** A short plain-text excerpt of a page for the Last session widget. */
export function excerpt(text: string, max = 280) {
  const plain = text.replace(/^:::.*$/gm, "").replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1").replace(/\[\[([^\]]+)\]\]/g, "$1").replace(/^#+\s*/gm, "")
    .replace(/^\s*[-*]\s+(\[[ xX]\]\s*)?/gm, "").replace(/[*_`>]/g, "").replace(/\s+/g, " ").trim();
  return plain.length > max ? plain.slice(0, max).replace(/\s+\S*$/, "") + "…" : plain;
}
