/*
 * The bridge API without the network: what /api/bridge sends and how a bridge's writes change the workspace.
 * Engine-neutral on purpose: Foundry, the planned Unreal Engine VTT or any other table reads the same shapes.
 * Characters travel as RPG Tools sheets (rpgtools-sheet, version 1, the format the sheet import and export use);
 * pages as plain Markdown with their visibility, so each table decides how to show GM-only parts.
 *
 * The bridge acts for the GM's own table, so it sees GM-only things too, marked as such. It sees one campaign: its
 * pages and the world's shared lore (campaignExport). It writes only this campaign's own character pages, never
 * shared world pages, campaign settings or the stat form (new fields in a sheet are skipped and named).
 */
import { applyImport, planFields, type ImportChoice, type ImportFile } from "../encyclopedia/sheet-import.ts";
import { exportSheet, type SheetFile } from "../encyclopedia/sheet-export.ts";
import { newItemId, type Sheet } from "../encyclopedia/sheet-link.ts";
import { campaignExport, defaultCharacter, type Entry, type Workspace } from "../encyclopedia/world-model.ts";
import { z } from "zod";
import { parseDice } from "../rolls.ts";
import { categoryOf, goalStatus, goalText, newQuest, questCategories, stateNames } from "../encyclopedia/quests.ts";
import { quotesMarkdown, timelineMarkdown } from "../encyclopedia/recap-schema.ts";
import { allows, syncInfo, syncKinds, type BridgeGrant, type SyncKind } from "./keys.ts";

export const BRIDGE_API_VERSION = 1;
export class BridgeError extends Error {
  readonly status: number;
  readonly body?: Record<string, unknown>;
  constructor(status: number, message: string, body?: Record<string, unknown>) { super(message); this.status = status; this.body = body; }
}

/** Page kinds sent as pages. Characters, quests, recaps and maps have their own kinds of sync. */
export const pageKinds: readonly Entry["kind"][] = ["folder", "note", "place", "faction", "lore", "vehicle"];

export function need(grant: Pick<BridgeGrant, "sync">, kind: SyncKind, way: "to" | "from") {
  if (!allows(grant.sync, kind, way)) throw new BridgeError(403, `${syncInfo[kind].name}: this bridge key is set to ${grant.sync[kind] === "off" ? "Off" : grant.sync[kind] === "to" ? "RPG Tools → your table only" : "your table → RPG Tools only"}. Change it under AI & GitHub › Other tables.`);
}

/** The campaign as this key sees it. */
export function bookFor(data: Workspace, campaignId: string) {
  const campaign = data.campaigns.find(c => c.id === campaignId);
  if (!campaign) throw new BridgeError(404, "This campaign no longer exists.");
  return { book: campaignExport(data, campaignId), campaign };
}

export function bridgeInfo(data: Workspace, grant: BridgeGrant, revision: number) {
  const { book, campaign } = bookFor(data, grant.campaignId);
  return {
    api: BRIDGE_API_VERSION, revision,
    key: { name: grant.name, client: grant.client },
    campaign: { id: campaign.id, name: campaign.name }, world: book.worlds[0] ? { id: book.worlds[0].id, name: book.worlds[0].name } : null,
    formats: { character: "rpgtools-sheet@1", page: "markdown" },
    sync: Object.fromEntries(syncKinds.map(k => [k, { direction: grant.sync[k], ready: syncInfo[k].ready }])),
    endpoints: {
      characters: "GET /api/bridge/characters · POST /api/bridge/characters (new, from a sheet)",
      character: "GET /api/bridge/characters/{id} · PUT /api/bridge/characters/{id} (sheet, optional baseUpdatedAt)",
      hp: "POST /api/bridge/characters/{id}/hp ({value, max?})",
      pages: "GET /api/bridge/pages?since={ISO time}",
      quests: "GET /api/bridge/quests?since={ISO time}",
      recaps: "GET /api/bridge/recaps?since={ISO time}",
      rolls: "POST /api/bridge/rolls ({title, formula, total, detail?, who?}) posts to the campaign's Discord rolls channel",
    },
  };
}

