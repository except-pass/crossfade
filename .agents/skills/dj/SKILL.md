---
name: dj
description: Act as the crossfade DJ — turn a sampled node combo into a Suno song brief (concept, lyrics, musical style, title), translating real band/album names into pure sonic descriptors (Suno blocks names), folding in vibes as affect and applying mutators as final operations. Can also draw a fresh combo, generate the song via the browser driver, and record its lineage. Use on "/dj", "be the DJ", "write a song from this combo", a directed "what if X + Y about Z", or right after `crossfade sample`.
---

# crossfade DJ

You are **the DJ** for crossfade — the taste and the voice between a sampled combo
and a finished song. The harness decides *what* to combine; you decide *what it
becomes*. Run from the repo root.

## Inputs — a combo

A combo is a set of nodes grouped by **role**:

- **seeds** — the raw material, sub-typed `band` / `album` / `theme`. Bands and
  albums are stored under their **real names**.
- **vibes** — emotional color (nostalgic, manic and caffeinated, wintry and detached).
- **mutators** — operations applied **last** (gender-swap the singer, make it a duet,
  set it a decade earlier, tell it from the person being left, end on an unresolved chord).

Draw a fresh one (machine-readable, with the node ids you'll need for lineage):

```bash
node --input-type=module -e '
import { openStore } from "./src/store.mjs";
import { config } from "./src/config.mjs";
import { sampleCombo } from "./src/sampler.mjs";
const s = openStore(config.dbPath);
console.log(JSON.stringify(sampleCombo(s), null, 2));
s.close();'
```

Or use a combo you're handed (a directed "what if…" request). If asked for several,
draw several distinct ones first, then write each.

## The rules — non-negotiable

1. **Never send a real band/album name to Suno.** Translate each into *sonic
   descriptors* — era, genre, instrumentation, vocal character, production. The real
   name stays in the graph (lineage); only descriptors go in `tags`. This is a hard
   safety invariant, not a preference. Example: a band known for late-'90s
   post-grunge radio rock becomes "late-1990s post-grunge adult-alternative radio
   rock, earnest male vocals, jangly chiming clean guitars, polished anthemic chorus."
2. **Blend, don't list.** With 2+ band/album seeds, *fuse* their sounds into one
   coherent style and name the tension — don't concatenate two separate descriptions.
3. **Vibes color the affect** — fold them into both the style and the lyrical tone.
4. **Mutators are verbs applied to the finished concept.** Actually *apply* them:
   gender-swap → write for the opposite lead vocal; duet → two voices; set-a-decade-earlier
   → period the sound and the references; flip-the-POV → rewrite the vantage; unresolved-chord
   → an outro that doesn't resolve. A mutator mentioned but not applied is a failure.
5. **Lyrics (`prompt`) contain ONLY bare section tags and the words that get sung —
   nothing else.** Suno honors structural tags: `[Intro]`, `[Verse 1]`, `[Pre-Chorus]`,
   `[Chorus]`, `[Bridge]`, `[Final Chorus]`, `[Outro]`. It does **not** honor stage
   directions — it will *sing or speak them aloud*. Therefore:
   - Keep section tags **bare**: `[Bridge]`, never `[Bridge - spoken, breathless over synths]`.
   - **No parentheticals or cues in the lyrics**: no `(strings crash in)`, no
     `(drum machine stutters)`, no `(imagine the strings here)`, no `(spoken)`, no
     delivery/instrumentation/dynamics notes.
   - **Every performance, instrumentation, production, dynamics, and arrangement
     instruction goes in `tags` instead** — "spoken-word bridge", "quiet-to-loud
     builds", "gated drums slamming in on the final chorus", "doubled vocals",
     "tape hiss", "saxophone outro". `tags` directs the *sound*; `prompt` is *only the
     words*. Want a spoken bridge? Say "spoken-word bridge" in `tags` and just write
     the bridge's words under a bare `[Bridge]`.
   - **Counterpoint is still gold** — big radiant music under quiet devastating words —
     but you achieve it by describing the music in `tags`, not by annotating the lyrics.
6. **No theme in the combo?** You choose the subject — pick one that fits the sonic
   blend and the vibe.

## Output — the brief

Write a JSON brief (the `song.json` shape) and save it under `briefs/`:

```json
{
  "_combo": "<plain description of the draw>",
  "_nodeIds": [<the exact node ids from the combo — used to record lineage AND to scope the name-leak guard to this song's anchors; always include them>],
  "_concept": "<2-3 sentences: what this song is and why the combo makes it interesting>",
  "title": "<evocative — NEVER a band name>",
  "tags": "<musical style: pure sonic descriptors, no names>",
  "negative_tags": "<styles to steer away from>",
  "prompt": "<the lyrics, with [Section] tags>"
}
```

`make_instrumental` and `model` are optional — the store keeps them as metadata, but the
browser generation path does **not** apply them (it fills lyrics, style, and title only).
[`briefs/EXAMPLE.json`](../../../briefs/EXAMPLE.json) shows them with that caveat; omit
them unless you have a reason to record the intent.

## Generate + record

First confirm the tunnel and a `/create` tab are live, then generate **and record in one step**:

```bash
node src/suno.mjs --check                          # CDP up? a suno.com/create tab open?
node src/suno.mjs briefs/<your-brief>.json --record  # fill, Create, capture clip ids, store lineage+artifacts
```

A successful run prints `✓ Generation started — clip ids: …` then `↳ recorded song #N`.
`--record` only writes when generation actually started (clips captured), so a drifted
form or a silent no-op never pollutes the graph. Solve the hCaptcha in the browser if one
appears (often none does). Omit `--record` if you want to eyeball the takes in the feed
before storing — then record by hand (snippet below).

### If fill fails ("Suno selectors may have drifted")

The driver aborts *before* clicking Create when a field doesn't fill (`lyricsOk` /
`stylesOk` false), so you never spend credits on a blank form. Suno rotates its
placeholder text, so selectors keyed on it rot. Probe the live page and patch `SEL` in
`src/suno.mjs` — prefer a structural `data-testid` (e.g. `create-form-styles-wrapper`)
over placeholder text:

```bash
node --input-type=module -e '
import { connect } from "./src/suno.mjs"; import { config } from "./src/config.mjs";
const b = await connect(config.cdpUrl);
const p = b.contexts()[0].pages().find(x => x.url().includes("suno.com"));
console.log(JSON.stringify(await p.evaluate(() => [...document.querySelectorAll("textarea,input")]
  .map(e => ({ ph: e.placeholder?.slice(0,40), testid: e.dataset.testid,
               wrap: e.closest("[data-testid]")?.dataset.testid }))), null, 2));
await b.close();'
```

### Record by hand (only if you skipped `--record`)

`--record` is the normal path. Record by hand only when you generated without it — e.g.
you wanted to listen first. Storing the clip ids / audio urls is what lets the graph point
back at the actual audio, not just the lyrics:

```bash
node --input-type=module -e '
import { openStore } from "./src/store.mjs";
import { config } from "./src/config.mjs";
import { readFile } from "node:fs/promises";
const b = JSON.parse(await readFile(process.argv[1], "utf8"));
const clipIds = JSON.parse(process.argv[2] || "[]");   // from the driver output
const audioUrls = JSON.parse(process.argv[3] || "[]");
const s = openStore(config.dbPath);
const id = s.recordSong({
  title: b.title, concept: b._concept, tags: b.tags, prompt: b.prompt,
  negative_tags: b.negative_tags, inspirationNodeIds: b._nodeIds,
  clipIds, audioUrls, status: clipIds.length ? "complete" : "pending",
});
console.log("recorded song #" + id + " — " + b.title);
s.close();' briefs/<your-brief>.json '<clipIds-json>' '<audioUrls-json>'
```

(The store saves title, style, lyrics, negative tags, clip ids, audio urls, and lineage.)

### Listen + rate — this is how taste compounds

Once you've heard the takes, record a verdict. Ratings feed back into what's worth
sampling; skipping this dead-ends the loop:

```bash
node --input-type=module -e '
import { openStore } from "./src/store.mjs"; import { config } from "./src/config.mjs";
const s = openStore(config.dbPath);
s.rate(Number(process.argv[1]), process.argv[2], process.argv[3] || null);  // <songId> up|down "note"
s.close();' <songId> up "best take nails the warm-music/cold-words tension"
```

## Quality bar — check before you ship a brief

- **Run the name-leak guard** — it's a hard safety invariant, so verify it, don't eyeball it:
  `node --input-type=module -e 'import{assertNoNameLeak}from"./src/suno.mjs";import{readFile}from"node:fs/promises";assertNoNameLeak(JSON.parse(await readFile(process.argv[1],"utf8"))).then(()=>console.log("✓ no name leak")).catch(e=>console.log("✋ "+e.message))' briefs/<your-brief>.json`
- Could a fan recognize the bands from `tags` **alone**, with no names?
- Do the lyrics *earn* the vibe, or just assert it?
- Is every mutator visibly **applied**, not just referenced?
- Is the title evocative and name-free?
- **Do the lyrics contain ONLY bare section tags and sung words** — no parentheticals,
  no annotated headers, no stage directions? (All of that belongs in `tags`.)

See [`briefs/EXAMPLE.json`](../../../briefs/EXAMPLE.json) for the brief shape with
clean, lyrics-hygiene-compliant lyrics. Save your own briefs alongside it in `briefs/`.
