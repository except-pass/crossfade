<p align="center">
  <img src="logos/crossfade-banner.png" alt="crossfade" width="640">
</p>

<p align="center"><em>The infinite radio station of songs you'll actually like.</em></p>

**A personal radio station for [Suno](https://suno.com).** You seed a graph of the
bands, themes, vibes, and "mutators" you love. crossfade samples them into
combinations you'd never have thought to ask for, writes each one into a song, and
generates it in your Suno feed — recording exactly where every song came from.

> *Seed a world. Let the machine surprise you. Every song knows its lineage.*

![Your crossfade songs in the Suno library](screenshots/feed.png)

*Four songs above came from draws like "a band × a band × a
voicemail you never deleted, wry and self-deprecating." Note the styles are pure
sonic descriptors — Suno blocks real band names, so crossfade translates them.*

---

## The idea

Every node in your graph has a **role**:

- **seed** — the raw material. Sub-typed `band`, `album`, or `theme`. *(a band,
  an album, "returning home unexpectedly".)*
- **vibe** — the emotional color. *(nostalgic, manic and caffeinated, wintry and detached.)*
- **mutator** — an operation applied last. *(gender-swap the singer, set it a decade
  earlier, end on an unresolved chord.)*

Each round, crossfade **samples a combo** — 1–2 bands/albums (a single act or a
cross), an optional theme (0–1) as the subject, plus 0–2 vibes and 0–1 mutator — weighted toward
your *under-used* nodes so it keeps exploring, and it never repeats a combo it's
already made. A **DJ** turns that combo
into a song brief (concept, lyrics, style, title), translating real band names into
sonic descriptors. The brief is generated on `suno.com`, and the song's inspiration
**lineage** is written back into the graph.

```
nodes ──sample──▶ combo ──DJ writes──▶ brief ──browser──▶ song in your Suno feed
  ▲                                                              │
  └──────────────────── lineage recorded ◀──────────────────────┘
```

---

## Requirements

- **Node.js ≥ 18**
- **Google Chrome** you can launch with remote debugging
- A **Suno account** (free tier works) you're logged into, with credits to spend

crossfade generates by driving your *real, logged-in Chrome* over the Chrome
DevTools Protocol (CDP) — no API keys, no scraping your cookie. The normal setup runs
crossfade on the **same machine** as that Chrome. (Driving a browser on a *different*
machine over an SSH tunnel is possible but advanced — see
[Advanced: a remote browser](#advanced-driving-a-browser-on-another-machine).)

---

## Install

```bash
git clone git@github.com:except-pass/crossfade.git
cd crossfade
npm install
npm test          # 18 node:test cases — sanity check
```

### Launch a debug Chrome and log into Suno

crossfade connects to a Chrome started with `--remote-debugging-port`. Use a
**separate profile** (`--user-data-dir`) — Chrome 136+ refuses remote debugging on
your default profile — and quit any existing Chrome first so it doesn't silently
reuse a process without the flags.

**macOS**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 --remote-allow-origins=* \
  --user-data-dir="$HOME/.crossfade-chrome"
```

**Windows (PowerShell)**
```powershell
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  -ArgumentList '--remote-debugging-port=9222','--remote-allow-origins=*','--user-data-dir=C:\crossfade-chrome'
```

**Linux**
```bash
google-chrome --remote-debugging-port=9222 --remote-allow-origins=* \
  --user-data-dir="$HOME/.crossfade-chrome"
```

In that new Chrome window: **sign in to Suno**, then open **`https://suno.com/create`**
and leave the tab open. Confirm crossfade can see it:

```bash
node src/suno.mjs --check
# { "ok": true, "version": "...", "sunoTab": "https://suno.com/create", ... }
```

> If `--check` fails: make sure you used `127.0.0.1` (not `localhost`, which resolves
> to IPv6 and misses Chrome), a **separate** `--user-data-dir`, and that you quit all
> other Chrome instances before launching.

---

## Make your first song

**1. Seed a few nodes.**

```bash
node bin/crossfade.mjs node add seed band  "a band"
node bin/crossfade.mjs node add seed band  "a band"
node bin/crossfade.mjs node add seed theme "the friend who never made it out of the hometown"
node bin/crossfade.mjs node add vibe       "earnest to the point of oversharing"
node bin/crossfade.mjs node add mutator    "make it a duet"
node bin/crossfade.mjs node ls
```

**2. Let the machine draw a combo.**

```bash
node bin/crossfade.mjs sample
# drew a combo:
#   bands   : a band (band), a band (band)
#   theme   : the friend who never made it out of the hometown
#   vibes   : (none)
#   mutators: (none)
```

**3. Write the brief.** Today *you* are the DJ (an automated DJ agent is on the
roadmap). Copy a brief and edit it — the only rule is **no real band names in the
fields you send to Suno**; translate the sound into descriptors. A full worked
example lives in [`briefs/01-same-bar.json`](briefs/01-same-bar.json). The shape:

```json
{
  "title": "Same Bar, Same Stool",
  "tags": "anthemic 2000s emo alt-rock meets dark literate emo, earnest male lead vocals, chiming overdriven guitars, dynamic quiet-to-loud builds, cathartic climax",
  "negative_tags": "edm, trap, autotune, lo-fi",
  "prompt": "[Verse 1]\nYou're still on the same stool you were at eighteen\n...\n[Chorus]\nAnd you never made it out\n..."
}
```

`tags` is the musical style, `prompt` is the lyrics (use Suno's `[Section]` tags), and
`title` is the title.

**4. Generate it.**

```bash
node src/suno.mjs briefs/01-same-bar.json
```

crossfade switches your Suno tab to **Advanced**, fills lyrics/style/title, and clicks
**Create**. If Suno shows an hCaptcha, solve it in the browser — generation starts
the moment you do. Two takes land in your feed:

![The Advanced form, filled by crossfade](screenshots/create-form.png)

**5. Record the lineage** so the graph remembers it (and never repeats the combo).
A one-shot `burst` command that does steps 2–5 together is coming; for now:

```bash
node --input-type=module -e '
import { openStore } from "./src/store.mjs";
import { config } from "./src/config.mjs";
const s = openStore(config.dbPath);
const id = s.recordSong({
  title: "Same Bar, Same Stool",
  tags: "…", prompt: "…",
  inspirationNodeIds: [/* the node ids from your draw */],
});
console.log("recorded song", id);
s.close();'
```

That's the whole loop. Seed more nodes, sample again, and the station keeps reaching
into fresh corners of your taste.

---

## The graph

Everything lives in a local SQLite file (`crossfade.db`, gitignored). The CLI is the
window into it:

```bash
# add one or many at once — multi-word names must be quoted; dups are skipped
node bin/crossfade.mjs node add seed band "a band" "a band" "a band"
node bin/crossfade.mjs node add mutator "set it a decade earlier" "make it a duet"

node bin/crossfade.mjs node ls          # all nodes, grouped by role (with ids)
node bin/crossfade.mjs node rm 42       # remove a node by id
node bin/crossfade.mjs sample           # draw a fresh, never-before-made combo
```

`node add` is idempotent — it reports `+` for newly added names and `=` for ones
already in the graph, so you can re-run a seed list safely.

A song's lineage is a set of edges from the song to each node that inspired it, so you
can always trace *"which influences made this?"* — and the `combos` table guarantees
the sampler never hands you the same combination twice.

---

## Advanced: driving a browser on another machine

If crossfade runs on a headless box but your logged-in Chrome lives on a laptop, you
can bridge them with an SSH **reverse tunnel** and point `CDP_URL` at it:

```bash
# on the laptop: forward the box's :9223 to the laptop's Chrome :9222
ssh -N -R 9223:127.0.0.1:9222 user@your-box
# on the box:
CDP_URL=http://127.0.0.1:9223 node src/suno.mjs --check
```

The full recipe, including the Windows-firewall and IPv6 gotchas that bite, is in
[`CDP-PLUMBING.md`](CDP-PLUMBING.md). This is the exception, not the norm.

---

## Status & roadmap

Working today: the SQLite graph, the combo sampler, the `node`/`sample` CLI, and the
CDP generation driver — all tested. Songs are real and in the wild.

Next up:
- **`burst`** — one command for sample → brief → generate → record.
- **The DJ as an agent** — automate brief-writing (and let you *talk* to the DJ),
  so you don't hand-write each one.
- **Ratings** — thumbs + notes feeding the sampler so it drifts toward your taste.

Design notes and the implementation plan live in [`docs/`](docs/).

---

## License

[MIT](LICENSE).
