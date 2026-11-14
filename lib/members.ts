/*
 * Campaign members and groups. A campaign's owner invites people with a link per group; members sit in one
 * or more groups, and each group says Yes, No or Never to each thing a member can do, the way forum user
 * groups do: a member can when any of their groups says Yes and none says Never. The owner can always do
 * everything. Bans keep someone out by account, and optionally by email or internet address (both kept only
 * as keyed hashes). Pure: storage is in members-server.ts.
 */
import { z } from "zod";

export const permissionKeys = [
  "seePlayer", "seeGm", "editPages", "editOwnCharacter", "addSubPages", "editMaps", "invite", "manage",
  "forumRead", "forumStart", "forumReply", "forumPictures", "forumModerate", "forumBoards",
] as const;
export type Permission = (typeof permissionKeys)[number];
/** `soon` marks a permission that is kept now and does nothing yet; `hint` says what else it needs. */
export const permissionInfo: Record<Permission, { name: string; forum?: true; soon?: true; hint?: string }> = {
  seePlayer: { name: "See the front page and player pages" },
  seeGm: { name: "See GM-only pages, secrets and hidden tokens" },
  editPages: { name: "Edit Encyclopedia pages", hint: "Also needs “See GM-only pages” for now." },
  editOwnCharacter: { name: "Edit their own character page", hint: "Starts on for them when you add them to their page's Who can edit." },
  addSubPages: { name: "Add sub-pages under their own character page", hint: "Starts on for them when you add them to their page's Who can edit." },
  editMaps: { name: "Edit maps and run the table in Maptable", soon: true },
  invite: { name: "Invite people (to their own groups or lower)", soon: true },
  manage: { name: "Manage members, groups and permissions", soon: true },
  forumRead: { name: "Read the forum", forum: true },
  forumStart: { name: "Start topics", forum: true },
  forumReply: { name: "Reply", forum: true },
  forumPictures: { name: "Add pictures to posts", forum: true },
  forumModerate: { name: "Moderate: pin, lock, move and delete posts", forum: true },
  forumBoards: { name: "Add and arrange boards", forum: true },
};
export const choices = ["yes", "no", "never"] as const;
export type Choice = (typeof choices)[number];
export const groupColors = ["violet", "blue", "sand", "pink", "teal", "green", "orange", "gray"] as const;
export type GroupColor = (typeof groupColors)[number];

const id = z.string().min(1).max(80).regex(/^[A-Za-z0-9_:.-]+$/);
const name = z.string().trim().min(1).max(40);
const at = z.string().max(40);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const perms = z.object(Object.fromEntries(permissionKeys.map(k => [k, z.enum(choices)])) as Record<Permission, z.ZodEnum<["yes", "no", "never"]>>);
export const groupSchema = z.object({ id, name, color: z.enum(groupColors), about: z.string().max(80).optional(), builtin: z.enum(["cogms", "players", "guests"]).optional(), perms });
// `email` and `ip` are keyed hashes, kept so the GM can ban by them later. Never sent to the browser.
export const memberSchema = z.object({ userId: id, name, groups: z.array(id).max(20), joinedAt: at, email: hash.optional(), ip: hash.optional() });
// `secret` is the link itself, locked with the server's key, so the GM can copy it again later.
export const linkSchema = z.object({ groupId: id, hash, secret: z.string().max(400).optional(), createdAt: at, expiresAt: at.nullable(), approve: z.boolean(), uses: z.number().int().min(0) });
export const requestSchema = z.object({ userId: id, name, groupId: id, at, email: hash.optional(), ip: hash.optional() });
export const banSchema = z.object({ id, userId: id, name, email: hash.optional(), ip: hash.optional(), ipUntil: at.optional(), note: z.string().max(200), at });
/**
 * Who can edit one page, set on the page itself (Who can edit): people by account, groups by id. `subPages` lets
 * someone add pages inside it. `by` is the member who made the page, for a sub-page a player added.
 */
