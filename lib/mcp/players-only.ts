/*
 * What an AI sees when the GM turned off "See GM-only things": the campaign as players see it. Pages and
 * tabs that aren't shared are left out, :::secret blocks are cut, quests keep only shared objectives and
 * log lines, the codex only what was found, and scenes lose hidden tokens, fogged tokens and GM notes.
 * Only what the AI reads is narrowed: changes still go to the whole campaign, so nothing is lost.
 */
import { playerText, type Workspace as Book } from "../encyclopedia/world-model.ts";
import { playerRecapTabs } from "../encyclopedia/recap-schema.ts";
import type { Scene, Workspace as Maps } from "../model.ts";
import { fogged, permsFor, type McpContext } from "./tools.ts";

export function playersBook(book: Book, campaignId: string): Book {
  const entries = book.entries.flatMap(e => {
    if (e.kind === "folder") return [e];
    if (e.recap?.status === "draft") return []; // A draft recap never reaches players.
    const overview = e.overviewVisibility === "players";
    const tabs = [...(e.tabs ?? []).filter(t => t.visibility === "players").map(t => ({ ...t, body: playerText(t.body) })),
      ...(overview ? playerRecapTabs(e.recap, playerText).map(t => ({ ...t, visibility: "players" as const })) : [])];
    const found = e.codex?.found[campaignId];
    const map = e.mapData?.visibility === "players";
    if (!overview && !tabs.length && !found && !map) return [];
    const quest = e.quest && overview ? { ...e.quest, objectives: e.quest.objectives.filter(o => !o.hidden), log: e.quest.log.filter(l => l.players) } : undefined;
    const character = e.character ? { ...e.character, statblock: undefined, statsByCampaign: e.character.statsVisibility === "players" ? e.character.statsByCampaign : {} } : undefined;
    return [{ ...e, body: overview ? playerText(e.body) : "", tabs, quest, character, codex: found ? { ...e.codex!, summary: playerText(e.codex!.summary) } : undefined, mapData: map ? e.mapData : undefined, recap: undefined,
      // Organization profiles hold GM-only items, so they are not read here at all (players get their own copy from playerCampaign).
      org: undefined }];
  });
  const campaigns = book.campaigns.map(c => ({ ...c, calendars: c.calendars?.filter(x => x.visibility === "players") }));
  return { ...book, campaigns, entries };
}

/** Scenes as players see them. `fogged` says whether a point is under fog (from tools.ts). */
export function playersScenes(scenes: Scene[], fogged: (s: Scene, p: { x: number; y: number }) => boolean): Scene[] {
  return scenes.map(s => ({
    ...s,
    tokens: s.tokens.filter(t => !t.hidden && (t.pieceOf || !fogged(s, t))).map(t => ({ ...t, notes: undefined })),
    pointsOfInterest: s.pointsOfInterest.filter(p => !p.hidden).map(p => ({ ...p, notes: undefined, ...(p.playersSee ? {} : { readAloud: undefined, pages: undefined }) })), areas: s.areas?.filter(a => a.playersSee),
    effects: s.effects.filter(e => !e.hidden),
  }));
}

/** The context as this connection may see it: unchanged, or players-only when GM-only things are off. */
export function narrow<T extends Pick<McpContext, "book" | "campaign" | "maps" | "perms" | "level">>(c: T): T {
  if (permsFor(c).seeSecrets !== "off") return c;
  const book = playersBook(c.book, c.campaign.id);
  return { ...c, book, campaign: book.campaigns.find(x => x.id === c.campaign.id) ?? c.campaign, maps: c.maps ? { ...c.maps, scenes: playersScenes(c.maps.scenes, fogged) } : null };
}
export type ScopedMaps = { workspace: Maps; campaignId: string; scenes: Scene[] };
