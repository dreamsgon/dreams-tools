import { FileText, Map as MapIcon, User } from "lucide-react";
import type { CampaignRow } from "@/lib/campaign-links";

export const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** "2h ago", "Yesterday", "Nov 4". */
export function when(iso: string, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const mins = Math.max(0, Math.round((now - t) / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24 && new Date(t).toDateString() === new Date(now).toDateString()) return `${Math.round(mins / 60)}h ago`;
  if (new Date(t).toDateString() === new Date(now - 864e5).toDateString()) return "Yesterday";
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", ...(new Date(t).getFullYear() === new Date(now).getFullYear() ? {} : { year: "numeric" }) });
}

/** A campaign opens in its hub on the Campaigns page. */
export const openHref = (r: { key: string }) => `/campaigns/${encodeURIComponent(r.key)}`;
export const notesHref = (r: CampaignRow) => r.encyclopedia ? `/encyclopedia?campaign=${encodeURIComponent(r.encyclopedia.id)}` : null;
export const mapsHref = (r: CampaignRow) => r.maptable ? `/maptable?campaign=${encodeURIComponent(r.maptable.id)}` : null;
export const pageHref = (p: { id: string }) => `/encyclopedia?entry=${encodeURIComponent(p.id)}`;
const kindNames: Record<string, string> = { character: "Character", place: "Place", faction: "Organization", lore: "Lore", session: "Session notes", tasks: "Checklist", map: "Map", note: "Page", vehicle: "Vehicle", galaxy: "Galaxy", sector: "Sector", system: "Star system", store: "Store", quest: "Quest" };
export const kindName = (kind: string) => kindNames[kind] ?? "Page";
export function KindIcon({ kind }: { kind: string }) {
  return kind === "character" ? <User size={15} aria-hidden="true" /> : kind === "map" ? <MapIcon size={15} aria-hidden="true" /> : <FileText size={15} aria-hidden="true" />;
}

/** The numbers shown for a campaign, leaving out a tool it does not use. */
export function facts(r: CampaignRow): [string, string][] {
  const e = r.encyclopedia, m = r.maptable, out: [string, string][] = [];
  if (e) out.push([String(e.pages), e.pages === 1 ? "page" : "pages"]);
  if (e) out.push([String(e.maps), e.maps === 1 ? "map" : "maps"]);
  if (m) out.push([String(m.scenes), m.scenes === 1 ? "scene" : "scenes"]);
  return out;
}
