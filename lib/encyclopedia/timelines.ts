import { z } from "zod";
import { formatDate, type Calendar } from "./calendar-model.ts";
import type { Recap } from "./recap-schema.ts";

/*
 * Timeline pages: a page kind whose Timeline tab lays events out in order, in eras.
 *
 * A timeline has a style that only sets its starting categories and what it gathers:
 *   history   World history: ages and eras, year by year (the War of the Lance, the founding of a city).
 *   campaign  Campaign chronicle: what happened in play, with the campaign's sessions and calendar events gathered in.
 *   life      A life or a house: follows one page (a character, an organization, a place) and gathers every event on
 *             other timelines that names it.
 *   custom    Anything else, such as a sequence with no dates at all.
 *
 * Dates are a year (which may be 0 or below, for "before" years such as 500 PC), and, when the timeline uses one of the
 * campaign's calendars, a month and day from it. An event can span to an end date, be "about" (c. 351 AC), or be shown
 * with a label of its own ("Before the Sundering"). An event without a date stays where it is in the list, after the
 * event before it. Sessions are placed by their in-world date (the date their recap moved the calendar to), or by when
 * they were played among the sessions that have one.
 *
 * Everything gathered (calendar events, sessions, events from other timelines) is worked out when the timeline is read,
 * never copied, so it stays current. Players get only shared events of a shared timeline, pages they can read, and
 * gathered things they could see anyway (see playerTimeline).
 */

const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const visibility = z.enum(["gm", "players"]);
export const MAX_TIMELINE_YEAR = 999_999;
export const timelineStyles = ["history", "campaign", "life", "custom"] as const;
export type TimelineStyle = typeof timelineStyles[number];

export const timelineWhenSchema = z.object({
  year: z.number().int().min(-MAX_TIMELINE_YEAR).max(MAX_TIMELINE_YEAR),
  /** A month or festival of the timeline's calendar. */
  periodId: id.optional(),
  day: z.number().int().min(1).max(130).optional(),
});
export const timelineEventSchema = z.object({
  id, title: z.string().trim().min(1).max(200),
  /** Left out: no date. The event stays after the one before it in the list. */
  when: timelineWhenSchema.optional(),
  /** A span: when it ended. */
  end: timelineWhenSchema.optional(),
  /** About this date (c.). */
  approx: z.boolean().optional(),
  /** Shown instead of the date, such as "Before the Sundering". */
  label: z.string().trim().max(80).optional(),
  categoryId: id.optional(),
  major: z.boolean().optional(),
  text: z.string().max(4000),
  /** Pages this event is about. A "life" timeline of any of them gathers it. */
  pageIds: z.array(id).max(12),
  /** The session it happened in. */
  sessionId: id.optional(),
  visibility,
});
export const timelineEraSchema = z.object({
  id, name: z.string().trim().min(1).max(80), start: z.number().int().min(-MAX_TIMELINE_YEAR).max(MAX_TIMELINE_YEAR),
  /** Left out: it lasts until now (or the next era). */
  end: z.number().int().min(-MAX_TIMELINE_YEAR).max(MAX_TIMELINE_YEAR).optional(),
  color, text: z.string().max(1000), visibility,
});
export const timelineCategorySchema = z.object({ id, name: z.string().trim().min(1).max(40), color });
export const timelineSchema = z.object({
  style: z.enum(timelineStyles),
  /** The Timeline tab. Players also need the event to be shared. */
  visibility,
  /** One of the campaign's calendars, for months, days, its year prefix and era name, and Today. */
  calendarId: id.optional(),
  /** Without a calendar: written after the year (351 AC). */
  yearSuffix: z.string().trim().max(20).optional(),
  /** Years 0 and below: written as years before, with this after them (500 PC). Left out: −500. */
  beforeSuffix: z.string().trim().max(20).optional(),
  /** Gather the calendar's events (not yearly holidays). */
  showCalendar: z.boolean().optional(),
  /** Gather the campaign's session pages and their recap's big beats. */
  showSessions: z.boolean().optional(),
  /** A life or a house: the page this timeline follows. */
  focusId: id.optional(),
  eras: z.array(timelineEraSchema).max(40),
  categories: z.array(timelineCategorySchema).max(24),
  events: z.array(timelineEventSchema).max(1000),
}).superRefine((t, ctx) => {
  const bad = (message: string) => ctx.addIssue({ code: "custom", message });
  if (new Set(t.events.map(e => e.id)).size !== t.events.length) bad("Timeline event ids must be unique");
  if (new Set(t.eras.map(e => e.id)).size !== t.eras.length) bad("Era ids must be unique");
  if (new Set(t.categories.map(e => e.id)).size !== t.categories.length) bad("Timeline category ids must be unique");
  for (const era of t.eras) if (era.end !== undefined && era.end < era.start) bad(`The era “${era.name}” ends before it starts`);
  for (const e of t.events) if (e.end && !e.when) bad(`“${e.title}” has an end date but no start date`);
});
export type Timeline = z.infer<typeof timelineSchema>;
export type TimelineEvent = z.infer<typeof timelineEventSchema>;
export type TimelineEra = z.infer<typeof timelineEraSchema>;
export type TimelineCategory = z.infer<typeof timelineCategorySchema>;
export type TimelineWhen = z.infer<typeof timelineWhenSchema>;