const own = (e: Entry, campaignId: string) => e.campaignId === campaignId;
const characterRow = (e: Entry) => ({ id: e.id, name: e.title, role: e.character?.role ?? "npc", parentId: e.parentId, shared: e.campaignId === null, updatedAt: e.updatedAt ?? null });

export function listCharacters(data: Workspace, campaignId: string) {
  const { book } = bookFor(data, campaignId);
  return book.entries.filter(e => e.kind === "character").map(characterRow);
}

export function readCharacter(data: Workspace, campaignId: string, id: string) {
  const { book } = bookFor(data, campaignId);
  const e = book.entries.find(x => x.id === id && x.kind === "character");
  if (!e) throw new BridgeError(404, "That character isn’t in this campaign.");
  const { file, warnings } = exportSheet(book, e.id, { campaignId });
  return { ...characterRow(e), sheet: file, warnings };
}

/** Rows changed after `since` (all of them without it), and every id so a table can remove the ones that are gone. */
function changedRows(data: Workspace, campaignId: string, kinds: readonly Entry["kind"][], since: string | undefined) {
  const { book, campaign } = bookFor(data, campaignId);
  const all = book.entries.filter(e => kinds.includes(e.kind));
  const after = since ? Date.parse(since) : NaN;
  if (since && Number.isNaN(after)) throw new BridgeError(400, "since must be an ISO time, such as 2026-11-14T10:00:00Z.");
  const changed = Number.isNaN(after) ? all : all.filter(e => !e.updatedAt || Date.parse(e.updatedAt) > after);
  const titles = new Map(book.entries.map(e => [e.id, e.title]));
  return { ids: all.map(e => e.id), changed, campaign, title: (id: string) => titles.get(id) };
}
const visible = (v: string | undefined) => (v === "players" ? "players" : "gm") as "players" | "gm";
/** A page's common fields: its Overview and tabs as Markdown, each with who may read it. */
const pageRow = (e: Entry) => ({
  id: e.id, kind: e.kind, title: e.title, parentId: e.parentId, shared: e.campaignId === null, updatedAt: e.updatedAt ?? null, order: e.order ?? null,
  overview: { visibility: visible(e.overviewVisibility), text: e.body },
  tabs: (e.tabs ?? []).map(t => ({ id: t.id, title: t.title, visibility: visible(t.visibility), text: t.body })),
});

/** Places, lore, organizations, notes, vehicles and folders. */
export function listPages(data: Workspace, campaignId: string, since?: string) {
  const { ids, changed } = changedRows(data, campaignId, pageKinds, since);
  return { ids, pages: changed.map(pageRow) };
}

/**
 * Quests, with their state, category, goals and log. Players see a quest when its Overview is shared, and then only
 * the goals not marked hidden, the log entries marked for players, and the reward unless it is hidden. `prep` is the
 * GM's own and never for players.
 */
export function listQuests(data: Workspace, campaignId: string, since?: string) {
  const { ids, changed, campaign, title } = changedRows(data, campaignId, ["quest"], since);
  const categories = questCategories(campaign);
  return {
    ids,
    quests: changed.map(e => {
      const q = e.quest ?? newQuest();
      return {
        ...pageRow(e),
        quest: {
          state: q.state, stateName: stateNames[q.state], category: categoryOf(categories, q.type).name,
          giver: q.giverId ? { id: q.giverId, title: title(q.giverId) ?? null } : null, place: q.placeId ? { id: q.placeId, title: title(q.placeId) ?? null } : null,
          reward: q.reward ?? "", rewardHidden: !!q.rewardHidden, prep: q.prep ?? "",
          goals: q.objectives.map(o => ({ id: o.id, text: goalText(o, title), status: goalStatus(o), hidden: !!o.hidden, note: o.note ?? "" })),
          log: q.log.map(l => ({ id: l.id, at: l.at, label: l.label ?? "", text: l.text, players: l.players, author: l.author ?? null })),
        },
      };
    }),
  };
}

