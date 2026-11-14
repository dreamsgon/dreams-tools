import { getAppUser } from "./app-user";
import { getBucket } from "./storage";
import { MemberStore } from "./members-server";
import { EncyclopediaStore } from "./encyclopedia/store";
import { memberRefPattern } from "./encyclopedia/member-workspace-server";
import { privateHeaders } from "./server";
import { workspaceBody, storedJson } from "./transfers";
import { loadWorkspace, updateWorkspace, applyWorkspacePatch, type WorkspacePatch } from "./workspace-storage";
import { maptableExport, applyMaptableCoGm, lockedPictures, MapCoGmError } from "./maptable-co-gm";

/**
 * A co-GM in the GM's Maptable: /maptable#m-<ref> reads and saves /api/workspace?member=<ref>. Every request is
 * checked against the campaign's member list: their groups must say Yes to "See GM-only pages" and "Edit maps and
 * run the table", and the GM's Encyclopedia campaign must be paired with a Maptable campaign.
 */
export const mapsGone = "You can no longer open this campaign's maps. You may have left it, or the GM changed what your group can do.";
export const mapsMissing = "The GM hasn't connected maps to this campaign yet.";
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(body, { status, headers: { ...privateHeaders, ...headers } });

export type MapsGrant = { owner: string; prefix: string; campaignId: string; name: string; ownerName: string; ref: string };
/** The co-GM's way into the GM's maps, or why they can't have it. */
export async function mapsGrant(userId: string, ref: string): Promise<MapsGrant | { error: string; status: number }> {
  if (!memberRefPattern.test(ref)) return { error: mapsGone, status: 404 };
  const grant = await new MemberStore(getBucket()).openAs(userId, ref, "seeGm");
  if (!grant || !grant.maps) return { error: mapsGone, status: 404 };
  const book = await new EncyclopediaStore(getBucket()).read(grant.owner);
  const campaignId = book.data.campaigns.find(c => c.id === grant.campaignId)?.maptableCampaignId;
  if (!campaignId) return { error: mapsMissing, status: 404 };
  return { owner: grant.owner, prefix: `users/${encodeURIComponent(grant.owner)}/`, campaignId, name: grant.name, ownerName: grant.ownerName, ref };
}
/** The signed-in person's grant from a request's `member`, or the Response to send instead. */
export async function mapsRequest(request: Request, ref: string): Promise<MapsGrant | Response> {
  const user = await getAppUser();
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return json({ error: "Forbidden" }, 403);
  }
  const grant = await mapsGrant(user.userId, ref);
  return "error" in grant ? json({ error: grant.error }, grant.status) : grant;
}
const userPrefix = async () => { const user = await getAppUser(); return `users/${encodeURIComponent(user!.userId)}/`; };

export async function memberMapsGet(request: Request, ref: string) {
  const grant = await mapsRequest(request, ref);
  if (grant instanceof Response) return grant;
  const bucket = getBucket(), known = request.headers.get("If-None-Match");
  if (known) { const head = await bucket.head(grant.prefix + "workspace.json"); if (head && (known === head.etag || known === `"${head.etag}"`)) return new Response(null, { status: 304, headers: { ...privateHeaders, ETag: `"${head.etag}"` } }); }
  const stored = await loadWorkspace(bucket, grant.prefix);
  const copy = stored ? maptableExport(stored.workspace, grant.campaignId, ref) : null;
  if (!stored || !copy) return json({ error: "The GM hasn't made any maps in this campaign yet." }, 404);
  const member = { ownerName: grant.ownerName, campaignId: grant.campaignId, locked: lockedPictures(stored.workspace, grant.campaignId) };
  // Large copies go through a transfer, the same as the GM's own (lib/transfers.ts), staged in the co-GM's storage.
  return storedJson(bucket, await userPrefix(), { workspace: copy, revision: stored.revision, member }, { headers: { ...privateHeaders, ETag: `"${stored.revision}"` } });
}

/** PUT sends the co-GM's whole copy; PATCH sends what changed in it since their last save. */
export async function memberMapsSave(request: Request, ref: string, kind: "put" | "patch") {
  const grant = await mapsRequest(request, ref);
  if (grant instanceof Response) return grant;
  try {
    const bucket = getBucket(), data = await workspaceBody(request, bucket, await userPrefix());
    const saved = await updateWorkspace(bucket, grant.prefix, data.revision ?? null, full => {
      const copy = kind === "put" ? data.workspace : applyWorkspacePatch(maptableExport(full, grant.campaignId, ref) ?? (() => { throw new MapCoGmError("This campaign's maps are gone."); })(), data.patch as WorkspacePatch);
      return applyMaptableCoGm(full, grant.campaignId, ref, copy);
    });
    return saved ? json(saved) : json({ error: "The GM or another co-GM saved changes. Reload to get the latest maps." }, 409);
  } catch (e) {
    return json({ error: e instanceof MapCoGmError ? e.message : e instanceof Error ? e.message : "Could not save." }, e instanceof MapCoGmError ? 403 : 400);
  }
}
