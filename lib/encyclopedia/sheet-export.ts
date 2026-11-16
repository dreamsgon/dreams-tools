import { NOT_IMPORTED_TAB, SHEET_FORMAT, type ImportFile } from "./sheet-import.ts";
import { sheetRollGroups } from "./sheet-rolls.ts";
import type { SheetItem } from "./sheet-link.ts";
import { formatMoney, itemSettingsOf } from "./items.ts";
import type { Entry, StatField, Workspace } from "./world-model.ts";

/*
 * Exporting a character in the RPG Tools sheet format (rpgtools-sheet, version 1), the same file the sheet import reads,
 * so a character can go to another campaign, another account or, later, a VTT bridge. It is the import run backwards:
 * stat form values become fields, trackers gauges, the sheet's HP, AC, initiative and rolls the core and rolls, tabs
 * lists, Profile traits traits, and the page text notes. Importing the file again gives the same page.
 *
 * "players" leaves out everything a player of the campaign couldn't see on the page: GM-only fields, trackers, tabs,
 * traits and text, the stats and sheet when the Stats tab is GM only, and the Not imported tab. Pure.
 */

export type ExportAudience = "gm" | "players";
export type SheetFile = { format: typeof SHEET_FORMAT; version: 1 } & Omit<ImportFile, "format" | "version">;
export type ExportResult = { file: SheetFile; warnings: string[] };

const maxListText = 2000, maxNotes = 20000;
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const typeWords: Record<StatField["type"], ImportFile["fields"][number]["type"]> = { number: "number", text: "text", textarea: "longtext", checkbox: "checkbox", select: "choice" };
const int = (v: string | undefined) => { const n = Number(String(v ?? "").replace(/,/g, "").trim()); return Number.isFinite(n) && String(v ?? "").trim() !== "" ? Math.round(n) : undefined; };
const cut = (s: string, n: number, what: string, warnings: string[]) => {
  if (s.length <= n) return s;
  warnings.push(`${what} was cut to ${n.toLocaleString("en")} characters.`);
  return s.slice(0, n);
};

/** What a stat form field's roll looks like in the file ("d20", "self" or a formula with {value}). */
export function fileRollOf(f: Pick<StatField, "roll" | "rollFormula">): string | undefined {
  if (f.roll === "d20") return "d20";
  if (f.roll === "formula") return "self";
  if (f.roll === "custom" && f.rollFormula) return f.rollFormula;
  return undefined;
}

type ListItem = ImportFile["lists"][number]["items"][number];
const BULLET = /^\s*[-*+]\s+(.*)$/;
/**
 * A tab's text as list items. Bullets the import wrote ("- **Longbow** × 1 (2/3 per long rest) · equipped: text") come
 * back as they were; other bullets become items named by their bold part or the text before a colon; lines under a
 * bullet join its text. A tab with no bullets is one item named after the tab.
 */
export function tabItems(title: string, body: string): ListItem[] {
  const lines = body.split(/\r?\n/), items: ListItem[] = [];
  if (!lines.some(l => BULLET.test(l))) return body.trim() ? [{ name: title.slice(0, 120), text: body.trim() }] : [];
  for (const line of lines) {
    const m = BULLET.exec(line);
    if (!m) { const last = items[items.length - 1]; if (last && line.trim()) last.text = [last.text, line.trim()].filter(Boolean).join("\n"); continue; }
    let rest = m[1].trim(), name: string, text: string | undefined;
    const bold = /^\*\*(.+?)\*\*(.*)$/.exec(rest);
    if (bold) {
      name = bold[1].trim(); rest = bold[2];
      const colon = rest.indexOf(":");
      const extras = colon >= 0 ? rest.slice(0, colon) : rest;
      text = colon >= 0 ? rest.slice(colon + 1).trim() : undefined;
      const item: ListItem = { name };
      const q = /×\s*(\d+)/.exec(extras), u = /\((\d+)\s*\/\s*(\d+)(?:\s+per\s+([^)]+))?\)/.exec(extras);
      if (q) item.quantity = Number(q[1]);
      if (u) item.uses = { value: Number(u[1]), max: Number(u[2]), ...(u[3] ? { per: u[3].trim() } : {}) };
      if (/·\s*equipped/.test(extras)) item.equipped = true;
      if (text) item.text = text;
      items.push(item);
      continue;
    }
    const colon = rest.indexOf(": ");
    if (colon > 0 && colon <= 120) { name = rest.slice(0, colon).trim(); text = rest.slice(colon + 2).trim(); }
    else { name = rest.length <= 120 ? rest : rest.slice(0, 117).trimEnd() + "…"; text = rest.length <= 120 ? undefined : rest; }
    items.push({ name: name || "Item", ...(text ? { text } : {}) });
  }
  return items;
}

const groupOf = { Skills: "skills", Saves: "saves", Attacks: "attacks", Other: "other" } as const;

