import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore, normalize, comboSignature, ROLES } from "../src/store.mjs";

function freshStore() {
  return openStore(":memory:");
}

test("normalize folds case, whitespace, and surrounding punctuation", () => {
  assert.equal(normalize("a band"), "a band");
  assert.equal(normalize("  matchbox   20 "), "a band");
  assert.equal(normalize("a band!"), "a band");
  assert.equal(normalize("“a band”"), "a band");
  assert.equal(normalize("   "), "");
});

test("comboSignature is order-independent and dedupes", () => {
  assert.equal(comboSignature([3, 1, 2]), "1,2,3");
  assert.equal(comboSignature([2, 1, 3]), "1,2,3");
  assert.equal(comboSignature([1, 1, 2]), "1,2");
});

test("ROLES are seed | vibe | mutator", () => {
  assert.deepEqual(ROLES, ["seed", "vibe", "mutator"]);
});

test("addNode validates role", () => {
  const s = freshStore();
  assert.throws(() => s.addNode("bogus", "band", "X"), /role must be one of/);
  s.close();
});

test("node dedup: variants collapse to one node, real name preserved", () => {
  const s = freshStore();
  const a = s.addNode("seed", "band", "a band");
  const b = s.addNode("seed", "band", "a band "); // normalizes identically
  assert.equal(a.id, b.id, "same role+type+normalized -> same node");
  assert.equal(s.listNodes().length, 1);
  assert.equal(s.getNode(a.id).name, "a band", "first real name is preserved");
  assert.equal(s.getNode(a.id).role, "seed");
  assert.equal(s.getNode(a.id).type, "band");
  s.close();
});

test("same name under different roles are distinct nodes", () => {
  const s = freshStore();
  const vibe = s.addNode("vibe", "vibe", "nostalgic");
  const theme = s.addNode("seed", "theme", "nostalgic");
  assert.notEqual(vibe.id, theme.id, "role disambiguates identical names");
  assert.equal(s.listNodes().length, 2);
  s.close();
});

test("empty/punctuation-only node names are rejected", () => {
  const s = freshStore();
  assert.throws(() => s.addNode("seed", "band", "   "), /empty after normalization/);
  assert.throws(() => s.addNode("mutator", "mutator", "!!!"), /empty after normalization/);
  s.close();
});

test("song persists with concept, exact inputs, clip ids/urls, and lineage", () => {
  const s = freshStore();
  const band1 = s.addNode("seed", "band", "a band");
  const band2 = s.addNode("seed", "band", "a band");
  const theme = s.addNode("seed", "theme", "returning home unexpectedly");

  const songId = s.recordSong({
    title: "The Long Way Back",
    concept: "what if these two made a homecoming song",
    tags: "post-grunge radio rock, anthemic, earnest male vocals",
    prompt: "[Verse 1]\nThe porch light still works\n[Chorus]\nI'm home",
    negative_tags: "edm, trap",
    model: "chirp-v3-5",
    clipIds: ["clip-a", "clip-b"],
    audioUrls: ["https://x/a.mp3", "https://x/b.mp3"],
    imageUrls: ["https://x/a.png", "https://x/b.png"],
    inspirationNodeIds: [band1.id, band2.id, theme.id],
  });

  const song = s.getSong(songId);
  assert.equal(song.title, "The Long Way Back");
  assert.equal(song.concept, "what if these two made a homecoming song");
  assert.match(song.tags, /post-grunge/);
  assert.match(song.prompt, /\[Chorus\]/);
  assert.deepEqual(song.clip_ids, ["clip-a", "clip-b"]);
  assert.deepEqual(song.audio_urls, ["https://x/a.mp3", "https://x/b.mp3"]);
  assert.deepEqual(song.image_urls, ["https://x/a.png", "https://x/b.png"]);

  const lineage = s.nodesForSong(songId);
  assert.equal(lineage.length, 3, "one lineage edge per inspiration node");
  assert.deepEqual(
    lineage.map((n) => n.id).sort((a, b) => a - b),
    [band1.id, band2.id, theme.id].sort((a, b) => a - b)
  );
  s.close();
});