export const STYLE_LABELS: Record<TimelineStyle, string> = { history: "World history", campaign: "Campaign chronicle", life: "A life or a house", custom: "Custom" };
export const STYLE_HINTS: Record<TimelineStyle, string> = {
  history: "Ages and eras, year by year",
  campaign: "What happened in play, with sessions and calendar events",
  life: "One character, family, organization or place, gathered from every timeline",
  custom: "Your own categories, dated or just in order",
};
export const TIMELINE_COLORS = ["#b4463c", "#b07a1f", "#2f7d6d", "#2f6fae", "#7a5bb0", "#8e4f8a", "#5f6b3a", "#7d6b4f", "#3d7f9e", "#a35a7d"];
const STARTING: Record<TimelineStyle, [string, string][]> = {
  history: [["War & battle", "#b4463c"], ["Rulers & realms", "#7a5bb0"], ["Founding", "#2f7d6d"], ["Disaster", "#b07a1f"], ["Discovery", "#2f6fae"], ["Faith & magic", "#8e4f8a"]],
  campaign: [["Story", "#2f6fae"], ["Combat", "#b4463c"], ["Discovery", "#2f7d6d"], ["Downtime", "#7d6b4f"]],
  life: [["Family", "#2f7d6d"], ["Deeds", "#2f6fae"], ["Loss", "#7a5bb0"], ["Turning point", "#b07a1f"]],
  custom: [["Event", "#2f6fae"]],
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "c";

/** A new timeline of a style. A campaign chronicle starts with sessions and the first calendar gathered in. */
export function newTimeline(style: TimelineStyle = "history", opts: { calendarId?: string; focusId?: string } = {}): Timeline {
  return {
    style, visibility: "gm", eras: [], events: [],
    categories: STARTING[style].map(([name, color]) => ({ id: slug(name), name, color })),
    ...(opts.calendarId ? { calendarId: opts.calendarId } : {}),
    ...(style === "campaign" ? { showSessions: true, ...(opts.calendarId ? { showCalendar: true } : {}) } : {}),
    ...(style === "life" && opts.focusId ? { focusId: opts.focusId } : {}),
  };
}

/** Changes the style, adding the new style's starting categories that are missing. Events keep their categories. */
export function restyle(t: Timeline, style: TimelineStyle): Timeline {
  const names = new Set(t.categories.map(c => c.name.toLowerCase()));
  const extra = newTimeline(style).categories.filter(c => !names.has(c.name.toLowerCase()) && !t.categories.some(x => x.id === c.id));
  return { ...t, style, categories: [...t.categories, ...extra].slice(0, 24), ...(style === "campaign" && t.showSessions === undefined ? { showSessions: true } : {}) };
}

// ---- Dates ------------------------------------------------------------------------------------

/** A number that puts dates in order: year, then month, then day. */
export function whenKey(w: TimelineWhen, cal?: Calendar) {
  const p = cal && w.periodId ? cal.periods.findIndex(x => x.id === w.periodId) : -1;
  return w.year * 10_000 + (p >= 0 ? (p + 1) * 131 + (w.day ?? 0) : 0);
}
const yearText = (year: number, t: Pick<Timeline, "yearSuffix" | "beforeSuffix">, cal?: Calendar) => {
  if (year <= 0 && t.beforeSuffix) return `${1 - year} ${t.beforeSuffix}`;
  if (cal) return `${cal.yearPrefix}${year < 0 ? `−${-year}` : year}${cal.era ? ` ${cal.era}` : ""}`;
  return `${year < 0 ? `−${-year}` : year}${t.yearSuffix ? ` ${t.yearSuffix}` : ""}`;
};
/** A date as people read it: "12 Mishamont, 351 AC", "Mishamont 351 AC", "351 AC" or "500 PC". */
export function formatWhen(w: TimelineWhen, t: Pick<Timeline, "yearSuffix" | "beforeSuffix">, cal?: Calendar) {
  const p = cal && w.periodId ? cal.periods.find(x => x.id === w.periodId) : undefined;
  if (cal && p && w.year >= 1 && !(w.year <= 0 && t.beforeSuffix)) {
    if (w.day) return formatDate(cal, { year: w.year, periodId: p.id, day: w.day });
    return `${p.name} ${yearText(w.year, t, cal)}`;
  }
  return yearText(w.year, t, cal);
}
/** An event's date line: its label, or its date (with c. and an end). Empty when it has none. */
export function eventDate(e: Pick<TimelineEvent, "when" | "end" | "approx" | "label">, t: Pick<Timeline, "yearSuffix" | "beforeSuffix">, cal?: Calendar) {
  if (e.label?.trim()) return e.label.trim();
  if (!e.when) return "";
  const start = formatWhen(e.when, t, cal), c = e.approx ? "c. " : "";
  if (!e.end) return c + start;
  const end = formatWhen(e.end, t, cal);
  // 351–352 AC rather than 351 AC – 352 AC, when both are bare years written the same way.
  const side = (y: number) => y <= 0 && !!t.beforeSuffix, sfx = (y: number) => side(y) ? t.beforeSuffix! : cal ? cal.era : t.yearSuffix ?? "";
  if (!e.when.periodId && !e.end.periodId && side(e.when.year) === side(e.end.year) && !cal?.yearPrefix) {
    const n = (y: number) => side(y) ? String(1 - y) : y < 0 ? `−${-y}` : String(y), s = sfx(e.end.year);
    return `${c}${n(e.when.year)}–${n(e.end.year)}${s ? ` ${s}` : ""}`;
  }
  return `${c}${start} – ${end}`;
}
export const eraYears = (era: Pick<TimelineEra, "start" | "end">, t: Pick<Timeline, "yearSuffix" | "beforeSuffix">, cal?: Calendar) =>
  era.end === undefined ? `${yearText(era.start, t, cal)} onwards` : eventDate({ when: { year: era.start }, end: { year: era.end } }, t, cal);

// ---- Reading a timeline -----------------------------------------------------------------------

type Page = { id: string; worldId: string; campaignId: string | null; kind: string; title: string; body: string; overviewVisibility?: "gm" | "players"; recap?: Recap; timeline?: Timeline };
type CampaignLike = { id: string; calendars?: Calendar[] };

export type TimelineItem = {
  key: string;
  source: "event" | "calendar" | "session" | "linked";
  /** The event's id, the calendar event's id or the session page's id. */
  id: string;
  title: string; text: string; date: string;
  /** Where it falls; left out for items with nothing to place them by. */
  sort?: number; year?: number; played?: string;
  categoryId?: string; major: boolean; gm: boolean;
  pageIds: string[]; steps: string[];
  sessionId?: string;
  /** A linked event: the timeline it is on. */
  fromId?: string; fromTitle?: string;
};
export type TimelineEraView = TimelineEra & { years: string };
export type TimelineView = {
  items: TimelineItem[];
  eras: TimelineEraView[];
  categories: TimelineCategory[];
  /** The calendar's current date, placed on the timeline. */
  now?: { sort: number; year: number; date: string };
  calendarName?: string;
  /** A year written the timeline's way, for every year an item or era starts or ends (the strip's labels). */
  yearNames: Record<string, string>;
};

export type TimelineFilter = {
  /** Players: only shared things, and pages they can read. */
  players?: { readable: ReadonlySet<string>; clean: (text: string) => string };
};

const sessionDate = (r: Recap | undefined, calendarId: string | undefined) =>
  r?.review.find(i => i.kind === "date" && i.state === "done" && i.date && (!calendarId || i.calendarId === calendarId))?.date;
const beatsOf = (r: Recap | undefined) => {
  const beats = r?.timeline ?? [], big = beats.filter(b => b.big);
  return (big.length ? big : beats.slice(0, 4)).map(b => b.title);
};
const linksTo = (text: string, pageId: string) => text.includes(`[[${pageId}`);

/**
 * The timeline as it reads in a campaign: its own events and everything it gathers, in order, with dates written out.
 * `pages` are the pages the campaign can see (visibleEntries). `filter.players` gives the players' copy.
 */
export function readTimeline(page: Page & { timeline: Timeline }, pages: readonly Page[], campaign: CampaignLike | undefined, filter: TimelineFilter = {}): TimelineView {
  const t = page.timeline, pl = filter.players, clean = pl ? pl.clean : (s: string) => s;
  const calendars = campaign?.calendars ?? [];
  const cal = t.calendarId ? calendars.find(c => c.id === t.calendarId) : undefined;
  const calShown = !!cal && (!pl || cal.visibility === "players");
  const shownCal = calShown ? cal : undefined;
  const byId = new Map(pages.map(p => [p.id, p]));
  const readable = (pid: string) => byId.has(pid) && (!pl || pl.readable.has(pid));
  const keepPages = (ids: string[]) => ids.filter(readable);
  const sessionOf = (sid: string | undefined) => { const s = sid ? byId.get(sid) : undefined; return s?.kind === "session" && readable(s.id) ? s : undefined; };
  const items: TimelineItem[] = [];

  const own = (e: TimelineEvent, from?: Page & { timeline: Timeline }): TimelineItem | null => {
    if (pl && e.visibility !== "players") return null;
    const tl = from?.timeline ?? t, fromCal = from ? (tl.calendarId === t.calendarId ? cal : calendars.find(c => c.id === tl.calendarId)) : cal;
    const useCal = fromCal && (!pl || fromCal.visibility === "players") ? fromCal : undefined;
    const session = sessionOf(e.sessionId);
    const category = from ? undefined : e.categoryId && t.categories.some(c => c.id === e.categoryId) ? e.categoryId : undefined;
    return {
      key: from ? `${from.id}:${e.id}` : e.id, source: from ? "linked" : "event", id: e.id,
      title: e.title, text: clean(e.text), date: eventDate(e, tl, useCal),
      ...(e.when ? { sort: whenKey(e.when, useCal), year: e.when.year } : {}),
      ...(session?.recap?.playedOn ? { played: session.recap.playedOn } : {}),
      ...(category ? { categoryId: category } : {}),
      major: !!e.major, gm: e.visibility === "gm", pageIds: keepPages(e.pageIds), steps: [],
      ...(session ? { sessionId: session.id } : {}),
      ...(from ? { fromId: from.id, fromTitle: from.title } : {}),
    };
  };

  // Its own events. One without a date stays after the one before it.
  let last: { sort?: number; year?: number } = {};
  for (const e of t.events) {
    const item = own(e);
    if (item && item.sort === undefined && !item.played && last.sort !== undefined) { item.sort = last.sort; item.year = last.year; }
    if (e.when) last = { sort: whenKey(e.when, cal), year: e.when.year };
    if (item) items.push(item);
  }

  // The calendar's events, not the yearly ones (those are holidays, not history).
  if (t.showCalendar && shownCal) for (const ev of shownCal.events) {
    if (ev.annual || (pl && ev.visibility !== "players")) continue;
    const when = { year: ev.date.year, periodId: ev.date.periodId, day: ev.date.day };
    items.push({ key: `cal:${ev.id}`, source: "calendar", id: ev.id, title: ev.title, text: clean(ev.notes), date: formatWhen(when, t, shownCal), sort: whenKey(when, shownCal), year: when.year, major: false, gm: ev.visibility === "gm", pageIds: [], steps: [] });
  }

  // Sessions: their in-world date when the recap moved the calendar on, and the big beats of their recap.
  if (t.showSessions && campaign) for (const s of pages) {
    if (s.kind !== "session" || s.campaignId !== campaign.id || !readable(s.id)) continue;
    if (pl && (s.recap?.status === "draft" || s.overviewVisibility !== "players")) continue;
    const d = sessionDate(s.recap, cal?.id), when = d && shownCal ? { year: d.year, periodId: d.periodId, day: d.day } : undefined;
    items.push({
      key: `session:${s.id}`, source: "session", id: s.id, title: s.title, text: "",
      date: when ? formatWhen(when, t, shownCal) : "", ...(when ? { sort: whenKey(when, shownCal), year: when.year } : {}),
      ...(s.recap?.playedOn ? { played: s.recap.playedOn } : {}),
      major: false, gm: s.overviewVisibility !== "players", pageIds: [], steps: !pl || s.recap?.shareTimeline ? beatsOf(s.recap) : [], sessionId: s.id,
    });
  }

  // A life or a house: events on other timelines that are about the page this one follows.
  const focus = t.focusId && readable(t.focusId) ? t.focusId : undefined;
  if (focus) for (const other of pages) {
    if (other.id === page.id || !other.timeline || !readable(other.id) || (pl && other.timeline.visibility !== "players")) continue;
    for (const e of other.timeline.events) {
      if (!e.pageIds.includes(focus) && !linksTo(e.text, focus)) continue;
      const item = own(e, other as Page & { timeline: Timeline });
      if (item) items.push(item);
    }
  }

  // Things with a played date but no in-world date go among the ones that have both, by when they were played.
  const anchors = items.filter(i => i.sort !== undefined && i.played).sort((a, b) => a.played!.localeCompare(b.played!));
  for (const i of items) {
    if (i.sort !== undefined || !i.played) continue;
    const next = anchors.find(a => a.played! >= i.played!), prev = [...anchors].reverse().find(a => a.played! < i.played!);
    const at = next ?? prev;
    if (at) { i.sort = at.sort! + (next ? -0.5 : 0.5); i.year = at.year; }
  }

  const seq = new Map(items.map((x, n) => [x.key, n]));
  const anyDated = items.some(i => i.sort !== undefined);
  items.sort((a, b) => {
    if (anyDated && (a.sort === undefined) !== (b.sort === undefined)) return a.sort === undefined ? 1 : -1;
    if (a.sort !== undefined && b.sort !== undefined && a.sort !== b.sort) return a.sort - b.sort;
    if (a.played && b.played && a.played !== b.played) return a.played.localeCompare(b.played);
    if (!anyDated && !!a.played !== !!b.played) return a.played ? -1 : 1;
    return seq.get(a.key)! - seq.get(b.key)!;
  });

  const eras = t.eras.filter(e => !pl || e.visibility === "players").map(e => ({ ...e, text: clean(e.text), years: eraYears(e, t, shownCal) })).sort((a, b) => a.start - b.start);
  const nowWhen = shownCal ? { year: shownCal.current.year, periodId: shownCal.current.periodId, day: shownCal.current.day } : undefined;
  return {
    items, eras, categories: t.categories,
    ...(nowWhen ? { now: { sort: whenKey(nowWhen, shownCal), year: nowWhen.year, date: formatWhen(nowWhen, t, shownCal) } } : {}),
    ...(shownCal ? { calendarName: shownCal.name } : {}),
    yearNames: Object.fromEntries([...new Set([...items.flatMap(i => i.year === undefined ? [] : [i.year]), ...eras.flatMap(e => e.end === undefined ? [e.start] : [e.start, e.end]), ...(nowWhen ? [nowWhen.year] : [])])].map(y => [String(y), yearText(y, t, shownCal)])),
  };
}

/** The era a year falls in: the latest one that has started and not ended. */
export function eraOf<E extends Pick<TimelineEra, "id" | "start" | "end">>(eras: readonly E[], year: number | undefined): E | undefined {
  if (year === undefined) return undefined;
  return [...eras].sort((a, b) => b.start - a.start).find(e => e.start <= year && (e.end === undefined || year <= e.end));
}

/** The timelines that name a page: in their events' pages or text. For a page's "On timelines" list. */
export function timelinesNaming<P extends Page>(pages: readonly P[], pageId: string) {
  return pages.filter(p => p.id !== pageId && p.timeline?.events.some(e => e.pageIds.includes(pageId) || linksTo(e.text, pageId)));
}

// ---- Checks, copies and text ------------------------------------------------------------------

/** Every page a timeline points at. */
export const timelineRefs = (t: Timeline) => [...new Set([...t.events.flatMap(e => [...e.pageIds, ...(e.sessionId ? [e.sessionId] : [])]), ...(t.focusId ? [t.focusId] : [])])];

/** A copy with page ids replaced (an import). Pages that weren't copied are left out. */
export function remapTimeline(t: Timeline, ids: ReadonlyMap<string, string>): Timeline {
  const link = (text: string) => text.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, (full, target: string, label?: string) => ids.has(target) ? `[[${ids.get(target)}${label ?? ""}]]` : full);
  const { focusId, ...rest } = t;
  return {
    ...rest, ...(focusId && ids.has(focusId) ? { focusId: ids.get(focusId)! } : {}),
    eras: t.eras.map(e => ({ ...e, text: link(e.text) })),
    events: t.events.map(e => { const { sessionId, ...ev } = e; return { ...ev, text: link(e.text), pageIds: e.pageIds.flatMap(p => ids.has(p) ? [ids.get(p)!] : []), ...(sessionId && ids.has(sessionId) ? { sessionId: ids.get(sessionId)! } : {}) }; }),
  };
}

