<div align="center">
  <img src="https://raw.githubusercontent.com/figranium/figranium/main/banner.png" alt="Figranium Banner">

  <br>

  <a href="https://github.com/figranium/figranium/blob/main/LICENSE" target="_blank"><img src="https://img.shields.io/github/license/figranium/figranium?style=for-the-badge&label=License&color=3DA639&logo=opensourceinitiative&logoColor=white" alt="License"></a>
  <a href="https://github.com/figranium/figranium/pkgs/container/figranium" target="_blank"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Ffigranium%2Ffigranium%2Fmain%2Fghcr-stats.json&query=downloads_compact&label=Pulls&color=2496ED&style=for-the-badge&logo=docker&logoColor=white" alt="Docker Pulls"></a>

  <p><strong>Stack blocks visually to build complex browser workflows and execute them via API.</strong></p>

  <p>
    <a href="https://figranium.dev/docs" target="_blank"><strong>Documentation</strong></a>
    &nbsp;&nbsp;·&nbsp;&nbsp;
    <a href="https://discord.gg/kPmfbgu9Xn" target="_blank"><strong>Discord</strong></a>
  </p>
</div>

<div align="center">
  <img src="screenshot.png" alt="Figranium Demo" width="100%">
  <p align="center">
  </p>
</div>

# What You Get

- **Block‑based automation** — build flows with actions like click, type, wait, hover, and execute JavaScript against modern pages.
- **Task API** — trigger saved tasks via HTTP API, pass variables at runtime, and secure runs with the API key you control.
- **Executions & Cabinets** — inspect results, screenshots, and recordings in Executions; route browser downloads into task-selected Cabinets for later download or upload.
- **Proxy management** — host, rotate, or import HTTP/SOCKS proxies, flag a default, and toggle rotation per task.
- **Embedded Templates** — browse, preview, and import community workflows directly from the Dashboard or task-creation menu.
- **Task Scheduling** — run workflows automatically using visual interval/daily/weekly/monthly settings or advanced cron expressions.
- **Reliable execution** — track queued and running tasks, cancel queued executions, and retrieve complete results beyond bounded history previews.
- **Security-first** — session authentication, IP allowlists, secret management, and audit trails live entirely inside your environment.

# Official Partners

Figranium is proudly supported by:

## Featured Partners

<div align="center">
  <a href="https://www.thordata.com/?ls=github&lk=figranium" target="_blank">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="partner-assets/thordata_white.svg">
      <source media="(prefers-color-scheme: light)" srcset="https://gologin.com/wp-content/uploads/WP-PROXY-THUMBNAIL-4-1.png">
      <img src="https://gologin.com/wp-content/uploads/WP-PROXY-THUMBNAIL-4-1.png" width="180" alt="Thordata">
    </picture>
  </a>
  <p style="max-width: 680px; margin-left: auto; margin-right: auto;"><a href="https://www.thordata.com/?ls=github&lk=figranium" target="_blank"><strong>Thordata</strong></a> — Premium residential proxy infrastructure for reliable web scraping and browser automation.</p>
</div>

<div align="center">
  <a href="https://www.rapidproxy.io/?ref=figranium" target="_blank">
    <img src="partner-assets/rapidproxy.webp" width="180" alt="RapidProxy">
  </a>
  <p style="max-width: 680px; margin-left: auto; margin-right: auto;"><a href="https://www.rapidproxy.io/?ref=figranium" target="_blank"><strong>RapidProxy</strong></a> — 90M+ residential IPs built for browser automation and web scraping, with smart rotation and stable sessions. From $0.55/GB with non-expiring traffic. Use <strong>RAPID10</strong> for 10% off.</p>
</div>

## Integration Partner

