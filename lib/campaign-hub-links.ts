/*
 * Every link on a campaign's dashboard names that campaign, so whatever you open from it (Maptable,
 * the Encyclopedia, a scene, a page, the Campaigns page) opens in the campaign you were managing.
 */
type Row = { key: string; maptable: { id: string } | null; encyclopedia: { id: string } | null };
const enc = encodeURIComponent;

export function hubLinks(row: Row) {
  const m = row.maptable?.id ?? null, e = row.encyclopedia?.id ?? null;
  return {
    /** This campaign's table in Maptable (the scene last open in it, else its first scene; its scene list when it has none). */
    maptable: m ? `/maptable?campaign=${enc(m)}` : null,
    /** This campaign's scene list in Maptable. */
    scenes: m ? `/maptable?campaign=${enc(m)}&view=scenes` : null,
    /** One scene, opened in this campaign. */
    scene: (sceneId: string) => `/maptable?${m ? `campaign=${enc(m)}&` : ""}scene=${enc(sceneId)}`,
    /** This campaign's notes, or one of its views (quests, codex, characters, calendar). */
    notes: (view?: string) => e ? `/encyclopedia?campaign=${enc(e)}${view ? `&view=${enc(view)}` : ""}` : null,
    /** A page, opened inside this campaign (a world page otherwise opens outside any campaign). */
    entry: (entryId: string) => `/encyclopedia?entry=${enc(entryId)}${e ? `&campaign=${enc(e)}` : ""}`,
    /** The Campaigns page with this campaign's Start notes dialog open; it comes back here when done. */
    startNotes: `/campaigns?notes=${enc(row.key)}`,
  };
}
export type HubLinks = ReturnType<typeof hubLinks>;
