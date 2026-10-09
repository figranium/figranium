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
  <img src="https://raw.githubusercontent.com/figranium/figranium/main/screenshot.png" alt="Figranium Demo" width="100%">
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

