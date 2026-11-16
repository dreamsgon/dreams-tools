/*
 * RPG Tools Bridge for Foundry VTT (v12 and v13). Brings an RPG Tools campaign's characters in as actors in an
 * "RPG Tools" folder and keeps them current, sends HP changes back, adds an "RPG Tools rolls" window to linked
 * actors, and posts public chat rolls to the campaign's Discord. Encyclopedia pages, quests and session recaps come
 * in as journals in an "RPG Tools" journal folder, shared with players where RPG Tools shares them. Only the active GM's browser talks to RPG Tools,
 * and the key is a client setting, so it stays in that browser and players never receive it.
 */
import { BridgeClient, MODULE_ID, actorData, actorType, charactersToFetch, hpChange, journalData, journalFolders, journalPlan, rollFromMessage, sheetRolls } from "./core.mjs";

const POLL_MS = 20_000;
let client = null, info = null, timer = null, syncing = false, warned = new Set();
const t = key => game.i18n.localize(`RPGTB.${key}`);
const isLeadGm = () => game.user.isGM && (game.users.activeGM ? game.users.activeGM.isSelf : true);
const flag = actor => actor.getFlag(MODULE_ID, "id");
const linked = () => game.actors.filter(a => flag(a));
const warnOnce = (key, message) => { if (warned.has(key)) return; warned.add(key); ui.notifications.warn(`RPG Tools: ${message}`); };

Hooks.once("init", () => {
  const reconnect = () => connect();
  game.settings.register(MODULE_ID, "address", { name: "RPGTB.Address.Name", hint: "RPGTB.Address.Hint", scope: "client", config: true, type: String, default: "", onChange: reconnect });
  game.settings.register(MODULE_ID, "key", { name: "RPGTB.Key.Name", hint: "RPGTB.Key.Hint", scope: "client", config: true, type: String, default: "", onChange: reconnect });
  game.settings.register(MODULE_ID, "who", { name: "RPGTB.Who.Name", hint: "RPGTB.Who.Hint", scope: "world", config: true, type: String, default: "party", choices: { party: "RPGTB.Who.Party", all: "RPGTB.Who.All" } });
  game.settings.register(MODULE_ID, "rolls", { name: "RPGTB.Rolls.Name", hint: "RPGTB.Rolls.Hint", scope: "world", config: true, type: Boolean, default: true });
});

Hooks.once("ready", () => {
  connect();
  // One listener for every rolls window, whichever dialog class drew it.
  document.addEventListener("click", event => {
    const button = event.target.closest?.("[data-rpgtb-formula]");
    if (!button) return;
    event.preventDefault();
    const actor = game.actors.get(button.dataset.rpgtbActor);
    new Roll(button.dataset.rpgtbFormula).toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: button.dataset.rpgtbName });
  });
});

async function connect() {
  clearInterval(timer); timer = null; client = null; info = null;
  if (!isLeadGm()) return;
  const c = new BridgeClient(game.settings.get(MODULE_ID, "address"), game.settings.get(MODULE_ID, "key"), (...a) => fetch(...a));
  if (!c.ready) return;
  try {
    info = await c.info();
    client = c;
    ui.notifications.info(`RPG Tools: connected to ${info.campaign.name}.`);
    await sync();
    timer = setInterval(() => void sync(), POLL_MS);
  } catch (e) { ui.notifications.error(`RPG Tools: ${e.message}`); }
}

async function rootFolder() {
  const found = game.folders.find(f => f.type === "Actor" && f.getFlag(MODULE_ID, "root"));
  return found ?? Folder.create({ name: "RPG Tools", type: "Actor", flags: { [MODULE_ID]: { root: true } } });
}

/** Whether this key reads a kind: the server says it's ready and its direction includes RPG Tools → table. */
const reads = kind => {
  const s = info?.sync?.[kind];
  return s ? s.ready && (s.direction === "both" || s.direction === "to") : kind === "characters";
};

/** Brings in new characters and ones changed in RPG Tools since the last sync. */
async function syncCharacters() {
  const { characters } = await client.characters();
  const byId = new Map(linked().map(a => [flag(a), a]));
  const known = new Map([...byId].map(([id, a]) => [id, a.getFlag(MODULE_ID, "updatedAt")]));
  const ids = charactersToFetch(characters, known, game.settings.get(MODULE_ID, "who"));
  for (const id of ids) {
    const { character } = await client.character(id);
    const data = foundry.utils.expandObject(actorData(character, game.system.id)), actor = byId.get(id);
    if (actor) await actor.update(data, { rpgToolsSync: true });
    else await Actor.create({ ...data, type: actorType(character.role, Actor.TYPES ?? Object.keys(game.system.documentTypes?.Actor ?? {})), folder: (await rootFolder()).id }, { rpgToolsSync: true });
  }
  return ids.length;
}

