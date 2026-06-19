---
title: Remote headless box drives a real local browser over CDP (human-in-the-loop)
date: 2026-06-19
category: architecture-patterns
module: remote-cdp-driving
problem_type: architecture_pattern
component: tooling
severity: high
related_components:
  - development_workflow
  - authentication
applies_when:
  - "a remote headless box must drive a real, logged-in browser on a user's local machine"
  - "automating a site gated by a captcha or bot-detection that a warmed human session clears"
  - "inbound connections to the local debug port are blocked by a host firewall"
  - "the target requires real session state (cookies, login, fingerprint) a throwaway profile lacks"
  - "two agents (remote driver + local host) must coordinate over an out-of-band channel"
symptoms:
  - "TCP timeout connecting Tailscale-direct to Chrome :9222 (host firewall drops inbound)"
  - "\"Empty reply from server\" through the tunnel when -R uses localhost (resolves to IPv6 ::1)"
  - "Playwright connectOverCDP fails on Chrome 111+ without --remote-allow-origins=*"
  - "launch flags silently ignored; chrome://version shows wrong Command Line / Profile Path"
  - "CDP smoke test passes against a port owned by tailscaled, masking a failed ssh -R bind"
tags:
  - browser-automation
  - chrome-devtools-protocol
  - playwright
  - ssh-reverse-tunnel
  - tailscale
  - human-in-the-loop
  - captcha
  - remote-debugging
---

# Remote headless box drives a real local browser over CDP (human-in-the-loop)

## Context

A remote headless agent (an AWS EC2 box, `your-box`, reachable over Tailscale) needed to
drive a real browser session on a site protected by hCaptcha (Suno's song generator). The
naive path is a pure server-side wrapper: spin up headless Chromium on the box,
authenticate, and POST the request.

That approach gets *most* of the way and then hits a wall. Using `gcui-art/suno-api`,
authentication succeeded (the agent read the account's 530 credits) and the
`custom_generate` request reached Suno's backend — but generation is gated by hCaptcha, and
a headless browser on a fresh datacenter IP is exactly the fingerprint anti-bot systems
reject: a throwaway, maximally-suspicious session draws the *hardest* image challenge, which
no unattended bot solves. The wrapper then timed out on a stale `.custom-textarea` selector.
Two independent failure modes — unsolvable captcha + stale selectors — converged on "dead
end for full automation."

The reframe that unlocked it: stop trying to *impersonate* a trusted human session and
instead *borrow* one. The user already has a real, logged-in Chrome on their Windows 11
laptop — trusted IP, warm cookies, real device fingerprint, and a human who can solve a
captcha in two seconds. The job becomes plumbing: let the remote agent reach into that real
browser and drive it, leaving the one irreducibly-human step to the human.

## Guidance

The pattern: **the agent drives Chrome over the Chrome DevTools Protocol (CDP); the page
traffic originates from the user's real machine; a reverse SSH tunnel inverts the connection
so inbound firewalls don't matter; and a human clears the captcha.**

### 1. Launch the laptop's Chrome with CDP enabled, on a non-default profile

```
chrome.exe --remote-debugging-port=9222 --remote-allow-origins=* --user-data-dir=C:\cdp-profile
```

Three load-bearing details:

- **Kill every existing `chrome.exe` first.** The "continue running background apps" setting
  keeps a process alive after all windows close; a new launch then *reuses that process and
  silently drops your flags*. Verify at `chrome://version`: "Command Line" must contain
  `--remote-debugging-port`, and "Profile Path" must be your custom dir, not `...\Default`.
- **Use a custom `--user-data-dir`.** Chrome 136+ refuses remote debugging on the Default
  profile. A separate dir sidesteps that *and* avoids the reuse-the-running-process trap. Log
  into the target site once inside this profile.
- **`--remote-allow-origins=*`** is required for CDP clients (Playwright `connectOverCDP`) to
  attach on Chrome 111+.

### 2. Tunnel the debug port to the box — laptop dials OUT

Do **not** reach the laptop's :9222 directly from the box over Tailscale — the host firewall
silently drops inbound to the debug port (symptom: TCP timeout). Instead, the laptop opens a
reverse tunnel:

```
ssh -N -R 9223:127.0.0.1:9222 \
    -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=30 \
    ubuntu@<box-tailscale-ip>
```

- **Use `127.0.0.1`, never `localhost`, in the forward spec.** On Windows `localhost`
  resolves to IPv6 `::1`, but Chrome's debug listener binds IPv4 `127.0.0.1`; they miss and
  you get "Empty reply from server" through the tunnel.
- **`-o ExitOnForwardFailure=yes`** makes SSH fail loudly if the remote port can't bind,
  instead of connecting anyway and leaving a tunnel that goes nowhere.
- **Pick a dedicated, known-free remote port (9223).** Don't reuse a port something else may
  already own (see the false-positive lesson).

### 3. Verify you own the tunnel before trusting it

A passing smoke test is not proof the tunnel works — something else might be answering.
Confirm the listener is owned by `sshd`:

```
sudo ss -ltnp | grep 9223     # owning process MUST be sshd, not tailscaled or a stray proxy
curl -s http://localhost:9223/json/version   # only meaningful AFTER the owner check
```

### 4. Attach to the *existing* tab and drive it (Playwright on the box)

Don't launch a new browser — `connectOverCDP` and grab the page the human already has open
and logged in. Map selectors against the **live DOM**; published wrappers go stale.

```js
import { chromium } from "playwright-core";
const browser = await chromium.connectOverCDP("http://localhost:9223");
const ctx  = browser.contexts()[0];                       // the human's real, logged-in context
const page = ctx.pages().find(p => p.url().includes("suno.com/create"));
await page.locator('[data-testid="lyrics-textarea"]').fill(lyrics);
await page.locator('textarea[placeholder*="electro"]').first().fill(style);
await page.getByRole("button", { name: "Create song" }).click();
```

### 5. React-safe value setting for hidden / controlled inputs

A collapsed field makes Playwright `.fill()` throw "element is not visible," and a raw
`.value =` write is ignored by React's controlled inputs (it bypasses React's synthetic-event
tracker). Set the value through the *native* prototype setter and dispatch the events React
listens for:

```js
await page.evaluate((val) => {
  const el = document.querySelector('input[placeholder*="Song Title" i]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(el, val);                                   // native setter, NOT el.value = val
  el.dispatchEvent(new Event("input",  { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}, title);
```

### 6. Human-in-the-loop for the captcha, then poll for results

Detect the hCaptcha frame, pause, and let the human solve it in their own browser. Once
solved, poll the site's authenticated feed endpoint rather than scraping the DOM — a `fetch`
run inside the authenticated page context carries the real session's cookies for free (here:
`/api/get` returned the finished clips with their `audio_url`s).

