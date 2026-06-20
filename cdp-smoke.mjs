#!/usr/bin/env node
// Plumbing smoke test: prove this remote box can DRIVE the user's browser over CDP
// (through the SSH reverse tunnel on 127.0.0.1:9222). No Suno, no captcha — just control.
//
//   node cdp-smoke.mjs
//
// Proves: connect → enumerate contexts/pages → open a page → navigate → read title → screenshot.

import { chromium } from "playwright-core";

const CDP = process.env.CDP_URL || "http://127.0.0.1:9222";

const browser = await chromium.connectOverCDP(CDP);
console.log("✅ connected over CDP:", CDP);
console.log("   browser version:", browser.version?.() ?? "(n/a)");

const contexts = browser.contexts();
console.log(`   contexts: ${contexts.length}`);
const ctx = contexts[0] ?? (await browser.newContext());
console.log(`   existing pages: ${ctx.pages().length}`);
for (const p of ctx.pages()) console.log("     -", p.url());

// Drive: open a fresh tab in the REAL browser and navigate somewhere neutral.
const page = await ctx.newPage();
await page.goto("https://example.com/", { waitUntil: "domcontentloaded", timeout: 20000 });
const title = await page.title();
const h1 = await page.locator("h1").first().innerText().catch(() => "(no h1)");
console.log(`\n▶ drove the browser to example.com`);
console.log(`   title: ${title}`);
console.log(`   h1:    ${h1}`);

await page.screenshot({ path: new URL("./cdp-smoke.png", import.meta.url).pathname });
console.log("   screenshot saved: cdp-smoke.png");

// Leave the browser open (it's the user's real browser); just detach.
await page.close();
await browser.close();
console.log("\n✅ PLUMBING WORKS: remote box drove the local browser over CDP.");
