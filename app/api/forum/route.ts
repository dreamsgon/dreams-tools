import { getBucket } from '@/lib/storage';
import { getAppUser } from '@/lib/app-user';
import { MemberStore } from '@/lib/members-server';
import { EncyclopediaStore } from '@/lib/encyclopedia/store';
import { readMapImage, saveMapImage, saveStagedImage } from '@/lib/encyclopedia/map-images-server';
import { scenePicture } from '@/lib/mcp/scene-picture';
import { sameOrigin } from '@/lib/encyclopedia/workspace-server';
import { ForumStore } from '@/lib/forum/store';
import { ThemeStore } from '@/lib/campaign-theme/store';
import { handleForum, handleForumImage, type Deps } from '@/lib/forum/request';
import { loadWorkspace } from '@/lib/workspace-storage';
import { campaignScenes } from '@/lib/agent-maps';
import { forumAi } from '@/lib/ai/forum-ai';
export const dynamic = 'force-dynamic';
// The AI help can wait on the provider for a while.
export const maxDuration = 120;

/*
 * A campaign's forum (lib/forum): POST reads a page or makes one change; GET ?c=<key>&image=<id> loads a picture the
 * forum shows. `c-<campaign id>` is the signed-in GM's own campaign; `m-<ref>` one they are a member of.
 */
const deps = (): Deps => {
  const bucket = getBucket();
  return {
    sameOrigin,
    user: async () => (await getAppUser())?.userId ?? null,
    campaign: async (userId, key) => {
      const members = new MemberStore(bucket);
      if (key.startsWith('m-')) return members.forumAs(userId, key.slice(2));
      const campaignId = key.slice(2), { list } = await members.read(userId, campaignId);
      return { owner: userId, campaignId, list };
    },
    workspace: async owner => (await new EncyclopediaStore(bucket).read(owner)).data,
    store: new ForumStore(bucket),
    themes: new ThemeStore(bucket),
    image: readMapImage,
    savePicture: saveStagedImage,
    ai: forumAi(bucket),
    // The GM's Maptable scenes in the paired campaign, for starting a fight from its initiative tracker.
    scenes: async (owner, maptableCampaignId) => {
      const saved = await loadWorkspace(bucket, `users/${encodeURIComponent(owner)}/`);
      try { return saved ? campaignScenes(saved.workspace, maptableCampaignId) : []; } catch { return []; }
    },
    // A scene drawn as players see it (no GM-only tokens), stored with the GM's pictures for a post.
    mapPicture: async (owner, maptableCampaignId, sceneId) => {
      const prefix = `users/${encodeURIComponent(owner)}/`, saved = await loadWorkspace(bucket, prefix);
      const scene = saved ? campaignScenes(saved.workspace, maptableCampaignId).find(s => s.id === sceneId) : undefined;
      if (!saved || !scene) throw new Error('That scene isn’t in the paired Maptable campaign any more.');
      // scenePicture's messages point AI apps to read_scene, so say it for the forum instead.
      const picture = await scenePicture(prefix, saved.workspace, scene, 'players').catch((e: unknown) => {
        throw new Error(e instanceof Error && /set up/.test(e.message) ? 'Map pictures aren’t set up on this site.' : 'The map picture couldn’t be drawn. Try again in a moment.');
      });
      return (await saveMapImage(owner, new Uint8Array(Buffer.from(picture.data, 'base64')))).id;
    },
  };
};
export const POST = (request: Request) => handleForum(request, deps());
export const GET = (request: Request) => handleForumImage(request, deps());