## Why This Matters

- **The connection direction is the whole game.** A reverse tunnel (`ssh -R`, laptop dialing
  out) sidesteps inbound firewalls entirely — the laptop makes an outbound connection it's
  already allowed to make, and the box rides it back in. Generalizes to any "drive a machine I
  can't reach inbound" problem; no router port-forwarding, no exposed debug port.
- **Borrow trust, don't fake it.** CDP control is a tiny command channel; the actual HTTP
  traffic originates from the user's real laptop — their IP, cookies, TLS/browser fingerprint.
  Anti-bot systems see a trusted, warm human session, which is why the same request that drew
  an unsolvable challenge from the headless wrapper sails through from the real browser.
- **The human-in-the-loop split is the reusable unlock.** Partition the work: the agent does
  everything mechanical (DOM mapping, field-filling, submission, result polling); the human
  does only the few steps a bot fundamentally can't or shouldn't — captcha, SSO, 2FA. You don't
  defeat the bot defense; you route around the one step it guards. This makes a large class of
  "impossible to automate" sites automatable.
- **Verify the socket owner — don't trust "it works."** The sharpest lesson: a green smoke
  test nearly shipped a broken recipe. The CDP check passed on `box:9222`, but `ss -ltnp`
  revealed that listener was owned by `tailscaled` (an accidental proxy) — the intended
  `ssh -R` had silently failed to bind. A pass you can't *attribute* is not a pass. Make
  failures loud (`ExitOnForwardFailure=yes`), use dedicated owned resources (a fresh port), and
  check provenance (`ss -ltnp` shows `sshd`) before declaring victory.

## When to Apply

Reach for this when **all** hold:

- The target has bot defenses (hCaptcha/reCAPTCHA, fingerprinting, IP reputation) a
  headless/datacenter session can't clear but a real human session clears trivially.
- A human is available and willing to be looped in for the gated steps. This is
  *assisted automation*, not lights-out.
- You control (or can instruct) the machine holding the trusted, logged-in browser.
- That machine is behind a firewall/NAT you can't punch inbound but *can* dial out (reverse
  tunnel available). Tailscale + SSH is a clean substrate but not required.
- The task is worth standing up plumbing for — a repeatable or multi-step flow.

**Overkill when:** the site has no real bot defense (just script it headless); an official API
or auth token exists (use it — far more robust than DOM driving); the flow must run fully
unattended (this pattern needs a human for the gated step); or it's a single action the user
could do faster by hand.

## Examples

**Tunnel: `localhost` (broken) vs `127.0.0.1` (working)**

```
# BROKEN — Windows resolves localhost to ::1; Chrome listens on IPv4.
#          Symptom: "Empty reply from server" through the tunnel.
ssh -N -R 9223:localhost:9222 ubuntu@<box>

# WORKING — explicit IPv4 matches Chrome's listener.
ssh -N -R 9223:127.0.0.1:9222 -o ExitOnForwardFailure=yes ubuntu@<box>
```

**Setting a controlled input: `.fill()` / raw `.value` (broken) vs React-safe set (working)**

```js
await page.fill('input[placeholder*="Song Title" i]', title);   // throws: element is not visible
page.evaluate(() => document.querySelector('input').value = 'x'); // React tracker ignores it
// WORKING: native setter + dispatched input/change events (see Guidance §5)
```

**Trusting a smoke test: false positive (9222) vs owned tunnel (9223)**

```
curl -s http://localhost:9222/json/version   # 200 OK ... looks great
sudo ss -ltnp | grep 9222
#   users:(("tailscaled",pid=562))   <-- NOT sshd! ssh -R had silently failed to bind
ssh -N -R 9223:127.0.0.1:9222 -o ExitOnForwardFailure=yes ubuntu@<box>
sudo ss -ltnp | grep 9223
#   users:(("sshd",pid=...))         <-- correct owner; now the curl pass means something
```

**Headless wrapper (dead end) vs CDP-into-real-browser (works)**

```
# DEAD END: gcui-art/suno-api, headless on the box — auth OK, request reached Suno,
#           but headless datacenter session -> hardest hCaptcha -> unsolvable; stale selector timeout.
# WORKS:    connectOverCDP into the human's real, logged-in Chrome -> trusted IP/fingerprint,
#           human solves the captcha in 2s, agent polls /api/get for finished clips' audio URLs.
```

## Related

- `CDP-PLUMBING.md` (repo root) — the architecture diagram and the runnable recipe
- `cdp-smoke.mjs`, `suno-inspect.mjs`, `suno-fill.mjs`, `suno-create.mjs` — the working driver scripts
- `comms/PROTOCOL.md` — the two-agent (box + desktop Cowork) file-mailbox coordination over SSH
