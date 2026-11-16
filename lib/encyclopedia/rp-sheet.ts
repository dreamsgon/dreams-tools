/* Pure helpers for the "GitHub & backups" sheet: folder counts, the ZIP name, and what a ZIP turns out to be. */
import { FOLDERS_LIST } from "./rp-export.ts";

export type FolderRow = { name: string; detail: string };
const files = (n: number) => `${n} file${n === 1 ? "" : "s"}`;

/** The rows of the export list, from the paths an export would write. A folder with no files is left out (6-GM-Only when the switch is off). */
export function folderRows(paths: string[]): FolderRow[] {
  const inside = (dir: string) => paths.filter(p => p.startsWith(dir + "/")).length;
  const rows: FolderRow[] = [];
  if (paths.includes("README.md")) rows.push({ name: "README.md", detail: "front page" });
  if (paths.includes("AGENTS.md")) rows.push({ name: "AGENTS.md", detail: "AI GM guide" });
  for (const dir of FOLDERS_LIST.slice(0, 6)) { const n = inside(dir); if (n) rows.push({ name: `${dir}/`, detail: files(n) }); }
  const rest = FOLDERS_LIST.slice(6).filter(dir => inside(dir) > 0), restCount = rest.reduce((n, dir) => n + inside(dir), 0);
  if (rest.length) rows.push({ name: rest.map(d => `${d}/`).join(" · "), detail: files(restCount) });
  if (paths.some(p => p.startsWith(".rpg-tools/"))) rows.push({ name: ".rpg-tools/", detail: paths.includes(".rpg-tools/campaign.json") ? "restore copy" : "page map" });
  return rows;
}

/** `<campaign-name>-rp.zip` with a name that is safe on any system. */
export function zipName(campaignName: string): string {
  const slug = campaignName.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/, "");
  return `${slug || "campaign"}-rp.zip`;
}

export type ZipKind =
  /** Has .rpg-tools/campaign.json (or an old world-manager copy): can be restored. */
  | "restore"
  /** Has .rpg-tools/files.json but no restore copy: a player-safe export. */
  | "player-safe"
  /** An RP repository in the numbered layout (1-Now/ or 3-People/) without a restore copy. */
  | "numbered"
  /** Anything else. */
  | "unknown";

/** What a ZIP's files (after readZip) are. */
export function classifyZip(names: string[]): ZipKind {
  if (names.includes(".rpg-tools/campaign.json") || names.some(n => /^world-manager\/[^/]+\/campaign\.json$/.test(n))) return "restore";
  if (names.includes(".rpg-tools/files.json")) return "player-safe";
  if (names.some(n => n.startsWith("1-Now/") || n.startsWith("3-People/"))) return "numbered";
  return "unknown";
}

/** When the export was made: the newest date in 8-Archive/Export-Log.md ("- <ISO> - N files"), or null. */
export function exportedAt(log: string | undefined): string | null {
  let best: string | null = null;
  for (const m of (log ?? "").matchAll(/^- (\d{4}-\d{2}-\d{2}T[^\s]+) - /gm)) if (!Number.isNaN(Date.parse(m[1])) && (!best || Date.parse(m[1]) > Date.parse(best))) best = m[1];
  return best;
}

/** "Nov 14", or "Nov 14, 2025" when it is not this year. Empty when the date is unreadable. */
export function shortDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
}

export const lastExportKey = (campaignId: string) => `rpg-tools:rp-last-export:${campaignId}`;
