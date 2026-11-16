/*
 * RPG Tools for Roll20 (a Mod script). Moves characters and monsters between Roll20 and RPG Tools as JSON.
 *
 *   !rpgtools import   Reads JSON pasted into a handout named "RPG Tools import" and makes (or updates) characters:
 *                      RPG Tools sheets (rpgtools-sheet), lists of them, and common monster and character JSON
 *                      (such as Open5e, the D&D 5e SRD API and 5etools bestiary files). With one token selected and
 *                      one character imported, the token is linked to it.
 *   !rpgtools export   Writes each selected token's character as an RPG Tools sheet into a handout named
 *                      "RPG Tools export: <name>". Copy the text, save it as a .json file and import it in RPG Tools.
 *   !rpgtools help     Shows this.
 *
 * Only the GM can use it. Roll20 Mod scripts need a Pro subscription on the game's creator account.
 * The part above "Roll20 glue" uses no Roll20 functions, so RPG Tools tests it in Node.
 */
/* global on, sendChat, findObjs, getObj, createObj, playerIsGM, setDefaultTokenForCharacter, log */
var RPGTools = (function () {
  "use strict";
  var VERSION = "0.1.0", FORMAT = "rpgtools-sheet", IMPORT_HANDOUT = "RPG Tools import", EXPORT_PREFIX = "RPG Tools export: ";

  // ---- Text --------------------------------------------------------------------------------------

  var entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ldquo: '"', rdquo: '"', lsquo: "'", rsquo: "'" };
  function decodeEntities(s) {
    return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) {
      if (e[0] === "#") { var n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return isFinite(n) ? String.fromCharCode(n) : m; }
      return Object.prototype.hasOwnProperty.call(entities, e.toLowerCase()) ? entities[e.toLowerCase()] : m;
    });
  }
  /** A handout's notes (HTML from Roll20's editor) as the plain text that was pasted. */
  function notesText(html) {
    if (html === null || html === undefined || html === "null") return "";
    return decodeEntities(String(html).replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|pre|li|h\d)>/gi, "\n").replace(/<[^>]*>/g, ""))
      .replace(/[“”]/g, '"').replace(/ /g, " ");
  }
  var escapeHtml = function (s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
  /** The JSON in some text: the first { or [ to the matching last } or ], so chat and code fences around it are ignored. */
  function parseJson(text) {
    var t = String(text || ""), start = t.search(/[[{]/);
    if (start < 0) throw new Error("There is no JSON in the handout. Paste the file's text into its notes.");
    var end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    try { return JSON.parse(t.slice(start, end + 1)); }
    catch (e) { throw new Error("The JSON in the handout can't be read (" + e.message + "). Paste it again, as plain text."); }
  }
  /** 5etools text tags, such as {@hit 5} or {@damage 1d6 + 3}, as plain words. */
  function plainTags(s) {
    var atk = { mw: "Melee weapon attack:", rw: "Ranged weapon attack:", "mw,rw": "Melee or ranged weapon attack:", ms: "Melee spell attack:", rs: "Ranged spell attack:" };
    return String(s == null ? "" : s)
      .replace(/\{@atk ([^}]+)\}/g, function (_m, k) { return atk[k.trim()] || "Attack:"; })
      .replace(/\{@h\}/g, "Hit: ").replace(/\{@hit ([+-]?\d+)\}/g, function (_m, n) { return (Number(n) >= 0 ? "+" : "") + Number(n); })
      .replace(/\{@dc (\d+)\}/g, "DC $1").replace(/\{@recharge ?(\d*)\}/g, function (_m, n) { return "(Recharge " + (n ? n + "–6" : "6") + ")"; })
      .replace(/\{@\w+ ([^}|]*)[^}]*\}/g, "$1").replace(/\{@\w+\}/g, "");
  }
  /** Text from strings, arrays of strings and 5etools entries. */
  function textOf(v) {
    if (v == null) return "";
    if (typeof v === "string") return plainTags(v);
    if (Array.isArray(v)) return v.map(textOf).filter(Boolean).join("\n");
    if (typeof v === "object") return [v.name ? v.name + "." : "", textOf(v.entries || v.items || v.desc || v.description || v.text)].filter(Boolean).join(" ");
    return String(v);
  }
  var clip = function (s, n) { s = String(s == null ? "" : s).trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

  // ---- Dice --------------------------------------------------------------------------------------

  /** RPG Tools dice to Roll20 dice: Roll20 counts successes with > (at least) and < (at most). */
  function toRoll20Formula(f) {
    return String(f || "").replace(/\s+/g, "").replace(/(\d*d\d+(?:k[hl]?\d*|!)*)>=(\d+)/gi, "$1>$2").replace(/(\d*d\d+(?:k[hl]?\d*|!)*)<=(\d+)/gi, "$1<$2");
  }
  /** Roll20 dice to RPG Tools dice, or null when it uses something RPG Tools can't read. `attr` resolves @{...}. */
  function fromRoll20Formula(f, attr) {
    var s = String(f || "").replace(/&\{tracker[^}]*\}/g, "").replace(/\[[^\]]*\]/g, "")
      .replace(/@\{([^}]+)\}/g, function (m, ref) { var v = attr ? attr(ref.split("|").pop()) : undefined; return v === undefined || v === "" ? m : "(" + v + ")"; })
      .replace(/\s+/g, "").toLowerCase();
    s = s.replace(/^\((-?\d+)\)$/, "$1").replace(/\((-?\d+)\)/g, "$1").replace(/\+-/g, "-").replace(/--/g, "+")
      .replace(/(\d*d\d+(?:k[hl]?\d*|!)*)>(\d+)/g, "$1>=$2").replace(/(\d*d\d+(?:k[hl]?\d*|!)*)<(\d+)/g, "$1<=$2").replace(/(\d*d\d+)k(\d)/g, "$1kh$2");
    if (!s || s.length > 200 || !/d/.test(s) || !/^[0-9df+\-khl!<>=]+$/.test(s)) return null;
    return s;
  }
  var bonus = function (n) { n = Number(n); return !isFinite(n) || n === 0 ? "" : (n > 0 ? "+" : "") + n; };
  var d20 = function (n) { return "1d20" + bonus(n); };
  var cleanDice = function (s) { return String(s || "").replace(/\s+/g, "").replace(/\+-/g, "-"); };

  // ---- Any JSON to RPG Tools sheets -----------------------------------------------------------------

  var abilities = [["strength", "str"], ["dexterity", "dex"], ["constitution", "con"], ["intelligence", "int"], ["wisdom", "wis"], ["charisma", "cha"]];
  var title = function (s) { return String(s).replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); };
  var num = function (v) { var n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.+-]/g, "")) : NaN; return isFinite(n) && String(v).trim() !== "" ? n : undefined; };
  var mod = function (score) { return Math.floor((score - 10) / 2); };

  function hpOf(o) {
    var hp = o.hit_points !== undefined ? o.hit_points : o.hp !== undefined ? o.hp : o.hitPoints;
    if (hp && typeof hp === "object") { var v = num(hp.average !== undefined ? hp.average : hp.value !== undefined ? hp.value : hp.current); return v === undefined ? undefined : { value: v, max: num(hp.max) !== undefined ? num(hp.max) : v }; }
    var n = num(hp), max = num(o.hp_max !== undefined ? o.hp_max : o.max_hp);
    return n === undefined ? undefined : { value: n, max: max !== undefined ? max : n };
  }
  function acOf(o) {
    var ac = o.armor_class !== undefined ? o.armor_class : o.ac !== undefined ? o.ac : o.armorClass;
    if (Array.isArray(ac)) ac = ac[0];
    if (ac && typeof ac === "object") ac = ac.value !== undefined ? ac.value : ac.ac;
    var n = num(ac);
    return n === undefined ? undefined : { value: n };
  }
  function speedOf(o) {
    var s = o.speed;
    if (s == null) return "";
    if (typeof s !== "object") return String(s);
    return Object.keys(s).filter(function (k) { return k !== "canHover" && k !== "hover" && s[k] !== false; }).map(function (k) {
      var v = s[k] && typeof s[k] === "object" ? s[k].number : s[k];
      return (k === "walk" ? "" : k + " ") + (typeof v === "number" ? v + " ft" : v);
    }).join(", ");
  }
  var looksLikeStatblock = function (o) {
    return !!o && typeof o === "object" && typeof o.name === "string" &&
      ["hit_points", "hp", "hitPoints", "armor_class", "ac", "armorClass", "strength", "str", "actions", "action"].some(function (k) { return o[k] !== undefined; });
  };

  /** An attack or action as a roll, from its numbers, or from the dice in its text. */
  function actionRoll(a) {
    var text = textOf(a.entries || a.desc || a.description || a.text), raw = JSON.stringify(a.entries || a.desc || "");
    var hit = num(a.attack_bonus), dmg = "";
    if (hit === undefined) { var h = /\{@hit ([+-]?\d+)\}/.exec(raw) || /([+-]\d+) to hit/i.exec(text); if (h) hit = Number(h[1]); }
    if (Array.isArray(a.damage) && a.damage.length) dmg = cleanDice(a.damage[0].damage_dice || "");
    else if (a.damage_dice) dmg = cleanDice(a.damage_dice) + bonus(a.damage_bonus);
    if (!dmg) { var d = /\{@damage ([^}]+)\}/.exec(raw) || /\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)/.exec(text); if (d) dmg = cleanDice(d[1]); }
    var type = Array.isArray(a.damage) && a.damage[0] && a.damage[0].damage_type ? a.damage[0].damage_type.name || "" : "";
    if (hit === undefined && !dmg) return null;
    var r = { name: clip(a.name || "Attack", 80), group: hit === undefined ? "other" : "attacks", notes: clip(text, 300) };
    if (hit !== undefined) r.attack = d20(hit);
    if (dmg) r.damage = dmg;
    if (type) r.damageType = type.toLowerCase();
    return r;
  }

  /** A monster or character in a common JSON shape, as an RPG Tools sheet. */
  function fromStatblock(o) {
    var fields = [], rolls = [], lists = [], tags = [], profs = o.proficiencies || [];
    var addField = function (section, label, value) {
      if (value === undefined || value === null || value === "" || (typeof value === "object")) return;
      fields.push({ section: section, label: label, type: typeof value === "number" ? "number" : "text", value: typeof value === "number" ? value : clip(value, 200) });
    };
    abilities.forEach(function (pair) {
      var score = num(o[pair[0]] !== undefined ? o[pair[0]] : o[pair[1]] !== undefined ? o[pair[1]] : o.ability_scores && o.ability_scores[pair[0]]);
      if (score === undefined) return;
      addField("Abilities", title(pair[0]), score);
      rolls.push({ name: title(pair[0]) + " check", group: "skills", formula: d20(mod(score)) });
      var save = num(o[pair[0] + "_save"]);
      if (save === undefined && o.save) save = num(o.save[pair[1]]);
      profs.forEach(function (p) { var n = p.proficiency && p.proficiency.name; if (n && n.toLowerCase() === "saving throw: " + pair[1]) save = num(p.value); });
      if (save !== undefined) rolls.push({ name: title(pair[0]) + " save", group: "saves", formula: d20(save) });
    });
    var skills = o.skills && typeof o.skills === "object" ? o.skills : o.skill && typeof o.skill === "object" ? o.skill : {};
    Object.keys(skills).forEach(function (k) { var v = num(skills[k]); if (v !== undefined) rolls.push({ name: title(k), group: "skills", formula: d20(v) }); });
    profs.forEach(function (p) { var n = p.proficiency && p.proficiency.name; if (n && /^skill: /i.test(n) && num(p.value) !== undefined) rolls.push({ name: n.slice(7), group: "skills", formula: d20(num(p.value)) }); });

    var cr = o.challenge_rating !== undefined ? o.challenge_rating : o.cr !== undefined ? (typeof o.cr === "object" ? o.cr.cr : o.cr) : o.challenge;
    if (cr !== undefined && cr !== null && cr !== "") { tags.push("CR " + cr); addField("Details", "Challenge rating", String(cr)); }
    var type = typeof o.type === "object" && o.type ? o.type.type : o.type;
    var size = Array.isArray(o.size) ? ({ T: "Tiny", S: "Small", M: "Medium", L: "Large", H: "Huge", G: "Gargantuan" })[o.size[0]] || o.size[0] : o.size;
    var alignment = typeof o.alignment === "string" ? o.alignment : "";
    var senses = typeof o.senses === "string" ? o.senses : Array.isArray(o.senses) ? o.senses.join(", ") : o.senses && typeof o.senses === "object" ? Object.keys(o.senses).map(function (k) { return title(k) + " " + o.senses[k]; }).join(", ") : "";
    addField("Details", "Senses", senses);
    addField("Details", "Languages", Array.isArray(o.languages) ? o.languages.join(", ") : o.languages);
    addField("Details", "Damage immunities", Array.isArray(o.damage_immunities) ? o.damage_immunities.join(", ") : o.damage_immunities);
    addField("Details", "Damage resistances", Array.isArray(o.damage_resistances) ? o.damage_resistances.join(", ") : o.damage_resistances);
    addField("Details", "Condition immunities", Array.isArray(o.condition_immunities) ? o.condition_immunities.map(function (c) { return c && c.name || c; }).join(", ") : o.condition_immunities);
    if (o.passive !== undefined) addField("Details", "Passive Perception", num(o.passive));

    var asList = function (key, heading, makeRolls) {
      var arr = o[key];
      if (!Array.isArray(arr) || !arr.length) return;
      lists.push({ title: heading, items: arr.slice(0, 200).map(function (a) {
        if (makeRolls) { var r = actionRoll(a); if (r) rolls.push(r); }
        return { name: clip(plainTags(a.name || heading), 120), text: clip(textOf(a.entries || a.desc || a.description || a.text), 2000) };
      }) });
    };
    asList(o.special_abilities ? "special_abilities" : "trait", "Traits", false);
    asList(o.actions ? "actions" : "action", "Actions", true);
    asList(o.bonus_actions ? "bonus_actions" : "bonus", "Bonus actions", true);
    asList(o.reactions ? "reactions" : "reaction", "Reactions", false);
    asList(o.legendary_actions ? "legendary_actions" : "legendary", "Legendary actions", true);

    var initiative = num(o.initiative && typeof o.initiative === "object" ? o.initiative.proficiency : o.initiative);
    var dex = num(o.dexterity !== undefined ? o.dexterity : o.dex);
    var core = {}, hp = hpOf(o), ac = acOf(o), speed = speedOf(o);
    if (hp) core.hp = hp;
    if (ac) core.ac = ac;
    if (initiative !== undefined || dex !== undefined) core.initiative = { formula: d20(initiative !== undefined ? initiative : mod(dex)) };
    if (speed) core.speed = clip(speed, 60);
    return {
      format: FORMAT, version: 1, system: cr !== undefined || dex !== undefined ? "D&D 5e" : undefined, name: clip(o.name, 120),
      role: cr !== undefined ? "creature" : "npc",
      summary: clip([size, type].filter(Boolean).join(" ") + (alignment ? ", " + alignment : ""), 300) || undefined,
      tags: tags, core: core, fields: fields.slice(0, 100), rolls: rolls.slice(0, 150), lists: lists.slice(0, 12),
      notes: clip(textOf(o.desc || o.description || o.fluff), 20000) || undefined,
      source: { from: o.document__title || o.source || "JSON file", filledBy: "RPG Tools for Roll20" },
    };
  }

  /** Every sheet in some JSON: RPG Tools sheets, lists of them, common monster files, and single statblocks. */
  function sheetsIn(json) {
    var out = [], skipped = 0;
    (function walk(v, depth) {
      if (depth > 3 || v == null) return;
      if (Array.isArray(v)) { v.forEach(function (x) { walk(x, depth + 1); }); return; }
      if (typeof v !== "object") return;
      if (v.format === FORMAT) { out.push(v); return; }
      var lists = ["characters", "sheets", "monster", "monsters", "creatures", "results", "npcs"].filter(function (k) { return Array.isArray(v[k]); });
      if (lists.length) { lists.forEach(function (k) { walk(v[k], depth + 1); }); return; }
      if (looksLikeStatblock(v)) { out.push(fromStatblock(v)); return; }
      skipped++;
    })(json, 0);
    return { sheets: out.filter(function (s) { return s && typeof s.name === "string" && s.name.trim(); }), skipped: skipped };
  }

  // ---- RPG Tools sheet to Roll20 -------------------------------------------------------------------

  /** An attribute name from a label: "Spell slots, 1st" becomes spell_slots_1st. */
  var attrName = function (label) { return String(label).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "field"; };
  /** Inline rolls in page text, [[2d4+2|Healing]], as readable words. */
  var inlineRolls = function (s) { return String(s || "").replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2 ($1)").replace(/\[\[([^\]]+)\]\]/g, "$1"); };
  var macroText = function (s) { return String(s || "").replace(/\}\}/g, "} }").replace(/\n+/g, " ").replace(/[{}]{2,}/g, "").trim(); };

  /**
   * What to make in Roll20 for a sheet: the character's bio and GM notes (HTML), its attributes and its abilities
   * (token actions that roll in chat). Field labels and roll groups are kept in rpgtools_* attributes, so an export
   * gives the same sheet back.
   */
  function sheetToRoll20(sheet) {
    var attrs = [], used = {}, fieldMeta = [], gaugeMeta = [], rollMeta = {}, abilitiesOut = [];
    var unique = function (n) { var base = n, i = 2; while (used[n]) n = base + "_" + i++; used[n] = true; return n; };
    ["hp", "ac", "speed", "rpgtools_fields", "rpgtools_gauges", "rpgtools_rolls", "rpgtools_role", "rpgtools_system"].forEach(function (n) { used[n] = true; });
    var core = sheet.core || {};
    if (core.hp) attrs.push({ name: "hp", current: core.hp.value, max: core.hp.max });
    if (core.ac) attrs.push({ name: "ac", current: core.ac.value });
    if (core.speed) attrs.push({ name: "speed", current: core.speed });
    (sheet.fields || []).forEach(function (f) {
      if (f.value === undefined || f.value === null || f.value === "") return;
      var n = unique(attrName(f.label));
      attrs.push({ name: n, current: Array.isArray(f.value) ? f.value.join(", ") : f.value });
      fieldMeta.push({ attr: n, label: f.label, section: f.section, type: f.type, roll: f.roll });
    });
    (sheet.gauges || []).forEach(function (g) {
      var n = unique(attrName(g.label));
      attrs.push({ name: n, current: g.value, max: g.max });
      gaugeMeta.push({ attr: n, label: g.label, shape: g.shape, colour: g.colour });
    });
    attrs.push({ name: "rpgtools_fields", current: JSON.stringify(fieldMeta) }, { name: "rpgtools_gauges", current: JSON.stringify(gaugeMeta) });
    if (sheet.role) attrs.push({ name: "rpgtools_role", current: sheet.role });
    if (sheet.system) attrs.push({ name: "rpgtools_system", current: sheet.system });

    var who = macroText(sheet.name), names = {};
    var ability = function (name, parts, group) {
      var n = clip(name, 60), i = 2, base = n;
      while (names[n.toLowerCase()]) n = base + " " + i++;
      names[n.toLowerCase()] = true;
      rollMeta[n] = { group: group, name: name };
      abilitiesOut.push({ name: n, istokenaction: true, action: "&{template:default} {{name=" + who + ": " + macroText(name) + "}} " + parts.join(" ") });
    };
    if (core.initiative && core.initiative.formula) ability(core.initiative.label || "Initiative", ["{{Roll=[[" + toRoll20Formula(core.initiative.formula) + " &{tracker}]]}}"], "initiative");
    (sheet.rolls || []).forEach(function (r) {
      var parts = [];
      if (r.formula) parts.push("{{Roll=[[" + toRoll20Formula(r.formula) + "]]}}");
      if (r.attack) parts.push("{{Attack=[[" + toRoll20Formula(r.attack) + "]]}}");
      if (r.damage) parts.push("{{Damage=[[" + toRoll20Formula(r.damage) + "]]" + (r.damageType ? " " + macroText(r.damageType) : "") + "}}");
      if (r.notes) parts.push("{{Notes=" + macroText(inlineRolls(r.notes)) + "}}");
      if (parts.length && (r.formula || r.attack || r.damage)) ability(r.name, parts, r.group || "other");
    });
    attrs.push({ name: "rpgtools_rolls", current: JSON.stringify(rollMeta) });

    var html = [];
    if (sheet.summary) html.push("<p><em>" + escapeHtml(sheet.summary) + "</em></p>");
    var chips = [].concat(sheet.tags || [], sheet.traits || []);
    if (chips.length) html.push("<p>" + chips.map(escapeHtml).join(" · ") + "</p>");
    if (sheet.location || sheet.faction) html.push("<p>" + [sheet.location && "<b>Location:</b> " + escapeHtml(sheet.location), sheet.faction && "<b>Faction:</b> " + escapeHtml(sheet.faction)].filter(Boolean).join("<br>") + "</p>");
    (sheet.lists || []).forEach(function (l) {
      html.push("<h3>" + escapeHtml(l.title) + "</h3><ul>" + (l.items || []).map(function (it) {
        var extra = [it.quantity !== undefined && it.quantity !== 1 ? "×" + it.quantity : "", it.equipped ? "equipped" : "", it.uses ? it.uses.value + "/" + it.uses.max + (it.uses.per ? " per " + it.uses.per : "") : ""].filter(Boolean).join(", ");
        return "<li><b>" + escapeHtml(it.name) + "</b>" + (extra ? " (" + escapeHtml(extra) + ")" : "") + (it.text ? ": " + escapeHtml(inlineRolls(it.text)) : "") + "</li>";
      }).join("") + "</ul>");
    });
    if (sheet.notes) html.push(inlineRolls(sheet.notes).split(/\n{2,}/).map(function (p) { return "<p>" + escapeHtml(p).replace(/\n/g, "<br>") + "</p>"; }).join(""));
    var gm = [];
    if (sheet.unmapped && sheet.unmapped.length) gm.push("<p><b>Not placed on the sheet:</b></p><ul>" + sheet.unmapped.map(function (u) { return "<li>" + escapeHtml(u) + "</li>"; }).join("") + "</ul>");
    gm.push("<p>Imported with RPG Tools for Roll20" + (sheet.source && sheet.source.from ? " from " + escapeHtml(sheet.source.from) : "") + ".</p>");
    return { name: clip(sheet.name, 120), bio: html.join(""), gmnotes: gm.join(""), attributes: attrs, abilities: abilitiesOut, role: sheet.role || "npc" };
  }

  // ---- Roll20 to an RPG Tools sheet ----------------------------------------------------------------

  /** Attributes RPG Tools keeps from a big game sheet (such as D&D 5e by Roll20) that it didn't make itself. */
  var commonAttrs = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma", "level", "class", "race", "background", "alignment", "pb", "passive_wisdom", "npc_type", "npc_challenge", "npc_senses", "npc_languages"];
  var readJson = function (s, fallback) { try { var v = JSON.parse(s); return v && typeof v === "object" ? v : fallback; } catch (e) { return fallback; } };
  var stripHtml = function (h) { return notesText(String(h || "").replace(/<li>/gi, "- ")).replace(/\n{3,}/g, "\n\n").trim(); };

  /**
   * A Roll20 character as an RPG Tools sheet. `c` is plain data: {name, bio, attributes: [{name, current, max}],
   * abilities: [{name, action}]}. Characters this script made come back as they went in; others keep HP, AC, speed,
   * the common ability scores (or every attribute, on a small sheet) and every ability with a roll RPG Tools can read.
   */
  function roll20ToSheet(c) {
    var byName = {};
    (c.attributes || []).forEach(function (a) { byName[String(a.name).toLowerCase()] = a; });
    var cur = function (n) { var a = byName[String(n).toLowerCase()]; return a ? a.current : undefined; };
    var fieldMeta = readJson(cur("rpgtools_fields"), []), gaugeMeta = readJson(cur("rpgtools_gauges"), []), rollMeta = readJson(cur("rpgtools_rolls"), {});
    var value = function (v, type) { var n = num(v); return type === "number" || (type === undefined && n !== undefined && String(v).trim() !== "") ? (n === undefined ? 0 : n) : String(v == null ? "" : v); };
    var core = {}, hp = byName.hp, ac = num(cur("ac")) !== undefined ? num(cur("ac")) : num(cur("npc_ac"));
    if (hp && num(hp.current) !== undefined) core.hp = { value: num(hp.current), max: num(hp.max) !== undefined ? num(hp.max) : num(hp.current) };
    if (ac !== undefined) core.ac = { value: ac };
    if (cur("speed") !== undefined && cur("speed") !== "") core.speed = clip(cur("speed"), 60);

    var taken = { hp: 1, ac: 1, speed: 1, npc_ac: 1 }, fields = [], gauges = [];
    fieldMeta.forEach(function (m) {
      taken[m.attr] = 1;
      var v = cur(m.attr);
      if (v === undefined || v === "") return;
      var f = { section: m.section || "Roll20", label: m.label, type: m.type || "text", value: m.type === "number" ? (num(v) !== undefined ? num(v) : 0) : String(v) };
      if (m.roll) f.roll = m.roll;
      fields.push(f);
    });
    gaugeMeta.forEach(function (m) {
      taken[m.attr] = 1;
      var a = byName[m.attr];
      if (!a || num(a.current) === undefined) return;
      var g = { label: m.label, value: num(a.current), max: num(a.max) !== undefined ? num(a.max) : num(a.current) };
      if (m.shape) g.shape = m.shape;
      if (m.colour) g.colour = m.colour;
      gauges.push(g);
    });
    var others = (c.attributes || []).filter(function (a) {
      var n = String(a.name).toLowerCase();
      return !taken[n] && !/^rpgtools_|^repeating_/.test(n) && a.current !== "" && a.current !== undefined && String(a.current).length <= 200;
    });
    if (!fieldMeta.length) {
      var keep = others.length <= 40 ? others : others.filter(function (a) { return commonAttrs.indexOf(String(a.name).toLowerCase()) >= 0; });
      keep.forEach(function (a) {
        if (num(a.max) !== undefined && num(a.current) !== undefined) gauges.push({ label: title(a.name), value: num(a.current), max: num(a.max) });
        else fields.push({ section: "Roll20", label: title(a.name), type: num(a.current) !== undefined ? "number" : "text", value: value(a.current) });
      });
    }

    var rolls = [], unread = [], attrFor = function (n) { return cur(n); };
    (c.abilities || []).forEach(function (ab) {
      var meta = rollMeta[ab.name] || {}, action = String(ab.action || "");
      var labelled = {}, found = [], m, re = /\{\{([^=}]+)=([^}]*?\[\[([\s\S]*?)\]\][^}]*)\}\}/g;
      while ((m = re.exec(action))) labelled[m[1].trim().toLowerCase()] = m[3];
      var inl = /\[\[([\s\S]*?)\]\]/g;
      while ((m = inl.exec(action))) found.push(m[1]);
      if (!found.length) return;
      var read = function (f) { return f === undefined ? null : fromRoll20Formula(f, attrFor); };
      var name = meta.name || ab.name;
      if (meta.group === "initiative") { var fi = read(labelled.roll || found[0]); if (fi) core.initiative = { formula: fi, label: name === "Initiative" ? undefined : name }; return; }
      var attack = read(labelled.attack), damage = read(labelled.damage), formula = read(labelled.roll || labelled.check || labelled.save);
      if (!attack && !damage && !formula) {
        if (found.length >= 2) { attack = read(found[0]); damage = read(found[1]); }
        if (!attack && !damage) formula = read(found[0]);
      }
      if (!attack && !damage && !formula) { unread.push(name + ": " + clip(found[0], 80)); return; }
      var notes = /\{\{notes=([^}]*)\}\}/i.exec(action), type = /\{\{damage=[^}]*\]\]\s*([^}]+)\}\}/i.exec(action);
      var r = { name: clip(name, 80), group: meta.group || (attack || damage ? "attacks" : / save$/i.test(name) ? "saves" : "other") };
      if (formula) r.formula = formula;
      if (attack) r.attack = attack;
      if (damage) r.damage = damage;
      if (type && attack) r.damageType = clip(type[1], 40);
      if (notes) r.notes = clip(notes[1], 300);
      rolls.push(r);
    });

    var sheet = { format: FORMAT, version: 1, name: clip(c.name || "Unnamed", 120), role: cur("rpgtools_role") || "npc", core: core, fields: fields.slice(0, 100), gauges: gauges, rolls: rolls.slice(0, 150), notes: clip(stripHtml(c.bio), 20000) || undefined, source: { from: "Roll20", filledBy: "RPG Tools for Roll20" } };
    if (cur("rpgtools_system")) sheet.system = cur("rpgtools_system");
    if (unread.length) sheet.unmapped = unread.map(function (u) { return "Roll20 roll RPG Tools can't read: " + u; }).slice(0, 50);
    return sheet;
  }

  // ---- Roll20 glue -------------------------------------------------------------------------------

  var say = function (html) { sendChat("RPG Tools", "/w gm <div style=\"border:1px solid #999;padding:4px 6px;background:#fff\">" + html + "</div>", null, { noarchive: true }); };
  var HELP = "<b>RPG Tools for Roll20</b> " + VERSION + "<br>" +
    "<b>!rpgtools import</b>: paste JSON into the GM Notes (or notes) of a handout named <i>" + IMPORT_HANDOUT + "</i>, then run this. Select one token first to link it.<br>" +
    "<b>!rpgtools export</b>: select tokens. Each character goes into a handout named <i>" + EXPORT_PREFIX + "name</i>, ready to save as a .json file for RPG Tools.";

  var attrsOf = function (id) { return findObjs({ _type: "attribute", _characterid: id }); };
  function setAttr(charId, name, current, max) {
    var a = findObjs({ _type: "attribute", _characterid: charId, name: name })[0];
    var data = { current: current === undefined || current === null ? "" : current };
    if (max !== undefined) data.max = max;
    if (a) a.set(data); else { data.characterid = charId; data.name = name; a = createObj("attribute", data); }
    return a;
  }

  function writeCharacter(plan) {
    var ch = findObjs({ _type: "character", name: plan.name })[0], made = !ch;
    if (!ch) ch = createObj("character", { name: plan.name, inplayerjournals: "", controlledby: "" });
    ch.set({ bio: plan.bio, gmnotes: plan.gmnotes });
    plan.attributes.forEach(function (a) { setAttr(ch.id, a.name, a.current, a.max); });
    // Abilities this script made before are replaced; the GM's own stay.
    var mine = readJson((findObjs({ _type: "attribute", _characterid: ch.id, name: "rpgtools_abilities" })[0] || { get: function () { return "[]"; } }).get("current"), []);
    findObjs({ _type: "ability", _characterid: ch.id }).forEach(function (ab) { if (mine.indexOf(ab.get("name")) >= 0) ab.remove(); });
    plan.abilities.forEach(function (ab) { createObj("ability", { characterid: ch.id, name: ab.name, action: ab.action, istokenaction: ab.istokenaction }); });
    setAttr(ch.id, "rpgtools_abilities", JSON.stringify(plan.abilities.map(function (ab) { return ab.name; })));
    return { character: ch, made: made };
  }

  function linkToken(token, ch, plan) {
    var hp = findObjs({ _type: "attribute", _characterid: ch.id, name: "hp" })[0], ac = findObjs({ _type: "attribute", _characterid: ch.id, name: "ac" })[0];
    var party = plan.role === "pc" || plan.role === "companion", set = { represents: ch.id, name: plan.name, showname: true };
    // Player characters share one HP across their tokens; monsters get their own HP on each token.
    if (hp) { if (party) set.bar1_link = hp.id; else { set.bar1_link = ""; set.bar1_value = hp.get("current"); set.bar1_max = hp.get("max"); } }
    if (ac) { set.bar2_link = ""; set.bar2_value = ac.get("current"); }
    token.set(set);
    if (typeof setDefaultTokenForCharacter === "function") setDefaultTokenForCharacter(ch, token);
  }

  function importNow(msg) {
    var handout = findObjs({ _type: "handout", name: IMPORT_HANDOUT })[0];
    if (!handout) { createObj("handout", { name: IMPORT_HANDOUT, inplayerjournals: "", archived: false }); say("I made a handout named <i>" + IMPORT_HANDOUT + "</i> in your Journal. Paste the JSON into its GM Notes, then run <b>!rpgtools import</b> again."); return; }
    handout.get("gmnotes", function (gmnotes) {
      handout.get("notes", function (notes) {
        try {
          var text = notesText(gmnotes).trim() ? notesText(gmnotes) : notesText(notes), found = sheetsIn(parseJson(text));
          if (!found.sheets.length) { say("Nothing in that JSON looks like a character or monster. RPG Tools sheets, lists of them, and monster files from Open5e, the 5e SRD API and 5etools work."); return; }
          var results = found.sheets.slice(0, 50).map(function (s) { var plan = sheetToRoll20(s); return { plan: plan, r: writeCharacter(plan) }; });
          var selected = (msg.selected || []).filter(function (s) { return s._type === "graphic"; });
          var linked = "";
          if (selected.length === 1 && results.length === 1) { var tok = getObj("graphic", selected[0]._id); if (tok) { linkToken(tok, results[0].r.character, results[0].plan); linked = "<br>The selected token now represents " + escapeHtml(results[0].plan.name) + "."; } }
          say("Imported " + results.map(function (x) { return "<b>" + escapeHtml(x.plan.name) + "</b> (" + (x.r.made ? "new" : "updated") + ")"; }).join(", ") + "." +
            (found.sheets.length > 50 ? "<br>Only the first 50 were imported. Split the file to bring in the rest." : "") +
            (found.skipped ? "<br>" + found.skipped + " other " + (found.skipped === 1 ? "entry was" : "entries were") + " skipped." : "") + linked);
        } catch (e) { say(escapeHtml(e.message)); }
      });
    });
  }

  function exportNow(msg) {
    var tokens = (msg.selected || []).map(function (s) { return getObj("graphic", s._id); }).filter(function (t) { return t && t.get("represents"); });
    if (!tokens.length) { say("Select the tokens of the characters to export first."); return; }
    var seen = {};
    tokens.forEach(function (t) {
      var ch = getObj("character", t.get("represents"));
      if (!ch || seen[ch.id]) return;
      seen[ch.id] = true;
      ch.get("bio", function (bio) {
        var data = {
          name: ch.get("name"), bio: bio,
          attributes: attrsOf(ch.id).map(function (a) { return { name: a.get("name"), current: a.get("current"), max: a.get("max") }; }),
          abilities: findObjs({ _type: "ability", _characterid: ch.id }).map(function (a) { return { name: a.get("name"), action: a.get("action") }; }),
        };
        var sheet = roll20ToSheet(data), name = EXPORT_PREFIX + data.name;
        var h = findObjs({ _type: "handout", name: name })[0] || createObj("handout", { name: name, inplayerjournals: "", archived: false });
        h.set("notes", "<pre>" + escapeHtml(JSON.stringify(sheet, null, 2)) + "</pre>");
        say("<b>" + escapeHtml(data.name) + "</b> is in the handout <i>" + escapeHtml(name) + "</i>. Copy its text, save it as a .json file, and import it in RPG Tools (a character's sheet › Import a sheet)." +
          (sheet.unmapped ? "<br>" + sheet.unmapped.length + " roll(s) RPG Tools can't read are listed in the file." : ""));
      });
    });
  }

  function onChat(msg) {
    if (msg.type !== "api" || !/^!rpgtools\b/i.test(msg.content)) return;
    if (!playerIsGM(msg.playerid)) { sendChat("RPG Tools", "/w \"" + (msg.who || "").replace(/ \(GM\)$/, "") + "\" Only the GM can use !rpgtools."); return; }
    var cmd = (msg.content.split(/\s+/)[1] || "help").toLowerCase();
    try {
      if (cmd === "import") importNow(msg);
      else if (cmd === "export") exportNow(msg);
      else say(HELP);
    } catch (e) { log("RPG Tools: " + (e && e.stack || e)); say("Something went wrong: " + escapeHtml(e && e.message || e)); }
  }

  if (typeof on === "function") {
    on("ready", function () { log("RPG Tools for Roll20 " + VERSION + " ready. Type !rpgtools in chat."); });
    on("chat:message", onChat);
  }

  return {
    VERSION: VERSION, notesText: notesText, parseJson: parseJson, plainTags: plainTags, toRoll20Formula: toRoll20Formula, fromRoll20Formula: fromRoll20Formula,
    fromStatblock: fromStatblock, sheetsIn: sheetsIn, sheetToRoll20: sheetToRoll20, roll20ToSheet: roll20ToSheet, attrName: attrName, onChat: onChat,
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = RPGTools;
