<p align="center">
  <img src="assets/pest-banner.svg" width="700" alt="pest terminal banner — ascii moth rendered in a colorful terminal">
</p>

<h1 align="center">pest</h1>
<p align="center"><em>A tiny keepalive pinger that won't let your Render free-tier app fall asleep.</em></p>

---

## What it does

Render's free tier spins down a web service after 15 minutes of inactivity. **pest** fixes that by pinging itself — and any other URLs you give it — every 10 minutes, with a small web UI to manage the list.

- **Self-ping** — hits its own `/healthz` on a timer so the host process never idles out
- **Link pinger** — add external URLs from the web UI; each one gets pinged on the same cycle and its last status/latency is shown
- **SSRF-safe validation** — before accepting a URL, resolves its DNS and rejects anything pointing at localhost, private/internal IP ranges, or the cloud metadata address (`169.254.169.254`) — see [`lib/ssrf.js`](lib/ssrf.js)
- **No external DB** — links persist to a flat JSON file on disk
- **One dependency** — Express, nothing else

## Quickstart

```bash
npm install
npm start          # listens on $PORT, default 3000
```

Open `http://localhost:3000`, add a URL, watch it get pinged every 10 minutes.

Run the self-checks (each lib file doubles as its own test):

```bash
npm test
```

## Project layout

```
server.js          Express app, routes (/healthz, /api/links)
lib/scheduler.js    runs the 10-minute ping cycle (self + stored links)
lib/ssrf.js          URL validation — blocks private/internal targets
lib/store.js          JSON-file-backed link storage
public/index.html     the web UI
render.yaml            Render deploy config
```

## API

| Method | Path          | Description                                  |
|--------|---------------|-----------------------------------------------|
| GET    | `/healthz`    | liveness check — also the self-ping target     |
| GET    | `/api/links`  | list tracked links with last ping status       |
| POST   | `/api/links`  | add a URL (`{ "url": "..." }`), SSRF-validated |

## Deploy

Ships with [`render.yaml`](render.yaml) — push to Render and it builds with `npm install`, starts with `node server.js`, and health-checks `/healthz`.

## Known limitations

- URL validation runs once at submit time, not on every ping, so DNS rebinding (a host that resolves safely now, privately later) isn't caught. Low risk for a hobby keepalive tool.
- `data/links.json` lives on Render's ephemeral disk — the list resets on redeploy (it survives idle sleep/wake within the same instance).

## Requirements

Node.js >= 18
