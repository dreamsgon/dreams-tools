/*
 * The GM's answer to a suggestion from an AI connection set to "Ask me": Approve runs it as that
 * connection (with the arguments as suggested, or as the GM changed them), Skip drops it. Either way
 * it leaves the waiting list, and the AI can read what happened with check_suggestions.
 */
import type { S3Bucket } from "../storage.ts";
import { readActivity, updateActivity } from "./activity.ts";
import { listConnections, permsOf } from "./connections.ts";
import { loadContext } from "./load.ts";
import { callTool } from "./tools.ts";

const MAX_ARGS = 8000;

/** Runs or drops one waiting suggestion. Returns what happened, in a line for the GM. */
export async function decideSuggestion(bucket: S3Bucket, owner: string, campaignId: string, id: unknown, how: "approve" | "skip", changed?: unknown): Promise<string> {
  const entry = (await readActivity(bucket, owner, campaignId)).entries.find(e => e.id === id && e.waiting);
  if (!entry) throw Error("That suggestion is gone. Reload the panel.");
  if (entry.decided) throw Error(entry.decided === "approved" ? "That was already approved." : "That was already skipped.");
  // Claim it first, so two clicks (or two tabs) can't run it twice.
  await updateActivity(bucket, owner, campaignId, log => {
    const e = log.entries.find(x => x.id === entry.id);
    if (!e || e.decided) throw Error("That suggestion was already answered.");
    return { ...log, entries: log.entries.map(x => x === e ? { ...x, decided: how === "approve" ? "approved" as const : "skipped" as const } : x) };
  });
  const finish = (result: string, keep = false) => updateActivity(bucket, owner, campaignId, log => ({
    ...log, entries: log.entries.map(x => x.id !== entry.id ? x : keep ? { ...x, decided: undefined } : { ...x, result }),
  }));
  if (how === "skip") { await finish("The GM skipped this."); return `Skipped: ${entry.summary}`; }
  try {
    let args = entry.waiting!.args;
    if (changed !== undefined) {
      if (!changed || typeof changed !== "object" || Array.isArray(changed) || JSON.stringify(changed).length > MAX_ARGS) throw Error("Those changes can't be used.");
      args = changed as Record<string, unknown>;
    }
    const connection = (await listConnections(bucket, owner, campaignId)).find(c => c.id === entry.connectionId);
    if (!connection) throw Error(`${entry.connection} was revoked, so its suggestions can't run. Skip this one.`);
    const c = await loadContext(bucket, { owner, campaignId, connectionId: connection.id, level: connection.level, perms: permsOf(connection) });
    const r = await callTool(c, entry.tool, args, { approved: true });
    const text = (r.content[0] as { text?: string }).text ?? "";
    if (r.isError) throw Error(text);
    await finish(`${changed !== undefined ? "The GM changed it, then approved it. " : "Approved. "}${text.slice(0, 1000)}`);
    return `Done: ${entry.summary}`;
  } catch (e) {
    // Back on the waiting list: nothing happened, so the GM can change it or skip it.
    await finish("", true).catch(() => {});
    throw e instanceof Error ? e : Error("Could not do that.");
  }
}
