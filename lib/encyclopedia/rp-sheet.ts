/* Pure helpers for the "GitHub & backups" sheet: folder counts, the ZIP name, and what a ZIP turns out to be. */
import { FOLDERS_LIST } from "./rp-export.ts";
import type { Workspace } from "./world-model.ts";

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
  /** An RP repository in the numbered layout (1-Now/ to 8-Archive/) without a restore copy. */
  | "numbered"
  /** Anything else. */
  | "unknown";

/** What a ZIP's files (after readZip) are. */
export function classifyZip(names: string[]): ZipKind {
  if (names.includes(".rpg-tools/campaign.json") || names.some(n => /^world-manager\/[^/]+\/campaign\.json$/.test(n))) return "restore";
  if (names.includes(".rpg-tools/files.json")) return "player-safe";
  if (names.some(n => FOLDERS_LIST.some(dir => n.startsWith(dir + "/")))) return "numbered";
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

/** "Session N: <latest session title>" when the campaign has sessions, else "Update <campaign name>". */
export function defaultCommitMessage(workspace: Workspace, campaignId: string): string {
  const campaign = workspace.campaigns.find(c => c.id === campaignId);
  const sessions = workspace.entries.filter(e => e.kind === "session" && e.campaignId === campaignId);
  if (!sessions.length) return `Update ${(campaign?.name ?? "campaign").replace(/\s+/g, " ").trim()}`.slice(0, 100);
  const day = (e: Workspace["entries"][number]) => e.recap?.playedOn ?? e.updatedAt;
  const latest = [...sessions].sort((a, b) => day(b).localeCompare(day(a)) || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))[0];
  const title = latest.title.replace(/\s+/g, " ").trim();
  return (/^session\s+\d+/i.test(title) ? title : `Session ${sessions.length}: ${title}`).slice(0, 100);
}

/** What the Import tab says about a repository or ZIP that has no restore copy. `where` is "ZIP" or "repository". */
export function restoreNotice(kind: ZipKind, where: "ZIP" | "repository" | "folder", fallback: string): { step: "note" | "error"; title: string; message: string } {
  if (kind === "player-safe") return { step: "note", title: "Player-safe export", message: `A player-safe export cannot be restored. It leaves out the GM-only folder and the restore copy, so a campaign made from it would be missing the GM's content. Use ${where === "ZIP" ? "the ZIP" : where === "folder" ? "the folder" : "the repository"} you made with the GM-only switch on.` };
  if (kind === "numbered") return { step: "note", title: "RP repository found", message: `This looks like an RP repository in the numbered layout (it has numbered folders such as 1-Now/ or 3-People/), but it was not made by RPG Tools and has no .rpg-tools/campaign.json, so it cannot be restored. Nothing was changed.` };
  if (kind === "unknown") return { step: "error", title: "Nothing to import", message: `This ${where} is not an RPG Tools export or an RP repository. It has no .rpg-tools/campaign.json and none of the numbered folders (1-Now/ to 8-Archive/).` };
  return { step: "error", title: "No restore copy", message: fallback };
}
