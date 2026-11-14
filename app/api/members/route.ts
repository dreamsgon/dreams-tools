import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getAppUser } from "@/lib/app-user";
import { getBucket } from "@/lib/storage";
import { MemberStore, requestIp, type Who } from "@/lib/members-server";
import {
  MembersError, addGroup, ban, choices, decline, deleteGroup, editGroup, groupColors, letIn, permissionKeys, removeMember, setMemberGroups, setPageAccess, setPermission, unban,
  type MemberList,
} from "@/lib/members";
export const dynamic = "force-dynamic";

// Campaign members: the owner's Members tab, the join page, and Campaigns you're in. See lib/members-server.ts.
const id = z.string().min(1).max(80).regex(/^[A-Za-z0-9_:.-]+$/);
const token = z.string().regex(/^[a-f0-9]{64}$/);
const expiry = z.enum(["never", "1d", "7d", "30d"]);
const owned = { campaignId: id };
const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("invite"), token }),
  z.object({ action: z.literal("join"), token, name: z.string().max(80) }),
  z.object({ action: z.literal("leave"), ref: token }),
  z.object({ action: z.literal("newLink"), ...owned, groupId: id, approve: z.boolean(), expires: expiry.optional() }),
  z.object({ action: z.literal("linkSettings"), ...owned, groupId: id, approve: z.boolean().optional(), expires: expiry.optional() }),
  z.object({ action: z.literal("linkOff"), ...owned, groupId: id }),
  z.object({ action: z.literal("addGroup"), ...owned, name: z.string().max(80), color: z.enum(groupColors) }),
  z.object({ action: z.literal("editGroup"), ...owned, groupId: id, name: z.string().max(80).optional(), color: z.enum(groupColors).optional(), about: z.string().max(80).optional() }),
  z.object({ action: z.literal("deleteGroup"), ...owned, groupId: id }),
  z.object({ action: z.literal("permission"), ...owned, groupId: id, permission: z.enum(permissionKeys), choice: z.enum(choices) }),
  z.object({ action: z.literal("memberGroups"), ...owned, userId: id, groups: z.array(id).max(20) }),
  z.object({ action: z.literal("remove"), ...owned, userId: id }),
  z.object({ action: z.literal("letIn"), ...owned, userId: id }),
  z.object({ action: z.literal("decline"), ...owned, userId: id }),
  z.object({ action: z.literal("ban"), ...owned, userId: id, email: z.boolean(), ip: z.boolean(), note: z.string().max(200) }),
  z.object({ action: z.literal("unban"), ...owned, banId: id }),
  z.object({ action: z.literal("notify"), ...owned, joins: z.boolean(), discord: z.boolean() }),
  // Who can edit one Encyclopedia page, set from the page.
  z.object({ action: z.literal("pageAccess"), ...owned, pageId: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/), people: z.record(id, z.object({ edit: z.boolean(), subPages: z.boolean() })), groups: z.record(id, z.boolean()) }),
]);
type Owned = Exclude<z.infer<typeof action>, { action: "invite" | "join" | "leave" }>;

