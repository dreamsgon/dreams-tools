import type { Token, Workspace } from "./model";
import { tokenCampaignId, tokenZeroHpPolicy } from "./token-defaults.ts";
/** Apply only on a new zero-HP token, an HP transition, or a changed policy.
 * Healing clears unconsciousness; dead tokens and unrelated manual changes remain untouched.
 */
export function applyZeroHpState(previous: Token | undefined, token: Token, policy = token.zeroHpStatus ?? "off", previousPolicy = previous?.zeroHpStatus ?? "off") {
 if (previous && token.hp > previous.hp && token.hp > 0 && previous.status === "unconscious" && token.status === "unconscious") token.status = "active";
 if (token.hp === 0 && policy !== "off" && (!previous || previous.hp !== token.hp || previousPolicy !== policy)) token.status = policy;
}
export function applyWorkspaceHpStates(previous: Workspace, next: Workspace) {
 for (const scene of next.scenes) {
  const old = new Map(previous.scenes.find(s => s.id === scene.id)?.tokens.map(t => [t.id,t]) ?? []);
  const campaignId = tokenCampaignId(next, scene.id), previousCampaignId = tokenCampaignId(previous, scene.id);
  const newlyDead = new Set<string>();
  for (const token of scene.tokens) {
   const before = old.get(token.id);
   applyZeroHpState(before, token, tokenZeroHpPolicy(next, campaignId, token), before ? tokenZeroHpPolicy(previous, previousCampaignId, before) : "off");
   if (token.rosterRole === "npc" && token.status === "dead" && before?.status !== "dead") newlyDead.add(token.id);
  }
  if (newlyDead.size) scene.tokens = [...scene.tokens.filter(t => newlyDead.has(t.id)), ...scene.tokens.filter(t => !newlyDead.has(t.id))];
 }
 const library = new Map(previous.tokenLibrary.map(t=>[t.id,t]));
 for (const token of next.tokenLibrary) {
  const before = library.get(token.id);
  applyZeroHpState(before, token, tokenZeroHpPolicy(next, next.libraryCampaigns[token.id], token), before ? tokenZeroHpPolicy(previous, previous.libraryCampaigns[before.id], before) : "off");
 }
}