// ---- Journals: pages, quests and recaps -----------------------------------------------------------

const JOURNAL_KINDS = ["pages", "quests", "recaps"];
const journalsOf = kind => game.journal.filter(j => j.getFlag(MODULE_ID, "kind") === kind);
const folderParent = f => f.folder?.id ?? f.folder ?? null;
async function journalFolder(name) {
  let root = game.folders.find(f => f.type === "JournalEntry" && f.getFlag(MODULE_ID, "root"));
  root ??= await Folder.create({ name: "RPG Tools", type: "JournalEntry", flags: { [MODULE_ID]: { root: true } } });
  const sub = game.folders.find(f => f.type === "JournalEntry" && f.getFlag(MODULE_ID, "sub") === name && folderParent(f) === root.id);
  return sub ?? Folder.create({ name, type: "JournalEntry", folder: root.id, flags: { [MODULE_ID]: { sub: name } } });
}
/** A page link's target here: the journal or actor that came from that RPG Tools page. */
function linkTarget(id) {
  const doc = game.journal.find(j => j.getFlag(MODULE_ID, "id") === id) ?? game.actors.find(a => flag(a) === id);
  return doc ? { uuid: doc.uuid, name: doc.name } : null;
}

/** Brings one kind's journals up to date: removes the gone ones, makes the new ones, then writes the changed ones. */
async function syncJournals(kind) {
  const mine = journalsOf(kind), have = new Map(mine.map(j => [j.getFlag(MODULE_ID, "id"), j.getFlag(MODULE_ID, "updatedAt") ?? null]));
  const stamps = mine.map(j => j.getFlag(MODULE_ID, "updatedAt")).filter(Boolean).sort();
  const body = await client.journals(kind, stamps.at(-1));
  const { remove, write } = journalPlan(body, body[kind] ?? [], have);
  const gone = mine.filter(j => remove.includes(j.getFlag(MODULE_ID, "id"))).map(j => j.id);
  if (gone.length) await JournalEntry.deleteDocuments(gone);
  // Make the new journals first, so links between pages synced together find each other.
  const byId = new Map(mine.map(j => [j.getFlag(MODULE_ID, "id"), j]));
  for (const row of write) if (!byId.has(row.id))
    byId.set(row.id, await JournalEntry.create({ name: row.title, folder: (await journalFolder(journalFolders[row.kind] ?? "Notes")).id, ownership: { default: 0 }, flags: { [MODULE_ID]: { id: row.id, kind } } }));
  for (const row of write) {
    const journal = byId.get(row.id), { pages, ...data } = journalData(row, kind, linkTarget);
    await journal.update(data);
    const existing = new Map(journal.pages.map(p => [p.getFlag(MODULE_ID, "key"), p]));
    const update = [], create = [];
    for (const p of pages) {
      const old = existing.get(p.flags[MODULE_ID].key);
      if (old) { update.push({ _id: old.id, ...p }); existing.delete(p.flags[MODULE_ID].key); } else create.push(p);
    }
    if (update.length) await journal.updateEmbeddedDocuments("JournalEntryPage", update);
    if (create.length) await journal.createEmbeddedDocuments("JournalEntryPage", create);
    if (existing.size) await journal.deleteEmbeddedDocuments("JournalEntryPage", [...existing.values()].map(p => p.id));
  }
  return write.length + gone.length;
}

/** Characters, then pages, quests and recaps, each as far as this key reads them. One kind failing doesn't stop the rest. */
async function sync({ loud = false } = {}) {
  if (!client || syncing) return;
  syncing = true;
  const done = { characters: 0, journals: 0 }, problems = [];
  try {
    info = await client.info();
    for (const kind of ["characters", ...JOURNAL_KINDS]) {
      if (!reads(kind)) continue;
      try {
        if (kind === "characters") done.characters += await syncCharacters(); else done.journals += await syncJournals(kind);
        warned.delete(kind);
      } catch (e) {
        if (e.status === 401) throw e;
        problems.push(e.message);
        if (!loud) warnOnce(kind, e.message);
      }
    }
    warned.delete("sync");
    if (loud && problems.length) ui.notifications.error(`RPG Tools: ${problems.join(" ")}`);
    else if (loud) {
      const parts = [done.characters && `${done.characters} ${done.characters === 1 ? "character" : "characters"}`, done.journals && `${done.journals} ${done.journals === 1 ? "journal" : "journals"}`].filter(Boolean);
      ui.notifications.info(parts.length ? `RPG Tools: updated ${parts.join(" and ")}.` : "RPG Tools: everything is up to date.");
    }
  } catch (e) {
    if (loud) ui.notifications.error(`RPG Tools: ${e.message}`);
    else warnOnce("sync", e.message);
    if (e.status === 401) { clearInterval(timer); timer = null; client = null; }
  } finally { syncing = false; }
}

