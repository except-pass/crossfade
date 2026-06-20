import { test } from "node:test";
import assert from "node:assert/strict";
import { SEL, isCaptchaFrameUrl, robustFill, clickCreate, findNameLeak } from "../src/suno.mjs";

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

function stubPage(frameUrls) {
  return {
    getByRole: () => ({ first: () => ({ async count() { return 1; }, async click() {} }) }),
    async waitForTimeout() {}, // instant — no real delay in tests
    frames: () => frameUrls.map((url) => ({ url: () => url, locator: () => ({ async count() { return 0; } }) })),
  };
}

test("clickCreate detects an hCaptcha frame", async () => {
  const res = await clickCreate(stubPage(["about:blank", "https://newassets.hcaptcha.com/captcha/v1"]));
  assert.equal(res.captchaPresent, true);
});

test("clickCreate reports no captcha when none appears", async () => {
  const res = await clickCreate(stubPage(["about:blank", "https://suno.com/create"]));
  assert.equal(res.captchaPresent, false);
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
