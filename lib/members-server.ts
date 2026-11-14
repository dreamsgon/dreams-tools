/*
 * Where campaign members are kept, and the one deliberate exception to "each account's data is private to it":
 * the server lets someone join another account's campaign through an invite link, after checking the link,
 * bans and the member list on every request. Server only.
 *
 * - The member list: one file per campaign in the owner's storage (users/<owner>/encyclopedia/members/<id>.json),
 *   saved with the same revision checks as everything else.
 * - Invite links: users/…/members keeps the link's hash; encyclopedia-invite-keys/<hash>.json points back at the
 *   owner and campaign, the way player links do. The link itself is kept locked so the GM can copy it again.
 * - Each member's list of campaigns they're in (users/<member>/memberships.json) and each owner's
 *   notifications (users/<owner>/notifications.json), written only here.
 * - A member's browser names one of those campaigns by its `ref`, a hash of the owner and campaign, so the owner's
 *   account id stays on the server. Opening it checks the member list again every time.
 */
import { createHmac, hkdfSync, randomBytes } from "node:crypto";
import type { S3Bucket } from "./storage.ts";
import { EncyclopediaStore, encyclopediaPrefix, hashToken } from "./encyclopedia/store.ts";
import { lock, unlock } from "./ai/secret.ts";
import {
  MembersError, emptyMemberList, pageRights, addMadePage, memberListSchema, join, liveLink, permissionInfo, permissionKeys, publicMembers, roleOf, bannedBy, can, removeMember,
  type JoinOutcome, type MemberList,
} from "./members.ts";