test("lineage queries resolve both directions", () => {
  const s = freshStore();
  const band = s.addNode("seed", "band", "a band");
  const theme1 = s.addNode("seed", "theme", "homecoming");
  const theme2 = s.addNode("seed", "theme", "leaving");

  const song1 = s.recordSong({ title: "A", inspirationNodeIds: [band.id, theme1.id] });
  const song2 = s.recordSong({ title: "B", inspirationNodeIds: [band.id, theme2.id] });

  const bandSongs = s.songsForNode(band.id).map((x) => x.id).sort((a, b) => a - b);
  assert.deepEqual(bandSongs, [song1, song2].sort((a, b) => a - b), "both songs link to the shared band");

  const song1Nodes = s.nodesForSong(song1).map((n) => n.id).sort((a, b) => a - b);
  assert.deepEqual(song1Nodes, [band.id, theme1.id].sort((a, b) => a - b));
  s.close();
});

test("combos reject a duplicate signature for the same node set", () => {
  const s = freshStore();
  const a = s.addNode("seed", "band", "A");
  const b = s.addNode("seed", "theme", "B");

  assert.equal(s.comboExists([a.id, b.id]), false);
  s.recordSong({ title: "first", inspirationNodeIds: [a.id, b.id] });
  assert.equal(s.comboExists([b.id, a.id]), true, "order-independent");

  assert.throws(
    () => s.recordSong({ title: "dup", inspirationNodeIds: [a.id, b.id] }),
    (err) => err.code === "COMBO_EXISTS"
  );
  s.close();
});

test("rating stores thumb + note and re-rating updates in place", () => {
  const s = freshStore();
  const node = s.addNode("seed", "band", "A");
  const songId = s.recordSong({ title: "song", inspirationNodeIds: [node.id] });

  s.rate(songId, "up", "love the sax outro");
  let r = s.getRating(songId);
  assert.equal(r.thumb, "up");
  assert.equal(r.note, "love the sax outro");

  s.rate(songId, "down", "actually the lyrics are too on-the-nose");
  r = s.getRating(songId);
  assert.equal(r.thumb, "down", "re-rating updates the thumb");
  assert.equal(r.note, "actually the lyrics are too on-the-nose");

  const count = s.db.prepare("SELECT COUNT(*) c FROM ratings WHERE song_id = ?").get(songId).c;
  assert.equal(count, 1);

  assert.throws(() => s.rate(songId, "meh"), /must be 'up' or 'down'/);
  assert.throws(() => s.rate(99999, "up"), /no such song/);
  s.close();
});

test("least-used nodes are ordered by lineage count ascending", () => {
  const s = freshStore();
  const hot = s.addNode("seed", "band", "Hot");
  const warm = s.addNode("seed", "band", "Warm");
  const cold = s.addNode("seed", "theme", "Cold"); // never used

  s.recordSong({ title: "s1", inspirationNodeIds: [hot.id, warm.id] });
  s.recordSong({ title: "s2", inspirationNodeIds: [hot.id] });

  const ranked = s.leastUsedNodes(10);
  assert.equal(ranked[0].id, cold.id, "unused node is least-used");
  assert.equal(ranked[0].use_count, 0);
  assert.equal(ranked[ranked.length - 1].id, hot.id, "most-used node is last");
  assert.equal(ranked[ranked.length - 1].use_count, 2);
  s.close();
});

test("findNode locates an existing node without inserting", () => {
  const s = freshStore();
  assert.equal(s.findNode("seed", "band", "a band"), null, "absent -> null");
  const a = s.addNode("seed", "band", "a band");
  assert.equal(s.findNode("seed", "band", "a band ").id, a.id, "normalized match");
  assert.equal(s.listNodes().length, 1, "findNode does not create a node");
  assert.equal(s.findNode("vibe", "vibe", "a band"), null, "scoped by role");
  s.close();
});

test("removeNode deletes a node (and returns null when absent)", () => {
  const s = freshStore();
  const n = s.addNode("mutator", "mutator", "oops");
  assert.equal(s.removeNode(n.id).id, n.id);
  assert.equal(s.getNode(n.id), null);
  assert.equal(s.removeNode(99999), null);
  s.close();
});

test("nodesByRole returns nodes of one role with use_count", () => {
  const s = freshStore();
  const band = s.addNode("seed", "band", "A");
  s.addNode("vibe", "vibe", "nostalgic");
  s.addNode("vibe", "vibe", "euphoric");
  s.recordSong({ title: "s", inspirationNodeIds: [band.id] });

  const seeds = s.nodesByRole("seed");
  assert.equal(seeds.length, 1);
  assert.equal(seeds[0].use_count, 1);

  const vibes = s.nodesByRole("vibe");
  assert.equal(vibes.length, 2);
  assert.ok(vibes.every((v) => v.use_count === 0));
  s.close();
});
