/** Where the dice tray's "Send to Discord" goes on pages other than Maptable. Decided per page from the campaign it shows. */
export type DiceDiscord =
  /** The GM on an Encyclopedia campaign: its chosen or paired Maptable campaign's webhook, through /api/encyclopedia/discord-roll. */
  | { mode: "encyclopedia"; campaignId: string; label: string }
  /** The GM on the Campaigns page for a Maptable-only campaign: the same route, naming the Maptable campaign. */
  | { mode: "maptable"; maptableCampaignId: string; label: string }
  /** A signed-in member on a player page: rolled on the server, sent through /api/encyclopedia/player-dice. */
  | { mode: "member"; ref: string; campaignId: string; label: string };
export type DiceTarget = { discord: DiceDiscord | null; note: string };

/** What a roll remembers about where it may go: the mode and the campaign it was made for. Never the member's ref. */
export type DiceVia = { mode: DiceDiscord["mode"]; id: string; label: string };
export const diceId = (d: DiceDiscord) => d.mode === "encyclopedia" ? d.campaignId : d.mode === "maptable" ? d.maptableCampaignId : d.campaignId;
export const diceVia = (d: DiceDiscord): DiceVia => ({ mode: d.mode, id: diceId(d), label: d.label });
/** True when a roll made for `via` may be posted from the page that now has target `d`. */
export const sameDiceTarget = (via: { mode?: string; id?: string } | undefined, d: DiceDiscord | null | undefined) => !!via && !!d && !!via.id && via.mode === d.mode && via.id === diceId(d);

export const LOCAL_ONLY = "Rolls here stay on this device. Open a campaign to post them to Discord.";
export const NO_CAMPAIGN: DiceTarget = { discord: null, note: LOCAL_ONLY };

/** The Encyclopedia: the open campaign, when it has a Discord choice or a paired Maptable campaign. A co-GM posts nothing (the route reads only the owner's own data). */
export function encyclopediaDiceTarget(campaign: { id: string; name: string; discord?: unknown; maptableCampaignId?: string | null } | null | undefined, coGm: boolean): DiceTarget {
  if (!campaign) return { discord: null, note: "Rolls here stay on this device. Open a campaign to post them to Discord." };
  if (coGm) return { discord: null, note: "Rolls here stay on this device. Only the GM posts rolls to Discord." };
  if (!campaign.discord && !campaign.maptableCampaignId) return { discord: null, note: "Rolls here stay on this device. Choose a Discord channel for this campaign (AI & GitHub) to post them." };
  return { discord: { mode: "encyclopedia", campaignId: campaign.id, label: campaign.name }, note: "" };
}

/** A campaign's page in the Campaigns hub. Notes first (their Discord choice applies), else the Maptable campaign. */
export function hubDiceTarget(row: { name: string; encyclopedia: { id: string } | null; maptable: { id: string } | null } | null | undefined): DiceTarget {
  if (!row) return NO_CAMPAIGN;
  if (row.encyclopedia) return { discord: { mode: "encyclopedia", campaignId: row.encyclopedia.id, label: row.name }, note: "" };
  if (row.maptable) return { discord: { mode: "maptable", maptableCampaignId: row.maptable.id, label: row.name }, note: "" };
  return NO_CAMPAIGN;
}

/** A player page. Only a signed-in member (an m-<ref> link with a "you") posts; a share link never does. */
export function playerDiceTarget(token: string, campaign: { id: string; name: string }, signedIn: boolean): DiceTarget {
  const ref = /^m-([a-f0-9]{64})$/.exec(token)?.[1];
  if (!ref || !signedIn) return { discord: null, note: "Rolls here stay on this device. Sign in through your campaign link to post them to Discord." };
  return { discord: { mode: "member", ref, campaignId: campaign.id, label: campaign.name }, note: "" };
}

/** A tiny shared store so the page that knows the campaign can tell the dice buttons (mounted once in the layout). Each registration is its own entry, so two equal targets never undo each other; the latest one wins. */
const registrations: { target: DiceTarget }[] = [];
let current: DiceTarget = NO_CAMPAIGN;
const listeners = new Set<() => void>();
function settle() {
  const next = registrations.length ? registrations[registrations.length - 1].target : NO_CAMPAIGN;
  if (next.note === current.note && JSON.stringify(next.discord) === JSON.stringify(current.discord)) return;
  current = next; listeners.forEach(l => l());
}
export const diceTargetStore = {
  get: () => current,
  getServer: () => NO_CAMPAIGN,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  /** Registers a target and returns a function that removes just this registration (call it when the page goes away). */
  set(target: DiceTarget) {
    const entry = { target };
    registrations.push(entry); settle();
    return () => { const at = registrations.indexOf(entry); if (at >= 0) { registrations.splice(at, 1); settle(); } };
  },
};
