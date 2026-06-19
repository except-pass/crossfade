# crossfade

A personal Suno radio station. You seed bands/albums, themes, vibes, and mutators
as nodes in a local graph; crossfade samples them into surprising combinations, a
DJ writes each combo into a song brief, and it generates the song in your Suno
feed — recording every song's inspiration lineage back into the graph.

## How it works

- **Nodes** carry a role: `seed` (sub-typed `band` / `album` / `theme`), `vibe`
  (affect — nostalgic, euphoric…), or `mutator` (an operation applied last, e.g.
  "gender-swap the singer", "strip every cliché"). Stored in SQLite (`src/store.mjs`).
- **Sampler** (`src/sampler.mjs`) draws a combo each round — 2–3 seeds with ≥1
  band/album anchor, 0–2 vibes, 0–1 mutator — weighted toward under-used nodes for
  novelty, never repeating a past combo.
- **DJ** turns the combo into a brief (concept + lyrics + style + title) and
  translates real band names into pure sonic descriptors (Suno blocks names). The
  DJ-as-an-agent is upcoming; today the brief is authored by hand/LLM.
- **Generation** (`src/suno.mjs`) drives a real, logged-in Chrome on `suno.com/create`
  over CDP (Playwright-core), fills the Advanced form, clicks Create. The song lands
  in your Suno feed; an occasional hCaptcha is solved by hand. Lineage is recorded.

## Status

First end-to-end song generated **2026-06-19** — *"Still Saved"* (a band ×
returning home unexpectedly × a voicemail you never deleted, gender-swapped). The
foundation ships: SQLite store, combo sampler, node/sample CLI, and the CDP
generation driver, all tested. Next: the single `burst` command (sample → brief →
generate → record) and the DJ as a Tinstar agent. Design and plan live in `docs/`.

## Use

```bash
npm install
node bin/crossfade.mjs node add seed band "a band"
node bin/crossfade.mjs node add seed theme "returning home unexpectedly"
node bin/crossfade.mjs node add vibe "nostalgic"
node bin/crossfade.mjs node add mutator "gender-swap the singer"
node bin/crossfade.mjs node ls
node bin/crossfade.mjs sample      # draw a combo (no generation)
npm test                           # node:test suites
```

Generation needs a CDP connection to a logged-in Chrome (see
[`CDP-PLUMBING.md`](./CDP-PLUMBING.md) for the remote-drives-local-browser recipe),
then:

```bash
CDP_URL=http://127.0.0.1:9223 node src/suno.mjs <brief.json>   # fill + Create
CDP_URL=http://127.0.0.1:9223 node src/suno.mjs --check        # connectivity preflight
```

## Layout

- `src/` — `store` (graph), `sampler` (combo engine), `suno` (CDP driver), `config`
- `bin/crossfade.mjs` — the CLI
- `test/` — `node:test` suites
- `docs/` — brainstorm (requirements) and plan
- `CDP-PLUMBING.md` — the remote-box-drives-local-browser-over-CDP recipe
- spike scripts (`generate.mjs`, `suno-*.mjs`, `cdp-smoke.mjs`) — exploration, kept for reference
- `suno-api/` *(gitignored)* — vendored [gcui-art/suno-api](https://github.com/gcui-art/suno-api), an alternative HTTP generation path
