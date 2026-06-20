// The combo sampler — draws the exact node combination for a song (R6–R8).
// The harness samples (weighted random, novelty-biased); the DJ writes what it draws.
//
// Shape: a song is built on 1–2 bands/albums (a single act or a fusion); themes are
// their OWN pool (0–1), so a theme is an optional subject, not a co-equal seed; plus
// 0–2 vibes and 0–1 mutator. Weighting biases toward under-used nodes (novelty/R8).
// Re-rolls against combo history so the same node set is never generated twice (AE3).
// Rating-based weighting is deferred.

import { comboSignature } from "./store.mjs";

export const DEFAULT_SHAPE = {
  bands: [1, 2],   // band/album anchors — a single act or a two-band cross
  themes: [0, 1],  // separate theme pool — at most one subject per song
  vibes: [0, 2],
  mutators: [0, 1],
  maxRerolls: 25,
};

function randInt(lo, hi, rng) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

// Novelty weight: under-used nodes are heavier, so the station explores its
// graph rather than fixating on the same few influences (R8).
const novelty = (n) => 1 / (1 + (n.use_count || 0));

// Weighted draw WITHOUT replacement.
function weightedSample(nodes, k, rng, weightOf) {
  const pool = nodes.slice();
  const picked = [];
  while (picked.length < k && pool.length) {
    const weights = pool.map(weightOf);
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    let idx = 0;
    while (idx < pool.length - 1 && (r -= weights[idx]) > 0) idx++;
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

function drawOnce(store, shape, rng) {
  const seeds = store.nodesByRole("seed");
  const anchors = seeds.filter((n) => n.type === "band" || n.type === "album");
  const themes = seeds.filter((n) => n.type === "theme");
  const vibes = store.nodesByRole("vibe");
  const mutators = store.nodesByRole("mutator");

  if (anchors.length < shape.bands[0]) {
    throw insufficient(`need at least ${shape.bands[0]} band/album nodes, have ${anchors.length}`);
  }

  const nBands = Math.min(randInt(shape.bands[0], shape.bands[1], rng), anchors.length);
  const nThemes = Math.min(randInt(shape.themes[0], shape.themes[1], rng), themes.length);
  const nVibes = Math.min(randInt(shape.vibes[0], shape.vibes[1], rng), vibes.length);
  const nMut = Math.min(randInt(shape.mutators[0], shape.mutators[1], rng), mutators.length);

  return {
    seeds: weightedSample(anchors, nBands, rng, novelty), // the band/album fusion
    themes: weightedSample(themes, nThemes, rng, novelty), // optional subject
    vibes: weightedSample(vibes, nVibes, rng, novelty),
    mutators: weightedSample(mutators, nMut, rng, novelty),
  };
}

function insufficient(message) {
  const err = new Error(message);
  err.code = "INSUFFICIENT_NODES";
  return err;
}

// Draw a fresh combo. opts may override the shape and supply a deterministic rng.
export function sampleCombo(store, opts = {}) {
  const shape = { ...DEFAULT_SHAPE, ...opts };
  const rng = opts.rng || Math.random;

  for (let attempt = 0; attempt < shape.maxRerolls; attempt++) {
    const combo = drawOnce(store, shape, rng);
    const nodeIds = [...combo.seeds, ...combo.themes, ...combo.vibes, ...combo.mutators].map((n) => n.id);
    if (!store.comboExists(nodeIds)) {
      return { ...combo, nodeIds, signature: comboSignature(nodeIds) };
    }
  }
  const err = new Error(
    `exhausted ${shape.maxRerolls} re-rolls without a fresh combo — the graph may be saturated`
  );
  err.code = "COMBO_EXHAUSTED";
  throw err;
}

export default sampleCombo;