export const timelineSearchText = (t: Timeline | undefined) => t ? [...t.eras.map(e => `${e.name} ${e.text}`), ...t.events.map(e => `${e.title} ${e.label ?? ""} ${e.text}`)].join(" ") : "";

/** The timeline as Markdown, for exports. `link` writes a link to a page by id (empty: leave it out). */
export function timelineMarkdown(view: TimelineView, link: (id: string) => string) {
  const cats = new Map(view.categories.map(c => [c.id, c.name]));
  const out: string[] = [];
  let era: string | undefined;
  for (const i of view.items) {
    const e = eraOf(view.eras, i.year);
    if (e && e.id !== era) { era = e.id; out.push(`\n## ${e.name} (${e.years})${e.text.trim() ? `\n\n${e.text.trim()}` : ""}\n`); }
    const pages = i.pageIds.map(link).filter(Boolean);
    const meta = [i.categoryId && cats.get(i.categoryId), i.source === "session" ? "Session" : i.source === "calendar" ? "Calendar" : i.fromTitle ? `From ${i.fromTitle}` : "", i.gm ? "GM only" : ""].filter(Boolean).join(" · ");
    out.push(`- ${i.date ? `**${i.date}**: ` : ""}${i.major ? `**${i.title}**` : i.title}${meta ? ` _(${meta})_` : ""}${i.text.trim() ? `\n  ${i.text.trim().replace(/\n+/g, "\n  ")}` : ""}${i.steps.length ? `\n${i.steps.map(s => `  - ${s}`).join("\n")}` : ""}${pages.length ? `\n  Pages: ${pages.join(", ")}` : ""}`);
  }
  return out.join("\n").trim();
}

/** The players' copy of a timeline page's Timeline tab, or undefined when it isn't shared. */
export function playerTimeline(page: Page & { timeline?: Timeline }, pages: readonly Page[], campaign: CampaignLike, readable: ReadonlySet<string>, clean: (text: string) => string): TimelineView | undefined {
  if (!page.timeline || page.timeline.visibility !== "players") return undefined;
  return readTimeline(page as Page & { timeline: Timeline }, pages, campaign, { players: { readable, clean } });
}

/** The stored timeline cut to what players may read (for a players-only AI): undefined unless the tab is shared, then shared events and eras only. */
export function playerSafeTimeline(t: Timeline | undefined, clean: (text: string) => string): Timeline | undefined {
  if (!t || t.visibility !== "players") return undefined;
  return { ...t, eras: t.eras.filter(e => e.visibility === "players").map(e => ({ ...e, text: clean(e.text) })), events: t.events.filter(e => e.visibility === "players").map(e => ({ ...e, text: clean(e.text) })) };
}
