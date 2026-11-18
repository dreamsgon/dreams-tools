/*
 * Setting up a campaign's forum: the choices the GM confirms before the forum is made (its name, the boards it
 * starts with, and who may read and post), the forum those choices make, and the member groups' forum
 * permissions they set. Pure: the Campaigns action `forum` (campaigns-server.ts) stores both.
 */
import { z } from "zod";
import { emptyForum, forumSchema, type Board, type Forum } from "./model.ts";
import { setPermission, type Choice, type MemberList, type Permission } from "../members.ts";

/** What a group may do in the forum: read and post, only read, or not see it at all. */
export const FORUM_ACCESS = ["post", "read", "none"] as const;
export type ForumAccess = (typeof FORUM_ACCESS)[number];

export const forumSetupSchema = z.object({
  /** The forum's name in its banner; empty uses the campaign's name. */
  title: z.string().trim().max(80),
  tagline: z.string().trim().max(160),
  /** The campaign's banner picture behind the title. */
  banner: z.boolean(),
  markup: z.enum(["markdown", "bbcode"]),
  /** The boards it starts with, all out of character. The Locations category for in-character boards is always made. */
  announcements: z.boolean(),
  chat: z.boolean(),
  introductions: z.boolean(),
  players: z.enum(FORUM_ACCESS),
  /** Players may add pictures to their posts (only when they may post). */
  pictures: z.boolean(),
  guests: z.enum(FORUM_ACCESS),
  /** Co-GMs moderate (edit, move and remove posts, see reports) and arrange the boards. */
  cogms: z.boolean(),
});
export type ForumSetup = z.infer<typeof forumSetupSchema>;

/** The choices the setup starts with: what the forum and the campaign's groups had before forums were opt-in. */
export function defaultForumSetup(): ForumSetup {
  return { title: "", tagline: "", banner: true, markup: "markdown", announcements: false, chat: true, introductions: false, players: "post", pictures: true, guests: "read", cogms: true };
}

const OOC = (id: string, name: string, description: string, locked?: true): Board => ({ id, categoryId: "ooc", parentId: null, name, description, ...(locked ? { locked } : {}) });

/** The new forum the choices make. */
export function forumFromSetup(setup: ForumSetup): Forum {
  const base = emptyForum(), chat = base.boards.find(b => b.id === "ooc-chat")!;
  const boards = [
    setup.announcements && OOC("announcements", "Announcements", "News, rules and schedules from the GM. Only moderators start topics here.", true),
    setup.chat && chat,
    setup.introductions && OOC("introductions", "Introductions", "Say hello and introduce your character."),
  ].filter((b): b is Board => !!b);
  return forumSchema.parse({
    ...base,
    settings: { ...base.settings, title: setup.title.trim(), tagline: setup.tagline.trim(), banner: setup.banner, ...(setup.markup === "bbcode" ? { markup: "bbcode" } : {}) },
    boards,
  });
}

const ACCESS: Record<ForumAccess, Partial<Record<Permission, Choice>>> = {
  post: { forumRead: "yes", forumStart: "yes", forumReply: "yes" },
  read: { forumRead: "yes", forumStart: "no", forumReply: "no" },
  none: { forumRead: "no", forumStart: "no", forumReply: "no" },
};

/** The member list with the Players, Guests and Co-GMs groups' forum permissions as chosen. Other groups and permissions stay as they are. */
export function applyForumAccess(list: MemberList, setup: ForumSetup): MemberList {
  const want = (builtin: string, perms: Partial<Record<Permission, Choice>>) => (l: MemberList) => {
    const group = l.groups.find(g => g.builtin === builtin);
    return group ? Object.entries(perms).reduce((next, [k, v]) => setPermission(next, group.id, k as Permission, v), l) : l;
  };
  return [
    want("players", { ...ACCESS[setup.players], forumPictures: setup.players === "post" && setup.pictures ? "yes" : "no" }),
    want("guests", { ...ACCESS[setup.guests], forumPictures: "no" }),
    want("cogms", { forumModerate: setup.cogms ? "yes" : "no", forumBoards: setup.cogms ? "yes" : "no" }),
  ].reduce((l, f) => f(l), list);
}

const ACCESS_WORDS: Record<ForumAccess, string> = { post: "read and post", read: "only read", none: "can't see the forum" };

/** The confirm step's summary, one line per choice, in plain words. */
export function describeForumSetup(setup: ForumSetup, campaignName: string): string[] {
  const boards = [setup.announcements && "Announcements", setup.chat && "General chat", setup.introductions && "Introductions"].filter(Boolean) as string[];
  const can = (who: string, a: ForumAccess) => a === "none" ? `${who} can't see the forum.` : `${who} ${ACCESS_WORDS[a]}.`;
  return [
    `Named “${setup.title.trim() || campaignName}”${setup.tagline.trim() ? `, with “${setup.tagline.trim()}” under it` : ""}${setup.banner ? ", over the campaign's banner picture" : ""}.`,
    boards.length ? `Starts with ${boards.join(", ").replace(/, ([^,]*)$/, " and $1")}, plus an empty Locations category for in-character boards.` : "Starts with an empty Locations category for in-character boards and no out-of-character boards.",
    `The toolbar writes ${setup.markup === "bbcode" ? "BBCode" : "Markdown"}.`,
    can("Players", setup.players) + (setup.players === "post" ? setup.pictures ? " They may add pictures." : " They can't add pictures." : ""),
    can("Guests", setup.guests),
    setup.cogms ? "Co-GMs moderate and arrange the boards." : "Only you moderate and arrange the boards.",
  ];
}
