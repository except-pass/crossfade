#!/usr/bin/env node
// Spike: drive gcui-art/suno-api in "custom" mode (own lyrics + style + title, separately).
//
// Prereq: the suno-api server is running locally (see README in this dir):
//   cd suno-api && npx next dev -p 4789      # listens on http://localhost:4789
// and suno-api/.env has a valid SUNO_COOKIE (+ TWOCAPTCHA_KEY).
//
// Usage:
//   node generate.mjs                # fire-and-poll using ./song.json
//   SUNO_API=http://localhost:4789 node generate.mjs ./song.json

import { readFile } from "node:fs/promises";

const API = process.env.SUNO_API || "http://localhost:4789";
const songPath = process.argv[2] || new URL("./song.json", import.meta.url).pathname;

const j = async (res) => {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
};

async function main() {
  const song = JSON.parse(await readFile(songPath, "utf8"));

  // sanity check the server is up + has credits
  const limitRes = await fetch(`${API}/api/get_limit`).catch((e) => {
    throw new Error(`Can't reach suno-api at ${API}. Is \`npm run dev\` running? (${e.message})`);
  });
  const limit = await j(limitRes);
  console.log("Credits / limit:", limit);

  // custom_generate keeps lyrics (prompt), style (tags) and title as separate fields
  const payload = {
    prompt: song.prompt,                 // <- your lyrics
    tags: song.tags,                     // <- your musical style
    title: song.title,                   // <- your title
    negative_tags: song.negative_tags,
    make_instrumental: song.make_instrumental ?? false,
    model: song.model || "chirp-v3-5",
    wait_audio: false,                   // poll ourselves so we can show progress
  };

  console.log(`\n▶ Generating "${song.title}"`);
  console.log(`  style: ${song.tags.slice(0, 80)}...`);

  const genRes = await fetch(`${API}/api/custom_generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const clips = await j(genRes);
  if (!genRes.ok || !Array.isArray(clips)) {
    throw new Error(`Generation request failed (${genRes.status}): ${JSON.stringify(clips)}`);
  }

  const ids = clips.map((c) => c.id);
  console.log(`  queued ${ids.length} clip(s): ${ids.join(", ")}`);

  // poll until audio_url is populated
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const infoRes = await fetch(`${API}/api/get?ids=${ids.join(",")}`);
    const info = await j(infoRes);
    const done = info.filter((c) => c.audio_url);
    process.stdout.write(`\r  polling... ${done.length}/${ids.length} ready  `);
    if (done.length === info.length) {
      console.log("\n\n✅ Done:");
      for (const c of info) {
        console.log(`  • ${c.title}  [${c.status}]`);
        console.log(`    audio: ${c.audio_url}`);
        console.log(`    image: ${c.image_url}`);
      }
      return;
    }
  }
  console.log("\n⏳ Timed out polling; check the Suno web UI — the clips are usually still finishing.");
}

main().catch((e) => {
  console.error("\n❌", e.message);
  process.exit(1);
});
