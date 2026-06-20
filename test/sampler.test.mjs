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

test("a drawn combo is a band fusion with optional garnish", () => {
  const s = seededStore();
  for (let i = 0; i < 50; i++) {
    const c = sampleCombo(s);
    assert.ok(c.seeds.length >= 2 && c.seeds.length <= 3, "2-3 bands/albums");
    assert.ok(c.seeds.every((n) => n.type === "band" || n.type === "album"), "seeds are anchors only");
    assert.ok(c.themes.length >= 0 && c.themes.length <= 1, "0-1 theme");
    assert.ok(c.themes.every((n) => n.role === "seed" && n.type === "theme"), "theme pool is separate");
    assert.ok(c.vibes.length >= 0 && c.vibes.length <= 2, "0-2 vibes");
    assert.ok(c.mutators.length >= 0 && c.mutators.length <= 1, "0-1 mutator");
    assert.equal(
      c.nodeIds.length,
      c.seeds.length + c.themes.length + c.vibes.length + c.mutators.length
    );
  }
  s.close();
});

test("fails when there aren't enough band/album anchors", () => {
  const s = openStore(":memory:");
  s.addNode("seed", "theme", "a");
  s.addNode("seed", "theme", "b");
  assert.throws(() => sampleCombo(s), (e) => e.code === "INSUFFICIENT_NODES");
  s.close();
});

test("one band is not enough for the default 2-band fusion", () => {
  const s = openStore(":memory:");
  s.addNode("seed", "band", "only one");
  s.addNode("seed", "theme", "a subject");
  assert.throws(() => sampleCombo(s), (e) => e.code === "INSUFFICIENT_NODES");
  s.close();
});

test("a theme-less graph still makes band fusions", () => {
  const s = openStore(":memory:");
  s.addNode("seed", "band", "A");
  s.addNode("seed", "band", "B");
  s.addNode("seed", "band", "C");
  const c = sampleCombo(s);
  assert.ok(c.seeds.length >= 2, "draws a fusion with no themes present");
  assert.equal(c.themes.length, 0);
  s.close();
});

test("a saturated graph exhausts re-rolls instead of repeating", () => {
  const s = openStore(":memory:");
  const a = s.addNode("seed", "band", "A");
  const b = s.addNode("seed", "band", "B");
  const shape = { bands: [2, 2], themes: [0, 0], vibes: [0, 0], mutators: [0, 0] };
  const c = sampleCombo(s, shape);
  assert.deepEqual(c.nodeIds.sort((x, y) => x - y), [a.id, b.id].sort((x, y) => x - y));
  s.recordSong({ title: "only one", inspirationNodeIds: c.nodeIds });
  assert.throws(() => sampleCombo(s, shape), (e) => e.code === "COMBO_EXHAUSTED");
  s.close();
});

test("novelty weighting favors under-used bands", () => {
  const s = openStore(":memory:");
  const fresh = s.addNode("seed", "band", "Fresh"); // never used
  const stale = s.addNode("seed", "band", "Stale"); // used heavily

  // bump stale's use_count via vibe-filler songs (distinct combos, not band-on-band)
  for (let i = 0; i < 30; i++) {
    const v = s.addNode("vibe", "vibe", `filler-${i}`);
    s.recordSong({ title: `u${i}`, inspirationNodeIds: [stale.id, v.id] });
  }

  const shape = { bands: [1, 1], themes: [0, 0], vibes: [0, 0], mutators: [0, 0], maxRerolls: 1 };
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
