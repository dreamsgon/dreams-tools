/**
 * The player page keeps its link token in the address hash (never the query string, which servers and logs see).
 * The open page goes in the same hash after the token: #<token>&entry=<page id>&tab=<tab id>.
 * A hash that is only the token still works.
 */
export type PlayerPlace = { entry: string | null; tab: string | null };
const ID = /^[A-Za-z0-9_-]{1,80}$/;

export function parsePlayerHash(hash: string): { token: string } & PlayerPlace {
  const text = hash.startsWith("#") ? hash.slice(1) : hash, at = text.indexOf("&");
  const token = at < 0 ? text : text.slice(0, at), rest = new URLSearchParams(at < 0 ? "" : text.slice(at + 1));
  const entry = rest.get("entry"), tab = rest.get("tab");
  return { token, entry: entry && ID.test(entry) ? entry : null, tab: entry && tab && ID.test(tab) ? tab : null };
}

/** The hash for a token and place. A tab only travels with a page. */
export function playerHash(token: string, place: Partial<PlayerPlace>): string {
  const rest = new URLSearchParams();
  if (place.entry && ID.test(place.entry)) {
    rest.set("entry", place.entry);
    if (place.tab && ID.test(place.tab)) rest.set("tab", place.tab);
  }
  const text = rest.toString();
  return `#${token}${text ? "&" + text : ""}`;
}
