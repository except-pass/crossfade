// Centralized configuration for the crossfade harness.
// Every value is overridable via an environment variable so the harness stays
// portable across machines and the e2e/test setups.

const env = process.env;

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  // SQLite database — the harness's system of record (R4, R19).
  dbPath: env.CROSSFADE_DB || "crossfade.db",

  // --- Generation endpoints ---
  // The generation mechanism is being finalized around browser automation
  // (Playwright over CDP) rather than the suno-api HTTP wrapper; both endpoints
  // are kept here so the generation layer (U4) can settle without touching the
  // rest of the harness. Neither is exercised by the foundation units (U2/U3).
  sunoApi: env.SUNO_API || "http://localhost:4789", // suno-api HTTP wrapper (spike path)
  // Use 127.0.0.1, NOT localhost — `localhost` resolves to IPv6 ::1 and misses the
  // IPv4 CDP tunnel (CDP-PLUMBING.md gotcha #3). 9223 is the documented owned tunnel;
  // override with CDP_URL when the live path differs (e.g. the 9222 tailscaled path).
  cdpUrl: env.CDP_URL || "http://127.0.0.1:9223", // Chrome DevTools endpoint (browser path)

  // --- DJ transport + control plane (U6/U7) ---
  natsUrl: env.NATS_URL || "nats://127.0.0.1:4222",
  tinstarUrl: env.TINSTAR_DASHBOARD_URL || "http://localhost:5273",

  // --- Budget (daily window; free tier is 50 credits/day) (U5/R12) ---
  budget: {
    dailyCap: num(env.CROSSFADE_DAILY_CAP, 50), // max credits to spend per day
    reserveFloor: num(env.CROSSFADE_RESERVE_FLOOR, 0), // never let live credits drop below this
    costPerGeneration: num(env.CROSSFADE_COST_PER_GEN, 10), // estimate: ~10 credits per 2-clip generation
  },
};

export default config;
