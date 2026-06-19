import { chromium } from "playwright-core";
const browser = await chromium.connectOverCDP(process.env.CDP_URL);
const page = browser.contexts()[0].pages().find(p=>p.url().includes("suno.com/create"));
const btns = await page.evaluate(() => [...document.querySelectorAll('button,[role=button]')].map((b)=>({
  text:(b.innerText||'').trim().slice(0,40), aria:b.getAttribute('aria-label'),
  tid:b.getAttribute('data-testid'), disabled:b.disabled,
  vis:b.getBoundingClientRect().width>0,
  x:Math.round(b.getBoundingClientRect().x), y:Math.round(b.getBoundingClientRect().y)
})).filter(b=>b.vis && /create/i.test((b.text||'')+(b.aria||''))));
console.log(JSON.stringify(btns,null,1));
await browser.close();
