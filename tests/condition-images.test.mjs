import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { initialWorkspace, newToken, workspaceSchema } from "../lib/model.ts";

// The browser bundler resolves extensionless imports; give Node explicit file URLs.
const renderSource = stripTypeScriptTypes(await readFile(new URL("../lib/render.ts", import.meta.url), "utf8"))
  .replaceAll('"./model"', JSON.stringify(new URL("../lib/model.ts", import.meta.url).href))
  .replaceAll('"./token-defaults"', JSON.stringify(new URL("../lib/token-defaults.ts", import.meta.url).href))
  .replaceAll('"./token-name"', JSON.stringify(new URL("../lib/token-name.ts", import.meta.url).href))
  .replaceAll('"./token-display-layout"', JSON.stringify(new URL("../lib/token-display-layout.ts", import.meta.url).href))
  .replaceAll('"./map-drawing"', JSON.stringify(new URL("../lib/map-drawing.ts", import.meta.url).href))
  .replaceAll('"./map-style"', JSON.stringify(new URL("../lib/map-style.ts", import.meta.url).href))
  .replaceAll('"./effects"', JSON.stringify(new URL("../lib/effects.ts", import.meta.url).href));
const { renderScene } = await import(`data:text/javascript;base64,${Buffer.from(renderSource).toString("base64")}`);

function fixture() {
  const workspace = initialWorkspace();
  const scene = workspace.scenes[0];
  scene.grid.type = "none";
  const token = newToken("Secret guard");
  token.showName = false;
  token.showHp = false;
  token.conditions = ["marked"];
  scene.tokens.push(token);
  workspace.conditions[0].assetId = "symbol";
  const symbol = { width: 40, height: 20 };
  const calls = [];
  const ctx = new Proxy({}, {
    get(_target, name) {
      if (name === "measureText") return () => ({ width: 20 });
      return (...args) => calls.push({ name, args });
    },
    set(_target, name, value) { calls.push({name: `set:${String(name)}`, args: [value]}); return true; },
  });
  return { workspace, scene, token, symbol, calls, ctx };
}

test("legacy text conditions and uploaded symbols survive workspace JSON round trips", () => {
  const legacy = initialWorkspace();
  assert.equal(workspaceSchema.parse(legacy).conditions[0].assetId, undefined);
  legacy.assets.push({ id: "symbol", name: "Shield", src: "/api/assets?id=symbol", width: 40, height: 20 });
  legacy.conditions[0].assetId = "symbol";
  const parsed = workspaceSchema.parse(JSON.parse(JSON.stringify(legacy)));
  assert.equal(parsed.conditions[0].assetId, parsed.assets[0].id);
  parsed.conditions[0].assetId = null;
  assert.equal(workspaceSchema.parse(parsed).conditions[0].assetId, null);
});

test("condition symbols render from image cache with their aspect ratio preserved", () => {
  const { workspace, scene, symbol, calls, ctx } = fixture();
  renderScene(ctx, scene, workspace, new Map([["symbol", symbol]]));
  const draws = calls.filter(call => call.name === "drawImage");
  assert.equal(draws.length, 1);
  assert.equal(draws[0].args[0], symbol);
  assert.deepEqual(draws[0].args.slice(3), [16, 8]);
  assert.ok(!calls.some(call => call.name === "fillText" && call.args[0] === "!"));
});

test("missing symbol images fall back to the condition text", () => {
  const { workspace, scene, calls, ctx } = fixture();
  renderScene(ctx, scene, workspace, new Map());
  assert.ok(calls.some(call => call.name === "fillText" && call.args[0] === "!"));
});

test("player renders omit hidden tokens and their condition images", () => {
  const { workspace, scene, token, symbol, calls, ctx } = fixture();
  token.hidden = true;
  renderScene(ctx, scene, workspace, new Map([["symbol", symbol]]), { player: true });
  assert.ok(!calls.some(call => call.name === "drawImage"));
  assert.ok(!calls.some(call => call.name === "arc"));
  assert.ok(!calls.some(call => call.name === "fillText"));
  calls.length = 0;
  renderScene(ctx, scene, workspace, new Map([["symbol", symbol]]));
  assert.ok(calls.some(call => call.name === "drawImage" && call.args[0] === symbol));
});

