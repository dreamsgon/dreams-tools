import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import net from "node:net";
import { after, before, test } from "node:test";

/*
 * The RPG Tools extension for Fantasy Grounds Unity is Lua. These tests run it in the Lua 5.1 inside a local
 * redis-server (EVAL), against the stand-in Fantasy Grounds in tests/fantasy-grounds-harness.lua. Where redis-server
 * isn't installed, the tests that run Lua are skipped and only the files are checked.
 */
const dir = new URL("../integrations/fantasygrounds/rpg-tools/", import.meta.url);
const source = readFileSync(new URL("scripts/rpgtools.lua", dir), "utf8");
const harness = readFileSync(new URL("fantasy-grounds-harness.lua", import.meta.url), "utf8");
const hasRedis = spawnSync("redis-server", ["--version"]).status === 0;
const skip = hasRedis ? false : "redis-server isn't installed, so there is no Lua to run the extension in";

let server, port;
before(async () => {
  if (!hasRedis) return;
  port = 20000 + Math.floor(Math.random() * 20000);
  server = spawn("redis-server", ["--port", String(port), "--bind", "127.0.0.1", "--save", "", "--appendonly", "no"], { stdio: "ignore" });
  for (let i = 0; i < 100; i++) {
    try { await command(["PING"]); return; } catch { await new Promise(r => setTimeout(r, 50)); }
  }
  throw new Error("redis-server didn't start");
});
after(() => server?.kill());

/** One Redis command over a socket, with the reply as a string. */
function command(args) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1");
    let buf = Buffer.alloc(0);
    socket.on("error", reject);
    socket.on("data", d => {
      buf = Buffer.concat([buf, d]);
      const end = buf.indexOf("\r\n");
      if (end < 0) return;
      const head = buf.subarray(0, end).toString(), kind = head[0];
      if (kind === "-") { socket.end(); reject(new Error(head.slice(1))); return; }
      if (kind === "+" || kind === ":") { socket.end(); resolve(head.slice(1)); return; }
      const len = Number(head.slice(1));
      if (buf.length < end + 2 + len) return;
      socket.end();
      resolve(buf.subarray(end + 2, end + 2 + len).toString("utf8"));
    });
    const parts = args.map(a => Buffer.from(String(a), "utf8"));
    socket.write(Buffer.concat([Buffer.from(`*${parts.length}\r\n`), ...parts.flatMap(p => [Buffer.from(`$${p.length}\r\n`), p, Buffer.from("\r\n")])]));
  });
}

/** Runs a scenario in the stand-in Fantasy Grounds. */
async function run(scenario) {
  const out = JSON.parse(await command(["EVAL", harness, "0", source, JSON.stringify(scenario)]));
  out.npcs = Object.values(out.db.npc ?? {});
  return out;
}

const goblinOpen5e = {
  slug: "goblin", name: "Goblin", size: "Small", type: "humanoid", subtype: "goblinoid", alignment: "neutral evil",
  armor_class: 15, armor_desc: "leather armor, shield", hit_points: 7, hit_dice: "2d6",
  speed: { walk: 30 }, strength: 8, dexterity: 14, constitution: 10, intelligence: 10, wisdom: 8, charisma: 8,
  skills: { stealth: 6 }, senses: "darkvision 60 ft., passive Perception 9", languages: "Common, Goblin",
  challenge_rating: "1/4", cr: 0.25,
  special_abilities: [{ name: "Nimble Escape", desc: "The goblin can take the Disengage or Hide action as a bonus action on each of its turns." }],
  actions: [
    { name: "Scimitar", desc: "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.", attack_bonus: 4, damage_dice: "1d6", damage_bonus: 2 },
    { name: "Shortbow", desc: "Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.", attack_bonus: 4, damage_dice: "1d6", damage_bonus: 2 },
  ],
  document__title: "Systems Reference Document",
};

