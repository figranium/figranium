const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { TELEMETRY_STATE_FILE } = require('./constants');

const SCHEMA_VERSION = 1;
const DEFAULT_ENDPOINT = 'https://telemetry.figranium.dev/v1/ingest';
const REQUEST_TIMEOUT_MS = 3000;
const RETENTION_DAYS = 35;
let syncTimer = null;
let syncing = false;

const isEnabled = () => String(process.env.FIGRANIUM_TELEMETRY_ENABLED || 'true').toLowerCase() !== 'false';
const utcDate = () => new Date().toISOString().slice(0, 10);

function readState() {
    try {
        const parsed = JSON.parse(fs.readFileSync(TELEMETRY_STATE_FILE, 'utf8'));
        if (parsed && typeof parsed === 'object' && typeof parsed.installationId === 'string' && parsed.activity && typeof parsed.activity === 'object') {
            return parsed;
        }
    } catch (_) { /* First run or unreadable optional telemetry state. */ }
    return { installationId: crypto.randomUUID(), activity: {} };
}

function writeState(state) {
    try {
        fs.mkdirSync(path.dirname(TELEMETRY_STATE_FILE), { recursive: true });
        const temporary = `${TELEMETRY_STATE_FILE}.${process.pid}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
        fs.renameSync(temporary, TELEMETRY_STATE_FILE);
    } catch (_) {
        // Telemetry is optional; a read-only data directory must never affect Figranium.
    }
}

function bucket(value, thresholds, labels) {
    for (let index = 0; index < thresholds.length; index += 1) {
        if (value <= thresholds[index]) return labels[index];
    }
    return labels[labels.length - 1];
}

function browserVersion() {
    try {
        const playwright = require('playwright');
        const executable = playwright.chromium.executablePath();
        const output = execFileSync(executable, ['--version'], { encoding: 'utf8', timeout: 500, windowsHide: true });
        const match = output.match(/(\d+\.\d+(?:\.\d+){0,2})/);
        return match ? match[1] : null;
    } catch (_) {
        return null;
    }
}

function environment() {
    const memoryGiB = os.totalmem() / (1024 ** 3);
    const cpuCount = Math.max(1, os.cpus()?.length || 1);
    return {
        deployment_type: process.env.DOCKER_CONTAINER || fs.existsSync('/.dockerenv') ? 'docker' : 'bare_metal',
        platform: process.platform,
        architecture: process.arch,
        node_version: process.versions.node,
        browser_version: browserVersion(),
        cpu_bucket: bucket(cpuCount, [1, 2, 4, 8], ['1', '2', '3-4', '5-8', '9+']),
        memory_bucket: bucket(memoryGiB, [1, 2, 4, 8], ['<=1GiB', '1-2GiB', '2-4GiB', '4-8GiB', '8GiB+'])
    };
}

function version() {
    try { return require('../../package.json').version; } catch (_) { return '0.0.0'; }
}

function prune(state) {
    const oldest = new Date();
    oldest.setUTCDate(oldest.getUTCDate() - RETENTION_DAYS);
    const oldestDate = oldest.toISOString().slice(0, 10);
    for (const date of Object.keys(state.activity)) {
        if (date < oldestDate) delete state.activity[date];
    }
}

async function synchronize() {
    if (!isEnabled() || syncing) return;
    syncing = true;
    try {
        const state = readState();
        prune(state);
        const pending = Object.entries(state.activity)
            .filter(([, activity]) => activity.ui_used !== activity.synced_ui_used || activity.api_used !== activity.synced_api_used)
            .sort(([a], [b]) => a.localeCompare(b));

        for (const [date, activity] of pending) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
            try {
                const response = await fetch(DEFAULT_ENDPOINT, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                        schema_version: SCHEMA_VERSION,
                        installation_id: state.installationId,
                        date,
                        version: version(),
                        environment: environment(),
                        activity: { ui_used: activity.ui_used === true, api_used: activity.api_used === true }
                    }),
                    signal: controller.signal
                });
                if (!response.ok) break;
                activity.synced_ui_used = activity.ui_used === true;
                activity.synced_api_used = activity.api_used === true;
                writeState(state);
            } catch (_) {
                break;
            } finally {
                clearTimeout(timeout);
            }
        }
        writeState(state);
    } catch (_) {
        // Never surface telemetry errors to application code or logs.
    } finally {
        syncing = false;
    }
}

function recordActivity(source) {
    if (!isEnabled() || (source !== 'ui' && source !== 'api')) return;
    try {
        const state = readState();
        prune(state);
        const date = utcDate();
        state.activity[date] ||= { ui_used: false, api_used: false, synced_ui_used: false, synced_api_used: false };
        state.activity[date][`${source}_used`] = true;
        writeState(state);
        if (!syncTimer) {
            syncTimer = setTimeout(() => {
                syncTimer = null;
                void synchronize();
            }, 1000);
            syncTimer.unref?.();
        }
    } catch (_) { /* Optional telemetry is deliberately best effort. */ }
}

module.exports = { recordActivity, synchronize, isEnabled, environment };
