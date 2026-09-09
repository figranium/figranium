<div align="center">
  <img src="https://raw.githubusercontent.com/figranium/figranium/main/banner.png" alt="Figranium Banner">
</div>

# Figranium — Deterministic Control for an Agentic World

Figranium is an open-source, self-hosted alternative to Apify and SaaS cloud scrapers, built to turn browser workflows into instant API endpoints for developers, API pipelines, and low-code tools like n8n and Activepieces. Powered by a React/Vite control plane and an Express/Playwright runtime, it lets you visually build stealth browser tasks, pass dynamic variables during runtime, handle automatic proxy rotation, and stream structured results or CSV exports on your own infrastructure—delivering the instant API convenience of cloud actors without usage credits, rate caps, or third-party data hosting.

<div align="center">
  <img src="verification/maps-lead-scraper-screenshot.png" alt="Figranium Demo" width="100%">
  <p align="center">
    <i>Watch a video walkthrough of Figranium usage: <b><a href="demo.webm">demo.webm</a></b> or <b><a href="demo.mp4">demo.mp4</a></b></i>
  </p>
</div>

# What You Get

- **Block‑based automation** — build flows with actions like click, type, wait, hover, and execute JavaScript against modern pages.
- **Task API + CLI** — trigger saved tasks via HTTP (`/tasks/:id/api`) or the CLI from a source checkout while passing variables and securing runs with the API key you control.
- **Captures & storage** — automatically store screenshots/recordings and cookies; view them in the captures tab, reset storage, or download built assets.
- **Proxy management** — host, rotate, or import HTTP/SOCKS proxies, flag a default, and toggle rotation per task.
- **Task Scheduling** — run workflows automatically using visual interval/daily/weekly/monthly settings or advanced cron expressions.
- **Security-first** — session authentication, IP allowlists, secret management, and audit trails live entirely inside your environment.

# Official Partners

Figranium is proudly supported by:

## Featured Partner

<div align="center">
  <a href="https://swiftproxy.net/?ref=figranium" target="_blank">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="partner-assets/swiftproxy_white.png">
      <source media="(prefers-color-scheme: light)" srcset="partner-assets/swiftproxy.png">
      <img src="partner-assets/swiftproxy.png" width="220" alt="Swiftproxy">
    </picture>
  </a>
</div>

## Integration Partner

<div align="center">
  <a href="https://simplynode.io/?utm_source=figranium" target="_blank">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="partner-assets/simplynode_white.png">
      <source media="(prefers-color-scheme: light)" srcset="partner-assets/simplynode.png">
      <img src="partner-assets/simplynode.png" width="220" alt="SimplyNode">
    </picture>
  </a>
</div>

## Infrastructure Backers

<div align="center">
  <a href="https://www.digitalocean.com/?utm_medium=opensource&utm_source=Figranium">
    <img src="https://opensource.nyc3.cdn.digitaloceanspaces.com/attribution/assets/SVG/DO_Logo_horizontal_blue.svg" width="201" alt="DigitalOcean">
  </a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.mintlify.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="partner-assets/mintlify_white.svg">
      <source media="(prefers-color-scheme: light)" srcset="partner-assets/mintlify.svg">
      <img src="partner-assets/mintlify.svg" width="165" alt="Mintlify">
    </picture>
  </a>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.algolia.com">
    <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Algolia_logo_full_blue.svg/1920px-Algolia_logo_full_blue.svg.png?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=thumbnail&_=20221025105233" width="165" alt="Algolia">
  </a>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://neon.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="partner-assets/neon_white.png">
      <source media="(prefers-color-scheme: light)" srcset="partner-assets/neon.png">
      <img src="partner-assets/neon.png" width="165" alt="Mintlify">
    </picture>
  </a>
</div>

# Getting Started

This starts the app on `http://localhost:11345` and the VNC viewer on `http://localhost:54311`.


## Docker Compose (Standard)

