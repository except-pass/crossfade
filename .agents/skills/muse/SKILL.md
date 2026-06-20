---
name: muse
description: Get inspiration for new crossfade nodes without staring at a blank wall. Picks a source from a curated list (PostSecret, the Dictionary of Obscure Sorrows, Oblique Strategies, Craigslist Missed Connections, small-town obituaries, Hopper paintings, film grammar…), pulls a concrete artifact from it, and derives a candidate theme, vibe, or mutator — abstracting the emotional situation so it's specific but never on-the-nose. Presents candidates for review; NEVER auto-adds them to the graph. Use on "/muse", "get inspiration", "find new themes/vibes/mutators", or "the graph feels stale".
---

# crossfade muse

You feed the station fresh **themes**, **vibes**, and **mutators** by mining the world,
not by inventing from nothing. The move every time: **pick a source → pull one concrete
artifact from it → derive a node by abstracting the artifact's emotional situation.**
Run from the repo root.

## Sources (grouped by the node-type they feed best)

### → Themes — song subjects (specific human situations)
- **PostSecret** — anonymous postcard confessions
- **Craigslist Missed Connections** — near-miss micro-stories
- **NYT Tiny Love Stories / Modern Love** — a whole relationship in ~100 words
- **Small-town obituaries** — a life compressed to one telling detail
- **1-star reviews / police-blotter columns** — tiny tragedies and absurdities
- **r/offmychest, r/confession, AmItheAsshole** — raw situations and moral knots
- **Estate sales / Found notes** — what people leave behind
- **Google autocomplete** ("how do I tell…", "why does he still…") — collective ache
- **Edward Hopper / Gregory Crewdson** — pre-loaded melancholy (abstract the scene)
- **A famous film scene, abstracted to its emotional situation** (never name the film)

### → Vibes — emotional colors
- **The Dictionary of Obscure Sorrows** (John Koenig) — precise invented feelings
- **Untranslatable emotions** — saudade, mono no aware, toska, han, hygge, sehnsucht
- **Perfume / wine tasting notes** — "wet asphalt and old paperbacks"
- **Liminal spaces** — empty malls, 3am gas stations, the school in summer
- **Aesthetic microgenres** — dark academia, vaporwave, sadcore, cottagecore

### → Mutators — operations & twists
- **Oblique Strategies** (Brian Eno & Peter Schmidt) — creative-constraint cards
- **Oulipo constraints** — lipograms, "tell it without the word 'love'"
- **TV Tropes** — narrative devices to invert
- **Cover / remix culture** — slowed+reverb, 8-bit, nightcore, "how would [genre] cover this"
- **Film grammar** — unreliable narrator, told in reverse, Rashomon POV-swap

## Process (per candidate)

1. **Pick a source.** Rotate for variety — don't pull from the same source twice in one
   batch. If the user asked for a specific node-type, pick from that group; otherwise mix
   across all three.
2. **Pull a concrete artifact.** Get a *real, specific* piece. Fetch from the web when the
   source has public material (Missed Connections, the Dictionary of Obscure Sorrows,
   Oblique Strategies, PostSecret galleries) — otherwise evoke a vivid, authentic artifact
   in that source's exact voice. Quote the actual artifact in the output.
3. **Derive the node.** Abstract the artifact's *emotional situation* into a theme / vibe /
   mutator. Strip every identifying specific (a name, the film title, the brand) and keep
   the universal, oddly-specific feeling underneath.
4. **On-the-nose self-check.** Would a listener instantly name the source, or is it a tired
   cliché ("dancing in the kitchen", "tears in the rain")? If so, abstract harder.

## Output — review, never add

Present all candidates together, each as:

- **Source:** <which one>
- **Pulled:** "<the concrete artifact, quoted>"
- **→ <seed:theme | vibe | mutator>:** `<the derived node name>`
- **why:** <one line — the abstraction move you made>

Then stop. **Do NOT run `crossfade node add`** — these are for the user to thumbs-up/down.
Only after they pick do you (on their say-so) add the chosen ones, e.g.
`node bin/crossfade.mjs node add vibe "<name>"`.

## Node-name style (match the existing graph)

- **theme** — a situation, not a topic: `"a voicemail you never deleted"`, not `"loss"`.
- **vibe** — an affect: `"wry and self-deprecating"`, `"hopeful against the evidence"`.
- **mutator** — an imperative operation: `"set it a decade earlier"`, `"make it a duet"`.

Lowercase-ish, evocative, ~3–10 words. No real band names, no proper nouns that identify
the source.
