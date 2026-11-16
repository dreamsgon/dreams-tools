/*
 * RPG Tools Dice Link: passes rolls between the RPG Tools tab and the Roll20 game tab. It keeps nothing and calls
 * no server: rolls go from one open tab to another in this browser.
 */
const api = globalThis.browser ?? globalThis.chrome;
const ROLL20 = "https://app.roll20.net/editor*";
const rpgToolsMatch = () => api.runtime.getManifest().content_scripts.find(c => c.js.includes("rpgtools.js")).matches[0];
const send = (tab, message) => Promise.resolve(api.tabs.sendMessage(tab.id, message)).catch(() => { /* The tab is loading or closed. */ });
/** The tab to give a Roll20 roll to: the active RPG Tools tab, or the most recent one, so the roll is logged once. */
const pick = tabs => tabs.find(t => t.active) ?? [...tabs].sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];

api.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message?.type === "rpgtools-roll") void api.tabs.query({ url: ROLL20 }).then(tabs => tabs.forEach(t => send(t, { type: "to-roll20", roll: message.roll })));
  else if (message?.type === "from-roll20") void api.tabs.query({ url: rpgToolsMatch() }).then(tabs => { const tab = pick(tabs); if (tab) send(tab, { type: "to-rpgtools", roll: message.roll }); });
  else if (message?.type === "status") {
    Promise.all([api.tabs.query({ url: ROLL20 }), api.tabs.query({ url: rpgToolsMatch() })])
      .then(([roll20, rpgTools]) => reply({ roll20: roll20.length, rpgTools: rpgTools.length, site: rpgToolsMatch().replace(/\/\*$/, "") }));
    return true;
  }
  return false;
});
