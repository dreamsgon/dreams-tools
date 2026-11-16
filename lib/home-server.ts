import type { Bucket } from "./storage-types";
import { MemberStore } from "./members-server.ts";
import { readBoth, summaryOf, type Session } from "./campaigns-server.ts";
import { recentPage, type CampaignSummary, type RecentPage } from "./campaign-links.ts";
import { questsIn, questProgress, nextStep } from "./encyclopedia/quests.ts";
import { findTable, rollLabel, type RandomTable, type TableLibrary } from "./encyclopedia/tables.ts";
import { applyHomeAction, defaultHomeLayout, hasWidget, homeLayoutSchema, needsWorkspaces, type HomeAction, type HomeLayout } from "./home-layout.ts";

/** The home page layout lives in one small file per account, next to (not inside) the two tools' saved data. */
export const homeKey = (owner: string) => `users/${encodeURIComponent(owner)}/home.json`;
export const HOME_LIMIT = 200_000;

export async function readHome(bucket: Bucket, owner: string): Promise<{ layout: HomeLayout; saved: boolean; etag: string | null }> {
  const object = await bucket.get(homeKey(owner));
  if (!object) return { layout: defaultHomeLayout(), saved: false, etag: null };
  const parsed = homeLayoutSchema.safeParse(await object.json());
  if (!parsed.success) throw new Error("Your home page layout could not be read. Nothing was changed.");
  return { layout: parsed.data, saved: true, etag: object.etag };
}

async function write(bucket: Bucket, owner: string, layout: HomeLayout, etag: string | null) {
  const body = JSON.stringify(homeLayoutSchema.parse(layout));
  if (body.length > HOME_LIMIT) throw new Error("Your home page settings are too large to save. Remove some links, to-dos or notes.");
  return bucket.put(homeKey(owner), body, { onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json" } });
}

/** Reads, changes and saves, trying again if another tab saved in between. */
export async function changeHome(bucket: Bucket, owner: string, change: (l: HomeLayout) => HomeLayout): Promise<HomeLayout> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { layout, etag } = await readHome(bucket, owner);
    const next = change(layout);
    if (next === layout) return layout;
    if (await write(bucket, owner, next, etag)) return next;
  }
  throw new Error("Something else saved your home page at the same moment. Reload and try again.");
}

export const homeAction = (bucket: Bucket, owner: string, action: HomeAction) => changeHome(bucket, owner, l => applyHomeAction(l, action));

export type HomeSession = { campaign: string; key: string; when: string; where: string };
export type HomeQuest = { id: string; title: string; campaign: string; key: string; done: number; total: number; next: string | null };
export type HomeAttention = { id: string; text: string; href: string; action: string; at: string; unread: boolean };
export type HomeTable = { id: string; name: string; roll: string; kind: string; rollable: boolean };
export type HomePinnedPage = RecentPage;
export type HomeData = {
  /** Campaign rows, folders and recent pages. Present when a section that shows campaigns or pages is on. */
  summary?: CampaignSummary;
  sessions?: HomeSession[];
  quests?: HomeQuest[];
  attention?: HomeAttention[];
  /** Starred random tables. `library` holds just what rolling the rollable ones needs. */
  tables?: HomeTable[];
  library?: TableLibrary;
  pinnedPages?: HomePinnedPage[];
};

const TABLE_REF = /\[\[table:([^\]|\n]{1,160})(?:\|[^\]\n]*)?\]\]/gi;
/** Tables a table rolls on, so the copy sent to the browser can roll it. */
function needed(lib: TableLibrary, start: RandomTable) {
  const out = new Map<string, RandomTable>(), todo = [start];
  while (todo.length && out.size < 40) {
    const t = todo.pop()!;
    if (out.has(t.id)) continue;
    out.set(t.id, t);
    const ids = [...(t.pair ?? []), ...(t.twistTableId ? [t.twistTableId] : []), ...[...(t.parts ?? []), ...(t.extras ?? [])].map(p => p.tableId)];
    for (const row of t.rows ?? []) for (const m of row.text.matchAll(TABLE_REF)) { const f = findTable(lib, m[1]); if (f) ids.push(f.id); }
    for (const id of ids) { const f = lib.tables.find(x => x.id === id); if (f && !out.has(f.id)) todo.push(f); }
  }
  return [...out.values()];
}

