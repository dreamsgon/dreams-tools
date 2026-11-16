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
const SECRET_OPEN = /^[ \t]*:::[ \t]*secret[ \t]*$/i, SECRET_CLOSE = /^[ \t]*:::[ \t]*$/;
/**
 * Page text (RPG Tools Markdown) as HTML for Foundry: headings, paragraphs, bold, italics, bullet and numbered lists
 * (one level of nesting), quotes, tables and web links. Inline rolls become Foundry inline rolls. A page link becomes a
 * link to the journal or actor `link(id)` names, or just its label. GM secrets (`:::secret`) become Foundry secret
 * sections, which only the journal's owners (the GM) see. Margin notes (`{{word|note}}`) keep the word in the text and
 * go into a secret "GM notes" section at the end, so a page shared with players never shows them.
 */
export function markdownToHtml(text, { link = () => null } = {}) {
  const isDice = s => /d/i.test(s) && /^[\d\s+\-dDfFkKhHlL!<>=]+$/.test(s);
  const notes = [];
  // Inline rolls, links and notes first, so escaping doesn't touch the dice (>= would become &gt;=).
  const inline = line => {
    const kept = [];
    const keep = html => `\u0000${kept.push(html) - 1}\u0000`;
    const marked = String(line)
      .replace(/\{\{([^|{}\n]{1,200})\|([^{}\n]{1,1000})\}\}/g, (_m, word, note) => { notes.push([word.trim(), note.trim()]); return word; })
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, label) => {
        const t = target.trim(), l = label?.trim();
        if (isDice(t)) return keep(`[[/r ${toFoundryFormula(t)}]]${l ? `{${escape(l)}}` : ""}`);
        if (/^table:/i.test(t)) return keep(escape(l || t.slice(6).trim()));
        if (/^maptable:/i.test(t)) return keep(escape(l || "Battle map"));
        const to = link(t);
        return keep(to ? `@UUID[${to.uuid}]{${escape(l || to.name)}}` : escape(l || t));
      })
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label, url) => keep(`<a href="${escape(url)}" target="_blank" rel="noopener">${escape(label)}</a>`));
    return escape(marked).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
      .replace(/~~(.+?)~~/g, "<s>$1</s>").replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\u0000(\d+)\u0000/g, (_m, i) => kept[Number(i)]);
  };
  const root = [];
  let out = root, list = null, quote = null, table = null;
  const flush = () => {
    if (list) { out.push(`<${list.tag}>${list.items.map(i => `<li>${i.html}${i.sub.length ? `<ul>${i.sub.map(x => `<li>${x}</li>`).join("")}</ul>` : ""}</li>`).join("")}</${list.tag}>`); list = null; }
    if (quote) { out.push(`<blockquote>${quote.map(q => `<p>${q}</p>`).join("")}</blockquote>`); quote = null; }
    if (table) { const [head, ...rows] = table; out.push(`<table><thead><tr>${head.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`); table = null; }
  };
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    if (out === root && SECRET_OPEN.test(raw)) { flush(); out = []; continue; }
    if (out !== root && SECRET_CLOSE.test(raw)) { flush(); root.push(`<section class="secret">${out.join("")}</section>`); out = root; continue; }
    const item = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(raw);
    if (item) {
      const tag = item[2] ? "ul" : "ol", nested = item[1].replace(/\t/g, "    ").length >= 2 && list?.items.length;
      if (nested) { list.items.at(-1).sub.push(inline(item[4])); continue; }
      if (list && list.tag !== tag) flush();
      if (quote || table) flush();
      (list ??= { tag, items: [] }).items.push({ html: inline(item[4]), sub: [] });
      continue;
    }
    const q = /^\s*>\s?(.*)$/.exec(raw);
    if (q) { if (list || table) flush(); (quote ??= []).push(inline(q[1])); continue; }
    if (/^\s*\|.*\|\s*$/.test(raw)) {
      if (list || quote) flush();
      if (/^\s*\|[\s:|-]+\|\s*$/.test(raw) && raw.includes("-")) continue;
      // Pipes inside links and notes aren't cell breaks.
      const cells = raw.trim().slice(1, -1).replace(/\[\[[^\]]*\]\]|\{\{[^}]*\}\}/g, m => m.replace(/\|/g, "\u0001")).split("|");
      (table ??= []).push(cells.map(c => inline(c.replace(/\u0001/g, "|").trim())));
      continue;
    }
    flush();
    const heading = /^(#{1,6})\s+(.*)$/.exec(raw);
    if (heading) { const n = Math.min(6, heading[1].length + 1); out.push(`<h${n}>${inline(heading[2])}</h${n}>`); }
    else if (/^\s*(?:-{3,}|\*{3,})\s*$/.test(raw)) out.push("<hr>");
    else if (raw.trim()) out.push(`<p>${inline(raw.trim())}</p>`);
  }
  flush();
  if (out !== root) root.push(`<section class="secret">${out.join("")}</section>`);
  if (notes.length) root.push(`<section class="secret"><p><strong>GM notes</strong></p><ul>${notes.map(([w, n]) => `<li><strong>${escape(w)}</strong>: ${escape(n)}</li>`).join("")}</ul></section>`);
  return root.join("");
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

