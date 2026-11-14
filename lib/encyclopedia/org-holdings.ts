import { defaultMapColour, type PlayerOrg } from "./org-profile.ts";
import type { Entry } from "./world-model.ts";

/*
 * Held places on world maps and the Organizations section of the sidebar. A place an organization lists under Holdings is
 * tinted on the map in that organization's map colour; when several hold it the first by name tints it and the rest are shown
 * on the place card. Players only count organizations whose Profile is shared, through the same player copy that hides GM only
 * blocks, GM only holdings and pages players can't read (playerOrg), so nothing here can reveal more than the Profile tab does.
 */

export type Holder = { id: string; title: string; colour: string; gm?: boolean };
/** Who holds each page, by the held page's id. Each list is in name order, so the first one tints. */
export type HoldersByPlace = Record<string, Holder[]>;

const byName = (a: Holder, b: Holder) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
const mapColourOf = (emblem: { mapColour?: string } | undefined) => emblem?.mapColour ?? defaultMapColour;

function add(out: HoldersByPlace, placeId: string, holder: Holder) {
  const list = out[placeId] ??= [];
  const at = list.findIndex(h => h.id === holder.id);
  if (at < 0) list.push(holder);
  else if (list[at].gm && !holder.gm) list[at] = holder; // held openly in one block, GM only in another: it is open
}

/**
 * Every holder by place, as the GM sees it: the organizations of the world that the campaign can see (its own and shared
 * lore; with no campaign, shared lore only), including GM only holdings, which are marked.
 */
export function holdersByPlace(entries: readonly Entry[], scope: { worldId: string; campaignId: string | null }): HoldersByPlace {
  const out: HoldersByPlace = {};
  for (const e of entries) {
    if (e.kind !== "faction" || !e.org || e.worldId !== scope.worldId || (e.campaignId !== null && e.campaignId !== scope.campaignId)) continue;
    const colour = mapColourOf(e.org.emblem);
    for (const b of e.org.blocks) if (b.kind === "holdings") for (const h of b.holdings) add(out, h.entryId, { id: e.id, title: e.title, colour, ...(b.gm || h.gm ? { gm: true } : {}) });
  }
  for (const k of Object.keys(out)) out[k].sort(byName);
  return out;
}

/** The same for players: only shared organizations count, and their holdings are already the ones players may see. */
export function playerHoldersByPlace(entries: readonly { id: string; title: string; kind: string; org?: PlayerOrg | undefined }[]): HoldersByPlace {
  const out: HoldersByPlace = {};
  for (const e of entries) {
    if (e.kind !== "faction" || !e.org) continue;
    const colour = mapColourOf(e.org.emblem);
    for (const b of e.org.blocks) if (b.kind === "holdings") for (const h of b.holdings) add(out, h.entryId, { id: e.id, title: e.title, colour });
  }
  for (const k of Object.keys(out)) out[k].sort(byName);
  return out;
}

/** The tint of each pin on a map, by pin id: the colour of the first holder of the page the pin links to. */
export function pinTints(pins: readonly { id: string; entryId?: string | null }[], holders: HoldersByPlace): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of pins) { const first = p.entryId ? holders[p.entryId]?.[0] : undefined; if (first) out[p.id] = first.colour; }
  return out;
}

/* ---- The sidebar's Organizations section ---- */

export type OrgListItem = { id: string; title: string; colour: string; lore: boolean };

/** The organization pages in a list of pages (already limited to what the viewer may see), by name, with their map colour. */
export function orgListItems(entries: readonly Pick<Entry, "id" | "title" | "kind" | "campaignId" | "org">[]): OrgListItem[] {
  return entries.filter(e => e.kind === "faction").map(e => ({ id: e.id, title: e.title, colour: mapColourOf(e.org?.emblem), lore: e.campaignId === null }))
    .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

/**
 * What a player's sidebar lists: the organization pages they can read. The colour dot shows only when the organization's
 * Profile is shared (the player copy has an `org`); otherwise `colour` is null and the row has a plain dot.
 */
export function playerOrgListItems(entries: readonly { id: string; title: string; kind: string; org?: PlayerOrg | undefined }[]): { id: string; title: string; colour: string | null }[] {
  return entries.filter(e => e.kind === "faction").map(e => ({ id: e.id, title: e.title, colour: e.org ? mapColourOf(e.org.emblem) : null }))
    .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}
