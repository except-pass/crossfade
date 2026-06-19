import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore, normalize, comboSignature } from "../src/store.mjs";

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

test("node dedup: variants collapse to one node, real name preserved", () => {
  const s = freshStore();
  const a = s.addNode("band", "a band");
  const b = s.addNode("band", "a band "); // normalizes identically
  assert.equal(a.id, b.id, "same normalized name -> same node");
  assert.equal(s.listNodes().length, 1);
  assert.equal(s.getNode(a.id).name, "a band", "first real name is preserved");
  s.close();
});

test("empty/punctuation-only node names are rejected", () => {
  const s = freshStore();
  assert.throws(() => s.addNode("band", "   "), /empty after normalization/);
  assert.throws(() => s.addNode("band", "!!!"), /empty after normalization/);
  s.close();
});

test("song persists with concept, exact inputs, clip ids/urls, and lineage", () => {
  const s = freshStore();
  const band1 = s.addNode("band", "a band");
  const band2 = s.addNode("band", "a band");
  const theme = s.addNode("theme", "returning home unexpectedly");

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
  const band = s.addNode("band", "a band");
  const theme1 = s.addNode("theme", "homecoming");
  const theme2 = s.addNode("theme", "leaving");

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
  const a = s.addNode("band", "A");
  const b = s.addNode("theme", "B");

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
  const node = s.addNode("band", "A");
  const songId = s.recordSong({ title: "song", inspirationNodeIds: [node.id] });

  s.rate(songId, "up", "love the sax outro");
  let r = s.getRating(songId);
  assert.equal(r.thumb, "up");
  assert.equal(r.note, "love the sax outro");

  s.rate(songId, "down", "actually the lyrics are too on-the-nose");
  r = s.getRating(songId);
  assert.equal(r.thumb, "down", "re-rating updates the thumb");
  assert.equal(r.note, "actually the lyrics are too on-the-nose");

  // still a single rating row, not a duplicate
  const count = s.db.prepare("SELECT COUNT(*) c FROM ratings WHERE song_id = ?").get(songId).c;
  assert.equal(count, 1);

  assert.throws(() => s.rate(songId, "meh"), /must be 'up' or 'down'/);
  assert.throws(() => s.rate(99999, "up"), /no such song/);
  s.close();
});

test("least-used nodes are ordered by lineage count ascending", () => {
  const s = freshStore();
  const hot = s.addNode("band", "Hot");
  const warm = s.addNode("band", "Warm");
  const cold = s.addNode("theme", "Cold"); // never used

  s.recordSong({ title: "s1", inspirationNodeIds: [hot.id, warm.id] });
  s.recordSong({ title: "s2", inspirationNodeIds: [hot.id] });

  const ranked = s.leastUsedNodes(10);
  assert.equal(ranked[0].id, cold.id, "unused node is least-used");
  assert.equal(ranked[0].use_count, 0);
  assert.equal(ranked[ranked.length - 1].id, hot.id, "most-used node is last");
  assert.equal(ranked[ranked.length - 1].use_count, 2);
  s.close();
});