test("the extension's files are in place", () => {
  const xml = readFileSync(new URL("extension.xml", dir), "utf8");
  assert.match(xml, /<script name="RPGTools" file="scripts\/rpgtools\.lua" \/>/);
  assert.match(xml, /<ruleset>\s*<name>5E<\/name>\s*<\/ruleset>/);
  assert.match(xml, new RegExp(`<version>${/VERSION = "([^"]+)"/.exec(source)[1].replace(/\./g, "\\.")}</version>`));
  // Fantasy Grounds runs an older Lua: none of Lua 5.3's integer division, bit operators or goto.
  const code = source.replace(/--.*$/gm, "").replace(/"(?:[^"\\]|\\.)*"/g, '""');
  assert.doesNotMatch(code, /\/\/|\bgoto\b|<const>|::\w+::|[^~<>=]=?[&|]|<<|>>/);
});

test("imports an Open5e monster from a file as a 5E NPC", { skip }, async () => {
  const out = await run({ files: { "/fg/goblin.json": JSON.stringify(goblinOpen5e) }, dialogs: [{ result: "ok", path: "/fg/goblin.json" }], steps: [{ slash: "import" }] });
  assert.equal(out.npcs.length, 1);
  const npc = out.npcs[0];
  assert.equal(npc.name, "Goblin");
  assert.equal(npc.size, "Small");
  assert.equal(npc.type, "humanoid (goblinoid)");
  assert.equal(npc.alignment, "neutral evil");
  assert.equal(npc.ac, 15);
  assert.equal(npc.actext, "(leather armor, shield)");
  assert.equal(npc.hp, 7);
  assert.equal(npc.hd, "(2d6)");
  assert.equal(npc.speed, "30 ft.");
  assert.deepEqual(npc.abilities.dexterity, { score: 14, bonus: 2 });
  assert.deepEqual(npc.abilities.strength, { score: 8, bonus: -1 });
  assert.equal(npc.cr, "1/4");
  assert.equal(npc.xp, 50);
  assert.equal(npc.skills, "Stealth +6");
  assert.equal(npc.senses, "darkvision 60 ft., passive Perception 9");
  assert.equal(npc.languages, "Common, Goblin");
  assert.deepEqual(Object.values(npc.traits).map(t => t.name), ["Nimble Escape"]);
  const actions = Object.values(npc.actions);
  assert.deepEqual(actions.map(a => a.name), ["Scimitar", "Shortbow"]);
  assert.equal(actions[0].desc, goblinOpen5e.actions[0].desc);
  assert.match(npc.text, /Imported from RPG Tools \(Systems Reference Document\)/);
  assert.equal(npc.rpgtools, "Imported from RPG Tools");
  assert.deepEqual(out.dialogs, ["open"]);
  assert.match(out.chat[0], /goblin\.json: added 1 NPC: Goblin\./);
});

