--
-- RPG Tools for Fantasy Grounds: move characters and monsters between Fantasy Grounds Unity (5E ruleset) and
-- RPG Tools as JSON files.
--
--   /rpgtools import          Pick a JSON file. Each sheet or monster in it becomes an NPC. (GM)
--   /rpgtools paste           The same, from JSON on the clipboard. (GM)
--   /rpgtools export <name>   Save an NPC or character as an RPG Tools sheet file.
--   /rpgtools copy <name>     The same, to the clipboard.
--
-- It reads RPG Tools sheets ("format": "rpgtools-sheet"), and monster JSON from Open5e, the D&D 5e SRD API and
-- 5etools. Fantasy Grounds can't reach the web, so the files are carried across by hand. Nothing here sends data
-- anywhere.
--
-- Written for the Lua that Fantasy Grounds Unity runs: no goto, no integer division, no utf8 library.
--

VERSION = "0.2.0";
-- The RPG Tools site this copy came from. RPG Tools fills it in when you download the extension.
SITE = "__RPG_TOOLS_ORIGIN__";
FORMAT = "rpgtools-sheet";
MAX_IMPORT = 1000;

local ELLIPSIS = "\226\128\166";
local SIZES = { T = "Tiny", S = "Small", M = "Medium", L = "Large", H = "Huge", G = "Gargantuan" };
local SIZE_WORDS = { tiny = "Tiny", small = "Small", medium = "Medium", large = "Large", huge = "Huge", gargantuan = "Gargantuan" };
local ABILITIES = {
	{ "strength", "str", "Str" }, { "dexterity", "dex", "Dex" }, { "constitution", "con", "Con" },
	{ "intelligence", "int", "Int" }, { "wisdom", "wis", "Wis" }, { "charisma", "cha", "Cha" },
};
local ALIGN = { L = "lawful", N = "neutral", C = "chaotic", G = "good", E = "evil", U = "unaligned", A = "any alignment" };
local CR_XP = {
	["0"] = 10, ["1/8"] = 25, ["1/4"] = 50, ["1/2"] = 100, ["1"] = 200, ["2"] = 450, ["3"] = 700, ["4"] = 1100,
	["5"] = 1800, ["6"] = 2300, ["7"] = 2900, ["8"] = 3900, ["9"] = 5000, ["10"] = 5900, ["11"] = 7200,
	["12"] = 8400, ["13"] = 10000, ["14"] = 11500, ["15"] = 13000, ["16"] = 15000, ["17"] = 18000,
	["18"] = 20000, ["19"] = 22000, ["20"] = 25000, ["21"] = 33000, ["22"] = 41000, ["23"] = 50000,
	["24"] = 62000, ["25"] = 75000, ["26"] = 90000, ["27"] = 105000, ["28"] = 120000, ["29"] = 135000, ["30"] = 155000,
};
-- The NPC lists this script fills in. Each is cleared and written again when an NPC is imported a second time.
NPC_LISTS = {
	{ key = "traits", title = "Traits", names = { "traits", "special abilities", "features", "features & traits" } },
	{ key = "actions", title = "Actions", names = { "actions" } },
	{ key = "bonusactions", title = "Bonus actions", names = { "bonus actions" } },
	{ key = "reactions", title = "Reactions", names = { "reactions" } },
	{ key = "legendaryactions", title = "Legendary actions", names = { "legendary actions" } },
	{ key = "lairactions", title = "Lair actions", names = { "lair actions" } },
};
-- Sheet fields that become NPC values, by their label in lower case.
local DETAIL_FIELDS = {
	{ path = "senses", labels = { "senses" } },
	{ path = "languages", labels = { "languages" } },
	{ path = "damagevulnerabilities", labels = { "damage vulnerabilities", "vulnerabilities" } },
	{ path = "damageresistances", labels = { "damage resistances", "resistances" } },
	{ path = "damageimmunities", labels = { "damage immunities", "immunities" } },
	{ path = "conditionimmunities", labels = { "condition immunities" } },
	{ path = "savingthrows", labels = { "saving throws", "saves" } },
	{ path = "skills", labels = { "skills" } },
};

---------------------------------------------------------------------------------------------------------------------
-- Text
---------------------------------------------------------------------------------------------------------------------

local function trim(s)
	s = string.gsub(s, "^%s+", "");
	s = string.gsub(s, "%s+$", "");
	return s;
end

function numstr(n)
	if n == math.floor(n) and math.abs(n) < 1e15 then return string.format("%.0f", n); end
	return string.format("%.4g", n);
end

-- Any value as text: strings as they are, numbers without a trailing ".0", anything else as "".
local function str(v)
	if type(v) == "string" then return v; end
	if type(v) == "number" then return numstr(v); end
	return "";
end

-- A number in a number or in text such as "15 (natural armor)" or "+4".
function num(v)
	if type(v) == "number" then return v; end
	if type(v) ~= "string" then return nil; end
	local s = string.match(v, "[%+%-]?%d+%.?%d*");
	if not s then return nil; end
	if string.sub(s, 1, 1) == "+" then s = string.sub(s, 2); end
	return tonumber(s);
end

-- Text cut to n bytes at most, without splitting a character.
function clip(s, n)
	s = trim(str(s));
	if string.len(s) <= n then return s; end
	local cut = n - 3;
	while cut > 0 do
		local b = string.byte(s, cut + 1);
		if not b or b < 128 or b >= 192 then break; end
		cut = cut - 1;
	end
	return trim(string.sub(s, 1, cut)) .. ELLIPSIS;
end

local function title(s)
	s = string.gsub(str(s), "_", " ");
	s = string.gsub(s, "(%a)([%w']*)", function (a, b) return string.upper(a) .. b; end);
	return s;
end

local function lower(s) return string.lower(trim(str(s))); end
local function orNil(s) if s == "" then return nil; end return s; end

