import {z} from 'zod';
export const diceAppearanceSchema=z.object({muted:z.boolean().optional(),volume:z.number().min(0).max(1).optional(),material:z.enum(["resin","metal","glass","gemstone"]).optional(),roughness:z.number().min(0).max(1).optional(),enabled:z.boolean(),color:z.string().regex(/^#[0-9a-f]{6}$/i),font:z.enum(['serif','sans-serif','monospace']),textColor:z.string().regex(/^#[0-9a-f]{6}$/i),borderColor:z.string().regex(/^#[0-9a-f]{6}$/i)});
export type DiceAppearance=z.infer<typeof diceAppearanceSchema>;
