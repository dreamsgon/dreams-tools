import { defaultCharacterLayout } from "./character-profile.ts";
import { templateKinds, hideableTabIds } from "./world-model.ts";
import { maxTrackers, maxTrackerPips, maxTrackerValue, trackerColours } from "./trackers.ts";

/**
 * Content files written by hand or by an AI app (see sheet-template.ts) leave out the parts the app would fill in: ids,
 * updatedAt, visibility, empty lists. authoredPack() fills them in so the file reads like one made with Export, before
 * packSchema checks it. Files made with Export already have everything and pass through unchanged in meaning.
 *
 * It also takes the shortcuts the guide offers: tabs and Profile facts as plain names, trackers without ids or values,
 * field and stat types by their everyday names (dropdown, checkbox, yes/no), and a template's stat order by stat name.
 * A character template with no stat order in a file that has stats uses all of the file's stats, in file order.
 */
const FORMAT = "rpg-tools-content";
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown) => typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
const goodId = (v: unknown) => typeof v === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
const slug = (s: string) => s.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").replace(/_+/g, "_").toLowerCase().slice(0, 60) || "x";
const lower = (s: string) => s.trim().toLocaleLowerCase();

/** Gives each item a usable id that is unique in its list: its own, else one made from its name. */
function withIds<T extends Obj>(items: T[], nameOf: (x: T) => string, prefix: string): T[] {
  const taken = new Set<string>();
  return items.map((x, i) => {
    let id = goodId(x.id) && !taken.has(x.id as string) ? x.id as string : slug(nameOf(x) || `${prefix}-${i + 1}`);
    for (let n = 2; taken.has(id); n++) id = `${id.replace(/-\d+$/, "")}-${n}`;
    taken.add(id);
    return { ...x, id };
  });
}
const visibility = (v: unknown, fallback: "gm" | "players") => { const t = lower(text(v)); return t === "gm" || t === "gm only" || t === "hidden" ? "gm" : t === "players" || t === "player" || t === "shown" ? "players" : fallback; };
const list = (v: unknown) => Array.isArray(v) ? v : [];
const strings = (v: unknown) => list(typeof v === "string" ? v.split(",") : v).map(text).filter(Boolean);

const STAT_TYPES: Record<string, string> = { text: "text", number: "number", textarea: "textarea", longtext: "textarea", "long text": "textarea", checkbox: "checkbox", boolean: "checkbox", check: "checkbox", "yes/no": "checkbox", select: "select", dropdown: "select", choice: "select", none: "none", roll: "none", rolls: "none" };
const FIELD_TYPES: Record<string, string> = { text: "text", number: "number", choice: "choice", select: "choice", dropdown: "choice", page: "page", textarea: "textarea", longtext: "textarea", "long text": "textarea", score: "score", track: "track", "current/max": "track", multi: "multi", "several choices": "multi", check: "check", checkbox: "check", boolean: "check", "yes/no": "check", url: "url", link: "url", "web link": "url" };

function stat(raw: Obj): Obj {
  const type = STAT_TYPES[lower(text(raw.type))] ?? (strings(raw.options).length ? "select" : "number");
  const rolls = Array.isArray(raw.rolls) ? raw.rolls.filter(isObj).map(r => ({ ...r, name: text(r.name) || "Roll", formula: text(r.formula) })) : undefined;
  return {
    ...raw, label: text(raw.label) || text(raw.name), section: text(raw.section), type,
    options: strings(raw.options), visibility: visibility(raw.visibility, "players"), archived: raw.archived === true,
    ...(rolls ? { rolls } : {}),
  };
}

function field(raw: Obj): Obj {
  const type = FIELD_TYPES[lower(text(raw.type))] ?? "text";
  const options = strings(raw.options);
  return { ...raw, label: text(raw.label) || text(raw.name), type, visibility: visibility(raw.visibility, "players"), ...(options.length ? { options } : {}), ...(type === "score" && raw.mod !== "typed" ? { mod: "d20" } : {}) };
}

function tracker(raw: unknown, i: number): Obj | null {
  const o = isObj(raw) ? raw : { label: text(raw) };
  const label = text(o.label) || text(o.name);
  if (!label) return null;
  const max = Math.max(1, Math.min(maxTrackerValue, Math.round(Number(o.max) || 1)));
  const shape = o.shape === "pips" && max <= maxTrackerPips ? "pips" : o.shape === "bar" || max > maxTrackerPips ? "bar" : max <= 6 ? "pips" : "bar";
  const colour = trackerColours.includes(o.colour as never) ? o.colour : trackerColours[i % trackerColours.length];
  const value = Number.isFinite(Number(o.value)) && o.value !== undefined && o.value !== null && o.value !== "" ? Math.max(0, Math.min(max, Math.round(Number(o.value)))) : max;
  return { ...o, label: label.slice(0, 40), shape, colour, max, value, ...(o.gm === true || visibility(o.visibility, "players") === "gm" ? { gm: true } : {}) };
}

