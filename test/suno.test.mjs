import { test } from "node:test";
import assert from "node:assert/strict";
import { SEL, isCaptchaFrameUrl } from "../src/suno.mjs";

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
