import { z } from 'zod';
import { parseDice } from '../rolls.ts';
import type { Workspace } from './world-model.ts';

export const discordRollSchema = z.object({
  campaignId: z.string().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  formula: z.string().min(1).max(200),
  total: z.number().finite().min(-10_000_000).max(10_000_000),
  detail: z.string().max(400),
});
export type DiscordRoll = z.infer<typeof discordRollSchema>;

/**
 * Whose Discord channels an Encyclopedia campaign posts through: the Maptable campaign chosen for it, or
 * else its paired Maptable campaign. `route` is from older saves, where rolls went to one map type's channel.
 */
export function discordTarget(data: Workspace, campaignId: string): { maptableCampaignId: string; route?: 'combat' | 'exploration' | 'world' } {
  const campaign = data.campaigns.find(c => c.id === campaignId);
  if (!campaign) throw Error('This campaign is not saved yet.');
  if (campaign.discord) return campaign.discord;
  if (campaign.maptableCampaignId) return { maptableCampaignId: campaign.maptableCampaignId };
  throw Error('Choose a Discord channel for this campaign in AI & campaign repositories first.');
}

/** The Discord message for a roll. The total is the roller's own; this only formats it. */
export function discordRollMessage(input: unknown) {
  const roll = discordRollSchema.parse(input);
  parseDice(roll.formula);
  const line = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();
  return `🎲 ${line(roll.title)}\n${line(roll.formula)} = **${roll.total}**${roll.detail ? ` (${line(roll.detail)})` : ''}`;
}
