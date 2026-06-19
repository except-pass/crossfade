#!/usr/bin/env node
// Switch the open suno.com/create tab to Advanced (custom) mode and map the fields.
import { chromium } from "playwright-core";
const CDP = process.env.CDP_URL || "http://localhost:9223";
const browser = await chromium.connectOverCDP(CDP);
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes("suno.com/create"));
if (!page) { console.log("no suno create tab"); process.exit(1); }
await page.bringToFront().catch(()=>{});

// Click the Advanced tab if not already active
const adv = page.getByRole("tab", { name: "Advanced" });
if (await adv.count()) {
  await adv.click();
  console.log("clicked Advanced tab");
  await page.waitForTimeout(1200);
} else {
  console.log("Advanced tab not found");
}

const fields = await page.evaluate(() => {
  const describe = (el) => {
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role"),
      placeholder: el.getAttribute("placeholder"),
      ariaLabel: el.getAttribute("aria-label"),
      dataTestId: el.getAttribute("data-testid"),
      maxlen: el.getAttribute("maxlength"),
      editable: el.getAttribute("contenteditable"),
      visible: r.width > 0 && r.height > 0,
      box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    };
  };
  const els = [...document.querySelectorAll("textarea, input[type=text], [contenteditable=true], [role=textbox]")];
  return els.map(describe).filter(f => f.visible);
});
console.log("\n=== VISIBLE TEXT FIELDS (Advanced mode) ===");
for (const f of fields) console.log(JSON.stringify(f));

// Labels near the fields for orientation
const labels = await page.evaluate(() => {
  return [...document.querySelectorAll("label, h2, h3, [class*=label]")]
    .map(l => (l.innerText||"").trim()).filter(t => t && t.length < 40).slice(0, 30);
});
console.log("\n=== NEARBY LABELS ===\n" + labels.join(" | "));

await page.screenshot({ path: new URL("./suno-advanced.png", import.meta.url).pathname });
console.log("\nscreenshot saved: suno-advanced.png");
await browser.close();
