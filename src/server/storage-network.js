const fs = require('fs');
const path = require('path');
const { ALLOWED_IPS_FILE, ALLOWED_IPS_TTL_MS, STORAGE_STATE_PATH } = require('./constants');
const { parseIpList, normalizeIp } = require('./utils');

module.exports = function createNetworkStorage() {
// Allowed IPs Storage
let allowedIpsCache = { env: null, file: null, mtimeMs: 0, set: null, lastCheck: 0 };

const loadAllowedIps = async () => {
    const envRaw = String(process.env.ALLOWED_IPS || '').trim();
    const now = Date.now();

    if (allowedIpsCache.set && (now - allowedIpsCache.lastCheck < ALLOWED_IPS_TTL_MS)) {
        return allowedIpsCache.set;
    }

    let filePath = null;
    let fileMtime = 0;
    let fileEntries = [];

    try {
        const stat = await fs.promises.stat(ALLOWED_IPS_FILE);
        filePath = ALLOWED_IPS_FILE;
        fileMtime = stat.mtimeMs || 0;
    } catch {
        filePath = null;
    }

    if (
        allowedIpsCache.set &&
        allowedIpsCache.env === envRaw &&
        allowedIpsCache.file === filePath &&
        allowedIpsCache.mtimeMs === fileMtime
    ) {
        allowedIpsCache.lastCheck = now;
        return allowedIpsCache.set;
    }

    if (filePath) {
        try {
            const raw = await fs.promises.readFile(filePath, 'utf8');
            const parsed = JSON.parse(raw);
            fileEntries = Array.isArray(parsed)
                ? parsed
                : Array.isArray(parsed.allowedIps)
                    ? parsed.allowedIps
                    : [];
        } catch {
            fileEntries = [];
        }
    }

    const combined = [
        ...parseIpList(envRaw),
        ...parseIpList(fileEntries)
    ]
        .map(normalizeIp)
        .filter(Boolean);

    const set = new Set(combined);
    allowedIpsCache = { env: envRaw, file: filePath, mtimeMs: fileMtime, set, lastCheck: now };
    return set;
};

// Storage State
const getStorageStateFile = () => {
    try {
        if (fs.existsSync(STORAGE_STATE_PATH)) {
            const stat = fs.statSync(STORAGE_STATE_PATH);
            if (stat.isDirectory()) {
                return path.join(STORAGE_STATE_PATH, 'storage_state.json');
            }
        }
    } catch { }
    return STORAGE_STATE_PATH;
};


return { loadAllowedIps, getStorageStateFile };
};
