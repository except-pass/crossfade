# CDP plumbing: remote box drives a local real browser

**Proven 2026-06-19.** A headless remote box (AWS, `your-box`) drives a real Chrome on a
Windows 11 laptop over the DevTools Protocol (CDP), via a Tailscale + SSH reverse tunnel.
This is the reusable pattern; the Suno song was just the throwaway test payload.

```
┌─────────────────────────┐         Tailscale          ┌──────────────────────────┐
│  Windows 11 laptop      │  ssh -R 9222:127.0.0.1:9222 │  AWS box `your-box`      │
│  real Chrome 149        │ ─────────────────────────► │  YOUR_BOX_IP          │
│  --remote-debugging-port│   (reverse tunnel; laptop  │                          │
│    =9222 (127.0.0.1)    │    dials OUT to the box)   │  Playwright-core         │
│  --remote-allow-origins=*│                            │  chromium.connectOverCDP │
│  --user-data-dir=C:\…   │ ◄───── drives the tab ──── │   ("http://localhost:9222")│
└─────────────────────────┘                            └──────────────────────────┘
```

## Why a reverse tunnel (not direct Tailscale → :9222)
Direct `tailscaleIP:9222` **timed out** — Windows Firewall silently drops inbound to
Chrome's debug port. The reverse tunnel rides an *outbound* SSH connection from the
laptop, so no inbound firewall rule is needed. Chrome stays bound to `127.0.0.1`.

## Windows side (run as the user; Cowork/desktop-Claude can do this)
```powershell
# 1. Kill EVERY chrome.exe first — "continue running background apps" makes a new launch
#    reuse the old process and silently drop the debug flags. (Verify in Task Manager.)
Get-Process chrome -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3

# 2. Launch a SEPARATE debug instance with its own profile dir (NOT the Default profile —
#    Chrome 136+ refuses remote debugging on the default user-data-dir).
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  -ArgumentList '--remote-debugging-port=9222','--remote-allow-origins=*','--user-data-dir=C:\suno-cdp'

# 3. Verify LOCALLY before blaming the tunnel:
(Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9222/json/version -TimeoutSec 5).Content
#    Also check chrome://version → Command Line must show --remote-debugging-port=9222
#    and Profile Path must be C:\suno-cdp (not ...\Default).

# 4. Hold the reverse tunnel open (separate window). Use 127.0.0.1, NOT localhost —
#    Windows resolves "localhost" to IPv6 ::1 and misses Chrome's IPv4 listener.
#    The keepalive/fail-fast flags below are recommended for an unattended tunnel.
ssh -N -R 9223:127.0.0.1:9222 -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 ubuntu@YOUR_BOX_IP
```
> **Box ingress port:** the laptop's local Chrome is on `9222`; the box exposes it on
> `9223` (`-R 9223:127.0.0.1:9222`). We used a *separate* box port because box:9222 was
> already held (see caveat). Pick any free box port; just point `CDP_URL` at it.

> ⚠️ **Caveat — the accidental box:9222 listener.** During the spike, box:127.0.0.1:9222
> was already bound by **`tailscaled`** (pid, `fd`) and *also* reached the laptop's Chrome,
> even though `tailscale serve status --json` showed **no 9222 entry** (only TCP 443). We
> never created it and can't explain the path — so **do not rely on it.** The owned
> `ssh -R` on a dedicated port (9223) is the reproducible, documented mechanism, proven
> independently. If you see box:9222 "just working," it's this ghost, not the recipe.

## Box side
```bash
# playwright-core only (no browser download needed for connectOverCDP)
CDP_URL=http://localhost:9223 node cdp-smoke.mjs   # connect, open tab, navigate, read DOM, screenshot
```
`cdp-smoke.mjs` is the minimal proof. `CDP_URL` overrides the default `http://localhost:9222`;
point it at whatever box ingress port the `ssh -R` uses (9223 in the proven run).

## Gotchas that actually bit us (in order)
1. **`--remote-allow-origins=*` is mandatory** for Playwright `connectOverCDP` on Chrome 111+ (WS origin check).
2. **Windows Firewall drops inbound** → use a reverse tunnel, not a direct port.
3. **`localhost` in the `-R` spec resolves to IPv6 `::1`** on Windows → Chrome (IPv4) is missed. Use `127.0.0.1`.
4. **Background `chrome.exe` swallows the launch flags** → kill all Chrome first; confirm via `chrome://version` Command Line.
5. **Default profile is blocked** for remote debugging on Chrome 136+ → always pass a custom `--user-data-dir`.
6. Symptom map: TCP **timeout** = firewall; **empty reply** through the tunnel = forward reached the box but Chrome isn't on the resolved loopback (the IPv6/IPv4 issue or wrong port).

## Agent-to-agent coordination
box-claude and desktop-Claude (Cowork) coordinate through a file mailbox on the box —
see `comms/PROTOCOL.md`. desktop-Claude has SSH to the box, so it reads `to-desktop.md`
and appends to `to-box.md`; box-claude tails `to-box.md` live.