export const pageAccessSchema = z.object({
  people: z.record(id, z.object({ edit: z.boolean(), subPages: z.boolean() })),
  groups: z.record(id, z.boolean()),
  by: id.optional(),
});
export type PageAccess = z.infer<typeof pageAccessSchema>;
export const memberListSchema = z.object({
  campaignId: id, ownerName: z.string().max(80),
  groups: z.array(groupSchema).max(20), members: z.array(memberSchema).max(200), links: z.array(linkSchema).max(20),
  requests: z.array(requestSchema).max(50), bans: z.array(banSchema).max(200),
  notify: z.object({ joins: z.boolean(), discord: z.boolean() }),
  // Optional (added later): Who can edit, by Encyclopedia page id.
  pages: z.record(id, pageAccessSchema).optional(),
});
export type Group = z.infer<typeof groupSchema>;
export type Member = z.infer<typeof memberSchema>;
export type InviteLink = z.infer<typeof linkSchema>;
export type JoinRequest = z.infer<typeof requestSchema>;
export type Ban = z.infer<typeof banSchema>;
export type MemberList = z.infer<typeof memberListSchema>;

export class MembersError extends Error {}
const fail = (message: string): never => { throw new MembersError(message); };

const all = (c: Choice) => Object.fromEntries(permissionKeys.map(k => [k, c])) as Record<Permission, Choice>;
const set = (base: Choice, yes: Permission[], never: Permission[] = []) => ({ ...all(base), ...Object.fromEntries(yes.map(k => [k, "yes"])), ...Object.fromEntries(never.map(k => [k, "never"])) }) as Record<Permission, Choice>;

/** The groups every campaign starts with. The owner isn't a group: they can always do everything. */
export function defaultGroups(): Group[] {
  return [
    { id: "cogms", name: "Co-GMs", color: "violet", about: "Run the game with you", builtin: "cogms", perms: set("no", ["seePlayer", "seeGm", "editPages", "editOwnCharacter", "addSubPages", "editMaps", "invite", "forumRead", "forumStart", "forumReply", "forumPictures", "forumModerate", "forumBoards"]) },
    { id: "players", name: "Players", color: "blue", about: "Play and read player pages", builtin: "players", perms: set("no", ["seePlayer", "editOwnCharacter", "addSubPages", "forumRead", "forumStart", "forumReply", "forumPictures"]) },
    { id: "guests", name: "Guests", color: "sand", about: "Read along, no posting", builtin: "guests", perms: set("no", ["seePlayer", "forumRead"], ["editPages", "editMaps"]) },
  ];
}

export function emptyMemberList(campaignId: string, ownerName = ""): MemberList {
  return { campaignId, ownerName: ownerName.slice(0, 80), groups: defaultGroups(), members: [], links: [], requests: [], bans: [], notify: { joins: true, discord: false } };
}

/** What a member may do: Yes in any of their groups and Never in none. The owner may always. */
export function can(list: MemberList, userId: string, permission: Permission, ownerId?: string) {
  if (ownerId && userId === ownerId) return true;
  const m = list.members.find(x => x.userId === userId);
  if (!m) return false;
  const said = m.groups.map(g => list.groups.find(x => x.id === g)?.perms[permission]).filter(Boolean);
  return said.includes("yes") && !said.includes("never");
}

/** A member's role for the Campaigns page: Co-GMs when they can see GM-only things, else Players or the group's name. */
export function roleOf(list: MemberList, userId: string) {
  const m = list.members.find(x => x.userId === userId);
  if (!m) return null;
  if (can(list, userId, "seeGm")) return "Co-GM";
  const names = m.groups.map(g => list.groups.find(x => x.id === g)?.name).filter((x): x is string => !!x);
  return names.includes("Players") ? "Player" : names[0] ?? "Member";
}

const groupOf = (list: MemberList, groupId: string) => list.groups.find(g => g.id === groupId) ?? fail("That group was deleted.");
const cleanName = (s: unknown, what = "a name") => {
  const v = typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";
  if (!v) fail(`Give it ${what}.`);
  return v.slice(0, 40);
};

// ---- Groups --------------------------------------------------------------------------------------