const listKey = (owner: string, campaignId: string) => encyclopediaPrefix(owner) + `members/${encodeURIComponent(campaignId)}.json`;
const inviteKey = (hash: string) => `encyclopedia-invite-keys/${hash}.json`;
const membershipsKey = (user: string) => `users/${encodeURIComponent(user)}/memberships.json`;
const notificationsKey = (user: string) => `users/${encodeURIComponent(user)}/notifications.json`;
/** The handle a member's browser uses for a campaign they're in. */
export const memberRef = (owner: string, campaignId: string) => hashToken(`${owner}\n${campaignId}`);
const put = (bucket: S3Bucket, key: string, value: unknown, etag?: string | null) =>
  bucket.put(key, JSON.stringify(value), { onlyIf: etag === undefined ? undefined : etag ? { etagMatches: etag } : { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json" } });

/** Emails and internet addresses are only ever kept as keyed hashes, so a ban can match them without storing them. */
export function seenHash(kind: "email" | "ip", value: string, env: NodeJS.ProcessEnv = process.env) {
  const material = env.AI_KEY_SECRET || env.MAPTABLE_AWS_SECRET_ACCESS_KEY;
  if (!material) throw Error("The server has no secret to hash with. Set AI_KEY_SECRET (see .env.example).");
  const key = Buffer.from(hkdfSync("sha256", material, "rpg-tools", "members", 32));
  return createHmac("sha256", key).update(`${kind}:${value.trim().toLowerCase()}`).digest("hex");
}

/** The address a request came from, as Vercel passes it on. */
export function requestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "";
  return /^[0-9a-fA-F.:]{3,45}$/.test(forwarded) ? forwarded : "";
}

export type Who = { userId: string; displayName: string; email: string; ip: string };
const seen = (who: Who) => ({ userId: who.userId, ...(who.email ? { email: seenHash("email", who.email) } : {}), ...(who.ip ? { ip: seenHash("ip", who.ip) } : {}) });

export class MemberStore {
  private bucket: S3Bucket;
  constructor(bucket: S3Bucket) { this.bucket = bucket; }

  async read(owner: string, campaignId: string): Promise<{ list: MemberList; etag: string | null }> {
    const object = await this.bucket.get(listKey(owner, campaignId));
    if (!object) return { list: emptyMemberList(campaignId), etag: null };
    const parsed = memberListSchema.safeParse(await object.json().catch(() => null));
    if (!parsed.success) throw Error("This campaign's member list can't be read.");
    return { list: parsed.data, etag: object.etag };
  }

  /** Changes the member list, reading it again and retrying when someone else saved in between. */
  async change<T = undefined>(owner: string, campaignId: string, edit: (list: MemberList) => MemberList | { list: MemberList; out: T }): Promise<{ list: MemberList; out?: T }> {
    for (let tries = 0; tries < 4; tries++) {
      const { list, etag } = await this.read(owner, campaignId);
      const result = edit(list), next = "out" in result && "list" in result ? result.list : result as MemberList;
      const out = "out" in result && "list" in result ? result.out : undefined;
      const checked = memberListSchema.parse(next);
      if (await put(this.bucket, listKey(owner, campaignId), checked, etag)) return { list: checked, out };
    }
    throw Error("Someone else changed the members at the same time. Try again.");
  }

  /** The owner's campaign, for its name and to check it still exists. */
  async campaign(owner: string, campaignId: string) {
    const { data } = await new EncyclopediaStore(this.bucket).read(owner);
    const c = data.campaigns.find(x => x.id === campaignId);
    if (!c) throw new MembersError("This campaign no longer exists.");
    return { name: c.name, world: data.worlds.find(w => w.id === c.worldId)?.name ?? "" };
  }

  // ---- Invite links --------------------------------------------------------------------------------

  /** A new link for a group, replacing the old one. Returns the link's token. */
  async newLink(owner: string, campaignId: string, groupId: string, opts: { approve: boolean; expiresAt: string | null }, now = new Date()) {
    const token = randomBytes(32).toString("hex"), hash = await hashToken(token);
    let old: string | undefined;
    await this.change(owner, campaignId, list => {
      if (!list.groups.some(g => g.id === groupId)) throw new MembersError("That group was deleted.");
      old = list.links.find(l => l.groupId === groupId)?.hash;
      return { ...list, links: [...list.links.filter(l => l.groupId !== groupId), { groupId, hash, secret: lock(token), createdAt: now.toISOString(), expiresAt: opts.expiresAt, approve: opts.approve, uses: 0 }] };
    });
    await put(this.bucket, inviteKey(hash), { owner, campaignId, hash });
    if (old) await this.bucket.delete(inviteKey(old)).catch(() => {});
    return token;
  }

  async linkOff(owner: string, campaignId: string, groupId: string) {
    let old: string | undefined;
    await this.change(owner, campaignId, list => { old = list.links.find(l => l.groupId === groupId)?.hash; return { ...list, links: list.links.filter(l => l.groupId !== groupId) }; });
    if (old) await this.bucket.delete(inviteKey(old)).catch(() => {});
  }

  /** The GM's view: the list without hashes, with each link's address to copy. */
  async forOwner(owner: string, campaignId: string, origin: string, now = new Date()) {
    const { list } = await this.read(owner, campaignId);
    const shown = publicMembers(list, now);
    return { ...shown, links: shown.links.map(l => {
      const secret = list.links.find(x => x.groupId === l.groupId)?.secret;
      let url: string | null = null;
      try { if (secret) url = `${origin}/join/${unlock(secret)}`; } catch { /* The server's secret changed: make a new link. */ }
      return { ...l, url };
    }) };
  }

  /** Who and where a link leads, or null when it's off, expired or made up. */
  async invite(token: string, now = new Date()) {
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const hash = await hashToken(token), object = await this.bucket.get(inviteKey(hash));
    if (!object) return null;
    const { owner, campaignId } = await object.json<{ owner: string; campaignId: string }>();
    const { list } = await this.read(owner, campaignId);
    const link = liveLink(list, hash, now);
    if (!link) return null;
    const group = list.groups.find(g => g.id === link.groupId)!;
    const campaign = await this.campaign(owner, campaignId).catch(() => null);
    if (!campaign) return null;
    return { owner, campaignId, hash, list, link, group, campaign };
  }

  /** The join page: the campaign, the group and what it can do, and where this person stands. */
  async describe(token: string, who: Who | null, now = new Date()) {
    const found = await this.invite(token, now);
    if (!found) return null;
    const { list, group, campaign, owner, link } = found;
    const s = who ? seen(who) : null;
    const status = !who ? "signedOut" : who.userId === owner ? "owner" : s && bannedBy(list, s, now) ? "banned"
      : list.members.some(m => m.userId === who.userId && m.groups.includes(group.id)) ? "member"
      : list.requests.some(r => r.userId === who.userId) ? "waiting" : "invited";
    const can = permissionKeys.filter(k => group.perms[k] === "yes" && !permissionInfo[k].forum && k !== "addSubPages").map(k => permissionInfo[k].name);
    if (group.perms.forumRead === "yes") can.push(group.perms.forumStart === "yes" || group.perms.forumReply === "yes" ? "Read and post in the forum, when it arrives" : "Read the forum, when it arrives");
    return { campaign: campaign.name, world: campaign.world, ownerName: list.ownerName || "the GM", group: { name: group.name, color: group.color }, can, approve: link.approve, status, name: who?.displayName ?? "" };
  }

  /** Someone pressed Join campaign. */
  async join(token: string, who: Who, name: unknown, now = new Date()): Promise<{ outcome: JoinOutcome; campaign: string }> {
    const found = await this.invite(token, now);
    if (!found) throw new MembersError("This invite link has been turned off or has expired. Ask the GM for a new one.");
    if (who.userId === found.owner) throw new MembersError("This is your own campaign.");
    const { out } = await this.change<{ outcome: JoinOutcome; groupId: string }>(found.owner, found.campaignId, list => {
      const r = join(list, found.hash, { ...seen(who), name }, now);
      return { list: r.list, out: { outcome: r.outcome, groupId: r.groupId } };
    });
    const outcome = out!.outcome, group = found.list.groups.find(g => g.id === out!.groupId)?.name ?? "";
    const joinedName = typeof name === "string" ? name.trim().slice(0, 40) : who.displayName;
    if (outcome === "joined" || outcome === "asked") {
      await this.syncMembership(found.owner, found.campaignId, who.userId);
      const ask = outcome === "asked";
      const { list } = await this.read(found.owner, found.campaignId);
      if (ask || list.notify.joins) await this.notify(found.owner, { kind: ask ? "ask" : "join", campaignId: found.campaignId, campaign: found.campaign.name, userId: who.userId, name: joinedName, group }, now);
      if (list.notify.discord) await this.discord(found.owner, found.campaignId, ask ? `**${joinedName}** asked to join as ${group}. Let them in on the campaign's Members tab.` : `**${joinedName}** joined as ${group}.`).catch(() => {});
    }
    return { outcome, campaign: found.campaign.name };
  }

  private async discord(owner: string, campaignId: string, text: string) {
    const { sendEncyclopediaPost } = await import("./encyclopedia/discord-send.ts");
    await sendEncyclopediaPost(this.bucket, owner, campaignId, { kind: "members", text });
  }

  // ---- Campaigns you're in ---------------------------------------------------------------------------

  /**
   * Writes (or removes) this campaign in one person's list of campaigns they're in, from the member list as it
   * is now. Call it for everyone a change touched.
   */
  async syncMembership(owner: string, campaignId: string, userId: string) {
    const { list } = await this.read(owner, campaignId);
    const member = list.members.find(m => m.userId === userId), asking = list.requests.find(r => r.userId === userId);
    const campaign = member || asking ? await this.campaign(owner, campaignId).catch(() => null) : null;
    for (let tries = 0; tries < 4; tries++) {
      const object = await this.bucket.get(membershipsKey(userId));
      const items = object ? (await object.json<{ items?: Membership[] }>().catch(() => ({ items: [] }))).items ?? [] : [];
      const rest = items.filter(i => !(i.owner === owner && i.campaignId === campaignId));
      const next = campaign ? [...rest, {
        owner, campaignId, campaign: campaign.name, world: campaign.world, ownerName: list.ownerName,
        role: member ? roleOf(list, userId) ?? "Member" : "Asking to join", groups: member ? member.groups.map(g => list.groups.find(x => x.id === g)?.name ?? "").filter(Boolean) : [],
        asking: !member, at: member?.joinedAt ?? asking!.at,
      }] : rest;
      if (await put(this.bucket, membershipsKey(userId), { items: next.slice(-200) }, object?.etag ?? null)) return;
    }
  }

  private async membershipItems(userId: string) {
    const object = await this.bucket.get(membershipsKey(userId));
    return object ? (await object.json<{ items?: Membership[] }>().catch(() => ({ items: [] }))).items ?? [] : [];
  }

  /**
   * The campaigns someone else runs that this person is in, checked against each member list. `open` says
   * whether their groups may see the front page and player pages.
   */
  async memberships(userId: string) {
    const out: Joined[] = [];
    for (const { owner, ...i } of await this.membershipItems(userId)) {
      const { list } = await this.read(owner, i.campaignId).catch(() => ({ list: null as MemberList | null }));
      if (!list || !(list.members.some(m => m.userId === userId) || list.requests.some(r => r.userId === userId))) continue;
      out.push({ ...i, ref: await memberRef(owner, i.campaignId), open: can(list, userId, "seePlayer"), gm: can(list, userId, "seeGm"), maps: can(list, userId, "seeGm") && can(list, userId, "editMaps") });
    }
    return out;
  }

  /** Which campaign a member's `ref` names, from their own list of campaigns they're in. */
  private async byRef(userId: string, ref: string) {
    if (!/^[a-f0-9]{64}$/.test(ref)) return null;
    for (const i of await this.membershipItems(userId)) if (await memberRef(i.owner, i.campaignId) === ref) return i;
    return null;
  }

  /**
   * The owner and campaign a signed-in member may open, or null: the player pages (seePlayer) or, for co-GMs,
   * the whole campaign in the Encyclopedia (seeGm). `ownerName` and `role` are for the bar saying whose it is, and
   * `edit` is whether their groups let them edit Encyclopedia pages.
   */
  async openAs(userId: string, ref: string, permission: "seePlayer" | "seeGm" = "seePlayer") {
    const found = await this.byRef(userId, ref);
    if (!found) return null;
    const { list } = await this.read(found.owner, found.campaignId).catch(() => ({ list: null as MemberList | null }));
    return list && can(list, userId, permission) ? { owner: found.owner, campaignId: found.campaignId, ownerName: list.ownerName || "the GM", role: roleOf(list, userId) ?? "Member", name: list.members.find(m => m.userId === userId)?.name ?? "A co-GM", edit: can(list, userId, "editPages"), maps: can(list, userId, "editMaps") } : null;
  }

  /**
   * A member on the player pages: the campaign, their name, and the pages they may edit or add sub-pages to
   * (each page's Who can edit). Null when they can't open the player pages.
   */
  async rightsAs(userId: string, ref: string) {
    const found = await this.byRef(userId, ref);
    if (!found) return null;
    const { list } = await this.read(found.owner, found.campaignId).catch(() => ({ list: null as MemberList | null }));
    const m = list?.members.find(x => x.userId === userId);
    if (!list || !m || !can(list, userId, "seePlayer")) return null;
    return { owner: found.owner, campaignId: found.campaignId, userId, name: m.name, rights: pageRights(list, userId) };
  }

  /** Records a sub-page a member added, so it is theirs to edit. */
  addMadePage(owner: string, campaignId: string, userId: string, page: string) {
    return this.change(owner, campaignId, l => addMadePage(l, userId, page));
  }

  /** Leave campaign, or stop asking to join. The GM hears about a member leaving the way they hear about joins. */
  async leave(userId: string, ref: string, now = new Date()) {
    const found = await this.byRef(userId, ref);
    if (!found) throw new MembersError("You're not in that campaign.");
    let left: { name: string; group: string } | null = null;
    const { list } = await this.change(found.owner, found.campaignId, l => {
      const m = l.members.find(x => x.userId === userId);
      if (m) left = { name: m.name, group: m.groups.map(g => l.groups.find(x => x.id === g)?.name ?? "").filter(Boolean).join(", ") };
      return removeMember(l, userId);
    });
    await this.syncMembership(found.owner, found.campaignId, userId);
    const gone = left as { name: string; group: string } | null;
    if (!gone) return;
    if (list.notify.joins) await this.notify(found.owner, { kind: "left", campaignId: found.campaignId, campaign: found.campaign, userId, name: gone.name, group: gone.group }, now);
    if (list.notify.discord) await this.discord(found.owner, found.campaignId, `**${gone.name}** left the campaign.`).catch(() => {});
  }

  // ---- Notifications ---------------------------------------------------------------------------------

  async notify(owner: string, item: Omit<Notice, "id" | "at" | "read">, now = new Date()) {
    for (let tries = 0; tries < 4; tries++) {
      const object = await this.bucket.get(notificationsKey(owner));
      const items = object ? (await object.json<{ items?: Notice[] }>().catch(() => ({ items: [] }))).items ?? [] : [];
      const next = [{ ...item, id: randomBytes(8).toString("hex"), at: now.toISOString(), read: false }, ...items].slice(0, 50);
      if (await put(this.bucket, notificationsKey(owner), { items: next }, object?.etag ?? null)) return;
    }
  }

  /** The bell: newest first. An ask that was already answered shows as handled. */
  async notifications(owner: string) {
    const object = await this.bucket.get(notificationsKey(owner));
    const items = object ? (await object.json<{ items?: Notice[] }>().catch(() => ({ items: [] }))).items ?? [] : [];
    const lists = new Map<string, MemberList | null>();
    const out = [];
    for (const n of items) {
      if (!lists.has(n.campaignId)) lists.set(n.campaignId, (await this.read(owner, n.campaignId).catch(() => null))?.list ?? null);
      const list = lists.get(n.campaignId);
      out.push({ ...n, waiting: n.kind === "ask" && !!list?.requests.some(r => r.userId === n.userId) });
    }
    return { items: out, unread: out.filter(n => !n.read).length };
  }

  async markRead(owner: string) {
    const object = await this.bucket.get(notificationsKey(owner));
    if (!object) return;
    const items = (await object.json<{ items?: Notice[] }>().catch(() => ({ items: [] }))).items ?? [];
    await put(this.bucket, notificationsKey(owner), { items: items.map(n => ({ ...n, read: true })) }, object.etag);
  }
}

export type Membership = { owner: string; campaignId: string; campaign: string; world: string; ownerName: string; role: string; groups: string[]; asking: boolean; at: string };
export type Joined = Omit<Membership, "owner"> & { ref: string; open: boolean; gm: boolean; maps?: boolean };
export type Notice = { id: string; kind: "ask" | "join" | "left"; campaignId: string; campaign: string; userId: string; name: string; group: string; at: string; read: boolean };
