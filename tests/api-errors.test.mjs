import test from "node:test";
import assert from "node:assert/strict";
import { api } from "../lib/api.ts";

test("API errors handle plain-text upload limits and HTML proxy responses", async t=>{
  t.mock.method(globalThis,"fetch",async()=>new Response("Payload Too Large",{status:413}));
  await assert.rejects(api("/api/assets"),/size limit.*20 MB/);
  globalThis.fetch.mock.mockImplementation(async()=>new Response("<html>Bad Gateway</html>",{status:502}));
  await assert.rejects(api("/api/assets"),/Request failed \(502\)/);
  globalThis.fetch.mock.mockImplementation(async()=>Response.json({error:"Use a PNG"},{status:400}));
  await assert.rejects(api("/api/assets"),/Use a PNG/);
  globalThis.fetch.mock.mockImplementation(async()=>Response.json({src:"/api/assets?id=test"}));
  assert.deepEqual(await api("/api/assets"),{src:"/api/assets?id=test"});
});