export function addGroup(list: MemberList, groupName: unknown, color: GroupColor, newId: string): MemberList {
  if (list.groups.length >= 20) fail("A campaign can have up to 20 groups.");
  const n = cleanName(groupName);
  if (list.groups.some(g => g.name.toLocaleLowerCase() === n.toLocaleLowerCase())) fail(`There's already a group called ${n}.`);
  return { ...list, groups: [...list.groups, { id: newId, name: n, color, perms: all("no") }] };
}

export function editGroup(list: MemberList, groupId: string, patch: { name?: unknown; color?: GroupColor; about?: unknown }): MemberList {
  groupOf(list, groupId);
  const n = patch.name === undefined ? undefined : cleanName(patch.name);
  if (n && list.groups.some(g => g.id !== groupId && g.name.toLocaleLowerCase() === n.toLocaleLowerCase())) fail(`There's already a group called ${n}.`);
  return { ...list, groups: list.groups.map(g => g.id !== groupId ? g : { ...g, ...(n ? { name: n } : {}), ...(patch.color ? { color: patch.color } : {}), ...(typeof patch.about === "string" ? { about: patch.about.trim().slice(0, 80) } : {}) }) };
}

/** Deletes a group you made. The three that come with every campaign stay. Its members stay in their other groups. */
export function deleteGroup(list: MemberList, groupId: string): MemberList {
  const g = groupOf(list, groupId);
  if (g.builtin) fail(`${g.name} comes with every campaign and can't be deleted. Rename it instead.`);
  return {
    ...list, groups: list.groups.filter(x => x.id !== groupId),
    members: list.members.map(m => ({ ...m, groups: m.groups.filter(x => x !== groupId) })),
    links: list.links.filter(l => l.groupId !== groupId),
    requests: list.requests.filter(r => r.groupId !== groupId),
  };
}

export function setPermission(list: MemberList, groupId: string, permission: Permission, choice: Choice): MemberList {
  groupOf(list, groupId);
  if (!permissionKeys.includes(permission)) fail("That isn't a permission.");
  if (!choices.includes(choice)) fail("Choose Yes, No or Never.");
  return { ...list, groups: list.groups.map(g => g.id === groupId ? { ...g, perms: { ...g.perms, [permission]: choice } } : g) };
}

// ---- Members -------------------------------------------------------------------------------------

export function setMemberGroups(list: MemberList, userId: string, groups: string[]): MemberList {
  if (!list.members.some(m => m.userId === userId)) fail("That person isn't a member any more.");
  const valid = [...new Set(groups)].filter(g => list.groups.some(x => x.id === g));
  if (!valid.length) fail("Keep them in at least one group, or remove them from the campaign.");
  return { ...list, members: list.members.map(m => m.userId === userId ? { ...m, groups: valid } : m) };
}

export function removeMember(list: MemberList, userId: string): MemberList {
  const pages = list.pages && Object.fromEntries(Object.entries(list.pages).map(([page, a]) => [page, { ...a, people: Object.fromEntries(Object.entries(a.people).filter(([u]) => u !== userId)) }]));
  return { ...list, members: list.members.filter(m => m.userId !== userId), requests: list.requests.filter(r => r.userId !== userId), ...(pages ? { pages } : {}) };
}

// ---- Who can edit, page by page --------------------------------------------------------------------

const MAX_PAGES = 2000;
const never = (list: MemberList, m: Member, permission: Permission) => m.groups.some(g => list.groups.find(x => x.id === g)?.perms[permission] === "never");
/**
 * The pages a member may edit or add sub-pages to, from each page's Who can edit. Never in any of their groups for
 * "Edit Encyclopedia pages" (or "Add sub-pages") still wins, so a Guest stays read only whatever a page says.
 */