-- The values of an array, in order. Tables from JSON may count from 0 or 1, so both work.
function items(t)
	local out = {};
	if type(t) ~= "table" then return out; end
	local keys = {};
	for k in pairs(t) do if type(k) == "number" then keys[#keys + 1] = k; end end
	table.sort(keys);
	for _, k in ipairs(keys) do out[#out + 1] = t[k]; end
	return out;
end

local function isArray(t)
	if type(t) ~= "table" then return false; end
	local n = 0;
	for k in pairs(t) do
		if type(k) ~= "number" then return false; end
		n = n + 1;
	end
	return n > 0;
end

local function sortedKeys(t)
	local keys = {};
	for k in pairs(t) do if type(k) == "string" then keys[#keys + 1] = k; end end
	table.sort(keys);
	return keys;
end

local ATTACKS = {
	mw = "Melee Weapon Attack:", rw = "Ranged Weapon Attack:", ["mw,rw"] = "Melee or Ranged Weapon Attack:",
	ms = "Melee Spell Attack:", rs = "Ranged Spell Attack:", ["ms,rs"] = "Melee or Ranged Spell Attack:",
	m = "Melee Attack Roll:", r = "Ranged Attack Roll:", ["m,r"] = "Melee or Ranged Attack Roll:",
};

-- 5etools text tags, such as {@hit 5} or {@damage 1d6 + 3}, as plain words.
function plainTags(s)
	s = str(s);
	s = string.gsub(s, "{@atkr? ([^}]+)}", function (k) return ATTACKS[trim(k)] or "Attack:"; end);
	s = string.gsub(s, "{@h}", "Hit: ");
	s = string.gsub(s, "{@hom}", "Hit or Miss: ");
	s = string.gsub(s, "{@hit ([%+%-]?%d+)}", function (n) n = tonumber(n); return (n >= 0 and "+" or "") .. numstr(n); end);
	s = string.gsub(s, "{@dc (%d+)}", "DC %1");
	s = string.gsub(s, "{@actSave (%a+)}", function (a)
		for _, ab in ipairs(ABILITIES) do if ab[2] == a then return title(ab[1]) .. " Saving Throw:"; end end
		return "Saving Throw:";
	end);
	s = string.gsub(s, "{@actSaveFail}", "Failure:");
	s = string.gsub(s, "{@actSaveSuccess}", "Success:");
	s = string.gsub(s, "{@recharge ?(%d*)}", function (n)
		if n == "" or n == "6" then return "(Recharge 6)"; end
		return "(Recharge " .. n .. "-6)";
	end);
	s = string.gsub(s, "{@%w+ ([^}|]*)[^}]*}", "%1");
	s = string.gsub(s, "{@%w+}", "");
	return s;
end

-- Text from strings, arrays of strings and 5etools entries.
function textOf(v)
	if v == nil then return ""; end
	if type(v) == "string" then return plainTags(v); end
	if type(v) == "number" then return numstr(v); end
	if type(v) ~= "table" then return ""; end
	local parts = {};
	if isArray(v) then
		for _, x in ipairs(items(v)) do
			local t = textOf(x);
			if t ~= "" then parts[#parts + 1] = t; end
		end
		return table.concat(parts, "\n");
	end
	if type(v.name) == "string" and v.name ~= "" then parts[#parts + 1] = plainTags(v.name) .. "."; end
	local body = textOf(v.entries or v.items or v.entry or v.desc or v.description or v.text);
	if body ~= "" then parts[#parts + 1] = body; end
	return table.concat(parts, " ");
end

-- Every string in a value, joined, with 5etools tags left in place.
local function rawText(v)
	if type(v) == "string" then return v; end
	if type(v) ~= "table" then return ""; end
	local parts = {};
	for _, k in ipairs(sortedKeys(v)) do parts[#parts + 1] = rawText(v[k]); end
	for _, x in ipairs(items(v)) do parts[#parts + 1] = rawText(x); end
	return table.concat(parts, " ");
end

-- A list of words from text, an array of text, or 5etools objects such as { immune = { "fire" }, note = "..." }.
local function words(v, key)
	if type(v) == "string" then return plainTags(v); end
	if type(v) ~= "table" then return ""; end
	local out = {};
	for _, x in ipairs(items(v)) do
		if type(x) == "string" then out[#out + 1] = plainTags(x);
		elseif type(x) == "table" then
			if type(x.name) == "string" then out[#out + 1] = x.name;
			elseif key and type(x[key]) == "table" then
				local inner = words(x[key], key);
				if type(x.note) == "string" then inner = inner .. " " .. plainTags(x.note); end
				if type(x.preNote) == "string" then inner = plainTags(x.preNote) .. " " .. inner; end
				out[#out + 1] = trim(inner);
			elseif type(x.special) == "string" then out[#out + 1] = plainTags(x.special);
			end
		end
	end
	return table.concat(out, ", ");
end

local ENTITIES = { amp = "&", lt = "<", gt = ">", quot = "\"", apos = "'", nbsp = " " };

-- Fantasy Grounds formatted text (<p>, <h>, <list><li>, <b> ...) as plain text, with paragraphs on their own lines.
function plainText(xml)
	local s = str(xml);
	s = string.gsub(s, "<br%s*/?>", "\n");
	s = string.gsub(s, "<li>", "- ");
	s = string.gsub(s, "</%s*([%w]+)%s*>", function (tag)
		tag = string.lower(tag);
		if tag == "p" or tag == "h" or tag == "li" or tag == "tr" or tag == "list" or tag == "frame" then return "\n"; end
		if tag == "td" then return " "; end
		return "";
	end);
	s = string.gsub(s, "<[^>]*>", "");
	s = string.gsub(s, "&#(%d+);", function (n) n = tonumber(n); if n and n < 128 then return string.char(n); end return "?"; end);
	s = string.gsub(s, "&(%a+);", function (e) return ENTITIES[string.lower(e)] or ("&" .. e .. ";"); end);
	s = string.gsub(s, "\r", "");
	s = string.gsub(s, "[ \t]+\n", "\n");
	s = string.gsub(s, "\n\n\n+", "\n\n");
	return trim(s);
end

local function escapeXml(s)
	s = string.gsub(str(s), "&", "&amp;");
	s = string.gsub(s, "<", "&lt;");
	s = string.gsub(s, ">", "&gt;");
	return s;
end

local function paragraphs(s)
	local out = {};
	s = string.gsub(str(s), "\r", "") .. "\n\n";
	for p in string.gmatch(s, "(.-)\n[ \t]*\n") do
		p = trim(p);
		if p ~= "" then out[#out + 1] = p; end
	end
	return out;
end

---------------------------------------------------------------------------------------------------------------------
-- JSON out
---------------------------------------------------------------------------------------------------------------------

-- Keys of RPG Tools sheets in the order people expect to read them; any others follow in alphabetical order.
local KEY_ORDER = {
	"format", "version", "system", "name", "role", "summary", "tags", "core", "fields", "gauges", "rolls", "lists",
	"notes", "unmapped", "source", "hp", "ac", "initiative", "speed", "section", "label", "type", "value", "max",
	"group", "formula", "attack", "damage", "damageType", "title", "items", "text", "quantity", "from", "filledBy", "date",
};
local KEY_RANK = {};
for i, k in ipairs(KEY_ORDER) do KEY_RANK[k] = i; end

local function encodeString(s)
	s = string.gsub(s, "[%c\"\\]", function (c)
		if c == "\"" then return "\\\""; end
		if c == "\\" then return "\\\\"; end
		if c == "\n" then return "\\n"; end
		if c == "\r" then return "\\r"; end
		if c == "\t" then return "\\t"; end
		return string.format("\\u%04x", string.byte(c));
	end);
	return "\"" .. s .. "\"";
end

local function isEmpty(t) return type(t) == "table" and next(t) == nil; end

-- JSON for sheets: arrays have keys 1..n, empty tables are left out of objects, and keys come in a steady order.
function encodeJSON(v, indent)
	indent = indent or "";
	local t = type(v);
	if t == "string" then return encodeString(v); end
	if t == "boolean" then return v and "true" or "false"; end
	if t == "number" then
		if v ~= v or v == math.huge or v == -math.huge then return "null"; end
		return numstr(v);
	end
	if t ~= "table" then return "null"; end
	local inner = indent .. "  ";
	if isArray(v) then
		local parts = {};
		for _, x in ipairs(items(v)) do parts[#parts + 1] = inner .. encodeJSON(x, inner); end
		return "[\n" .. table.concat(parts, ",\n") .. "\n" .. indent .. "]";
	end
	local keys = {};
	for k, x in pairs(v) do
		if type(k) == "string" and x ~= nil and not isEmpty(x) then keys[#keys + 1] = k; end
	end
	table.sort(keys, function (a, b)
		local ra, rb = KEY_RANK[a] or 1000, KEY_RANK[b] or 1000;
		if ra ~= rb then return ra < rb; end
		return a < b;
	end);
	if #keys == 0 then return "{}"; end
	local parts = {};
	for _, k in ipairs(keys) do parts[#parts + 1] = inner .. encodeString(k) .. ": " .. encodeJSON(v[k], inner); end
	return "{\n" .. table.concat(parts, ",\n") .. "\n" .. indent .. "}";
end

---------------------------------------------------------------------------------------------------------------------
-- Dice
---------------------------------------------------------------------------------------------------------------------

local function bonus(n)
	n = num(n);
	if not n or n == 0 then return ""; end
	return (n > 0 and "+" or "") .. numstr(n);
end
local function signed(n) if n >= 0 then return "+" .. numstr(n); end return numstr(n); end
local function d20(n) return "1d20" .. bonus(n); end
local function mod(score) return math.floor((score - 10) / 2); end
local function cleanDice(s)
	s = string.gsub(str(s), "%s+", "");
	s = string.gsub(s, "%+%-", "-");
	return s;
end
-- The bonus in a d20 roll such as "1d20+4" or "1d20 - 1".
local function d20Bonus(f)
	f = cleanDice(f);
	if not string.match(f, "^1?d20") then return nil; end
	local b = string.match(f, "^1?d20([%+%-]%d+)$");
	if b then return num(b); end
	if f == "d20" or f == "1d20" then return 0; end
	return nil;
end
-- The average of dice such as "2d6+3", or nil when it isn't that simple.
local function average(f)
	f = cleanDice(f);
	local n, d, rest = string.match(f, "^(%d*)d(%d+)(.*)$");
	if not d then return nil; end
	n = tonumber(n) or 1;
	local total = n * (tonumber(d) + 1) / 2;
	if rest ~= "" then
		local b = string.match(rest, "^([%+%-]%d+)$");
		if not b then return nil; end
		total = total + num(b);
	end
	return math.floor(total);
end

---------------------------------------------------------------------------------------------------------------------
-- Monster JSON to an RPG Tools sheet
---------------------------------------------------------------------------------------------------------------------

local function crText(v)
	if type(v) == "table" then v = v.cr; end
	if type(v) == "number" then
		if v == 0.125 then return "1/8"; end
		if v == 0.25 then return "1/4"; end
		if v == 0.5 then return "1/2"; end
		return numstr(v);
	end
	if type(v) == "string" and trim(v) ~= "" then return trim(v); end
	return nil;
end

local function hpOf(o)
	local hp = o.hit_points;
	if hp == nil then hp = o.hp; end
	if hp == nil then hp = o.hitPoints; end
	if type(hp) == "table" then
		local v = num(hp.average or hp.value or hp.current);
		if not v then return nil; end
		return { value = v, max = num(hp.max) or v };
	end
	local n = num(hp);
	if not n then return nil; end
	return { value = n, max = num(o.hp_max or o.max_hp) or n };
end

local function acOf(o)
	local ac = o.armor_class;
	if ac == nil then ac = o.ac; end
	if ac == nil then ac = o.armorClass; end
	if isArray(ac) then ac = items(ac)[1]; end
	if type(ac) == "table" then ac = ac.value or ac.ac; end
	local n = num(ac);
	if not n then return nil; end
	return { value = n };
end

local function armorOf(o)
	if type(o.armor_desc) == "string" and trim(o.armor_desc) ~= "" then return trim(o.armor_desc); end
	local first = items(o.ac or o.armor_class)[1];
	if type(first) ~= "table" then return nil; end
	if isArray(first.from) then return words(first.from); end
	if isArray(first.armor) then return words(first.armor); end
	if first.type == "natural" then return "natural armor"; end
	return nil;
end

local function hitDiceOf(o)
	if type(o.hit_dice) == "string" and o.hit_dice ~= "" then
		local hd = cleanDice(o.hit_dice);
		if type(o.hit_points_roll) == "string" and string.find(o.hit_points_roll, "d") then hd = cleanDice(o.hit_points_roll); end
		return hd;
	end
	if type(o.hp) == "table" and type(o.hp.formula) == "string" then return cleanDice(o.hp.formula); end
	return nil;
end

local function speedOf(o)
	local s = o.speed;
	if s == nil then return ""; end
	if type(s) ~= "table" then return str(s); end
	local keys, out = sortedKeys(s), {};
	local function add(k)
		local v = s[k];
		if v == false or k == "canHover" or k == "hover" then return; end
		if type(v) == "table" then
			local cond = type(v.condition) == "string" and (" " .. plainTags(v.condition)) or "";
			v = v.number;
			if type(v) == "number" then v = numstr(v) .. " ft." .. cond; end
		elseif type(v) == "number" then v = numstr(v) .. " ft.";
		end
		v = str(v);
		if v ~= "" then out[#out + 1] = (k == "walk" and "" or (k .. " ")) .. v; end
	end
	if s.walk ~= nil then add("walk"); end
	for _, k in ipairs(keys) do if k ~= "walk" then add(k); end end
	return table.concat(out, ", ");
end

local function typeOf(o)
	local t = o.type;
	if type(t) == "table" then
		local tags = words(t.tags);
		t = type(t.type) == "string" and t.type or nil;
		if t and tags ~= "" then t = t .. " (" .. tags .. ")"; end
	end
	if type(t) ~= "string" or t == "" then return nil; end
	if type(o.subtype) == "string" and o.subtype ~= "" then t = t .. " (" .. o.subtype .. ")"; end
	return t;
end

local function sizeOf(o)
	local s = o.size;
	if isArray(s) then s = items(s)[1]; end
	if type(s) ~= "string" then return nil; end
	return SIZES[s] or s;
end

local function alignmentOf(o)
	local a = o.alignment;
	if type(a) == "string" then return a; end
	if not isArray(a) then return nil; end
	local out = {};
	for _, x in ipairs(items(a)) do
		if type(x) ~= "string" or not ALIGN[x] then return nil; end
		out[#out + 1] = ALIGN[x];
	end
	return table.concat(out, " ");
end

local function sensesOf(o)
	local s = o.senses;
	if type(s) == "string" then return s; end
	if isArray(s) then return words(s); end
	if type(s) == "table" then
		local out = {};
		for _, k in ipairs(sortedKeys(s)) do out[#out + 1] = title(k) .. " " .. str(s[k]); end
		return table.concat(out, ", ");
	end
	return "";
end

-- An attack or action as a roll, from its numbers, or from the dice in its text.
function actionRoll(a)
	local text = textOf(a.entries or a.desc or a.description or a.text);
	local raw = rawText(a.entries or a.desc or a.description or a.text);
	local hit = num(a.attack_bonus);
	if not hit then hit = num(string.match(raw, "{@hit ([%+%-]?%d+)}") or string.match(text, "([%+%-]%d+) to hit")); end
	local dmg = "";
	local damage = items(a.damage)[1];
	if type(damage) == "table" and type(damage.damage_dice) == "string" then dmg = cleanDice(damage.damage_dice);
	elseif type(a.damage_dice) == "string" and a.damage_dice ~= "" then dmg = cleanDice(a.damage_dice) .. bonus(a.damage_bonus);
	end
	if dmg == "" then
		local d = string.match(raw, "{@damage ([^}]+)}") or string.match(text, "%((%d+d%d+%s*[%+%-]%s*%d+)%)") or string.match(text, "%((%d+d%d+)%)");
		if d then dmg = cleanDice(d); end
	end
	if not hit and dmg == "" then return nil; end
	local kind = "";
	if type(damage) == "table" and type(damage.damage_type) == "table" and type(damage.damage_type.name) == "string" then kind = damage.damage_type.name;
	else kind = string.match(text, "%d%)%s+(%a+) damage") or ""; end
	local r = { name = clip(plainTags(a.name or "Attack"), 80), group = hit and "attacks" or "other", notes = clip(text, 300) };
	if hit then r.attack = d20(hit); end
	if dmg ~= "" then r.damage = dmg; end
	if kind ~= "" then r.damageType = string.lower(kind); end
	return r;
end

local function looksLikeStatblock(o)
	if type(o) ~= "table" or type(o.name) ~= "string" then return false; end
	local keys = { "hit_points", "hp", "hitPoints", "armor_class", "ac", "armorClass", "strength", "str", "actions", "action" };
	for _, k in ipairs(keys) do if o[k] ~= nil then return true; end end
	return false;
end

-- A monster or character in a common JSON shape, as an RPG Tools sheet.
function fromStatblock(o)
	local fields, rolls, lists, tags = {}, {}, {}, {};
	local profs = items(o.proficiencies);
	local function addField(section, label, value)
		if value == nil or value == "" or type(value) == "table" or type(value) == "boolean" then return; end
		if type(value) == "number" then fields[#fields + 1] = { section = section, label = label, type = "number", value = value };
		else fields[#fields + 1] = { section = section, label = label, type = "text", value = clip(value, 200) }; end
	end
	local function profValue(name)
		for _, p in ipairs(profs) do
			if type(p) == "table" and type(p.proficiency) == "table" and lower(p.proficiency.name) == name then return num(p.value); end
		end
		return nil;
	end
	for _, ab in ipairs(ABILITIES) do
		local raw = o[ab[1]];
		if raw == nil then raw = o[ab[2]]; end
		if raw == nil and type(o.ability_scores) == "table" then raw = o.ability_scores[ab[1]]; end
		local score = num(raw);
		if score then
			addField("Abilities", title(ab[1]), score);
			rolls[#rolls + 1] = { name = title(ab[1]) .. " check", group = "skills", formula = d20(mod(score)) };
			local save = num(o[ab[1] .. "_save"]);
			if not save and type(o.save) == "table" then save = num(o.save[ab[2]]); end
			save = profValue("saving throw: " .. ab[2]) or save;
			if save then rolls[#rolls + 1] = { name = title(ab[1]) .. " save", group = "saves", formula = d20(save) }; end
		end
	end
	local skills = type(o.skills) == "table" and o.skills or (type(o.skill) == "table" and o.skill or {});
	for _, k in ipairs(sortedKeys(skills)) do
		local v = num(skills[k]);
		if v then rolls[#rolls + 1] = { name = title(k), group = "skills", formula = d20(v) }; end
	end
	for _, p in ipairs(profs) do
		local n = type(p) == "table" and type(p.proficiency) == "table" and str(p.proficiency.name) or "";
		if string.lower(string.sub(n, 1, 7)) == "skill: " and num(p.value) then
			rolls[#rolls + 1] = { name = string.sub(n, 8), group = "skills", formula = d20(num(p.value)) };
		end
	end

	local cr = crText(o.challenge_rating);
	if not cr then cr = crText(o.cr); end
	if not cr then cr = crText(o.challenge); end
	if cr then tags[#tags + 1] = "CR " .. cr; addField("Details", "Challenge rating", cr); end
	addField("Details", "XP", num(o.xp));
	addField("Details", "Armor", armorOf(o));
	addField("Details", "Hit dice", hitDiceOf(o));
	addField("Details", "Senses", sensesOf(o));
	addField("Details", "Languages", words(o.languages));
	addField("Details", "Damage vulnerabilities", words(o.damage_vulnerabilities or o.vulnerable, "vulnerable"));
	addField("Details", "Damage resistances", words(o.damage_resistances or o.resist, "resist"));
	addField("Details", "Damage immunities", words(o.damage_immunities or o.immune, "immune"));
	addField("Details", "Condition immunities", words(o.condition_immunities or o.conditionImmune, "conditionImmune"));
	if o.passive ~= nil then addField("Details", "Passive Perception", num(o.passive)); end

	local function asList(key, heading, makeRolls)
		local arr = items(o[key]);
		if #arr == 0 then return; end
		local out = {};
		for i, a in ipairs(arr) do
			if i > 200 then break; end
			if type(a) == "table" then
				if makeRolls then
					local r = actionRoll(a);
					if r then rolls[#rolls + 1] = r; end
				end
				out[#out + 1] = { name = clip(plainTags(a.name or heading), 120), text = clip(textOf(a.entries or a.desc or a.description or a.text), 2000) };
			end
		end
		if #out > 0 then lists[#lists + 1] = { title = heading, items = out }; end
	end
	asList(o.special_abilities and "special_abilities" or "trait", "Traits", false);
	asList(o.actions and "actions" or "action", "Actions", true);
	asList(o.bonus_actions and "bonus_actions" or "bonus", "Bonus actions", true);
	asList(o.reactions and "reactions" or "reaction", "Reactions", false);
	asList(o.legendary_actions and "legendary_actions" or "legendary", "Legendary actions", true);

	local init = o.initiative;
	if type(init) == "table" then init = init.proficiency; end
	init = num(init);
	local dex = num(o.dexterity or o.dex);
	local core, hp, ac, speed = {}, hpOf(o), acOf(o), speedOf(o);
	if hp then core.hp = hp; end
	if ac then core.ac = ac; end
	if init or dex then core.initiative = { formula = d20(init or mod(dex)) }; end
	if speed ~= "" then core.speed = clip(speed, 60); end

	local summary = {};
	local size, kind, alignment = sizeOf(o), typeOf(o), alignmentOf(o);
	if size then summary[#summary + 1] = size; end
	if kind then summary[#summary + 1] = kind; end
	local summaryText = table.concat(summary, " ");
	if alignment and alignment ~= "" then summaryText = summaryText .. (summaryText ~= "" and ", " or "") .. alignment; end

	local trimmedRolls = {};
	for i, r in ipairs(rolls) do if i <= 150 then trimmedRolls[i] = r; end end
	return {
		format = FORMAT, version = 1, system = (cr or dex) and "D&D 5e" or nil, name = clip(o.name, 120),
		role = cr and "creature" or "npc",
		summary = summaryText ~= "" and clip(summaryText, 300) or nil,
		tags = tags, core = core, fields = fields, rolls = trimmedRolls, lists = lists,
		notes = orNil(clip(textOf(o.desc or o.description or o.fluff), 20000)),
		source = { from = clip(str(o.document__title) ~= "" and o.document__title or (str(o.source) ~= "" and o.source or "JSON file"), 120), filledBy = "RPG Tools for Fantasy Grounds" },
	};
end

local LIST_KEYS = { "characters", "sheets", "monster", "monsters", "creatures", "results", "npcs" };

-- Every sheet in some JSON: RPG Tools sheets, lists of them, common monster files, and single statblocks.
function sheetsIn(json)
	local out, skipped = {}, 0;
	local function walk(v, depth)
		if depth > 3 or type(v) ~= "table" then return; end
		if isArray(v) then
			for _, x in ipairs(items(v)) do walk(x, depth + 1); end
			return;
		end
		if v.format == FORMAT then out[#out + 1] = v; return; end
		local found = false;
		for _, k in ipairs(LIST_KEYS) do
			if isArray(v[k]) then found = true; walk(v[k], depth + 1); end
		end
		if found then return; end
		if looksLikeStatblock(v) then out[#out + 1] = fromStatblock(v); return; end
		skipped = skipped + 1;
	end
	walk(json, 0);
	local named = {};
	for _, s in ipairs(out) do
		if type(s.name) == "string" and trim(s.name) ~= "" then named[#named + 1] = s; else skipped = skipped + 1; end
	end
	return named, skipped;
end

---------------------------------------------------------------------------------------------------------------------
-- RPG Tools sheet to a Fantasy Grounds NPC
---------------------------------------------------------------------------------------------------------------------

local function inParens(s)
	s = trim(str(s));
	if s == "" then return nil; end
	if string.sub(s, 1, 1) == "(" then return s; end
	return "(" .. s .. ")";
end
local function outOfParens(s)
	s = trim(str(s));
	local inner = string.match(s, "^%((.*)%)$");
	return inner and trim(inner) or s;
end

-- "Small humanoid (goblinoid), neutral evil" as size, type and alignment, when it starts with a size.
local function splitSummary(summary)
	local s = trim(str(summary));
	local first, rest = string.match(s, "^(%a+)%s*(.*)$");
	if not first or not SIZE_WORDS[string.lower(first)] then return nil; end
	local kind, alignment = string.match(rest, "^([^,]*),%s*(.*)$");
	if not kind then kind = rest; end
	return SIZE_WORDS[string.lower(first)], trim(kind or ""), trim(alignment or "");
end

local function rollList(sheet, group, skipChecks)
	local out = {};
	for _, r in ipairs(items(sheet.rolls)) do
		if type(r) == "table" and r.group == group and type(r.name) == "string" then
			local b = d20Bonus(r.formula);
			local name = trim(r.name);
			if skipChecks and string.match(string.lower(name), " check$") then b = nil; end
			if b and name ~= "" then out[#out + 1] = { name = name, bonus = b }; end
		end
	end
	return out;
end

local function shortAbility(name)
	local n = string.lower(name);
	for _, ab in ipairs(ABILITIES) do
		if string.find(n, ab[1], 1, true) == 1 or string.find(n, ab[2], 1, true) == 1 then return ab[3]; end
	end
	return nil;
end

local function attackDesc(r)
	local parts = {};
	local hit = d20Bonus(r.attack);
	if hit then parts[#parts + 1] = "Weapon Attack: " .. signed(hit) .. " to hit, one target."; end
	if type(r.damage) == "string" and r.damage ~= "" then
		local avg = average(r.damage);
		local kind = type(r.damageType) == "string" and r.damageType ~= "" and (r.damageType .. " ") or "";
		local dice = string.gsub(cleanDice(r.damage), "([%+%-])", " %1 ");
		parts[#parts + 1] = "Hit: " .. (avg and (numstr(avg) .. " (" .. dice .. ")") or dice) .. " " .. kind .. "damage.";
	end
	if #parts == 0 then return nil; end
	local desc = table.concat(parts, " ");
	if type(r.notes) == "string" and r.notes ~= "" and not string.find(r.notes, "to hit", 1, true) then desc = desc .. " " .. r.notes; end
	return desc;
end

-- What an RPG Tools sheet becomes in a 5E NPC record: values by path, the lists, and the text on its Other tab.
function npcPlan(sheet)
	local plan = { name = clip(sheet.name, 120), values = {}, lists = {} };
	local function set(path, kind, value)
		if value == nil or value == "" then return; end
		plan.values[#plan.values + 1] = { path = path, kind = kind, value = value };
	end
	local byLabel, used = {}, {};
	for i, f in ipairs(items(sheet.fields)) do
		if type(f) == "table" and type(f.label) == "string" then
			local k = lower(f.label);
			if byLabel[k] == nil then byLabel[k] = i; end
		end
	end
	local fields = items(sheet.fields);
	local function field(labels)
		for _, label in ipairs(labels) do
			local i = byLabel[label];
			if i then
				local v = fields[i].value;
				if v ~= nil and v ~= "" and type(v) ~= "table" and type(v) ~= "boolean" then used[i] = true; return v; end
			end
		end
		return nil;
	end
	local core = type(sheet.core) == "table" and sheet.core or {};

	local size, kind, alignment = splitSummary(sheet.summary);
	size = field({ "size" }) or size;
	kind = field({ "type", "creature type" }) or kind;
	alignment = field({ "alignment" }) or alignment;
	set("size", "string", str(size));
	set("type", "string", str(kind));
	set("alignment", "string", str(alignment));

	local ac = type(core.ac) == "table" and num(core.ac.value) or nil;
	ac = ac or num(field({ "armor class", "ac" }));
	set("ac", "number", ac);
	set("actext", "string", inParens(field({ "armor", "armor type" })));
	local hp = type(core.hp) == "table" and num(core.hp.max or core.hp.value) or nil;
	hp = hp or num(field({ "hit points", "hp" }));
	set("hp", "number", hp);
	set("hd", "string", inParens(field({ "hit dice", "hd" })));
	set("speed", "string", str(core.speed) ~= "" and str(core.speed) or str(field({ "speed" })));

	for _, ab in ipairs(ABILITIES) do
		local score = num(field({ ab[1], ab[2] }));
		if score then
			set("abilities." .. ab[1] .. ".score", "number", score);
			set("abilities." .. ab[1] .. ".bonus", "number", mod(score));
		end
	end

	local cr = field({ "challenge rating", "challenge", "cr" });
	if not cr then
		for _, t in ipairs(items(sheet.tags)) do
			local c = string.match(str(t), "^CR%s+(%S+)$");
			if c then cr = c; end
		end
	end
	cr = crText(cr);
	set("cr", "string", cr);
	set("xp", "number", num(field({ "xp", "experience" })) or (cr and CR_XP[cr]) or nil);

	for _, d in ipairs(DETAIL_FIELDS) do set(d.path, "string", str(field(d.labels))); end
	local function hasValue(path) for _, v in ipairs(plan.values) do if v.path == path then return true; end end return false; end
	if not hasValue("savingthrows") then
		local out = {};
		for _, r in ipairs(rollList(sheet, "saves")) do
			local short = shortAbility(r.name);
			if short then out[#out + 1] = short .. " " .. signed(r.bonus); end
		end
		set("savingthrows", "string", table.concat(out, ", "));
	end
	if not hasValue("skills") then
		local out = {};
		for _, r in ipairs(rollList(sheet, "skills", true)) do out[#out + 1] = r.name .. " " .. signed(r.bonus); end
		set("skills", "string", table.concat(out, ", "));
	end
	local passive = num(field({ "passive perception" }));
	if passive then
		local senses;
		for _, v in ipairs(plan.values) do if v.path == "senses" then senses = v; end end
		if not senses then set("senses", "string", "passive Perception " .. numstr(passive));
		elseif not string.find(string.lower(senses.value), "passive", 1, true) then senses.value = senses.value .. ", passive Perception " .. numstr(passive); end
	end

	-- Lists: the ones a 5E NPC has, by title. Any others go on the Other tab.
	local other = {};
	local named = {};
	for _, l in ipairs(items(sheet.lists)) do
		if type(l) == "table" and type(l.title) == "string" then
			local t, target = lower(l.title), nil;
			for _, spec in ipairs(NPC_LISTS) do
				for _, n in ipairs(spec.names) do if t == n then target = spec.key; end end
			end
			if target then
				local into = plan.lists[target] or {};
				for _, it in ipairs(items(l.items)) do
					if type(it) == "table" and type(it.name) == "string" and trim(it.name) ~= "" then
						into[#into + 1] = { name = clip(it.name, 120), desc = trim(str(it.text)) };
						named[lower(it.name)] = true;
					end
				end
				plan.lists[target] = into;
			else
				other[#other + 1] = l;
			end
		end
	end
	-- Attacks without an action of the same name become actions that Fantasy Grounds can roll.
	for _, r in ipairs(items(sheet.rolls)) do
		if type(r) == "table" and r.group == "attacks" and type(r.name) == "string" and not named[lower(r.name)] then
			local desc = attackDesc(r);
			if desc then
				plan.lists.actions = plan.lists.actions or {};
				table.insert(plan.lists.actions, { name = clip(r.name, 120), desc = desc });
				named[lower(r.name)] = true;
			end
		end
	end

	-- The Other tab: notes, then everything that has no place of its own on an NPC.
	local html = {};
	for _, p in ipairs(paragraphs(sheet.notes)) do html[#html + 1] = "<p>" .. escapeXml(p) .. "</p>"; end
	local function listBlock(heading, lines)
		if #lines == 0 then return; end
		html[#html + 1] = "<h>" .. escapeXml(heading) .. "</h><list>";
		for _, line in ipairs(lines) do html[#html + 1] = "<li>" .. line .. "</li>"; end
		html[#html + 1] = "</list>";
	end
	local more = {};
	if not size and str(sheet.summary) ~= "" then more[#more + 1] = escapeXml(sheet.summary); end
	if sheet.role == "pc" or sheet.role == "companion" then more[#more + 1] = "An RPG Tools character, imported as an NPC."; end
	for i, f in ipairs(fields) do
		if not used[i] and type(f) == "table" and type(f.label) == "string" then
			local v = f.value;
			if type(v) == "boolean" then v = v and "yes" or "no"; end
			if type(v) == "string" or type(v) == "number" then
				if str(v) ~= "" then more[#more + 1] = "<b>" .. escapeXml(f.label) .. ":</b> " .. escapeXml(str(v)); end
			end
		end
	end
	for _, g in ipairs(items(sheet.gauges)) do
		if type(g) == "table" and type(g.label) == "string" then
			more[#more + 1] = "<b>" .. escapeXml(g.label) .. ":</b> " .. escapeXml(str(g.value)) .. " / " .. escapeXml(str(g.max));
		end
	end
	if str(sheet.money) ~= "" then more[#more + 1] = "<b>Money:</b> " .. escapeXml(sheet.money); end
	local conditions = {};
	for _, c in ipairs(items(sheet.conditions)) do conditions[#conditions + 1] = escapeXml(str(c)); end
	if #conditions > 0 then more[#more + 1] = "<b>Conditions:</b> " .. table.concat(conditions, ", "); end
	listBlock("More from RPG Tools", more);
	for _, l in ipairs(other) do
		local lines = {};
		for _, it in ipairs(items(l.items)) do
			if type(it) == "table" and type(it.name) == "string" then
				local line = "<b>" .. escapeXml(it.name) .. "</b>";
				if num(it.quantity) and num(it.quantity) ~= 1 then line = line .. " x" .. numstr(num(it.quantity)); end
				if str(it.text) ~= "" then line = line .. ": " .. escapeXml(it.text); end
				lines[#lines + 1] = line;
			end
		end
		listBlock(l.title, lines);
	end
	local otherRolls = {};
	for _, r in ipairs(items(sheet.rolls)) do
		if type(r) == "table" and (r.group == "spells" or r.group == "other") and type(r.name) == "string" and not named[lower(r.name)] then
			local dice = str(r.formula) ~= "" and r.formula or table.concat({ str(r.attack), str(r.damage) }, " ");
			otherRolls[#otherRolls + 1] = "<b>" .. escapeXml(r.name) .. ":</b> " .. escapeXml(trim(dice));
		end
	end
	listBlock("Other rolls", otherRolls);
	local unmapped = {};
	for _, u in ipairs(items(sheet.unmapped)) do unmapped[#unmapped + 1] = escapeXml(str(u)); end
	listBlock("Not placed on the sheet", unmapped);
	local from = type(sheet.source) == "table" and str(sheet.source.from) or "";
	html[#html + 1] = "<p><i>Imported from RPG Tools" .. (from ~= "" and (" (" .. escapeXml(from) .. ")") or "") .. ".</i></p>";
	plan.text = table.concat(html, "");
	return plan;
end

---------------------------------------------------------------------------------------------------------------------
-- Fantasy Grounds records to RPG Tools sheets
---------------------------------------------------------------------------------------------------------------------

local function getString(node, path) return trim(str(DB.getValue(node, path, ""))); end
local function getNumber(node, path) return num(DB.getValue(node, path)); end

-- The children of a list node, in their order in the record.
local function childrenOf(node, path)
	local out, names = {}, {};
	local kids = DB.getChildren(node, path) or {};
	for name in pairs(kids) do names[#names + 1] = name; end
	table.sort(names);
	for _, name in ipairs(names) do out[#out + 1] = kids[name]; end
	return out;
end

-- "Dex +4, Con +3" as rolls.
local function bonusRolls(text, group, nameOf)
	local out = {};
	for part in string.gmatch(str(text), "[^,;]+") do
		local name, b = string.match(part, "^%s*(.-)%s*([%+%-]%s*%d+)%s*$");
		if name and name ~= "" then
			b = num(string.gsub(b, "%s", ""));
			out[#out + 1] = { name = nameOf(name), group = group, formula = d20(b) };
		end
	end
	return out;
end

local function saveName(short)
	local n = string.lower(trim(short));
	for _, ab in ipairs(ABILITIES) do
		if n == ab[2] or n == ab[1] then return title(ab[1]) .. " save"; end
	end
	return short .. " save";
end

-- A 5E NPC record as an RPG Tools sheet.
function npcSheet(node)
	local fields, rolls, lists, tags = {}, {}, {}, {};
	local function addField(section, label, value)
		if value == nil or value == "" then return; end
		if type(value) == "number" then fields[#fields + 1] = { section = section, label = label, type = "number", value = value };
		else fields[#fields + 1] = { section = section, label = label, type = "text", value = clip(value, 200) }; end
	end
	local dex;
	for _, ab in ipairs(ABILITIES) do
		local score = getNumber(node, "abilities." .. ab[1] .. ".score");
		if score then
			if ab[1] == "dexterity" then dex = score; end
			addField("Abilities", title(ab[1]), score);
			rolls[#rolls + 1] = { name = title(ab[1]) .. " check", group = "skills", formula = d20(mod(score)) };
		end
	end
	for _, r in ipairs(bonusRolls(getString(node, "savingthrows"), "saves", saveName)) do rolls[#rolls + 1] = r; end
	for _, r in ipairs(bonusRolls(getString(node, "skills"), "skills", function (n) return n; end)) do rolls[#rolls + 1] = r; end

	local cr = crText(getString(node, "cr"));
	if cr then tags[#tags + 1] = "CR " .. cr; addField("Details", "Challenge rating", cr); end
	addField("Details", "XP", getNumber(node, "xp"));
	addField("Details", "Armor", outOfParens(getString(node, "actext")));
	addField("Details", "Hit dice", outOfParens(getString(node, "hd")));
	addField("Details", "Saving throws", getString(node, "savingthrows"));
	addField("Details", "Skills", getString(node, "skills"));
	addField("Details", "Senses", getString(node, "senses"));
	addField("Details", "Languages", getString(node, "languages"));
	addField("Details", "Damage vulnerabilities", getString(node, "damagevulnerabilities"));
	addField("Details", "Damage resistances", getString(node, "damageresistances"));
	addField("Details", "Damage immunities", getString(node, "damageimmunities"));
	addField("Details", "Condition immunities", getString(node, "conditionimmunities"));

	for _, spec in ipairs(NPC_LISTS) do
		local out = {};
		for _, child in ipairs(childrenOf(node, spec.key)) do
			local name, desc = getString(child, "name"), getString(child, "desc");
			if name ~= "" then
				out[#out + 1] = { name = clip(name, 120), text = clip(desc, 2000) };
				if spec.key ~= "traits" and spec.key ~= "reactions" then
					local r = actionRoll({ name = name, desc = desc });
					if r then rolls[#rolls + 1] = r; end
				end
			end
		end
		if #out > 0 then lists[#lists + 1] = { title = spec.title, items = out }; end
	end

	local core = {};
	local hp, ac, speed = getNumber(node, "hp"), getNumber(node, "ac"), getString(node, "speed");
	if hp then core.hp = { value = hp, max = hp }; end
	if ac then core.ac = { value = ac }; end
	if dex then core.initiative = { formula = d20(mod(dex)) }; end
	if speed ~= "" then core.speed = clip(speed, 60); end

	local summary = trim(getString(node, "size") .. " " .. getString(node, "type"));
	local alignment = getString(node, "alignment");
	if alignment ~= "" then summary = summary .. (summary ~= "" and ", " or "") .. alignment; end
	local trimmedRolls = {};
	for i, r in ipairs(rolls) do if i <= 150 then trimmedRolls[i] = r; end end
	return {
		format = FORMAT, version = 1, system = "D&D 5e", name = clip(getString(node, "name"), 120), role = cr and "creature" or "npc",
		summary = summary ~= "" and clip(summary, 300) or nil, tags = tags, core = core, fields = fields, rolls = trimmedRolls, lists = lists,
		notes = orNil(clip(plainText(DB.getValue(node, "text", "")), 20000)),
		source = { from = "Fantasy Grounds", filledBy = "RPG Tools for Fantasy Grounds" },
	};
end

local SKILL_ABILITY = {
	acrobatics = "dexterity", ["animal handling"] = "wisdom", arcana = "intelligence", athletics = "strength",
	deception = "charisma", history = "intelligence", insight = "wisdom", intimidation = "charisma",
	investigation = "intelligence", medicine = "wisdom", nature = "intelligence", perception = "wisdom",
	performance = "charisma", persuasion = "charisma", religion = "intelligence", ["sleight of hand"] = "dexterity",
	stealth = "dexterity", survival = "wisdom",
};

-- A 5E character record as an RPG Tools sheet: the basics, its skills, features and inventory.
function pcSheet(node)
	local fields, rolls, lists = {}, {}, {};
	local function addField(section, label, value)
		if value == nil or value == "" then return; end
		if type(value) == "number" then fields[#fields + 1] = { section = section, label = label, type = "number", value = value };
		else fields[#fields + 1] = { section = section, label = label, type = "text", value = clip(value, 200) }; end
	end
	local prof = getNumber(node, "profbonus");
	local bonuses = {};
	for _, ab in ipairs(ABILITIES) do
		local score = getNumber(node, "abilities." .. ab[1] .. ".score");
		if score then
			bonuses[ab[1]] = getNumber(node, "abilities." .. ab[1] .. ".bonus") or mod(score);
			addField("Abilities", title(ab[1]), score);
			rolls[#rolls + 1] = { name = title(ab[1]) .. " check", group = "skills", formula = d20(bonuses[ab[1]]) };
			local save = getNumber(node, "abilities." .. ab[1] .. ".save");
			if not save and prof and getNumber(node, "abilities." .. ab[1] .. ".saveprof") == 1 then save = bonuses[ab[1]] + prof; end
			if save then rolls[#rolls + 1] = { name = title(ab[1]) .. " save", group = "saves", formula = d20(save) }; end
		end
	end
	for _, s in ipairs(childrenOf(node, "skilllist")) do
		local name = getString(s, "name");
		local total = getNumber(s, "total");
		if not total then
			local ability = SKILL_ABILITY[string.lower(name)];
			local p = getNumber(s, "prof") or 0;
			if ability and bonuses[ability] then total = bonuses[ability] + math.floor(p * (prof or 0)); end
		end
		if name ~= "" and total then rolls[#rolls + 1] = { name = name, group = "skills", formula = d20(total) }; end
	end
	addField("Details", "Proficiency bonus", prof);
	addField("Details", "Background", getString(node, "background"));
	addField("Details", "Alignment", getString(node, "alignment"));
	addField("Details", "Senses", getString(node, "senses"));
	addField("Details", "Languages", (function ()
		local out = {};
		for _, l in ipairs(childrenOf(node, "languagelist")) do out[#out + 1] = getString(l, "name"); end
		return table.concat(out, ", ");
	end)());

	local classes, level = {}, getNumber(node, "level");
	for _, c in ipairs(childrenOf(node, "classes")) do
		local name, lv = getString(c, "name"), getNumber(c, "level");
		if name ~= "" then classes[#classes + 1] = name .. (lv and (" " .. numstr(lv)) or ""); end
	end
	addField("Details", "Level", level);
	local summary = trim(getString(node, "race") .. " " .. table.concat(classes, " / "));

	local function namedList(path, heading, withText)
		local out = {};
		for _, child in ipairs(childrenOf(node, path)) do
			local name = getString(child, "name");
			if name ~= "" then
				local it = { name = clip(name, 120) };
				if withText then
					local t = plainText(DB.getValue(child, "text", ""));
					if t ~= "" then it.text = clip(t, 2000); end
				else
					local n = getNumber(child, "count");
					if n then it.quantity = n; end
				end
				out[#out + 1] = it;
			end
		end
		if #out > 0 then lists[#lists + 1] = { title = heading, items = out }; end
	end
	namedList("featurelist", "Features", true);
	namedList("traitlist", "Traits", true);
	namedList("featlist", "Feats", true);
	namedList("inventorylist", "Inventory", false);

	for _, w in ipairs(childrenOf(node, "weaponlist")) do
		local name = getString(w, "name");
		local hit = getNumber(w, "attackbonus");
		if name ~= "" and hit then rolls[#rolls + 1] = { name = name, group = "attacks", attack = d20(hit) }; end
	end

	local core = {};
	local total, wounds = getNumber(node, "hp.total"), getNumber(node, "hp.wounds") or 0;
	if total then core.hp = { value = math.max(total - wounds, 0), max = total }; end
	local ac = getNumber(node, "defenses.ac.total");
	if ac then core.ac = { value = ac }; end
	local init = getNumber(node, "initiative.total") or bonuses.dexterity;
	if init then core.initiative = { formula = d20(init) }; end
	local speed = getNumber(node, "speed.total") or getNumber(node, "speed.base");
	if speed then core.speed = numstr(speed) .. " ft."; end

	local notes = {};
	for _, path in ipairs({ "notes", "appearance", "personalitytraits", "ideals", "bonds", "flaws" }) do
		local t = plainText(DB.getValue(node, path, ""));
		if t ~= "" then notes[#notes + 1] = t; end
	end
	local trimmedRolls = {};
	for i, r in ipairs(rolls) do if i <= 150 then trimmedRolls[i] = r; end end
	return {
		format = FORMAT, version = 1, system = "D&D 5e", name = clip(getString(node, "name"), 120), role = "pc",
		summary = summary ~= "" and clip(summary, 300) or nil, core = core, fields = fields, rolls = trimmedRolls, lists = lists,
		notes = orNil(clip(table.concat(notes, "\n\n"), 20000)),
		source = { from = "Fantasy Grounds", filledBy = "RPG Tools for Fantasy Grounds" },
	};
end

---------------------------------------------------------------------------------------------------------------------
-- Fantasy Grounds glue
---------------------------------------------------------------------------------------------------------------------

local MARK = "rpgtools";

function say(text)
	Comm.addChatMessage({ text = "RPG Tools: " .. text, font = "systemfont" });
end

local function isHost() return Session and Session.IsHost; end

-- An NPC this script imported before, by name, so importing it again updates it.
local function importedNpc(name)
	local want = string.lower(name);
	for _, node in pairs(DB.getChildren("npc") or {}) do
		if string.lower(getString(node, "name")) == want and getString(node, MARK) ~= "" then return node; end
	end
	return nil;
end

-- Writes a plan to an NPC record: a new one, or one this script imported before with the same name.
function writeNpc(plan)
	local node = importedNpc(plan.name);
	local updated = node ~= nil;
	if not node then node = DB.createChild(DB.createNode("npc")); end
	DB.setValue(node, "name", "string", plan.name);
	for _, v in ipairs(plan.values) do DB.setValue(node, v.path, v.kind, v.value); end
	for _, spec in ipairs(NPC_LISTS) do
		local old = DB.getChild(node, spec.key);
		if old then DB.deleteNode(old); end
		local list = plan.lists[spec.key];
		if list and #list > 0 then
			local parent = DB.createChild(node, spec.key);
			for _, it in ipairs(list) do
				local child = DB.createChild(parent);
				DB.setValue(child, "name", "string", it.name);
				DB.setValue(child, "desc", "string", it.desc);
			end
		end
	end
	DB.setValue(node, "text", "formattedtext", plan.text);
	DB.setValue(node, MARK, "string", "Imported from RPG Tools");
	return node, updated;
end

local function decode(text)
	if not (Utility and Utility.decodeJSON) then return nil, "This Fantasy Grounds can't read JSON. Update Fantasy Grounds Unity and try again."; end
	text = str(text);
	local start = string.find(text, "[%[{]");
	if not start then return nil, "There is no JSON in it."; end
	local finish = 0;
	for i = string.len(text), start, -1 do
		local c = string.sub(text, i, i);
		if c == "}" or c == "]" then finish = i; break; end
	end
	local ok, value = pcall(Utility.decodeJSON, string.sub(text, start, finish));
	if not ok or type(value) ~= "table" then return nil, "Its JSON can't be read. Check that it is a whole JSON file."; end
	return value;
end

-- Imports every sheet in some JSON text as NPCs, and says what happened in chat.
function importText(text, from)
	local json, problem = decode(text);
	if not json then say(from .. ": " .. problem); return; end
	local sheets, skipped = sheetsIn(json);
	if #sheets == 0 then
		say(from .. " holds no RPG Tools sheets or monsters" .. (skipped > 0 and (" (" .. skipped .. " entries skipped)") or "") .. ".");
		return;
	end
	local made, updated, names, failed = 0, 0, {}, {};
	for i, sheet in ipairs(sheets) do
		if i > MAX_IMPORT then break; end
		local ok, err = pcall(function ()
			local _, again = writeNpc(npcPlan(sheet));
			if again then updated = updated + 1; else made = made + 1; end
		end);
		if ok then
			if #names < 12 then names[#names + 1] = clip(sheet.name, 40); end
		else
			failed[#failed + 1] = clip(sheet.name, 40) .. " (" .. tostring(err) .. ")";
		end
	end
	local parts = {};
	if made > 0 then parts[#parts + 1] = "added " .. made .. " NPC" .. (made == 1 and "" or "s"); end
	if updated > 0 then parts[#parts + 1] = "updated " .. updated; end
	local shown = table.concat(names, ", ") .. (made + updated > #names and ", ..." or "");
	local msg = from .. ": " .. (#parts > 0 and table.concat(parts, ", ") or "nothing imported") .. (shown ~= "" and (": " .. shown) or "") .. ".";
	if #sheets > MAX_IMPORT then msg = msg .. " Only the first " .. MAX_IMPORT .. " of " .. #sheets .. " were read."; end
	if skipped > 0 then msg = msg .. " Skipped " .. skipped .. " entr" .. (skipped == 1 and "y" or "ies") .. " that weren't sheets or monsters."; end
	if #failed > 0 then msg = msg .. " Couldn't import: " .. table.concat(failed, "; ") .. "."; end
	say(msg .. " They're in the NPCs list.");
end

-- The NPC or character with this name. Players can only reach characters they own.
function findRecord(name)
	local want = string.lower(trim(name));
	local function search(root, kind)
		local exact, partial = nil, {};
		for _, node in pairs(DB.getChildren(root) or {}) do
			local n = string.lower(getString(node, "name"));
			if isHost() or DB.isOwner(node) then
				if n == want then exact = node; elseif string.find(n, want, 1, true) then partial[#partial + 1] = node; end
			end
		end
		if exact then return exact, kind; end
		if #partial == 1 then return partial[1], kind; end
		return nil, kind, #partial;
	end
	local node, kind, many = nil, nil, 0;
	if isHost() then
		local n;
		node, kind, n = search("npc", "npc");
		many = n or 0;
		if node then return node, kind; end
	end
	local n;
	node, kind, n = search("charsheet", "pc");
	many = many + (n or 0);
	return node, kind, many;
end

local function sheetFor(name)
	if trim(str(name)) == "" then say("Name the NPC or character, like /rpgtools export Goblin."); return nil; end
	local node, kind, many = findRecord(name);
	if not node then
		if many and many > 1 then say("More than one NPC or character matches \"" .. name .. "\". Type more of the name.");
		else say("There's no NPC or character named \"" .. name .. "\"" .. (isHost() and "" or " that you own") .. "."); end
		return nil;
	end
	if kind == "pc" then return pcSheet(node); end
	return npcSheet(node);
end

local JSON_FILTER = { json = "JSON files" };

local function firstPath(path)
	if type(path) == "table" then return items(path)[1] or path[1]; end
	return path;
end

function importFile()
	if not isHost() then say("Only the GM can import."); return; end
	Interface.dialogFileOpen(function (result, path)
		path = firstPath(path);
		if result ~= "ok" or type(path) ~= "string" then return; end
		local text = File.openTextFile(path);
		if not text then say("Fantasy Grounds couldn't open " .. path .. "."); return; end
		importText(text, string.match(path, "([^/\\]+)$") or path);
	end, JSON_FILTER, nil, false);
end

function importClipboard()
	if not isHost() then say("Only the GM can import."); return; end
	local text = Interface.clipboardGetText();
	if not text or trim(text) == "" then say("The clipboard is empty. Copy a JSON file's text, then type /rpgtools paste."); return; end
	importText(text, "The clipboard");
end

function exportFile(name)
	local sheet = sheetFor(name);
	if not sheet then return; end
	local text = encodeJSON(sheet) .. "\n";
	Interface.dialogFileSave(function (result, path)
		path = firstPath(path);
		if result ~= "ok" or type(path) ~= "string" then return; end
		if not string.match(path, "%.[%w]+$") then path = path .. ".json"; end
		if File.saveTextFile(path, text) == false then say("Fantasy Grounds couldn't save " .. path .. "."); return; end
		say("Saved " .. sheet.name .. " to " .. path .. ". In RPG Tools, open the Encyclopedia and use Import a sheet.");
	end, JSON_FILTER, nil);
end

function exportClipboard(name)
	local sheet = sheetFor(name);
	if not sheet then return; end
	Interface.clipboardSetText(encodeJSON(sheet) .. "\n");
	say("Copied " .. sheet.name .. " as an RPG Tools sheet. In RPG Tools, open the Encyclopedia, use Import a sheet and paste it.");
end

---------------------------------------------------------------------------------------------------------------------
-- Reaching RPG Tools from Fantasy Grounds
---------------------------------------------------------------------------------------------------------------------

-- The site to reach: the one this copy was downloaded from, or one named in the command.
function siteOf(given)
	local site = trim(str(given));
	if site == "" then site = SITE; end
	if string.find(site, "__RPG_TOOLS", 1, true) then return nil; end
	if not string.match(site, "^https?://") then site = "https://" .. site; end
	site = string.gsub(site, "/+$", "");
	return site;
end

local function urlEncode(s)
	return (string.gsub(str(s), "[^%w%-%._~]", function (c) return string.format("%%%02X", string.byte(c)); end));
end

-- Fantasy Grounds Unity 5.1 and later answer Interface.openURL(url, callback) with the page's text. Older versions
-- have no callback and open the page in a browser instead, so the test asks for 5.1 first when it can tell.
local function fgVersion()
	if not (Interface and Interface.getVersion) then return nil; end
	local ok, major, minor = pcall(Interface.getVersion);
	if not ok then return nil; end
	return tonumber(major), tonumber(minor);
end

function fetchText(url, done)
	Interface.openURL(url, function (a, b)
		if type(a) == "boolean" then done(a, b); else done(a ~= nil, a); end
	end);
end

-- Three requests that show what this Fantasy Grounds can do with RPG Tools: a small answer, a long address (how
-- changes would be sent) and a big answer (how a party or a bestiary would arrive).
function testConnection(given)
	local site = siteOf(given);
	if not site then say("Name your RPG Tools site, like /rpgtools test https://your-rpg-tools-site.com"); return; end
	local major, minor = fgVersion();
	if major and (major < 5 or (major == 5 and (minor or 0) < 1)) then
		say("This is Fantasy Grounds " .. major .. "." .. (minor or 0) .. ". Reaching RPG Tools needs Fantasy Grounds Unity 5.1 or later.");
		return;
	end
	local base = site .. "/api/bridge/fantasygrounds/ping";
	local long = string.rep("abcdefghij", 150);
	local results, pending = {}, 3;
	local function finish()
		pending = pending - 1;
		if pending > 0 then return; end
		local passed = results.small and results.long and results.big;
		say("Test of " .. site .. ": " .. table.concat({ results.smallText or "", results.longText or "", results.bigText or "" }, " ") ..
			(passed and " Fantasy Grounds can reach RPG Tools directly. Tell RPG Tools it worked!" or " Copy this message and send it to RPG Tools."));
	end
	say("Testing " .. site .. " ... the answer appears here in a few seconds.");
	fetchText(base .. "?v=" .. urlEncode(VERSION), function (ok, text)
		local json = ok and decode(text) or nil;
		results.small = json and json.app == "RPG Tools";
		results.smallText = results.small and "Ping: yes." or ("Ping: no (" .. clip(ok and text or "no answer", 60) .. ").");
		finish();
	end);
	fetchText(base .. "?echo=" .. long, function (ok, text)
		local json = ok and decode(text) or nil;
		results.long = json and json.echo == string.len(long);
		results.longText = results.long and "Long address: yes." or ("Long address: no (" .. clip(ok and text or "no answer", 60) .. ").");
		finish();
	end);
	fetchText(base .. "?size=200000", function (ok, text)
		local json = ok and decode(text) or nil;
		results.big = json and type(json.pad) == "string" and string.len(json.pad) == 200000;
		results.bigText = results.big and "Big answer: yes." or ("Big answer: no (" .. (ok and (string.len(str(text)) .. " bytes") or "no answer") .. ").");
		finish();
	end);
end

local HELP = "RPG Tools " .. VERSION .. ". /rpgtools import picks a JSON file to import as NPCs, and /rpgtools paste imports JSON from the clipboard. " ..
	"/rpgtools export <name> saves an NPC or character as an RPG Tools sheet, and /rpgtools copy <name> copies one. " ..
	"/rpgtools test checks whether this Fantasy Grounds can reach your RPG Tools site.";

function onSlash(_command, params)
	local verb, rest = string.match(str(params), "^%s*(%S*)%s*(.-)%s*$");
	verb = string.lower(verb or "");
	if verb == "import" or verb == "open" then importFile();
	elseif verb == "paste" then importClipboard();
	elseif verb == "export" or verb == "save" then exportFile(rest);
	elseif verb == "copy" then exportClipboard(rest);
	elseif verb == "test" then testConnection(rest);
	else say(HELP); end
end

function onInit()
	Comm.registerSlashHandler("rpgtools", onSlash, "[import | paste | export <name> | copy <name> | test]");
end