<div align="center">
  <a href="https://simplynode.io/?utm_source=figranium" target="_blank">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="partner-assets/simplynode_white.png">
      <source media="(prefers-color-scheme: light)" srcset="partner-assets/simplynode.png">
      <img src="partner-assets/simplynode.png" width="140" alt="SimplyNode">
    </picture>
  </a>
  <p style="max-width: 680px; margin-left: auto; margin-right: auto;"><a href="https://simplynode.io/?utm_source=figranium" target="_blank"><strong>SimplyNode</strong></a> — Residential proxies for web scraping and browser automation, with flexible targeting and reliable rotation.</p>
</div>

## Infrastructure Backers

<div align="center">
  <table>
    <tr>
      <td align="center" valign="middle" width="150"><a href="https://www.mintlify.com" target="_blank"><img src="https://cdn.simpleicons.org/mintlify/18B6A4" width="64" alt="Mintlify"></a></td>
      <td align="center" valign="middle" width="150"><a href="https://neon.com" target="_blank"><img src="https://cdn.simpleicons.org/neon/00E599" width="64" alt="Neon"></a></td>
      <td align="center" valign="middle" width="150"><a href="https://1password.com" target="_blank"><img src="https://cdn.simpleicons.org/1password/0572EC" width="64" alt="1Password"></a></td>
      <td align="center" valign="middle" width="150"><a href="https://www.algolia.com" target="_blank"><img src="https://cdn.simpleicons.org/algolia/003DFF" width="64" alt="Algolia"></a></td>
      <td align="center" valign="middle" width="170"><a href="https://www.digitalocean.com/?utm_medium=opensource&utm_source=Figranium" target="_blank"><img src="https://cdn.simpleicons.org/digitalocean/0080FF" width="64" alt="DigitalOcean"></a></td>
    </tr>
  </table>
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
wget https://raw.githubusercontent.com/figranium/figranium/main/docker-compose.deploy.yml -O docker-compose.yml
```

### 3. Start with Docker Compose

Run the following command to start the application in detached mode:
```bash
docker compose up -d
```

## Reverse Proxy Deployments

Proxy only the main application port (`11345`). The embedded browser viewer connects through the application’s authenticated `/websockify` endpoint, so it does not need a separate public VNC/noVNC port.

For Caddy running on the same VM, a standard reverse proxy is sufficient:

```caddyfile
figranium.example.com {
    reverse_proxy 127.0.0.1:11345
}
```

Caddy forwards WebSocket upgrades automatically. The viewer receives a short-lived, single-use ticket bound to the signed-in session, so it continues to connect safely if the proxy changes the upstream `Host` header. `TRUST_PROXY` is not required for the embedded browser viewer; enable it only when the application needs to rely on forwarded client address or protocol headers for other deployment behavior.

## Session Secret

Figranium automatically generates a cryptographically random session secret on first startup and stores it in the persistent data directory (`session_secret.txt`). Subsequent starts reuse the saved secret. You can optionally set `SESSION_SECRET` to provide your own; keep the data directory persistent so existing sessions remain valid.

# Configuration

| Variable | Purpose | Default |
|----------|---------|---------|
| `SESSION_SECRET` | Optional override for the automatically generated, persisted session-cookie signing secret. | Auto-generated |
| `MASTER_KEY_FILE` | Optional path to the persistent 256-bit master key used to encrypt stored 1Password configuration and file-backed credentials. Keep this file persistent and restrict access; use a separately protected mount for stronger isolation. | `data/master.key` (auto-generated) |
| `PASSWORD_CACHE_KEY` | Secret used to encrypt the server-side 1Password cache. Set this to keep the encryption key outside the Figranium data directory. | Auto-generated and stored at `data/password_cache.key` |
| `PASSWORD_CACHE_ENABLED` | Enable encrypted server-side caching of 1Password Login metadata and resolved passwords. Set to `false` to always fetch from 1Password. | `true` |
| `FIGRANIUM_TELEMETRY_ENABLED` | Send anonymous installation environment details and daily UI/API usage flags to Figranium telemetry. Set to `false` to disable. | `true` |
| `ALLOWED_IPS` | Comma list for basic IP allowlisting. | none (open) |
| `TRUST_PROXY` | Honor `X-Forwarded-*` for application-level proxy behavior. Not required for the embedded browser viewer. | `0` |
| `ALLOW_PRIVATE_NETWORKS` | Allow scraping local/private IPs (SSRF risk). | `false` |
| `VITE_DEV_PORT` | Port for front-end dev server. | `5173` |
| `VITE_BACKEND_PORT` | Backend port for proxying + scripts. | `11345` |
| `DB_TYPE` | Optional database type overriding disk storage. Set to `postgres` to use PostgreSQL. | — |
| `DB_POSTGRESDB_HOST` | Hostname for the PostgreSQL database (required if DB_TYPE is postgres). | — |
| `DB_POSTGRESDB_PORT` | Port number for the PostgreSQL database (required if DB_TYPE is postgres). | — |
| `DB_POSTGRESDB_USER` | Username for the PostgreSQL database (required if DB_TYPE is postgres). | — |
| `DB_POSTGRESDB_PASSWORD` | Password for the PostgreSQL database (required if DB_TYPE is postgres). | — |
| `DB_POSTGRESDB_DATABASE` | Database name for PostgreSQL. | `postgres` |
| `USE_CLOAK_ENGINE` | Set to `true` to run the browser engine on CloakBrowser instead of the default Playwright stealth stack. | `false` |
| `CLOAKBROWSER_LICENSE_KEY` | CloakBrowser license key for the latest binary. | — |
| `MAX_CONCURRENT_EXECUTIONS` | Override the automatic browser-execution limit. | host-aware |
| `MAX_EXECUTION_QUEUE` | Maximum waiting executions before new work receives 503. | `50` |
| `EXECUTION_QUEUE_TIMEOUT_MS` | Maximum time an execution may wait for capacity. | `600000` |
| `EXECUTION_TIMEOUT_MS` | Maximum non-headful execution runtime. | `900000` |
| `RESOURCE_MEMORY_RESERVE_MB` | Minimum memory headroom reserved for the host. | max(512 MB, 15%) |
| `RESOURCE_CPU_THRESHOLD` | Normalized CPU load that pauses dequeuing. | `0.9` |
| `RESOURCE_PROBE_INTERVAL_MS` | Runtime resource-protection sampling interval. CAPTCHA capacity is detected at startup. | `30000` |

## CAPTCHA solving

Figranium uses <a href="https://github.com/figranium/fiptcha" target="_blank">Fiptcha</a> for CAPTCHA solving. Fiptcha owns the CAPTCHA solver implementation and its configuration, supported providers, local/remote solving behavior, model setup, and platform-specific companion tooling. See the Fiptcha repository for the current CAPTCHA documentation instead of relying on duplicated configuration here.

Proxy rotation also respects `data/proxies.json` (see below), and `data/allowed_ips.json` works as an alternate allowlist format.

## Advanced Configuration

- `PLAYWRIGHT_BROWSERS_PATH` (or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`) when using a shared Playwright installation.
- `NODE_ENV=production` enables the bundled `dist/` client and reduces console verbosity.
- `HOST=0.0.0.0` allows binding beyond localhost inside Docker containers, while `PORT` overrides the Express listen port (defaults to `11345`).
- Set `LOG_LEVEL` to `debug` if you need more Playwright or proxy diagnostics.

