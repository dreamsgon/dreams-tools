/*
 * Joins two copies of a workspace that both changed since a common one: your unsaved edits in this
 * tab, and a save from somewhere else (another tab, or an AI connection). Worlds, campaigns and pages
 * are joined one by one: whoever changed a thing wins, and when both changed the same thing, yours wins
 * and it is named in `both` so the app can say so.
 */
import { workspaceSchema, type Workspace } from "./world-model.ts";
import { stable } from "../mcp/activity.ts";

type Item = { id: string };
function join<T extends Item>(base: T[], mine: T[], theirs: T[], both: string[], name: (t: T) => string): T[] {
  const b = new Map(base.map(x => [x.id, stable(x)])), m = new Map(mine.map(x => [x.id, x])), t = new Map(theirs.map(x => [x.id, x]));
  const pick = (id: string): T | null => {
    const was = b.get(id), my = m.get(id) ?? null, their = t.get(id) ?? null;
    const myS = my ? stable(my) : undefined, theirS = their ? stable(their) : undefined;
    if (myS === was) return their; // Only they changed it (or nobody did).
    if (theirS === was || myS === theirS) return my; // Only you changed it, or you both made the same change.
    if (my) both.push(name(my)); else if (their) both.push(name(their));
    return my; // Both changed it: keep yours.
  };
  const out: T[] = [], seen = new Set<string>();
  for (const x of theirs) { seen.add(x.id); const v = pick(x.id); if (v) out.push(v); }
  for (const x of mine) if (!seen.has(x.id)) { seen.add(x.id); const v = pick(x.id); if (v) out.push(v); }
  return out;
}

export function mergeWorkspaces(base: Workspace, mine: Workspace, theirs: Workspace): { merged: Workspace; both: string[] } | null {
  const both: string[] = [];
  const merged = {
    ...theirs,
    worlds: join(base.worlds, mine.worlds, theirs.worlds, both, w => w.name),
    campaigns: join(base.campaigns, mine.campaigns, theirs.campaigns, both, c => c.name),
    entries: join(base.entries, mine.entries, theirs.entries, both, e => e.title),
  };
  const checked = workspaceSchema.safeParse(merged);
  return checked.success ? { merged: checked.data, both } : null;
}