### 1. Create a Project Directory

Create a directory for your Figranium installation and navigate into it:
```bash
mkdir figranium-server
cd figranium-server
```
### 2. Create docker-compose.yml

Create a docker-compose.yml file in your project directory:
```bash
services:
  figranium:
    image: ghcr.io/figranium/figranium:latest
    container_name: figranium
    ports:
      - "11345:11345"
      - "54311:54311"
    volumes:
      - ./data:/app/data
      - ./captures:/app/public/captures
    environment:
      - PORT=11345
      - SESSION_SECRET=your_secure_random_string
    restart: unless-stopped
```
### 3. Start with Docker Compose

Run the following command to start the application in detached mode:
```bash
docker compose up -d
```


## Git Clone (Multi-arch / ARM / Apple Silicon)

The easiest way to run Figranium on any architecture (including M1/M2/M3 Macs) is via Docker Compose.

1. Clone the repository:

```bash
git clone https://github.com/figranium/figranium.git
cd figranium
```

2. Start the services:

```bash
docker compose up --build -d
```

Visit `http://localhost:11345`.

> The first visit loads the login/setup screen. After you create the admin account and sign in, the dashboard replaces the login view and stays visible for as long as the session remains valid; returning users are redirected straight to the dashboard until they explicitly log out or the session expires.

## Session Secret

Set `SESSION_SECRET` before any run. A quick generator:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

# Configuration

| Variable | Purpose | Default |
|----------|---------|---------|
| `SESSION_SECRET` | Signs session cookies. Required. | — |
| `ALLOWED_IPS` | Comma list for basic IP allowlisting. | none (open) |
| `TRUST_PROXY` | Honor `X-Forwarded-*` when behind a reverse proxy. | `0` |
| `ALLOW_PRIVATE_NETWORKS` | Allow scraping local/private IPs (SSRF risk). | `false` |
| `VITE_DEV_PORT` | Port for front-end dev server. | `5173` |
| `VITE_BACKEND_PORT` | Backend port for proxying + scripts. | `11345` |
| `DB_TYPE` | Optional database type overriding disk storage. Set to `postgres` to use PostgreSQL. | — |
| `DB_POSTGRESDB_HOST` | Hostname for the PostgreSQL database (required if DB_TYPE is postgres). | — |
| `DB_POSTGRESDB_PORT` | Port for the PostgreSQL database (required if DB_TYPE is postgres). | — |
| `DB_POSTGRESDB_USER` | Username for the PostgreSQL database (required if DB_TYPE is postgres). | — |
| `DB_POSTGRESDB_PASSWORD` | Password for the PostgreSQL database (required if DB_TYPE is postgres). | — |
| `USE_CLOAK_ENGINE` | Set to `true` to run the browser engine on CloakBrowser (stealth-patched Chromium) instead of the default Playwright stealth stack. | `false` |
| `CLOAKBROWSER_LICENSE_KEY` | CloakBrowser license key for the latest binary (read natively by cloakbrowser; `npx cloakbrowser login` writes `~/.cloakbrowser/license.key`). Without a key the free legacy binary is used. | — |
| `CAPTCHA_SOLVER_URL` | Optional YesCaptcha/AntiCaptcha-compatible endpoint. Remote solving is attempted first. | — |
| `CAPTCHA_SOLVER_KEY` | Client key for `CAPTCHA_SOLVER_URL`. | — |
| `CAPTCHA_MODEL_TIER` | Local model selection: `auto`, `owlvit`, or `florence2`. Auto selects OWL-ViT for 2–7.99 GiB and Florence-2 at 8 GiB+. | `auto` |
| `CAPTCHA_MODEL_DEVICE` | Local inference device policy: `auto` or `cpu`. | `auto` |
| `SKIP_LOCAL_CAPTCHA_MODEL` | Unconditionally disable local model detection, download, startup, reconciliation, and fallback. Cached weights are retained. | `false` |
| `CAPTCHA_REMOTE_FORWARD_PROXY` | Opt in to sending the active browser proxy and user agent to compatible proxy-backed remote tasks. Unsupported provider/task combinations fail over locally without changing IP. | `false` |
| `CAPTCHA_REMOTE_FORWARD_CONTEXT` | Opt in to sending origin-scoped cookies, locale, timezone, viewport, and user agent to a custom endpoint advertising `browserContext` version 1. | `false` |
| `CAPTCHA_REMOTE_TIMEOUT_MS` | Maximum time allocated to the remote route before local fallback. | action deadline minus local reserve |
| `CAPTCHA_LOCAL_FALLBACK_MIN_MS` | Portion of the action deadline reserved for the active-browser local route. | `15000` |
| `CAPTCHA_AUTO_DETECT_TIMEOUT_MS` | Maximum readiness-detection wait after each auto-solve trigger when no CAPTCHA is present. | `5000` |
| `CAPTCHA_COMPANION_URL` | Optional Apple companion URL. Docker Desktop discovers `http://host.docker.internal:11438`; native macOS uses loopback. | auto-detected |
| `CAPTCHA_COMPANION_TOKEN` | Bearer token for the Apple companion. If omitted, `data/captcha-companion-token` is used. | generated file |
| `CAPTCHA_OWLVIT_THRESHOLD` / `CAPTCHA_FLORENCE2_THRESHOLD` | Optional tier-specific confidence overrides in the range 0–1. | calibrated `0.12` / `0.18` |
| `RUN_CAPTCHA_LIVE_TESTS` | Set to `1` to enable network/model/browser acceptance tests. Ordinary tests never download weights. | disabled |

