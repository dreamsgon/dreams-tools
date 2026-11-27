import test from "node:test";
import assert from "node:assert/strict";
import { effectSchema } from "../lib/model.ts";
import { auraSize, auraReach, resolveEffect, effectVisibleToPlayers } from "../lib/effects.ts";
import { newTokenAura, reshapeAura, tokenAuras, auraDistance, auraSummary } from "../lib/token-auras.ts";

const grid = { units: 5, unit: "ft", size: 70 };
const paladin = { id: "pal", x: 350, y: 350, size: 1, hidden: false };

test("an aura reaches past the token's edge, the 5e way", () => {
  // 10 ft (2 squares) from a Medium token: a 5×5 square, or a circle 2.5 squares across from the centre.
  assert.equal(auraSize("square", 1, 2), 5);
  assert.equal(auraSize("circle", 1, 2), 2.5);
  assert.equal(auraSize("cone", 1, 2), 2.5);
  // A Large token's 10 ft square covers 6×6.
  assert.equal(auraSize("square", 2, 2), 6);
  assert.equal(auraReach("square", 2, 6), 2);
  assert.equal(auraReach("circle", 1, 2.5), 2);
  assert.equal(auraSize("circle", 0.25, 0), 0.25);
});

test("a new aura is 10 ft, attached, persistent and saved as a normal effect", () => {
  const aura = newTokenAura(paladin, grid);
  assert.equal(aura.tokenId, "pal");
  assert.equal(aura.persistent, true);
  assert.equal(aura.reach, 2);
  assert.equal(aura.size, 2.5);
  assert.equal(auraDistance(aura, paladin, grid), 10);
  assert.deepEqual(effectSchema.parse(aura), aura);
  assert.equal(auraSummary(aura, paladin, grid), "Aura 10 ft");
});

test("the aura follows the token and grows with it", () => {
  const aura = newTokenAura(paladin, grid);
  const moved = resolveEffect(aura, [{ ...paladin, x: 700, y: 140 }]);
  assert.deepEqual([moved.x, moved.y, moved.size], [700, 140, 2.5]);
  assert.equal(resolveEffect(aura, [{ ...paladin, size: 2 }]).size, 3);
  // Auras without a reach (drawn in the Auras & AoEs panel) keep their size.
  const { reach, ...drawn } = aura;
  assert.equal(resolveEffect(drawn, [{ ...paladin, size: 2 }]).size, 2.5);
  assert.equal(reach, 2);
});

test("changing the shape keeps the reach; changing the reach resizes it", () => {
  const aura = newTokenAura(paladin, grid);
  reshapeAura(aura, paladin, { type: "square" }, grid);
  assert.deepEqual([aura.type, aura.reach, aura.size], ["square", 2, 5]);
  reshapeAura(aura, paladin, { distance: 15 }, grid);
  assert.deepEqual([aura.reach, aura.size], [3, 7]);
  reshapeAura(aura, paladin, { type: "cone" }, grid);
  assert.equal(aura.size, 3.5);
  assert.equal(auraSummary(aura, paladin, grid), "Aura 15 ft cone");
  // An aura drawn by hand gets a reach from its size before it changes shape.
  const drawn = { ...newTokenAura(paladin, grid), reach: undefined, size: 3.5 };
  reshapeAura(drawn, paladin, { type: "square" }, grid);
  assert.deepEqual([drawn.reach, drawn.size], [3, 7]);
});

test("a token lists only its own round, square and cone auras", () => {
  const mine = newTokenAura(paladin, grid), other = newTokenAura({ ...paladin, id: "other" }, grid);
  const line = { ...newTokenAura(paladin, grid), type: "line" };
  const oneOff = { ...newTokenAura(paladin, grid), persistent: false };
  assert.deepEqual(tokenAuras({ effects: [mine, other, line, oneOff] }, "pal").map(e => e.id), [mine.id]);
});

test("hidden auras and auras of hidden tokens stay off the player view", () => {
  const aura = newTokenAura(paladin, grid);
  assert.equal(effectVisibleToPlayers(aura, [paladin]), true);
  assert.equal(effectVisibleToPlayers({ ...aura, hidden: true }, [paladin]), false);
  assert.equal(effectVisibleToPlayers(aura, [{ ...paladin, hidden: true }]), false);
});
