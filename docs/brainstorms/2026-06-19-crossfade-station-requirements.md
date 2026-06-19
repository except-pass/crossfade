---
date: 2026-06-19
topic: crossfade-station
---

# crossfade — Suno Radio Station

## Summary

crossfade is a personal Suno "station" with two halves: a deterministic **harness** and a conversational **DJ**. You seed bands, styles, and themes as nodes in a local graph; the harness owns that graph, the credit budget, generation, and ratings. The DJ — a persistent Tinstar agent with a persona — receives your inventory, budget, and rated lineage from the harness over NATS and replies with surprising combinations, each written up as concept + lyrics + style + title. The harness generates each song through the existing suno-api pipeline and records its inspiration lineage back into the graph. You can also talk to the DJ directly to steer the station, request a what-if, or react to a track, and the station drifts toward your taste over time.

---

## Problem Frame

The current spike (`generate.mjs` + `song.json`) proves one thing: you can drive suno-api in custom mode with hand-authored lyrics, style, and title and get a song into your Suno feed. But every song is a bespoke artifact — you write the whole brief by hand, there's no memory of what inspired what, and nothing stops a session from quietly burning credits.

What's missing is the *station*: a standing inventory of influences you can recombine, a DJ that finds combinations you wouldn't have thought to write, a record of which inspirations produced which songs, and a budget that lets you set it loose without watching the meter. The creative unit shifts from "I wrote this one song" to "I seeded a world and it keeps surprising me from it."

---

## Key Decisions

- **Station-first, with a directed override.** The default mode is autonomous *in taste*: the DJ chooses what to combine. You stay in control *of timing* — you fire a burst, and you can inject an explicit "what-if" combo that runs the same pipeline. Autonomy is in the creative choice, not in when credits get spent.

- **The DJ is a conversational Tinstar agent; the harness is deterministic.** The system splits in two. The **harness** owns the graph, budget/credit gating, suno-api generation and polling, lineage, and ratings — it makes no creative choices. The **DJ** is a persistent Tinstar agent with a persona that owns curation and authoring. They communicate over NATS (already scaffolded in `.mcp.json`): the harness sends the DJ inventory, budget, and rated lineage; the DJ replies with song briefs. The user can also message the DJ directly to steer the station, request a what-if, or react to a song.

- **The DJ curates; the graph is memory.** Combinations are chosen by the DJ reasoning over the node inventory and interesting tensions, not by a deterministic graph walk. The graph's job is to supply inventory, record lineage, remember what's been tried, and carry rating signal back into the DJ's next prompt.

- **Real names in the graph, sonic descriptors to Suno.** Suno blocks real band/song names (confirmed in the spike). Influence nodes store the real name for *your* graph, but the DJ must translate them into sonic descriptors before anything reaches the Suno payload — exactly what the existing `tags` field already does.

- **Plain SQLite, not a graph database.** A `nodes` table plus a song↔inspiration join table models this cleanly; recursive CTEs cover any "what connects to what" queries. A graph DB (Neo4j and friends) would be carrying cost with no payoff at this scale.

- **Hard cap + burst, not a scheduled drip.** Generation is user-triggered in batches. Before each batch the station checks the live credit balance and running spend and refuses if the batch would cross the cap. No long-running daemon, no cron.

- **Learning is prompt-level, not training.** "Learns from ratings" means the DJ's next prompt is fed which inspirations and combos produced keepers. There is no model fine-tuning — just informed prompting.

- **CLI/engine now, web UI later.** v1 builds the hard part (engine, graph, budget, ratings) as a clean CLI/library, with the data shaped so a graph-visualizing web UI can sit on top later without restructuring.

---

## Actors

