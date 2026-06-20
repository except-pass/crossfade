# crossfade — guided install runbook

**This file is written for a coding agent to execute** (Claude Code, Cursor, etc.) with
a human in the loop. If you're a person: paste the prompt from the README's
["Make your first song"](README.md#make-your-first-song-let-your-agent-drive) section
into your agent and it will follow this runbook for you.

---

## Agent instructions

You are taking a person from a fresh clone of this repo to their **first generated
song**. Work through the steps in order. Steps marked **🧑 HUMAN** require an action
only the person can do — stop, tell them exactly what to do, and wait. Run every
verification check; don't assume a step worked. Keep them informed and keep it light —
this is supposed to be fun.

---

### 0. Preconditions — check, don't assume

- `node --version` → must be **≥ 18**. If missing, help them install Node first.
- Google **Chrome** installed.
- A **Suno account** (the free tier works) with some credits. If they don't have one,
  send them to https://suno.com to sign up, then continue.

### 1. Install

```bash
npm install
npm test          # expect all suites green
```

If `better-sqlite3` fails to build, make sure native build tools are present (Xcode
Command Line Tools on macOS, `build-essential` on Linux) and retry `npm install`.

### 2. 🧑 HUMAN — start a debug Chrome and sign into Suno

crossfade generates by driving the person's **real, logged-in Chrome** over the Chrome
DevTools Protocol. Ask them to **quit all Chrome windows first**, then launch a debug
instance with a *separate* profile (Chrome refuses remote debugging on the default
profile):

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

Then have them **sign into Suno** in that new window and open
**https://suno.com/create**. Verify the connection yourself:

```bash
node src/suno.mjs --check     # expect "ok": true and a "sunoTab": ".../create"
```

If it fails: confirm they used a **separate** `--user-data-dir`, that they **quit other
Chrome instances** first, and remember the connection uses `127.0.0.1` (not `localhost`,
which resolves to IPv6 and misses Chrome). If their Chrome lives on a different machine,
see [`CDP-PLUMBING.md`](CDP-PLUMBING.md) — but that's the advanced case.

### 3. Seed the graph

**3a. Auto-seed the generic primitives.** Themes, vibes, and mutators aren't anyone's
personal taste — they're the creative dials. Seed a starter set yourself, no need to
ask (`node add` takes many quoted names at once and skips duplicates):

```bash
node bin/crossfade.mjs node add seed theme \
  "returning home unexpectedly" "a voicemail you never deleted" \
  "the last summer before everyone scatters" "texting an ex you swore you were over" \
  "driving nowhere at 2am to feel something" "still in love at someone else's wedding" \
  "the friend who never made it out of the hometown" "growing out of the scene that raised you"

node bin/crossfade.mjs node add vibe \
  "nostalgic" "euphoric but melancholy" "anthemic and desperate" "bittersweet" \
  "yearning" "defiant" "wry and self-deprecating" "wintry and detached"

node bin/crossfade.mjs node add mutator \
  "gender-swap the singer" "strip every cliche" "make it a duet" "set it a decade earlier" \
  "tell it from the person being left, not the one leaving" "add a spoken-word bridge" \
  "make it a lo-fi bedroom demo" \
  "if the band were still together today — aged up, the adult, age-appropriate version"
```

**3b. 🧑 HUMAN — ask for the bands.** This is the fun part of onboarding: ask the
person **what bands or artists they love** (a handful is plenty), and add exactly those.
Do **not** add bands they didn't name — the graph is theirs to fill.

```bash
node bin/crossfade.mjs node add seed band "<the bands they named>" "<another>" ...
# optional: a favorite album as a tighter seed
node bin/crossfade.mjs node add seed album "<a favorite album>"
node bin/crossfade.mjs node ls
```

You need **at least one band/album** to draw a combo.

### 4. Draw a combo

```bash
node bin/crossfade.mjs sample
```

To capture the exact node ids (needed to record lineage in step 7), draw with the
machine-readable snippet from the DJ skill instead — see
[`.agents/skills/dj/SKILL.md`](.agents/skills/dj/SKILL.md).

### 5. Be the DJ — write the brief

Use the repo's **`/dj` skill** ([`.agents/skills/dj/SKILL.md`](.agents/skills/dj/SKILL.md))
— or just follow its rules yourself — to turn the drawn combo into a song brief and save
it to `briefs/first-song.json`. The rules that matter most:

- **Translate real band names into pure sonic descriptors** in the `tags` (style) field —
  Suno blocks names. The graph keeps the real names; Suno only sees the sound.
- **Lyrics (`prompt`) hold ONLY bare `[Section]` tags and the sung words** — no stage
  directions, no parentheticals. All performance/instrumentation direction goes in `tags`.
- Apply any **vibe** (affect) and **mutator** (an operation applied last).

`briefs/01-same-bar.json` and `briefs/08-the-quiet-we-wanted.json` are worked examples.

### 6. 🧑 HUMAN — generate

```bash
node src/suno.mjs briefs/first-song.json
```

This switches their Suno tab to Advanced, fills lyrics/style/title, and clicks **Create**.
If an hCaptcha appears, the person solves it in the browser (often none does). Two takes
land in their Suno feed.

### 7. Record the lineage

So the graph remembers the song and never repeats the combo:

```bash
node --input-type=module -e '
import { openStore } from "./src/store.mjs";
import { config } from "./src/config.mjs";
import { readFile } from "node:fs/promises";
const b = JSON.parse(await readFile("briefs/first-song.json", "utf8"));
const s = openStore(config.dbPath);
const id = s.recordSong({
  title: b.title, concept: b._concept, tags: b.tags, prompt: b.prompt,
  negative_tags: b.negative_tags, inspirationNodeIds: b._nodeIds, status: "complete",
});
console.log("recorded song #" + id + " — " + b.title);
s.close();'
```

### 8. 🎉 Done

Their first crossfade song is in the Suno feed, and the graph knows exactly which
influences made it. From here: seed more nodes, run `sample`, and let the station keep
surprising them. Tell them to go listen.
