# This Dockerfile supports multi-arch builds (linux/amd64, linux/arm64)
# relying on multi-arch base images from Node and Playwright.
FROM node:26-bookworm AS build

WORKDIR /app

# Install deps (include dev deps for build)
COPY package*.json ./
COPY scripts ./scripts
ENV FIGRANIUM_SKIP_PLAYWRIGHT_INSTALL=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --include=dev --legacy-peer-deps

# Build frontend
COPY . .
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.64.1-noble AS runtime

LABEL org.opencontainers.image.title="Figranium" \
      org.opencontainers.image.description="Figranium is an open-source visual browser automation platform for building and running website automation tasks as APIs." \
      org.opencontainers.image.source="https://github.com/figranium/figranium" \
      org.opencontainers.image.url="https://figranium.dev" \
      org.opencontainers.image.licenses="GPL-3.0-only"

WORKDIR /app

# Install VNC + noVNC tooling for containerized headful viewer (optional for CI)
ARG INSTALL_VNC=1
ENV DEBIAN_FRONTEND=noninteractive
RUN if [ "$INSTALL_VNC" = "1" ]; then \
    apt-get -o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 update \
    && apt-get install -y --no-install-recommends \
    novnc \
    websockify \
    x11vnc \
    xvfb \
    curl \
    openssl \
    ca-certificates \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-freefont-ttf \
    dbus-x11 \
    && rm -rf /var/lib/apt/lists/*; \
    fi

# Install production deps only
COPY package*.json ./
COPY scripts ./scripts
ENV FIGRANIUM_SKIP_PLAYWRIGHT_INSTALL=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --omit=dev --legacy-peer-deps \
    && npx playwright install --with-deps chromium firefox webkit

# Install Python Folate runtime and pre-download the local ONNX model.
# Frowse lives in its own venv so its dependencies cannot clash with Debian-managed packages.
RUN apt-get -o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 update \
    && apt-get install -y --no-install-recommends python3-pip python3-venv \
    && python3 -m pip install --break-system-packages --no-cache-dir 'folate>=0.1.1' \
    && python3 -c 'from huggingface_hub import snapshot_download; snapshot_download("figranium/folate", local_dir="/opt/folate-model")' \
    && python3 -m venv /opt/frowse-venv \
    && /opt/frowse-venv/bin/pip install --no-cache-dir 'frowse>=0.1.2' \
    && PLAYWRIGHT_BROWSERS_PATH=/opt/frowse-browsers PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0 /opt/frowse-venv/bin/python -m playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

# Copy server and built assets
COPY --from=build /app/dist /app/dist
COPY --from=build /app/public /app/public
COPY --from=build /app/*.js /app/
COPY --from=build /app/src /app/src
COPY --from=build /app/start-vnc.sh /app/start-vnc.sh
COPY --from=build /app/entrypoint.sh /app/entrypoint.sh
RUN sed -i 's/\r$//' /app/start-vnc.sh /app/entrypoint.sh \
    && chmod +x /app/start-vnc.sh /app/entrypoint.sh

EXPOSE 11345
ENV NODE_ENV=production \
    FOLATE_MODEL_DIR=/opt/folate-model \
    FROWSE_PYTHON=/opt/frowse-venv/bin/python \
    FROWSE_BROWSERS_PATH=/opt/frowse-browsers

CMD ["/app/entrypoint.sh"]