# Task Modes

Figranium has two task modes:

- **Agent Mode** — deterministic browser automation built from an ordered sequence of actions, control flow, variables, and extraction.
- **Scrape Mode** — lightweight HTTP-based scraping and extraction without launching a browser.

Visible browser sessions are a debugging/runtime capability, not a third task mode.

# UI Walkthrough

- **Dashboard** — view metrics, search and sort Tasks, explore featured Templates, and create Tasks from scratch or a Template.
- **Templates** — browse the embedded community catalog, search and filter ready-made workflows, preview their details and expected output, and import them into your workspace.
- **Task Editor** — build Agent or Scrape Tasks, configure actions and extraction, test blocks, manage variables, choose a Cabinet, schedule runs, add resizable canvas notes, and trigger executions.
- **Executions** — browse queued, running, and completed runs; inspect outcomes, complete results, screenshots, and recordings; and cancel queued executions.
- **Cabinets** — manage durable file queues used by Task downloads and Upload blocks, including files, ZIPs, folders, and upload status.
- **Settings** — manage API Keys, User Agent, Proxies, Appearance, and Advanced settings, including retention, account controls, and resource information.

# Task Capabilities

- Tasks support actions including navigation, click, type, wait, press, scroll, JavaScript, hover, screenshots, conditions, loops, variables, uploads, and error handling.
- Variable templating (`{$var}`) and structured conditions make Tasks reusable with runtime inputs.
- Extraction can return structured data from browser or scrape executions.
- See `AGENT_SPEC.md` for the Task schema and action contract.

