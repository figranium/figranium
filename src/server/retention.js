const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./constants');
const { loadSystemSettings, pruneExecutionsBefore } = require('./storage');
const { sendExecutionListUpdate } = require('./state');

const CAPTURE_DIRS = [
    path.join(__dirname, '../../public/captures'),
    path.join(__dirname, '../../src/public/captures'),
    path.join(DATA_DIR, 'recordings')
];
let timer = null;
let lastStatus = { lastRunAt: null, deletedCaptures: 0, deletedExecutions: 0, error: null };

async function removeExpiredFiles(cutoff) {
    const seen = new Set();
    let deleted = 0;
    for (const dir of CAPTURE_DIRS) {
        let entries;
        try { entries = await fs.promises.readdir(dir); } catch { continue; }
        for (const name of entries) {
            const target = path.join(dir, name);
            try {
                const stat = await fs.promises.stat(target);
                if (!stat.isFile() || stat.mtimeMs >= cutoff) continue;
                // Same host directory can be mounted at two paths; avoid counting twice.
                const key = `${stat.dev}:${stat.ino}`;
                const alreadyCounted = seen.has(key);
                seen.add(key);
                await fs.promises.unlink(target);
                if (!alreadyCounted) deleted++;
            } catch { /* individual capture failures must not halt cleanup */ }
        }
    }
    return deleted;
}

async function runRetentionCleanup() {
    const settings = await loadSystemSettings();
    if (settings.retentionDays === null) {
        lastStatus = { lastRunAt: Date.now(), deletedCaptures: 0, deletedExecutions: 0, error: null };
        return lastStatus;
    }
    try {
        const cutoff = Date.now() - settings.retentionDays * 24 * 60 * 60 * 1000;
        const [deletedCaptures, executions] = await Promise.all([removeExpiredFiles(cutoff), pruneExecutionsBefore(cutoff)]);
        if (executions.deleted) sendExecutionListUpdate({ type: 'prune', ids: executions.ids });
        lastStatus = { lastRunAt: Date.now(), deletedCaptures, deletedExecutions: executions.deleted, error: null };
    } catch (error) {
        lastStatus = { lastRunAt: Date.now(), deletedCaptures: 0, deletedExecutions: 0, error: error.message };
        console.error('[RETENTION] Cleanup failed:', error.message);
    }
    return lastStatus;
}

function startRetentionCleanup() {
    if (timer) return;
    runRetentionCleanup().catch(() => {});
    timer = setInterval(() => runRetentionCleanup().catch(() => {}), 60 * 60 * 1000);
    timer.unref?.();
}
function stopRetentionCleanup() { if (timer) clearInterval(timer); timer = null; }
function getRetentionStatus() { return lastStatus; }
module.exports = { runRetentionCleanup, startRetentionCleanup, stopRetentionCleanup, getRetentionStatus };
