import type { Collection, Token, Workspace } from "./model.ts";
import { tokenDisposition, type TokenSide } from "./token-defaults.ts";

export type GallerySide = "all" | TokenSide;
export const GALLERY_SIDES: { id: GallerySide; label: string }[] = [
  { id: "all", label: "All" }, { id: "party", label: "Party" }, { id: "ally", label: "Allies" },
  { id: "neutral", label: "Neutral" }, { id: "enemy", label: "Enemies" },
];

export type GalleryFilter = { campaignId: string | null; scope: "campaign" | "all"; side: GallerySide; query: string };

/** Saved tokens that pass the campaign switch, the side chip and the search box. Party markers follow their campaign. */
export function filterGalleryTokens(w: Workspace, f: GalleryFilter): Token[] {
  const q = f.query.trim().toLowerCase();
  return w.tokenLibrary.filter(t => {
    const owner = w.libraryCampaigns[t.id] ?? null;
    if (f.scope === "campaign" && owner && owner !== f.campaignId) return false;
    if (f.side !== "all" && tokenDisposition(t) !== f.side) return false;
    return !q || t.name.toLowerCase().includes(q);
  });
}

export type GalleryGroup = { id: string | null; name: string; folder?: Collection; tokens: Token[] };

/**
 * Folders (in tree order, nested ones named by their path) then the tokens that are in none.
 * With a search or side chip on, folders with nothing in them are left out.
 */
export function galleryGroups(folders: Collection[], tokens: Token[], locations: Record<string, string | null>, narrowed: boolean): GalleryGroup[] {
  const byId = new Map(folders.map(f => [f.id, f]));
  const path = (f: Collection) => {
    const names: string[] = []; const seen = new Set<string>();
    for (let c: Collection | undefined = f; c && !seen.has(c.id); c = c.parentId ? byId.get(c.parentId) : undefined) { seen.add(c.id); names.unshift(c.name); }
    return names.join(" / ");
  };
  const out: GalleryGroup[] = [];
  const walk = (parent: string | null, seen: Set<string>) => {
    for (const f of folders.filter(f => (f.parentId && byId.has(f.parentId) ? f.parentId : null) === parent)) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push({ id: f.id, name: path(f), folder: f, tokens: tokens.filter(t => locations[t.id] === f.id) });
      walk(f.id, seen);
    }
  };
  walk(null, new Set());
  const inFolder = new Set(out.flatMap(g => g.tokens.map(t => t.id)));
  const loose = tokens.filter(t => !inFolder.has(t.id));
  out.push({ id: null, name: "Not in a folder", tokens: loose });
  return out.filter(g => !narrowed || g.tokens.length > 0);
}

/** The side a saved Encyclopedia-style role maps to. */
export const roleSide = { pc: "party", companion: "ally", npc: "neutral", creature: "enemy" } as const satisfies Record<string, TokenSide>;