# Proxies

Proxies can be defined via the UI or `data/proxies.json`:

```json
[
  "http://user:pass@proxy1.example.com:8000",
  { "server": "socks5://proxy2.example.com:1080", "label": "data center" }
]
```

- `host` is always available and represents your machine’s default IP.
- Rotation settings (`round-robin` or `random`) live in Settings and persist through the backend endpoints.
- Import/export operations live behind `/api/settings/proxies/import`.

# API Surface

Figranium exposes a REST API for workflow tools, applications, and custom integrations. All endpoints are hosted on your Figranium instance, typically on port `11345`.

**Authentication:**
If enabled, provide the `x-api-key` header or `Authorization: Bearer <key>`. For internal network use, this may be optional depending on your settings.

### Task Management API
* **`GET /api/tasks`**: List all saved Tasks.
* **`POST /api/tasks`**: Create a new Task.
* **`PUT /api/tasks/:id`**: Update an existing Task.
* **`POST /api/tasks/:id/api`**: Execute a predefined Task. Pass `{"variables": {}}` in the body to override execution variables dynamically.

### Scheduling API
* **`GET /api/schedules`**: List all scheduled Tasks and their status.
* **`POST /api/schedules/:taskId`**: Create or update a schedule (supports visual config or raw cron).
* **`DELETE /api/schedules/:taskId`**: Disable/remove a schedule.
* **`GET /api/schedules/status/all`**: Get an overview of all active scheduled jobs.

### Execution API
* **`GET /api/executions`**: Retrieve paginated history of past runs.
* **`GET /api/executions/:id`**: View the steps, result data, and configuration state of a specific run.

### Templates API
* **`GET /api/templates`**: Browse the community Templates catalog with search, category, sort, and pagination.
* **`GET /api/templates/:id`**: Retrieve an individual Template for preview or import. These endpoints require an authenticated workspace session.

### Cabinets API
* **`GET /api/cabinets`**: List Cabinets.
* Cabinet routes under **`/api/cabinets`** manage file queues, items, downloads, upload state, ZIP creation, and extraction.

# Task Scripting Tips

- Use JavaScript blocks when you need custom browser-side logic:
  ```js
  return document.querySelectorAll('article').length;
  ```
- Keep selectors narrow and use the selector picker to generate deterministic candidates.
- Set Task variables through the API to reuse generic workflows across multiple inputs or domains.

## Workflow Recipe

1. Design a Task in the editor and add the actions required for the workflow.
2. Use conditions, loops, variables, and JavaScript where deterministic control flow needs them.
3. Add extraction or screenshot actions when you need structured output or visual evidence.
4. Configure proxy rotation when the workflow needs a different egress strategy.
5. Use the **Schedule** tab for automated runs, or trigger the Task through its API endpoint.
6. Pass runtime variables such as `{"variables":{"query":"books"}}` when calling the Task from another tool.

# Task Scheduling

Figranium includes a built-in scheduler that handles automated Task execution without requiring external cron jobs or triggers.