test("text-only tokens show one positioned label and respect player name visibility",()=>{
  const {workspace,scene,token,calls,ctx}=fixture();
  token.conditions=[];token.showName=true;
  renderScene(ctx,scene,workspace,new Map(),{player:true});
  assert.ok(calls.some(c=>c.name==="translate"&&c.args[0]===token.x&&c.args[1]>token.y));
  assert.equal(calls.filter(c=>c.name==="fillText"&&c.args[0]===token.name&&c.args[1]===0&&c.args[2]===0).length,1);
  calls.length=0;token.showName=false;
  renderScene(ctx,scene,workspace,new Map(),{player:true});
  assert.ok(!calls.some(c=>c.name==="fillText"&&c.args[0]===token.name));
});

test("custom token text colors persist and render in player exports", () => {
  const {workspace,scene,token,calls,ctx}=fixture();
  token.textColor="#ff00aa"; token.showName=true; token.conditions=[];
  const parsed=workspaceSchema.parse(JSON.parse(JSON.stringify(workspace)));
  assert.equal(parsed.scenes.find(s=>s.id===scene.id).tokens[0].textColor,"#ff00aa");
  renderScene(ctx,scene,workspace,new Map(),{player:true});
  const labels=calls.map((c,i)=>({c,i})).filter(({c})=>c.name==="fillText"&&c.args[0]===token.name);
  assert.equal(labels.length,1);
  for(const {i} of labels) assert.equal(calls.slice(0,i).findLast(c=>c.name==="set:fillStyle").args[0],"#ff00aa");
});

test("token borders render independently from their fill and survive saving", () => {
  const {workspace,scene,token,calls,ctx}=fixture();
  token.color="#123456"; token.borderColor="#abcdef"; token.useDispositionColor=false; token.conditions=[];
  assert.equal(workspaceSchema.parse(JSON.parse(JSON.stringify(workspace))).scenes.find(s=>s.id===scene.id).tokens[0].borderColor,"#abcdef");
  renderScene(ctx,scene,workspace,new Map(),{player:true});
  assert.ok(calls.some(c=>c.name==="set:fillStyle"&&c.args[0]==="#123456"));
  assert.ok(calls.some(c=>c.name==="set:strokeStyle"&&c.args[0]==="#abcdef"));
});

test("normal token border thickness supports zero and custom border artwork overlays tokens", () => {
  const {workspace,scene,token,calls,ctx}=fixture();
  token.conditions=[]; token.borderWidth=12;
  renderScene(ctx,scene,workspace,new Map(),{player:true});
  assert.ok(calls.some(c=>c.name==="set:lineWidth"&&c.args[0]===12));
  calls.length=0; token.borderWidth=0;
  renderScene(ctx,scene,workspace,new Map(),{player:true});
  assert.ok(!calls.some(c=>c.name==="stroke"));
  calls.length=0; token.borderAssetId="frame";
  const frame={width:128,height:128};
  renderScene(ctx,scene,workspace,new Map([["frame",frame]]),{player:true});
  assert.ok(calls.some(c=>c.name==="drawImage"&&c.args[0]===frame));
  assert.equal(workspaceSchema.parse(JSON.parse(JSON.stringify(workspace))).scenes.find(s=>s.id===scene.id).tokens[0].borderAssetId,"frame");
  calls.length=0; token.hidden=true;
  renderScene(ctx,scene,workspace,new Map([["frame",frame]]),{player:true});
  assert.ok(!calls.some(c=>c.name==="drawImage"));
});

test("token image framing persists and applies to player renders without stretching",()=>{
  const {workspace,scene,token,calls,ctx}=fixture();
  token.assetId="portrait";token.conditions=[];
  Object.assign(token,{imageZoom:2,imageOffsetX:0.25,imageOffsetY:-0.5,imageRotation:90});
  const portrait={width:200,height:100};
  renderScene(ctx,scene,workspace,new Map([["portrait",portrait]]),{player:true});
  const draw=calls.find(c=>c.name==="drawImage"&&c.args[0]===portrait);
  assert.ok(draw);assert.equal(draw.args[3]/draw.args[4],2);
  assert.ok(calls.some(c=>c.name==="rotate"&&c.args[0]===Math.PI/2));
  const parsed=workspaceSchema.parse(JSON.parse(JSON.stringify(workspace))).scenes.find(s=>s.id===scene.id).tokens[0];
  assert.equal(parsed.imageZoom,2);assert.equal(parsed.imageOffsetX,0.25);assert.equal(parsed.imageRotation,90);
});
