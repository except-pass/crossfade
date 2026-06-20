import { test } from "node:test";
import assert from "node:assert/strict";
import { cmdNode, cmdSample } from "../bin/crossfade.mjs";
import { openStore } from "../src/store.mjs";

// silence the CLI's console output while asserting on its return codes
function quiet(fn) {
  const log = console.log;
  const err = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
    console.error = err;
  }
}

test("cmdNode: add, dedup, ls, sub-type validation, unknown subcommand", () => {
  const s = openStore(":memory:");
  quiet(() => {
    assert.equal(cmdNode(["add", "seed", "band", "A Band"], s), 0);
    assert.equal(cmdNode(["add", "seed", "band", "a band "], s), 0, "dedup is not an error");
    assert.equal(s.listNodes().length, 1, "deduped to one node");
    assert.equal(cmdNode(["add", "seed", "bnad", "Typo"], s), 1, "bad seed sub-type rejected");
    assert.equal(cmdNode(["add", "junkrole", "x"], s), 1, "bad role rejected");
    assert.equal(cmdNode(["add", "vibe", "nostalgic"], s), 0);
    assert.equal(cmdNode(["ls"], s), 0);
    assert.equal(cmdNode(["frobnicate"], s), 1, "unknown node subcommand");
  });
  s.close();
});

test("cmdNode rm: missing id, referenced-node guard, then --force", () => {
  const s = openStore(":memory:");
  quiet(() => {
    assert.equal(cmdNode(["rm"], s), 1, "no id");
    const band = s.addNode("seed", "band", "A");
    s.recordSong({ title: "x", inspirationNodeIds: [band.id] });
    assert.equal(cmdNode(["rm", String(band.id)], s), 1, "referenced node refused");
    assert.ok(s.getNode(band.id), "still present");
    assert.equal(cmdNode(["rm", String(band.id), "--force"], s), 0, "force deletes");
    assert.equal(s.getNode(band.id), null);
  });
  s.close();
});

test("cmdSample: errors without enough bands, succeeds with them", () => {
  const s = openStore(":memory:");
  quiet(() => {
    assert.equal(cmdSample(s), 1, "no bands -> error exit");
    s.addNode("seed", "band", "A");
    s.addNode("seed", "band", "B");
    assert.equal(cmdSample(s), 0);
  });
  s.close();
});
