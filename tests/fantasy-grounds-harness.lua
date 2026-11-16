-- A stand-in for Fantasy Grounds Unity, for tests/fantasy-grounds.test.mjs. It runs inside Redis' Lua 5.1 (EVAL),
-- loads the extension's script with fake DB, File, Interface, Comm, Utility and Session packages, runs the steps of a
-- scenario, and returns what happened as JSON.
--   ARGV[1]: the extension's script.  ARGV[2]: the scenario as JSON.
local NULL = cjson.null
local function denull(v)
	if v == NULL then return nil end
	if type(v) == "table" then
		local t = {}
		for k, x in pairs(v) do t[k] = denull(x) end
		return t
	end
	return v
end
local scenario = denull(cjson.decode(ARGV[2]))

-- The database: nodes with children by name, and a value and type on leaves.
local root = { name = "", kids = {} }
local counter = 0
local function split(path)
	local out = {}
	for part in string.gmatch(path or "", "[^%.]+") do out[#out + 1] = part end
	return out
end
local function find(base, path, create)
	local node = base
	if type(base) == "string" then node, path = root, base .. ((path and path ~= "") and ("." .. path) or "") end
	if type(node) ~= "table" then error("not a database node: " .. tostring(base)) end
	for _, part in ipairs(split(path)) do
		local kid = node.kids[part]
		if not kid then
			if not create then return nil end
			kid = { name = part, kids = {}, parent = node }
			node.kids[part] = kid
		end
		node = kid
	end
	return node
end
local DB = {}
function DB.createNode(path) return find(path, nil, true) end
function DB.createChild(base, name)
	local parent = find(base, nil, true)
	if not name then
		counter = counter + 1
		name = string.format("id-%05d", counter)
	end
	return find(parent, name, true)
end
function DB.getChild(base, path) return find(base, path, false) end
function DB.getChildren(base, path)
	local node = find(base, path, false)
	local out = {}
	if node then for k, v in pairs(node.kids) do out[k] = v end end
	return out
end
function DB.setValue(base, path, kind, value)
	local node = find(base, path, true)
	node.kind, node.value = kind, value
	return true
end
function DB.getValue(base, path, default)
	local node = find(base, path, false)
	if node and node.value ~= nil then return node.value end
	return default
end
function DB.deleteNode(node) if node.parent then node.parent.kids[node.name] = nil end end
function DB.isOwner(node)
	while node do
		if node.owned then return true end
		node = node.parent
	end
	return false
end
local function load(node, value)
	if type(value) == "table" then
		for k, v in pairs(value) do load(find(node, k, true), v) end
	else
		node.value, node.kind = value, type(value) == "number" and "number" or "string"
	end
end
load(root, scenario.db or {})
for _, path in ipairs(scenario.owned or {}) do find(path, nil, true).owned = true end
local function dump(node)
	if node.value ~= nil then return node.value end
	local out = {}
	for k, v in pairs(node.kids) do out[k] = dump(v) end
	return out
end

-- Everything else Fantasy Grounds gives a script.
local chat, saved, slash, dialogs = {}, {}, {}, {}
local clipboard = scenario.clipboard
local files = scenario.files or {}
local env = setmetatable({}, { __index = _G })
env.DB = DB
env.Session = { IsHost = scenario.host ~= false, RulesetName = "5E" }
env.Comm = {
	addChatMessage = function (m) chat[#chat + 1] = m.text end,
	registerSlashHandler = function (name, fn) slash[name] = fn end,
}
env.Utility = {
	decodeJSON = function (s)
		local ok, v = pcall(cjson.decode, s)
		if not ok then return nil, "Invalid JSON" end
		return denull(v)
	end,
}
env.File = {
	openTextFile = function (path) return files[path] end,
	saveTextFile = function (path, text) saved[path] = text; return true end,
}
local function answer(kind, fn)
	local a = (scenario.dialogs or {})[#dialogs + 1] or { result = "cancel" }
	dialogs[#dialogs + 1] = kind
	fn(a.result, a.path)
end
env.Interface = {
	dialogFileOpen = function (fn) answer("open", fn) end,
	dialogFileSave = function (fn) answer("save", fn) end,
	clipboardGetText = function () return clipboard end,
	clipboardSetText = function (t) clipboard = t end,
}

local script = assert(loadstring(ARGV[1], "rpgtools.lua"))
setfenv(script, env)
script()
env.onInit()

-- The steps: chat commands, and calls of the script's functions.
local results = {}
for _, step in ipairs(scenario.steps or {}) do
	if step.slash then
		assert(slash.rpgtools, "/rpgtools was not registered")("rpgtools", step.slash)
	elseif step.call then
		local args = {}
		for i, a in ipairs(step.args or {}) do
			if type(a) == "string" and string.sub(a, 1, 5) == "node:" then a = find(string.sub(a, 6), nil, false) end
			args[i] = a
		end
		local fn = env[step.call]
		assert(type(fn) == "function", "no function " .. step.call)
		local value = fn(unpack(args, 1, #(step.args or {})))
		if step.json then value = env.encodeJSON(value) end
		results[#results + 1] = value == nil and "nil" or value
	end
end
return cjson.encode({ chat = chat, db = dump(root), saved = saved, clipboard = clipboard or "", results = results, dialogs = dialogs })
