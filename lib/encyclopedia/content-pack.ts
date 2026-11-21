import { z } from 'zod';
import { calendarSchema, type Calendar } from './calendar-model.ts';
import { campaignSchema, pageTemplateSchema, statFieldSchema, worldSchema, type PageTemplate, type StatField, type Workspace } from './world-model.ts';
import { campaignTables, EXPORT_FORMAT as TABLES_FORMAT, exportTables, importTables, rollLabel, tableSchema, type RandomTable, type TableLibrary } from './tables.ts';
import { maxTieTypes, tieTypeSchema, tieTypesOf, type TieType } from './ties.ts';
import { maxVehicleTypes, vehicleTypeSchema, vehicleTypesOf, type VehicleType } from './vehicles.ts';
import { maxQuestCategories, questCategories, questCategorySchema, type QuestCategory } from './quests.ts';
import { itemSettingsSchema } from './items.ts';
import { KIND_NAMES, templatesFor } from './templates.ts';
import { authoredPack } from './authored-pack.ts';

/**
 * Content packs: reusable things made in one world or campaign, saved as a JSON file and added to another
 * world or campaign (this account or someone else's). Pages are not included; whole campaigns move with the
 * campaign backup ZIP instead.
 *
 * What a pack can hold, and where each goes on import:
 *   tables          random tables (the account's library), used in the open campaign or in every campaign
 *   templates       page templates and the entry types they make, for the open campaign or the whole world
 *   stats           the stat form's stats (open campaign)
 *   calendars       calendars with their events, moons and seasons (open campaign)
 *   questCategories quest categories (open campaign)
 *   tieTypes        the world's own kinds of tie (world)
 *   vehicleTypes    vehicle types (world)
 *   items           coins, weight, item categories and spell names (open campaign, replaced)
 *
 * Everything imported gets new ids, so a pack can be imported again or into several places. Things with the
 * same name as one already there are skipped (stats, quest categories, kinds of tie, vehicle types) or renamed
 * with (2) (tables, templates, calendars).
 */
export const PACK_FORMAT = 'rpg-tools-content';
export const PACK_KINDS = ['tables', 'templates', 'stats', 'calendars', 'questCategories', 'tieTypes', 'vehicleTypes', 'items'] as const;
export type PackKind = typeof PACK_KINDS[number];
export const PACK_KIND_NAMES: Record<PackKind, string> = {
  tables: 'Random tables', templates: 'Templates', stats: 'Character stats', calendars: 'Calendars',
  questCategories: 'Quest categories', tieTypes: 'Kinds of tie', vehicleTypes: 'Vehicle types', items: 'Items and spells settings',
};
/** Kinds that go into a campaign, so a world with no campaign open can't take them. */
export const CAMPAIGN_KINDS: readonly PackKind[] = ['stats', 'calendars', 'questCategories', 'items'];

export const packSchema = z.object({
  format: z.literal(PACK_FORMAT), version: z.literal(1),
  exportedAt: z.string().max(40).optional(),
  from: z.object({ world: z.string().max(200).optional(), campaign: z.string().max(200).optional() }).optional(),
  tables: z.array(tableSchema).max(2000).optional(),
  templates: z.array(pageTemplateSchema).max(60).optional(),
  stats: z.array(statFieldSchema).max(100).optional(),
  calendars: z.array(calendarSchema).max(12).optional(),
  questCategories: z.array(questCategorySchema).max(maxQuestCategories).optional(),
  tieTypes: z.array(tieTypeSchema).max(maxTieTypes).optional(),
  vehicleTypes: z.array(vehicleTypeSchema).max(maxVehicleTypes).optional(),
  items: itemSettingsSchema.optional(),
});
export type ContentPack = z.infer<typeof packSchema>;
export type PackItem = { id: string; name: string; detail: string };
export type PackGroup = { kind: PackKind; items: PackItem[] };
export type Picked = Partial<Record<PackKind, string[]>>;
type Where = { worldId: string; campaignId: string | null };

