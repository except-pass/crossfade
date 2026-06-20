import { test } from "node:test";
import assert from "node:assert/strict";
import { SEL, isCaptchaFrameUrl, robustFill, clickCreate, findNameLeak, assertNoNameLeak, recordGeneratedSong, generateSong } from "../src/suno.mjs";
import { openStore } from "../src/store.mjs";

// --- minimal Playwright stubs (no real browser) ---
function stubLocator({ count = 1, fillThrows = false } = {}) {
  const calls = { click: 0, fill: 0 };
  return {
    calls,
    first() {
      return this;
    },
    async count() {
      return count;
    },
    async click() {
      calls.click++;
    },
    async fill() {
      calls.fill++;
      if (fillThrows) throw new Error("fill ignored by React input");
    },
  };
}

test("SEL exposes every selector the driver depends on", () => {
  for (const k of ["advancedTab", "lyrics", "styles", "title", "createBtn"]) {
    assert.ok(SEL[k], `SEL.${k} is present`);
  }
  assert.equal(SEL.createBtn, "Create song");
  assert.match(SEL.lyrics, /lyrics-textarea/);
});

test("isCaptchaFrameUrl detects hCaptcha frames and ignores normal ones", () => {
  assert.equal(isCaptchaFrameUrl("https://newassets.hcaptcha.com/captcha/v1/x"), true);
  assert.equal(isCaptchaFrameUrl("https://api.hcaptcha.com/checksiteconfig"), true);
  assert.equal(isCaptchaFrameUrl("https://x/CAPTCHA-challenge"), true, "case-insensitive");
  assert.equal(isCaptchaFrameUrl("https://suno.com/create"), false);
  assert.equal(isCaptchaFrameUrl("about:blank"), false);
  assert.equal(isCaptchaFrameUrl(""), false);
  assert.equal(isCaptchaFrameUrl(undefined), false, "tolerates missing url");
  assert.equal(isCaptchaFrameUrl(null), false);
});

test("robustFill uses .fill() on the happy path (no React fallback)", async () => {
  const loc = stubLocator();
  let evaluated = false;
  const page = { locator: () => loc, evaluate: async () => (evaluated = true) };
  assert.equal(await robustFill(page, SEL.lyrics, "hi"), true);
  assert.equal(loc.calls.fill, 1);
  assert.equal(evaluated, false, "did not need the native-setter fallback");
});

test("robustFill falls back to the native setter when .fill() throws", async () => {
  const loc = stubLocator({ fillThrows: true });
  let evaluated = false;
  const page = {
    locator: () => loc,
    evaluate: async () => {
      evaluated = true;
      return true;
    },
  };
  assert.equal(await robustFill(page, SEL.title, "hi"), true);
  assert.equal(evaluated, true, "took the React-safe fallback");
});

test("robustFill returns false when the field isn't present", async () => {
  const page = { locator: () => stubLocator({ count: 0 }) };
  assert.equal(await robustFill(page, SEL.styles, "hi"), false);
});

function stubPage(frameUrls, { responses = [] } = {}) {
  const handlers = { response: [] };
  return {
    getByRole: () => ({ first: () => ({ async count() { return 1; }, async click() {
      // On submit, replay any canned generation responses to the registered listeners.
      for (const r of responses) for (const fn of handlers.response) await fn(r);
    } }) }),
    on: (event, fn) => { (handlers[event] ||= []).push(fn); },
    off: (event, fn) => { handlers[event] = (handlers[event] || []).filter((f) => f !== fn); },
    async waitForTimeout() {}, // instant — no real delay in tests
    async screenshot() {},
    frames: () => frameUrls.map((url) => ({ url: () => url, locator: () => ({ async count() { return 0; } }) })),
  };
}

// A canned Playwright-style response carrying a Suno-shaped generate payload.
function stubResponse(url, body) {
  return { url: () => url, headers: () => ({ "content-type": "application/json" }), async json() { return body; } };
}

test("clickCreate detects an hCaptcha frame", async () => {
  const res = await clickCreate(stubPage(["about:blank", "https://newassets.hcaptcha.com/captcha/v1"]));
  assert.equal(res.captchaPresent, true);
});

test("clickCreate reports no captcha when none appears", async () => {
  const res = await clickCreate(stubPage(["about:blank", "https://suno.com/create"]));
  assert.equal(res.captchaPresent, false);
});

test("clickCreate captures clip ids from the generate response", async () => {
  const body = { clips: [
    { id: "58d8ecfa-61cf-42be-9229-ebe857974778", status: "submitted", audio_url: "https://cdn.suno.ai/a.mp3" },
    { id: "68eba274-5c05-4146-a378-283feab268b5", status: "submitted", audio_url: null },
  ] };
  const page = stubPage(["about:blank", "https://suno.com/create"], {
    responses: [stubResponse("https://studio-api.suno.ai/api/generate/v2/", body)],
  });
  const res = await clickCreate(page);
  assert.equal(res.started, true);
  assert.deepEqual(res.clipIds, [
    "58d8ecfa-61cf-42be-9229-ebe857974778",
    "68eba274-5c05-4146-a378-283feab268b5",
  ]);
  // real audio_url is kept; missing one falls back to the song page url
  assert.equal(res.audioUrls[0], "https://cdn.suno.ai/a.mp3");
  assert.equal(res.audioUrls[1], "https://suno.com/song/68eba274-5c05-4146-a378-283feab268b5");
});

