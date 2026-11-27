import { effectSchema, uid, type Effect, type Grid, type Scene, type Token } from "./model.ts";
import { auraReach, auraSize } from "./effects.ts";

/** The shapes a token's aura can take. Square counts grid squares (the 5e way); circle measures true distance; a cone points one way. */
export const AURA_SHAPES = [
  { id: "circle", label: "Circle" },
  { id: "square", label: "Square (grid)" },
  { id: "cone", label: "Cone" },
] as const;
export type AuraShape = (typeof AURA_SHAPES)[number]["id"];

/** Cone directions, as effect rotations (degrees clockwise from pointing right). */
export const AURA_DIRECTIONS = [
  { label: "Up", rotation: -90 }, { label: "Up right", rotation: -45 }, { label: "Right", rotation: 0 }, { label: "Down right", rotation: 45 },
  { label: "Down", rotation: 90 }, { label: "Down left", rotation: 135 }, { label: "Left", rotation: 180 }, { label: "Up left", rotation: -135 },
] as const;

/** Most auras on one token. */
export const MAX_TOKEN_AURAS = 8;
/** Most areas, auras and objects on one scene (the Auras & AoEs panel uses the same limit). */
export const MAX_SCENE_EFFECTS = 300;

/** The auras that belong to a token: round, square or cone areas attached to it (lines and freehand ones stay in the Auras & AoEs panel). */
export function tokenAuras(scene: Pick<Scene, "effects">, tokenId: string): Effect[] {
  return scene.effects.filter(e => e.tokenId === tokenId && e.persistent && (!e.kind || e.kind === "area") && ["circle", "square", "cone"].includes(e.type));
}

/** A new aura for a token: 10 (scene units) past its edge, round, a soft gold. */
export function newTokenAura(token: Pick<Token, "id" | "x" | "y" | "size">, grid: Pick<Grid, "units">, existing = 0): Effect {
  const reach = 10 / (grid.units || 5);
  return effectSchema.parse({
    id: uid(), kind: "area", type: "circle", x: token.x, y: token.y, size: auraSize("circle", token.size, reach), reach,
    color: "#f2c94c", label: existing ? `Aura ${existing + 1}` : "Aura", showLabel: false, persistent: true, tokenId: token.id,
    hidden: false, rotation: -90, angle: 53, fillOpacity: 0.18, strokeWidth: 2,
  });
}

/** Distance past the token's edge in scene units, for the editor (one decimal at most). An aura drawn by hand works it out from its size. */
export function auraDistance(effect: Pick<Effect, "reach" | "type" | "size">, token: Pick<Token, "size">, grid: Pick<Grid, "units">) {
  const reach = effect.reach ?? auraReach(effect.type, token.size, effect.size);
  return Math.round(reach * (grid.units || 5) * 10) / 10;
}

/** Changes an aura's shape or distance and keeps its stored size in step with its token. */
export function reshapeAura(effect: Effect, token: Pick<Token, "size">, changes: { type?: AuraShape; distance?: number }, grid: Pick<Grid, "units">) {
  if (effect.reach === undefined) effect.reach = auraReach(effect.type, token.size, effect.size);
  if (changes.type) effect.type = changes.type;
  if (changes.distance !== undefined) effect.reach = Math.min(200, Math.max(0, changes.distance / (grid.units || 5)));
  effect.size = auraSize(effect.type, token.size, effect.reach);
}

/** "Aura 10 ft", "Bless 15 ft cone" for summaries. */
export function auraSummary(effect: Effect, token: Pick<Token, "size">, grid: Pick<Grid, "units" | "unit">) {
  const shape = effect.type === "square" ? " square" : effect.type === "cone" ? " cone" : "";
  return `${effect.label || "Aura"} ${auraDistance(effect, token, grid)} ${grid.unit}${shape}`;
}
