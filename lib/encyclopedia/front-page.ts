import { z } from "zod";
import type { Calendar } from "./calendar-model.ts";
import { formatDate } from "./calendar-model.ts";

/*
 * A campaign's front page: the first thing players see with their link, and the
 * Front page tab of the campaign hub. It is a list of widgets the GM arranges.
 * Players only ever get the resolved page from `resolveFrontPage`, which is built
 * from the player payload, so nothing hidden from players can reach it.
 */

const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const title = z.string().trim().max(80).optional();
const common = { id, title, wide: z.boolean().optional() };
const url = z.string().trim().max(500).refine(v => /^https?:\/\/[^\s]+$/i.test(v), "Links must start with http:// or https://");

export const frontWidgetSchema = z.discriminatedUnion("type", [
  z.object({ ...common, type: z.literal("next"), when: z.string().max(40).refine(v => !v || Number.isFinite(Date.parse(v)), "Choose a valid date and time"), where: z.string().trim().max(120) }),
  z.object({ ...common, type: z.literal("date"), calendarId: z.string().max(100) }),
  z.object({ ...common, type: z.literal("party") }),
  z.object({ ...common, type: z.literal("recap") }),
  z.object({ ...common, type: z.literal("text"), body: z.string().max(4000) }),
  // The story so far: a short summary of the campaign, written (often by the GM's AI) from published recaps.
  z.object({ ...common, type: z.literal("story"), body: z.string().max(6000), from: z.number().int().min(0).max(10000).optional(), at: z.string().max(40).optional() }),
  z.object({ ...common, type: z.literal("links"), links: z.array(z.object({ label: z.string().trim().min(1).max(80), url: url.optional(), entryId: id.optional() })
    .refine(l => !!l.url !== !!l.entryId, "Each link goes to a web address or a page")).max(12) }),
]);
export const frontPageSchema = z.object({ widgets: z.array(frontWidgetSchema).max(24) })
  .refine(p => new Set(p.widgets.map(w => w.id)).size === p.widgets.length, "Widget IDs must be unique");

export type FrontWidget = z.infer<typeof frontWidgetSchema>;
export type FrontPage = z.infer<typeof frontPageSchema>;
export type FrontWidgetType = FrontWidget["type"];

export const widgetNames: Record<FrontWidgetType, string> = {
  next: "Next session", date: "In the game", party: "The party", recap: "Last session", story: "The story so far", text: "Text", links: "Links",
};

/** The page a campaign starts with before the GM customises it. */
export function defaultFrontPage(calendars: { id: string; visibility: string }[] = []): FrontPage {
  const shared = calendars.find(c => c.visibility === "players");
  return { widgets: [
    { id: "next", type: "next", when: "", where: "" },
    ...(shared ? [{ id: "date", type: "date" as const, calendarId: shared.id }] : []),
    { id: "party", type: "party" },
    { id: "recap", type: "recap", wide: true },
    { id: "welcome", type: "text", title: "Welcome", body: "" },
  ] };
}

export function newWidget(type: FrontWidgetType, wid: string, calendars: { id: string }[] = []): FrontWidget {
  switch (type) {
    case "next": return { id: wid, type, when: "", where: "" };
    case "date": return { id: wid, type, calendarId: calendars[0]?.id ?? "" };
    case "text": return { id: wid, type, title: "House rules", body: "" };
    case "story": return { id: wid, type, body: "" };
    case "links": return { id: wid, type, title: "Resources", links: [] };
    default: return { id: wid, type };
  }
}

/** What players see. Every field is already safe to show them. */
export type ResolvedWidget = { id: string; type: FrontWidgetType; title: string; wide: boolean } & (
  | { type: "next"; when: string; where: string }
  | { type: "date"; calendar: string; date: string }
  | { type: "party"; members: { id: string; title: string }[] }
  | { type: "recap"; entryId: string | null; heading: string; excerpt: string }
  | { type: "text"; body: string }
  | { type: "story"; body: string; sessions: { id: string; title: string }[] }
  | { type: "links"; links: { label: string; url?: string; entryId?: string }[] }
);
export type ResolvedFrontPage = { widgets: ResolvedWidget[]; customised: boolean };

type PlayerEntry = { id: string; title: string; kind: string; role?: string; tabs: { body: string }[] };

/**
 * Builds the player-facing page. `entries` must be the player payload's entries,
 * `calendars` the player-visible calendars, and `clean` the function that strips
 * GM secrets from free text, and `sessionsNewestFirst` lists session page IDs, newest first.
 */
export function resolveFrontPage(page: FrontPage | undefined, input: {
  entries: PlayerEntry[]; calendars: Calendar[]; clean: (text: string) => string; sessionsNewestFirst: string[];
}): ResolvedFrontPage {
  const source = page ?? defaultFrontPage(input.calendars);
  const readable = new Map(input.entries.map(e => [e.id, e]));
  const widgets = source.widgets.flatMap((w): ResolvedWidget[] => {
    const base = { id: w.id, title: w.title?.trim() || widgetNames[w.type], wide: !!w.wide };
    switch (w.type) {
      case "next": return [{ ...base, type: "next", when: w.when, where: input.clean(w.where) }];
      case "date": {
        const c = input.calendars.find(c => c.id === w.calendarId);
        return c ? [{ ...base, type: "date", calendar: c.name, date: formatDate(c, c.current) }] : [];
      }
      case "party": return [{ ...base, type: "party", members: input.entries.filter(e => e.kind === "character" && e.role === "pc").map(e => ({ id: e.id, title: e.title })) }];
      case "recap": {
        const latest = input.sessionsNewestFirst.map(id => readable.get(id)).find(Boolean);
        const text = latest?.tabs.map(t => t.body).find(b => b.trim()) ?? "";
        return [{ ...base, type: "recap", entryId: latest?.id ?? null, heading: latest?.title ?? "", excerpt: excerpt(text) }];
      }
      case "text": return [{ ...base, type: "text", body: input.clean(w.body) }];
      case "story": return [{ ...base, type: "story", body: input.clean(w.body), sessions: input.sessionsNewestFirst.flatMap(id => { const e = readable.get(id); return e ? [{ id: e.id, title: e.title }] : []; }).slice(0, 3) }];
      case "links": return [{ ...base, type: "links", links: w.links.filter(l => l.url || (l.entryId && readable.has(l.entryId))).map(l => l.url ? { label: l.label, url: l.url } : { label: l.label, entryId: l.entryId }) }];
    }
  });
  return { widgets, customised: !!page };
}

function excerpt(text: string, max = 320) {
  const plain = text.replace(/^#+\s*/gm, "").replace(/^\s*[-*]\s+(\[[ xX]\]\s*)?/gm, "").replace(/\s+/g, " ").trim();
  return plain.length > max ? plain.slice(0, max).replace(/\s+\S*$/, "") + "…" : plain;
}
