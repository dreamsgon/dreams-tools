/* What this device remembers about a campaign's last ZIP export and GitHub push. Kept apart from rp-sheet.ts so the
 * "GitHub & backups" button can show it without loading the export code. */
/** "Nov 14", or "Nov 14, 2025" when it is not this year. Empty when the date is unreadable. */
export function shortDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
}

export const lastExportKey = (campaignId: string) => `rpg-tools:rp-last-export:${campaignId}`;

export const lastPushKey = (campaignId: string) => `rpg-tools:rp-last-push:${campaignId}`;
export type LastPush = { at: string; repository: string; branch: string; url?: string };
/** Reads a stored last-push note; anything unreadable is ignored. */
export function parseLastPush(raw: string | null): LastPush | null {
  try {
    const v = raw ? JSON.parse(raw) as Partial<LastPush> : null;
    if (!v || typeof v.at !== "string" || Number.isNaN(Date.parse(v.at)) || typeof v.repository !== "string" || typeof v.branch !== "string") return null;
    return { at: v.at, repository: v.repository, branch: v.branch, ...(typeof v.url === "string" && v.url.startsWith("https://github.com/") ? { url: v.url } : {}) };
  } catch { return null; }
}

/** The date of the last Download ZIP on this device, kept per campaign. Only a convenience: it can be missing. */
export function readLastExport(campaignId: string): string | null {
  try { return window.localStorage.getItem(lastExportKey(campaignId)); } catch { return null; }
}
/** The last push from this device, kept per campaign. Only a convenience: it can be missing. */
export function readLastPush(campaignId: string): LastPush | null {
  try { return parseLastPush(window.localStorage.getItem(lastPushKey(campaignId))); } catch { return null; }
}
