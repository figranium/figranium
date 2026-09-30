const { resourceMonitor } = require('./resource-monitor');

let initialized = false;
let lastProbeAt = null;
let lastTransitionAt = null;
let lastError = null;
let retryTimer = null;
let retryAttempt = 0;

async function reconcile(reason = 'manual') {
    const { captchaModelManager, getResourceSnapshot } = require('fiptcha');
    lastProbeAt = Date.now();
    try {
        // Preserve GPU/companion discovery while replacing fiptcha's root-only
        // cgroup reading with the process-aware monitor snapshot.
        captchaModelManager.resourceProvider = async () => {
            const details = await getResourceSnapshot({ skipCompanion: false });
            const memory = resourceMonitor.probe();
            return { ...details, memory: { totalMb: memory.totalMb, availableMb: memory.availableMb, cgroupLimitMb: memory.cgroupLimitMb, swapQualified: false } };
        };
        const before = captchaModelManager.status().activeTier;
        await captchaModelManager.reconcile();
        if (before !== captchaModelManager.status().activeTier) lastTransitionAt = Date.now();
        lastError = null;
        retryAttempt = 0;
        return captchaModelManager.status();
    } catch (error) {
        lastError = error.message;
        const delay = Math.min(5 * 60 * 1000, 1000 * (2 ** Math.min(retryAttempt++, 8)));
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(() => reconcile('retry').catch(() => {}), delay);
        retryTimer.unref?.();
        console.warn(`[CAPTCHA_MODEL] ${reason} reconciliation failed:`, error.message);
        return captchaModelManager.status();
    }
}

async function startCaptchaResourceMonitoring() {
    if (initialized) return;
    initialized = true;
    resourceMonitor.start();
    const { captchaModelManager, getResourceSnapshot } = require('fiptcha');
    captchaModelManager.resourceProvider = async () => {
        const details = await getResourceSnapshot({ skipCompanion: false });
        const memory = resourceMonitor.probe();
        return { ...details, memory: { totalMb: memory.totalMb, availableMb: memory.availableMb, cgroupLimitMb: memory.cgroupLimitMb, swapQualified: false } };
    };
    // Host resizing requires a reboot, so choose the model once during boot.
    // fiptcha's normal start routine installs a periodic reconciler; clear it
    // after the initial probe to avoid needless device polling.
    await captchaModelManager.start();
    if (captchaModelManager.timer) clearInterval(captchaModelManager.timer);
    captchaModelManager.timer = null;
    lastProbeAt = Date.now();
    lastTransitionAt = lastProbeAt;
}

function stopCaptchaResourceMonitoring() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    initialized = false;
}

function getCaptchaResourceStatus() {
    let status = { healthy: false, activeTier: null, backend: null, device: null, error: null };
    try { status = require('fiptcha').captchaModelManager.status(); } catch { }
    return { ...status, resources: resourceMonitor.status(), lastProbeAt, lastTransitionAt, error: lastError || status.error };
}

module.exports = { reconcileCaptchaResources: reconcile, startCaptchaResourceMonitoring, stopCaptchaResourceMonitoring, getCaptchaResourceStatus };
