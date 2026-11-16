import { MemberStore } from "./members-server.ts";
import { readBoth, summaryOf, type Session } from "./campaigns-server.ts";
import { recentPage, type CampaignSummary, type RecentPage } from "./campaign-links.ts";
import { questsIn, questProgress, nextStep } from "./encyclopedia/quests.ts";
import type { TableLibrary } from "./encyclopedia/tables.ts";
import { starredTables, type HomeTable } from "./home-tables.ts";
import { hasWidget, needsWorkspaces, type HomeLayout } from "./home-layout.ts";

export { homeKey, HOME_LIMIT, readHome, changeHome, homeAction } from "./home-store.ts";

export type HomeSession = { campaign: string; key: string; when: string; where: string };
export type HomeQuest = { id: string; title: string; campaign: string; key: string; done: number; total: number; next: string | null };
export type HomeAttention = { id: string; text: string; href: string; action: string; at: string; unread: boolean };
export type { HomeTable } from "./home-tables.ts";
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
  if (on("roll") && (all || layout.options?.roll?.tables !== false)) jobs.push(starredTables(s).then(t => { Object.assign(data, t); }).catch(() => { data.tables = []; }));
  await Promise.all(jobs);
  return data;
}