- A1. **You** — seed the inventory, trigger bursts, talk to the DJ (steer, request what-ifs, react), and rate songs.
- A2. **The DJ (Tinstar agent)** — a persistent persona that, given inventory, history, and rating signal from the harness over NATS, proposes combinations and authors each song's concept, lyrics, style, and title; also converses with you directly.
- A3. **The harness** — deterministic local process that owns the graph, budget/credit gating, generation, lineage, and ratings, and brokers messages to/from the DJ over NATS.
- A4. **suno-api / Suno** — receives `custom_generate` payloads, produces audio into your feed, and reports remaining credits via `/api/get_limit`.

---

## Key Flows

- F1. **Seed the inventory**
  - **Trigger:** You add an influence to the station.
  - **Steps:** Add a node with a type (band / style / theme / …). Band-name nodes are stored under their real name for your reference.
  - **Outcome:** The node is available to the DJ for future bursts.
  - **Covered by:** R1, R2

- F2. **Burst generation** (the core loop)
  - **Trigger:** You run a burst with a count ("generate N").
  - **Steps:** The harness reads live credits and running spend, and aborts the batch if it would cross the cap or reserve floor. Otherwise it sends the DJ the node inventory, prior-combo history, rated lineage, and how many songs the budget allows. The DJ proposes N combinations, each with a concept brief, authors lyrics/style/title, and translates any real names into sonic descriptors, then sends the briefs back. The harness generates each via suno-api, polls to completion, and persists each song with its lineage edges.
  - **Outcome:** N new songs in your Suno feed, each linked in the graph to the nodes that inspired it.
  - **Covered by:** R6, R7, R8, R9, R10, R11, R12, R13, R18

- F3. **Directed what-if**
  - **Trigger:** You ask the DJ directly ("what if a band + a band made a song about returning home unexpectedly").
  - **Steps:** The DJ authors and translates for the combo you named — its *selection* step is skipped — and the brief enters the same harness generation, lineage, and budget pipeline as F2.
  - **Outcome:** One song generated and linked to the named inspirations.
  - **Covered by:** R16, R18

- F4. **Rate and learn**
  - **Trigger:** You rate a song — via a harness command or by reacting to the DJ in conversation.
  - **Steps:** The harness stores the rating against the song. The next burst's message to the DJ includes which inspirations/combos produced highly-rated songs.
  - **Outcome:** DJ proposals bias toward your taste over successive bursts.
  - **Covered by:** R14, R15, R19

---

## Requirements

### Graph and inventory

- R1. Nodes carry a type (band, style, theme), with the type set left open-ended so new kinds (mood, era, place) can be added without a schema change.
- R2. Band/song-name nodes store the real name for the user's graph but are never sent to Suno; the DJ translates them into sonic descriptors before generation.
- R3. Every generated song records its inspiration lineage as an edge from the song to each node that fed it.
- R4. Persistence is plain SQLite — a nodes table plus a song↔inspiration join table — with graph queries expressed as recursive CTEs. No graph database.
- R5. The schema supports a future web UI reading nodes, edges, songs, and ratings without restructuring.

### Curation engine

- R6. A burst sends the DJ the current node inventory, prior-combo history, rated lineage, and the song count the budget allows, and asks it to propose that many combinations, each with a concept brief.
- R7. For each chosen combination the DJ produces the four Suno inputs — concept, lyrics (with `[Section]` meta-tags), style/tags, and title — matching the existing `song.json` shape.
- R8. The DJ does not repeat combinations already present in lineage, and is steered to explore under-used corners of the graph.

### Generation pipeline

- R9. Generation reuses the suno-api `custom_generate` path (lyrics/tags/title as separate fields) and the poll-until-`audio_url` loop the spike already implements in `generate.mjs`.
- R10. Each completed song is persisted with its concept, the exact Suno inputs sent, the returned clip ids/urls, and its lineage edges.
- R11. Songs land in the user's Suno feed; crossfade does not host or re-serve audio.

### Budget and credits

