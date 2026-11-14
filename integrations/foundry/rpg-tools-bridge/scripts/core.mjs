/*
 * RPG Tools Bridge, the part without Foundry: talking to the bridge API, turning an RPG Tools sheet into actor data,
 * and turning Foundry rolls into RPG Tools rolls. Nothing here touches Foundry's globals, so it runs in Node tests
 * (tests/foundry-bridge.test.mjs in the RPG Tools repository).
 */
export const MODULE_ID = "rpg-tools-bridge";

// ---- Dice ----------------------------------------------------------------------------------------

/** RPG Tools dice to Foundry dice: ! explodes (x in Foundry), >=N after dice counts successes (cs>=N). */
export function toFoundryFormula(formula) {
  return String(formula ?? "").replace(/\s+/g, "")
    .replace(/(\d*d(?:\d+|f))((?:k[hl]?\d*)?)!/gi, "$1$2x")
    .replace(/(\d*d\d+(?:k[hl]?\d*|x\d*)*)(>=|<=|>|<|=)(\d+)/gi, "$1cs$2$3");
}

/** Foundry dice to RPG Tools dice, or null when the roll uses something RPG Tools can't show (rerolls, pools, variables). */
export function fromFoundryFormula(formula) {
  let f = String(formula ?? "").replace(/\[[^\]]*\]/g, "").replace(/\s+/g, "").toLowerCase();
  f = f.replace(/(\d*d\d+)x(\d*)/g, (_m, die) => `${die}!`)
    .replace(/(\d*d\d+(?:k[hl]?\d*|!)*)cs(>=|<=|>|<|=)(\d+)/g, "$1$2$3")
    .replace(/(\d*d\d+)k(\d)/g, "$1kh$2")
    .replace(/^\+/, "");
  if (!f || f.length > 200 || !/d/.test(f) || !/^[0-9df+\-khl!<>=]+$/.test(f)) return null;
  return f;
}

// ---- Actors --------------------------------------------------------------------------------------

/** Where each game system keeps HP and AC. Other systems get the actor and its rolls, without HP or AC. */
export const systemPaths = {
  dnd5e: { hp: "system.attributes.hp.value", maxHp: "system.attributes.hp.max", ac: "system.attributes.ac.flat", acCalc: "system.attributes.ac.calc", bio: "system.details.biography.value" },
  pf2e: { hp: "system.attributes.hp.value", maxHp: null, ac: null, acCalc: null, bio: null },
};
export const pathsFor = systemId => systemPaths[systemId] ?? null;

/** The actor type for an RPG Tools role in this system: "character" for player characters, "npc" for the rest, when the system has them. */
export function actorType(role, types) {
  const list = (types ?? []).filter(t => t !== "base");
  const want = role === "pc" || role === "companion" ? "character" : "npc";
  return list.includes(want) ? want : list.includes("character") ? "character" : list[0] ?? "character";
}

const escape = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Page text (RPG Tools Markdown) as simple HTML: paragraphs, bold, italics, bullets, inline rolls as Foundry inline rolls, and page links as their label. */
export function markdownToHtml(text) {
  const isDice = s => /d/i.test(s) && /^[\d\s+\-dDfFkKhHlL!<>=]+$/.test(s);
  // Inline rolls and page links first, so escaping doesn't touch the dice (>= would become &gt;=).
  const inline = line => {
    const kept = [];
    const keep = html => `\u0000${kept.push(html) - 1}\u0000`;
    const marked = String(line).replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, label) =>
      isDice(target) ? keep(`[[/r ${toFoundryFormula(target)}]]${label ? `{${escape(label)}}` : ""}`) : keep(escape(label ?? target)));
    return escape(marked).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
      .replace(/\u0000(\d+)\u0000/g, (_m, i) => kept[Number(i)]);
  };
  const out = [];
  let list = null;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(raw);
    if (bullet) { (list ??= []).push(`<li>${inline(bullet[1])}</li>`); continue; }
    if (list) { out.push(`<ul>${list.join("")}</ul>`); list = null; }
    const heading = /^(#{1,6})\s+(.*)$/.exec(raw);
    if (heading) out.push(`<h${Math.min(6, heading[1].length + 1)}>${inline(heading[2])}</h${Math.min(6, heading[1].length + 1)}>`);
    else if (raw.trim()) out.push(`<p>${inline(raw.trim())}</p>`);
  }
  if (list) out.push(`<ul>${list.join("")}</ul>`);
  return out.join("");
}

/**
 * The actor data for a character from the bridge: its name, the RPG Tools sheet kept in the module's flags (for the
 * rolls window and the next sync), and HP, AC and biography where the system has a place for them.
 */
export function actorData(character, systemId) {
  const sheet = character.sheet ?? {}, paths = pathsFor(systemId), data = {
    name: character.name,
    [`flags.${MODULE_ID}`]: { id: character.id, updatedAt: character.updatedAt ?? null, role: character.role, sheet },
  };
  if (!paths) return data;
  const hp = sheet.core?.hp, ac = sheet.core?.ac;
  if (hp) { data[paths.hp] = hp.value; if (paths.maxHp) data[paths.maxHp] = hp.max; }
  if (ac && paths.ac) { data[paths.ac] = ac.value; if (paths.acCalc) data[paths.acCalc] = "flat"; }
  if (paths.bio && sheet.notes) data[paths.bio] = markdownToHtml(sheet.notes);
  return data;
}

