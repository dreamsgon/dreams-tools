/** Browser tab titles that name what is open: "Ayla · The Salt Road | RPG Encyclopedia". Pure, so it can be tested. */
const clean = (text: string | null | undefined, max = 80) => {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
};

/** Joins the open thing and where it lives ("Ayla", "The Salt Road") and the app name. Empty parts are left out. */
export function pageTitle(parts: (string | null | undefined)[], app?: string): string {
  const named = parts.map(p => clean(p)).filter(Boolean).join(" · ");
  return named && app ? `${named} | ${app}` : named || app || "";
}

export const encyclopediaApp = "RPG Encyclopedia";
const viewNames: Record<string, string> = {
  characters: "Characters", maps: "Maps", calendar: "Calendar", tables: "Random tables", templates: "Templates",
  quests: "Quests", codex: "Codex", look: "Look", dashboard: "Dashboard",
};

/** Encyclopedia: a page is "Page · Campaign", a view is "Quests · Campaign", an open campaign is its name, else the world. */
export function encyclopediaTitle(s: { entry?: string | null; view?: string | null; campaign?: string | null; world?: string | null }): string {
  const where = s.campaign || s.world;
  if (s.entry) return pageTitle([s.entry, where], encyclopediaApp);
  const view = s.view && s.view !== "overview" && s.view !== "dashboard" ? viewNames[s.view] : null;
  if (view) return pageTitle([view, where], encyclopediaApp);
  return pageTitle([where], encyclopediaApp);
}

/** Maptable: "Greyfen docks · The Salt Road | Maptable". With no scene open, the open campaign, else just Maptable. */
export function maptableTitle(s: { scene?: string | null; campaign?: string | null }): string {
  return pageTitle([s.scene || s.campaign, s.scene ? s.campaign : null], "Maptable");
}

/** A player page: "Ayla · The Salt Road". The campaign alone on the front page. */
export function playerTitle(s: { entry?: string | null; campaign?: string | null }): string {
  return pageTitle([s.entry, s.campaign]) || "Campaign player view";
}

/** A campaign in the Campaigns hub. */
export function campaignTitle(name: string | null | undefined): string {
  return pageTitle([name], "RPG Tools");
}