// ---- Journals ------------------------------------------------------------------------------------

/** Foundry's ownership levels: a page set to INHERIT follows its journal. */
export const OWNERSHIP = { INHERIT: -1, NONE: 0, OBSERVER: 2 };
/** The folder inside "RPG Tools" each kind of page goes in. */
export const journalFolders = { folder: "Notes", note: "Notes", place: "Places", faction: "Organizations", lore: "Lore", vehicle: "Vehicles", quest: "Quests", session: "Sessions" };
const overviewName = kind => ({ quest: "Journal", session: "Recap", vehicle: "Description" })[kind] ?? "Overview";
const goalMark = { todo: "☐", done: "☑", failed: "☒", dropped: "–" };
const secret = text => `:::secret\n${text}\n:::`;

/** A quest's state, goals, reward and log as Markdown parts. Hidden goals, hidden rewards and GM log entries are secrets. */
export function questParts(row) {
  const q = row.quest, players = row.overview.visibility === "players";
  if (!q) return [];
  const linkTo = p => (p ? `[[${p.id}|${p.title ?? "a page"}]]` : "");
  const head = [`**State:** ${q.stateName} · **Category:** ${q.category}`];
  if (q.giver) head.push(`**Given by:** ${linkTo(q.giver)}`);
  if (q.place) head.push(`**Where:** ${linkTo(q.place)}`);
  const goals = q.goals.map(g => {
    const line = `- ${goalMark[g.status] ?? "☐"} ${g.status === "dropped" || g.status === "failed" ? `~~${g.text}~~` : g.text}${g.note ? ` (*${g.note}*)` : ""}`;
    return g.hidden ? secret(line) : line;
  });
  const reward = q.reward ? (q.rewardHidden ? secret(`**Reward:** ${q.reward}`) : `**Reward:** ${q.reward}`) : "";
  const goalsText = [head.join("\n\n"), goals.length ? `## Goals\n\n${goals.join("\n")}` : "", reward].filter(Boolean).join("\n\n");
  const log = q.log.map(l => {
    const when = l.label || (Date.parse(l.at) ? new Date(l.at).toISOString().slice(0, 10) : "");
    const entry = `## ${when || "Entry"}${l.author ? ` · ${l.author}` : ""}\n\n${l.text}`;
    return l.players ? entry : secret(entry);
  }).join("\n\n");
  return [
    { key: "quest-goals", name: "Goals", players, text: goalsText },
    { key: "quest-log", name: "Log", players, text: log },
    { key: "quest-prep", name: "GM prep", players: false, text: q.prep },
  ];
}

/** Whether a page becomes a journal: everything with words in it, and folders only when they have some. */
export const journalWanted = row => row.kind !== "folder" || !!row.overview?.text?.trim() || (row.tabs ?? []).some(t => t.text?.trim());

/** A page's parts in order: its Overview, then quest parts, then its tabs. Empty parts are left out, but a journal keeps one. */
export function journalParts(row) {
  const all = [
    { key: "overview", name: overviewName(row.kind), players: row.overview?.visibility === "players", text: row.overview?.text ?? "" },
    ...questParts(row),
    ...(row.tabs ?? []).map(t => ({ key: `tab-${t.id}`, name: t.title, players: t.visibility === "players", text: t.text ?? "" })),
  ];
  const full = all.filter(p => p.text.trim());
  return full.length ? full : all.slice(0, 1);
}

/**
 * The journal for a page: its name, who may see it, and its text pages. The journal is shared with players (as
 * observers) when any part is, and each part that isn't stays GM only. `kind` is the bridge's kind (pages, quests or
 * recaps), kept in the flags with the page's id and when it last changed.
 */
export function journalData(row, kind, link) {
  const parts = journalParts(row), shared = parts.some(p => p.players);
  return {
    name: row.title,
    ownership: { default: shared ? OWNERSHIP.OBSERVER : OWNERSHIP.NONE },
    flags: { [MODULE_ID]: { id: row.id, kind, updatedAt: row.updatedAt ?? null } },
    pages: parts.map((p, i) => ({
      name: p.name, type: "text", sort: (i + 1) * 100_000,
      text: { format: 1, content: markdownToHtml(p.text, { link }) },
      ownership: { default: p.players ? OWNERSHIP.INHERIT : OWNERSHIP.NONE },
      flags: { [MODULE_ID]: { key: p.key } },
    })),
  };
}

/** What to do with this kind's journals after a read: which rows to write, and which journals to remove. `have` maps page id to updatedAt. */
export function journalPlan(body, rows, have) {
  const keep = new Set(body.ids ?? []);
  const unwanted = new Set(rows.filter(r => !journalWanted(r)).map(r => r.id));
  return {
    remove: [...have.keys()].filter(id => !keep.has(id) || unwanted.has(id)),
    write: rows.filter(r => journalWanted(r) && !(have.has(r.id) && have.get(r.id) === (r.updatedAt ?? null))),
  };
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
  /** Pages, quests or recaps: every id, and the rows changed after `since`. */
  journals(kind, since) { return this.call(`/${kind}${since ? `?since=${encodeURIComponent(since)}` : ""}`); }
}
