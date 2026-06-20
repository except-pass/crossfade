#!/usr/bin/env node
// Fill the Advanced create form (lyrics + styles + title) from song.json. Does NOT click Create.
import { chromium } from "playwright-core";
import { readFile } from "node:fs/promises";
const CDP = process.env.CDP_URL || "http://127.0.0.1:9222";
const song = JSON.parse(await readFile(new URL("./song.json", import.meta.url), "utf8"));

const browser = await chromium.connectOverCDP(CDP);
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes("suno.com/create"));
if (!page) { console.log("no suno create tab"); process.exit(1); }
await page.bringToFront().catch(()=>{});

// make sure Advanced is active
const adv = page.getByRole("tab", { name: "Advanced" });
if (await adv.count()) { await adv.click().catch(()=>{}); await page.waitForTimeout(800); }

// 1) Lyrics
const lyrics = page.locator('[data-testid="lyrics-textarea"]');
await lyrics.click();
await lyrics.fill(song.prompt);
console.log("filled lyrics:", (await lyrics.inputValue()).length, "chars");

// 2) Styles (placeholder starts with "electro, guitar riffs")
const styles = page.locator('textarea[placeholder*="electro"], textarea[placeholder*="guitar riffs"]').first();
await styles.click();
await styles.fill(song.tags);
console.log("filled styles:", (await styles.inputValue()).length, "chars");

// 3) Title — usually under "More Options". Expand it, then find a title input.
const more = page.getByRole("button", { name: /More Options/i });
if (await more.count()) { await more.click().catch(()=>{}); await page.waitForTimeout(700); console.log("expanded More Options"); }

// find a title field by common placeholders/labels
let titleEl = page.locator('input[placeholder*="title" i], textarea[placeholder*="title" i], input[aria-label*="title" i]').first();
if (await titleEl.count()) {
  await titleEl.click();
  await titleEl.fill(song.title);
  console.log("filled title:", await titleEl.inputValue());
} else {
  console.log("⚠ title field not found yet — dumping inputs after expand:");
  const dump = await page.evaluate(() => [...document.querySelectorAll("input, textarea")]
    .map(e => ({ tag:e.tagName.toLowerCase(), ph:e.getAttribute("placeholder"), al:e.getAttribute("aria-label"), tid:e.getAttribute("data-testid"),
                 vis:(e.getBoundingClientRect().width>0) })).filter(x=>x.vis));
  dump.forEach(d => console.log(JSON.stringify(d)));
}

await page.screenshot({ path: new URL("./suno-filled.png", import.meta.url).pathname });
console.log("\nscreenshot saved: suno-filled.png  (NOT clicked Create)");
await browser.close();