/**
 * Session pages and their recaps. The timeline, quotes and GM notes come as extra tabs (`recap-timeline`,
 * `recap-quotes`, `recap-gm-notes`), shared only when RPG Tools shares them. A draft recap is never for players.
 */
export function listRecaps(data: Workspace, campaignId: string, since?: string) {
  const { ids, changed } = changedRows(data, campaignId, ["session"], since);
  return {
    ids,
    recaps: changed.map(e => {
      const row = pageRow(e), r = e.recap, published = !r || r.status === "published";
      const share = (on: boolean | undefined) => (published && on && row.overview.visibility === "players" ? "players" : "gm") as "players" | "gm";
      const extra = r ? [
        ...(r.timeline.length ? [{ id: "recap-timeline", title: "Timeline", visibility: share(r.shareTimeline), text: timelineMarkdown(r.timeline) }] : []),
        ...(r.quotes.length ? [{ id: "recap-quotes", title: "Quotes", visibility: share(r.shareQuotes), text: quotesMarkdown(r.quotes) }] : []),
        ...(r.gmNotes.trim() ? [{ id: "recap-gm-notes", title: "GM notes", visibility: "gm" as const, text: r.gmNotes }] : []),
      ] : [];
      const hide = <T extends { visibility: "players" | "gm" }>(p: T): T => (published ? p : { ...p, visibility: "gm" });
      return { ...row, overview: hide(row.overview), tabs: [...row.tabs.map(hide), ...extra], recap: r ? { status: r.status, playedOn: r.playedOn ?? null } : null };
    }),
  };
}

/** Lines up the sheet's fields with the stat form, and skips the ones the form doesn't have: a bridge never changes the form. */
function onlyMatched(file: ImportFile, data: Workspace, campaignId: string) {
  const form = data.campaigns.find(c => c.id === campaignId)?.statFields ?? [];
  const choice: ImportChoice = {}, skipped: string[] = [];
  for (const p of planFields(file, form)) if (p.action === "new") { choice[p.label] = "skip"; skipped.push(p.label); }
  return { choice, warnings: skipped.length ? [`Not on this campaign’s stat form, so left out: ${skipped.join(", ")}. Add them to the form in RPG Tools to sync them.`] : [] };
}

/** Creates (id null) or updates a character from a sheet. `baseUpdatedAt` is when the table last read it; a newer page is a conflict. */
export function writeCharacter(data: Workspace, campaignId: string, id: string | null, file: ImportFile, opts: { baseUpdatedAt?: string; now?: string; newId?: () => string } = {}) {
  const { campaign } = bookFor(data, campaignId), now = opts.now ?? new Date().toISOString();
  let existing: Entry | undefined;
  if (id !== null) {
    existing = data.entries.find(e => e.id === id && e.kind === "character");
    if (!existing || existing.worldId !== campaign.worldId || !(own(existing, campaignId) || existing.campaignId === null)) throw new BridgeError(404, "That character isn’t in this campaign.");
    if (!own(existing, campaignId)) throw new BridgeError(403, "That character is shared world lore, used by every campaign in the world, so a bridge can’t change it. Change it in RPG Tools.");
    if (opts.baseUpdatedAt && existing.updatedAt && existing.updatedAt !== opts.baseUpdatedAt)
      throw new BridgeError(409, "This character changed in RPG Tools since your table last read it.", { current: readCharacter(data, campaignId, existing.id) });
  }
  const { choice, warnings } = onlyMatched(file, data, campaignId);
  const r = applyImport(data, file, existing ? { kind: "update", entryId: existing.id, campaignId } : { kind: "new", worldId: campaign.worldId, campaignId }, choice, { now, newId: opts.newId });
  // Every field outside the form was skipped, so the form is as it was; keep the campaigns exactly as they were saved.
  const workspace: Workspace = { ...r.workspace, campaigns: data.campaigns };
  return { workspace, id: r.entryId, warnings: [...warnings, ...r.warnings] };
}

