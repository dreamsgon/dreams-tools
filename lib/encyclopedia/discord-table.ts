import { z } from 'zod';
/**
 * A random table or oracle result posted to Discord, from an Encyclopedia page, the Random tables page or
 * the Maptable dice tray. The result was rolled in the GM's browser; this only checks its shape.
 */
const text = (max: number) => z.string().max(max);
export const tableResultSchema = z.object({
  title: z.string().trim().min(1).max(200),
  text: text(3000),
  roll: text(120).optional(),
  steps: z.array(z.object({ table: text(160), roll: text(120).optional(), text: text(600) })).max(20).optional(),
  oracle: z.object({ question: text(300).optional(), answer: text(40), odds: text(60), chance: z.number().int().min(0).max(100), d100: z.number().int().min(1).max(100), twist: text(600).optional(), tension: z.number().int().min(1).max(9) }).optional(),
  /** Where it was rolled, such as "The Salt Road · Greyfen marsh". */
  footer: text(200).optional(),
});
export type TableResult = z.infer<typeof tableResultSchema>;
export const discordTableSchema = z.object({ campaignId: z.string().min(1).max(100).optional(), maptableCampaignId: z.string().min(1).max(100).optional(), result: tableResultSchema })
  .refine(v => !!v.campaignId !== !!v.maptableCampaignId, 'Choose a campaign.');