export function pageRights(list: MemberList, userId: string) {
  const m = list.members.find(x => x.userId === userId), edit = new Set<string>(), subPages = new Set<string>(), made = new Set<string>();
  if (!m) return { edit, subPages, made };
  const noEdit = never(list, m, "editPages"), noSub = never(list, m, "addSubPages");
  for (const [page, a] of Object.entries(list.pages ?? {})) {
    if (!noEdit && (a.people[userId]?.edit || m.groups.some(g => a.groups[g]))) edit.add(page);
    if (!noSub && a.people[userId]?.subPages) subPages.add(page);
    if (a.by === userId) made.add(page);
  }
  return { edit, subPages, made };
}
export type PageRights = ReturnType<typeof pageRights>;

/** Sets a page's Who can edit. People must be members and groups must exist; an empty setting is removed. */
export function setPageAccess(list: MemberList, page: string, access: Omit<PageAccess, "by">): MemberList {
  for (const u of Object.keys(access.people)) if (!list.members.some(m => m.userId === u)) fail("That person isn't in this campaign.");
  for (const g of Object.keys(access.groups)) if (!list.groups.some(x => x.id === g)) fail("That group is gone.");
  const people = Object.fromEntries(Object.entries(access.people).filter(([, p]) => p.edit || p.subPages));
  const groups = Object.fromEntries(Object.entries(access.groups).filter(([, on]) => on));
  const by = list.pages?.[page]?.by, rest = Object.fromEntries(Object.entries(list.pages ?? {}).filter(([p]) => p !== page));
  const empty = !Object.keys(people).length && !Object.keys(groups).length && !by;
  if (!empty && Object.keys(rest).length >= MAX_PAGES) fail("Too many pages have their own Who can edit.");
  return { ...list, pages: empty ? rest : { ...rest, [page]: { people, groups, ...(by ? { by } : {}) } } };
}

/** A sub-page a member just added: theirs to edit and add to. */
export function addMadePage(list: MemberList, userId: string, page: string): MemberList {
  if (Object.keys(list.pages ?? {}).length >= MAX_PAGES) fail("Too many pages have their own Who can edit.");
  return { ...list, pages: { ...list.pages, [page]: { people: { [userId]: { edit: true, subPages: true } }, groups: {}, by: userId } } };
}

// ---- Bans ----------------------------------------------------------------------------------------

export const IP_BAN_DAYS = 30;
export type Seen = { userId: string; email?: string; ip?: string };

/** Whether someone is banned, by their account, their email's hash or (for 30 days) their internet address's hash. */
export function bannedBy(list: MemberList, who: Seen, now = new Date()) {
  return list.bans.find(b => b.userId === who.userId || (!!b.email && b.email === who.email) || (!!b.ip && b.ip === who.ip && !!b.ipUntil && Date.parse(b.ipUntil) > now.getTime())) ?? null;
}

/** Bans a member or someone asking to join: always their account, and their email and internet address when the GM chose them. */
export function ban(list: MemberList, userId: string, by: { email: boolean; ip: boolean }, note: unknown, banId: string, now = new Date()): MemberList {
  if (list.bans.length >= 200) fail("Up to 200 bans are kept. Unban someone first.");
  const found = list.members.find(m => m.userId === userId) ?? list.requests.find(r => r.userId === userId) ?? fail("That person isn't a member or asking to join.");
  const target = { userId, name: found.name, ...(by.email && found.email ? { email: found.email } : {}), ...(by.ip && found.ip ? { ip: found.ip } : {}) };
  const out = removeMember(list, target.userId);
  const entry: Ban = {
    id: banId, userId: target.userId, name: target.name.slice(0, 40), note: typeof note === "string" ? note.trim().slice(0, 200) : "", at: now.toISOString(),
    ...(target.email ? { email: target.email } : {}),
    ...(target.ip ? { ip: target.ip, ipUntil: new Date(now.getTime() + IP_BAN_DAYS * 864e5).toISOString() } : {}),
  };
  return { ...out, bans: [...out.bans.filter(b => b.userId !== target.userId), entry] };
}

export const unban = (list: MemberList, banId: string): MemberList => ({ ...list, bans: list.bans.filter(b => b.id !== banId) });

// ---- Joining -------------------------------------------------------------------------------------