const ITEMS_ID = 'items';
const lower = (s: string) => s.trim().toLocaleLowerCase();
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Every table, template, stat and so on that the open world or campaign can export. */
export function exportable(data: Workspace, library: TableLibrary, { worldId, campaignId }: Where): ContentPack {
  const world = data.worlds.find(w => w.id === worldId), campaign = campaignId ? data.campaigns.find(c => c.id === campaignId) : undefined;
  const custom = (world?.tieTypes ?? []).filter(t => t.custom);
  return {
    format: PACK_FORMAT, version: 1,
    tables: (({ tables, oracles }) => [...tables, ...oracles])(campaignTables(library, campaignId ?? null)),
    templates: templatesFor(world, campaignId),
    ...(campaign ? {
      stats: (campaign.statFields ?? []).filter(f => !f.archived),
      calendars: campaign.calendars ?? [],
      questCategories: questCategories(campaign),
      ...(campaign.items ? { items: campaign.items } : {}),
    } : {}),
    tieTypes: custom,
    vehicleTypes: world ? vehicleTypesOf(world) : [],
  };
}

/** A pack as rows to tick: one group per kind that has anything. */
export function packGroups(pack: ContentPack): PackGroup[] {
  const rows: Record<PackKind, PackItem[]> = {
    tables: (pack.tables ?? []).map(t => ({ id: t.id, name: t.name, detail: tableDetail(t) })),
    templates: (pack.templates ?? []).map(t => ({ id: t.id, name: t.name, detail: `${KIND_NAMES[t.kind]}${t.fields.length ? ` · ${plural(t.fields.length, 'field')}` : ''}` })),
    stats: (pack.stats ?? []).map(f => ({ id: f.id, name: f.label, detail: f.section || 'No section' })),
    calendars: (pack.calendars ?? []).map(c => ({ id: c.id, name: c.name, detail: `${plural(c.periods.filter(p => p.kind === 'month').length, 'month')} · ${plural(c.events.length, 'event')}` })),
    questCategories: (pack.questCategories ?? []).map(q => ({ id: q.id, name: q.name, detail: '' })),
    tieTypes: (pack.tieTypes ?? []).map(t => ({ id: t.id, name: t.name, detail: t.reverse ? `and ${t.reverse}` : '' })),
    vehicleTypes: (pack.vehicleTypes ?? []).map(t => ({ id: t.id, name: t.name, detail: t.crew })),
    items: pack.items ? [{ id: ITEMS_ID, name: 'Coins, weight and item categories', detail: `${pack.items.coins.map(c => c.abbr).join(', ')} · ${plural(pack.items.categories.length, 'category', 'categories')}` }] : [],
  };
  return PACK_KINDS.map(kind => ({ kind, items: rows[kind] })).filter(g => g.items.length);
}
const tableDetail = (t: RandomTable) => t.kind === 'table' ? `${rollLabel(t)} · ${plural(t.rows?.length ?? 0, 'row')}` : t.kind === 'oracle' ? 'Oracle' : t.kind === 'pair' ? 'Pair' : 'Generator';

/** Tables that the picked ones roll on (pairs, generators, twists), so the file works on its own. */
function tableClosure(tables: RandomTable[], ids: Iterable<string>) {
  const wanted = new Set(ids), have = new Set(tables.map(t => t.id));
  const refs = (t: RandomTable) => [...(t.pair ?? []), ...(t.parts ?? []).map(p => p.tableId), ...(t.extras ?? []).map(p => p.tableId), ...(t.twistTableId ? [t.twistTableId] : [])];
  for (let grew = true; grew;) { grew = false; for (const t of tables) if (wanted.has(t.id)) for (const r of refs(t)) if (have.has(r) && !wanted.has(r)) { wanted.add(r); grew = true; } }
  return wanted;
}
/** Picked tables that are only in the pack because another picked table rolls on them. */
export function tablesNeeded(tables: RandomTable[], picked: string[]) {
  const all = tableClosure(tables, picked), chosen = new Set(picked);
  return tables.filter(t => all.has(t.id) && !chosen.has(t.id));
}

/** The file for the picked things. Links to this campaign (template folders, campaign ids) are left out. */
export function buildPack(data: Workspace, library: TableLibrary, where: Where, picked: Picked, now = new Date().toISOString()): ContentPack {
  const all = exportable(data, library, where), world = data.worlds.find(w => w.id === where.worldId), campaign = where.campaignId ? data.campaigns.find(c => c.id === where.campaignId) : undefined;
  const pick = <T extends { id: string }>(kind: PackKind, list: T[] | undefined) => { const ids = new Set(picked[kind] ?? []); const out = (list ?? []).filter(x => ids.has(x.id)); return out.length ? out : undefined; };
  const tableIds = (picked.tables ?? []).filter(id => all.tables?.some(t => t.id === id));
  const tables = tableIds.length ? exportTables(library, tableIds).tables : undefined;
  const templates = pick('templates', all.templates)?.map(({ campaignId: _c, parentId: _p, ...t }) => t);
  const pack: ContentPack = {
    format: PACK_FORMAT, version: 1, exportedAt: now,
    from: { ...(world ? { world: world.name } : {}), ...(campaign ? { campaign: campaign.name } : {}) },
    ...(tables ? { tables } : {}), ...(templates ? { templates } : {}),
  };
  const rest = { stats: pick('stats', all.stats), calendars: pick('calendars', all.calendars), questCategories: pick('questCategories', all.questCategories), tieTypes: pick('tieTypes', all.tieTypes), vehicleTypes: pick('vehicleTypes', all.vehicleTypes) };
  for (const [k, v] of Object.entries(rest)) if (v) (pack as Record<string, unknown>)[k] = v;
  if (all.items && picked.items?.includes(ITEMS_ID)) pack.items = all.items;
  return packSchema.parse(pack);
}
export const packCount = (pack: ContentPack) => packGroups(pack).reduce((n, g) => n + g.items.length, 0);

