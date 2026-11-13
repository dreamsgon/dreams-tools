import test from "node:test";
import assert from "node:assert/strict";
import { proseBlocks, proseParts, playerLink } from "../lib/encyclopedia/player-prose.ts";

test("player page text is read as headings, lists, tasks, quotes and code", () => {
  const blocks = proseBlocks("## At the ford\r\nA salt-trader.\n\n- Her debt\n  - nested\n- [x] Paid the toll\n> Every barge pays.\n```\n## not a heading\n```");
  assert.deepEqual(blocks.map(b => b.type), ["heading", "paragraph", "gap", "bullet", "bullet", "task", "quote", "code"]);
  assert.equal(blocks[0].level, 3);
  assert.equal(blocks[4].indent, 2);
  assert.equal(blocks[5].done, true);
  assert.equal(blocks[7].text, "## not a heading");
});

test("bold, code and links inside a line; links only reach pages players can read", () => {
  assert.deepEqual(proseParts("the **Greyfen** ford, ask [[Bog Hag|the hag]] or [[Ostra Hale]] about `toll`"), [
    { type: "text", text: "the " }, { type: "bold", text: "Greyfen" }, { type: "text", text: " ford, ask " },
    { type: "link", target: "Bog Hag", label: "the hag" }, { type: "text", text: " or " },
    { type: "link", target: "Ostra Hale", label: "Ostra Hale" }, { type: "text", text: " about " }, { type: "code", text: "toll" },
  ]);
  const pages = [{ id: "a", title: "Ostra Hale" }, { id: "b", title: "Greyfen" }];
  assert.equal(playerLink(pages, "ostra hale")?.id, "a");
  assert.equal(playerLink(pages, "b")?.id, "b");
  assert.equal(playerLink(pages, "Bog Hag"), null, "a page players can't read is plain text");
});
