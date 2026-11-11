type Collection = { id: string; kind: "folder" | "campaign"; parentId: string | null };
export type CampaignWorkspace = {
  collections?: Collection[];
  scenes: { id: string; containerId?: string | null }[];
};

export function campaignSettingsKey(prefix: string, campaignId: string) {
  return `${prefix}campaign-settings/${encodeURIComponent(campaignId)}.json`;
}

export function requireCampaign(workspace: CampaignWorkspace, campaignId: unknown): string {
  if (typeof campaignId !== "string" || !campaignId || campaignId.length > 120 ||
      workspace.collections?.filter(c => c.id === campaignId).length !== 1 ||
      !workspace.collections.some(c => c.id === campaignId && c.kind === "campaign"))
    throw new Error("Save and select a campaign before configuring Discord.");
  return campaignId;
}

/** Resolve the nearest campaign, checking the entire ancestry before permitting a send. */
export function sceneCampaign(workspace: CampaignWorkspace, sceneId: unknown): string {
  if (typeof sceneId !== "string" || !sceneId || sceneId.length > 120)
    throw new Error("A saved scene is required to send to Discord.");
  const scenes = workspace.scenes.filter(s => s.id === sceneId);
  if (scenes.length !== 1) throw new Error("Save this scene before sending to Discord.");
  let parent = scenes[0].containerId ?? null;
  const seen = new Set<string>();
  let campaign: string | null = null;
  while (parent !== null) {
    if (seen.has(parent)) throw new Error("Invalid scene folder hierarchy.");
    seen.add(parent);
    const matches = (workspace.collections ?? []).filter(c => c.id === parent);
    if (matches.length !== 1) throw new Error("Invalid scene folder hierarchy.");
    const collection = matches[0];
    if (collection.kind === "campaign" && campaign === null) campaign = collection.id;
    parent = collection.parentId;
  }
  if (!campaign) throw new Error("Move this scene into a campaign before sending to Discord.");
  return campaign;
}

export function validWebhook(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname === "discord.com" &&
      !u.port && !u.username && !u.password && !u.search && !u.hash &&
      /^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(u.pathname);
  } catch { return false; }
}