/** The character page as an RPG Tools sheet. `campaignId` picks the stat form and values; `audience` "players" leaves out what players can't see. */
export function exportSheet(s: Workspace, entryId: string, opts: { campaignId: string; audience?: ExportAudience; now?: string }): ExportResult {
  const e: Entry | undefined = s.entries.find(x => x.id === entryId && x.kind === "character");
  if (!e) throw new Error("That character is gone.");
  const campaign = s.campaigns.find(c => c.id === opts.campaignId);
  if (!campaign) throw new Error("Choose a campaign to export from.");
  const players = opts.audience === "players", now = opts.now ?? new Date().toISOString(), warnings: string[] = [];
  const ch = e.character, statsShown = !players || ch?.statsVisibility === "players";
  const shown = <T extends { visibility?: string; gm?: boolean }>(x: T) => !players || (x.visibility ? x.visibility === "players" : !x.gm);

  // Fields: the campaign's stat form with this character's values. Empty values are left out.
  const values = ch?.statsByCampaign[campaign.id] ?? {};
  const fields: SheetFile["fields"] = [];
  if (statsShown) for (const f of campaign.statFields ?? []) {
    if (f.archived || !shown(f)) continue;
    const v = values[f.id];
    if (v === undefined || v === null || v === "") continue;
    const roll = fileRollOf(f);
    fields.push({ section: f.section || undefined, label: f.label, type: typeWords[f.type], value: v, options: f.type === "select" ? f.options : [], ...(roll ? { roll } : {}), visibility: f.visibility });
  }

  // The sheet: HP, AC, initiative and speed to core; rolls by their groups ("X attack" and "X damage" as one attack).
  const sheet = statsShown ? ch?.sheet : undefined, items = sheet?.items ?? [], imported = sheet?.source === "import";
  const find = (kind: SheetItem["kind"]) => items.find(i => i.kind === kind);
  const hp = find("hp"), maxHp = find("maxHp"), ac = find("ac"), init = find("init"), speed = items.find(i => i.kind === "stat" && key(i.name) === "speed");
  const core: NonNullable<SheetFile["core"]> = {};
  const hpValue = int(hp?.value), hpMax = int(maxHp?.value) ?? hpValue;
  if (hp && hpValue !== undefined && hpMax !== undefined) core.hp = { value: hpValue, max: hpMax, label: hp.label ?? hp.name };
  const acValue = int(ac?.value);
  if (ac && acValue !== undefined) core.ac = { value: acValue, label: ac.label ?? ac.name };
  if (init) {
    const bonus = /^([+-])?\s*(\d{1,3})$/.exec(init.value?.trim() ?? "");
    const formula = init.formula?.replace(/\s+/g, "") || (bonus ? `1d20${bonus[1] ?? "+"}${bonus[2]}` : "");
    if (formula) core.initiative = { formula, label: init.label ?? init.name };
  }
  if (speed?.value) core.speed = speed.value.slice(0, 60);
  for (const i of items) {
    if (i.kind !== "stat" || i === speed || !i.value) continue;
    if (fields.some(f => key(f.label) === key(i.name))) continue;
    const n = Number(i.value.trim());
    fields.push({ section: sheet?.title.slice(0, 100), label: i.name, type: Number.isFinite(n) && i.value.trim() !== "" ? "number" : "text", value: Number.isFinite(n) && i.value.trim() !== "" ? n : i.value, options: [], ...(players ? { visibility: "players" as const } : {}) });
  }
  const byId = new Map(items.map(i => [i.id, i]));
  const rolls: SheetFile["rolls"] = [];
  for (const g of sheetRollGroups({ items })) for (const row of g.rows) {
    const buttons = row.buttons.filter(b => byId.get(b.itemId)?.kind === "roll");
    if (!buttons.length) continue;
    const note = imported ? buttons.map(b => byId.get(b.itemId)?.value).find(Boolean) : undefined;
    const attack = buttons.find(b => b.label === "Attack"), damage = buttons.find(b => b.label === "Damage");
    if (attack || damage) rolls.push({ name: row.name, group: "attacks", ...(attack ? { attack: attack.formula } : {}), ...(damage ? { damage: damage.formula } : {}), ...(note ? { notes: note } : {}) });
    else rolls.push({ name: row.name, group: groupOf[g.title], formula: buttons[0].formula, ...(note ? { notes: note } : {}) });
  }

  // Trackers to gauges, tabs to lists, the Not imported tab back to unmapped and conditions.
  const gauges: SheetFile["gauges"] = (ch?.trackers ?? []).filter(t => statsShown && shown(t)).map(t => ({ label: t.label, value: t.value, max: t.max, shape: t.shape, colour: t.colour, visibility: t.gm ? "gm" as const : "players" as const }));
  const lists: SheetFile["lists"] = [], unmapped: string[] = [], conditions: string[] = [];
  for (const t of e.tabs ?? []) {
    if (!shown(t)) continue;
    if (t.title.toLowerCase() === NOT_IMPORTED_TAB.toLowerCase()) {
      for (const raw of t.body.split(/\r?\n/)) {
        const line = BULLET.exec(raw)?.[1].trim();
        if (!line) continue;
        const cond = /^Conditions:\s*(.+)$/i.exec(line);
        if (cond) conditions.push(...cond[1].split(",").map(c => c.trim()).filter(Boolean));
        else unmapped.push(line.slice(0, 300));
      }
      continue;
    }
    if (lists.length >= 12) { warnings.push(`A sheet holds 12 lists, so the “${t.title}” tab was left out.`); continue; }
    const listItems = tabItems(t.title, t.body).slice(0, 200).map(it => it.text ? { ...it, text: cut(it.text, maxListText, `“${it.name}” in the ${t.title} tab`, warnings) } : it);
    if (listItems.length) lists.push({ title: t.title.slice(0, 60), visibility: t.visibility, items: listItems });
  }

  // The Inventory and Spells tabs as lists, and the money.
  const setup = itemSettingsOf(campaign), inv = ch?.inventory, invShown = !!inv && (!players || inv.visibility === "players");
  if (invShown && inv!.items.length && lists.length < 12) lists.push({ title: "Inventory", visibility: inv!.visibility ?? "gm", items: inv!.items.filter(i => !players || !i.gm).slice(0, 200).map(i => ({ name: i.name.slice(0, 120), ...(i.note ? { text: cut(i.note, maxListText, `“${i.name}” in the inventory`, warnings) } : {}), quantity: i.qty, ...(i.uses ? { uses: i.uses } : {}), ...(i.equipped ? { equipped: true } : {}), ...(i.weight !== undefined ? { weight: i.weight } : {}), ...(i.price !== undefined ? { value: formatMoney(i.price, setup.coins).slice(0, 40) } : {}) })) });
  const spellsShown = !!ch?.spells?.length && (!players || ch.spellsVisibility === "players");
  if (spellsShown && lists.length < 12) lists.push({ title: setup.spells.tab.slice(0, 60), visibility: ch!.spellsVisibility ?? "gm", items: ch!.spells!.filter(x => !players || !x.gm).slice(0, 200).map(x => { const details = setup.spells.columns.map(c => x.details?.[c]).filter(Boolean).join(" · "), rolls = (x.rolls ?? []).map(r => `[[${r.formula}|${r.name}]]`).join(" "), text = [details, x.text, rolls].filter(Boolean).join("\n"); return { name: x.name.slice(0, 120), ...(text ? { text: cut(text, maxListText, `“${x.name}”`, warnings) } : {}) }; }) });
  const money = invShown && inv!.coins ? formatMoney(inv!.coins, setup.coins).slice(0, 60) : undefined;

  const profileShown = !!e.profile && (!players || e.profile.visibility === "players");
  const traits = profileShown ? e.profile!.traits.filter(t => !players || !t.gm).map(t => t.label.slice(0, 30)).slice(0, 12) : [];
  const bodyShown = !players || e.overviewVisibility === "players";
  const notes = bodyShown && e.body.trim() ? cut(e.body.trim(), maxNotes, "The page text", warnings) : undefined;
  const system = imported && sheet?.title && sheet.title !== "Imported sheet" ? sheet.title.replace(/ sheet$/, "").slice(0, 100) : undefined;

  const file: SheetFile = {
    format: SHEET_FORMAT, version: 1,
    ...(system ? { system } : {}),
    name: e.title,
    role: ch?.role ?? "pc",
    tags: (ch?.tags ?? []).slice(0, 30),
    traits,
    ...(ch?.location ? { location: ch.location } : {}),
    ...(ch?.faction ? { faction: ch.faction } : {}),
    ...(Object.keys(core).length ? { core } : {}),
    fields: fields.slice(0, 100),
    gauges,
    rolls: rolls.slice(0, 150),
    lists,
    conditions: players ? [] : conditions.slice(0, 30),
    ...(money ? { money } : {}),
    ...(notes ? { notes } : {}),
    unmapped: players ? [] : unmapped.slice(0, 50),
    source: { from: `RPG Tools (${campaign.name})`.slice(0, 120), filledBy: "RPG Tools", date: now.slice(0, 10) },
  };
  if (fields.length > 100) warnings.push(`A sheet holds 100 fields, so ${fields.length - 100} were left out.`);
  if (rolls.length > 150) warnings.push(`A sheet holds 150 rolls, so ${rolls.length - 150} were left out.`);
  if (players && !statsShown && (ch?.sheet || (ch?.trackers?.length ?? 0) || Object.keys(values).length)) warnings.push("This character’s Stats tab is GM only, so its stats, trackers and sheet were left out of the players’ copy.");
  return { file, warnings };
}

/** The file as text, without empty optional parts. */
export const sheetFileText = (f: SheetFile) => JSON.stringify(f, (_k, v) => v === undefined ? undefined : v, 2) + "\n";
/** A download name such as maren-ashford.rpgtools-sheet.json. */
export const sheetFileName = (name: string) => `${name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "character"}.rpgtools-sheet.json`;
