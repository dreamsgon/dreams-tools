import { snap, uid, type Effect, type Point, type Scene, type Token } from "./model.ts";

/** What Ctrl C keeps: copies of the tokens and the auras attached to them, with the grid they came from. */
export type TokenClipboard = { v: 1; sceneId: string; sceneName: string; gridSize: number; tokens: Token[]; effects: Effect[] };

export const TOKEN_CLIPBOARD_KEY = "maptable:token-clipboard";
export const MAX_SCENE_TOKENS = 500;
export const MAX_SCENE_EFFECTS = 300;

/** A token and everyone grouped with it. */
export function groupMembers(scene: Pick<Scene, "tokens">, id: string): string[] {
  const token = scene.tokens.find(item => item.id === id);
  if (!token?.groupId) return token ? [token.id] : [];
  return scene.tokens.filter(item => item.groupId === token.groupId).map(item => item.id);
}
/** Selecting part of a group selects all of it. Non-token ids pass through. */
export function expandGroups(scene: Pick<Scene, "tokens">, ids: string[]): string[] {
  const result: string[] = [];
  for (const id of ids) for (const member of scene.tokens.some(item => item.id === id) ? groupMembers(scene, id) : [id])
    if (!result.includes(member)) result.push(member);
  return result;
}
/** Shift-click: add the token (and its group) to the selection, or take them out if already in. */
export function toggleInSelection(scene: Pick<Scene, "tokens">, selection: string[], id: string): string[] {
  const members = groupMembers(scene, id);
  return members.every(member => selection.includes(member))
    ? selection.filter(item => !members.includes(item))
    : [...selection, ...members.filter(member => !selection.includes(member))];
}

/** Tie the tokens together (at least two). Returns the group id. */
export function groupTokens(scene: Scene, ids: string[]): string | null {
  const tokens = scene.tokens.filter(token => ids.includes(token.id));
  if (tokens.length < 2) return null;
  const groupId = uid();
  for (const token of tokens) token.groupId = groupId;
  return groupId;
}
export function ungroupTokens(scene: Scene, ids: string[]): number {
  const groups = new Set(scene.tokens.filter(token => ids.includes(token.id) && token.groupId).map(token => token.groupId));
  let count = 0;
  for (const token of scene.tokens) if (token.groupId && groups.has(token.groupId)) { delete token.groupId; count++; }
  return count;
}

export function copyTokens(scene: Scene, ids: string[]): TokenClipboard | null {
  const tokens = scene.tokens.filter(token => ids.includes(token.id));
  if (!tokens.length) return null;
  const effects = scene.effects.filter(effect => effect.tokenId && ids.includes(effect.tokenId));
  return structuredClone({ v: 1, sceneId: scene.id, sceneName: scene.name, gridSize: scene.grid.size, tokens, effects });
}
export function readClipboard(value: unknown): TokenClipboard | null {
  if (!value || typeof value !== "object") return null;
  const clip = value as Partial<TokenClipboard>;
  return clip.v === 1 && Array.isArray(clip.tokens) && clip.tokens.length && Array.isArray(clip.effects) && typeof clip.gridSize === "number"
    ? clip as TokenClipboard : null;
}

/** "Bandit", "Bandit" and "Bandit 3" on the map: the next one is "Bandit 4". */
export function nextTokenName(name: string, taken: string[]): string {
  if (!taken.includes(name)) return name;
  const base = name.replace(/\s+\d+$/, "") || name;
  const pattern = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s+(\\d+))?$`);
  let highest = 0, plain = 0;
  for (const item of taken) {
    const match = item.match(pattern);
    if (!match) continue;
    if (match[1]) highest = Math.max(highest, Number(match[1])); else plain++;
  }
  return `${base} ${Math.max(highest, plain) + 1}`.slice(0, 120);
}

/** A saved token placed again: "Goblin" beside "Goblin" becomes "Goblin 2", and "Dock Rat" beside "Dock Rat 1" and "Dock Rat 2" becomes "Dock Rat 3". */
export function placedName(name: string, taken: string[]): string {
  if (taken.includes(name)) return nextTokenName(name, taken);
  const prefix = name + " ";
  return taken.some(item => item.startsWith(prefix) && /^\d+$/.test(item.slice(prefix.length))) ? nextTokenName(name, [...taken, name]) : name;
}

/**
 * Paste the clipboard into the scene, centred on `at` and snapped like the first token,
 * keeping the tokens' spacing (scaled to this scene's grid). Pasted tokens are new: new ids,
 * numbered names, groups and attachments kept only among themselves.
 */
export function pasteTokens(scene: Scene, clip: TokenClipboard, at: Point): string[] {
  const room = Math.max(0, MAX_SCENE_TOKENS - scene.tokens.length);
  const tokens = clip.tokens.slice(0, room);
  if (!tokens.length) return [];
  const scale = scene.grid.size / Math.max(1, clip.gridSize);
  const xs = tokens.map(token => token.x), ys = tokens.map(token => token.y);
  const centre = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  const place = (token: Token) => ({ x: at.x + (token.x - centre.x) * scale, y: at.y + (token.y - centre.y) * scale });
  const lead = place(tokens[0]), snapped = snap(lead, scene.grid, tokens[0].size);
  const shift = { x: snapped.x - lead.x, y: snapped.y - lead.y };
  const ids = new Map(tokens.map(token => [token.id, uid()]));
  const groups = new Map<string, string>();
  const names = scene.tokens.map(token => token.name);
  const sameScene = clip.sceneId === scene.id;
  for (const source of tokens) {
    const token = structuredClone(source), position = place(source);
    token.id = ids.get(source.id)!;
    token.x = Math.max(0, Math.min(scene.width, position.x + shift.x));
    token.y = Math.max(0, Math.min(scene.height, position.y + shift.y));
    token.name = nextTokenName(source.name, names);
    names.push(token.name);
    token.attachedToId = source.attachedToId && ids.has(source.attachedToId) ? ids.get(source.attachedToId)! : null;
    if (source.groupId) {
      if (!groups.has(source.groupId)) groups.set(source.groupId, uid());
      token.groupId = groups.get(source.groupId);
    }
    // A map piece stands in for a stamp of this scene's drawing; elsewhere it is an ordinary token.
    if (!sameScene) delete token.pieceOf;
    scene.tokens.push(token);
  }
  for (const source of clip.effects.slice(0, Math.max(0, MAX_SCENE_EFFECTS - scene.effects.length))) {
    if (!source.tokenId || !ids.has(source.tokenId)) continue;
    const effect = structuredClone(source);
    effect.id = uid();
    effect.tokenId = ids.get(source.tokenId)!;
    scene.effects.push(effect);
  }
  return [...ids.values()];
}

/** Ctrl D: copies one square down and to the right of the originals. */
export function duplicateTokens(scene: Scene, ids: string[]): string[] {
  const clip = copyTokens(scene, ids);
  if (!clip) return [];
  const xs = clip.tokens.map(token => token.x), ys = clip.tokens.map(token => token.y);
  return pasteTokens(scene, clip, { x: (Math.min(...xs) + Math.max(...xs)) / 2 + scene.grid.size, y: (Math.min(...ys) + Math.max(...ys)) / 2 + scene.grid.size });
}
