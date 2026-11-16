/*
 * RPG Tools Dice Link, on RPG Tools pages: passes each roll this browser records to the Roll20 tab, and gives rolls
 * from Roll20 to the page (which puts them in the roll log). RPG Tools announces rolls with a `rpgtools:roll` event.
 */
(function () {
  const api = globalThis.browser ?? globalThis.chrome;
  document.documentElement.dataset.rpgtoolsDiceLink = api.runtime.getManifest().version;
  window.addEventListener("rpgtools:roll", event => {
    let roll;
    try { roll = JSON.parse(event.detail); } catch { return; }
    if (!roll || roll.source === "roll20") return; // It came from Roll20; don't send it back.
    void Promise.resolve(api.runtime.sendMessage({ type: "rpgtools-roll", roll })).catch(() => {});
  });
  api.runtime.onMessage.addListener(message => {
    if (message?.type === "to-rpgtools") window.dispatchEvent(new CustomEvent("rpgtools:external-roll", { detail: JSON.stringify(message.roll) }));
  });
})();
