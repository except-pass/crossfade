// The crossfade store — SQLite system of record for the inspiration graph,
// songs, lineage, ratings, and combo history (R3, R4, R5, R10, R14, R19).
//
// Nodes carry a ROLE (seed | vibe | mutator) plus a free-text sub-type:
//   - seed    : material/direction. Sub-types: band, album, theme. Only band/album
//               carry real names (the name-leak guard scopes to these).
//   - vibe    : affect/color (nostalgic, euphoric, melancholy). Optional spice.
//   - mutator : an operation applied last (gender-swap the singer, strip the cliches).
//
// The graph is bipartite (songs <-> nodes); "what connects to what" queries are
// joins over song_inspirations. The store is generation-mechanism-agnostic: it
// records the brief inputs and whatever clip ids / urls a generation returns.

import Database from "better-sqlite3";

export const ROLES = ["seed", "vibe", "mutator"];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS nodes (
  id              INTEGER PRIMARY KEY,
  role            TEXT NOT NULL,                 -- seed | vibe | mutator
  type            TEXT NOT NULL,                 -- sub-kind: band | album | theme | vibe | mutator (R1)
  name            TEXT NOT NULL,                 -- real name, preserved for the user's graph (R2)
  normalized_name TEXT NOT NULL,                 -- dedup key (KTD-5)
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (role, type, normalized_name)
);

