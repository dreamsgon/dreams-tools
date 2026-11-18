/*
 * Solo campaigns: one person plays with no other players, using an oracle, an AI or both. They keep every GM power,
 * and the campaign's player characters and companions are theirs to play. In the forum they can switch to a player
 * view (lib/forum/request.ts) to write their characters' posts the way a player would see the forum.
 */
import { visibleEntries, type Workspace } from "./encyclopedia/world-model.ts";

/** Whether the Encyclopedia campaign is set to solo play. */
export function isSolo(w: Pick<Workspace, "campaigns">, campaignId: string) {
  return w.campaigns.find(c => c.id === campaignId)?.solo === true;
}

/** The characters a solo player plays: the campaign's player characters and companions. Empty when not solo. */
export function soloCharacters(w: Workspace, campaignId: string): Set<string> {
  const c = w.campaigns.find(x => x.id === campaignId);
  if (!c?.solo) return new Set();
  return new Set(visibleEntries(w, c.worldId, c.id).filter(e => e.kind === "character" && ["pc", "companion"].includes(e.character?.role ?? "npc")).map(e => e.id));
}
