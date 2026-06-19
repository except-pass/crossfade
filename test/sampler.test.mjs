import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore } from "../src/store.mjs";
import { sampleCombo } from "../src/sampler.mjs";

function seededStore() {
  const s = openStore(":memory:");
  s.addNode("seed", "band", "a band");
  s.addNode("seed", "band", "a band");
  s.addNode("seed", "album", "an album");
  s.addNode("seed", "theme", "returning home unexpectedly");
  s.addNode("seed", "theme", "the last summer");
  s.addNode("vibe", "vibe", "nostalgic");
  s.addNode("vibe", "vibe", "euphoric");
  s.addNode("mutator", "mutator", "gender-swap the singer");
  return s;
}

test("a drawn combo respects the wider-mix shape", () => {
  const s = seededStore();
  for (let i = 0; i < 50; i++) {
    const c = sampleCombo(s);
    assert.ok(c.seeds.length >= 2 && c.seeds.length <= 3, "2-3 seeds");
    assert.ok(c.vibes.length >= 0 && c.vibes.length <= 2, "0-2 vibes");
    assert.ok(c.mutators.length >= 0 && c.mutators.length <= 1, "0-1 mutator");
    assert.ok(
      c.seeds.some((n) => n.type === "band" || n.type === "album"),
      "at least one band/album anchor"
    );
    assert.equal(c.nodeIds.length, c.seeds.length + c.vibes.length + c.mutators.length);
    // every chosen role lands in the right bucket
    assert.ok(c.seeds.every((n) => n.role === "seed"));
    assert.ok(c.vibes.every((n) => n.role === "vibe"));
    assert.ok(c.mutators.every((n) => n.role === "mutator"));
  }
  s.close();
});

test("requireAnchor fails when no band/album seed exists", () => {
  const s = openStore(":memory:");
  s.addNode("seed", "theme", "a");
  s.addNode("seed", "theme", "b");
  assert.throws(() => sampleCombo(s), (e) => e.code === "INSUFFICIENT_NODES");
  s.close();
});

test("too few seeds is reported, not silently drawn", () => {
  const s = openStore(":memory:");
  s.addNode("seed", "band", "only one");
  assert.throws(() => sampleCombo(s), (e) => e.code === "INSUFFICIENT_NODES");
  s.close();
});

test("a saturated graph exhausts re-rolls instead of repeating", () => {
  const s = openStore(":memory:");
  const a = s.addNode("seed", "band", "A");
  const b = s.addNode("seed", "theme", "B");
  // only one possible combo with this shape; record it, then expect exhaustion
  const shape = { seeds: [2, 2], vibes: [0, 0], mutators: [0, 0] };
  const c = sampleCombo(s, shape);
  assert.deepEqual(c.nodeIds.sort((x, y) => x - y), [a.id, b.id].sort((x, y) => x - y));
  s.recordSong({ title: "only one", inspirationNodeIds: c.nodeIds });
  assert.throws(() => sampleCombo(s, shape), (e) => e.code === "COMBO_EXHAUSTED");
  s.close();
});

test("novelty weighting favors under-used nodes", () => {
  const s = openStore(":memory:");
  const anchor = s.addNode("seed", "band", "Anchor"); // the only band -> always the anchor
  const fresh = s.addNode("seed", "theme", "Fresh"); // never used
  const stale = s.addNode("seed", "theme", "Stale"); // used heavily

  // Bump stale's use_count via vibe-filler songs so the seed pool stays {anchor, fresh, stale}
  // and no recorded combo collides with the 2-seed draws we measure below.
  for (let i = 0; i < 30; i++) {
    const v = s.addNode("vibe", "vibe", `filler-${i}`);
    s.recordSong({ title: `u${i}`, inspirationNodeIds: [stale.id, v.id] });
  }

  // shape forces: anchor (only band) + exactly one of {fresh, stale}; no re-roll noise.
  const shape = { seeds: [2, 2], vibes: [0, 0], mutators: [0, 0], requireAnchor: true, maxRerolls: 1 };
  let freshPicks = 0;
  let stalePicks = 0;
  for (let i = 0; i < 300; i++) {
    const ids = new Set(sampleCombo(s, shape).nodeIds);
    if (ids.has(fresh.id)) freshPicks++;
    if (ids.has(stale.id)) stalePicks++;
  }
  assert.ok(freshPicks > stalePicks * 3, `fresh(${freshPicks}) should dominate stale(${stalePicks})`);
  s.close();
});