test("imports a 5etools bestiary from the clipboard, with its tags as plain words", { skip }, async () => {
  const bestiary = {
    _meta: { sources: [] },
    monster: [
      {
        name: "Bandit Captain", source: "MM", size: ["M"], type: "humanoid", alignment: ["A"],
        ac: [{ ac: 15, from: ["{@item studded leather armor|phb}"] }], hp: { average: 65, formula: "10d8 + 20" },
        speed: { walk: 30, fly: { number: 60, condition: "(hover)" }, canHover: true },
        str: 15, dex: 16, con: 14, int: 14, wis: 11, cha: 14, save: { str: "+4", dex: "+5", wis: "+2" },
        skill: { athletics: "+4", deception: "+4" }, passive: 10, languages: ["any two languages"], cr: "2",
        immune: ["poison", { immune: ["bludgeoning", "piercing"], note: "from nonmagical attacks" }],
        action: [
          { name: "Multiattack", entries: ["The captain makes three melee attacks."] },
          { name: "Scimitar", entries: ["{@atk mw} {@hit 5} to hit, reach 5 ft., one target. {@h}6 ({@damage 1d6 + 3}) slashing damage."] },
        ],
        reaction: [{ name: "Parry", entries: ["The captain adds 2 to its AC against one melee attack that would hit it."] }],
      },
      { name: "Bandit Copy", source: "XYZ", _copy: { name: "Bandit", source: "MM" } },
    ],
  };
  const out = await run({ clipboard: "Here you go:\n```json\n" + JSON.stringify(bestiary) + "\n```", steps: [{ slash: "paste" }] });
  assert.equal(out.npcs.length, 1);
  const npc = out.npcs[0];
  assert.equal(npc.size, "Medium");
  assert.equal(npc.alignment, "any alignment");
  assert.equal(npc.actext, "(studded leather armor)");
  assert.equal(npc.hd, "(10d8+20)");
  assert.equal(npc.speed, "30 ft., fly 60 ft. (hover)");
  assert.equal(npc.savingthrows, "Str +4, Dex +5, Wis +2");
  assert.equal(npc.skills, "Athletics +4, Deception +4");
  assert.equal(npc.senses, "passive Perception 10");
  assert.equal(npc.damageimmunities, "poison, bludgeoning, piercing from nonmagical attacks");
  assert.equal(npc.xp, 450);
  const scimitar = Object.values(npc.actions).find(a => a.name === "Scimitar");
  assert.equal(scimitar.desc, "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 6 (1d6 + 3) slashing damage.");
  assert.deepEqual(Object.values(npc.reactions).map(r => r.name), ["Parry"]);
  assert.match(out.chat[0], /The clipboard: added 1 NPC: Bandit Captain\. Skipped 1 entry that weren't sheets or monsters\./);
});

test("imports 5e SRD API monsters, with their saves and skills from proficiencies", { skip }, async () => {
  const srd = {
    index: "orc", name: "Orc", size: "Medium", type: "humanoid", subtype: "orc", alignment: "chaotic evil",
    armor_class: [{ type: "armor", value: 13, armor: [{ index: "hide-armor", name: "Hide Armor" }] }],
    hit_points: 15, hit_dice: "2d8", hit_points_roll: "2d8+6", speed: { walk: "30 ft." },
    strength: 16, dexterity: 12, constitution: 16, intelligence: 7, wisdom: 11, charisma: 10,
    proficiencies: [{ value: 2, proficiency: { name: "Skill: Intimidation" } }, { value: 5, proficiency: { name: "Saving Throw: CON" } }],
    damage_vulnerabilities: [], damage_resistances: [], damage_immunities: [], condition_immunities: [{ name: "Frightened" }],
    senses: { darkvision: "60 ft.", passive_perception: 10 }, languages: "Common, Orc", challenge_rating: 0.5, xp: 100,
    actions: [{ name: "Greataxe", desc: "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 9 (1d12 + 3) slashing damage.", attack_bonus: 5, damage: [{ damage_type: { name: "Slashing" }, damage_dice: "1d12+3" }] }],
  };
  const out = await run({ files: { "C:\\FG\\orcs.json": JSON.stringify({ count: 1, results: [srd] }) }, dialogs: [{ result: "ok", path: "C:\\FG\\orcs.json" }], steps: [{ slash: "import" }] });
  const npc = out.npcs[0];
  assert.equal(npc.type, "humanoid (orc)");
  assert.equal(npc.actext, "(Hide Armor)");
  assert.equal(npc.hd, "(2d8+6)");
  assert.equal(npc.cr, "1/2");
  assert.equal(npc.xp, 100);
  assert.equal(npc.savingthrows, "Con +5");
  assert.equal(npc.skills, "Intimidation +2");
  assert.equal(npc.conditionimmunities, "Frightened");
  assert.equal(npc.senses, "Darkvision 60 ft., Passive Perception 10");
  assert.equal(npc.damageimmunities, undefined);
  assert.match(out.chat[0], /^RPG Tools: orcs\.json: added 1 NPC: Orc\./);
});

const sheet = {
  format: "rpgtools-sheet", version: 1, system: "D&D 5e", name: "Captain Vey", role: "npc",
  summary: "Medium humanoid (human), lawful neutral", tags: ["CR 3"],
  core: { hp: { value: 40, max: 52 }, ac: { value: 16 }, speed: "30 ft." },
  fields: [
    { section: "Abilities", label: "Strength", type: "number", value: 14 },
    { section: "Abilities", label: "Dexterity", type: "number", value: 16 },
    { section: "Details", label: "Armor", type: "text", value: "breastplate" },
    { section: "Details", label: "Languages", type: "text", value: "Common, Elvish" },
    { section: "Details", label: "Passive Perception", type: "number", value: 13 },
    { section: "Details", label: "Ship", type: "text", value: "The Gull & <Anchor>" },
  ],
  gauges: [{ label: "Luck", value: 2, max: 3 }],
  rolls: [
    { name: "Dexterity save", group: "saves", formula: "1d20+5" },
    { name: "Dexterity check", group: "skills", formula: "1d20+3" },
    { name: "Perception", group: "skills", formula: "1d20+3" },
    { name: "Rapier", group: "attacks", attack: "1d20+5", damage: "1d8+3", damageType: "piercing" },
    { name: "Cutlass", group: "attacks", attack: "1d20+5", damage: "1d6+3", damageType: "slashing" },
    { name: "Sea shanty", group: "other", formula: "1d20+2" },
  ],
  lists: [
    { title: "Actions", items: [{ name: "Cutlass", text: "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 6 (1d6 + 3) slashing damage." }] },
    { title: "Traits", items: [{ name: "Sea legs", text: "Vey ignores rough water." }] },
    { title: "Inventory", items: [{ name: "Spyglass", quantity: 1 }, { name: "Gold coin", quantity: 12, text: "Stamped with a gull." }] },
  ],
  notes: "Vey runs the harbour.\n\nShe owes the Guild.",
  source: { from: "RPG Tools", filledBy: "RPG Tools" },
};

test("imports an RPG Tools sheet, and importing it again updates the same NPC", { skip }, async () => {
  const text = JSON.stringify(sheet);
  const out = await run({ clipboard: text, steps: [{ slash: "paste" }, { slash: "paste" }] });
  assert.equal(out.npcs.length, 1);
  const npc = out.npcs[0];
  assert.equal(npc.size, "Medium");
  assert.equal(npc.type, "humanoid (human)");
  assert.equal(npc.alignment, "lawful neutral");
  assert.equal(npc.hp, 52);
  assert.equal(npc.ac, 16);
  assert.equal(npc.actext, "(breastplate)");
  assert.equal(npc.cr, "3");
  assert.equal(npc.xp, 700);
  assert.equal(npc.savingthrows, "Dex +5");
  assert.equal(npc.skills, "Perception +3");
  assert.equal(npc.senses, "passive Perception 13");
  assert.equal(npc.languages, "Common, Elvish");
  assert.deepEqual(npc.abilities.dexterity, { score: 16, bonus: 3 });
  assert.equal(npc.abilities.wisdom, undefined);
  const actions = Object.values(npc.actions);
  assert.deepEqual(actions.map(a => a.name), ["Cutlass", "Rapier"]);
  assert.equal(actions[1].desc, "Weapon Attack: +5 to hit, one target. Hit: 7 (1d8 + 3) piercing damage.");
  assert.deepEqual(Object.values(npc.traits).map(t => t.name), ["Sea legs"]);
  assert.equal(npc.text, "<p>Vey runs the harbour.</p><p>She owes the Guild.</p>" +
    "<h>More from RPG Tools</h><list><li><b>Ship:</b> The Gull &amp; &lt;Anchor&gt;</li><li><b>Luck:</b> 2 / 3</li></list>" +
    "<h>Inventory</h><list><li><b>Spyglass</b></li><li><b>Gold coin</b> x12: Stamped with a gull.</li></list>" +
    "<h>Other rolls</h><list><li><b>Sea shanty:</b> 1d20+2</li></list>" +
    "<p><i>Imported from RPG Tools (RPG Tools).</i></p>");
  assert.match(out.chat[0], /added 1 NPC: Captain Vey/);
  assert.match(out.chat[1], /updated 1: Captain Vey/);
});

test("an NPC with the same name that wasn't imported is left alone", { skip }, async () => {
  const out = await run({ db: { npc: { "id-00900": { name: "Captain Vey", hp: 99 } } }, clipboard: JSON.stringify(sheet), steps: [{ slash: "paste" }] });
  assert.equal(out.npcs.length, 2);
  assert.equal(out.db.npc["id-00900"].hp, 99);
});

test("exports an NPC as an RPG Tools sheet that reads back the same", { skip }, async () => {
  const out = await run({
    files: { "/fg/goblin.json": JSON.stringify(goblinOpen5e) },
    dialogs: [{ result: "ok", path: "/fg/goblin.json" }, { result: "ok", path: "/fg/out/goblin" }],
    steps: [{ slash: "import" }, { slash: "export gob" }],
  });
  assert.deepEqual(out.dialogs, ["open", "save"]);
  const saved = JSON.parse(out.saved["/fg/out/goblin.json"]);
  assert.equal(saved.format, "rpgtools-sheet");
  assert.equal(saved.version, 1);
  assert.equal(saved.name, "Goblin");
  assert.equal(saved.role, "creature");
  assert.equal(saved.summary, "Small humanoid (goblinoid), neutral evil");
  assert.deepEqual(saved.tags, ["CR 1/4"]);
  assert.deepEqual(saved.core, { hp: { value: 7, max: 7 }, ac: { value: 15 }, initiative: { formula: "1d20+2" }, speed: "30 ft." });
  assert.deepEqual(saved.fields.find(f => f.label === "Dexterity"), { section: "Abilities", label: "Dexterity", type: "number", value: 14 });
  assert.deepEqual(saved.fields.find(f => f.label === "Armor"), { section: "Details", label: "Armor", type: "text", value: "leather armor, shield" });
  assert.deepEqual(saved.rolls.find(r => r.name === "Stealth"), { name: "Stealth", group: "skills", formula: "1d20+6" });
  assert.deepEqual(saved.rolls.find(r => r.name === "Scimitar"), { name: "Scimitar", group: "attacks", attack: "1d20+4", damage: "1d6+2", damageType: "slashing", notes: goblinOpen5e.actions[0].desc });
  assert.deepEqual(saved.lists.map(l => l.title), ["Traits", "Actions"]);
  assert.match(out.chat[1], /Saved Goblin to \/fg\/out\/goblin\.json/);

  // Importing the exported sheet gives the same NPC values.
  const back = await run({ clipboard: out.saved["/fg/out/goblin.json"], steps: [{ slash: "paste" }] });
  const a = out.npcs[0], b = back.npcs[0];
  for (const key of ["name", "size", "type", "alignment", "ac", "actext", "hp", "hd", "speed", "cr", "xp", "skills", "senses", "languages", "abilities"]) assert.deepEqual(b[key], a[key], key);
  assert.deepEqual(Object.values(b.actions), Object.values(a.actions));
});

test("players copy only characters they own, and only the GM imports", { skip }, async () => {
  const db = {
    charsheet: {
      "id-00001": {
        name: "Aria", race: "Elf", level: 3, profbonus: 2, background: "Sage",
        classes: { "id-00001": { name: "Wizard", level: 3 } },
        hp: { total: 20, wounds: 5 }, defenses: { ac: { total: 13 } }, speed: { total: 30 }, initiative: { total: 3 },
        abilities: { dexterity: { score: 16, bonus: 3, save: 3 }, intelligence: { score: 17, bonus: 3, save: 5 } },
        skilllist: { "id-00001": { name: "Arcana", total: 5 }, "id-00002": { name: "Stealth", prof: 0 } },
        featurelist: { "id-00001": { name: "Arcane Recovery", text: "<p>Once per day...</p>" } },
        inventorylist: { "id-00001": { name: "Spellbook", count: 1 } },
        weaponlist: { "id-00001": { name: "Dagger", attackbonus: 5 } },
        notes: "Looking for her teacher.",
      },
      "id-00002": { name: "Brom", hp: { total: 30 } },
    },
    npc: { "id-00001": { name: "Goblin Boss", hp: 21 } },
  };
  const out = await run({ host: false, db, owned: ["charsheet.id-00001"], steps: [{ slash: "copy aria" }, { slash: "copy Brom" }, { slash: "copy Goblin Boss" }, { slash: "paste" }] });
  const aria = JSON.parse(out.clipboard);
  assert.equal(aria.name, "Aria");
  assert.equal(aria.role, "pc");
  assert.equal(aria.summary, "Elf Wizard 3");
  assert.deepEqual(aria.core, { hp: { value: 15, max: 20 }, ac: { value: 13 }, initiative: { formula: "1d20+3" }, speed: "30 ft." });
  assert.deepEqual(aria.rolls.filter(r => r.group === "saves").map(r => [r.name, r.formula]), [["Dexterity save", "1d20+3"], ["Intelligence save", "1d20+5"]]);
  assert.deepEqual(aria.rolls.filter(r => r.group === "skills" && !r.name.endsWith("check")).map(r => [r.name, r.formula]), [["Arcana", "1d20+5"], ["Stealth", "1d20+3"]]);
  assert.deepEqual(aria.rolls.find(r => r.name === "Dagger"), { name: "Dagger", group: "attacks", attack: "1d20+5" });
  assert.deepEqual(aria.lists, [{ title: "Features", items: [{ name: "Arcane Recovery", text: "Once per day..." }] }, { title: "Inventory", items: [{ name: "Spellbook", quantity: 1 }] }]);
  assert.equal(aria.notes, "Looking for her teacher.");
  assert.match(out.chat[0], /Copied Aria as an RPG Tools sheet/);
  assert.match(out.chat[1], /no NPC or character named "Brom" that you own/);
  assert.match(out.chat[2], /no NPC or character named "Goblin Boss" that you own/);
  assert.match(out.chat[3], /Only the GM can import/);
});

test("says what's wrong with files it can't use", { skip }, async () => {
  const out = await run({
    files: { "/a.json": "{ not json", "/b.json": JSON.stringify({ hello: "world" }) },
    dialogs: [{ result: "ok", path: "/a.json" }, { result: "ok", path: "/b.json" }, { result: "cancel" }, { result: "ok", path: "/missing.json" }],
    steps: [{ slash: "import" }, { slash: "import" }, { slash: "import" }, { slash: "import" }, { slash: "export" }, { slash: "" }],
  });
  assert.equal(out.npcs.length, 0);
  assert.deepEqual(out.chat, [
    "RPG Tools: a.json: Its JSON can't be read. Check that it is a whole JSON file.",
    "RPG Tools: b.json holds no RPG Tools sheets or monsters (1 entries skipped).",
    "RPG Tools: Fantasy Grounds couldn't open /missing.json.",
    "RPG Tools: Name the NPC or character, like /rpgtools export Goblin.",
    out.chat[4],
  ]);
  assert.match(out.chat[4], /^RPG Tools: RPG Tools 0\.1\.0\. \/rpgtools import/);
});

test("writes JSON that JavaScript reads back exactly", { skip }, async () => {
  const value = { name: "Quote \" back\\slash\nnew line\ttab \u0001 café ✓", list: [1, -2.5, 0.125, true, false], nested: { empty: [], n: 1e6 } };
  const out = await run({ steps: [{ call: "encodeJSON", args: [value] }, { call: "plainTags", args: ["{@atk mw,rw} {@hit -1} to hit. {@h}{@damage 2d6} damage, {@dc 13} {@recharge 5} {@spell fireball|phb} {@b bold}{@note}"] }] });
  assert.deepEqual(JSON.parse(out.results[0]), { name: value.name, list: value.list, nested: { n: 1e6 } });
  assert.equal(out.results[1], "Melee or Ranged Weapon Attack: -1 to hit. Hit: 2d6 damage, DC 13 (Recharge 5-6) fireball bold");
});

test("RPG Tools serves the extension as an .ext with extension.xml at its root", async () => {
  const { fantasyGroundsExtension, FG_FILES } = await import("../lib/bridge/fantasy-grounds.ts");
  const zip = Buffer.from(await fantasyGroundsExtension());
  const names = [];
  for (let at = 0; zip.readUInt32LE(at) === 0x04034b50;) {
    const size = zip.readUInt32LE(at + 18), nameLen = zip.readUInt16LE(at + 26), extra = zip.readUInt16LE(at + 28);
    const name = zip.subarray(at + 30, at + 30 + nameLen).toString();
    names.push(name);
    assert.equal(zip.subarray(at + 30 + nameLen + extra, at + 30 + nameLen + extra + size).toString(), readFileSync(new URL(name, dir), "utf8"));
    at += 30 + nameLen + extra + size;
  }
  assert.deepEqual(names, [...FG_FILES]);
  assert.deepEqual(names, ["extension.xml", "scripts/rpgtools.lua"]);
});
