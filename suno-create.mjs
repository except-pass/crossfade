#!/usr/bin/env node
// Click Create on the filled Advanced form, then report whether an hCaptcha appeared.
import { chromium } from "playwright-core";
const CDP = process.env.CDP_URL || "http://localhost:9223";
const browser = await chromium.connectOverCDP(CDP);
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes("suno.com/create"));
await page.bringToFront().catch(()=>{});

const createBtn = page.getByRole("button", { name: "Create song" }).first();
console.log("Create button found:", await createBtn.count() > 0);
await createBtn.click();
console.log("clicked Create");

// Watch a few seconds for an hCaptcha iframe or a generation start
let captcha = false;
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(1500);
  const frames = page.frames().map(f => f.url());
  if (frames.some(u => /hcaptcha|captcha/i.test(u))) { captcha = true; break; }
  // also detect the challenge container in any frame
  for (const f of page.frames()) {
    if (await f.locator(".challenge-container, [class*=challenge]").count().catch(()=>0)) { captcha = true; break; }
  }
  if (captcha) break;
}
console.log(captcha ? "HCAPTCHA_PRESENT — user must solve it in the browser" : "no captcha detected yet");
await page.screenshot({ path: new URL("./suno-after-create.png", import.meta.url).pathname });
console.log("screenshot: suno-after-create.png");
await browser.close();