- **Visual Mode**: Configure periodic, hourly, daily, weekly, or monthly runs.
- **Advanced Mode**: Use standard 5-field cron expressions (`* * * * *`) for complex schedules.
- **Persistence**: Schedules are stored with Task metadata and persist across server restarts.
- **Monitoring**: Next-run and previous-run information is available from the Task scheduling interface and execution history.

# Testing & Validation

- Run `npm run build` before packaging for production; the `dist/` folder contains the compiled assets.
- Backend logging writes to the console for debugging proxies, authentication, or browser failures.
- Use the repository's test and qualification scripts when changing execution-critical behavior.

# Troubleshooting

- **“Session expired”** in the UI: confirm `SESSION_SECRET` is consistent and cookies aren’t blocked by your browser.
- **Proxy import fails**: inspect `data/proxies.json` for valid URLs; the backend validates proxy configuration before use.
- **API key lost**: open Settings → API Keys to view or regenerate API credentials.

# Data Lifecycle

- Screenshots and recordings are accessible through **Executions**, not a separate Captures page.
- Large execution results are persisted separately from bounded history previews and retrieved on demand; retention cleanup also removes their stored payloads.
- Browser downloads are stored in Cabinets. Tasks can select a Cabinet, and Upload blocks can consume queued Cabinet items.
- Browser state can persist between executions; enable a Task's stateless execution option when a run should start without persisted cookies or local storage.
- Proxy lists, user-agent preferences, and other server settings persist under `data/`; back up that directory when those settings matter to your deployment.

# Maintenance

- The project is governed by the **<a href="https://github.com/figranium/figranium/blob/main/LICENSE" target="_blank">GNU General Public License v3.0</a>**, which grants rights for distribution and modification as per the GPLv3 terms.
- Keep `data/` backed up if you rely on persistent settings or browser state.
- Release updates: Docker installations should run `docker compose pull` followed by `docker compose up -d`; source installations should pull `figranium/figranium` and follow the project setup commands.
- Contributions: follow `.github/` templates, respect `CONTRIBUTING.md`, and run available lint/test scripts if you touch critical areas.

# Roadmap

