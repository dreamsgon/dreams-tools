import { z } from 'zod';
import { getAppUser } from '@/lib/app-user';
import { getBucket } from '@/lib/storage';
import { MemberStore } from '@/lib/members-server';
import { EncyclopediaStore } from '@/lib/encyclopedia/store';
import { newId, type Workspace } from '@/lib/encyclopedia/world-model';
import { PlayerEditError, addPlayerSubPage, savePlayerEdit, sharePlayerPage, type Rights } from '@/lib/encyclopedia/player-edit';
import { json, sameOrigin } from '@/lib/encyclopedia/workspace-server';
export const dynamic = 'force-dynamic';

// A signed-in member editing from the player pages, as each page's Who can edit allows. See lib/encyclopedia/player-edit.ts.
const ref = z.string().regex(/^[a-f0-9]{64}$/), id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), ref, entryId: id, title: z.string().max(160).optional(), tabs: z.array(z.object({ id, body: z.string().max(100000) })).max(31) }),
  z.object({ action: z.literal('add'), ref, parentId: id, title: z.string().max(160), shared: z.boolean() }),
  z.object({ action: z.literal('share'), ref, entryId: id, shared: z.boolean() }),
]);

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: 'A same-origin request is required.' }, 403);
  try {
    const text = await request.text();
    if (text.length > 400000) return json({ error: 'That is too long to save at once.' }, 413);
    const body = action.parse(JSON.parse(text)), user = await getAppUser();
    if (!user) return json({ error: 'Sign in to edit.' }, 401);
    const members = new MemberStore(getBucket()), found = await members.rightsAs(user.userId, body.ref);
    if (!found) return json({ error: 'You can no longer open this campaign. You may have left it, or the GM changed what your group can see.' }, 404);
    const who = { name: found.name, as: 'player' as const }, page = body.action === 'add' ? newId() : '';
    let rights: Rights = found.rights;
    if (body.action === 'add') {
      if (!rights.subPages.has(body.parentId)) return json({ error: 'You can’t add pages here. Ask your GM.' }, 403);
      // Theirs first, so a page that saves is never one they can't edit.
      await members.addMadePage(found.owner, found.campaignId, user.userId, page);
      rights = { edit: new Set([...rights.edit, page]), subPages: new Set([...rights.subPages, page]), made: new Set([...rights.made, page]) };
    }
    const apply = (s: Workspace) => body.action === 'save' ? savePlayerEdit(s, found.campaignId, rights, body, who)
      : body.action === 'add' ? addPlayerSubPage(s, found.campaignId, rights, body, page, who)
      : sharePlayerPage(s, found.campaignId, rights, body.entryId, body.shared, who);
    // Changed only what this player touched, so a save that crossed someone else's just tries again on the newer copy.
    const store = new EncyclopediaStore(getBucket());
    for (let attempt = 0; attempt < 4; attempt++) {
      const read = await store.read(found.owner);
      const saved = await store.saveTagged(found.owner, apply(read.data), read.revision, who);
      if (saved) return json({ ok: true, ...(page ? { id: page } : {}) });
    }
    return json({ error: 'The campaign is busy. Try again in a moment.' }, 409);
  } catch (e) {
    if (e instanceof PlayerEditError) return json({ error: e.message }, 403);
    if (e instanceof z.ZodError || e instanceof SyntaxError) return json({ error: 'That request isn’t valid.' }, 400);
    return json({ error: 'Could not save. Keep this tab open and try again.' }, 500);
  }
}
