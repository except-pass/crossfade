// Suno generation driver (the browser path).
//
// Generation is NOT the suno-api HTTP wrapper. The proven path drives the user's
// real, logged-in Chrome (suno.com/create, Advanced mode) over CDP through an SSH
// reverse tunnel — this box runs Playwright-core connectOverCDP against CDP_URL.
// Steps, faithful to the spike (suno-advanced/fill/title/create.mjs):
//   Advanced tab -> fill lyrics/styles/title -> click "Create song" -> human solves
//   the hCaptcha. "Completion" is the song landing in the user's Suno feed; there is
//   no get_limit / poll-for-audio_url here.
//
// browser.close() over a CDP connection only DETACHES this client; it never closes
// the user's real browser.

import { chromium } from "playwright-core";
import { readFile } from "node:fs/promises";
import { config } from "./config.mjs";

export const SEL = {
  advancedTab: "Advanced",
  lyrics: '[data-testid="lyrics-textarea"]',
  styles: 'textarea[placeholder*="electro"], textarea[placeholder*="guitar riffs"]',
  title: 'input[placeholder*="title" i], textarea[placeholder*="title" i], input[aria-label*="title" i]',
  createBtn: "Create song",
};

// Does this frame URL look like the hCaptcha challenge? (Pure, unit-testable.)
export function isCaptchaFrameUrl(url) {
  return /hcaptcha|captcha/i.test(String(url ?? ""));
}

export async function connect(cdpUrl = config.cdpUrl) {
  return chromium.connectOverCDP(cdpUrl);
}

// Locate the logged-in suno.com/create tab; open one if absent (assumes the
// CDP-connected Chrome profile is signed in to Suno).
async function findCreatePage(browser) {
  const ctx = browser.contexts()[0];
  if (!ctx) throw new Error("no browser context available over CDP");
  let page = ctx.pages().find((p) => p.url().includes("suno.com/create"));
  if (!page) {
    page = await ctx.newPage();
    await page.goto("https://suno.com/create", { waitUntil: "domcontentloaded", timeout: 30000 });
  }
  await page.bringToFront().catch(() => {});
  return page;
}

// Fill a field with .fill(), falling back to a React-safe native setter + input
// event (some Suno fields ignore Playwright's fill — proven in suno-title.mjs).
export async function robustFill(page, selector, value) {
  const loc = page.locator(selector).first();
  if (!(await loc.count())) return false;
  try {
    await loc.click({ timeout: 4000 });
    await loc.fill(value, { timeout: 5000 });
    return true;
  } catch {
    return page.evaluate(
      ({ sel, val }) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const proto =
          el.tagName === "TEXTAREA"
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
        setter.call(el, val);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      },
      { sel: selector, val: value }
    );
  }
}

// Fill the Advanced form from a brief ({ prompt: lyrics, tags: style, title }).
export async function fillBrief(page, brief) {
  const adv = page.getByRole("tab", { name: SEL.advancedTab });
  if (await adv.count()) {
    await adv.click().catch(() => {});
    await page.waitForTimeout(800);
  }
  const lyricsOk = await robustFill(page, SEL.lyrics, brief.prompt ?? "");
  const stylesOk = await robustFill(page, SEL.styles, brief.tags ?? "");

  // title usually hides under "More Options"
  const more = page.getByRole("button", { name: /More Options/i });
  if (await more.count()) {
    await more.click().catch(() => {});
    await page.waitForTimeout(700);
  }
  const titleOk = brief.title ? await robustFill(page, SEL.title, brief.title) : true;

  return { lyricsOk, stylesOk, titleOk };
}

