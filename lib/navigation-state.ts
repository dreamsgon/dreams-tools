export const navigationPanels = ["scenes", "exploration", "assets", "tokens", "grid", "fog", "effects", "conditions"] as const;
export type NavigationPanel = typeof navigationPanels[number] | null;
export type NavigationState = {
  version: 1;
  dashboard: boolean;
  creatorOpen: boolean;
  panel: NavigationPanel;
  sidebar: boolean;
  activeId: string | null;
  location: string | null;
  dashboardLocation: string | null;
  conditionLocation: string | null;
};

export function navigationStorageKey(scope: string) {
  return `maptable:navigation:v1:${encodeURIComponent(scope)}`;
}

export function parseNavigationState(text: string | null): NavigationState | null {
  try {
    const value = JSON.parse(text ?? "null");
    if (!value || value.version !== 1 ||
      typeof value.dashboard !== "boolean" || typeof value.creatorOpen !== "boolean" ||
      typeof value.sidebar !== "boolean" ||
      !(value.panel === null || navigationPanels.includes(value.panel)) ||
      !["activeId", "location", "dashboardLocation", "conditionLocation"].every(key =>
        value[key] === null || (typeof value[key] === "string" && value[key].length > 0 && value[key].length <= 512))) return null;
    return { version: 1, dashboard: value.dashboard, creatorOpen: value.creatorOpen,
      panel: value.panel, sidebar: value.sidebar, activeId: value.activeId,
      location: value.location, dashboardLocation: value.dashboardLocation, conditionLocation: value.conditionLocation };
  } catch {
    return null;
  }
}