const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
/** The HP an actor update changed, or null when it didn't touch HP (or the system keeps none). */
export function hpChange(changes, actor, systemId) {
  const paths = pathsFor(systemId);
  if (!paths) return null;
  const value = get(changes, paths.hp), max = paths.maxHp ? get(changes, paths.maxHp) : undefined;
  if (value === undefined && max === undefined) return null;
  const v = Number(value ?? get(actor, paths.hp)), m = paths.maxHp ? Number(max ?? get(actor, paths.maxHp)) : undefined;
  if (!Number.isFinite(v)) return null;
  return { value: Math.round(v), ...(Number.isFinite(m) ? { max: Math.round(m) } : {}) };
}

// ---- Rolls ---------------------------------------------------------------------------------------

/** The rolls on a sheet, grouped the way RPG Tools shows them, as Foundry formulas. */
export function sheetRolls(sheet) {
  const groups = new Map(), add = (group, row) => { if (!groups.has(group)) groups.set(group, []); groups.get(group).push(row); };
  const init = sheet?.core?.initiative;
  if (init?.formula) add("Skills", { name: init.label || "Initiative", buttons: [{ label: init.label || "Initiative", formula: toFoundryFormula(init.formula) }] });
  for (const r of sheet?.rolls ?? []) {
    const title = { skills: "Skills", saves: "Saves", attacks: "Attacks", spells: "Spells" }[r.group] ?? "Other";
    const buttons = [];
    if (r.attack) buttons.push({ label: "Attack", formula: toFoundryFormula(r.attack) });
    if (r.damage) buttons.push({ label: "Damage", formula: toFoundryFormula(r.damage) });
    if (r.formula) buttons.push({ label: r.name, formula: toFoundryFormula(r.formula) });
    if (buttons.length) add(title, { name: r.name, notes: r.notes, buttons });
  }
  return ["Skills", "Saves", "Attacks", "Spells", "Other"].filter(g => groups.has(g)).map(title => ({ title, rows: groups.get(title) }));
}

const plain = html => String(html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
/**
 * A chat message's roll as an RPG Tools roll, or null when it shouldn't go (whispered, blind, no roll, or dice RPG
 * Tools can't show). `message` is plain data: {flavor, speaker, whisper, blind, rolls: [{formula, total, dice}]}.
 */
export function rollFromMessage(message) {
  if (!message || message.blind || (message.whisper?.length ?? 0) > 0) return null;
  const roll = message.rolls?.[0];
  if (!roll || !Number.isFinite(Number(roll.total))) return null;
  const formula = fromFoundryFormula(roll.formula);
  if (!formula) return null;
  const who = plain(message.speaker?.alias).slice(0, 80), what = plain(message.flavor).slice(0, 80) || "Roll";
  const results = (roll.dice ?? []).flatMap(d => (d.results ?? []).filter(r => r.active !== false).map(r => r.result));
  return { title: (who ? `${who} · ${what}` : what).slice(0, 120), formula, total: Number(roll.total), detail: results.length ? `Rolled ${results.join(", ")} in Foundry` : "Rolled in Foundry", ...(who ? { who } : {}) };
}

// ---- Sync ----------------------------------------------------------------------------------------

/** Characters to fetch: new ones, and ones changed in RPG Tools since the actor was last synced. `known` maps RPG Tools id to updatedAt. */
export function charactersToFetch(list, known, who = "party") {
  return list.filter(c => (who === "all" || c.role === "pc" || c.role === "companion") && (!known.has(c.id) || known.get(c.id) !== c.updatedAt)).map(c => c.id);
}

/** The bridge API, with fetch passed in. Errors carry the server's own words. */
export class BridgeClient {
  constructor(address, key, fetchImpl = globalThis.fetch) {
    this.base = String(address ?? "").trim().replace(/\/+$/, "");
    if (this.base && !/\/api\/bridge$/.test(this.base)) this.base += "/api/bridge";
    this.key = String(key ?? "").trim();
    this.fetch = fetchImpl;
  }
  get ready() { return /^https?:\/\//.test(this.base) && /^rpgb_[a-f0-9]{64}$/.test(this.key); }
  async call(path, init = {}) {
    if (!this.ready) throw new Error("Set the RPG Tools address and bridge key in this module's settings first.");
    const res = await this.fetch(this.base + path, { ...init, headers: { Authorization: `Bearer ${this.key}`, ...(init.body ? { "Content-Type": "application/json" } : {}) } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(body.error || `RPG Tools answered ${res.status}.`); e.status = res.status; e.body = body; throw e; }
    return body;
  }
  info() { return this.call(""); }
  characters() { return this.call("/characters"); }
  character(id) { return this.call(`/characters/${encodeURIComponent(id)}`); }
  hp(id, hp) { return this.call(`/characters/${encodeURIComponent(id)}/hp`, { method: "POST", body: JSON.stringify(hp) }); }
  roll(roll) { return this.call("/rolls", { method: "POST", body: JSON.stringify(roll) }); }
}
