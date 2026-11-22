/**
 * A campaign's own web address: `/campaigns/<slug>`, set by the GM on the Campaigns page, in place of
 * the id address (`/campaigns/e:<id>`). Id addresses keep working and the Dashboard swaps them for the slug.
 *
 * A slug is lowercase letters, digits and single hyphens, at most 60 characters. It never holds a colon,
 * so it can't be mistaken for an id key (`e:…`, `m:…`, `j:…`). Each slug is unique within one account.
 *
 * Where it is kept: on the Wiki campaign (`slug`) when the campaign has one, otherwise on the Maptable
 * campaign. Pure: no storage here.
 */

export const SLUG_MAX = 60;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Whether `value` is a valid slug as typed (already tidy). */
export const isSlug = (value: unknown): value is string => typeof value === "string" && value.length <= SLUG_MAX && SLUG_RE.test(value);

/** Tidies what someone typed into a slug: lowercase, accents dropped, spaces and other marks become single hyphens. Empty when nothing is left. */
export function toSlug(input: string): string {
  return input.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, SLUG_MAX).replace(/-+$/, "");
}

/** Why a typed slug can't be used, or null when it can. `taken` holds the account's other slugs. */
export function slugProblem(slug: string, taken: Iterable<string>): string | null {
  if (!slug) return "Type a web address: letters, numbers and hyphens.";
  if (!isSlug(slug)) return `Use lowercase letters, numbers and single hyphens, up to ${SLUG_MAX} characters.`;
  for (const t of taken) if (t === slug) return `Another campaign already uses /campaigns/${slug}.`;
  return null;
}

/** A campaign's Dashboard address: its slug when it has one, else its id key. */
export const campaignHref = (row: { key: string; slug?: string | null }) => `/campaigns/${row.slug ? row.slug : encodeURIComponent(row.key)}`;