- R12. The budget is a daily credit window tied to the free-tier 50-credits/day allotment, which refills daily. The user sets a daily cap at or below that; before each batch the harness reads live credits via `/api/get_limit`, projects the batch's cost, and refuses it if it would cross the daily cap or a configured reserve floor.
- R13. Bursts are user-triggered with a count; the station never generates on a schedule or as a background daemon.

### Ratings and learning

- R14. The user rates songs with a thumbs up/down plus an optional free-text note ("love the sax outro", "lyrics too on-the-nose"), via a harness command or by reacting to the DJ in conversation; the harness stores the thumb and the note against the song.
- R15. Each burst feeds the DJ which inspirations/combos produced highly-rated songs along with the free-text notes, so the DJ learns not just whether a song landed but why; learning is prompt-level only, with no model training.

### DJ agent and harness

- R18. The DJ runs as a persistent Tinstar agent and exchanges messages with the harness over NATS; the harness sends inventory/budget/lineage and receives song briefs. The user can also message the DJ directly to steer the station, request a what-if, or react to a song.
- R19. The harness is the system of record for the graph, budget, and ratings; the DJ holds no durable state the harness depends on. A restarted DJ can be rehydrated from harness-supplied context.

### Directed override and interface

- R16. The user can supply an explicit combination — by asking the DJ — that runs the same generation, lineage, and budget pipeline as a burst, skipping the DJ's selection step.
- R17. v1 is a harness CLI/library plus the DJ agent — add/list nodes, run a burst, rate songs, query lineage, and converse with the DJ — with no web UI.

---

## Acceptance Examples

- AE1. **Covers R12.** Given a weekly cap with little headroom left, when you request a burst of 5, the station computes the projected spend, sees it would cross the cap, and refuses the whole batch before sending anything to Suno.
- AE2. **Covers R2.** Given a node named "a band", when a song inspired by it is generated, the Suno `custom_generate` payload contains only sonic descriptors (e.g. "post-grunge radio rock, earnest male vocals, jangly guitars") — the literal string "a band" never appears in what's sent to Suno, while the graph lineage still links the song to the "a band" node.
- AE3. **Covers R8.** Given that the combination (band A + theme B) already exists in lineage, when a new burst runs, the DJ is not offered — and does not propose — that same combination again.

---

## Scope Boundaries

### Deferred for later

- Web UI and visual inspiration graph — the schema is designed for it, but v1 ships the engine only.
- DJ-suggested new nodes (the station proposing influences to add, auto-growing the graph from what you already have).
- Scheduled / drip generation — possible later, but v1 is burst-only.

### Outside this product's identity

- Not a Suno replacement or audio host — songs live in your Suno feed.
- Not a multi-user or shared service — single-user, local-first.
- Not a consumer of Suno's own like/play state — ratings are captured locally rather than round-tripped from Suno.

---

## Dependencies / Assumptions

- A locally running suno-api with a valid `SUNO_COOKIE` and `TWOCAPTCHA_KEY`; live generation is blocked without them (per the spike's current status).
- The account is Suno free tier: 50 credits/day, refilling daily. `/api/get_limit` accurately reflects spendable credits, and per-generation cost (≈10 credits for 2 clips) is knowable closely enough for the harness to project a batch's spend before sending it.
- Tinstar is running and the NATS channel is available (both already present on this machine; `.mcp.json` wires the NATS MCP). The DJ is a Claude-backed Tinstar agent, so its token use is a cost line separate from Suno credits.
- Suno's blocking of real band/song names persists, making the name→descriptor translation a permanent requirement rather than a workaround.

---

## Outstanding Questions

### Deferred to planning

- Whether the DJ is always-on (a standing agent you can DM anytime) or spun up per burst by the harness, and the NATS subject/message schema between harness and DJ.
- Node identity / de-duplication (is "a band" the same node as "a band"?).
- How much lineage and rating history fits in the DJ's prompt before it needs summarizing or sampling.
- Whether concept briefs are stored verbatim per song or regenerated on demand.