/** Reads a file: a content pack (made with Export, by hand or by an AI app), a random tables export or a calendar export. */
export function readPack(raw: unknown): ContentPack {
  // A file written by hand or by an AI app gets its ids and defaults first (authored-pack.ts).
  const input = authoredPack(raw);
  const o = (input && typeof input === 'object' ? input : {}) as { format?: unknown; version?: unknown; tables?: unknown; calendar?: unknown };
  if (o.format === TABLES_FORMAT) return packSchema.parse({ format: PACK_FORMAT, version: 1, tables: z.object({ version: z.literal(1), tables: z.array(tableSchema).max(2000) }).parse(o).tables });
  if (o.format === 'world-manager-calendar' && o.version === 1) return packSchema.parse({ format: PACK_FORMAT, version: 1, calendars: [calendarSchema.parse(o.calendar)] });
  if (o.format === 'maptable-backup' || o.format === 'ttrpg-map') throw Error('That is a map file. Import it on the World maps page.');
  if (o.format !== PACK_FORMAT) throw Error('Choose a content file made with Export content (a .content.json file), or a random tables or calendar export.');
  const parsed = packSchema.safeParse(input);
  if (!parsed.success) { const i = parsed.error.issues[0]; throw Error(`This file could not be read${i ? `: ${i.message}${i.path.length ? ` (at ${i.path.join('.')})` : ''}` : ''}.`); }
  return parsed.data;
}

export type ImportOptions = Where & {
  /** Templates: offered in the open campaign only, or in every campaign of the world. */
  templates: 'campaign' | 'world';
  /** Tables: used in the open campaign only, or in every campaign. */
  tables: 'campaign' | 'all';
};
export type ImportNote = { kind: PackKind; name: string; note: string };
/** What will happen to each thing, before importing: already here, renamed, or too many. */
export function importPreview(data: Workspace, library: TableLibrary, pack: ContentPack, where: Where): Map<string, string> {
  const world = data.worlds.find(w => w.id === where.worldId), campaign = where.campaignId ? data.campaigns.find(c => c.id === where.campaignId) : undefined;
  const out = new Map<string, string>(), key = (k: PackKind, id: string) => `${k}:${id}`;
  const has = (names: Iterable<string>) => { const s = new Set([...names].map(lower)); return (n: string) => s.has(lower(n)); };
  const tableHere = has(library.tables.map(t => t.name)), templateHere = has((world?.templates ?? []).map(t => t.name)), calendarHere = has((campaign?.calendars ?? []).map(c => c.name));
  const statHere = has((campaign?.statFields ?? []).filter(f => !f.archived).map(f => f.label)), questHere = has(questCategories(campaign).map(q => q.name));
  const tieHere = has(tieTypesOf(world).map(t => t.name)), vehicleHere = has(vehicleTypesOf(world).map(t => t.name));
  const renamed = (name: string) => `Name in use: added as “${name} (2)”`;
  for (const t of pack.tables ?? []) if (tableHere(t.name)) out.set(key('tables', t.id), renamed(t.name));
  for (const t of pack.templates ?? []) if (templateHere(t.name)) out.set(key('templates', t.id), renamed(t.name));
  for (const c of pack.calendars ?? []) if (calendarHere(c.name)) out.set(key('calendars', c.id), renamed(c.name));
  for (const f of pack.stats ?? []) if (statHere(f.label)) out.set(key('stats', f.id), 'Already here: skipped');
  for (const q of pack.questCategories ?? []) if (questHere(q.name)) out.set(key('questCategories', q.id), 'Already here: skipped');
  for (const t of pack.tieTypes ?? []) if (tieHere(t.name)) out.set(key('tieTypes', t.id), 'Already here: skipped');
  for (const t of pack.vehicleTypes ?? []) if (vehicleHere(t.name)) out.set(key('vehicleTypes', t.id), 'Already here: skipped');
  if (pack.items && campaign?.items) out.set(key('items', ITEMS_ID), 'Replaces this campaign’s settings');
  return out;
}
export const previewKey = (k: PackKind, id: string) => `${k}:${id}`;

