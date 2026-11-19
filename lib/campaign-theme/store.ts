/*
 * Where a campaign's themes are kept: users/<owner>/encyclopedia/themes/<campaign>.json, in the GM's storage. Writes
 * are conditional on the revision that was read (If-Match, or If-None-Match for a new file) and a change is re-applied
 * to the file as stored when someone else saved in between.
 */
import type { Bucket } from "../storage-types.ts";
import { encyclopediaPrefix } from "../encyclopedia/store.ts";
import { ThemeError, emptyThemeFile, themeFileSchema, type ThemeFile } from "./model.ts";

export const themeKey = (owner: string, campaignId: string) => encyclopediaPrefix(owner) + `themes/${encodeURIComponent(campaignId)}.json`;

export class ThemeStore {
  private bucket: Bucket;
  constructor(bucket: Bucket) { this.bucket = bucket; }

  async read(owner: string, campaignId: string): Promise<{ file: ThemeFile; etag: string | null }> {
    const object = await this.bucket.get(themeKey(owner, campaignId));
    if (!object) return { file: emptyThemeFile(), etag: null };
    const parsed = themeFileSchema.safeParse(await object.json().catch(() => null));
    // A file that can't be read shows the app's own look rather than breaking the campaign's pages.
    if (!parsed.success) return { file: emptyThemeFile(), etag: object.etag };
    return { file: parsed.data, etag: object.etag };
  }

  /** Reads the file, applies `change` and writes it if nobody saved in between; tries four times. */
  async update(owner: string, campaignId: string, change: (file: ThemeFile) => ThemeFile): Promise<ThemeFile> {
    for (let tries = 0; tries < 4; tries++) {
      const { file, etag } = await this.read(owner, campaignId);
      const next = themeFileSchema.parse(change(file));
      const done = await this.bucket.put(themeKey(owner, campaignId), JSON.stringify(next), {
        onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json" },
      });
      if (done) return next;
    }
    throw new ThemeError("Someone else saved the themes at the same moment. Try again.");
  }
}