CREATE TABLE IF NOT EXISTS songs (
  id            INTEGER PRIMARY KEY,
  title         TEXT NOT NULL,
  concept       TEXT,
  tags          TEXT,                            -- style descriptors sent to generation
  prompt        TEXT,                            -- lyrics
  negative_tags TEXT,
  model         TEXT,
  clip_ids      TEXT,                            -- JSON array of returned clip ids (R10)
  audio_urls    TEXT,                            -- JSON array
  image_urls    TEXT,                            -- JSON array
  status        TEXT NOT NULL DEFAULT 'complete',-- complete | pending | timeout | error
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS song_inspirations (
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  PRIMARY KEY (song_id, node_id)                 -- the lineage edge (R3)
);

CREATE TABLE IF NOT EXISTS ratings (
  song_id    INTEGER PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
  thumb      TEXT NOT NULL,                       -- 'up' | 'down'
  note       TEXT,                                -- optional free-text (R14)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS combos (
  signature  TEXT PRIMARY KEY,                    -- sorted node-id set; powers repeat-avoidance (R8/AE3)
  song_id    INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_insp_node ON song_inspirations(node_id);
CREATE INDEX IF NOT EXISTS idx_insp_song ON song_inspirations(song_id);
CREATE INDEX IF NOT EXISTS idx_nodes_role ON nodes(role);
`;

// Normalize a node name to its dedup key: lowercase, NFKC, collapse internal
// whitespace, strip surrounding punctuation (KTD-5). Exported because the
// name-leak guard (KTD-6) reuses the same normalization for matching.
export function normalize(name) {
  return String(name)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "")
    .trim();
}

// A combo signature is the unique, order-independent fingerprint of a node set.
export function comboSignature(nodeIds) {
  return [...new Set(nodeIds.map(Number))].sort((a, b) => a - b).join(",");
}

function parseSong(row) {
  if (!row) return null;
  return {
    ...row,
    clip_ids: JSON.parse(row.clip_ids || "[]"),
    audio_urls: JSON.parse(row.audio_urls || "[]"),
    image_urls: JSON.parse(row.image_urls || "[]"),
  };
}

export function openStore(dbPath = ":memory:") {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);

  const q = {
    insertNode: db.prepare(
      "INSERT INTO nodes (role, type, name, normalized_name) VALUES (@role, @type, @name, @normalized)"
    ),
    nodeById: db.prepare("SELECT * FROM nodes WHERE id = ?"),
    nodeByKey: db.prepare(
      "SELECT * FROM nodes WHERE role = ? AND type = ? AND normalized_name = ?"
    ),
    allNodes: db.prepare("SELECT * FROM nodes ORDER BY role, type, id"),
    nodesByRole: db.prepare(`
      SELECT n.*, COUNT(si.song_id) AS use_count
      FROM nodes n
      LEFT JOIN song_inspirations si ON si.node_id = n.id
      WHERE n.role = ?
      GROUP BY n.id
      ORDER BY n.id
    `),
    insertSong: db.prepare(`
      INSERT INTO songs (title, concept, tags, prompt, negative_tags, model, clip_ids, audio_urls, image_urls, status)
      VALUES (@title, @concept, @tags, @prompt, @negative_tags, @model, @clip_ids, @audio_urls, @image_urls, @status)
    `),
    songById: db.prepare("SELECT * FROM songs WHERE id = ?"),
    insertInspiration: db.prepare(
      "INSERT OR IGNORE INTO song_inspirations (song_id, node_id) VALUES (?, ?)"
    ),
    insertCombo: db.prepare("INSERT INTO combos (signature, song_id) VALUES (?, ?)"),
    comboBySignature: db.prepare("SELECT 1 FROM combos WHERE signature = ?"),
    songsForNode: db.prepare(`
      SELECT s.* FROM songs s
      JOIN song_inspirations si ON si.song_id = s.id
      WHERE si.node_id = ? ORDER BY s.id
    `),
    nodesForSong: db.prepare(`
      SELECT n.* FROM nodes n
      JOIN song_inspirations si ON si.node_id = n.id
      WHERE si.song_id = ? ORDER BY n.id
    `),
    upsertRating: db.prepare(`
      INSERT INTO ratings (song_id, thumb, note) VALUES (@song_id, @thumb, @note)
      ON CONFLICT(song_id) DO UPDATE SET thumb = excluded.thumb, note = excluded.note, created_at = datetime('now')
    `),
    ratingForSong: db.prepare("SELECT * FROM ratings WHERE song_id = ?"),
    leastUsedNodes: db.prepare(`
      SELECT n.*, COUNT(si.song_id) AS use_count
      FROM nodes n
      LEFT JOIN song_inspirations si ON si.node_id = n.id
      GROUP BY n.id
      ORDER BY use_count ASC, n.id ASC
      LIMIT ?
    `),
  };

  const store = {
    db,

    // --- Nodes (R1, R2, dedup KTD-5) ---
    addNode(role, type, name) {
      if (!ROLES.includes(role)) {
        throw new Error(`node role must be one of ${ROLES.join("|")}, got: ${role}`);
      }
      const subtype = String(type || role).trim();
      const normalized = normalize(name);
      if (!normalized) throw new Error("node name is empty after normalization");
      const existing = q.nodeByKey.get(role, subtype, normalized);
      if (existing) return existing; // dedup: real name of the first insert is preserved
      const info = q.insertNode.run({ role, type: subtype, name: String(name).trim(), normalized });
      return q.nodeById.get(info.lastInsertRowid);
    },
    getNode(id) {
      return q.nodeById.get(id) ?? null;
    },
    listNodes() {
      return q.allNodes.all();
    },
    // Nodes of a role with their lineage use_count — the sampler's input (novelty weighting).
    nodesByRole(role) {
      return q.nodesByRole.all(role);
    },

    // --- Combos (repeat-avoidance, R8/AE3) ---
    comboExists(nodeIds) {
      const sig = comboSignature(nodeIds);
      return sig !== "" && q.comboBySignature.get(sig) != null;
    },

    // --- Songs + lineage (R3, R10) ---
    recordSong(song) {
      const {
        title,
        concept = null,
        tags = null,
        prompt = null,
        negative_tags = null,
        model = null,
        clipIds = [],
        audioUrls = [],
        imageUrls = [],
        inspirationNodeIds = [],
        status = "complete",
      } = song;
      if (!title) throw new Error("song.title is required");

      const signature = comboSignature(inspirationNodeIds);
      if (signature && this.comboExists(inspirationNodeIds)) {
        const err = new Error(`combo already generated: ${signature}`);
        err.code = "COMBO_EXISTS";
        throw err;
      }

      const tx = db.transaction(() => {
        const info = q.insertSong.run({
          title,
          concept,
          tags,
          prompt,
          negative_tags,
          model,
          clip_ids: JSON.stringify(clipIds),
          audio_urls: JSON.stringify(audioUrls),
          image_urls: JSON.stringify(imageUrls),
          status,
        });
        const songId = Number(info.lastInsertRowid);
        for (const nodeId of new Set(inspirationNodeIds.map(Number))) {
          q.insertInspiration.run(songId, nodeId);
        }
        if (signature) q.insertCombo.run(signature, songId);
        return songId;
      });
      return tx();
    },
    getSong(id) {
      return parseSong(q.songById.get(id));
    },
    songsForNode(nodeId) {
      return q.songsForNode.all(nodeId).map(parseSong);
    },
    nodesForSong(songId) {
      return q.nodesForSong.all(songId);
    },
    leastUsedNodes(limit = 10) {
      return q.leastUsedNodes.all(limit);
    },

    // --- Ratings (R14) ---
    rate(songId, thumb, note = null) {
      if (thumb !== "up" && thumb !== "down") {
        throw new Error(`rating thumb must be 'up' or 'down', got: ${thumb}`);
      }
      if (!q.songById.get(songId)) throw new Error(`no such song: ${songId}`);
      q.upsertRating.run({ song_id: songId, thumb, note });
      return q.ratingForSong.get(songId);
    },
    getRating(songId) {
      return q.ratingForSong.get(songId) ?? null;
    },

    close() {
      db.close();
    },
  };

  return store;
}

export default openStore;
