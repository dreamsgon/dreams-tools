import { applyWorkspaceHpStates } from "./token-hp-state";
import { z } from "zod";
import { newToken, tokenSchema, workspaceSchema, snap, type Workspace } from "./model";
import { campaignScenes } from "./agent-maps";

const role = z.enum(["npc", "party"]);
const fields = tokenSchema.omit({ id: true, attachedToId: true, rosterRole: true }).partial().strict();
const id = z.string().min(1).max(120);
export const agentRosterSchema = z.object({
  revision: z.string().min(1),
  operation: z.discriminatedUnion("action", [
    z.object({ action: z.literal("create"), role, token: fields }).strict(),
    z.object({ action: z.literal("update"), characterId: id, role: role.optional(), changes: fields }).strict(),
    z.object({ action: z.literal("delete"), characterId: id }).strict(),
    z.object({ action: z.literal("place"), characterId: id, sceneId: id, x: z.number().finite(), y: z.number().finite() }).strict(),
  ]),
}).strict();

export function campaignRoster(workspace: Workspace, campaignId: string) {
  campaignScenes(workspace, campaignId);
  return workspace.tokenLibrary.filter(t => workspace.libraryCampaigns[t.id] === campaignId && (t.rosterRole === "npc" || t.rosterRole === "party"));
}

export function applyAgentRosterOperation(workspace: Workspace, campaignId: string, input: unknown) {
  const { operation } = agentRosterSchema.parse(input);
  const scenes = campaignScenes(workspace, campaignId), roster = campaignRoster(workspace, campaignId);
  const tokens = [...roster, ...scenes.flatMap(s => s.tokens)];
  const conditionIds = new Set(tokens.flatMap(t => t.conditions));
  const assetIds = new Set([...scenes.map(s => s.mapId), ...tokens.flatMap(t => [t.assetId, t.borderAssetId]), ...workspace.assets.filter(a => workspace.assetCampaigns[a.id] === campaignId).map(a => a.id)]);
  const next = structuredClone(workspace);
  let characterId: string, tokenId: string | undefined, sceneId: string | undefined;
  if (operation.action === "create") {
    const token = tokenSchema.parse({ ...newToken(), ...operation.token, rosterRole: operation.role, attachedToId: null });
    characterId = token.id;
    next.tokenLibrary.push(token);
    next.libraryCampaigns[token.id] = campaignId;
  } else {
    const original = roster.find(t => t.id === operation.characterId);
    if (!original) throw new Error("Character is outside this campaign roster.");
    characterId = original.id;
    const index = next.tokenLibrary.findIndex(t => t.id === characterId);
    if (operation.action === "update") {
      next.tokenLibrary[index] = tokenSchema.parse({ ...original, ...operation.changes, rosterRole: operation.role ?? original.rosterRole, attachedToId: null });
    } else if (operation.action === "delete") {
      next.tokenLibrary.splice(index, 1);
      delete next.libraryLocations[characterId];
      delete next.libraryCampaigns[characterId];
    } else {
      if (!scenes.some(s => s.id === operation.sceneId)) throw new Error("Scene is outside this campaign.");
      const scene = next.scenes.find(s => s.id === operation.sceneId)!;
      const placed = tokenSchema.parse({ ...original, id: newToken().id, attachedToId: null, ...snap({ x: operation.x, y: operation.y }, scene.grid, original.size) });
      scene.tokens.push(placed);
      tokenId = placed.id;
      sceneId = scene.id;
    }
  }
  const changed = tokenId ? next.scenes.find(s => s.id === sceneId)!.tokens.find(t => t.id === tokenId) : next.tokenLibrary.find(t => t.id === characterId);
  if (changed) {
    if ([changed.assetId, changed.borderAssetId].some(value => value && !assetIds.has(value))) throw new Error("Use assets already assigned to or used in this campaign.");
    if (changed.conditions.some(value => !conditionIds.has(value))) throw new Error("Use conditions already used in this campaign.");
  }
  applyWorkspaceHpStates(workspace,next);
  const result = workspaceSchema.parse(next);
  return { workspace: result, characterId, ...(tokenId ? { tokenId, sceneId } : {}) };
}