const sheetFor = (old: Sheet | undefined, now: string): Sheet => old ?? { source: "import", title: "Imported sheet", linkedBy: "Bridge", readAt: now, mode: "cells", items: [] };
/** Sets current (and maximum) HP on a character's imported sheet, making one when it has none. A linked Google Sheet keeps its own HP. */
export function setHp(data: Workspace, campaignId: string, id: string, input: { value?: unknown; max?: unknown }, now = new Date().toISOString()) {
  const int = (v: unknown, what: string) => { const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN; if (!Number.isInteger(n) || n < -9999 || n > 99999) throw new BridgeError(400, `${what} must be a whole number.`); return n; };
  const value = int(input.value, "value"), max = input.max === undefined || input.max === null ? undefined : int(input.max, "max");
  const { campaign } = bookFor(data, campaignId);
  const e = data.entries.find(x => x.id === id && x.kind === "character" && x.worldId === campaign.worldId);
  if (!e || !(own(e, campaignId) || e.campaignId === null)) throw new BridgeError(404, "That character isn’t in this campaign.");
  if (!own(e, campaignId)) throw new BridgeError(403, "That character is shared world lore, so a bridge can’t change its HP. Change it in RPG Tools.");
  const character = e.character ?? defaultCharacter();
  if (character.sheet && character.sheet.source !== "import") throw new BridgeError(409, "This character’s HP comes from a linked Google Sheet. Change it there, or in RPG Tools.");
  const sheet = sheetFor(character.sheet, now), items = [...sheet.items];
  const put = (kind: "hp" | "maxHp", v: number, name: string) => {
    const i = items.findIndex(x => x.kind === kind);
    if (i >= 0) items[i] = { ...items[i], value: String(v) };
    else items.unshift({ id: newItemId(), name, kind, value: String(v) });
  };
  if (max !== undefined) put("maxHp", max, "Max hit points");
  put("hp", value, "Hit points");
  items.sort((a, b) => (a.kind === "hp" ? 0 : a.kind === "maxHp" ? 1 : 2) - (b.kind === "hp" ? 0 : b.kind === "maxHp" ? 1 : 2));
  const next: Entry = { ...e, character: { ...character, sheet: { ...sheet, items } }, editedBy: undefined, updatedAt: now };
  return { workspace: { ...data, entries: data.entries.map(x => x.id === e.id ? next : x) }, hp: { value, max: max ?? Number(items.find(x => x.kind === "maxHp")?.value ?? value) } };
}

const rollSchema = z.object({
  title: z.string().trim().min(1).max(120), formula: z.string().trim().min(1).max(200), total: z.number().finite(),
  detail: z.string().trim().max(500).optional(), who: z.string().trim().max(80).optional(),
});
/** A roll made at the other table, checked before it goes to Discord: dice the roller understands, and a total. */
export function bridgeRoll(input: unknown) {
  const r = rollSchema.safeParse(input);
  if (!r.success) throw new BridgeError(400, "A roll needs a title, a formula and a total.");
  try { parseDice(r.data.formula); } catch { throw new BridgeError(400, `“${r.data.formula}” isn’t dice RPG Tools can show. Use NdS with + and -, kh/kl, ! for exploding, >=N to count successes, or dF.`); }
  return { kind: "roll" as const, title: r.data.title, formula: r.data.formula.replace(/\s+/g, ""), total: r.data.total, detail: r.data.detail ?? "", ...(r.data.who ? { who: r.data.who } : {}) };
}

export type { SheetFile };