test("clickCreate ignores feed/project responses and captures only generate clips", async () => {
  // A feed listing (every older song) arrives alongside the real generate response.
  const feed = { clips: [
    { id: "aaaaaaaa-1111-2222-3333-444444444444", status: "complete", audio_url: "https://cdn.suno.ai/old1.mp3" },
    { id: "bbbbbbbb-1111-2222-3333-444444444444", status: "complete", audio_url: "https://cdn.suno.ai/old2.mp3" },
  ] };
  const gen = { clips: [
    { id: "cccccccc-1111-2222-3333-444444444444", status: "submitted", audio_url: null },
    { id: "dddddddd-1111-2222-3333-444444444444", status: "submitted", audio_url: null },
  ] };
  const page = stubPage(["about:blank", "https://suno.com/create"], {
    responses: [
      stubResponse("https://studio-api.suno.ai/api/feed/v2?ids=...", feed),     // must be ignored
      stubResponse("https://studio-api.suno.ai/api/generate/v2/", gen),         // the real one
    ],
  });
  const res = await clickCreate(page);
  assert.deepEqual(res.clipIds, [
    "cccccccc-1111-2222-3333-444444444444",
    "dddddddd-1111-2222-3333-444444444444",
  ], "only the generate-endpoint clips, never the feed listing's older clips");
});

test("clickCreate reports not-started when no clips come back", async () => {
  const res = await clickCreate(stubPage(["about:blank", "https://suno.com/create"]));
  assert.equal(res.started, false);
  assert.deepEqual(res.clipIds, []);
});

test("recordGeneratedSong stores brief + captured clips as complete", () => {
  const s = openStore(":memory:");
  const band = s.addNode("seed", "band", "Some Band").id;
  const brief = {
    title: "A Title", _concept: "why", tags: "style", prompt: "[Verse 1]\nwords",
    negative_tags: "no", _nodeIds: [band],
  };
  const result = { started: true, clipIds: ["id-1", "id-2"], audioUrls: ["u1", "u2"] };
  const rec = recordGeneratedSong(brief, result, { store: s });
  assert.equal(rec.status, "complete");
  const song = s.getSong(rec.songId);
  assert.deepEqual(song.clip_ids, ["id-1", "id-2"]);
  assert.deepEqual(song.audio_urls, ["u1", "u2"]);
  // a re-run of the same combo is skipped, not thrown
  const again = recordGeneratedSong(brief, result, { store: s });
  assert.equal(again.skipped, "combo_exists");
  s.close();
});

test("recordGeneratedSong stores pending when no clips captured", () => {
  const s = openStore(":memory:");
  const band = s.addNode("seed", "band", "Other Band").id;
  const brief = { title: "Pending One", tags: "x", prompt: "y", _nodeIds: [band] };
  const rec = recordGeneratedSong(brief, { started: false, clipIds: [] }, { store: s });
  assert.equal(rec.status, "pending");
  assert.equal(s.getSong(rec.songId).status, "pending");
  s.close();
});

// A fake browser whose create page can't fill any field — exercises the safety abort
// in generateSong without a real browser (injected via opts.connect).
function unfillableBrowser() {
  let closed = false;
  const dead = { first() { return this; }, async count() { return 0; }, async click() {}, async fill() {} };
  const page = {
    url: () => "https://suno.com/create",
    getByRole: () => dead,
    locator: () => dead,
    async waitForTimeout() {},
    async bringToFront() {},
    async screenshot() {},
    async evaluate() { return false; },
  };
  return {
    handle: { contexts: () => [{ pages: () => [page], async newPage() { return page; } }], async close() { closed = true; } },
    wasClosed: () => closed,
  };
}

test("generateSong aborts before Create when the form can't be filled", async () => {
  const fake = unfillableBrowser();
  await assert.rejects(
    generateSong(
      { title: "T", tags: "style", prompt: "words", _nodeIds: [] },
      { skipGuard: true, connect: async () => fake.handle }
    ),
    /form fill failed/,
    "throws the drift-abort error rather than spending a Create click"
  );
  assert.equal(fake.wasClosed(), true, "still detaches the CDP connection on the error path");
});

test("findNameLeak flags the field carrying a real band name", () => {
  const names = ["Taylor Swift", "The National"];
  assert.deepEqual(
    findNameLeak({ tags: "bright synthpop like Taylor Swift", prompt: "hi", title: "x" }, names),
    { field: "tags", name: "Taylor Swift" }
  );
  assert.equal(
    findNameLeak({ tags: "bright synthpop", prompt: "breathless verses", title: "Thirty-Seven Seconds" }, names),
    null,
    "descriptor-only brief passes"
  );
  assert.equal(findNameLeak({ tags: "kisses in the rain" }, ["Kiss"]), null, "whole-word only");
});

test("assertNoNameLeak: lineage hit, inventory fallback, and clean pass", async () => {
  const s = openStore(":memory:");
  const band = s.addNode("seed", "band", "Taylor Swift");

  // lineage hit — name in tags, checked against the brief's own anchor
  await assert.rejects(
    assertNoNameLeak({ tags: "like Taylor Swift", _nodeIds: [band.id] }, { store: s }),
    (e) => e.code === "NAME_LEAK"
  );
  // no _nodeIds -> falls back to the whole inventory and still catches it
  await assert.rejects(
    assertNoNameLeak({ tags: "like Taylor Swift" }, { store: s }),
    (e) => e.code === "NAME_LEAK"
  );
  // descriptor-only brief resolves without throwing
  await assertNoNameLeak({ tags: "bright confessional synth-pop", _nodeIds: [band.id] }, { store: s });
  s.close();
});