function layout(raw: unknown): Obj | undefined {
  if (!isObj(raw)) return undefined;
  const base = defaultCharacterLayout();
  const facts = list(raw.facts).map(f => isObj(f) ? { ...f, label: text(f.label) || text(f.name) } : { label: text(f) }).filter(f => f.label);
  const bar = isObj(raw.bar) ? { ...base.bar, ...raw.bar, fields: withIds(list(raw.bar.fields).map(f => isObj(f) ? { ...f, label: text(f.label) || text(f.name) } : { label: text(f) }).filter(f => f.label), f => f.label, "bar") } : base.bar;
  return {
    ...raw,
    blocks: Array.isArray(raw.blocks) ? withIds(raw.blocks.filter(isObj).map((b): Obj => ({ column: "left", ...b, title: text(b.title) })), b => `${text(b.kind)}-${text(b.title)}`, "block") : base.blocks,
    bar: { ...bar, title: text(bar.title) || base.bar.title },
    ...(facts.length ? { facts: withIds(facts.slice(0, 40), f => f.label, "fact") } : { facts: undefined }),
  };
}

export function authoredPack(input: unknown): unknown {
  if (!isObj(input)) return input;
  const o: Obj = { ...input };
  if (o.format === undefined && (Array.isArray(o.templates) || Array.isArray(o.stats))) { o.format = FORMAT; o.version = 1; }
  if (o.format !== FORMAT) return input;
  if (o.version === undefined || o.version === "1") o.version = 1;
  const now = new Date().toISOString();

  const statIdByName = new Map<string, string>();
  if (Array.isArray(o.stats)) {
    const stats = withIds(o.stats.filter(isObj).map(stat), s => text(s.label), "stat");
    for (const s of stats) if (!statIdByName.has(lower(text(s.label)))) statIdByName.set(lower(text(s.label)), s.id as string);
    o.stats = stats;
  }
  const statIds = new Set(statIdByName.values());
  const statRef = (v: unknown) => { const t = text(v); return statIds.has(t) ? t : statIdByName.get(lower(t)); };
  const refs = (v: unknown) => [...new Set(list(v).map(statRef).filter((x): x is string => !!x))];

  if (Array.isArray(o.templates)) {
    o.templates = withIds(o.templates.filter(isObj).map(t => {
      const kind = templateKinds.includes(t.kind as never) ? t.kind : "character";
      const tabs = list(t.tabs).map(x => isObj(x) ? { title: text(x.title) || text(x.name), visibility: visibility(x.visibility, "players") } : { title: text(x), visibility: "players" }).filter(x => x.title);
      const out: Obj = {
        ...t, name: text(t.name) || text(t.title) || "Imported template", kind,
        fields: withIds(list(t.fields).filter(isObj).map(field), f => text(f.label), "field"),
        tabs, body: typeof t.body === "string" ? t.body : "", updatedAt: typeof t.updatedAt === "string" && !Number.isNaN(Date.parse(t.updatedAt)) ? t.updatedAt : now,
      };
      if (t.overviewVisibility !== undefined) out.overviewVisibility = visibility(t.overviewVisibility, "players");
      if (t.hiddenTabs !== undefined) { const h = strings(t.hiddenTabs).map(lower).filter(x => hideableTabIds.includes(x as never)); if (h.length) out.hiddenTabs = [...new Set(h)]; else delete out.hiddenTabs; }
      if (kind === "character") {
        if (t.layout !== undefined) { const l = layout(t.layout); if (l) out.layout = l; else delete out.layout; }
        if (t.trackers !== undefined) { const tr = list(t.trackers).map(tracker).filter((x): x is Obj => !!x).slice(0, maxTrackers); if (tr.length) out.trackers = withIds(tr, x => text(x.label), "tracker"); else delete out.trackers; }
        if (isObj(t.stats)) { const order = refs(t.stats.order), off = refs(t.stats.off); out.stats = { ...(order.length ? { order } : {}), ...(off.length ? { off } : {}) }; }
        else if (statIds.size) out.stats = { order: [...statIds] };
      }
      return out;
    }), t => text(t.name), "template");
  }
  return o;
}
