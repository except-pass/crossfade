#!/usr/bin/env node
// Fill ONLY the title field robustly (lyrics+styles already filled). Does NOT click Create.
import { chromium } from "playwright-core";
import { readFile } from "node:fs/promises";
const CDP = process.env.CDP_URL || "http://127.0.0.1:9222";
const song = JSON.parse(await readFile(new URL("./song.json", import.meta.url), "utf8"));
const browser = await chromium.connectOverCDP(CDP);
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes("suno.com/create"));
if (!page) { console.log("no suno create tab"); process.exit(1); }
await page.bringToFront().catch(()=>{});

const title = page.locator('input[placeholder*="Song Title" i]').first();
await title.scrollIntoViewIfNeeded().catch(e => console.log("scroll note:", e.message));
let ok = false;
try {
  await title.fill(song.title, { timeout: 5000 });
  ok = true;
} catch (e) {
  console.log("fill() failed, trying React-safe set:", e.message);
  // React-safe: use native setter + dispatch input event
  ok = await page.evaluate((val) => {
    const el = document.querySelector('input[placeholder*="Song Title" i]');
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, song.title);
}
const val = await title.inputValue().catch(()=>"(unreadable)");
console.log(ok ? "title set ->" : "title NOT set ->", JSON.stringify(val));

// Verify the other two still hold
const lyr = await page.locator('[data-testid="lyrics-textarea"]').inputValue().catch(()=>"");
const sty = await page.locator('textarea[placeholder*="electro"]').first().inputValue().catch(()=>"");
console.log(`lyrics: ${lyr.length} chars | styles: ${sty.length} chars`);

await page.screenshot({ path: new URL("./suno-filled.png", import.meta.url).pathname });
console.log("screenshot: suno-filled.png");
await browser.close();