const headers = { "Cache-Control": "private, no-store" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
const failed = (e: unknown) => {
  if (e instanceof z.ZodError) return json({ error: "That request isn't valid." }, 400);
  if (e instanceof MembersError) return json({ error: e.message }, 400);
  console.error(e);
  return json({ error: e instanceof Error ? e.message : "Something went wrong." }, 500);
};
const expiresAt = (e: z.infer<typeof expiry>, now = new Date()) => e === "never" ? null : new Date(now.getTime() + { "1d": 1, "7d": 7, "30d": 30 }[e] * 864e5).toISOString();
const newId = () => randomBytes(6).toString("hex");

export async function GET(request: Request) {
  try {
    const user = await getAppUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const params = new URL(request.url).searchParams, store = new MemberStore(getBucket());
    if (params.get("mine")) return json({ campaigns: await store.memberships(user.userId) });
    const campaignId = id.parse(params.get("campaignId"));
    await store.campaign(user.userId, campaignId);
    return json(await store.forOwner(user.userId, campaignId, new URL(request.url).origin));
  } catch (e) { return failed(e); }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return json({ error: "Same-origin request required" }, 403);
    const text = await request.text();
    if (text.length > 5000) return json({ error: "Request is too large." }, 413);
    const body = action.parse(JSON.parse(text)), user = await getAppUser();
    const who: Who | null = user ? { userId: user.userId, displayName: user.displayName, email: user.email, ip: requestIp(request) } : null;
    // Anyone with the link sees where it leads; joining needs an account.
    if (body.action === "invite") {
      const store = new MemberStore(getBucket());
      const found = await store.describe(body.token, who);
      return found ? json(found) : json({ error: "This invite link has been turned off or has expired. Ask the GM for a new one." }, 404);
    }
    if (!who) return json({ error: "Sign in required" }, 401);
    const store = new MemberStore(getBucket());
    if (body.action === "join") return json(await store.join(body.token, who, body.name));
    // Leave campaign, from Campaigns you're in.
    if (body.action === "leave") { await store.leave(who.userId, body.ref); return json({ campaigns: await store.memberships(who.userId) }); }
    // Everything else is the owner's, on their own campaign.
    await store.campaign(who.userId, body.campaignId);
    await manage(store, who, body);
    return json(await store.forOwner(who.userId, body.campaignId, new URL(request.url).origin));
  } catch (e) { return failed(e); }
}

async function manage(store: MemberStore, who: Who, body: Owned) {
  const owner = who.userId, c = body.campaignId;
  const edit = (fn: (l: MemberList) => MemberList) => store.change(owner, c, l => ({ ...fn(l), ownerName: who.displayName.slice(0, 80) }));
  switch (body.action) {
    case "newLink": {
      // A new link for the same group keeps the old one's expiry unless a new one is chosen.
      const { list } = await edit(l => l);
      const before = list.links.find(x => x.groupId === body.groupId)?.expiresAt ?? null;
      await store.newLink(owner, c, body.groupId, { approve: body.approve, expiresAt: body.expires ? expiresAt(body.expires) : before });
      return;
    }
    case "linkSettings": await edit(l => {
      if (!l.links.some(x => x.groupId === body.groupId)) throw new MembersError("Make a link for this group first.");
      return { ...l, links: l.links.map(x => x.groupId !== body.groupId ? x : { ...x, ...(body.approve !== undefined ? { approve: body.approve } : {}), ...(body.expires ? { expiresAt: expiresAt(body.expires) } : {}) }) };
    }); return;
    case "linkOff": await store.linkOff(owner, c, body.groupId); return;
    case "addGroup": await edit(l => addGroup(l, body.name, body.color, `g-${newId()}`)); return;
    case "editGroup": await edit(l => editGroup(l, body.groupId, { name: body.name, color: body.color, about: body.about })); await resync(store, owner, c); return;
    case "deleteGroup": await edit(l => deleteGroup(l, body.groupId)); await resync(store, owner, c); return;
    case "permission": await edit(l => setPermission(l, body.groupId, body.permission, body.choice)); await resync(store, owner, c); return;
    case "memberGroups": await edit(l => setMemberGroups(l, body.userId, body.groups)); break;
    case "remove": await edit(l => removeMember(l, body.userId)); break;
    case "letIn": await edit(l => letIn(l, body.userId)); break;
    case "decline": await edit(l => decline(l, body.userId)); break;
    case "ban": await edit(l => ban(l, body.userId, { email: body.email, ip: body.ip }, body.note, `b-${newId()}`)); break;
    case "unban": await edit(l => unban(l, body.banId)); return;
    case "notify": await edit(l => ({ ...l, notify: { joins: body.joins, discord: body.discord } })); return;
    case "pageAccess": await edit(l => setPageAccess(l, body.pageId, { people: body.people, groups: body.groups })); return;
  }
  await store.syncMembership(owner, c, body.userId);
}

/** Group names and roles show on members' Campaigns pages, so a change to a group updates everyone in it. */
async function resync(store: MemberStore, owner: string, campaignId: string) {
  const { list } = await store.read(owner, campaignId);
  for (const m of list.members.slice(0, 200)) await store.syncMembership(owner, campaignId, m.userId).catch(() => {});
}
