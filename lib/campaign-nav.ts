import type { CampaignRow } from "./campaign-links.ts";
import { hubLinks } from "./campaign-hub-links.ts";

/**
 * The campaign bar (components/campaign-bar.tsx): one campaign, four places. Every page inside a campaign
 * (its Dashboard, Maptable, the Wiki and the Forum) shows the same bar, so you can always see which campaign
 * you are in and move to another place in it, or to another campaign, without losing your place.
 *
 * Pure: which places a campaign has, where each one opens, and where picking a campaign lands.
 * The Wiki is the Encyclopedia's name everywhere a person reads it; the code and its addresses keep
 * "encyclopedia".
 */

export type CampaignTool = "dashboard" | "maptable" | "encyclopedia" | "forum";
/** The places in the bar, in order. */
export const campaignTools: readonly CampaignTool[] = ["dashboard", "maptable", "encyclopedia", "forum"];
export const toolNames: Record<CampaignTool, string> = { dashboard: "Dashboard", maptable: "Maptable", encyclopedia: "Wiki", forum: "Forum" };

/** A campaign someone else runs that you joined (GET /api/members?mine=1, lib/members-server.ts `Joined`). Only the fields the bar reads. */
export type JoinedCampaign = { ref: string; campaign: string; world: string; ownerName: string; asking: boolean; open: boolean; gm: boolean; maps?: boolean; forum?: boolean };

/** One place in the bar: where it opens, or null when the campaign doesn't have it. `add` opens the campaign's Dashboard ready to add it (owner only). */
export type ToolLink = { tool: CampaignTool; name: string; href: string | null; add: string | null };

/** A campaign as the bar shows it: one you run (`row`) or one you joined (`joined`). */
export type BarCampaign =
  | { kind: "own"; key: string; name: string; world: string; row: CampaignRow }
  | { kind: "member"; key: string; name: string; world: string; joined: JoinedCampaign };

const enc = encodeURIComponent;

/** The campaign's Dashboard (the hub on the Campaigns page). */
export const dashboardHref = (key: string) => `/campaigns/${enc(key)}`;

/** The Dashboard of a campaign that lacks `tool`, with the one-line "has no … yet" notice and its Add button. */
export const addToolHref = (key: string, tool: Exclude<CampaignTool, "dashboard">) => `${dashboardHref(key)}?add=${tool}`;

/** Reads `?add=` on a Dashboard: the place the notice offers to add, or null. */
export function addToolParam(value: string | null | undefined): Exclude<CampaignTool, "dashboard"> | null {
  return value === "maptable" || value === "encyclopedia" || value === "forum" ? value : null;
}

export function ownCampaign(row: CampaignRow): BarCampaign {
  return { kind: "own", key: row.key, name: row.name, world: row.encyclopedia?.worldName ?? "", row };
}

/** A joined campaign's key never collides with your own campaigns' `e:` and `m:` keys. */
export function memberCampaign(joined: JoinedCampaign): BarCampaign {
  return { kind: "member", key: `j:${joined.ref}`, name: joined.campaign, world: joined.world, joined };
}

/** Where each place opens for this campaign. For a member only the places they can open are listed, and there is no Dashboard. */
export function campaignToolLinks(campaign: BarCampaign): ToolLink[] {
  if (campaign.kind === "member") {
    const j = campaign.joined, ref = enc(j.ref);
    const href: Record<CampaignTool, string | null> = {
      dashboard: null,
      // Maptable only when the GM's groups let this member run the table (lib/members.ts editMaps).
      maptable: j.maps ? `/maptable#m-${ref}` : null,
      // Co-GMs open the GM's Wiki; players open the player pages, which start on the campaign's front page.
      encyclopedia: j.gm ? `/encyclopedia#m-${ref}` : j.open ? `/encyclopedia/player#m-${ref}` : null,
      forum: j.forum ? `/forum#m-${ref}` : null,
    };
    return campaignTools.filter(t => href[t]).map(t => ({ tool: t, name: toolNames[t], href: href[t], add: null }));
  }
  const row = campaign.row, links = hubLinks(row);
  const href: Record<CampaignTool, string | null> = {
    dashboard: dashboardHref(row.key),
    maptable: links.maptable,
    encyclopedia: links.notes(),
    forum: links.forum,
  };
  return campaignTools.map(t => ({ tool: t, name: toolNames[t], href: href[t], add: href[t] || t === "dashboard" ? null : addToolHref(row.key, t) }));
}

/**
 * Where picking a campaign in the switcher goes while you are in `tool`: the same place in that campaign when it
 * has it, otherwise its Dashboard with the "has no … yet" notice (yours), or the first place you can open (joined).
 */
export function landingHref(campaign: BarCampaign, tool: CampaignTool): string | null {
  const links = campaignToolLinks(campaign), same = links.find(l => l.tool === tool);
  if (same?.href) return same.href;
  if (campaign.kind === "own") return tool === "dashboard" ? dashboardHref(campaign.key) : addToolHref(campaign.key, tool);
  return links.find(l => l.href)?.href ?? null;
}

/** Whether a campaign has this place, so picking it can switch in place (a tool that can) instead of loading a page. */
export function hasTool(campaign: BarCampaign, tool: CampaignTool): boolean {
  return !!campaignToolLinks(campaign).find(l => l.tool === tool)?.href;
}

/** The small marks on a switcher row: which of Maptable, Wiki and Forum the campaign has. */
export function toolMarks(campaign: BarCampaign): { tool: CampaignTool; name: string; on: boolean }[] {
  const links = campaignToolLinks(campaign);
  return campaignTools.filter(t => t !== "dashboard").map(t => ({ tool: t, name: toolNames[t], on: !!links.find(l => l.tool === t)?.href }));
}

/** The line under a switcher row: what picking it does from here. */
export function landingNote(campaign: BarCampaign, tool: CampaignTool): string {
  if (tool === "dashboard" || hasTool(campaign, tool)) return campaign.world;
  if (campaign.kind === "member") return `No ${toolNames[tool]} for you here`;
  return `No ${toolNames[tool]} yet · opens Dashboard`;
}

/** Which campaign a page is in, by whatever id that page knows. */
export type CampaignRef = { key?: string; maptableId?: string; encyclopediaId?: string; memberRef?: string };

export function matchesRef(campaign: BarCampaign, ref: CampaignRef): boolean {
  if (campaign.kind === "member") return !!ref.memberRef && campaign.joined.ref === ref.memberRef;
  const row = campaign.row;
  if (ref.key) return row.key === ref.key || (!!row.maptable && ref.key === `m:${row.maptable.id}`) || (!!row.encyclopedia && ref.key === `e:${row.encyclopedia.id}`);
  if (ref.encyclopediaId) return row.encyclopedia?.id === ref.encyclopediaId;
  if (ref.maptableId) return row.maptable?.id === ref.maptableId;
  return false;
}

/** The joined campaigns the switcher lists: not ones you are still asking to join. */
export const joinedForSwitcher = (joined: readonly JoinedCampaign[] | null | undefined) => (joined ?? []).filter(j => !j.asking);