/** Whether an invite link still works: it exists for its group and hasn't expired. */
export function liveLink(list: MemberList, linkHash: string, now = new Date()) {
  const l = list.links.find(x => x.hash === linkHash);
  if (!l || !list.groups.some(g => g.id === l.groupId)) return null;
  if (l.expiresAt && Date.parse(l.expiresAt) <= now.getTime()) return null;
  return l;
}

const seen = (who: Seen) => ({ ...(who.email ? { email: who.email } : {}), ...(who.ip ? { ip: who.ip } : {}) });

export type JoinOutcome = "joined" | "asked" | "already" | "waiting";

/**
 * Someone opened a link and pressed Join campaign. They join its group straight away, or wait under Asking to
 * join when the link waits for the GM's OK. Members already in keep their groups and get the link's group too.
 */
export function join(list: MemberList, linkHash: string, who: Seen & { name: unknown }, now = new Date()): { list: MemberList; outcome: JoinOutcome; groupId: string } {
  const link = liveLink(list, linkHash, now) ?? fail("This invite link has been turned off or has expired. Ask the GM for a new one.");
  if (bannedBy(list, who, now)) fail("You can't join this campaign.");
  const n = cleanName(who.name, "the name you go by");
  const uses = list.links.map(l => l === link ? { ...l, uses: l.uses + 1 } : l);
  const member = list.members.find(m => m.userId === who.userId);
  if (member) {
    if (member.groups.includes(link.groupId)) return { list, outcome: "already", groupId: link.groupId };
    if (!link.approve) return { list: { ...list, links: uses, members: list.members.map(m => m === member ? { ...m, groups: [...m.groups, link.groupId], ...seen(who) } : m) }, outcome: "joined", groupId: link.groupId };
  }
  if (link.approve) {
    if (list.requests.some(r => r.userId === who.userId)) return { list, outcome: "waiting", groupId: link.groupId };
    if (list.requests.length >= 50) fail("This campaign has too many people waiting to join. Try again later.");
    return { list: { ...list, links: uses, requests: [...list.requests, { userId: who.userId, name: n, groupId: link.groupId, at: now.toISOString(), ...seen(who) }] }, outcome: "asked", groupId: link.groupId };
  }
  if (list.members.length >= 200) fail("This campaign is full.");
  return { list: { ...list, links: uses, members: [...list.members, { userId: who.userId, name: n, groups: [link.groupId], joinedAt: now.toISOString(), ...seen(who) }] }, outcome: "joined", groupId: link.groupId };
}

/** Let in someone who asked to join: they join the group their link was for. */
export function letIn(list: MemberList, userId: string, now = new Date()): MemberList {
  const r = list.requests.find(x => x.userId === userId) ?? fail("They aren't asking to join any more.");
  groupOf(list, r.groupId);
  const requests = list.requests.filter(x => x !== r), member = list.members.find(m => m.userId === userId);
  if (member) return { ...list, requests, members: list.members.map(m => m === member ? { ...m, groups: [...new Set([...m.groups, r.groupId])] } : m) };
  if (list.members.length >= 200) fail("This campaign is full.");
  return { ...list, requests, members: [...list.members, { userId, name: r.name, groups: [r.groupId], joinedAt: now.toISOString(), ...seen(r) }] };
}

export const decline = (list: MemberList, userId: string): MemberList => ({ ...list, requests: list.requests.filter(r => r.userId !== userId) });

/** What the GM's page shows: never link hashes or banned emails and addresses. */
export function publicMembers(list: MemberList, now = new Date()) {
  return {
    ...list,
    members: list.members.map(({ email: _e, ip: _i, ...m }) => m),
    requests: list.requests.map(({ email: _e, ip: _i, ...r }) => r),
    links: list.links.map(({ hash: _hash, secret: _secret, ...l }) => ({ ...l, expired: !!l.expiresAt && Date.parse(l.expiresAt) <= now.getTime() })),
    bans: list.bans.map(({ email, ip, ipUntil, ...b }) => ({ ...b, byEmail: !!email, byIp: !!ip && !!ipUntil && Date.parse(ipUntil) > now.getTime() })),
  };
}
export type PublicMembers = ReturnType<typeof publicMembers>;
