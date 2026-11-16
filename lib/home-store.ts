import type { Bucket } from "./storage-types";
import { applyHomeAction, defaultHomeLayout, homeLayoutSchema, type HomeAction, type HomeLayout } from "./home-layout.ts";

/** The home page layout lives in one small file per account, next to (not inside) the two tools' saved data. */
export const homeKey = (owner: string) => `users/${encodeURIComponent(owner)}/home.json`;
export const HOME_LIMIT = 200_000;

export async function readHome(bucket: Bucket, owner: string): Promise<{ layout: HomeLayout; saved: boolean; etag: string | null }> {
  const object = await bucket.get(homeKey(owner));
  if (!object) return { layout: defaultHomeLayout(), saved: false, etag: null };
  const parsed = homeLayoutSchema.safeParse(await object.json());
  if (!parsed.success) throw new Error("Your home page layout could not be read. Nothing was changed.");
  return { layout: parsed.data, saved: true, etag: object.etag };
}

async function write(bucket: Bucket, owner: string, layout: HomeLayout, etag: string | null) {
  const body = JSON.stringify(homeLayoutSchema.parse(layout));
  if (body.length > HOME_LIMIT) throw new Error("Your home page settings are too large to save. Remove some links, to-dos, notes or campaign dashboards.");
  return bucket.put(homeKey(owner), body, { onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json" } });
}

/** Reads, changes and saves, trying again if another tab saved in between. */
export async function changeHome(bucket: Bucket, owner: string, change: (l: HomeLayout) => HomeLayout): Promise<HomeLayout> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { layout, etag } = await readHome(bucket, owner);
    const next = change(layout);
    if (next === layout) return layout;
    if (await write(bucket, owner, next, etag)) return next;
  }
  throw new Error("Something else saved your home page at the same moment. Reload and try again.");
}

export const homeAction = (bucket: Bucket, owner: string, action: HomeAction) => changeHome(bucket, owner, l => applyHomeAction(l, action));

/** The layout as the home page sees it: the Maptable-only campaign dashboards are saved with it but belong to the campaign pages. */
export function forHomePage(layout: HomeLayout): HomeLayout {
  const { campaignDashboards: _d, ...rest } = layout;
  return rest;
}
