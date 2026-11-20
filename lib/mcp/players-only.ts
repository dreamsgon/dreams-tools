/*
 * What an AI sees when the GM turned off "See GM-only things": the campaign as players see it. Pages and
 * tabs that aren't shared are left out, :::secret blocks are cut, quests keep only shared objectives and
 * log lines, the codex only what was found, and scenes lose hidden tokens, fogged tokens and GM notes.
 * Only what the AI reads is narrowed: changes still go to the whole campaign, so nothing is lost.
 */
import { playerText, type Workspace as Book } from "../encyclopedia/world-model.ts";
import type { Tie } from "../encyclopedia/ties.ts";
import { playerRecapTabs } from "../encyclopedia/recap-schema.ts";
import { withoutLinkDetails } from "../encyclopedia/sheet-link.ts";
import { playerSafeVehicle } from "../encyclopedia/vehicles.ts";
import type { Scene, Workspace as Maps } from "../model.ts";
import { fogged, permsFor, type McpContext } from "./tools.ts";

export function playersBook(book: Book, campaignId: string): Book {
  const extract = book.campaigns.find(c => c.id === campaignId)?.aiWriting?.extract;
  const entries = book.entries.flatMap(e => {
    if (e.kind === "folder") return [e];
    if (e.recap?.status === "draft") return []; // A draft recap never reaches players.
    const overview = e.overviewVisibility === "players";
    const tabs = [...(e.tabs ?? []).filter(t => t.visibility === "players").map(t => ({ ...t, body: playerText(t.body) })),
      ...(overview ? playerRecapTabs(e.recap, playerText, extract).map(t => ({ ...t, visibility: "players" as const })) : [])];
    const found = e.codex?.found[campaignId];
    const map = e.mapData?.visibility === "players";
    const vehicle = e.vehicle ? playerSafeVehicle(e.vehicle, playerText) ?? undefined : undefined;
    if (!overview && !tabs.length && !found && !map && !vehicle) return [];
    const quest = e.quest && overview ? { ...e.quest, prep: undefined, linkIds: undefined, ...(e.quest.rewardHidden ? { reward: undefined, rewardIds: undefined } : {}), objectives: e.quest.objectives.filter(o => !o.hidden), log: e.quest.log.filter(l => l.players) } : undefined;
    const character = e.character ? { ...e.character, statblock: undefined, sheet: e.character.statsVisibility === "players" && e.character.sheet ? withoutLinkDetails(e.character.sheet) : undefined, statsByCampaign: e.character.statsVisibility === "players" ? e.character.statsByCampaign : {}, features: e.character.featuresVisibility === "players" && e.character.features?.length ? e.character.features.filter(f => !f.gm) : undefined } : undefined;
    return [{ ...e, body: overview ? playerText(e.body) : "", tabs, quest, character, codex: found ? { ...e.codex!, summary: playerText(e.codex!.summary) } : undefined, mapData: map ? e.mapData : undefined, recap: undefined,
      // Organization and character profiles hold GM-only items, so they are not read here at all (players get their own copy from playerCampaign).
      org: undefined, profile: undefined,
      // A vehicle keeps only what its shared tabs show (playerSafeVehicle).
      vehicle }];
  });
  const campaigns = book.campaigns.map(c => ({ ...c, calendars: c.calendars?.filter(x => x.visibility === "players") }));
  return { ...book, campaigns, entries: playersTies(entries) };
}

/**
 * Ties as players see them: shared ties between pages they can read, and the cover story in place of a GM-only tie
 * (a cover that reads the other way round moves to the page at the other end). GM-only ties without one are left out.
 */
function playersTies(entries: Book["entries"]): Book["entries"] {
  const kept = new Set(entries.filter(e => e.kind !== "folder").map(e => e.id)), moved = new Map<string, Tie[]>();
  const note = (t?: string) => { const v = t ? playerText(t).trim() : ""; return v ? { note: v } : {}; };
  const out = entries.map(e => {
    if (!e.ties) return e;
    const ties = e.ties.flatMap((t): Tie[] => {
      if (!kept.has(t.toId) || !kept.has(e.id)) return [];
      if (!t.gm) { const { note: n, cover: _cover, ...rest } = t; void _cover; return [{ ...rest, ...note(n) }]; }
      if (!t.cover) return [];
      if (t.cover.reversed) { moved.set(t.toId, [...moved.get(t.toId) ?? [], { id: t.id, toId: e.id, typeId: t.cover.typeId, ...note(t.cover.note) }]); return []; }
      return [{ id: t.id, toId: t.toId, typeId: t.cover.typeId, ...note(t.cover.note) }];
    });
    return { ...e, ties: ties.length ? ties : undefined };
  });
  return out.map(e => moved.has(e.id) ? { ...e, ties: [...e.ties ?? [], ...moved.get(e.id)!].slice(0, 100) } : e);
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
