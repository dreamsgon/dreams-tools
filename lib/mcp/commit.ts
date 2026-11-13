/* Makes an AI change: reads the latest workspace, runs the change, checks it stayed in its campaign, saves, and logs it. */
import type { S3Bucket } from "../storage.ts";
import { EncyclopediaStore } from "../encyclopedia/store.ts";
import { campaignExport, type Entry, type Workspace } from "../encyclopedia/world-model.ts";
import { logActivity, pageChanges, stable } from "./activity.ts";
import { ToolError, type Change, type McpContext, type WriteOut } from "./tools.ts";

type Who = { owner: string; campaignId: string; connectionId: string | null; connection: string };

/**
 * A change may only touch this campaign's own pages, and on shared world lore only this campaign's
 * codex "found" mark. Worlds and campaigns themselves never change. Anything else is a bug: refuse it.
 */
export function checkScope(before: Workspace, after: Workspace, campaignId: string) {
  if (stable(before.worlds) !== stable(after.worlds) || stable(before.campaigns) !== stable(after.campaigns)) throw Error("A change tried to edit campaign settings.");
  const campaign = before.campaigns.find(c => c.id === campaignId)!;
  const mine = (e: Entry) => e.worldId === campaign.worldId && e.campaignId === campaignId;
  const sharedCodexOnly = (a: Entry, b: Entry) => {
    if (a.worldId !== campaign.worldId || a.campaignId !== null || b.campaignId !== null) return false;
    const strip = (e: Entry) => ({ ...e, updatedAt: "", codex: e.codex ? { ...e.codex, found: Object.fromEntries(Object.entries(e.codex.found).filter(([id]) => id !== campaignId)) } : undefined });
    return stable(strip(a)) === stable(strip(b));
  };
  for (const c of pageChanges(before, after)) {
    const now = after.entries.find(e => e.id === c.id) ?? null;
    const ok = c.before === null ? !!now && mine(now) : now === null ? mine(c.before) : (mine(c.before) && mine(now)) || sharedCodexOnly(c.before, now);
    if (!ok) throw Error(`A change reached outside this campaign (${c.title}).`);
  }
}

export function makeCommit(bucket: S3Bucket, who: Who, base: Omit<McpContext, "book" | "campaign">, send?: (out: NonNullable<WriteOut["discord"]>) => Promise<void>) {
  const store = new EncyclopediaStore(bucket);
  return async (tool: string, change: Change): Promise<WriteOut> => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data, revision } = await store.read(who.owner);
      if (!data.campaigns.some(c => c.id === who.campaignId)) throw new ToolError("This campaign no longer exists.");
      const book = campaignExport(data, who.campaignId), now = new Date();
      const out = change(data, { ...base, book, campaign: book.campaigns[0] }, now);
      let changes: ReturnType<typeof pageChanges> | undefined;
      if (out.next) {
        checkScope(data, out.next, who.campaignId);
        changes = pageChanges(data, out.next);
        if (changes.length) {
          let saved: number | null;
          try { saved = await store.save(who.owner, out.next, revision); }
          catch (e) { throw new ToolError(e instanceof Error ? e.message : "Could not save the change."); }
          if (saved === null) continue; // Someone saved in between: run the change again on their version.
        }
      }
      let reply = out.reply;
      if (out.discord && send) {
        try { await send(out.discord); }
        catch (e) { reply = { ...(reply as object), postedToDiscord: false, discordProblem: e instanceof Error ? e.message : "Discord didn't take it." }; }
      }
      await logActivity(bucket, who.owner, who.campaignId, {
        id: crypto.randomUUID(), at: now.toISOString(), connection: who.connection, connectionId: who.connectionId, tool,
        summary: out.summary, ...(out.detail ? { detail: out.detail } : {}), ...(changes?.length ? { changes } : {}),
      }).catch(() => {}); // The change is saved either way; a missing log line must not report it as failed.
      return { ...out, reply };
    }
    throw new ToolError("The campaign kept changing while saving. Try again in a moment.");
  };
}
