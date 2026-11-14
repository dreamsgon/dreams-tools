import type { Token, Workspace, Collection } from "./model";

export type TokenDefaults = NonNullable<Collection["tokenDefaults"]>;
export const DEFAULT_TOKEN_DEFAULTS: TokenDefaults = {
  partyZeroHp: "unconscious", npcZeroHp: "dead", showName: true, showHp: true,
  namePosition: "bottom", hpPosition: "bottom",
  nameScale: 1, hpBarWidth: 1, hpBarHeight: 7,
  hpBarColor: null, nameSpacing: 0, hpSpacing: 0, nameHpSpacing: 3,
};
export const DISPOSITION_COLORS = {
  enemy: "#ef4444", party: "#3b82f6", ally: "#22c55e", neutral: "#a855f7",
} as const;


export type TokenSide = keyof typeof DISPOSITION_COLORS;
/** Fill behind white letters (all at least 4.5:1) and a lighter ring that stands out against dark maps. */
export const SIDE_COLOURS: Record<TokenSide, { fill: string; ring: string }> = {
  party: { fill: "#2f5fb3", ring: "#8db8ff" },
  ally: { fill: "#23784f", ring: "#62d6a0" },
  neutral: { fill: "#8a5a12", ring: "#f2b544" },
  enemy: { fill: "#b3322e", ring: "#ff7a70" },
};
export const LEGACY_DEFAULT_FILL = "#388565";
export const SIDE_TEXT = "#ffffff";

/** Ring for a campaign-overridden fill: the fill mixed 55% toward white. */
export function deriveRing(fill: string): string {
  const n = parseInt(fill.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * 0.55).toString(16).padStart(2, "0");
  return "#" + mix((n >> 16) & 255) + mix((n >> 8) & 255) + mix(n & 255);
}

export function usesSideColours(token: Token): boolean {
  if (token.assetId || token.pieceOf || token.sideColours === false) return false;
  if (token.sideColours === true) return true;
  // Old default fill migrates, unless the user already chose a border or letter colour for it.
  return token.color.toLowerCase() === LEGACY_DEFAULT_FILL && !token.borderColor && !token.textColor;
}

/** What changing a token's side patches: custom colours stay custom unless the token already follows its side's colours. */
export function sidePatch(token: Token, next: TokenSide): Partial<Token> {
  return { disposition: next, ...(usesSideColours(token) ? { sideColours: true } : {}), ...(token.assetId ? { useDispositionColor: true } : {}) };
}

/** Fill, ring and text for a token that uses side colours, else null. Campaign defaults may replace a side's fill (ring derived). */
export function tokenSideLook(workspace: Workspace, campaignId: string | null | undefined, token: Token): { fill: string; ring: string; text: string } | null {
  if (!usesSideColours(token)) return null;
  const side = tokenDisposition(token);
  const override = getTokenDefaults(workspace, campaignId).sideColours?.[side];
  if (override) return { fill: override, ring: deriveRing(override), text: SIDE_TEXT };
  return { ...SIDE_COLOURS[side], text: SIDE_TEXT };
}

export function getTokenDefaults(workspace: Workspace, campaignId: string | null | undefined): TokenDefaults {
  const campaign = workspace.collections.find(c => c.id === campaignId && c.kind === "campaign");
  return { ...DEFAULT_TOKEN_DEFAULTS, ...campaign?.tokenDefaults };
}

export function tokenCampaignId(workspace: Workspace, sceneId: string): string | null {
  let id = workspace.scenes.find(s => s.id === sceneId)?.containerId;
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    const collection = workspace.collections.find(c => c.id === id);
    if (!collection) return null;
    if (collection.kind === "campaign") return collection.id;
    id = collection.parentId;
  }
  return null;
}

export function tokenDisposition(token: Token): NonNullable<Token["disposition"]> {
  return token.disposition ?? (token.rosterRole === "party" ? "party" : token.rosterRole === "npc" ? "enemy" : "neutral");
}

export function tokenZeroHpPolicy(workspace: Workspace, campaignId: string | null | undefined, token: Token): NonNullable<Token["zeroHpStatus"]> {
  if (token.zeroHpStatus !== undefined) return token.zeroHpStatus;
  if (token.partyMarker) return "off";
  const defaults = getTokenDefaults(workspace, campaignId);
  return token.rosterRole === "party" ? defaults.partyZeroHp : token.rosterRole === "npc" ? defaults.npcZeroHp : "off";
}

function visibility(mode: Token["nameVisibility"], legacy: boolean, inherited: boolean) {
  return mode === "show" ? true : mode === "hide" ? false : mode === "inherit" ? inherited : legacy === false ? false : inherited;
}

export function resolveTokenForCampaign(workspace: Workspace, campaignId: string | null | undefined, token: Token): Token {
  const defaults = getTokenDefaults(workspace, campaignId);
  const side = tokenSideLook(workspace, campaignId, token);
  return {
    ...token,
    namePosition: token.namePosition ?? defaults.namePosition ?? "bottom",
    hpPosition: token.hpPosition ?? defaults.hpPosition ?? "bottom",
    nameScale: token.nameScale ?? defaults.nameScale ?? 1,
    hpBarWidth: token.hpBarWidth ?? defaults.hpBarWidth ?? 1,
    hpBarHeight: token.hpBarHeight ?? defaults.hpBarHeight ?? 7,
    nameSpacing: token.nameSpacing ?? defaults.nameSpacing ?? 0,
    hpSpacing: token.hpSpacing ?? defaults.hpSpacing ?? 0,
    nameHpSpacing: token.nameHpSpacing ?? defaults.nameHpSpacing ?? 3,
    hpBarColor: token.hpBarColor === undefined ? defaults.hpBarColor ?? null : token.hpBarColor,
    showName: visibility(token.nameVisibility, token.showName, defaults.showName),
    showHp: visibility(token.hpVisibility, token.showHp, defaults.showHp),
    ...(side ? { color: side.fill, borderColor: side.ring, textColor: side.text } : {
      borderColor: token.useDispositionColor ? DISPOSITION_COLORS[tokenDisposition(token)] : token.borderColor,
    }),
  };
}

export function resolvedToken(workspace: Workspace, sceneId: string, token: Token): Token {
  return resolveTokenForCampaign(workspace, tokenCampaignId(workspace, sceneId), token);
}

/** Reset display overrides only; the caller commits this as one undoable edit. */
export function applyCampaignDisplayDefaults(workspace: Workspace, campaignId: string) {
  if (!workspace.collections.some(c => c.id === campaignId && c.kind === "campaign")) return 0;
  const tokens = [
    ...workspace.scenes.filter(s => tokenCampaignId(workspace, s.id) === campaignId).flatMap(s => s.tokens),
    ...workspace.tokenLibrary.filter(t => workspace.libraryCampaigns[t.id] === campaignId),
  ];
  for (const token of tokens) {
    token.nameVisibility = "inherit";
    delete token.namePosition;
    delete token.nameScale;
    delete token.nameSpacing;
    delete token.nameHpSpacing;
    // Party markers do not have HP controls or combat health bars.
    if (!token.partyMarker) {
      token.hpVisibility = "inherit";
      delete token.hpPosition;
      delete token.hpBarWidth;
      delete token.hpBarHeight;
      delete token.hpBarColor;
      delete token.hpSpacing;
    }
  }
  return tokens.length;
}
