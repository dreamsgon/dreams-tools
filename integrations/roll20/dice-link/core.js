/*
 * RPG Tools Dice Link, the part without the browser: what to type into Roll20 chat for an RPG Tools roll, and how to
 * read a Roll20 chat roll. Loaded before the other scripts, and in Node by RPG Tools' tests.
 */
var RPGToolsLink = (function () {
  "use strict";
  var MARK = "RPG Tools"; // The "via" row on rolls this extension types into Roll20, so they never come back.
  var defaults = { toRoll20: true, mode: "result", fromRoll20: false };

  /** RPG Tools dice to Roll20 dice: Roll20 counts successes with > (at least) and < (at most). */
  function toRoll20Formula(f) {
    return String(f || "").replace(/\s+/g, "").replace(/(\d*d\d+(?:k[hl]?\d*|!)*)>=(\d+)/gi, "$1>$2").replace(/(\d*d\d+(?:k[hl]?\d*|!)*)<=(\d+)/gi, "$1<$2");
  }
  /** Roll20 dice to RPG Tools dice, or "" when it isn't plain dice (attributes, queries, rerolls). */
  function fromRoll20Formula(f) {
    var s = String(f || "").replace(/&\{tracker[^}]*\}/g, "").replace(/\[[^\]]*\]/g, "").replace(/\s+/g, "").toLowerCase()
      .replace(/(\d*d\d+(?:k[hl]?\d*|!)*)>(\d+)/g, "$1>=$2").replace(/(\d*d\d+(?:k[hl]?\d*|!)*)<(\d+)/g, "$1<=$2").replace(/(\d*d\d+)k(\d)/g, "$1kh$2");
    return s && s.length <= 200 && /d/.test(s) && /^[0-9df+\-khl!<>=()]+$/.test(s) ? s : "";
  }
  /** Text that can sit inside a Roll20 roll template without breaking it. */
  var cell = function (s, n) { return String(s == null ? "" : s).replace(/[{}]/g, "").replace(/\[\[|\]\]/g, "").replace(/\s+/g, " ").trim().slice(0, n || 200); };

  /**
   * What to type into Roll20 chat for an RPG Tools roll. "result" shows RPG Tools' own total and dice, so both
   * tables agree; "reroll" has Roll20 roll the same formula with its own dice (only when the formula is known).
   */
  function chatFor(roll, mode) {
    var name = cell(roll.label || "Roll", 120);
    var rows = ["{{name=" + name + "}}"];
    if (mode === "reroll" && roll.formula) rows.push("{{Roll=[[" + toRoll20Formula(roll.formula) + "]]}}");
    else {
      rows.push("{{Result=" + cell(roll.total, 20) + "}}");
      if (roll.breakdown) rows.push("{{Dice=" + cell(roll.breakdown, 300) + "}}");
    }
    if (roll.outcome) rows.push("{{Outcome=" + cell(roll.outcome, 200) + "}}");
    rows.push("{{via=" + MARK + "}}");
    return "&{template:default} " + rows.join(" ");
  }

  var tags = function (s) { return String(s || "").replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&"); };
  /** A Roll20 inline roll's tooltip, "Rolling 1d20+5 = (12)+5", as its formula and the dice that came up. */
  function parseInlineTitle(title) {
    var t = tags(title).replace(/\s+/g, " ").trim(), m = /^rolling\s+(.+?)\s*=\s*(.*)$/i.exec(t);
    return m ? { formula: m[1], detail: m[2] } : { formula: "", detail: "" };
  }

  /**
   * One Roll20 chat message as a roll for RPG Tools, or null. `msg` is what the content script read from the page:
   * {who, name, text, whisper, rolls: [{label, title, formula, total}]}, where `title` is an inline roll's tooltip.
   */
  /** "1d20+(11+0)" and its dice "(5)+(11+0)" as "1d20+11" and "(5)+11": sheet modifiers summed. */
  function tidy(formula, detail) {
    var f = String(formula || ""), d = String(detail || "");
    f = f.replace(/\((-?\d+(?:\s*[+-]\s*\d+)+)\)/g, function (group, inner) {
      var sum = inner.replace(/\s+/g, "").match(/[+-]?\d+/g).reduce(function (a, n) { return a + Number(n); }, 0);
      d = d.split(group).join(String(sum));
      return String(sum);
    });
    var clean = function (s) { return s.replace(/\+-/g, "-").replace(/\+0(?![\d.])/g, "").replace(/^0\+/, ""); };
    return { formula: clean(f), detail: clean(d) };
  }
  /** "Attack" from "Attack:" or from "Damage: 25 piercing +" (the words before a colon). */
  var labelOf = function (s) { var t = String(s || ""), at = t.indexOf(":"); return cell((at > 0 ? t.slice(0, at) : t).replace(/[\s+]+$/, ""), 60); };

  function rollFromChat(msg) {
    if (!msg || msg.whisper || String(msg.text || "").indexOf("via" + MARK) >= 0) return null;
    var rolls = (msg.rolls || []).map(function (r) {
      var parsed = r.title ? parseInlineTitle(r.title) : { formula: r.formula || "", detail: "" };
      var total = Number(String(r.total == null ? "" : r.total).replace(/[^\d.+-]/g, ""));
      var t = tidy(parsed.formula || r.formula || "", parsed.detail);
      return { label: labelOf(r.label), formula: t.formula, detail: t.detail, total: total };
    }).filter(function (r) { return isFinite(r.total) && String(r.total) !== "" && !isNaN(r.total); });
    if (!rolls.length) return null;
    // A roll template's first lines name it: "Bite" then "Adult Black Dragon" (lines without a number or a colon).
    var lines = (msg.lines || []).map(function (l) { return cell(l, 200); }).filter(Boolean);
    var heading = [];
    while (heading.length < 2 && lines.length && !/[:\d]/.test(lines[0])) heading.push(lines.shift());
    var first = rolls[0], name = cell(msg.name, 120) || heading.join(" · ") || first.label || "Roll";
    var detail = rolls.length > 1
      ? rolls.map(function (r) { return (r.label ? r.label + " " : "") + r.total + (r.formula ? " (" + (fromRoll20Formula(r.formula) || r.formula) + ")" : ""); }).join(" · ")
      : first.detail;
    var out = { title: name, total: first.total, formula: fromRoll20Formula(first.formula) || cell(first.formula, 200) };
    if (detail) out.detail = cell(detail, 600);
    // What the message said, such as "Attack: 16 · Damage: 25 piercing + 2 acid", when it says more than a bare roll.
    var said = cell(lines.join(" · "), 600);
    if (said && (rolls.length > 1 || heading.length)) out.text = said;
    // Each roll's own dice, so the 3D dice can show every roll in the message.
    if (rolls.length > 1) out.dice = rolls.map(function (r) { return { formula: fromRoll20Formula(r.formula) || "", detail: r.detail }; }).filter(function (r) { return r.formula && r.detail; }).slice(0, 6);
    var who = cell(String(msg.who || "").replace(/:\s*$/, ""), 80);
    if (who) out.who = who;
    return out;
  }

  return { MARK: MARK, defaults: defaults, toRoll20Formula: toRoll20Formula, fromRoll20Formula: fromRoll20Formula, chatFor: chatFor, parseInlineTitle: parseInlineTitle, rollFromChat: rollFromChat };
})();
if (typeof module !== "undefined" && module.exports) module.exports = RPGToolsLink;
