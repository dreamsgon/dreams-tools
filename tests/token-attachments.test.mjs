import test from "node:test";
import assert from "node:assert/strict";
import { newScene, newToken, tokenSchema } from "../lib/model.ts";
import { attachToken, canAttachToken, syncTokenAttachments } from "../lib/token-attachments.ts";

const token = (id, x, parent = null, elevation = 0) => ({...newToken(id), id, x, y: x, attachedToId: parent, elevation});
const scene = () => ({...newScene("Mounts"), tokens: [token("horse", 10, null, 5), token("rider", 20, "horse", 10), token("pack", 30, "rider", 12)]});

test("legacy token defaults and bounded finite elevation", () => {
  const {elevation, attachedToId, ...legacy} = newToken();
  assert.equal(tokenSchema.parse(legacy).elevation, 0);
  assert.equal(tokenSchema.parse(legacy).attachedToId, null);
  for (const value of [Infinity, NaN, -100001, 100001]) assert.equal(tokenSchema.safeParse({...legacy, elevation:value}).success, false);
});

test("parent movement carries chained children and elevation without mutating input or layer order", () => {
  const before = scene();
  const next = {...before, tokens: before.tokens.map(t => t.id === "horse" ? {...t,x:110,y:210,elevation:15} : t)};
  const result = syncTokenAttachments(before,next);
  assert.deepEqual(result.tokens.map(t=>[t.id,t.x,t.y,t.elevation]), [["horse",110,210,15],["rider",120,220,20],["pack",130,230,22]]);
  assert.equal(next.tokens[1].x,20);
  assert.equal(before.tokens[0].x,10);
});

test("explicit group movement is applied once and carried descendants follow the edited rider", () => {
  const before = scene();
  const next = {...before,tokens:before.tokens.map(t=>t.id !== "pack" ? {...t,x:t.x+100,y:t.y+50,elevation:t.elevation+10} : t)};
  const result = syncTokenAttachments(before,next);
  assert.deepEqual(result.tokens.map(t=>[t.x,t.y,t.elevation]),[[110,60,15],[120,70,20],[130,80,22]]);
});

test("explicit child XY offset changes still inherit parent elevation", () => {
  const before = scene();
  const next = {...before,tokens:before.tokens.map(t=>t.id === "horse" ? {...t,x:100,elevation:15} : t.id === "rider" ? {...t,x:45} : t)};
  const result = syncTokenAttachments(before,next);
  assert.deepEqual(result.tokens.map(t=>[t.x,t.elevation]),[[100,15],[45,20],[55,22]]);
});

test("attachment rejects self, descendants and missing tokens, and detach preserves position", () => {
  const before = scene();
  for (const id of ["horse","rider","pack","missing"]) assert.equal(canAttachToken(before,"horse",id),false);
  assert.equal(attachToken(before,"horse","pack"),before);
  const detached=attachToken(before,"rider",null);
  assert.equal(detached.tokens[1].attachedToId,null);
  assert.equal(detached.tokens[1].x,20);
});

test("deleted parents detach children, malformed cycles are safely repaired", () => {
  const before=scene();
  const removed=syncTokenAttachments(before,{...before,tokens:before.tokens.slice(1)});
  assert.equal(removed.tokens[0].attachedToId,null);
  assert.equal(removed.tokens[0].x,20);
  const cycle={...before,tokens:before.tokens.map(t=>t.id === "horse" ? {...t,attachedToId:"pack"} : t)};
  assert.ok(syncTokenAttachments(before,cycle).tokens.every(t=>t.attachedToId === null));
});

test("new attachment preserves current offsets and follows on subsequent moves", () => {
  const before={...scene(),tokens:scene().tokens.map(t=>({...t,attachedToId:null}))};
  const attached=syncTokenAttachments(before,attachToken(before,"rider","horse"));
  assert.equal(attached.tokens[1].x,20);
  const moved=syncTokenAttachments(attached,{...attached,tokens:attached.tokens.map(t=>t.id === "horse" ? {...t,x:30} : t)});
  assert.equal(moved.tokens[1].x,40);
});

test("layer moves preserve requested array order even when children precede their parents", () => {
  const before = scene();
  const reordered = { ...before, tokens: [before.tokens[2], before.tokens[1], before.tokens[0]] };
  const result = syncTokenAttachments(before, reordered);
  assert.equal(result, reordered);
  assert.deepEqual(result.tokens.map(t => t.id), ["pack", "rider", "horse"]);
  const moved = { ...result, tokens: result.tokens.map(t => t.id === "horse" ? { ...t, x: 110, y: 110 } : t) };
  const carried = syncTokenAttachments(result, moved);
  assert.deepEqual(carried.tokens.map(t => [t.id, t.x]), [["pack", 130], ["rider", 120], ["horse", 110]]);
});
