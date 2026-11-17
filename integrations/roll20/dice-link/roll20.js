/*
 * RPG Tools Dice Link, in a Roll20 game: types RPG Tools rolls into the chat, and passes Roll20 chat rolls to RPG Tools
 * when that is turned on. Roll20's page can change; the selectors are in one place below.
 */
(function () {
  const api = globalThis.browser ?? globalThis.chrome, L = RPGToolsLink;
  const SEL = { input: "#textchat-input textarea", send: "#textchat-input .btn", speakAs: "#speakingas", log: "#textchat .content" };
  let settings = { ...L.defaults };
  api.storage.local.get(L.defaults).then(s => { settings = { ...L.defaults, ...s }; });
  api.storage.onChanged.addListener(changes => { for (const [k, v] of Object.entries(changes)) settings[k] = v.newValue; });

  /** Types a message into the chat box and sends it, then puts back whatever the player had typed. */
  function post(text, who) {
    const box = document.querySelector(SEL.input), button = document.querySelector(SEL.send);
    if (!box || !button) return false;
    const speakAs = document.querySelector(SEL.speakAs), was = speakAs?.value;
    if (speakAs && who) {
      const option = [...speakAs.options].find(o => o.textContent.trim().toLowerCase() === who.toLowerCase());
      if (option) { speakAs.value = option.value; speakAs.dispatchEvent(new Event("change", { bubbles: true })); }
    }
    const draft = box.value;
    box.value = text;
    box.dispatchEvent(new Event("input", { bubbles: true }));
    button.click();
    box.value = draft;
    if (speakAs && was !== undefined && speakAs.value !== was) { speakAs.value = was; speakAs.dispatchEvent(new Event("change", { bubbles: true })); }
    return true;
  }
  api.runtime.onMessage.addListener(message => {
    if (message?.type === "to-roll20" && settings.toRoll20 && message.roll) post(L.chatFor(message.roll, settings.mode), message.roll.who);
  });

  // ---- Roll20 rolls to RPG Tools ----
  const started = Date.now(), seen = new Set();
  let lastWho = "";
  /** The words just before an inline roll in its row of a roll template, such as "Attack" in "Attack: 16". */
  function labelBefore(el, r) {
    const box = r.parentElement?.closest("div, p, li, td, span[class*='row'], span[class*='sheet-']") ?? r.parentElement;
    if (!box || !el.contains(box)) return "";
    const range = document.createRange();
    range.setStart(box, 0); range.setEndBefore(r);
    return range.toString().split(/\n/).pop().replace(/[:\s]+$/, "").trim().slice(-40);
  }
  /** What a chat message holds, read from the page, for RPGToolsLink.rollFromChat. */
  function read(el) {
    const by = el.querySelector(".by")?.textContent?.trim();
    if (by) lastWho = by;
    const rolls = [];
    if (el.classList.contains("rollresult")) {
      rolls.push({ formula: (el.querySelector(".formula")?.textContent ?? "").replace(/^\s*rolling\s*/i, ""), total: el.querySelector(".rolled")?.textContent ?? "" });
    }
    for (const r of el.querySelectorAll(".inlinerollresult")) {
      const row = r.closest("tr");
      rolls.push({ label: row && row.cells.length > 1 ? row.cells[0].textContent : labelBefore(el, r), title: r.getAttribute("original-title") || r.getAttribute("title") || "", total: r.textContent });
    }
    const name = el.querySelector("caption, .sheet-template-name, th")?.textContent ?? "";
    // The message as people read it, line by line ("Bite", "Adult Black Dragon", "Attack: 16"), without who sent it.
    const lines = String(el.innerText || "").split(/\n+/).map(s => s.trim()).filter(Boolean);
    if (by && lines[0] && by.indexOf(lines[0]) === 0) lines.shift();
    return { who: by || lastWho, name, text: el.textContent, lines, whisper: el.classList.contains("private") || el.classList.contains("whisper"), rolls };
  }
  function handle(el) {
    if (!(el instanceof HTMLElement) || !el.classList.contains("message")) return;
    const id = el.dataset.messageid || el.getAttribute("data-messageid");
    if (id) { if (seen.has(id)) return; seen.add(id); }
    // Roll20 loads the chat archive when the game opens; only rolls made after that go across.
    if (Date.now() - started < 5000 || !settings.fromRoll20) { read(el); return; }
    const msg = read(el), roll = L.rollFromChat(msg);
    if (roll) void Promise.resolve(api.runtime.sendMessage({ type: "from-roll20", roll })).catch(() => {});
    // A message that looks like a roll but couldn't be read: shown in the console, so a sheet's new layout can be added.
    else if (msg.whisper || el.querySelector("[class*='roll'], [class*='template']")) {
      console.info("[RPG Tools Dice Link] Skipped a Roll20 message:", msg.whisper ? "it is whispered." : "no roll found in it.", el.outerHTML.slice(0, 4000));
    }
  }
  function watch() {
    const log = document.querySelector(SEL.log);
    if (!log) { setTimeout(watch, 1000); return; }
    new MutationObserver(changes => { for (const c of changes) for (const n of c.addedNodes) handle(n); }).observe(log, { childList: true });
  }
  watch();
})();
