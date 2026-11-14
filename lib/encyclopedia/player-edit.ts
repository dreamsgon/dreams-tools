import { MAPTABLE_LINK, SECRET_OPEN, visibleEntries, workspaceSchema, type Entry, type Workspace } from './world-model.ts';

/**
 * A player editing pages from the player pages, as each page's Who can edit allows (lib/members.ts pageRights).
 * They edit what players can read: the overview and the tabs shared with players. A tab with GM secrets or a
 * Maptable link stays locked, so a player's save can never drop or reveal something the GM hid in it.
 */
export class PlayerEditError extends Error {}
const no = (message: string): never => { throw new PlayerEditError(message); };
export type Rights = { edit: ReadonlySet<string>; subPages: ReadonlySet<string>; made: ReadonlySet<string> };
export type Editor = { name: string; as: 'player' | 'co-gm' };

const hasSecret = (text: string) => text.split('\n').some(line => SECRET_OPEN.test(line.replace(/\r$/, '')));
/** Whether a player may rewrite this text: nothing in it is hidden from them. */
export const playerCanRewrite = (text: string) => !hasSecret(text) && !new RegExp(MAPTABLE_LINK.source).test(text);

function scope(s: Workspace, campaignId: string) {
  const c = s.campaigns.find(x => x.id === campaignId) ?? no('This campaign is gone.');
  return visibleEntries(s, c.worldId, c.id);
}

/** What the player pages need to offer editing: per page they can edit or add to, its editable text and sub-pages. */
export function myPages(s: Workspace, campaignId: string, rights: Rights) {
  const pages = scope(s, campaignId), out: Record<string, {
    edit: boolean; subPages: boolean; made: boolean; shared: boolean;
    tabs: { id: string; title: string; body?: string; locked?: true }[];
    children: { id: string; title: string; shared: boolean; made: boolean }[];
  }> = {};
  const text = (id: string, title: string, body: string) => playerCanRewrite(body) ? { id, title, body } : { id, title, locked: true as const };
  for (const e of pages) {
    const edit = rights.edit.has(e.id), subPages = rights.subPages.has(e.id);
    if (!edit && !subPages) continue;
    out[e.id] = {
      edit, subPages, made: rights.made.has(e.id), shared: e.overviewVisibility === 'players',
      tabs: edit ? [text('overview', 'Overview', e.body), ...(e.tabs ?? []).filter(t => t.visibility === 'players').map(t => text(t.id, t.title, t.body))] : [],
      children: pages.filter(x => x.parentId === e.id && (x.overviewVisibility === 'players' || rights.edit.has(x.id))).map(x => ({ id: x.id, title: x.title, shared: x.overviewVisibility === 'players', made: rights.made.has(x.id) })),
    };
  }
  return out;
}
export type MyPages = ReturnType<typeof myPages>;

function page(s: Workspace, campaignId: string, id: string) {
  return scope(s, campaignId).find(e => e.id === id) ?? no('That page is gone.');
}
function put(s: Workspace, next: Entry) {
  const parsed = workspaceSchema.safeParse({ ...s, entries: s.entries.some(e => e.id === next.id) ? s.entries.map(e => e.id === next.id ? next : e) : [...s.entries, next] });
  return parsed.success ? parsed.data : no(parsed.error.issues[0]?.message ?? 'That change would break the page.');
}

/** Saves a player's text on a page they may edit: its title and any of the tabs they can rewrite. */
export function savePlayerEdit(s: Workspace, campaignId: string, rights: Rights, edit: { entryId: string; title?: string; tabs: { id: string; body: string }[] }, who: Editor, now = new Date()) {
  if (!rights.edit.has(edit.entryId)) no('You can’t edit this page. Ask your GM.');
  const e = page(s, campaignId, edit.entryId);
  let next: Entry = { ...e, ...(edit.title?.trim() ? { title: edit.title.trim() } : {}), updatedAt: now.toISOString(), editedBy: who };
  for (const t of edit.tabs) {
    if (t.id === 'overview') {
      if (!playerCanRewrite(e.body)) no('The GM keeps secrets on this page’s overview, so it stays as it is.');
      next = { ...next, body: t.body };
      continue;
    }
    const tab = (e.tabs ?? []).find(x => x.id === t.id && x.visibility === 'players') ?? no('That tab is gone, or the GM keeps it to themselves now.');
    if (!playerCanRewrite(tab.body)) no(`The GM keeps secrets in “${tab.title}”, so it stays as it is.`);
    next = { ...next, tabs: (next.tabs ?? []).map(x => x.id === t.id ? { ...x, body: t.body } : x) };
  }
  return put(s, next);
}

/** A new page inside one the player may add to. Shared with players, or kept for them and the GMs. */
export function addPlayerSubPage(s: Workspace, campaignId: string, rights: Rights, add: { parentId: string; title: string; shared: boolean }, id: string, who: Editor, now = new Date()) {
  if (!rights.subPages.has(add.parentId)) no('You can’t add pages here. Ask your GM.');
  const parent = page(s, campaignId, add.parentId);
  const title = add.title.trim() || no('Give the page a name.');
  return put(s, { id, worldId: parent.worldId, campaignId: parent.campaignId, parentId: parent.id, title, kind: 'note', body: '', overviewVisibility: add.shared ? 'players' : 'gm', updatedAt: now.toISOString(), editedBy: who });
}

/** Shares a page the player made with the other players, or keeps it for them and the GMs. */
export function sharePlayerPage(s: Workspace, campaignId: string, rights: Rights, entryId: string, shared: boolean, who: Editor, now = new Date()) {
  if (!rights.made.has(entryId) || !rights.edit.has(entryId)) no('Only the person who made a page can choose who sees it.');
  const e = page(s, campaignId, entryId);
  return put(s, { ...e, overviewVisibility: shared ? 'players' : 'gm', updatedAt: now.toISOString(), editedBy: who });
}