// Click "Create song" and watch briefly for the hCaptcha the user must solve.
export async function clickCreate(page, { screenshotPath } = {}) {
  const createBtn = page.getByRole("button", { name: SEL.createBtn }).first();
  if (!(await createBtn.count())) throw new Error('"Create song" button not found');
  await createBtn.click();

  let captchaPresent = false;
  for (let i = 0; i < 8 && !captchaPresent; i++) {
    await page.waitForTimeout(1500);
    if (page.frames().some((f) => isCaptchaFrameUrl(f.url()))) captchaPresent = true;
    if (!captchaPresent) {
      for (const f of page.frames()) {
        const hit = await f.locator(".challenge-container, [class*=challenge]").count().catch(() => 0);
        if (hit) {
          captchaPresent = true;
          break;
        }
      }
    }
  }
  if (screenshotPath) await page.screenshot({ path: screenshotPath }).catch(() => {});
  return { captchaPresent };
}

// End-to-end: fill the brief and (unless fillOnly) click Create.
export async function generateSong(brief, opts = {}) {
  const browser = await connect(opts.cdpUrl || config.cdpUrl);
  try {
    const page = await findCreatePage(browser);
    const filled = await fillBrief(page, brief);
    if (opts.fillOnly) {
      if (opts.screenshotPath) await page.screenshot({ path: opts.screenshotPath }).catch(() => {});
      return { filled };
    }
    const created = await clickCreate(page, { screenshotPath: opts.screenshotPath });
    return { filled, ...created };
  } finally {
    await browser.close().catch(() => {}); // detaches CDP; leaves the real browser open
  }
}

// Connectivity preflight — is the tunnel up and a usable tab reachable?
export async function checkConnection(cdpUrl = config.cdpUrl) {
  const browser = await connect(cdpUrl);
  try {
    const ctx = browser.contexts()[0];
    const pages = ctx ? ctx.pages().map((p) => p.url()) : [];
    return {
      ok: true,
      version: typeof browser.version === "function" ? browser.version() : undefined,
      sunoTab: pages.find((u) => u.includes("suno.com")) ?? null,
      pageCount: pages.length,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

// CLI: `node src/suno.mjs --check` | `node src/suno.mjs <brief.json> [--fill-only]`
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.includes("--check")) {
    checkConnection()
      .then((r) => {
        console.log(JSON.stringify(r, null, 2));
        process.exit(r.sunoTab ? 0 : 3);
      })
      .catch((e) => {
        console.error("CDP not reachable:", e.message);
        process.exit(1);
      });
  } else {
    const briefPath = args.find((a) => !a.startsWith("--"));
    if (!briefPath) {
      console.error("usage: node src/suno.mjs <brief.json> [--fill-only] | --check");
      process.exit(1);
    }
    const brief = JSON.parse(await readFile(briefPath, "utf8"));

    // Name-leak guard (KTD-6): a real band/album name must never reach Suno. Check the
    // fields against the brief's lineage anchors (or the whole inventory if it has none).
    const { openStore, containsName } = await import("./store.mjs");
    const store = openStore(config.dbPath);
    const lineage = Array.isArray(brief._nodeIds)
      ? brief._nodeIds.map((id) => store.getNode(id)).filter(Boolean)
      : [];
    const anchors = lineage.filter((n) => n.type === "band" || n.type === "album").map((n) => n.name);
    const guardNames = anchors.length ? anchors : store.anchorNames();
    store.close();
    for (const field of ["tags", "prompt", "title"]) {
      const hit = guardNames.find((name) => containsName(brief[field], name));
      if (hit) {
        console.error(
          `✋ name-leak guard: "${hit}" appears in the brief's ${field} — Suno blocks real band names. ` +
            `Translate it to sonic descriptors and retry.`
        );
        process.exit(2);
      }
    }

    const screenshotPath = new URL("../gen-suno-harness.png", import.meta.url).pathname;
    generateSong(brief, { fillOnly: args.includes("--fill-only"), screenshotPath })
      .then((r) => {
        console.log(JSON.stringify(r, null, 2));
        if (r.captchaPresent) console.log("\n→ Solve the hCaptcha in the browser to start generation.");
      })
      .catch((e) => {
        console.error("generation failed:", e.message);
        process.exit(1);
      });
  }
}
