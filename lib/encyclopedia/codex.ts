import { z } from "zod";

/*
 * The codex: short, collectable entries (creatures, items, legends, letters) that players
 * find during play. Any page can be in the codex. "Found" is kept per campaign, so a piece of
 * shared lore can be found in one campaign and still be unknown in another.
 * Players only ever get found entries, and only the title, picture and the player summary.
 */

const cid = z.string().min(1).max(100);
export const codexCategory = z.string().trim().min(1).max(60);
export const codexFoundSchema = z.object({
  /** When it was marked found (ISO). */
  at: z.string().max(40),
  /** Where or when, such as "Session 9". */
  label: z.string().trim().max(80).optional(),
});
export const codexSchema = z.object({
  category: codexCategory,
  /** What players read once they have found it. GM notes stay in the page text. */
  summary: z.string().max(2000),
  found: z.record(cid, codexFoundSchema),
});
export const inboxNoteSchema = z.object({ id: cid, text: z.string().trim().min(1).max(1000), at: z.string().max(40) });
export type Codex = z.infer<typeof codexSchema>;
export type InboxNote = z.infer<typeof inboxNoteSchema>;

export const defaultCategories = ["Bestiary", "Items & relics", "Lore & legends", "Letters & notes", "Places"];

/** Creature categories make characters (so they can become tokens); the rest make lore pages. */
export const isCreatureCategory = (name: string) => /best|creature|monster|beast/i.test(name);

/** A find counts as new for players for a week. */
export const isNewFind = (found: { at: string } | undefined, now = Date.now()) => !!found && now - Date.parse(found.at) < 7 * 864e5;

type CodexEntry = { id: string; worldId: string; campaignId: string | null; title: string; codex?: Codex };

/** Codex entries a campaign can see (its own and shared lore). */
export function codexIn<E extends CodexEntry>(entries: E[], worldId: string, campaignId: string) {
  return entries.filter(e => e.codex && e.worldId === worldId && (e.campaignId === null || e.campaignId === campaignId))
    .sort((a, b) => a.title.localeCompare(b.title)) as (E & { codex: Codex })[];
}

/** The categories to list: the campaign's own order first, then any others in use. */
export function codexCategories(entries: CodexEntry[], saved: string[] | undefined) {
  const names = [...(saved ?? defaultCategories)];
  for (const e of entries) if (e.codex && !names.some(n => n.toLowerCase() === e.codex!.category.toLowerCase())) names.push(e.codex.category);
  return names;
}

export function setFound(c: Codex, campaignId: string, found: boolean, label?: string, now = new Date().toISOString()): Codex {
  const rest = Object.fromEntries(Object.entries(c.found).filter(([id]) => id !== campaignId));
  return { ...c, found: found ? { ...rest, [campaignId]: { at: c.found[campaignId]?.at ?? now, ...(label?.trim() ? { label: label.trim().slice(0, 80) } : {}) } } : rest };
}

/** What players get for a found entry. */
export function playerCodex(c: Codex, campaignId: string, clean: (text: string) => string) {
  const f = c.found[campaignId];
  return f ? { category: c.category, summary: clean(c.summary), found: { at: f.at, label: f.label ?? "" } } : undefined;
}