async function tablesFor(s: Session): Promise<Pick<HomeData, "tables" | "library">> {
  const { data } = await s.book.readTables(s.owner);
  const starred = data.tables.filter(t => t.starred).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 12);
  const keep = new Map<string, RandomTable>(), tables: HomeTable[] = [];
  let size = 0;
  for (const t of starred) {
    const rollable = t.kind === "table" || t.kind === "pair";
    const deps = rollable ? needed(data, t) : [];
    const add = deps.filter(d => !keep.has(d.id)), bytes = add.reduce((n, d) => n + JSON.stringify(d).length, 0);
    const ok = rollable && deps.length < 40 && size + bytes <= 120_000;
    if (ok) { for (const d of add) keep.set(d.id, d); size += bytes; }
    tables.push({ id: t.id, name: t.name, roll: rollLabel(t), kind: t.kind, rollable: ok });
  }
  return { tables, library: { schemaVersion: 1, tables: [...keep.values()] } };
}

async function attentionFor(s: Session): Promise<HomeAttention[]> {
  const { items } = await new MemberStore(s.bucket as ConstructorParameters<typeof MemberStore>[0]).notifications(s.owner);
  const href = (campaignId: string) => `/campaigns/${encodeURIComponent(`e:${campaignId}`)}?tab=members`;
  return items.filter(n => (n.kind === "ask" && n.waiting) || !n.read).slice(0, 6).map(n => ({
    id: n.id, at: n.at, unread: !n.read, href: href(n.campaignId),
    text: `${n.name} ${n.kind === "ask" ? "asked to join" : n.kind === "left" ? "left" : "joined"} ${n.campaign}`,
    action: n.kind === "ask" && n.waiting ? "Review" : "See",
  }));
}

/** Everything the layout's sections show, and nothing for sections that are off. `all` computes every section (for Customize previews). */
export async function homeData(s: Session, layout: HomeLayout, all = false): Promise<HomeData> {
  const on = (t: Parameters<typeof hasWidget>[1]) => all || hasWidget(layout, t);
  const data: HomeData = {};
  const jobs: Promise<void>[] = [];
  if (all ? true : needsWorkspaces(layout)) {
    jobs.push((async () => {
      const both = await readBoth(s);
      const summary = summaryOf(both, on("recent") ? 10 : 6), book = both.book.data;
      data.summary = summary;
      const worlds = new Map(book.worlds.map(w => [w.id, w]));
      const live = book.campaigns.filter(c => !worlds.get(c.worldId)?.isTemplate && !worlds.get(c.worldId)?.archived);
      if (on("sessions")) {
        const since = Date.now() - 3 * 3600_000;
        data.sessions = live.flatMap(c => {
          const w = c.frontPage?.widgets.find(x => x.type === "next");
          if (!w || w.type !== "next" || !w.when || !(Date.parse(w.when) >= since)) return [];
          return [{ campaign: c.name, key: `e:${c.id}`, when: w.when, where: w.where }];
        }).sort((a, b) => a.when.localeCompare(b.when)).slice(0, 30);
      }
      if (on("quests")) {
        data.quests = live.flatMap(c => questsIn(book, c.worldId, c.id).filter(({ quest }) => quest.state === "active")
          .sort((a, b) => (a.quest.rank ?? 1e9) - (b.quest.rank ?? 1e9) || b.entry.updatedAt.localeCompare(a.entry.updatedAt)).slice(0, 5)
          .map(({ entry, quest }) => ({ id: entry.id, title: entry.title, campaign: c.name, key: `e:${c.id}`, ...questProgress(quest), next: nextStep(quest) }))).slice(0, 30);
      }
      if (on("pinned")) {
        const byId = new Map(book.entries.map(e => [e.id, e]));
        data.pinnedPages = (layout.pinnedPages ?? []).flatMap(id => { const e = byId.get(id); return e ? [recentPage(book, e)] : []; });
      }
    })());
  }
  if (on("attention")) jobs.push(attentionFor(s).then(a => { data.attention = a; }).catch(() => { data.attention = []; }));
  if (on("roll") && (all || layout.options?.roll?.tables !== false)) jobs.push(tablesFor(s).then(t => { Object.assign(data, t); }).catch(() => { data.tables = []; }));
  await Promise.all(jobs);
  return data;
}
