const fs = require('fs');
const path = require('path');

const SHARED_BROWSER_STATE_PATH = path.join(__dirname, 'data', 'headful-storage-state.json');
let pendingWrite = Promise.resolve();

function normalizeBrowserState(state) {
    const now = Date.now() / 1000;
    return {
        cookies: (Array.isArray(state?.cookies) ? state.cookies : [])
            .filter(cookie => !cookie.expires || cookie.expires === -1 || cookie.expires > now),
        origins: Array.isArray(state?.origins) ? state.origins : []
    };
}

async function loadSharedBrowserState() {
    try {
        return normalizeBrowserState(JSON.parse(await fs.promises.readFile(SHARED_BROWSER_STATE_PATH, 'utf8')));
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.warn('[BROWSER STATE] Failed to load shared browser state:', error.message);
        }
        return null;
    }
}

async function saveSharedBrowserState(context, options = {}) {
    if (!context) return;

    let state;
    try {
        state = normalizeBrowserState(await context.storageState({ indexedDB: true }));
    } catch (error) {
        console.error('[BROWSER STATE] Failed to capture shared browser state:', error.message);
        return;
    }

    const write = async () => {
        if (options.preserveOrigins) {
            const existingState = await loadSharedBrowserState();
            state.origins = existingState?.origins || [];
        }
        await fs.promises.mkdir(path.dirname(SHARED_BROWSER_STATE_PATH), { recursive: true });
        const temporaryPath = `${SHARED_BROWSER_STATE_PATH}.${process.pid}.${Date.now()}.tmp`;
        try {
            await fs.promises.writeFile(temporaryPath, JSON.stringify(state, null, 2));
            await fs.promises.rename(temporaryPath, SHARED_BROWSER_STATE_PATH);
        } finally {
            await fs.promises.unlink(temporaryPath).catch(() => {});
        }
    };

    pendingWrite = pendingWrite.then(write, write);
    try {
        await pendingWrite;
    } catch (error) {
        console.error('[BROWSER STATE] Failed to save shared browser state:', error.message);
    }
}

module.exports = {
    SHARED_BROWSER_STATE_PATH,
    loadSharedBrowserState,
    saveSharedBrowserState
};