Local weights are fetched on first use/startup into persistent `data/captcha-model/`; no model weights or secondary browser are included in the Docker image. Every fetched file is pinned to an exact upstream commit, size, and SHA-256 digest, and inference loads with remote access disabled. OWL-ViT uses about 159 MB of artifacts on 2–7.99 GiB hosts; Florence-2 uses about 361 MB at 8 GiB+. Hosts below 2 GiB can still use a configured remote endpoint. At steady state only the active tier is retained.

Proxy and browser-context forwarding are disabled by default because they disclose sensitive connection and session information to the administrator-configured solver endpoint. Standard AntiCaptcha/YesCaptcha payloads never receive cookies. Context is sent only after the custom endpoint advertises `browserContext` version 1, and cookies are filtered to the active page origin.

### Optional Apple Silicon CAPTCHA companion

The native companion lets a Docker Desktop container use Apple unified memory and acceleration without putting model weights into the image:

```bash
npm run captcha:companion:install       # pinned Python 3.10+ venv + generated token
npm run captcha:companion:start         # native Figranium, loopback only
npm run captcha:companion:start:docker  # Docker Desktop, authenticated external bind
```

OWL-ViT uses ONNX Runtime's CoreML execution provider. Florence-2 first stages and probes the pinned 4-bit MLX format; if MLX is unavailable or its real inference probe fails, the failed MLX data is removed and the verified native ONNX format is activated. The companion exposes only authenticated `GET /v1/health` and `POST /v1/detect`, caps request/image sizes, serializes inference, and applies inference timeouts. The token file is already shared with the container through the persistent `data/` mount; use `CAPTCHA_COMPANION_TOKEN` when the companion and container do not share that directory.

Run deterministic tests normally. The following commands are intentionally opt-in because they download weights or contact official test widgets:

```bash
RUN_CAPTCHA_LIVE_TESTS=1 npm run captcha:test:live
RUN_CAPTCHA_LIVE_TESTS=1 RUN_CAPTCHA_FLORENCE_TESTS=1 npm run captcha:test:live
RUN_CAPTCHA_LIVE_TESTS=1 npm run captcha:test:docker
```

