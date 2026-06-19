#!/usr/bin/env node
// Quick probe: is the SUNO_COOKIE in suno-api/.env valid?
// Hits /api/get_limit and reports plainly so you don't have to guess.
//
//   SUNO_API=http://localhost:4789 node check-auth.mjs

const API = process.env.SUNO_API || "http://localhost:4789";

try {
  const res = await fetch(`${API}/api/get_limit`);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }

  if (res.ok && body && typeof body === "object" && !body.error) {
    console.log("✅ Cookie is VALID. Credits/limit:", JSON.stringify(body));
    console.log("   → you're clear to run:  node generate.mjs");
  } else if (typeof body === "object" && /cookie/i.test(body.error || "")) {
    console.log("❌ No / empty cookie. Put __client into suno-api/.env (SUNO_COOKIE=...) and RESTART the dev server.");
  } else {
    console.log(`⚠️  Reached the API but auth didn't succeed (HTTP ${res.status}).`);
    console.log("   Response:", JSON.stringify(body));
    console.log("   Likely an expired/partial cookie — re-grab __client from clerk.suno.com.");
  }
} catch (e) {
  console.log(`❌ Can't reach suno-api at ${API}. Is the dev server running? (${e.message})`);
}
