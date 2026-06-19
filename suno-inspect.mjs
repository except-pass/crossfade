#!/usr/bin/env node
// Attach to the already-open suno.com/create tab and map the live UI.
import { chromium } from "playwright-core";
const CDP = process.env.CDP_URL || "http://localhost:9223";

const browser = await chromium.connectOverCDP(CDP);
const ctx = browser.contexts()[0];
const pages = ctx.pages();
const page = pages.find(p => p.url().includes("suno.com/create"));
if (!page) { console.log("No suno.com/create tab found. Tabs:", pages.map(p=>p.url())); process.exit(1); }

await page.bringToFront().catch(()=>{});
console.log("attached:", page.url());
await page.waitForTimeout(1000);

// Is Custom mode on? Look for a Custom toggle and the lyrics/style fields.
const aria = await page.locator("body").ariaSnapshot().catch(()=>"(no aria)");
console.log("\n=== ARIA SNAPSHOT (truncated) ===\n" + aria.slice(0, 4000));

// Dump candidate inputs/textareas with identifying attrs
const fields = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("textarea, input[type=text], [contenteditable=true], [role=textbox]")) {
    const r = el.getBoundingClientRect();
    out.push({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute("type"),
      placeholder: el.getAttribute("placeholder"),
      ariaLabel: el.getAttribute("aria-label"),
      name: el.getAttribute("name"),
      maxlen: el.getAttribute("maxlength"),
      dataTestId: el.getAttribute("data-testid"),
      visible: r.width > 0 && r.height > 0,
      box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    });
  }
  // also list buttons with text
  const btns = [...document.querySelectorAll("button, [role=button]")].map(b => ({
    text: (b.innerText||"").trim().slice(0,30),
    ariaLabel: b.getAttribute("aria-label"),
    dataTestId: b.getAttribute("data-testid"),
  })).filter(b => b.text || b.ariaLabel);
  return { fields: out, buttons: btns.slice(0, 40) };
});
console.log("\n=== TEXT FIELDS ===");
for (const f of fields.fields) console.log(JSON.stringify(f));
console.log("\n=== BUTTONS (first 40) ===");
for (const b of fields.buttons) console.log(JSON.stringify(b));

await page.screenshot({ path: new URL("./suno-create.png", import.meta.url).pathname });
console.log("\nscreenshot saved: suno-create.png");
await browser.close();