// HP changed here (a token's bar, the sheet, a macro): send it to RPG Tools, a moment after the last change.
const pending = new Map();
Hooks.on("updateActor", (actor, changes, options) => {
  if (!client || options?.rpgToolsSync || !flag(actor)) return;
  const hp = hpChange(changes, actor, game.system.id);
  if (!hp) return;
  clearTimeout(pending.get(actor.id));
  pending.set(actor.id, setTimeout(async () => {
    pending.delete(actor.id);
    try {
      await client.hp(flag(actor), hp);
      // RPG Tools now has a newer copy; keep the stamp so the next sync doesn't bring the same HP back.
      const { character } = await client.character(flag(actor));
      await actor.update({ [`flags.${MODULE_ID}.updatedAt`]: character.updatedAt, [`flags.${MODULE_ID}.sheet`]: character.sheet }, { rpgToolsSync: true });
    } catch (e) { warnOnce(`hp-${actor.id}`, `${actor.name}: ${e.message}`); }
  }, 1500));
});

// Public chat rolls go to the campaign's Discord rolls channel.
Hooks.on("createChatMessage", message => {
  if (!client || !game.settings.get(MODULE_ID, "rolls")) return;
  const roll = rollFromMessage({
    flavor: message.flavor, speaker: message.speaker, whisper: message.whisper, blind: message.blind,
    rolls: (message.rolls ?? []).map(r => ({ formula: r.formula, total: r.total, dice: (r.dice ?? []).map(d => ({ results: d.results })) })),
  });
  if (roll) client.roll(roll).catch(e => warnOnce("rolls", e.message));
});

// "Sync with RPG Tools" at the top of the Actors directory, for the GM.
Hooks.on("renderActorDirectory", (_app, html) => {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const bar = root?.querySelector(".header-actions");
  if (!bar || bar.querySelector(".rpgtb-sync")) return;
  const button = document.createElement("button");
  button.type = "button"; button.className = "rpgtb-sync";
  button.innerHTML = `<i class="fas fa-rotate"></i> ${t("SyncNow")}`;
  button.addEventListener("click", async () => { if (!client) await connect(); if (client) await sync({ loud: true }); else ui.notifications.warn("RPG Tools: set the address and bridge key in this module's settings first."); });
  bar.append(button);
});

/** The character's RPG Tools rolls, as buttons that roll here in Foundry. */
function openRolls(actor) {
  const sheet = actor.getFlag(MODULE_ID, "sheet"), groups = sheetRolls(sheet);
  const esc = s => foundry.utils.escapeHTML ? foundry.utils.escapeHTML(String(s)) : String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const content = groups.length ? groups.map(g => `<h3>${esc(g.title)}</h3>${g.rows.map(r => `<div class="flexrow" style="align-items:center;gap:6px;margin:2px 0"><span style="flex:2">${esc(r.name)}${r.notes ? `<br><small>${esc(r.notes)}</small>` : ""}</span>${r.buttons.map(b => `<button type="button" style="flex:1" data-rpgtb-actor="${actor.id}" data-rpgtb-name="${esc(`${r.name}${b.label !== r.name ? ` ${b.label.toLowerCase()}` : ""}`)}" data-rpgtb-formula="${esc(b.formula)}">${esc(b.label)} <small>${esc(b.formula)}</small></button>`).join("")}</div>`).join("")}`).join("")
    : "<p>This character has no rolls in RPG Tools yet.</p>";
  const title = `${actor.name}: ${t("SheetRolls")}`, DialogV2 = foundry.applications?.api?.DialogV2;
  if (DialogV2) DialogV2.prompt({ window: { title }, content, ok: { label: "Close" }, rejectClose: false });
  else new Dialog({ title, content, buttons: { close: { label: "Close" } } }).render(true);
}
Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
  if (!flag(sheet.actor)) return;
  buttons.unshift({ label: t("SheetRolls"), class: "rpgtb-rolls", icon: "fas fa-dice-d20", onclick: () => openRolls(sheet.actor) });
});
Hooks.on("getHeaderControlsActorSheetV2", (sheet, controls) => {
  if (!flag(sheet.actor ?? sheet.document)) return;
  controls.push({ icon: "fas fa-dice-d20", label: t("SheetRolls"), action: "rpgtbRolls", onClick: () => openRolls(sheet.actor ?? sheet.document) });
});
