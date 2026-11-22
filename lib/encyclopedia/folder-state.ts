/*
 * Which folders in the Wiki sidebar's page tree are open. Folders start closed, so a campaign with hundreds of
 * pages shows its top level only; the folders above the page you are reading open by themselves, and folders you
 * open or close stay that way in this browser (localStorage), across reloads and visits.
 */

export const openFoldersKey = "ttrpg-wiki-open-folders";
/** The most folder ids kept. The newest opened win; older ones simply start closed again. */
export const maxOpenFolders = 1500;

type Parented = { id: string; parentId: string | null };

/** The ids of every folder or page above this one, nearest first. Stops at a loop or a missing parent. */
export function ancestorIds(entries: readonly Parented[], id: string | null): string[] {
  if (!id) return [];
  const byId = new Map(entries.map(e => [e.id, e]));
  const out: string[] = [];
  for (let at = byId.get(id)?.parentId ?? null; at && !out.includes(at); at = byId.get(at)?.parentId ?? null) {
    if (!byId.has(at)) break;
    out.push(at);
  }
  return out;
}

/** Saved ids, oldest first. Anything that isn't a list of short strings is ignored. */
export function parseOpenFolders(text: string | null): string[] {
  try {
    const value = JSON.parse(text ?? "null");
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 120))].slice(-maxOpenFolders);
  } catch { return []; }
}

/** Open these folders: they move to the end (newest), and the list is capped. */
export function withOpened(list: readonly string[], ids: readonly string[]): string[] {
  if (!ids.length) return list as string[];
  const add = new Set(ids);
  return [...list.filter(x => !add.has(x)), ...add].slice(-maxOpenFolders);
}

export function withClosed(list: readonly string[], ids: readonly string[]): string[] {
  if (!ids.length) return list as string[];
  const drop = new Set(ids);
  return list.filter(x => !drop.has(x));
}
