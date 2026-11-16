const api = globalThis.browser ?? globalThis.chrome;
const $ = id => document.getElementById(id);
api.storage.local.get(RPGToolsLink.defaults).then(s => {
  $("toRoll20").checked = s.toRoll20; $("fromRoll20").checked = s.fromRoll20; $("mode").value = s.mode; $("mode").disabled = !s.toRoll20;
});
$("toRoll20").addEventListener("change", e => { void api.storage.local.set({ toRoll20: e.target.checked }); $("mode").disabled = !e.target.checked; });
$("fromRoll20").addEventListener("change", e => void api.storage.local.set({ fromRoll20: e.target.checked }));
$("mode").addEventListener("change", e => void api.storage.local.set({ mode: e.target.value }));
Promise.resolve(api.runtime.sendMessage({ type: "status" })).then(s => {
  const tab = (n, what) => n ? `${what[0].toUpperCase()}${what.slice(1)} is open` : `Open ${what} in this browser`;
  $("status").textContent = `${tab(s.roll20, "a Roll20 game")}. ${tab(s.rpgTools, "RPG Tools")} (${s.site}).`;
}).catch(() => { $("status").textContent = "Open RPG Tools and your Roll20 game in this browser."; });