function freeName(name: string, taken: Set<string>, max: number) {
  let out = name;
  for (let n = 2; taken.has(lower(out)); n++) { const tail = ` (${n})`; out = name.slice(0, max - tail.length) + tail; }
  taken.add(lower(out));
  return out;
}

/**
 * Adds the picked things from a pack to the open world or campaign. Returns the new workspace, the new table
 * library (null when no tables were imported) and a line per kind of what was added and skipped.
 */
export function importPack(data: Workspace, library: TableLibrary, pack: ContentPack, picked: Picked, opts: ImportOptions, newId: () => string, now = new Date().toISOString()) {
  const world = data.worlds.find(w => w.id === opts.worldId);
  if (!world) throw Error('Open a world first.');
  const campaign = opts.campaignId ? data.campaigns.find(c => c.id === opts.campaignId && c.worldId === world.id) : undefined;
  const chosen = <T extends { id: string }>(kind: PackKind, list: T[] | undefined) => { const ids = new Set(picked[kind] ?? []); return (list ?? []).filter(x => ids.has(x.id)); };
  if (!campaign && CAMPAIGN_KINDS.some(k => (picked[k] ?? []).length)) throw Error(`Open a campaign to import ${CAMPAIGN_KINDS.filter(k => (picked[k] ?? []).length).map(k => PACK_KIND_NAMES[k].toLocaleLowerCase()).join(', ')}.`);
  const summary: string[] = [];
  const report = (kind: PackKind, added: number, skipped: number) => { if (added || skipped) summary.push(`${PACK_KIND_NAMES[kind]}: ${added} added${skipped ? `, ${skipped} already here` : ''}`); };
  let nextWorld = { ...world }, nextCampaign = campaign ? { ...campaign } : undefined, nextLibrary: TableLibrary | null = null;

  // Tables, with any tables they roll on.
  const tableIds = tableClosure(pack.tables ?? [], picked.tables ?? []);
  const tables = (pack.tables ?? []).filter(t => tableIds.has(t.id));
  if (tables.length) {
    const scope = opts.tables === 'campaign' && campaign ? [campaign.id] : null;
    const r = importTables(library, { format: TABLES_FORMAT, version: 1, tables }, scope, newId, now);
    nextLibrary = r.library; report('tables', r.added, 0);
  }

  // Stats first, so templates can keep their stat order. A stat with a name already here is the same stat.
  const statIds = new Map<string, string>();
  const stats = chosen('stats', pack.stats);
  if (stats.length && nextCampaign) {
    const have = nextCampaign.statFields ?? [], byName = new Map(have.filter(f => !f.archived).map(f => [lower(f.label), f.id]));
    const added: StatField[] = [];
    for (const f of stats) { const same = byName.get(lower(f.label)); if (same) { statIds.set(f.id, same); continue; } const id = newId(); statIds.set(f.id, id); byName.set(lower(f.label), id); added.push({ ...f, id }); }
    if (have.length + added.length > 100) throw Error(`A campaign holds up to 100 stats, and this would make ${have.length + added.length}.`);
    nextCampaign.statFields = [...have, ...added]; report('stats', added.length, stats.length - added.length);
  }
  for (const f of nextCampaign?.statFields ?? []) if (!statIds.has(f.id)) statIds.set(f.id, f.id);

  const templates = chosen('templates', pack.templates);
  if (templates.length) {
    const have = world.templates ?? [], taken = new Set(have.map(t => lower(t.name)));
    if (have.length + templates.length > 60) throw Error(`A world holds up to 60 templates, and this would make ${have.length + templates.length}.`);
    const remap = (ids?: string[]) => ids?.map(id => statIds.get(id)).filter((x): x is string => !!x);
    // A sheet template (a file with its own stats): the campaign's other stats start switched off on it, so a D&D sheet
    // doesn't pick up another game's stats already on the form. They can be switched on in the template.
    const ownStats = new Set(stats.map(f => statIds.get(f.id)).filter((x): x is string => !!x));
    const others = ownStats.size ? (nextCampaign?.statFields ?? []).filter(f => !f.archived && !ownStats.has(f.id)).map(f => f.id) : [];
    const added: PageTemplate[] = templates.map(({ campaignId: _c, parentId: _p, stats: st, ...t }) => {
      const order = st?.order ? remap(st.order) : undefined, off = [...new Set([...(remap(st?.off) ?? []), ...(t.kind === 'character' && st?.order ? others.filter(id => !order?.includes(id)) : [])])];
      return {
        ...t, id: newId(), name: freeName(t.name, taken, 160), updatedAt: now,
        ...(opts.templates === 'campaign' && campaign ? { campaignId: campaign.id } : {}),
        ...(order?.length || off.length ? { stats: { ...(order?.length ? { order } : {}), ...(off.length ? { off } : {}) } } : {}),
      };
    });
    nextWorld.templates = [...have, ...added]; report('templates', added.length, 0);
  }

  const calendars = chosen('calendars', pack.calendars);
  if (calendars.length && nextCampaign) {
    const have = nextCampaign.calendars ?? [], taken = new Set(have.map(c => lower(c.name)));
    if (have.length + calendars.length > 12) throw Error(`A campaign holds up to 12 calendars, and this would make ${have.length + calendars.length}.`);
    const added: Calendar[] = calendars.map(c => ({ ...c, id: newId(), name: freeName(c.name, taken, 100), visibility: 'gm', events: c.events.map(e => ({ ...e, id: newId(), visibility: 'gm' })) }));
    nextCampaign.calendars = [...have, ...added]; report('calendars', added.length, 0);
  }

  const quests = chosen('questCategories', pack.questCategories);
  if (quests.length && nextCampaign) {
    const have = questCategories(nextCampaign), names = new Set(have.map(q => lower(q.name)));
    const added: QuestCategory[] = [];
    for (const q of quests) if (!names.has(lower(q.name))) { names.add(lower(q.name)); added.push({ ...q, id: newId() }); }
    if (have.length + added.length > maxQuestCategories) throw Error(`A campaign holds up to ${maxQuestCategories} quest categories, and this would make ${have.length + added.length}.`);
    if (added.length) nextCampaign.questCategories = [...have, ...added];
    report('questCategories', added.length, quests.length - added.length);
  }

  const ties = chosen('tieTypes', pack.tieTypes);
  if (ties.length) {
    const names = new Set(tieTypesOf(world).map(t => lower(t.name))), have = world.tieTypes ?? [];
    const added: TieType[] = [];
    for (const t of ties) if (!names.has(lower(t.name))) { names.add(lower(t.name)); added.push({ ...t, id: newId(), custom: true }); }
    if (have.length + added.length > maxTieTypes) throw Error(`A world holds up to ${maxTieTypes} kinds of tie, and this would make ${have.length + added.length}.`);
    if (added.length) nextWorld.tieTypes = [...have, ...added];
    report('tieTypes', added.length, ties.length - added.length);
  }

  const vehicles = chosen('vehicleTypes', pack.vehicleTypes);
  if (vehicles.length) {
    const have = vehicleTypesOf(world), names = new Set(have.map(t => lower(t.name)));
    const added: VehicleType[] = [];
    for (const t of vehicles) if (!names.has(lower(t.name))) { names.add(lower(t.name)); added.push({ ...t, id: newId() }); }
    if (have.length + added.length > maxVehicleTypes) throw Error(`A world holds up to ${maxVehicleTypes} vehicle types, and this would make ${have.length + added.length}.`);
    if (added.length) nextWorld.vehicleTypes = [...have, ...added];
    report('vehicleTypes', added.length, vehicles.length - added.length);
  }

  if (pack.items && picked.items?.includes(ITEMS_ID) && nextCampaign) { nextCampaign.items = pack.items; summary.push(`${PACK_KIND_NAMES.items}: replaced`); }

  nextWorld = worldSchema.parse(nextWorld);
  if (nextCampaign) nextCampaign = campaignSchema.parse(nextCampaign);
  const next: Workspace = {
    ...data,
    worlds: data.worlds.map(w => w.id === world.id ? nextWorld : w),
    campaigns: nextCampaign ? data.campaigns.map(c => c.id === nextCampaign!.id ? nextCampaign! : c) : data.campaigns,
  };
  return { data: next, library: nextLibrary, summary, changedWorkspace: JSON.stringify(next) !== JSON.stringify(data) };
}

/** A file name from a world or campaign name. */
export const packFileName = (name: string) => `${name.replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'content'}.content.json`;