The Docker acceptance command builds an image, verifies that it contains no weights, then exercises 1/2/4/8 GiB cgroup limits. A release must not claim full CAPTCHA acceptance until the real Florence probe has passed on an 8+ GiB runner. Apple acceptance additionally requires Apple Silicon and the installed companion.

Proxy rotation also respects `data/proxies.json` (see below), and `data/allowed_ips.json` works as an alternate allowlist format.

## Advanced Configuration

- `PLAYWRIGHT_BROWSERS_PATH` (or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`) when using a shared Playwright installation.
- `NODE_ENV=production` enables the bundled `dist/` client and reduces console verbosity.
- `HOST=0.0.0.0` allows binding beyond localhost inside Docker containers, while `PORT` overrides the Express listen port (defaults to `11345`).
- Set `LOG_LEVEL` to `debug` if you need more Playwright or proxy diagnostics; this can also be a custom wrapper when running `node server.js`.
- **Headful mode:** the headful/visible browser binds to `54311`, so open that port alongside `11345` when running `headful.js` or other headful flows.

# UI Walkthrough

- **Dashboard** — quick stats, recent runs, and a “New Task” entry point (block or agent).
 - **Task Editor** — drag blocks (click, type, wait, scroll, press, JavaScript); toggle “Rotate Proxies”; schedule runs via the **Schedule** tab; run/stop tasks; inspect results with pins & logs.
 - **Captures** — review screenshots/recordings stored under `public/captures`; delete individually or refresh.
 - **Executions** — historical runs with detail drill-down and the ability to re-run or download results.
 - **Settings**
  - **System tab**: regenerate or copy API key, select user agent, adjust layout ratio, view/copy version (`VersionPanel`), and clear storage.
  - **Data tab**: manage captures and cookies.
  - **Proxies tab**: add/import proxies, set defaults, toggle rotation, and inspect host vs saved entries.

# CLI & Agent Mode

- npm distribution is discontinued. Clone this repository and run `node bin/cli.js` to launch the interactive CLI that shows tasks, status, and logs.
- Behind the scenes, `bin/cli.js` can invoke `agent.js`, `headful.js`, or `scrape.js` depending on the runtime mode (`--agent`, `--headful`, `--scrape`).
- Run `node agent.js --help` to see flags like `--task`, `--browser`, or `--version`. These runners share the same settings (API key, proxies, storage) as the web UI.
- When connecting via the API key, prefer `Authorization: Bearer <key>` so reverse proxies can normalize headers; the CLI also accepts a `--api-key` flag for scripted runs.

### Agent capabilities

- Tasks use the JSON schema outlined in `AGENT_SPEC.md`, including mode/modes (`agent`/`block`), wait times, selectors, and stealth flags.
- Support for all action types in the spec (`click`, `type`, `wait`, `press`, `scroll`, `javascript`, `csv`, `hover`, `merge`, `screenshot`, `if/else/end`, loops, `foreach`, `stop`, `set`, `on_error`, `start`), so you can encode complex flows.
- Variable templating ( `{$var}` ), structured conditions, and helper functions such as `exists()`, `text()`, and `block` output ensure reusable, data-driven tasks.
- Extraction scripts run in the browser context after the page renders; you can return JSON/CSV by reading DOM nodes directly as documented in `AGENT_SPEC.md`.

# Proxies

Proxies can be defined via the UI or `data/proxies.json`:

```json
[
  "http://user:pass@proxy1.example.com:8000",
  { "server": "proxy2.example.com:9000", "username": "u", "password": "p" }
]
```

Entries are deduplicated automatically and headful/agent modes pick the default or rotation-enabled proxy (when set). The GUI lets you toggle rotation per task.

# Documentation

Detailed documentation is hosted at **[docs.figranium.com](https://docs.figranium.com)**, covering setup, configuration, task building, API usage, scheduling, proxy rotation, and troubleshooting.

# License

Figranium is open-source under the [GNU General Public License v3.0](LICENSE).