const INSPECT_SYNC_TIMEOUT_MS = 1000;

module.exports = function createHeadfulControlHandlers({ getActiveSession, withTimeout, severePerformanceStyleId }) {
    const activeSession = () => getActiveSession();
async function applyViewerPerformanceProfile(profile) {
    const session = activeSession();
    if (!session?.page || session.page.isClosed()) return false;
    const severe = profile === 'severe';
    try {
        await session.page.evaluate(({ id, severeMode }) => {
            document.getElementById(id)?.remove();
            if (!severeMode) return;
            const style = document.createElement('style');
            style.id = id;
            style.textContent = `
                *, *::before, *::after {
                    animation-duration: 0.001ms !important;
                    animation-iteration-count: 1 !important;
                    transition-duration: 0.001ms !important;
                    scroll-behavior: auto !important;
                }
            `;
            (document.head || document.documentElement).appendChild(style);
            document.querySelectorAll('video, audio').forEach((media) => {
                try { media.pause(); } catch { /* ignore */ }
            });
        }, { id: severePerformanceStyleId, severeMode: severe });
        return true;
    } catch {
        return false;
    }
}

async function setHeadfulViewerProfile(req, res) {
    const session = activeSession();
    if (!session) return res.status(409).json({ error: 'NO_ACTIVE_HEADFUL_SESSION' });
    const requested = String(req.body?.profile || '').toLowerCase();
    const profile = ['full', 'constrained', 'severe'].includes(requested) ? requested : 'full';
    const changed = session.viewerProfile !== profile;
    session.viewerProfile = profile;
    const applied = await applyViewerPerformanceProfile(profile);
    console.info(`[HEADFUL] Viewer profile ${profile}${changed ? ' selected' : ' reaffirmed'}.`);
    return res.json({ profile, applied });
}

async function toggleInspectMode(req, res) {
    const session = activeSession();
    if (!session || !session.context) {
        return res.status(400).json({ error: 'No active headful session.' });
    }
    const enabled = req.body.enabled === true || req.body.enabled === 'true';
    const scopeSelector = typeof req.body.scopeSelector === 'string' && req.body.scopeSelector.trim()
        ? req.body.scopeSelector.trim()
        : null;
    session.inspectModeEnabled = enabled;
    session.inspectScopeSelector = scopeSelector;
    session.inspectRevision = (Number(session.inspectRevision) || 0) + 1;

    let applied = false;
    const page = session.page;

    if (page && !page.isClosed()) {
        try {
            applied = await withTimeout(page.evaluate(async () => {
                if (!window.__figraniumGetInspectState || !window.__figraniumApplyInspectState) return false;
                const latestState = await window.__figraniumGetInspectState();
                return window.__figraniumApplyInspectState(latestState);
            }), INSPECT_SYNC_TIMEOUT_MS, 'Inspect overlay synchronization timed out');
        } catch (error) {
            console.warn('[HEADFUL] Inspect state accepted but overlay synchronization was deferred:', error && error.message ? error.message : error);
        }
    }

    res.json({
        message: `Inspect mode ${enabled ? 'enabled' : 'disabled'}`,
        enabled,
        revision: session.inspectRevision,
        applied: !!applied
    });
}


    return { setHeadfulViewerProfile, toggleInspectMode };
};