- [x] **Settings shortcuts** — dedicated API Keys, User Agent, Proxies, and Appearance sections let operators tune core settings without leaving the UI.
- [x] **Unified execution history** — review results, screenshots, and recordings through Executions rather than a duplicate Captures page.
- [x] **IP rotation tooling** — import proxies and automatically rotate them.
- [x] **API key workflow** — manage API access without extra setup.
- [ ] **<a href="https://github.com/figranium/figranium/issues/405" target="_blank">Scoped API keys</a>** — support multiple individually revocable API keys with explicit permissions.
- [ ] **<a href="https://github.com/figranium/figranium/issues/406" target="_blank">Password manager & credential injector</a>** — securely store credentials and inject them into browser Tasks at runtime.
- [x] **Task proxy rotation toggle** — enable rotation per Task execution.
- [x] **Spatial editor transition** — spatial block-based Task editor.
- [ ] **<a href="https://github.com/figranium/figranium/issues/366" target="_blank">Action key combos</a>** — add modifier shortcuts for browser interactions.
- [ ] **<a href="https://github.com/figranium/figranium/issues/367" target="_blank">Click-and-drag block</a>** — add drag gesture automation.
- [x] **Recording controls** — disable automated recording per Task.
- [x] **File downloads** — download files from target pages and surface them through Cabinets.
- [x] **Cabinet-backed file workspace** — route downloads into shared Cabinets and consume them from Upload blocks.
- [x] **Stateless mode** — start Task runs without persisted cookies or local storage.
- [ ] **<a href="https://github.com/figranium/figranium/issues/368" target="_blank">Adblocking filters</a>** — optional ad/malware filtering for execution contexts.
- [x] **Extraction response mode** — choose between HTML+data and data-only API responses.
- [ ] **<a href="https://github.com/figranium/figranium/issues/369" target="_blank">Folder organization</a>** — organize Tasks and assets into named folders.
- [x] **Configurable capture and execution retention** — set retention in Advanced Settings, with automatic cleanup.
- [ ] **<a href="https://github.com/figranium/figranium/issues/370" target="_blank">Capture pinning and archiving</a>** — further organization beyond configurable retention.
- [ ] **<a href="https://github.com/figranium/figranium/issues/371" target="_blank">Workspace templates</a>** — reusable workspace presets.
- [ ] **<a href="https://github.com/figranium/figranium/issues/372" target="_blank">Geo-targeted exits</a>** — choose proxy regions for Tasks.
- [x] **Complete anti-detection coverage** — anti-detection controls across browser executions.
- [ ] **<a href="https://github.com/figranium/figranium/issues/373" target="_blank">Session recording redaction</a>** — redact sensitive fields from recordings and logs.
- [ ] **<a href="https://github.com/figranium/figranium/issues/374" target="_blank">Two-factor authentication</a>** — optional TOTP/second-factor support.
- [ ] **<a href="https://github.com/figranium/figranium/issues/375" target="_blank">Automatic self-healing selectors</a>** — recover broken locators after page changes.
- [x] **<a href="https://github.com/figranium/figranium/issues/365" target="_blank">Multilingual task pages with translate.js</a>** — optionally translate browser-rendered pages before actions and extraction.
- [ ] **<a href="https://github.com/figranium/figranium/issues/376" target="_blank">AI-assisted fixing</a>** — suggest fixes after failed runs for user approval.
- [ ] **<a href="https://github.com/figranium/figranium/issues/377" target="_blank">Companion app</a>** — lightweight notifications for important execution events.
- [x] **Community presets hub** — publish and discover reusable automation presets.
- [x] **<a href="https://github.com/figranium/figranium/issues/428" target="_blank">Embedded Templates for instant usage</a>** — browse, preview, and import ready-made Templates directly in the Figranium UI.
- [ ] **<a href="https://github.com/figranium/figranium/issues/378" target="_blank">Database Tab / Local CRM</a>** — built-in interface for extracted data.
- [ ] **<a href="https://github.com/figranium/figranium/issues/379" target="_blank">iframe interaction support</a>** — target and interact with elements inside iframes.
- [x] **Autosave** — automatically persist Task changes and editor state.
- [x] **Highlight tool** — highlight elements while building workflows.
- [x] **Cron triggers** — schedule Tasks with cron expressions.
- [x] **Resizable canvas notes** — add and resize annotations alongside workflows.
- [ ] **<a href="https://github.com/figranium/figranium/issues/380" target="_blank">Page triggers</a>** — trigger a Task when a page changes in a specified way.
- [x] **<a href="https://github.com/figranium/figranium/issues/382" target="_blank">Task-dedicated browser state & cookie buckets</a>** — isolate or intentionally share persistent browser state between Tasks.

# Security Considerations

- Never commit your `SESSION_SECRET` or API keys into shared repositories.
- Use `ALLOWED_IPS`/`data/allowed_ips.json` to gate the UI when deploying to a network-exposed host.
- Rotate API keys periodically via Settings, and use Executions to review automation runs.
- Keep dependencies and the deployment environment up to date.

# Community

- Report issues or request features via the GitHub repo issue tracker.
- Follow the authors on `https://github.com/figranium` for releases.
- Share automation recipes with other self-hosted users in your org, but respect the license for sharing infrastructure.
- Join the community on <a href="https://discord.gg/kPmfbgu9Xn" target="_blank">Discord</a>.

# Support the Project

If you find this project helpful, please consider supporting its development. Your contributions help keep the project maintained and the lights on!

<div align="center">
  <a href="https://ko-fi.com/figranium" target="_blank">
    <img src="https://img.shields.io/badge/Support%20on-Ko--fi-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white" alt="Support on Ko-fi" />
  </a>
</div>

**Other ways to help:**
* **Star** the repository to help others find it.
* **Share** the project with your network.
* **Contribute** to the code or documentation.
